import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeContext';
import { useI18n } from '../../i18n/LanguageContext';
import {
  computeFocusMetrics,
  computeTrendBars,
  computeMonthHeatmap,
  formatShortDuration,
} from '../../utils/analytics';
import { formatDuration } from '../../utils/stats';
import { getCategoryMeta } from '../../utils/focusCategories';
import CalendarHeatmap from './CalendarHeatmap';
import ChartDrilldownList from './ChartDrilldownList';
import { radius } from '../../theme';

const PERIOD_I18N_MAP = {
  morning: { label: 'insights.timeMorning', span: 'insights.timeMorningSpan' },
  afternoon: { label: 'insights.timeAfternoon', span: 'insights.timeAfternoonSpan' },
  evening: { label: 'insights.timeEvening', span: 'insights.timeEveningSpan' },
  lateNight: { label: 'insights.timeLateNight', span: 'insights.timeLateNightSpan' },
};

function getPeriodLabel(periodKey, t) {
  const item = PERIOD_I18N_MAP[periodKey];
  return item ? t(item.label) : '';
}

function getPeriodSpan(periodKey, t) {
  const item = PERIOD_I18N_MAP[periodKey];
  return item ? t(item.span) : '';
}

function getCatDisplayName(cat, t) {
  if (!cat) return '';
  if (cat.key === 'uncategorized' || cat.key === 'insights.uncategorized') {
    return t('insights.uncategorized');
  }
  const meta = getCategoryMeta(cat.key, t);
  if (!meta.key) {
    return cat.name;
  }
  return meta.name;
}

function getTaskDisplayName(taskName, t) {
  if (!taskName || taskName === '未命名专注' || taskName.toLowerCase() === 'unnamed focus') {
    return t('home.unnamedFocus');
  }
  return taskName;
}

