import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, ScrollView, StyleSheet, Alert, Modal, TextInput, TouchableOpacity, Linking, ActivityIndicator, Vibration,
} from 'react-native';
import * as Location from 'expo-location';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  saveRecord, getRecords, getTodayRecords, updateRecord, ensureTrip, endTrip,
  getCurrentTripId, getLastMode, setLastMode,
} from '../storage/store';
import { computePathStats, placeKey, UNNAMED } from '../utils/stats';
import { colors } from '../theme';
import { useI18n } from '../i18n/LanguageContext';
import { getAmapKey } from '../config';
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
  const key = await getAmapKey();
  if (!key) return null;
  try {
    const url = `https://restapi.amap.com/v3/geocode/regeo?key=${encodeURIComponent(key)}&location=${lng},${lat}&extensions=base&radius=1000`;
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
  const { t, formatDate } = useI18n();
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [mode, setMode] = useState('walk');
  const [estimate, setEstimate] = useState(null);
  const [hasActiveTrip, setHasActiveTrip] = useState(false);
  const [locStatus, setLocStatus] = useState(null); // null | 'pending' | 'denied' | 'failed'
  const locTargetRef = useRef(null);
  const fillSeqRef = useRef(0); // 补位序号：状态条只反映最新一次补位

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
      Vibration.vibrate(15); // 轻触感：确认打卡（秒级，紧贴点击）
      await loadToday();
      setTimeout(() => setSuccess(false), 1200);

      fillLocation(id); // 后台定位 + 反查，不阻塞打卡
    } catch (e) {
      setLoading(false);
      Vibration.vibrate([0, 40, 30, 40]); // 双震：保存失败
      Alert.alert(t('home.failTitle'), t('home.failBody'));
    }
  };

  // 后台补坐标 + 地名：状态条呈现 补位中/被拒/失败，成功则静默消失。
  // 序号守卫：连打两次时，旧补位照常落库/刷新，但只有最新一次能更新状态条。
  const fillLocation = async (id) => {
    const seq = ++fillSeqRef.current;
    locTargetRef.current = id;
    setLocStatus('pending');
    const isStale = () => seq !== fillSeqRef.current;
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') { if (!isStale()) setLocStatus('denied'); return; }
      const loc = await getPositionFast();
      if (!loc) { if (!isStale()) setLocStatus('failed'); return; }
      const lat = loc.coords.latitude, lng = loc.coords.longitude;
      const addr = await reverseGeocodeWithTimeout(lat, lng);
      const patch = { lat, lng };
      if (addr) patch.locationName = addr;
      await updateRecord(id, patch);
      await loadToday(); // 旧补位也刷新，把已解析的地名补上
      if (!isStale()) setLocStatus(null);
    } catch (e) {
      if (!isStale()) setLocStatus('failed');
    }
  };

  // 定位状态条点击：被拒 → 已授权则重试，否则去设置；失败 → 位置服务总开关没开则去设置，否则重试
  const handleLocBarPress = async () => {
    if (locStatus === 'denied') {
      const { status } = await Location.getForegroundPermissionsAsync();
      if (status === 'granted') { const id = locTargetRef.current; if (id) fillLocation(id); }
      else Linking.openSettings();
    } else if (locStatus === 'failed') {
      let servicesOn = true;
      try { servicesOn = await Location.hasServicesEnabledAsync(); } catch (e) { /* 忽略 */ }
      if (!servicesOn) Linking.openSettings();
      else { const id = locTargetRef.current; if (id) fillLocation(id); }
    }
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

      {/* 定位状态条：补位中 / 权限被拒 / 定位失败 */}
      {locStatus && (
        <TouchableOpacity
          style={[styles.locBar, locStatus === 'pending' && styles.locBarPending]}
          onPress={handleLocBarPress}
          activeOpacity={locStatus === 'pending' ? 1 : 0.7}
          disabled={locStatus === 'pending'}
        >
          {locStatus === 'pending' ? (
            <View style={styles.locBarRow}>
              <ActivityIndicator size="small" color={colors.ink3} />
              <Text style={styles.locBarTextPending}>{t('home.locPending')}</Text>
            </View>
          ) : (
            <Text style={styles.locBarText}>
              {locStatus === 'denied' ? t('home.locDenied') : t('home.locFailed')}
            </Text>
          )}
        </TouchableOpacity>
      )}

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Timeline records={records} estimate={estimate} onRename={openRename} />
      </ScrollView>

      {/* 底部操作区 */}
      <View style={styles.composer}>
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

  locBar: {
    marginHorizontal: 16, marginBottom: 6,
    paddingVertical: 9, paddingHorizontal: 14,
    borderRadius: 12, alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.primarySofter,
  },
  locBarPending: { backgroundColor: '#FAF6F1' },
  locBarRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  locBarTextPending: { fontSize: 12, color: colors.ink3 },
  locBarText: { fontSize: 12, color: colors.danger, fontWeight: '600' },

  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingBottom: 12 },

  composer: {
    paddingHorizontal: 16, paddingTop: 12, paddingBottom: 14,
    backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.line,
  },
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
