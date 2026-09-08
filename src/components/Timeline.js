import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Animated, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { formatTime, formatDuration, isPlaceholderName } from '../utils/stats';
import { radius, shadow } from '../theme';
import { useTheme } from '../theme/ThemeContext';
import { useI18n } from '../i18n/LanguageContext';
import ModeIcon from './ModeIcon';

const LEGACY = 'legacy';

function usePulse() {
  const anim = React.useRef(new Animated.Value(0.6)).current;
  React.useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1.8, duration: 1100, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0.6, duration: 0, useNativeDriver: true }),
      ])
    ).start();
    return () => anim.stopAnimation();
  }, [anim]);
  return anim;
}

function PulseNode({ styles }) {
  const pulse = usePulse();
  return (
    <Animated.View
      style={[
        styles.nodePulse,
        {
          transform: [{ scale: pulse }],
          opacity: pulse.interpolate({ inputRange: [0.6, 1.8], outputRange: [0.35, 0] }),
        },
      ]}
    />
  );
}

function Node({ type }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  if (type === 'current') {
    return (
      <View style={styles.nodeWrap}>
        <PulseNode styles={styles} />
        <View style={[styles.node, styles.nodeCurrent]} />
      </View>
    );
  }
  if (type === 'destination') {
    return (
      <View style={styles.nodeWrap}>
        <View style={[styles.node, styles.nodeDestination]}>
          <View style={styles.nodeDestinationCore} />
        </View>
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
    return {
      tripId,
      records: sorted,
      firstT: sorted[0].timestamp,
      lastT: sorted[sorted.length - 1].timestamp,
    };
  });
  return groups.sort((a, b) => b.firstT - a.firstT); // 最新组在前
}

// 是否有 ≥2 个有效坐标点（≥2 才能连成轨迹，否则不显示「查看地图」）
const hasCoords = (records) => (records || []).filter(r => r.lat != null && r.lng != null).length >= 2;

