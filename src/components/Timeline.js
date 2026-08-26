import React from 'react';
import { View, Text, StyleSheet, Animated, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { formatTime, formatDuration, isPlaceholderName } from '../utils/stats';
import { colors } from '../theme';
import { useI18n } from '../i18n/LanguageContext';
import ModeIcon from './ModeIcon';

const LEGACY = 'legacy';

function usePulse() {
  const anim = React.useRef(new Animated.Value(0.6)).current;
  React.useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1.6, duration: 900, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0.6, duration: 0, useNativeDriver: true }),
      ])
    ).start();
    return () => anim.stopAnimation();
  }, [anim]);
  return anim;
}

function Node({ type }) {
  const pulse = usePulse();
  if (type === 'current') {
    return (
      <View style={styles.nodeWrap}>
        <Animated.View
          style={[styles.nodePulse, { transform: [{ scale: pulse }], opacity: pulse.interpolate({ inputRange: [0.6, 1.6], outputRange: [0.28, 0] }) }]}
        />
        <View style={[styles.node, styles.nodeCurrent]} />
      </View>
    );
  }
  if (type === 'future') {
    return (
      <View style={styles.nodeWrap}>
        <View style={[styles.node, styles.nodeFuture]} />
      </View>
    );
  }
  return (
    <View style={styles.nodeWrap}>
      <View style={[styles.node, styles.nodePast]} />
    </View>
  );
}

function SolidLine() {
  return <View style={styles.solidLine} />;
}

// 按行程分组（升序），展示时统一倒序：最新行程/最新打卡在最上方
function groupByTrip(records) {
  const map = new Map();
  for (const r of records) {
    const key = r.tripId || LEGACY;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(r);
  }
  // 每组内按时间排序（升序），组间按最早时间排序
  const groups = [...map.entries()].map(([tripId, recs]) => {
    const sorted = [...recs].sort((a, b) => a.timestamp - b.timestamp);
    return { tripId, records: sorted, firstT: sorted[0].timestamp };
  });
  return groups.sort((a, b) => b.firstT - a.firstT); // 最新组在前
}

