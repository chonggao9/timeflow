import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet, Alert } from 'react-native';
import * as Location from 'expo-location';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { saveRecord, getRecords, getTodayRecords } from '../storage/store';
import { computePathStats } from '../utils/stats';
import { colors } from '../theme';
import Timeline from '../components/Timeline';
import CheckInButton from '../components/CheckInButton';
import TransportPicker from '../components/TransportPicker';

// 快速定位：先上次已知位置（瞬时），再实时低精度（6 秒超时）；都不行返回 null
async function getPositionFast() {
  // 定位服务未开启，直接放弃，避免长时间等待
  try {
    const on = await Location.hasServicesEnabledAsync();
    if (!on) return null;
  } catch (e) { /* 忽略，继续尝试 */ }

  // 1) 上次已知位置，瞬时返回
  try {
    const cached = await Location.getLastKnownPositionAsync();
    if (cached) return cached;
  } catch (e) { /* 忽略 */ }

  // 2) 实时定位（低精度 + 超时，网络定位通常 1-3 秒返回）
  try {
    const loc = await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('定位超时')), 6000)),
    ]);
    if (loc) return loc;
  } catch (e) { /* 超时或失败 */ }

  return null;
}

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [mode, setMode] = useState('walk');
  const [estimate, setEstimate] = useState(null);

  const loadToday = useCallback(async () => {
    const today = await getTodayRecords();
    const sorted = today.sort((a, b) => a.timestamp - b.timestamp);
    setRecords(sorted);
  }, []);

  useFocusEffect(useCallback(() => { loadToday(); }, [loadToday]));

  // 计算预估（从最后一个点出发的最常见路段的耗时中位数）
  useEffect(() => {
    if (records.length < 1) { setEstimate(null); return; }
    (async () => {
      const all = await getRecords();
      const stats = computePathStats(all);
      if (!stats.length) { setEstimate(null); return; }
      const last = records[records.length - 1];
      const match = stats.find(s => s.fromName === last.locationName);
      if (match) {
        setEstimate({ locationName: match.toName, estimatedSec: match.medianSec });
      } else {
        setEstimate(null);
      }
    })();
  }, [records]);

  // 一键打卡：用当前选中的出行方式直接记录（定位失败也不阻塞打卡）
  const handleCheckIn = async () => {
    setLoading(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      let locationName = '未知位置';
      let lat = null, lng = null;

      if (status === 'granted') {
        const loc = await getPositionFast();
        if (loc) {
          lat = loc.coords.latitude;
          lng = loc.coords.longitude;
          try {
            const [addr] = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
            if (addr) {
              locationName = [addr.street, addr.district, addr.city]
                .filter(Boolean).join(' ') || addr.name || '未知位置';
            }
          } catch (e) {
            locationName = '未知位置';
          }
        }
      }

      await saveRecord({
        id: Date.now().toString(),
        timestamp: Date.now(),
        locationName,
        lat,
        lng,
        mode,
      });

      setLoading(false);
      setSuccess(true);
      await loadToday();
      setTimeout(() => setSuccess(false), 1200);
    } catch (e) {
      setLoading(false);
      Alert.alert('打卡失败', '无法获取位置，请检查权限设置');
    }
  };

  const now = new Date();
  const dateStr = `${now.getMonth() + 1}月${now.getDate()}日 · ${['周日','周一','周二','周三','周四','周五','周六'][now.getDay()]}`;

  return (
    <View style={styles.screen}>
      {/* 头部 */}
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <View style={styles.titleBlock}>
          <Text style={styles.title}>今天</Text>
          <Text style={styles.date}>{dateStr}</Text>
        </View>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{records.length} 次打卡</Text>
        </View>
      </View>

      <View style={styles.summary}>
        <View style={styles.dot} />
        <Text style={styles.summaryText}>记录你的一天，轻松看路段耗时</Text>
      </View>

      {/* 时间轴 */}
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Timeline records={records} estimate={estimate} />
      </ScrollView>

      {/* 底部操作区 */}
      <View style={styles.composer}>
        <Text style={styles.composerLabel}>出行方式</Text>
        <TransportPicker selected={mode} onSelect={setMode} />
        <View style={styles.gap} />
        <CheckInButton onPress={handleCheckIn} loading={loading} success={success} />
      </View>
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
});
