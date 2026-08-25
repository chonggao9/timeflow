import React from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { formatTime, formatDuration } from '../utils/stats';
import { colors } from '../theme';
import ModeIcon from './ModeIcon';

const MODE_LABEL = { walk: '步行', bike: '骑行', drive: '驾车', transit: '公交' };

// 呼吸动效 hook（当前节点）
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

function DashedLine() {
  return (
    <View style={styles.dashContainer}>
      {[...Array(7)].map((_, i) => <View key={i} style={styles.dash} />)}
    </View>
  );
}

export default function Timeline({ records, estimate }) {
  // records: 今日已打卡记录（按时间升序）
  // estimate: { locationName, estimatedSec } 下一个预估点（可选）

  if (!records.length) {
    return (
      <View style={styles.empty}>
        <View style={styles.emptyRing}>
          <Ionicons name="location" size={32} color={colors.primary} />
        </View>
        <Text style={styles.emptyText}>今天还没有打卡</Text>
        <Text style={styles.emptyHint}>选择出行方式，点下方按钮开始记录</Text>
      </View>
    );
  }

  const totalSec = (records[records.length - 1].timestamp - records[0].timestamp) / 1000;
  const last = records[records.length - 1];

  return (
    <View>
      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle}>今日行程</Text>
        <Text style={styles.sectionRight}>已用时 {formatDuration(totalSec)}</Text>
      </View>

      <View style={styles.container}>
        {records.map((r, i) => {
          const isLast = i === records.length - 1;
          const dur = i > 0 ? (r.timestamp - records[i - 1].timestamp) / 1000 : null;
          return (
            <View key={r.id}>
              {dur != null && (
                <View style={styles.segmentRow}>
                  <View style={styles.lineCol}><SolidLine /></View>
                  <Text style={styles.segmentText}>{formatDuration(dur)}</Text>
                </View>
              )}
              <View style={styles.row}>
                <View style={styles.lineCol}><Node type={isLast ? 'current' : 'past'} /></View>
                <View style={styles.info}>
                  <Text style={[styles.time, isLast && styles.timeCurrent]}>{formatTime(r.timestamp)}</Text>
                  <Text style={[styles.name, isLast && styles.nameCurrent]} numberOfLines={1}>{r.locationName || '未知位置'}</Text>
                  {r.mode && MODE_LABEL[r.mode] && (
                    <View style={styles.modeChip}>
                      <ModeIcon mode={r.mode} size={13} color={colors.ink2} />
                      <Text style={styles.modeChipText}>{MODE_LABEL[r.mode]}</Text>
                    </View>
                  )}
                </View>
              </View>
            </View>
          );
        })}

        {estimate && (
          <View>
            <View style={styles.segmentRow}>
              <View style={styles.lineCol}><DashedLine /></View>
              <Text style={[styles.segmentText, styles.segmentHot]}>预计 {formatDuration(estimate.estimatedSec)}</Text>
            </View>
            <View style={styles.row}>
              <View style={styles.lineCol}><Node type="future" /></View>
              <View style={styles.info}>
                <Text style={styles.timeFuture}>{estimatedArrival(records, estimate.estimatedSec)}</Text>
                <Text style={styles.nameFuture} numberOfLines={1}>{estimate.locationName}</Text>
              </View>
            </View>
          </View>
        )}
      </View>
    </View>
  );
}

function estimatedArrival(records, sec) {
  if (!records.length || !sec) return '--';
  const last = records[records.length - 1].timestamp;
  return formatTime(last + sec * 1000);
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
  timeFuture: { fontSize: 13, color: colors.ink3, width: 46 },
  name: { fontSize: 15, color: colors.ink, fontWeight: '600', flex: 1 },
  nameCurrent: { color: colors.primaryStrong, fontWeight: '700' },
  nameFuture: { fontSize: 15, color: colors.ink3, fontWeight: '500', flex: 1 },
  modeChip: { flexDirection: 'row', alignItems: 'center', gap: 3, marginLeft: 6 },
  modeChipText: { fontSize: 11, color: colors.ink2 },

  segmentRow: { flexDirection: 'row', alignItems: 'center', height: 34 },
  solidLine: { width: 2, flex: 1, backgroundColor: colors.line2 },
  dashContainer: { flexDirection: 'column', alignItems: 'center', justifyContent: 'space-between', flex: 1, paddingVertical: 3 },
  dash: { width: 2, height: 3, backgroundColor: colors.ink3, marginVertical: 1 },
  segmentText: { fontSize: 12, color: colors.ink3, paddingLeft: 12 },
  segmentHot: { color: colors.primaryStrong, fontWeight: '600' },
});