export default function FocusInsights({
  focusSessions = [],
  range = 'week',
  onRenameTask,
  onOpenHistory,
}) {
  const { colors, isDark } = useTheme();
  const { t, lang, formatDate } = useI18n();

  const [expandedCats, setExpandedCats] = useState({});
  const [selectedBarIdx, setSelectedBarIdx] = useState(null);
  const [selectedDay, setSelectedDay] = useState(null);

  const metrics = useMemo(() => {
    return computeFocusMetrics(focusSessions, range, Date.now());
  }, [focusSessions, range]);

  const filteredList = metrics?.filteredRecords || [];

  const trendBars = useMemo(() => {
    if (range === 'month') return [];
    return computeTrendBars(filteredList, range, Date.now());
  }, [filteredList, range]);

  const monthHeatmapData = useMemo(() => {
    if (range !== 'month') return null;
    return computeMonthHeatmap(focusSessions, Date.now(), 'focus');
  }, [focusSessions, range]);

  const toggleCatExpand = (catKey) => {
    setExpandedCats(prev => ({ ...prev, [catKey]: !prev[catKey] }));
  };

  // 生成智能分析一句话 (由 i18n 模板驱动)
  const summaryText = useMemo(() => {
    if (filteredList.length === 0) return null;
    const peak = metrics.peakPeriod;
    const peakStr = peak && peak.sec > 0
      ? t('insights.summaryPeakSpan', {
          label: getPeriodLabel(peak.key, t),
          span: getPeriodSpan(peak.key, t),
        })
      : null;
    const topCat = metrics.categories && metrics.categories.length > 0 ? metrics.categories[0] : null;

    let s = t('insights.summaryBase', {
      count: metrics.pomodoroCount || 0,
      duration: formatShortDuration(metrics.totalSec || 0),
    });
    if (peakStr) {
      s += t('insights.summaryPeak', { peak: peakStr });
    }
    if (topCat && topCat.count > 0) {
      s += t('insights.summaryCategory', { category: getCatDisplayName(topCat, t) });
    }
    return s;
  }, [metrics, filteredList, t]);

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
        title: `${b.fullLabel || b.label} · ${b.mins} ${t('common.minutes')}`,
        items: b.records || [],
      };
    }
    return null;
  }, [range, selectedDay, selectedBarIdx, trendBars, t]);

  const hasData = filteredList.length > 0;

  return (
    <View style={styles.container}>
      {/* 智能分析一句话结论置顶 */}
      {summaryText && (
        <View style={[styles.summaryCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.summaryHead}>
            <Ionicons name="sparkles" size={16} color={colors.primary} />
            <Text style={[styles.summaryHeadText, { color: colors.primary }]}>
              {t('insights.summaryPrefix')}
            </Text>
          </View>
          <Text style={[styles.summaryBodyText, { color: colors.ink }]}>{summaryText}</Text>
        </View>
      )}

      {/* ① 3 核心指标卡 */}
      <View style={styles.overviewGrid}>
        {/* 专注时长 + 同进度公平对比 */}
        <View style={[styles.overviewCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.overviewNum, { color: colors.ink }]}>
            {formatShortDuration(metrics.totalSec)}
          </Text>
          <Text style={[styles.overviewLabel, { color: colors.ink2 }]}>
            {t('insights.focusDuration')}
          </Text>
          <Text
            style={[
              styles.overviewSubLabel,
              metrics.growthRate > 0
                ? { color: colors.primary }
                : metrics.growthRate < 0
                ? { color: colors.danger || '#FF453A' }
                : { color: colors.ink3 },
            ]}
          >
            {metrics.growthRate === null || range === 'all'
              ? t('insights.vsPrevFlat')
              : metrics.growthRate > 0
              ? t('insights.vsPrevUp', { pct: metrics.growthRate })
              : metrics.growthRate < 0
              ? t('insights.vsPrevDown', { pct: Math.abs(metrics.growthRate) })
              : t('insights.vsPrevFlat')}
          </Text>
        </View>

        {/* 番茄数（只计完整，副标含提前结束） */}
        <View style={[styles.overviewCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.overviewNum, { color: colors.ink }]}>
            {metrics.pomodoroCount}
          </Text>
          <Text style={[styles.overviewLabel, { color: colors.ink2 }]}>
            {t('insights.pomodoroCount')}
          </Text>
          <Text style={[styles.overviewSubLabel, { color: colors.ink3 }]}>
            {metrics.partialCount > 0
              ? t('insights.partialSummary', { n: metrics.partialCount })
              : t('insights.catCountUnit', { n: metrics.pomodoroCount })}
          </Text>
        </View>

        {/* 最长单次 */}
        <View style={[styles.overviewCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.overviewNum, { color: colors.ink }]}>
            {metrics.longestSec > 0 ? `${Math.round(metrics.longestSec / 60)}m` : '0m'}
          </Text>
          <Text style={[styles.overviewLabel, { color: colors.ink2 }]}>
            {t('insights.longestSession')}
          </Text>
          <Text style={[styles.overviewSubLabel, { color: colors.ink3 }]}>
            {metrics.daysCount > 0
              ? `${t('insights.dailyAvg')} ${Math.round(metrics.totalSec / metrics.daysCount / 60)}m`
              : '—'}
          </Text>
        </View>
      </View>

      {!hasData ? (
        <View style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Ionicons name="timer-outline" size={44} color={colors.ink3} />
          <Text style={[styles.emptyTitle, { color: colors.ink }]}>
            {range === 'today'
              ? t('insights.emptyToday')
              : range === 'week'
              ? t('insights.emptyWeek')
              : range === 'month'
              ? t('insights.emptyMonth')
              : t('insights.emptyAll')}
          </Text>
          <Text style={[styles.emptyDesc, { color: colors.ink3 }]}>
            {t('insights.switchRangeTip')}
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
                  {t('insights.calendarHeatmap')}
                </Text>
                <Text style={[styles.chartSub, { color: colors.ink3 }]}>
                  {t('insights.unitMinutes')}
                </Text>
              </View>
              <CalendarHeatmap
                data={monthHeatmapData}
                selectedDateStr={selectedDay ? selectedDay.dateStr : null}
                onSelectDay={(day) => {
                  setSelectedDay(prev => (prev && prev.dateStr === day.dateStr ? null : day));
                }}
                type="focus"
              />
            </View>
          ) : (
            // 今天 3 小时段 / 本周天 / 全部柱状图
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.cardHeader}>
                <Text style={[styles.sectionTitle, { color: colors.ink }]}>
                  {t('insights.trendTitle')}
                </Text>
                <Text style={[styles.chartSub, { color: colors.ink3 }]}>
                  {t('insights.unitMinutes')}
                </Text>
              </View>

              <View style={styles.trendChartWrap}>
                {trendBars.map((bar, idx) => {
                  const maxMins = Math.max(...trendBars.map(b => b.mins), 60);
                  const heightPercent = bar.mins > 0 ? Math.max(12, (bar.mins / maxMins) * 100) : 0;
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
                      {bar.mins > 0 && (
                        <Text style={[styles.trendBarVal, { color: bar.isToday ? colors.primary : colors.ink3 }]}>
                          {bar.mins}
                        </Text>
                      )}

                      <View style={[styles.trendBarTrack, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)' }]}>
                        {bar.mins > 0 ? (
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
              type="focus"
              onClose={() => {
                setSelectedBarIdx(null);
                setSelectedDay(null);
              }}
            />
          )}

          {/* ③ 分类分布 */}
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.cardHeader}>
              <Text style={[styles.sectionTitle, { color: colors.ink }]}>
                {t('insights.categoryDist')}
              </Text>
              <Text style={[styles.chartSub, { color: colors.ink3 }]}>
                {t('insights.rangeTotalPomodoros', { n: metrics.pomodoroCount })}
              </Text>
            </View>

            <View style={styles.catDistList}>
              {(metrics.categories || []).map((cat) => {
                const isExpanded = !!expandedCats[cat.key];
                return (
                  <View key={cat.key} style={styles.catDistItem}>
                    <TouchableOpacity
                      style={styles.catDistHeader}
                      onPress={() => toggleCatExpand(cat.key)}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.catDistName, { color: colors.ink }]} numberOfLines={1}>
                        {getCatDisplayName(cat, t)}
                      </Text>
                      <View style={styles.catDistRight}>
                        <Text style={[styles.catDistCount, { color: colors.ink3 }]}>
                          {t('insights.catCountUnit', { n: cat.count })}
                        </Text>
                        <Text style={[styles.catDistDur, { color: colors.ink }]}>
                          {formatShortDuration(cat.sec)}
                        </Text>
                        <Text style={[styles.catDistPct, { color: colors.ink3 }]}>
                          {cat.percent}%
                        </Text>
                        <Ionicons
                          name={isExpanded ? 'chevron-up' : 'chevron-down'}
                          size={15}
                          color={colors.ink3}
                        />
                      </View>
                    </TouchableOpacity>

                    {/* 进度条 */}
                    <View style={[styles.catProgressBarTrack, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)' }]}>
                      <View
                        style={[
                          styles.catProgressBarFill,
                          { width: `${Math.max(cat.percent, 3)}%`, backgroundColor: cat.color || colors.primary },
                        ]}
                      />
                    </View>

                    {/* 展开的 Top 5 任务 */}
                    {isExpanded && cat.topTasks && cat.topTasks.length > 0 && (
                      <View style={[styles.catTasksBox, { backgroundColor: colors.canvas }]}>
                        <Text style={[styles.catTasksTitle, { color: colors.ink3 }]}>
                          {t('insights.topTasks')}
                        </Text>
                        {cat.topTasks.map((task, tIdx) => (
                          <TouchableOpacity
                            key={tIdx}
                            style={styles.catTaskRow}
                            onPress={() => onRenameTask && onRenameTask(task.name)}
                            activeOpacity={0.7}
                          >
                            <Text style={[styles.catTaskName, { color: colors.ink }]} numberOfLines={1}>
                              • {getTaskDisplayName(task.name, t)}
                            </Text>
                            <Text style={[styles.catTaskDur, { color: colors.ink2 }]}>
                              {formatShortDuration(task.sec)}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}
                  </View>
                );
              })}
            </View>

            <Text style={[styles.distNote, { color: colors.ink3 }]}>
              {t('insights.distNote')}
            </Text>
          </View>

          {/* ④ 专注习惯 (黄金时段) */}
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.cardHeader}>
              <Text style={[styles.sectionTitle, { color: colors.ink }]}>
                {t('insights.habitTitle')}
              </Text>
            </View>

            <Text style={[styles.habitSubTitle, { color: colors.ink2 }]}>
              {t('insights.goldenHours')}
            </Text>
            <View style={styles.goldenList}>
              {(metrics.periods || []).map((p) => {
                const isPeak = metrics.peakPeriod?.key === p.key && p.sec > 0;
                const maxSec = metrics.peakPeriod?.sec || 1;
                const pct = p.sec > 0 ? Math.max(8, Math.round((p.sec / maxSec) * 100)) : 0;

                return (
                  <View key={p.key} style={styles.goldenRow}>
                    <View style={styles.goldenLeftCol}>
                      <Text style={[styles.goldenPeriodName, { color: isPeak ? colors.primary : colors.ink }, isPeak && { fontWeight: '700' }]}>
                        {getPeriodLabel(p.key, t)}{isPeak ? ` ${t('insights.peakTag')}` : ''}
                      </Text>
                      <Text style={[styles.goldenSpan, { color: colors.ink3 }]}>{getPeriodSpan(p.key, t)}</Text>
                    </View>
                    <View style={[styles.goldenBarTrack, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)' }]}>
                      {p.sec > 0 && (
                        <View
                          style={[
                            styles.goldenBarFill,
                            { width: `${pct}%`, backgroundColor: isPeak ? colors.primary : colors.ink3 },
                          ]}
                        />
                      )}
                    </View>
                    <Text style={[styles.goldenDur, { color: isPeak ? colors.primary : colors.ink }, isPeak && { fontWeight: '700' }]}>
                      {formatShortDuration(p.sec)}
                    </Text>
                  </View>
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
  summaryCard: {
    padding: 14,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: 6,
  },
  summaryHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  summaryHeadText: {
    fontSize: 12,
    fontWeight: '700',
  },
  summaryBodyText: {
    fontSize: 13,
    lineHeight: 19,
  },
  overviewGrid: {
    flexDirection: 'row',
    gap: 8,
  },
  overviewCard: {
    flex: 1,
    padding: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
    gap: 4,
  },
  overviewNum: {
    fontSize: 18,
    fontWeight: '800',
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
    padding: 14,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: 12,
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
  catDistList: {
    gap: 10,
  },
  catDistItem: {
    gap: 6,
  },
  catDistHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  catDistName: {
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
  },
  catDistRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  catDistCount: {
    fontSize: 11,
  },
  catDistDur: {
    fontSize: 12,
    fontWeight: '600',
  },
  catDistPct: {
    fontSize: 11,
    width: 32,
    textAlign: 'right',
  },
  catProgressBarTrack: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  catProgressBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  catTasksBox: {
    padding: 10,
    borderRadius: radius.md,
    marginTop: 4,
    gap: 6,
  },
  catTasksTitle: {
    fontSize: 11,
    fontWeight: '600',
  },
  catTaskRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 2,
  },
  catTaskName: {
    fontSize: 12,
    flex: 1,
    marginRight: 8,
  },
  catTaskDur: {
    fontSize: 12,
  },
  distNote: {
    fontSize: 11,
    marginTop: 4,
  },
  habitSubTitle: {
    fontSize: 12,
    fontWeight: '600',
  },
  goldenList: {
    gap: 8,
  },
  goldenRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  goldenLeftCol: {
    width: 78,
  },
  goldenPeriodName: {
    fontSize: 12,
  },
  goldenSpan: {
    fontSize: 10,
  },
  goldenBarTrack: {
    flex: 1,
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
  },
  goldenBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  goldenDur: {
    fontSize: 11,
    width: 48,
    textAlign: 'right',
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
