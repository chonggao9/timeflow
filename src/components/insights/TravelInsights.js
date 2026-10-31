import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeContext';
import { useI18n } from '../../i18n/LanguageContext';
import {
  computeTravelTrendBars,
  computeMonthHeatmap,
  computeWeekTravelStats,
  groupTrips,
  formatShortDuration,
  queryJourney,
  buildDurationHistogram,
  findLatestTripForRoute,
} from '../../utils/analytics';
import { formatDuration, formatTime, isPlaceholderName, placeKey } from '../../utils/stats';
import CalendarHeatmap from './CalendarHeatmap';
import ChartDrilldownList from './ChartDrilldownList';
import ModeIcon from '../ModeIcon';
import { radius, shadow } from '../../theme';

export default function TravelInsights({
  travelRecords = [],
  paths = [],
  range = 'week',
  onOpenAllHistory,
  onStartRenameRecord,
  onSelectTripDetail,
}) {
  const { colors, isDark } = useTheme();
  const { t, lang, formatDate } = useI18n();

  const [selectedBarIdx, setSelectedBarIdx] = useState(null);
  const [selectedDay, setSelectedDay] = useState(null);
  const [selectedRouteIdx, setSelectedRouteIdx] = useState(0);

  // 所有行程
  const allTrips = useMemo(() => groupTrips(travelRecords || []), [travelRecords]);

  // 最近 3 条行程
  const recent3Trips = useMemo(() => {
    return allTrips.slice(0, 3);
  }, [allTrips]);

  // 未命名地点列表
  const unnamedRecords = useMemo(() => {
    return (travelRecords || []).filter(r => isPlaceholderName(r.locationName));
  }, [travelRecords]);

  // 已发现路线
  const discoveredRoutes = useMemo(() => {
    return (paths || []).filter(p => p.fromKey !== p.toKey);
  }, [paths]);

  // 交通方式统计（从最近记录中归纳）
  const modeStats = useMemo(() => {
    const counts = {};
    let total = 0;
    (travelRecords || []).forEach(r => {
      const m = r.mode || 'walk';
      counts[m] = (counts[m] || 0) + 1;
      total++;
    });
    return Object.entries(counts)
      .map(([mode, count]) => ({
        mode,
        count,
        percent: total > 0 ? Math.round((count / total) * 100) : 0,
      }))
      .sort((a, b) => b.count - a.count);
  }, [travelRecords]);

  // 总指标计算
  const travelMetrics = useMemo(() => {
    let totalDurSec = 0;
    allTrips.forEach(tr => {
      if (tr.durationMs > 0) {
        totalDurSec += Math.round(tr.durationMs / 1000);
      }
    });

    // 最常走路线
    const topRoute = discoveredRoutes[0];
    let topRouteStr = '—';
    if (topRoute) {
      topRouteStr = `${topRoute.fromName} → ${topRoute.toName}`;
    }

    return {
      tripCount: allTrips.length,
      totalDurSec,
      topRouteStr,
      topRouteCount: topRoute ? topRoute.count : 0,
      topRouteAvgMin: topRoute ? Math.round(topRoute.avgDurationSec / 60) : 0,
    };
  }, [allTrips, discoveredRoutes]);

  // 趋势图数据
  const trendBars = useMemo(() => {
    if (range === 'month') return [];
    return computeTravelTrendBars(travelRecords, range, Date.now());
  }, [travelRecords, range]);

  // 月度日历热力图数据
  const monthHeatmapData = useMemo(() => {
    if (range !== 'month') return null;
    return computeMonthHeatmap(travelRecords, Date.now(), 'travel');
  }, [travelRecords, range]);

  // 选中的路线信息
  const activeRoute = discoveredRoutes[selectedRouteIdx] || discoveredRoutes[0];
  const journeyStats = useMemo(() => {
    if (!activeRoute) return null;
    return queryJourney(travelRecords, activeRoute.fromKey, activeRoute.toKey);
  }, [travelRecords, activeRoute]);

  // 下钻记录
  const drilldownData = useMemo(() => {
    if (range === 'month' && selectedDay) {
      return {
        title: t('insights.dayRecords', { date: selectedDay.dateStr }),
        items: selectedDay.records || [],
      };
    }
    if (range !== 'month' && selectedBarIdx !== null && trendBars[selectedBarIdx]) {
      const b = trendBars[selectedBarIdx];
      return {
        title: `${b.fullLabel || b.label} · ${b.count} ${t('insights.recordsCount', { n: b.count })}`,
        items: b.records || [],
      };
    }
    return null;
  }, [range, selectedDay, selectedBarIdx, trendBars, t]);

  const hasData = travelRecords.length > 0;

  return (
    <View style={styles.container}>
      {/* 未命名地点置顶提醒 */}
      {unnamedRecords.length > 0 && (
        <TouchableOpacity
          style={[styles.unnamedBanner, { backgroundColor: colors.warnBg, borderColor: colors.warn }]}
          onPress={() => onStartRenameRecord && onStartRenameRecord(unnamedRecords[0])}
          activeOpacity={0.7}
        >
          <View style={styles.unnamedLeft}>
            <Ionicons name="location-outline" size={18} color={colors.warn} />
            <Text style={[styles.unnamedText, { color: colors.warn }]}>
              {t('insights.unnamedBannerTitle', { n: unnamedRecords.length })}
            </Text>
          </View>
          <View style={[styles.unnamedBtn, { backgroundColor: colors.warn }]}>
            <Text style={styles.unnamedBtnText}>{t('insights.goName')}</Text>
          </View>
        </TouchableOpacity>
      )}

      {/* 3 核心指标卡 */}
      <View style={styles.overviewGrid}>
        {/* 总行程 */}
        <View style={[styles.overviewCard, { backgroundColor: colors.surface, borderColor: colors.line }]}>
          <Text style={[styles.overviewNum, { color: colors.ink }]}>{travelMetrics.tripCount}</Text>
          <Text style={[styles.overviewLabel, { color: colors.ink2 }]}>
            {t('insights.travelTotalTrips')}
          </Text>
          <Text style={[styles.overviewSubLabel, { color: colors.ink3 }]}>
            {t('insights.totalRecords')}: {travelRecords.length}
          </Text>
        </View>

        {/* 在途总时长 */}
        <View style={[styles.overviewCard, { backgroundColor: colors.surface, borderColor: colors.line }]}>
          <Text style={[styles.overviewNum, { color: colors.ink }]}>
            {formatShortDuration(travelMetrics.totalDurSec)}
          </Text>
          <Text style={[styles.overviewLabel, { color: colors.ink2 }]}>
            {t('insights.travelTotalDuration')}
          </Text>
          <Text style={[styles.overviewSubLabel, { color: colors.ink3 }]}>
            {travelMetrics.tripCount > 0
              ? `${Math.round(travelMetrics.totalDurSec / travelMetrics.tripCount / 60)}m/趟`
              : '—'}
          </Text>
        </View>

        {/* 最常走路线 */}
        <View style={[styles.overviewCard, { backgroundColor: colors.surface, borderColor: colors.line }]}>
          <Text style={[styles.overviewNumSmall, { color: colors.ink }]} numberOfLines={1}>
            {travelMetrics.topRouteStr}
          </Text>
          <Text style={[styles.overviewLabel, { color: colors.ink2 }]}>
            {t('insights.routeInsights')}
          </Text>
          <Text style={[styles.overviewSubLabel, { color: colors.ink3 }]}>
            {travelMetrics.topRouteCount > 0
              ? `${travelMetrics.topRouteCount}次 · 均${travelMetrics.topRouteAvgMin}m`
              : '—'}
          </Text>
        </View>
      </View>

      {!hasData ? (
        <View style={[styles.emptyCard, { backgroundColor: colors.surface, borderColor: colors.line }]}>
          <Ionicons name="map-outline" size={44} color={colors.ink3} />
          <Text style={[styles.emptyTitle, { color: colors.ink }]}>
            {t('insights.empty.title')}
          </Text>
          <Text style={[styles.emptyDesc, { color: colors.ink3 }]}>
            {t('insights.empty.hint')}
          </Text>
        </View>
      ) : (
        <>
          {/* ② 趋势图表区 */}
          {range === 'month' ? (
            // 月视图：7列 × 5~6行 日历热力图
            <View>
              <View style={styles.chartHeader}>
                <Text style={[styles.sectionTitle, { color: colors.ink }]}>
                  {t('insights.calendarHeatmapTravel')}
                </Text>
                <Text style={[styles.chartSub, { color: colors.ink3 }]}>
                  {t('insights.recordsCount', { n: travelRecords.length })}
                </Text>
              </View>
              <CalendarHeatmap
                data={monthHeatmapData}
                selectedDateStr={selectedDay ? selectedDay.dateStr : null}
                onSelectDay={(day) => {
                  setSelectedDay(prev => (prev && prev.dateStr === day.dateStr ? null : day));
                }}
                type="travel"
              />
            </View>
          ) : (
            // 本周 / 全部 柱状图
            <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.line }]}>
              <View style={styles.cardHeader}>
                <Text style={[styles.sectionTitle, { color: colors.ink }]}>
                  {t('insights.weeklyTrendTitle')}
                </Text>
                <Text style={[styles.chartSub, { color: colors.ink3 }]}>
                  {t('insights.totalRecords')}
                </Text>
              </View>

              <View style={styles.trendChartWrap}>
                {trendBars.map((bar, idx) => {
                  const maxCount = Math.max(...trendBars.map(b => b.count), 5);
                  const heightPercent = bar.count > 0 ? Math.max(15, (bar.count / maxCount) * 100) : 0;
                  const isSelected = selectedBarIdx === idx;

                  return (
                    <TouchableOpacity
                      key={idx}
                      style={styles.trendCol}
                      onPress={() => {
                        setSelectedBarIdx(prev => (prev === idx ? null : idx));
                      }}
                      activeOpacity={0.7}
                    >
                      {bar.count > 0 && (
                        <Text style={[styles.trendBarVal, { color: bar.isToday ? colors.primary : colors.ink3 }]}>
                          {bar.count}
                        </Text>
                      )}

                      <View style={[styles.trendBarTrack, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)' }]}>
                        {bar.count > 0 ? (
                          <View
                            style={[
                              styles.trendBarFill,
                              { height: `${heightPercent}%` },
                              bar.isToday
                                ? { backgroundColor: colors.primary }
                                : isSelected
                                ? { backgroundColor: colors.primaryStrong }
                                : { backgroundColor: isDark ? 'rgba(52, 199, 89, 0.45)' : 'rgba(52, 199, 89, 0.50)' },
                            ]}
                          />
                        ) : (
                          <View style={[styles.trendDot, bar.isToday && { backgroundColor: colors.primary }]} />
                        )}
                      </View>

                      <Text
                        style={[
                          styles.trendXLabel,
                          { color: bar.isToday ? colors.primary : isSelected ? colors.ink : colors.ink3 },
                          (bar.isToday || isSelected) && { fontWeight: '700' },
                        ]}
                        numberOfLines={1}
                      >
                        {bar.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}

          {/* 下钻明细展开 */}
          {drilldownData && (
            <ChartDrilldownList
              title={drilldownData.title}
              items={drilldownData.items}
              type="travel"
              onClose={() => {
                setSelectedBarIdx(null);
                setSelectedDay(null);
              }}
              onPressItem={(item) => {
                if (onSelectTripDetail) {
                  onSelectTripDetail(item);
                }
              }}
            />
          )}

          {/* ③ 高频路线与规律分析 */}
          {activeRoute && journeyStats && (
            <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.line }]}>
              <View style={styles.cardHeader}>
                <View style={styles.routeHeaderLeft}>
                  <Text style={[styles.sectionTitle, { color: colors.ink }]}>
                    {activeRoute.fromName} → {activeRoute.toName}
                  </Text>
                  <Text style={[styles.routeBadge, { color: colors.primary, backgroundColor: isDark ? 'rgba(52, 199, 89, 0.15)' : 'rgba(52, 199, 89, 0.10)' }]}>
                    {t('insights.discoveredRouteBadge')}
                  </Text>
                </View>
                {discoveredRoutes.length > 1 && (
                  <TouchableOpacity
                    onPress={() => setSelectedRouteIdx((selectedRouteIdx + 1) % discoveredRoutes.length)}
                    style={styles.switchRouteBtn}
                  >
                    <Ionicons name="swap-horizontal" size={16} color={colors.primary} />
                  </TouchableOpacity>
                )}
              </View>

              <View style={styles.routeMetaGrid}>
                <View style={styles.routeMetaCol}>
                  <Text style={[styles.routeMetaVal, { color: colors.ink }]}>
                    {journeyStats.direct?.median
                      ? `${Math.round(journeyStats.direct.median / 60)}m`
                      : '—'}
                  </Text>
                  <Text style={[styles.routeMetaKey, { color: colors.ink3 }]}>
                    {t('insights.typicalDuration')}
                  </Text>
                </View>
                <View style={styles.routeMetaCol}>
                  <Text style={[styles.routeMetaVal, { color: colors.ink }]}>
                    {journeyStats.direct?.spread
                      ? `±${Math.round(journeyStats.direct.spread / 60)}m`
                      : '—'}
                  </Text>
                  <Text style={[styles.routeMetaKey, { color: colors.ink3 }]}>
                    {t('insights.fluctuation')}
                  </Text>
                </View>
                <View style={styles.routeMetaCol}>
                  <Text style={[styles.routeMetaVal, { color: colors.ink }]}>
                    {journeyStats.direct?.samples || 0}
                  </Text>
                  <Text style={[styles.routeMetaKey, { color: colors.ink3 }]}>
                    {t('insights.samplesCount')}
                  </Text>
                </View>
              </View>
            </View>
          )}

          {/* ④ 交通方式占比 */}
          {modeStats.length > 0 && (
            <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.line }]}>
              <View style={styles.cardHeader}>
                <Text style={[styles.sectionTitle, { color: colors.ink }]}>
                  {t('home.editMode')}
                </Text>
              </View>

              <View style={styles.modeList}>
                {modeStats.map((item) => (
                  <View key={item.mode} style={styles.modeRow}>
                    <View style={styles.modeLeft}>
                      <ModeIcon mode={item.mode} size={16} color={colors.primary} />
                      <Text style={[styles.modeName, { color: colors.ink }]}>
                        {t('mode.' + item.mode)}
                      </Text>
                    </View>
                    <View style={[styles.modeBarTrack, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)' }]}>
                      <View
                        style={[
                          styles.modeBarFill,
                          { width: `${Math.max(item.percent, 3)}%`, backgroundColor: colors.primary },
                        ]}
                      />
                    </View>
                    <Text style={[styles.modeCount, { color: colors.ink3 }]}>
                      {item.count}次 ({item.percent}%)
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* ⑤ 决策 3：底部先预览最近 3 条出行记录 + 查看全部入口 */}
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.line }]}>
            <View style={styles.cardHeader}>
              <Text style={[styles.sectionTitle, { color: colors.ink }]}>
                {t('insights.recentTrips')}
              </Text>
              <TouchableOpacity onPress={onOpenAllHistory} style={styles.viewAllBtn}>
                <Text style={[styles.viewAllText, { color: colors.primary }]}>
                  {t('insights.viewTravelHistory')} ›
                </Text>
              </TouchableOpacity>
            </View>

            <View style={styles.recentList}>
              {recent3Trips.map((trip, idx) => {
                const from = trip.route[0] || t('common.unnamed');
                const to = trip.route[trip.route.length - 1] || t('common.unnamed');
                const title = trip.route.length > 1 ? `${from} → ${to}` : from;
                const dur = trip.durationMs > 0 ? formatDuration(Math.round(trip.durationMs / 1000), lang) : '—';

                return (
                  <TouchableOpacity
                    key={trip.tripId || `trip-${idx}`}
                    style={[
                      styles.recentItem,
                      idx < recent3Trips.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.line },
                    ]}
                    onPress={() => onSelectTripDetail && onSelectTripDetail(trip)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.recentLeft}>
                      <View style={[styles.modeIconBox, { backgroundColor: colors.chip }]}>
                        <ModeIcon mode={trip.mode || 'walk'} size={16} color={colors.primary} />
                      </View>
                      <View style={styles.recentMeta}>
                        <Text style={[styles.recentTitle, { color: colors.ink }]} numberOfLines={1}>
                          {title}
                        </Text>
                        <Text style={[styles.recentSub, { color: colors.ink3 }]}>
                          {formatTime(trip.startTs)} · {dur}
                        </Text>
                      </View>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={colors.ink3} />
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 12,
  },
  unnamedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  unnamedLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    marginRight: 8,
  },
  unnamedText: {
    fontSize: 13,
    fontWeight: '600',
  },
  unnamedBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.sm,
  },
  unnamedBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  overviewGrid: {
    flexDirection: 'row',
    gap: 10,
  },
  overviewCard: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 10,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
    gap: 4,
    ...shadow.card,
  },
  overviewNum: {
    fontSize: 18,
    fontWeight: '800',
  },
  overviewNumSmall: {
    fontSize: 14,
    fontWeight: '700',
  },
  overviewLabel: {
    fontSize: 11,
  },
  overviewSubLabel: {
    fontSize: 10,
    fontWeight: '600',
    textAlign: 'center',
  },
  card: {
    padding: 16,
    borderRadius: 20,
    borderWidth: 1,
    gap: 12,
    ...shadow.card,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  chartHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    marginTop: 4,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  chartSub: {
    fontSize: 11,
  },
  trendChartWrap: {
    flexDirection: 'row',
    height: 140,
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingTop: 16,
    paddingBottom: 4,
  },
  trendCol: {
    flex: 1,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  trendBarVal: {
    fontSize: 9,
    marginBottom: 4,
  },
  trendBarTrack: {
    width: 14,
    height: 85,
    borderRadius: 7,
    justifyContent: 'flex-end',
    alignItems: 'center',
    overflow: 'hidden',
  },
  trendBarFill: {
    width: '100%',
    borderRadius: 7,
  },
  trendDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#8E8E93',
    marginBottom: 4,
  },
  trendXLabel: {
    fontSize: 10,
    marginTop: 6,
  },
  routeHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  routeBadge: {
    fontSize: 10,
    fontWeight: '600',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  switchRouteBtn: {
    padding: 4,
  },
  routeMetaGrid: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E5E5EA20',
    paddingTop: 10,
  },
  routeMetaCol: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  routeMetaVal: {
    fontSize: 16,
    fontWeight: '700',
  },
  routeMetaKey: {
    fontSize: 11,
  },
  modeList: {
    gap: 8,
  },
  modeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  modeLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    width: 70,
    gap: 6,
  },
  modeName: {
    fontSize: 12,
  },
  modeBarTrack: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  modeBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  modeCount: {
    fontSize: 11,
    width: 70,
    textAlign: 'right',
  },
  viewAllBtn: {
    paddingVertical: 4,
  },
  viewAllText: {
    fontSize: 13,
    fontWeight: '600',
  },
  recentList: {
    gap: 2,
  },
  recentItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
  },
  recentLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    marginRight: 8,
  },
  modeIconBox: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recentMeta: {
    flex: 1,
    gap: 2,
  },
  recentTitle: {
    fontSize: 13,
    fontWeight: '600',
  },
  recentSub: {
    fontSize: 11,
  },
  emptyCard: {
    padding: 32,
    borderRadius: radius.lg,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginVertical: 12,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  emptyDesc: {
    fontSize: 12,
    textAlign: 'center',
  },
});