export default function Timeline({ records, onRename }) {
  const { t, lang } = useI18n();
  const MODE_LABEL = { walk: t('mode.walk'), bike: t('mode.bike'), drive: t('mode.drive'), transit: t('mode.transit') };

  if (!records.length) {
    return (
      <View style={styles.empty}>
        <View style={styles.emptyRing}>
          <Ionicons name="location" size={32} color={colors.primary} />
        </View>
        <Text style={styles.emptyText}>{t('timeline.empty.title')}</Text>
        <Text style={styles.emptyHint}>{t('timeline.empty.hint')}</Text>
      </View>
    );
  }

  // 今日总时长：最早点到最晚点
  const minT = Math.min(...records.map(r => r.timestamp));
  const maxT = Math.max(...records.map(r => r.timestamp));
  const totalSec = (maxT - minT) / 1000;

  const groups = groupByTrip(records);
  const showLabels = groups.length > 1;

  // 每个行程内部：最新点在前
  const renderTrip = (g, gi) => {
    const rev = g.records.slice().reverse(); // 最新在组内前面
    // 最新行程的组内第一个点 = 全局最新
    return (
      <View key={g.tripId}>
        {showLabels && <Text style={styles.tripLabel}>{g.tripId === LEGACY ? t('timeline.legacy') : `${t('timeline.trip')} ${gi + 1}`}</Text>}
        {rev.map((r, j) => {
          const isCurrent = gi === 0 && j === 0;
          const durBelow = j < rev.length - 1 ? (rev[j + 1].timestamp - r.timestamp) / 1000 : null;
          return (
            <View key={r.id}>
              <View style={styles.row}>
                <View style={styles.lineCol}><Node type={isCurrent ? 'current' : 'past'} /></View>
                <View style={styles.info}>
                  <Text style={[styles.time, isCurrent && styles.timeCurrent]}>{formatTime(r.timestamp)}</Text>
                  <TouchableOpacity style={styles.nameWrap} onPress={() => onRename && onRename(r)} activeOpacity={0.6}>
                    <Text
                      style={[styles.name, isCurrent && styles.nameCurrent, isPlaceholderName(r.locationName) && styles.namePlaceholder]}
                      numberOfLines={1}
                    >
                      {isPlaceholderName(r.locationName) ? t('common.unnamed') : r.locationName}
                    </Text>
                    <Ionicons name="pencil" size={12} color={colors.ink3} style={styles.nameEditIcon} />
                  </TouchableOpacity>
                  {r.mode && MODE_LABEL[r.mode] && (
                    <View style={styles.modeChip}>
                      <ModeIcon mode={r.mode} size={13} color={colors.ink2} />
                      <Text style={styles.modeChipText}>{MODE_LABEL[r.mode]}</Text>
                    </View>
                  )}
                </View>
              </View>
              {durBelow != null && (
                <View style={styles.segmentRow}>
                  <View style={styles.lineCol}><SolidLine /></View>
                  <Text style={styles.segmentText}>{formatDuration(durBelow, lang)}</Text>
                </View>
              )}
            </View>
          );
        })}
        {gi < groups.length - 1 && <View style={styles.tripGap} />}
      </View>
    );
  };

  return (
    <View>
      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle}>{t('timeline.title')}</Text>
        <Text style={styles.sectionRight}>{t('timeline.elapsed', { d: formatDuration(totalSec, lang) })}</Text>
      </View>
      <View style={styles.container}>{groups.map(renderTrip)}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: 4, paddingTop: 4 },
  empty: { alignItems: 'center', paddingVertical: 56 },
  emptyRing: {
    width: 74, height: 74, borderRadius: 37, marginBottom: 18,
    backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center',
  },
  emptyText: { fontSize: 16, color: colors.ink, fontWeight: '700', marginBottom: 6 },
  emptyHint: { fontSize: 13, color: colors.ink3 },

  sectionHead: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline',
    marginBottom: 8, marginTop: 12, paddingHorizontal: 4,
  },
  sectionTitle: { fontSize: 13, color: colors.ink2, fontWeight: '700', letterSpacing: 0.4 },
  sectionRight: { fontSize: 12, color: colors.ink3 },
  tripLabel: {
    fontSize: 12, color: colors.primaryStrong, fontWeight: '700',
    marginTop: 12, marginBottom: 2, letterSpacing: 0.4,
  },
  tripGap: { height: 20 },

  row: { flexDirection: 'row', alignItems: 'center', minHeight: 44 },
  lineCol: { width: 34, alignItems: 'center', justifyContent: 'center' },
  nodeWrap: { width: 16, height: 16, alignItems: 'center', justifyContent: 'center' },
  node: { width: 12, height: 12, borderRadius: 6 },
  nodePast: { backgroundColor: colors.past },
  nodeCurrent: { backgroundColor: colors.primary, shadowColor: colors.primary, shadowOpacity: 0.35, shadowRadius: 4, elevation: 2 },
  nodeFuture: { backgroundColor: colors.surface, borderWidth: 2, borderStyle: 'dashed', borderColor: colors.ink3 },
  nodePulse: { position: 'absolute', width: 24, height: 24, borderRadius: 12, backgroundColor: colors.primary },

  info: { flex: 1, flexDirection: 'row', alignItems: 'center', paddingLeft: 12, minWidth: 0 },
  time: { fontSize: 13, color: colors.ink2, width: 46, fontVariant: ['tabular-nums'] },
  timeCurrent: { color: colors.primaryStrong, fontWeight: '700' },
  name: { fontSize: 15, color: colors.ink, fontWeight: '600', flex: 1 },
  nameCurrent: { color: colors.primaryStrong, fontWeight: '700' },
  nameWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', minWidth: 0 },
  namePlaceholder: { color: colors.ink3, fontStyle: 'italic' },
  nameEditIcon: { marginLeft: 4 },
  modeChip: { flexDirection: 'row', alignItems: 'center', gap: 3, marginLeft: 6 },
  modeChipText: { fontSize: 11, color: colors.ink2 },

  segmentRow: { flexDirection: 'row', alignItems: 'center', height: 34 },
  solidLine: { width: 2, flex: 1, backgroundColor: colors.line2 },
  segmentText: { fontSize: 12, color: colors.ink3, paddingLeft: 12 },
});
