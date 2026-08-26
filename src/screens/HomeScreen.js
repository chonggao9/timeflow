import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, Alert, Modal, TextInput, TouchableOpacity, Linking,
} from 'react-native';
import * as Location from 'expo-location';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  saveRecord, getRecords, getTodayRecords, updateRecord, ensureTrip, endTrip,
  getCurrentTripId, getLastMode, setLastMode,
} from '../storage/store';
import { computePathStats, placeKey, UNNAMED, formatTime, formatDuration, isPlaceholderName } from '../utils/stats';
import { colors, radius, shadow } from '../theme';
import { useI18n } from '../i18n/LanguageContext';
import { AMAP_KEY } from '../config';
import Timeline from '../components/Timeline';
import CheckInButton from '../components/CheckInButton';
import TransportPicker from '../components/TransportPicker';

// 快速定位：服务开关 → 缓存(限5分钟) → 实时低精度(超时)。都失败返回 null
async function getPositionFast() {
  try {
    const on = await Location.hasServicesEnabledAsync();
    if (!on) return null;
  } catch (e) { /* 继续 */ }

  try {
    const cached = await Location.getLastKnownPositionAsync({ maxAge: 2 * 60 * 1000 });
    if (cached) return cached;
  } catch (e) { /* 继续 */ }

  try {
    const loc = await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 8000)),
    ]);
    return loc || null;
  } catch (e) {
    return null;
  }
}

// 高德逆地理编码（坐标 → 附近地名），优先用于国内；失败返回 null
async function amapReverseGeocode(lat, lng, timeout = 4000) {
  if (!AMAP_KEY || AMAP_KEY === 'YOUR_AMAP_KEY') return null;
  try {
    const url = `https://restapi.amap.com/v3/geocode/regeo?key=${AMAP_KEY}&location=${lng},${lat}&extensions=base&radius=1000`;
    const res = await Promise.race([
      fetch(url),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), timeout)),
    ]);
    const data = await res.json();
    if (data.status === '1' && data.regeocode) {
      const r = data.regeocode;
      const c = r.addressComponent || {};
      // 1) 商业区/著名地点（如「王府井」）—— 最像附近地名
      const biz = (c.businessAreas || []).find(b => b && b.name)?.name;
      if (biz) return biz;
      // 2) 区 + 街道
      const street = c.streetNumber?.street;
      if (c.district && street) return `${c.district}${street}`;
      // 3) 区 + 乡镇/街道
      if (c.district && (c.township || c.roadName)) return `${c.district}${c.township || c.roadName}`;
      // 4) 完整地址兜底
      if (r.formatted_address) return r.formatted_address;
      const part = [c.district, c.roadName, c.neighbourhood].filter(Boolean);
      if (part.length) return part.join('');
    }
    return null;
  } catch (e) {
    return null;
  }
}

// 反查地名：高德优先，失败回退系统反查；都失败返回 null
async function reverseGeocodeWithTimeout(lat, lng) {
  const amap = await amapReverseGeocode(lat, lng);
  if (amap) return amap;
  try {
    const [addr] = await Promise.race([
      Location.reverseGeocodeAsync({ latitude: lat, longitude: lng }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 4000)),
    ]);
    if (addr) return [addr.street, addr.district, addr.city].filter(Boolean).join(' ') || addr.name || null;
  } catch (e) { /* 忽略 */ }
  return null;
}