export default function Timeline({ records, estimate, onRename, onShowMap, onBackfill, hasActiveTrip = false }) {
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
        {onBackfill && (
          <TouchableOpacity
            style={styles.emptyBackfillBtn}
            onPress={onBackfill}
            activeOpacity={0.7}
          >
            <Ionicons name="add-circle-outline" size={15} color={colors.primary} />
            <Text style={styles.emptyBackfillText}>{t('home.backfillTitle')}</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  // 今日总时长：最早点到最晚点
  const minT = Math.min(...records.map(r => r.timestamp));
  const maxT = Math.max(...records.map(r => r.timestamp));
  const totalSec = (maxT - minT) / 1000;

  const groups = groupByTrip(records);

  // 每个行程内部：最新点在前
  const renderTrip = (g, gi) => {
    const rev = g.records.slice().reverse(); // 最新在组内前面
    const isLatestTrip = gi === 0;
    const tripDurationSec = (g.lastT - g.firstT) / 1000;

    return (
      <View key={g.tripId} style={styles.tripCard}>
        {/* 行程卡片顶部状态栏 */}
        <View style={styles.tripHeader}>
          <View style={styles.tripBadgeWrap}>
            <View style={styles.tripDotIndicator} />
            <Text style={styles.tripLabel}>
              {g.tripId === LEGACY ? t('timeline.legacy') : `${t('timeline.trip')} ${groups.length - gi}`}
            </Text>
            {tripDurationSec > 60 && (
              <Text style={styles.tripDurationBadge}>
                {formatDuration(tripDurationSec, lang)}
              </Text>
            )}
          </View>
          {onShowMap && hasCoords(g.records) ? (
            <TouchableOpacity
              style={styles.mapBtn}
              onPress={() => onShowMap(g)}
              activeOpacity={0.7}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            >
              <Ionicons name="map-outline" size={13} color={colors.primaryStrong} />
              <Text style={styles.mapBtnText}>{t('timeline.mapBtn')}</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        {/* 轨道内打卡点序列 */}
        <View style={styles.tripTrack}>
          {rev.map((r, j) => {
            const isTripHead = j === 0;
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
                {/* 节点行 */}
                <View style={styles.row}>
                  <View style={styles.lineCol}>
                    <Node type={nodeType} />
                  </View>
                  <View style={styles.info}>
                    <Text style={[styles.time, isHot && styles.timeCurrent]}>
                      {formatTime(r.timestamp)}
                    </Text>
                    <TouchableOpacity
                      style={[styles.nameWrap, isHot && styles.nameWrapCurrent]}
                      onPress={() => onRename && onRename(r)}
                      activeOpacity={0.7}
                    >
                      <Text
                        style={[
                          styles.name,
                          isHot && styles.nameCurrent,
                          isPlaceholderName(r.locationName) && styles.namePlaceholder,
                        ]}
                        numberOfLines={1}
                      >
                        {isPlaceholderName(r.locationName) ? t('common.unnamed') : r.locationName}
                      </Text>
                      <View style={styles.editBadge}>
                        <Ionicons name="pencil" size={10} color={isHot ? colors.primaryStrong : colors.ink3} />
                      </View>
                    </TouchableOpacity>
                  </View>
                </View>

                {/* 预测到达节点（仅当前活跃点展示） */}
                {isHot && estimate && (
                  <React.Fragment>
                    <View style={styles.segmentRow}>
                      <View style={styles.lineCol}><DashedLine /></View>
                      <View style={styles.segmentInfo}>
                        <View style={styles.estimatePill}>
                          <Ionicons name="sparkles" size={12} color={colors.primaryStrong} />
                          <Text style={styles.estimateText}>
                            {t('timeline.estimate', { d: formatDuration(estimate.estimatedSec, lang) })}
                          </Text>
                        </View>
                      </View>
                    </View>
                    <View style={styles.row}>
                      <View style={styles.lineCol}><Node type="future" /></View>
                      <View style={styles.info}>
                        <Text style={[styles.time, styles.timeFuture]}>
                          {formatTime(r.timestamp + estimate.estimatedSec * 1000)}
                        </Text>
                        <View style={styles.futureNameWrap}>
                          <Text style={styles.nameFuture} numberOfLines={1}>
                            {estimate.locationName}
                          </Text>
                        </View>
                      </View>
                    </View>
                  </React.Fragment>
                )}

                {/* 路段位移与耗时胶囊 */}
                {durBelow != null && (
                  <View style={styles.segmentRow}>
                    <View style={styles.lineCol}><SolidLine /></View>
                    <View style={styles.segmentInfo}>
                      <View style={styles.segmentCard}>
                        {r.mode && (
                          <View style={styles.segmentModeWrap}>
                            <ModeIcon mode={r.mode} size={13} color={colors.primaryStrong} />
                            {MODE_LABEL[r.mode] && (
                              <Text style={styles.segmentModeText}>{MODE_LABEL[r.mode]}</Text>
                            )}
                          </View>
                        )}
                        <Text style={styles.segmentDurationNumber}>
                          {formatDuration(durBelow, lang)}
                        </Text>
                      </View>
                    </View>
                  </View>
                )}
              </View>
            );
          })}
        </View>
      </View>
    );
  };

  return (
    <View>
      <View style={styles.sectionHead}>
        <View style={styles.sectionTitleRow}>
          <Ionicons name="git-commit-outline" size={16} color={colors.primary} />
          <Text style={styles.sectionTitle}>{t('timeline.title')}</Text>
        </View>
        <View style={styles.sectionRightRow}>
          <Text style={styles.sectionRight}>
            {t('timeline.elapsed', { d: formatDuration(totalSec, lang) })}
          </Text>
          {onBackfill && (
            <TouchableOpacity
              style={styles.backfillBtn}
              onPress={onBackfill}
              activeOpacity={0.7}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            >
              <Ionicons name="add-circle-outline" size={13} color={colors.primaryStrong} />
              <Text style={styles.backfillBtnText}>{t('home.backfill')}</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
      <View style={styles.container}>{groups.map(renderTrip)}</View>
    </View>
  );
}

const makeStyles = (colors) => StyleSheet.create({
  container: { paddingTop: 2 },
  empty: {
    alignItems: 'center',
    paddingVertical: 56,
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    marginHorizontal: 4,
    borderWidth: 1,
    borderColor: colors.line,
    ...shadow.sm,
  },
  emptyRing: {
    width: 68,
    height: 68,
    borderRadius: 34,
    marginBottom: 16,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: { fontSize: 16, color: colors.ink, fontWeight: '700', marginBottom: 6 },
  emptyHint: { fontSize: 13, color: colors.ink3 },
  emptyBackfillBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 18,
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 12,
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.line,
  },
  emptyBackfillText: {
    fontSize: 13,
    color: colors.primaryStrong,
    fontWeight: '700',
  },

  sectionHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
    marginTop: 8,
    paddingHorizontal: 6,
  },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  sectionTitle: { fontSize: 14, color: colors.ink, fontWeight: '700', letterSpacing: 0.2 },
  sectionRightRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionRight: { fontSize: 12, color: colors.ink2, fontWeight: '500' },
  backfillBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.line,
  },
  backfillBtnText: {
    fontSize: 11,
    color: colors.primaryStrong,
    fontWeight: '700',
  },

  tripCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    paddingVertical: 14,
    paddingHorizontal: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: colors.line,
    ...shadow.card,
  },
  tripHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  tripBadgeWrap: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  tripDotIndicator: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.primary,
  },
  tripLabel: {
    fontSize: 13,
    color: colors.primaryStrong,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  tripDurationBadge: {
    fontSize: 11,
    color: colors.ink3,
    backgroundColor: colors.chip,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 6,
    fontWeight: '500',
  },
  mapBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: colors.primarySoft,
    paddingHorizontal: 9,
    paddingVertical: 3.5,
    borderRadius: 999,
  },
  mapBtnText: {
    fontSize: 11,
    color: colors.primaryStrong,
    fontWeight: '700',
  },

  tripTrack: { paddingTop: 2 },
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 46 },
  lineCol: { width: 32, alignItems: 'center', justifyContent: 'center' },
  nodeWrap: { width: 18, height: 18, alignItems: 'center', justifyContent: 'center' },
  node: { width: 12, height: 12, borderRadius: 6 },
  nodePast: { backgroundColor: colors.past, borderWidth: 1.5, borderColor: colors.surface },
  nodeCurrent: {
    backgroundColor: colors.primary,
    ...shadow.sm,
  },
  nodeDestination: {
    width: 14,
    height: 14,
    borderRadius: 5,
    backgroundColor: colors.primaryStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nodeDestinationCore: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#FFFFFF',
  },
  nodeFuture: {
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: colors.ink3,
  },
  nodePulse: {
    position: 'absolute',
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.primary,
  },

  info: { flex: 1, flexDirection: 'row', alignItems: 'center', paddingLeft: 10, minWidth: 0 },
  time: { fontSize: 13, color: colors.ink2, width: 48, fontVariant: ['tabular-nums'], fontWeight: '500' },
  timeCurrent: { color: colors.primaryStrong, fontWeight: '800', fontSize: 14 },

  nameWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minWidth: 0,
    backgroundColor: colors.chip,
    paddingVertical: 7,
    paddingHorizontal: 11,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
  },
  nameWrapCurrent: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary + '40',
  },
  name: { fontSize: 13.5, color: colors.ink, fontWeight: '700', flex: 1 },
  nameCurrent: { color: colors.primaryStrong, fontWeight: '800', fontSize: 14.5 },
  namePlaceholder: { color: colors.ink3, fontStyle: 'italic' },
  editBadge: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 6,
    borderWidth: 0.5,
    borderColor: colors.line,
    ...shadow.sm,
  },

  futureNameWrap: {
    flex: 1,
    backgroundColor: colors.chip,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.line2,
  },
  nameFuture: { color: colors.ink3, fontWeight: '500', fontSize: 13 },
  timeFuture: { color: colors.ink3, fontSize: 13 },

  segmentRow: { flexDirection: 'row', alignItems: 'center', height: 42 },
  solidLine: { width: 2, flex: 1, backgroundColor: colors.line2 },
  dashedLine: { width: 2, flex: 1, borderLeftWidth: 2, borderStyle: 'dashed', borderLeftColor: colors.ink3 },
  segmentInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 10,
  },
  segmentCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.chip,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.line,
  },
  segmentModeWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  segmentModeText: { fontSize: 11, color: colors.ink2, fontWeight: '600' },
  segmentDurationNumber: {
    fontSize: 12,
    color: colors.ink,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  estimatePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.primarySoft,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.primary + '30',
  },
  estimateText: {
    fontSize: 11,
    color: colors.primaryStrong,
    fontWeight: '600',
  },
});
