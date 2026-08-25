import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { getRecords, clearAll } from '../storage/store';
import { computePathStats } from '../utils/stats';
import { colors, radius, shadow } from '../theme';

const MODE_ICON = { walk: '🚶', bike: '🚲', drive: '🚗', transit: '🚌', unknown: '•' };

const minutes = (sec) => Math.round(sec / 60);

export default function InsightsScreen() {
  const [stats, setStats] = useState([]);
  const [totalDays, setTotalDays] = useState(0);
  const [totalCheckins, setTotalCheckins] = useState(0);

  useFocusEffect(useCallback(() => {
    (async () => {
      const all = await getRecords();
      setTotalCheckins(all.length);
      const days = new Set(all.map(r => new Date(r.timestamp).toDateString())).size;
      setTotalDays(days);
      setStats(computePathStats(all));
    })();
  }, []));

  const handleClear = () => {
    Alert.alert('清空数据', '确定要删除所有打卡记录吗？', [
      { text: '取消', style: 'cancel' },
      {
        text: '确定删除', style: 'destructive',
        onPress: async () => { await clearAll(); setStats([]); setTotalDays(0); setTotalCheckins(0); }
      },
    ]);
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      {/* 头部 */}
      <View style={styles.header}>
        <Text style={styles.title}>洞察</Text>
        <Text style={styles.subtitle}>你的路段耗时规律</Text>
      </View>

      {/* 总览 */}
      <View style={styles.overview}>
        <View style={styles.overviewCard}>
          <Text style={styles.overviewNum}>{totalCheckins}</Text>
          <Text style={styles.overviewLabel}>累计打卡</Text>
        </View>
        <View style={styles.overviewCard}>
          <Text style={styles.overviewNum}>{totalDays}</Text>
          <Text style={styles.overviewLabel}>打卡天数</Text>
        </View>
        <View style={styles.overviewCard}>
          <Text style={styles.overviewNum}>{stats.length}</Text>
          <Text style={styles.overviewLabel}>已分析路段</Text>
        </View>
      </View>

      {/* 路段洞察 */}
      <Text style={styles.sectionTitle}>路段规律</Text>
      {stats.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>数据积累中…</Text>
          <Text style={styles.emptyHint}>同一路段打卡 2 次以上后自动分析</Text>
        </View>
      ) : (
        stats.map((s, i) => (
          <View key={i} style={styles.pathCard}>
            <View style={styles.pathHead}>
              <View style={styles.pathIcon}>
                <Text style={styles.pathIconEmoji}>{MODE_ICON[s.mode] || MODE_ICON.unknown}</Text>
              </View>
              <View style={styles.pathRoute}>
                <Text style={styles.pathRouteText} numberOfLines={1}>
                  {s.fromName} <Text style={styles.arrow}>→</Text> {s.toName}
                </Text>
                <Text style={styles.pathSamples}>样本 {s.sampleCount} 次</Text>
              </View>
            </View>
            <View style={styles.pathStats}>
              <Text style={styles.pathBig}>
                {minutes(s.medianSec)}<Text style={styles.pathBigUnit}> 分钟</Text>
              </Text>
              <View style={styles.pathRangeCol}>
                <Text style={styles.pathRangeLabel}>通常耗时</Text>
                <Text style={styles.pathRange}>最快 {minutes(s.minSec)} · 最慢 {minutes(s.maxSec)} 分钟</Text>
              </View>
            </View>
          </View>
        ))
      )}

      {/* 清空按钮 */}
      {totalCheckins > 0 && (
        <TouchableOpacity style={styles.clearBtn} onPress={handleClear}>
          <Text style={styles.clearText}>清空所有数据</Text>
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, paddingBottom: 40 },

  header: { paddingHorizontal: 4, paddingTop: 6, marginBottom: 18 },
  title: { fontSize: 26, fontWeight: '800', color: colors.ink, letterSpacing: -0.5 },
  subtitle: { fontSize: 13, color: colors.ink2, marginTop: 4 },

  overview: { flexDirection: 'row', gap: 10, marginBottom: 24 },
  overviewCard: {
    flex: 1, backgroundColor: colors.surface, borderRadius: radius.md,
    paddingVertical: 16, alignItems: 'center', ...shadow.sm,
  },
  overviewNum: { fontSize: 27, fontWeight: '800', color: colors.primary, letterSpacing: -1 },
  overviewLabel: { fontSize: 11, color: colors.ink3, marginTop: 2 },

  sectionTitle: { fontSize: 13, color: colors.ink2, fontWeight: '700', letterSpacing: 0.4, marginBottom: 10, marginLeft: 4 },

  empty: { alignItems: 'center', paddingVertical: 40 },
  emptyText: { fontSize: 16, color: colors.ink3 },
  emptyHint: { fontSize: 13, color: colors.line2, marginTop: 6 },

  pathCard: {
    backgroundColor: colors.surface, borderRadius: radius.lg, padding: 16,
    marginBottom: 12, ...shadow.sm,
  },
  pathHead: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
  pathIcon: {
    width: 38, height: 38, borderRadius: 12, backgroundColor: colors.primarySofter,
    alignItems: 'center', justifyContent: 'center',
  },
  pathIconEmoji: { fontSize: 20 },
  pathRoute: { flex: 1, minWidth: 0 },
  pathRouteText: { fontSize: 15, color: colors.ink, fontWeight: '700' },
  arrow: { color: colors.primary, fontWeight: '800' },
  pathSamples: { fontSize: 12, color: colors.ink3, marginTop: 2 },

  pathStats: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  pathBig: { fontSize: 30, fontWeight: '800', color: colors.ink, letterSpacing: -1, lineHeight: 32 },
  pathBigUnit: { fontSize: 14, fontWeight: '700', color: colors.ink2, letterSpacing: 0 },
  pathRangeCol: { alignItems: 'flex-end' },
  pathRangeLabel: { fontSize: 12, color: colors.ink2, marginBottom: 2 },
  pathRange: { fontSize: 12, color: colors.ink3 },

  clearBtn: { marginTop: 26, alignItems: 'center', paddingVertical: 12 },
  clearText: { fontSize: 13, color: colors.danger, fontWeight: '600' },
});