const makeId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { t, lang, formatDate } = useI18n();
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [mode, setMode] = useState('walk');
  const [estimate, setEstimate] = useState(null);
  const [hasActiveTrip, setHasActiveTrip] = useState(false);

  const [renameTarget, setRenameTarget] = useState(null);
  const [draftName, setDraftName] = useState('');

  const loadToday = useCallback(async () => {
    const today = await getTodayRecords();
    const sorted = today.sort((a, b) => a.timestamp - b.timestamp);
    setRecords(sorted);
    const trip = await getCurrentTripId();
    setHasActiveTrip(!!trip);
  }, []);

  // 初始化：记住上次出行方式
  useEffect(() => {
    (async () => setMode(await getLastMode()))();
  }, []);

  useFocusEffect(useCallback(() => { loadToday(); }, [loadToday]));

  // 计算预估：从最后一个点出发的最常见路段（按坐标格点匹配）
  useEffect(() => {
    if (records.length < 1) { setEstimate(null); return; }
    (async () => {
      const all = await getRecords();
      const stats = computePathStats(all);
      if (!stats.length) { setEstimate(null); return; }
      const last = records[records.length - 1];
      const key = placeKey(last);
      const match = stats.find(s => s.fromKey === key);
      if (match) {
        setEstimate({ locationName: match.toName, estimatedSec: match.medianSec });
      } else {
        setEstimate(null);
      }
    })();
  }, [records]);

  // 一键打卡：加入当前行程。立即落库（秒完成），坐标 + 地名后台异步补。
  const handleCheckIn = async () => {
    setLoading(true);
    const tnow = Date.now();
    try {
      const tripId = await ensureTrip();
      const id = makeId();
      await saveRecord({ id, timestamp: tnow, locationName: UNNAMED, lat: null, lng: null, mode, tripId });
      await setLastMode(mode);

      setLoading(false);
      setSuccess(true);
      await loadToday();
      setTimeout(() => setSuccess(false), 1200);

      fillLocation(id); // 后台定位 + 反查，不阻塞打卡
    } catch (e) {
      setLoading(false);
      Alert.alert(t('home.failTitle'), t('home.failBody'));
    }
  };

  // 后台补坐标 + 地名
  const fillLocation = async (id) => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      const loc = await getPositionFast();
      if (!loc) { showLocFailed(); return; }
      const lat = loc.coords.latitude, lng = loc.coords.longitude;
      const addr = await reverseGeocodeWithTimeout(lat, lng);
      const patch = { lat, lng };
      if (addr) patch.locationName = addr;
      await updateRecord(id, patch);
      await loadToday();
    } catch (e) { /* 忽略 */ }
  };

  // 定位失败：引导去系统设置开启定位
  const showLocFailed = () => {
    Alert.alert(t('home.locAlertTitle'), t('home.locAlertBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('home.openSettings'), onPress: () => Linking.openSettings() },
    ]);
  };

  // 结束当前行程
  const handleEndTrip = async () => {
    await endTrip();
    await loadToday();
    Alert.alert(t('trip.endedTitle'), t('trip.ended'));
  };

  // ---- 地名编辑 ----
  const openRename = (record) => {
    setRenameTarget(record);
    setDraftName(record.locationName && record.locationName !== UNNAMED ? record.locationName : '');
  };
  const closeRename = () => { setRenameTarget(null); setDraftName(''); };
  const confirmRename = async () => {
    if (!renameTarget) return;
    const name = draftName.trim();
    if (!name) { Alert.alert(t('home.renameEmpty')); return; }
    await updateRecord(renameTarget.id, { locationName: name });
    closeRename();
    await loadToday();
  };

  const dateStr = formatDate(new Date());
  const lastRecord = records[records.length - 1];

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <View style={styles.titleBlock}>
          <Text style={styles.title}>{t('home.today')}</Text>
          <Text style={styles.date}>{dateStr}</Text>
        </View>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{t('home.checkins', { n: records.length })}</Text>
        </View>
      </View>

      {/* 主卡片：当前位置 → 预估下一站 */}
      <View style={styles.cardWrap}>
        <View style={styles.card}>
          <View style={styles.cardRow}>
            <View style={styles.cardCol}>
              <Text style={styles.cardLabel}>{t('home.currentPlace')}</Text>
              <Text style={styles.cardName} numberOfLines={1}>
                {lastRecord
                  ? (isPlaceholderName(lastRecord.locationName) ? t('common.unnamed') : lastRecord.locationName)
                  : '--'}
              </Text>
            </View>
            {lastRecord && (
              <Text style={styles.cardTime}>{formatTime(lastRecord.timestamp)}</Text>
            )}
          </View>
          {estimate ? (
            <TouchableOpacity style={styles.cardEstimate} activeOpacity={0.7} onPress={openRename.bind(null, lastRecord)}>
              <Text style={styles.cardEstimateText}>
                {t('home.nextEstimate')} <Text style={styles.cardEstimateStrong}>{estimate.locationName}</Text> · {formatDuration(estimate.estimatedSec, lang)}
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Timeline records={records} onRename={openRename} />
      </ScrollView>

      {/* 底部操作区 */}
      <View style={styles.composer}>
        <Text style={styles.composerLabel}>{t('home.modeLabel')}</Text>
        <TransportPicker selected={mode} onSelect={setMode} />
        <View style={styles.gap} />
        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.endBtn, !hasActiveTrip && styles.endBtnDisabled]}
            onPress={handleEndTrip}
            disabled={!hasActiveTrip}
            activeOpacity={0.7}
          >
            <Text style={[styles.endBtnText, !hasActiveTrip && styles.endBtnTextDisabled]}>{t('trip.end')}</Text>
          </TouchableOpacity>
          <View style={styles.checkinWrap}>
            <CheckInButton onPress={handleCheckIn} loading={loading} success={success} />
          </View>
        </View>
      </View>

      {/* 地名编辑弹窗 */}
      <Modal visible={!!renameTarget} transparent animationType="fade" onRequestClose={closeRename}>
        <View style={styles.overlay}>
          <View style={styles.dialog}>
            <Text style={styles.dialogTitle}>{t('home.renameTitle')}</Text>
            <Text style={styles.dialogSub}>{t('home.renameSub')}</Text>
            <TextInput
              style={styles.input}
              value={draftName}
              onChangeText={setDraftName}
              placeholder={t('home.renamePlaceholder')}
              placeholderTextColor={colors.ink3}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={confirmRename}
            />
            <View style={styles.dialogRow}>
              <TouchableOpacity style={[styles.dialogBtn, styles.dialogCancel]} onPress={closeRename}>
                <Text style={styles.dialogCancelText}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.dialogBtn, styles.dialogOk]} onPress={confirmRename}>
                <Text style={styles.dialogOkText}>{t('common.save')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingBottom: 8,
  },
  titleBlock: { flex: 1 },
  title: { fontSize: 26, fontWeight: '800', color: colors.ink, letterSpacing: -0.5, lineHeight: 30 },
  date: { fontSize: 13, color: colors.ink2, marginTop: 3 },
  badge: {
    backgroundColor: colors.primarySoft, borderRadius: 999,
    paddingHorizontal: 12, paddingVertical: 7,
  },
  badgeText: { fontSize: 12, color: colors.primaryStrong, fontWeight: '700' },

  cardWrap: { paddingHorizontal: 16, marginBottom: 4 },
  card: {
    backgroundColor: colors.surface, borderRadius: radius.lg, padding: 16,
    ...shadow.sm,
  },
  cardRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardCol: { flex: 1 },
  cardLabel: { fontSize: 12, color: colors.ink3 },
  cardName: { fontSize: 20, color: colors.ink, fontWeight: '800', marginTop: 2 },
  cardTime: { fontSize: 13, color: colors.ink2, fontVariant: ['tabular-nums'] },
  cardEstimate: {
    marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.line,
  },
  cardEstimateText: { fontSize: 13, color: colors.ink2 },
  cardEstimateStrong: { color: colors.primaryStrong, fontWeight: '700' },

  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingBottom: 12 },

  composer: {
    paddingHorizontal: 16, paddingTop: 12, paddingBottom: 14,
    backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.line,
  },
  composerLabel: { fontSize: 12, color: colors.ink3, marginBottom: 9, marginLeft: 2 },
  gap: { height: 12 },
  actions: { flexDirection: 'row', gap: 10 },
  checkinWrap: { flex: 1 },
  endBtn: {
    width: 92, borderRadius: 18, alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#FAF6F1', borderWidth: 1.5, borderColor: colors.line,
  },
  endBtnDisabled: { opacity: 0.4 },
  endBtnText: { fontSize: 14, color: colors.ink2, fontWeight: '700', letterSpacing: 1 },
  endBtnTextDisabled: { color: colors.ink3 },

  overlay: {
    flex: 1, backgroundColor: 'rgba(43,35,30,0.35)',
    alignItems: 'center', justifyContent: 'center', padding: 28,
  },
  dialog: { width: '100%', backgroundColor: colors.surface, borderRadius: 20, padding: 20 },
  dialogTitle: { fontSize: 18, fontWeight: '700', color: colors.ink },
  dialogSub: { fontSize: 13, color: colors.ink3, marginTop: 4 },
  input: {
    marginTop: 16, borderWidth: 1.5, borderColor: colors.line2, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, color: colors.ink,
    backgroundColor: '#FAF6F1',
  },
  dialogRow: { flexDirection: 'row', gap: 10, marginTop: 18 },
  dialogBtn: { flex: 1, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  dialogCancel: { backgroundColor: '#FAF6F1' },
  dialogCancelText: { fontSize: 15, color: colors.ink2, fontWeight: '600' },
  dialogOk: { backgroundColor: colors.primary },
  dialogOkText: { fontSize: 15, color: '#fff', fontWeight: '700' },
});
