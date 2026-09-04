import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Animated, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { formatTime, formatDuration, isPlaceholderName } from '../utils/stats';
import { useTheme } from '../theme/ThemeContext';
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
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const pulse = usePulse();

  if (type === 'current') {
    return (
      <View style={styles.nodeWrap}>
        <Animated.View
          style={[
            styles.nodePulse,
            { transform: [{ scale: pulse }], opacity: pulse.interpolate({ inputRange: [0.6, 1.6], outputRange: [0.28, 0] }) },
          ]}
        />
        <View style={[styles.node, styles.nodeCurrent]} />
      </View>
    );
  }
  if (type === 'destination') {
    return (
      <View style={styles.nodeWrap}>
        <View style={[styles.node, styles.nodeDestination]} />
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
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return <View style={styles.solidLine} />;
}

function DashedLine() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return <View style={styles.dashedLine} />;
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

// 是否有 ≥2 个有效坐标点（≥2 才能连成轨迹，否则不显示「查看地图」）
const hasCoords = (records) => (records || []).filter(r => r.lat != null && r.lng != null).length >= 2;

export default function Timeline({ records, estimate, onRename, onShowMap, hasActiveTrip = false }) {
  const { t, lang } = useI18n();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const MODE_LABEL = {
    walk: t('mode.walk'),
    bike: t('mode.bike'),
    drive: t('mode.drive'),
    taxi: t('mode.taxi'),
    subway: t('mode.subway'),
    transit: t('mode.transit'),
    train: t('mode.train'),
    flight: t('mode.flight'),
    boat: t('mode.boat'),
  };

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
    const isLatestTrip = gi === 0;

    return (
      <View key={g.tripId}>
        {(showLabels || (onShowMap && hasCoords(g.records))) && (
          <View style={styles.tripLabelRow}>
            {showLabels ? (
              <Text style={styles.tripLabel}>{g.tripId === LEGACY ? t('timeline.legacy') : `${t('timeline.trip')} ${groups.length - gi}`}</Text>
            ) : null}
            <View style={styles.tripLabelFlex} />
            {onShowMap && hasCoords(g.records) ? (
              <TouchableOpacity onPress={() => onShowMap(g)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="map" size={15} color={colors.primaryStrong} />
              </TouchableOpacity>
            ) : null}
          </View>
        )}
        {rev.map((r, j) => {
          const isTripHead = j === 0;
          // 只有全局最新且当前行程未完结时，才为 current（带呼吸波）；若已完结则为 destination 终点态
          let nodeType = 'past';
          if (isTripHead) {
            if (isLatestTrip && hasActiveTrip) {
              nodeType = 'current';
            } else {
              nodeType = 'destination';
            }
          }

          const durBelow = j < rev.length - 1 ? (r.timestamp - rev[j + 1].timestamp) / 1000 : null;
          const isHot = nodeType === 'current';

          return (
            <View key={r.id}>
              <View style={styles.row}>
                <View style={styles.lineCol}><Node type={nodeType} /></View>
                <View style={styles.info}>
                  <Text style={[styles.time, isHot && styles.timeCurrent]}>{formatTime(r.timestamp)}</Text>
                  <TouchableOpacity style={styles.nameWrap} onPress={() => onRename && onRename(r)} activeOpacity={0.6}>
                    <Text
                      style={[styles.name, isHot && styles.nameCurrent, isPlaceholderName(r.locationName) && styles.namePlaceholder]}
                      numberOfLines={1}
                    >
                      {isPlaceholderName(r.locationName) ? t('common.unnamed') : r.locationName}
                    </Text>
                    <Ionicons name="pencil" size={12} color={colors.ink3} style={styles.nameEditIcon} />
                  </TouchableOpacity>
                </View>
              </View>

              {isHot && estimate && (
                <React.Fragment>
                  <View style={styles.segmentRow}>
                    <View style={styles.lineCol}><DashedLine /></View>
                    <View style={styles.segmentInfo}>
                      <Text style={[styles.segmentText, styles.segmentHot]}>
                        {t('timeline.estimate', { d: formatDuration(estimate.estimatedSec, lang) })}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.row}>
                    <View style={styles.lineCol}><Node type="future" /></View>
                    <View style={styles.info}>
                      <Text style={[styles.time, styles.timeFuture]}>{formatTime(r.timestamp + estimate.estimatedSec * 1000)}</Text>
                      <Text style={[styles.name, styles.nameFuture]} numberOfLines={1}>{estimate.locationName}</Text>
                    </View>
                  </View>
                </React.Fragment>
              )}

              {durBelow != null && (
                <View style={styles.segmentRow}>
                  <View style={styles.lineCol}><SolidLine /></View>
                  <View style={styles.segmentInfo}>
                    {r.mode && (
                      <View style={styles.segmentModeWrap}>
                        <ModeIcon mode={r.mode} size={12} color={colors.ink2} />
                        {MODE_LABEL[r.mode] && <Text style={styles.segmentModeText}>{MODE_LABEL[r.mode]}</Text>}
                      </View>
                    )}
                    {r.mode && <Text style={styles.segmentDot}>·</Text>}
                    <Text style={styles.segmentText}>{formatDuration(durBelow, lang)}</Text>
                  </View>
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

const makeStyles = (colors) => StyleSheet.create({
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
    letterSpacing: 0.4,
  },
  tripLabelRow: {
    flexDirection: 'row', alignItems: 'center',
    marginTop: 12, marginBottom: 2, paddingRight: 4, gap: 6,
  },
  tripLabelFlex: { flex: 1 },
  tripGap: { height: 20 },

  row: { flexDirection: 'row', alignItems: 'center', minHeight: 44 },
  lineCol: { width: 34, alignItems: 'center', justifyContent: 'center' },
  nodeWrap: { width: 16, height: 16, alignItems: 'center', justifyContent: 'center' },
  node: { width: 12, height: 12, borderRadius: 6 },
  nodePast: { backgroundColor: colors.past },
  nodeCurrent: { backgroundColor: colors.primary, shadowColor: colors.primary, shadowOpacity: 0.35, shadowRadius: 4, elevation: 2 },
  nodeDestination: { backgroundColor: colors.primaryStrong, shadowColor: colors.primaryStrong, shadowOpacity: 0.25, shadowRadius: 3, elevation: 1 },
  nodeFuture: { backgroundColor: colors.surface, borderWidth: 2, borderStyle: 'dashed', borderColor: colors.ink3 },
  nodePulse: { position: 'absolute', width: 24, height: 24, borderRadius: 12, backgroundColor: colors.primary },

  info: { flex: 1, flexDirection: 'row', alignItems: 'center', paddingLeft: 12, minWidth: 0 },
  time: { fontSize: 13, color: colors.ink2, width: 46, fontVariant: ['tabular-nums'] },
  timeCurrent: { color: colors.primaryStrong, fontWeight: '800', fontSize: 15 },
  name: { fontSize: 14, color: colors.ink2, fontWeight: '500', flex: 1 },
  nameCurrent: { color: colors.primaryStrong, fontWeight: '800', fontSize: 18 },
  nameWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', minWidth: 0 },
  namePlaceholder: { color: colors.ink3, fontStyle: 'italic' },
  nameEditIcon: { marginLeft: 6 },

  segmentRow: { flexDirection: 'row', alignItems: 'center', height: 34 },
  solidLine: { width: 2, flex: 1, backgroundColor: colors.line2 },
  dashedLine: { width: 2, flex: 1, borderLeftWidth: 2, borderStyle: 'dashed', borderLeftColor: colors.ink3 },
  segmentInfo: {
    flex: 1, flexDirection: 'row', alignItems: 'center', paddingLeft: 12, gap: 5,
  },
  segmentModeWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: colors.chip, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6,
  },
  segmentModeText: { fontSize: 11, color: colors.ink2, fontWeight: '600' },
  segmentDot: { fontSize: 12, color: colors.ink3 },
  segmentText: { fontSize: 12, color: colors.ink3, fontWeight: '500' },
  segmentHot: { color: colors.ink2, fontWeight: '500' },
  timeFuture: { color: colors.ink3 },
  nameFuture: { color: colors.ink3, fontWeight: '500' },
});
