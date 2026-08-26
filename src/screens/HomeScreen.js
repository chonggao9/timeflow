import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, Alert, Modal, TextInput, TouchableOpacity,
} from 'react-native';
import * as Location from 'expo-location';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { saveRecord, getRecords, getTodayRecords, updateRecord } from '../storage/store';
import { computePathStats, placeKey, UNNAMED } from '../utils/stats';
import { colors } from '../theme';
import { useI18n } from '../i18n/LanguageContext';
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
    const cached = await Location.getLastKnownPositionAsync({ maxAge: 5 * 60 * 1000 });
    if (cached) return cached;
  } catch (e) { /* 继续 */ }

  try {
    const loc = await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000)),
    ]);
    return loc || null;
  } catch (e) {
    return null;
  }
}

// 反查地址，带超时；失败/超时返回 null
async function reverseGeocodeWithTimeout(lat, lng, timeout = 4000) {
  try {
    const [addr] = await Promise.race([
      Location.reverseGeocodeAsync({ latitude: lat, longitude: lng }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), timeout)),
    ]);
    if (!addr) return null;
    return [addr.street, addr.district, addr.city].filter(Boolean).join(' ') || addr.name || null;
  } catch (e) {
    return null;
  }
}

// 唯一 id（时间戳 + 随机段，避免同一毫秒重复）
const makeId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { t, lang, formatDate } = useI18n();
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [mode, setMode] = useState('walk');
  const [estimate, setEstimate] = useState(null);

  const [renameTarget, setRenameTarget] = useState(null);
  const [draftName, setDraftName] = useState('');

  const loadToday = useCallback(async () => {
    const today = await getTodayRecords();
    const sorted = today.sort((a, b) => a.timestamp - b.timestamp);
    setRecords(sorted);
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

  // 一键打卡：坐标必拿、地址兜底为「未命名」、定位失败也不阻塞
  const handleCheckIn = async () => {
    setLoading(true);
    const tnow = Date.now(); // 打卡事件时刻
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      let locationName = UNNAMED;
      let lat = null, lng = null;

      if (status === 'granted') {
        const loc = await getPositionFast();
        if (loc) {
          lat = loc.coords.latitude;
          lng = loc.coords.longitude;
          const addr = await reverseGeocodeWithTimeout(lat, lng);
          if (addr) locationName = addr;
        }
      }

      await saveRecord({ id: makeId(), timestamp: tnow, locationName, lat, lng, mode });

      setLoading(false);
      setSuccess(true);
      await loadToday();
      setTimeout(() => setSuccess(false), 1200);
    } catch (e) {
      setLoading(false);
      Alert.alert(t('home.failTitle'), t('home.failBody'));
    }
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

      <View style={styles.summary}>
        <View style={styles.dot} />
        <Text style={styles.summaryText}>{t('home.subtitle')}</Text>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Timeline records={records} estimate={estimate} onRename={openRename} lang={lang} />
      </ScrollView>

      <View style={styles.composer}>
        <Text style={styles.composerLabel}>{t('home.modeLabel')}</Text>
        <TransportPicker selected={mode} onSelect={setMode} />
        <View style={styles.gap} />
        <CheckInButton onPress={handleCheckIn} loading={loading} success={success} />
      </View>

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
    paddingHorizontal: 20, paddingBottom: 10,
  },
  titleBlock: { flex: 1 },
  title: { fontSize: 26, fontWeight: '800', color: colors.ink, letterSpacing: -0.5, lineHeight: 30 },
  date: { fontSize: 13, color: colors.ink2, marginTop: 3 },
  badge: {
    backgroundColor: colors.primarySoft, borderRadius: 999,
    paddingHorizontal: 12, paddingVertical: 7,
  },
  badgeText: { fontSize: 12, color: colors.primaryStrong, fontWeight: '700' },
  summary: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 20, paddingBottom: 4 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.primary },
  summaryText: { fontSize: 13, color: colors.ink3 },

  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingBottom: 12 },

  composer: {
    paddingHorizontal: 16, paddingTop: 12, paddingBottom: 14,
    backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.line,
  },
  composerLabel: { fontSize: 12, color: colors.ink3, marginBottom: 9, marginLeft: 2 },
  gap: { height: 12 },

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
