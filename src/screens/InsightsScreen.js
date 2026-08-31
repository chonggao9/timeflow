import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Modal, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getRecords, clearAll } from '../storage/store';
import { computePathStats, formatDuration } from '../utils/stats';
import { getPlaceOptions, queryJourney, buildDurationHistogram } from '../utils/analytics';
import { radius, shadow } from '../theme';
import { useTheme } from '../theme/ThemeContext';
import { useI18n } from '../i18n/LanguageContext';
import ModeIcon from '../components/ModeIcon';
import BarChart from '../components/charts/BarChart';
import HistoryView from '../components/HistoryView';
import RouteMapScreen from './RouteMapScreen';

export default function InsightsScreen() {
  const insets = useSafeAreaInsets();
  const { t, lang } = useI18n();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [records, setRecords] = useState([]);
  const [placeOptions, setPlaceOptions] = useState([]);
  const [paths, setPaths] = useState([]);
  const [fromKey, setFromKey] = useState(null);
  const [toKey, setToKey] = useState(null);
  const [pickerFor, setPickerFor] = useState(null); // 'from' | 'to' | null
  const [result, setResult] = useState(null);
  const [view, setView] = useState('stats'); // 'stats' | 'history'
  const [mapTrip, setMapTrip] = useState(null); // 当前查看地图的行程

  useFocusEffect(useCallback(() => {
    (async () => {
      const all = await getRecords();
      setRecords(all);
      setPlaceOptions(getPlaceOptions(all));
      setPaths(computePathStats(all));
    })();
  }, []));

  // 选定出发地+目的地后自动查询端到端 A→B
  useEffect(() => {
    if (fromKey && toKey && fromKey !== toKey) setResult(queryJourney(records, fromKey, toKey));
    else setResult(null);
  }, [fromKey, toKey, records]);

  const selectPlace = (key) => {
    if (pickerFor === 'from') setFromKey(key);
    else if (pickerFor === 'to') setToKey(key);
    setPickerFor(null);
  };

  const swap = () => { setFromKey(toKey); setToKey(fromKey); };

  const handleClear = () => {
    Alert.alert(t('common.clearTitle'), t('common.clearBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'), style: 'destructive',
        onPress: async () => { await clearAll(); setRecords([]); setPaths([]); setPlaceOptions([]); setResult(null); setFromKey(null); setToKey(null); }
      },
    ]);
  };

  const fromPlace = placeOptions.find(o => o.key === fromKey);
  const toPlace = placeOptions.find(o => o.key === toKey);
  const noData = records.length === 0;

  // 结果派生
  const hist = result ? buildDurationHistogram(result.durations) : null;
  const histLabels = hist ? [...new Set([0, hist.highlight, hist.labels.length - 1])].map(i => ({ index: i, text: `${hist.labels[i]}` })) : [];
  const peakHour = result && result.hourDist.length ? result.hourDist.indexOf(Math.max(...result.hourDist)) : 0;
  const weeklyData = result ? result.weeklyTrend.map(v => v ?? 0) : [];
  const delta = result && result.weeklyTrend[7] != null && result.weeklyTrend[6] != null
    ? result.weeklyTrend[7] - result.weeklyTrend[6] : null;
  const breakdown = result && result.breakdown.length > 1 ? result.breakdown : null;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={[styles.header, { paddingTop: insets.top + 4 }]}>
        <Text style={styles.title}>{t('insights.title')}</Text>
        <Text style={styles.subtitle}>{t('insights.subtitle')}</Text>
      </View>

      {/* 统计 / 历史 分段切换 */}
      <View style={styles.seg}>
        <TouchableOpacity style={[styles.segBtn, view === 'stats' && styles.segBtnActive]} onPress={() => setView('stats')} activeOpacity={0.8}>
          <Text style={[styles.segText, view === 'stats' && styles.segTextActive]}>{t('insights.stats')}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.segBtn, view === 'history' && styles.segBtnActive]} onPress={() => setView('history')} activeOpacity={0.8}>
          <Text style={[styles.segText, view === 'history' && styles.segTextActive]}>{t('insights.history')}</Text>
        </TouchableOpacity>
      </View>

      {view === 'history' ? (
        <HistoryView records={records} onShowMap={setMapTrip} />
      ) : noData ? (
        <View style={styles.empty}>
          <Ionicons name="analytics-outline" size={40} color={colors.ink3} />
          <Text style={styles.emptyText}>{t('insights.empty.title')}</Text>
          <Text style={styles.emptyHint}>{t('insights.empty.hint')}</Text>
        </View>
      ) : (
        <>
          {/* A→B 定向查询（核心） */}
          <View style={styles.card}>
            <Text style={styles.queryTitle}>{t('insights.queryTitle')}</Text>
            <View style={styles.queryRow}>
              <TouchableOpacity style={styles.queryPlace} onPress={() => setPickerFor('from')} activeOpacity={0.7}>
                <Text style={[styles.queryPlaceText, !fromPlace && styles.queryPlaceEmpty]} numberOfLines={1}>
                  {fromPlace ? fromPlace.name : t('insights.from')}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={swap} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="swap-horizontal" size={18} color={colors.ink3} />
              </TouchableOpacity>
              <TouchableOpacity style={styles.queryPlace} onPress={() => setPickerFor('to')} activeOpacity={0.7}>
                <Text style={[styles.queryPlaceText, !toPlace && styles.queryPlaceEmpty]} numberOfLines={1}>
                  {toPlace ? toPlace.name : t('insights.to')}
                </Text>
              </TouchableOpacity>
            </View>

            {/* 路线结果 */}
            {result ? (
              <View style={styles.result}>
                <View style={styles.routeHead}>
                  <Text style={styles.routeTitle}>
                    {result.fromName} <Text style={styles.arrow}>→</Text> {result.toName}
                  </Text>
                  <ModeIcon mode={result.mode} size={16} color={colors.ink2} />
                </View>

                <View style={styles.statRow}>
                  <View style={styles.statMain}>
                    <Text style={styles.statLabel}>{t('insights.typical')}</Text>
                    <Text style={styles.statBig}>{formatDuration(result.medianSec, lang)}</Text>
                    <Text style={styles.statHint}>{t('insights.journeyNote')}</Text>
                  </View>
                  <View style={styles.statSubCol}>
                    <Text style={styles.statLabel}>{t('insights.spread')}</Text>
                    <Text style={styles.statSub}>{formatDuration(result.p25Sec, lang)} – {formatDuration(result.p75Sec, lang)}</Text>
                    <Text style={styles.statSub}>{t('insights.samples', { n: result.sampleCount })}</Text>
                  </View>
                </View>

                {breakdown && (
                  <View style={styles.breakdown}>
                    <Text style={styles.chartTitle}>{t('insights.breakdown')}</Text>
                    {breakdown.map((seg, i) => (
                      <View key={i} style={styles.breakdownRow}>
                        <Text style={styles.breakdownText} numberOfLines={1}>{seg.fromName} → {seg.toName}</Text>
                        <Text style={styles.breakdownDur}>{formatDuration(seg.medianSec, lang)}</Text>
                      </View>
                    ))}
                  </View>
                )}

                {hist && (
                  <View style={styles.chartBlock}>
                    <Text style={styles.chartTitle}>{t('insights.durationDist')}</Text>
                    <BarChart data={hist.counts} highlightIndex={hist.highlight} height={110}
                      xLabels={histLabels} valueLabel={`${Math.round(result.medianSec / 60)}${t('insights.min')}`} />
                  </View>
                )}

                <View style={styles.chartBlock}>
                  <Text style={styles.chartTitle}>{t('insights.timeOfDay')}</Text>
                  <BarChart data={result.hourDist} highlightIndex={peakHour} height={100}
                    xLabels={[{ index: 0, text: '0' }, { index: 6, text: '6' }, { index: 12, text: '12' }, { index: 18, text: '18' }, { index: 23, text: '24' }]}
                    valueLabel={`${peakHour}${t('insights.hourUnit')}`} />
                </View>

                <View style={styles.chartBlock}>
                  <View style={styles.chartTitleRow}>
                    <Text style={styles.chartTitle}>{t('insights.weeklyTrend')}</Text>
                    {delta != null && delta !== 0 && (
                      <Text style={[styles.delta, { color: delta < 0 ? colors.success : colors.danger }]}>
                        {delta < 0 ? '↓' : '↑'} {Math.abs(delta)} {t('insights.min')}
                      </Text>
                    )}
                  </View>
                  <BarChart data={weeklyData} highlightIndex={7} height={100}
                    xLabels={[{ index: 0, text: t('insights.weekAgo') }, { index: 7, text: t('insights.thisWeek') }]} />
                </View>
              </View>
            ) : (
              fromKey && toKey ? (
                <Text style={styles.noData}>{t('insights.noData')}。{t('insights.noDataHint')}</Text>
              ) : null
            )}
          </View>

          {/* 路段规律列表 */}
          <Text style={styles.sectionTitle}>{t('insights.section')}</Text>
          {paths.length === 0 ? (
            <Text style={styles.noData}>{t('insights.noData')}。{t('insights.noDataHint')}</Text>
          ) : (
            paths.filter(p => p.fromKey !== p.toKey).slice(0, 8).map((p, i) => (
              <TouchableOpacity key={i} style={styles.pathCard} onPress={() => { setFromKey(p.fromKey); setToKey(p.toKey); }} activeOpacity={0.7}>
                <View style={styles.pathHead}>
                  <ModeIcon mode={p.mode} size={16} color={colors.primaryStrong} />
                  <Text style={styles.pathRoute} numberOfLines={1}>
                    {p.fromName} <Text style={styles.arrow}>→</Text> {p.toName}
                  </Text>
                  <Text style={styles.pathSamples}>{t('insights.samples', { n: p.sampleCount })}</Text>
                </View>
                <View style={styles.pathStats}>
                  <Text style={styles.pathBig}>{formatDuration(p.medianSec, lang)}</Text>
                  <Text style={styles.pathRange}>{formatDuration(p.p25Sec, lang)} – {formatDuration(p.p75Sec, lang)}</Text>
                </View>
              </TouchableOpacity>
            ))
          )}

          <TouchableOpacity style={styles.clearBtn} onPress={handleClear}>
            <Text style={styles.clearText}>{t('profile.clear')}</Text>
          </TouchableOpacity>
        </>
      )}

      {/* 地点选择弹窗 */}
      <Modal visible={pickerFor != null} transparent animationType="fade" onRequestClose={() => setPickerFor(null)}>
        <View style={styles.overlay}>
          <View style={styles.dialog}>
            <Text style={styles.dialogTitle}>{pickerFor === 'from' ? t('insights.from') : t('insights.to')}</Text>
            <ScrollView style={styles.placeList} showsVerticalScrollIndicator={false}>
              {placeOptions.map(o => (
                <TouchableOpacity key={o.key} style={styles.placeOption} onPress={() => selectPlace(o.key)} activeOpacity={0.7}>
                  <Text style={styles.placeOptionText} numberOfLines={1}>{o.name}</Text>
                  <Text style={styles.placeOptionCount}>{t('insights.placeTimes', { n: o.count })}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity style={styles.dialogCancel} onPress={() => setPickerFor(null)}>
              <Text style={styles.dialogCancelText}>{t('common.cancel')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* 线路轨迹地图（全屏） */}
      <RouteMapScreen visible={mapTrip != null} tripRecords={mapTrip?.records || []} onClose={() => setMapTrip(null)} />
    </ScrollView>
  );
}

const makeStyles = (colors) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, paddingBottom: 40 },

  header: { paddingHorizontal: 4, marginBottom: 16 },
  title: { fontSize: 26, fontWeight: '800', color: colors.ink, letterSpacing: -0.5 },
  subtitle: { fontSize: 13, color: colors.ink2, marginTop: 4 },
  seg: {
    flexDirection: 'row', backgroundColor: colors.chip, borderRadius: radius.sm,
    padding: 3, marginBottom: 16,
  },
  segBtn: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: radius.sm - 3 },
  segBtnActive: { backgroundColor: colors.primarySoft },
  segText: { fontSize: 14, color: colors.ink2, fontWeight: '600' },
  segTextActive: { color: colors.primaryStrong, fontWeight: '800' },

  empty: { alignItems: 'center', paddingVertical: 60, gap: 10 },
  emptyText: { fontSize: 16, color: colors.ink, fontWeight: '700' },
  emptyHint: { fontSize: 13, color: colors.ink3 },

  card: {
    backgroundColor: colors.surface, borderRadius: radius.lg, padding: 16,
    marginBottom: 16, ...shadow.sm,
  },
  queryTitle: { fontSize: 13, color: colors.ink2, fontWeight: '700', marginBottom: 12 },
  queryRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  queryPlace: {
    flex: 1, backgroundColor: colors.chip, borderRadius: radius.sm,
    paddingVertical: 12, paddingHorizontal: 12, borderWidth: 1.5, borderColor: colors.line,
  },
  queryPlaceText: { fontSize: 15, color: colors.ink, fontWeight: '600' },
  queryPlaceEmpty: { color: colors.ink3, fontWeight: '500' },

  result: { marginTop: 16, borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 14 },
  routeHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  routeTitle: { fontSize: 18, color: colors.ink, fontWeight: '800', flex: 1 },
  arrow: { color: colors.primary, fontWeight: '800' },

  statRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  statMain: { flex: 1 },
  statSubCol: { alignItems: 'flex-end' },
  statLabel: { fontSize: 12, color: colors.ink3, marginBottom: 2 },
  statBig: { fontSize: 26, fontWeight: '800', color: colors.primaryStrong, letterSpacing: -1 },
  statHint: { fontSize: 11, color: colors.ink3, marginTop: 2 },
  statSub: { fontSize: 13, color: colors.ink2, fontWeight: '600', marginTop: 2 },

  breakdown: { marginBottom: 12 },
  breakdownRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6 },
  breakdownText: { fontSize: 13, color: colors.ink2, flex: 1, marginRight: 8 },
  breakdownDur: { fontSize: 13, color: colors.ink, fontWeight: '700' },

  chartBlock: { marginTop: 8 },
  chartTitleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  chartTitle: { fontSize: 12, color: colors.ink2, fontWeight: '700', marginBottom: 8 },
  delta: { fontSize: 13, fontWeight: '800', marginBottom: 8 },

  sectionTitle: { fontSize: 13, color: colors.ink2, fontWeight: '700', letterSpacing: 0.4, marginBottom: 10, marginLeft: 4 },
  noData: { fontSize: 13, color: colors.ink3, marginTop: 8, textAlign: 'center' },

  pathCard: {
    backgroundColor: colors.surface, borderRadius: radius.lg, padding: 14,
    marginBottom: 10, ...shadow.sm,
  },
  pathHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  pathRoute: { fontSize: 15, color: colors.ink, fontWeight: '700', flex: 1 },
  pathSamples: { fontSize: 12, color: colors.ink3 },
  pathStats: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  pathBig: { fontSize: 20, fontWeight: '800', color: colors.primaryStrong, letterSpacing: -0.5 },
  pathRange: { fontSize: 12, color: colors.ink3 },

  clearBtn: { marginTop: 20, alignItems: 'center', paddingVertical: 12 },
  clearText: { fontSize: 13, color: colors.danger, fontWeight: '600' },

  overlay: {
    flex: 1, backgroundColor: colors.scrim,
    alignItems: 'center', justifyContent: 'center', padding: 28,
  },
  dialog: {
    width: '100%', backgroundColor: colors.surface, borderRadius: 20, padding: 16,
    maxHeight: '70%',
  },
  dialogTitle: { fontSize: 17, fontWeight: '700', color: colors.ink, textAlign: 'center', marginBottom: 8 },
  placeList: { maxHeight: 340 },
  placeOption: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 13, paddingHorizontal: 12, borderRadius: 12,
  },
  placeOptionText: { fontSize: 15, color: colors.ink, flex: 1, marginRight: 8 },
  placeOptionCount: { fontSize: 12, color: colors.ink3 },
  dialogCancel: {
    marginTop: 8, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.chip,
  },
  dialogCancelText: { fontSize: 15, color: colors.ink2, fontWeight: '600' },
});
