import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Modal, Alert, TextInput } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getRecords, clearAll, getRecordsFingerprint, updateRecord } from '../storage/store';
import { computePathStats, formatDuration, isFocusRecord } from '../utils/stats';
import { getPlaceOptions, queryJourney, buildDurationHistogram } from '../utils/analytics';
import { radius, shadow } from '../theme';
import { useTheme } from '../theme/ThemeContext';
import { useI18n } from '../i18n/LanguageContext';
import ModeIcon from '../components/ModeIcon';
import BarChart from '../components/charts/BarChart';
import HistoryView from '../components/HistoryView';
import RouteMapScreen from './RouteMapScreen';
import TripReceiptModal from '../components/TripReceiptModal';

export default function InsightsScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { t, lang } = useI18n();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const FOCUS_PRESETS_KEYS = ['pomodoro.helpWork', 'pomodoro.helpStudy', 'pomodoro.helpCreate', 'pomodoro.helpBodyMind', 'pomodoro.helpLife', 'pomodoro.helpPlan'];

  const [records, setRecords] = useState([]);
  const [placeOptions, setPlaceOptions] = useState([]);
  const [paths, setPaths] = useState([]);
  const [fromKey, setFromKey] = useState(null);
  const [toKey, setToKey] = useState(null);
  const [pickerFor, setPickerFor] = useState(null); // 'from' | 'to' | null
  const [result, setResult] = useState(null);
  const [view, setView] = useState('travel'); // 'travel' | 'focus' | 'history'
  const [focusRange, setFocusRange] = useState('week'); // 'today' | 'week' | 'month' | 'all'
  const [selectedBarIndex, setSelectedBarIndex] = useState(null);
  const [selectedBar, setSelectedBar] = useState(null);
  const [expandedCats, setExpandedCats] = useState({});
  const [mapTrip, setMapTrip] = useState(null); // 当前查看地图的行程
  const [receiptTrip, setReceiptTrip] = useState(null); // 当前查看小票的行程
  const [renameTarget, setRenameTarget] = useState(null);
  const [draftName, setDraftName] = useState('');
  const lastFingerprintRef = useRef(null);

  const loadData = useCallback(async () => {
    const fp = await getRecordsFingerprint();
    if (lastFingerprintRef.current === fp) return;
    lastFingerprintRef.current = fp;
    const all = await getRecords();
    setRecords(all);
    setPlaceOptions(getPlaceOptions(all));
    const computedPaths = computePathStats(all);
    setPaths(computedPaths);

    setFromKey(prevFrom => {
      if (!prevFrom && computedPaths.length > 0) {
        const top = computedPaths.find(p => p.fromKey !== p.toKey);
        if (top) {
          setToKey(prevTo => prevTo || top.toKey);
          return top.fromKey;
        }
      }
      return prevFrom;
    });
  }, []);

  useFocusEffect(useCallback(() => {
    loadData();
  }, [loadData]));

  // 选定出发地+目的地后自动查询端到端 A→B
  useEffect(() => {
    if (fromKey && toKey && fromKey !== toKey) setResult(queryJourney(records, fromKey, toKey));
    else setResult(null);
  }, [fromKey, toKey, records]);

  const selectPlace = (key) => {
    if (pickerFor === 'from') {
      setFromKey(key);
      if (key === toKey) setToKey(null); // 防呆互斥：若与终点冲突，清空终点
    } else if (pickerFor === 'to') {
      setToKey(key);
      if (key === fromKey) setFromKey(null); // 防呆互斥：若与起点冲突，清空起点
    }
    setPickerFor(null);
  };

  const swap = () => { setFromKey(toKey); setToKey(fromKey); };

  const handleClear = () => {
    Alert.alert(t('common.clearTitle'), t('common.clearBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'), style: 'destructive',
        onPress: async () => {
          await clearAll();
          lastFingerprintRef.current = null;
          setRecords([]);
          setPaths([]);
          setPlaceOptions([]);
          setResult(null);
          setFromKey(null);
          setToKey(null);
        }
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

  // 6 大类与未分类定义 (与 PomodoroTimer 严格保持一致)
  const FOCUS_CATEGORIES = useMemo(() => [
    { key: 'pomodoro.helpWork',     nameKey: 'pomodoro.helpWork',     icon: '💼', color: '#2F4B7C' },
    { key: 'pomodoro.helpStudy',    nameKey: 'pomodoro.helpStudy',    icon: '📚', color: '#E4572E' },
    { key: 'pomodoro.helpCreate',   nameKey: 'pomodoro.helpCreate',   icon: '🎨', color: '#E9A23B' },
    { key: 'pomodoro.helpBodyMind', nameKey: 'pomodoro.helpBodyMind', icon: '🧘', color: '#4E9F7D' },
    { key: 'pomodoro.helpLife',     nameKey: 'pomodoro.helpLife',     icon: '🧹', color: '#5E9BC9' },
    { key: 'pomodoro.helpPlan',     nameKey: 'pomodoro.helpPlan',     icon: '💡', color: '#7B5EA7' },
  ], []);
  const UNCATEGORIZED = useMemo(() => ({ key: 'insights.uncategorized', nameKey: 'insights.uncategorized', icon: '📁', color: '#B8AFA8' }), []);

  const formatShortDuration = useCallback((sec) => {
    if (!sec || sec <= 0) return '0m';
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    if (h > 0) return m > 0 ? `${h}h ${m}m` : `${h}h`;
    return `${m}m`;
  }, []);

  const toggleCatExpand = useCallback((catKey) => {
    setExpandedCats(prev => ({ ...prev, [catKey]: !prev[catKey] }));
  }, []);

  // 基础专注数据衍生与过滤
  const allFocusRecords = useMemo(() => records.filter(isFocusRecord), [records]);

  const { focusRecords, prevFocusRecords, daysCount, daysLabel } = useMemo(() => {
    const now = new Date();
    const todayZero = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const dayOfWeek = now.getDay() || 7; // 1 (一) .. 7 (日)
    const weekZero = todayZero - (dayOfWeek - 1) * 86400000;
    const monthZero = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

    let curStart, curEnd, prevStart, prevEnd, days, label;

    if (focusRange === 'today') {
      curStart = todayZero;
      curEnd = Date.now();
      prevStart = todayZero - 86400000;
      prevEnd = todayZero;
      days = 1;
      label = t('insights.calcToday', '今天');
    } else if (focusRange === 'week') {
      curStart = weekZero;
      curEnd = Date.now();
      prevStart = weekZero - 7 * 86400000;
      prevEnd = weekZero;
      days = dayOfWeek;
      label = t('insights.calcPastDays', '按已过 {n} 天算').replace('{n}', days);
    } else if (focusRange === 'month') {
      curStart = monthZero;
      curEnd = Date.now();
      const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime();
      prevStart = prevMonth;
      prevEnd = monthZero;
      days = now.getDate();
      label = t('insights.calcPastDays', '按已过 {n} 天算').replace('{n}', days);
    } else { // 'all'
      const firstTs = allFocusRecords.length > 0 ? allFocusRecords[0].timestamp : todayZero;
      curStart = firstTs;
      curEnd = Date.now();
      days = Math.max(1, Math.ceil((Date.now() - firstTs) / 86400000));
      prevStart = 0;
      prevEnd = 0;
      label = t('insights.calcAllDays', '按全部 {n} 天算').replace('{n}', days);
    }

    const cur = allFocusRecords.filter(r => r.timestamp >= curStart && r.timestamp <= curEnd);
    const prev = prevStart > 0 ? allFocusRecords.filter(r => r.timestamp >= prevStart && r.timestamp < prevEnd) : [];

    return { focusRecords: cur, prevFocusRecords: prev, daysCount: days, daysLabel: label };
  }, [allFocusRecords, focusRange, t]);

  const focusTotalSec = useMemo(() => focusRecords.reduce((acc, r) => acc + (Number(r.duration) || 0), 0), [focusRecords]);
  const prevTotalSec = useMemo(() => prevFocusRecords.reduce((acc, r) => acc + (Number(r.duration) || 0), 0), [prevFocusRecords]);

  // 环比变化
  const growthRate = useMemo(() => {
    if (focusRange === 'all' || prevTotalSec === 0) {
      return focusTotalSec > 0 ? 100 : 0;
    }
    return Math.round(((focusTotalSec - prevTotalSec) / prevTotalSec) * 100);
  }, [focusRange, focusTotalSec, prevTotalSec]);

  const pomodoroCount = focusRecords.length;
  const completionRate = 100;
  const dailyAvgSec = Math.round(focusTotalSec / (daysCount || 1));

  // 趋势图数据计算
  const trendData = useMemo(() => {
    const now = new Date();
    const todayZero = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

    if (focusRange === 'week') {
      const dayOfWeek = now.getDay() || 7;
      const weekZero = todayZero - (dayOfWeek - 1) * 86400000;
      const days = lang === 'zh'
        ? ['一', '二', '三', '四', '五', '六', '日']
        : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
      const bars = [];
      for (let i = 0; i < 7; i++) {
        const start = weekZero + i * 86400000;
        const end = start + 86400000;
        const dayRecords = focusRecords.filter(r => r.timestamp >= start && r.timestamp < end);
        const sec = dayRecords.reduce((s, r) => s + (Number(r.duration) || 0), 0);
        const mins = Math.round(sec / 60);
        bars.push({
          label: days[i],
          mins,
          isToday: i === (dayOfWeek - 1),
          isPast: i < dayOfWeek,
          dateStr: new Date(start).toLocaleDateString(lang === 'zh' ? 'zh-CN' : 'en-US', { month: 'numeric', day: 'numeric' })
        });
      }
      return bars;
    } else if (focusRange === 'month') {
      const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      const monthZero = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
      const currentDay = now.getDate();
      const bars = [];
      for (let i = 1; i <= daysInMonth; i++) {
        const start = monthZero + (i - 1) * 86400000;
        const end = start + 86400000;
        const dayRecords = focusRecords.filter(r => r.timestamp >= start && r.timestamp < end);
        const sec = dayRecords.reduce((s, r) => s + (Number(r.duration) || 0), 0);
        bars.push({
          label: (i % 5 === 0 || i === 1 || i === daysInMonth) ? `${i}` : '',
          fullLabel: lang === 'zh' ? `${i}日` : `Day ${i}`,
          mins: Math.round(sec / 60),
          isToday: i === currentDay,
          isPast: i <= currentDay,
        });
      }
      return bars;
    } else if (focusRange === 'today') {
      const bars = [];
      const currentHour = now.getHours();
      for (let h = 0; h < 24; h += 3) {
        const start = todayZero + h * 3600000;
        const end = start + 3 * 3600000;
        const slotRecords = focusRecords.filter(r => r.timestamp >= start && r.timestamp < end);
        const sec = slotRecords.reduce((s, r) => s + (Number(r.duration) || 0), 0);
        bars.push({
          label: `${h}h`,
          mins: Math.round(sec / 60),
          isToday: currentHour >= h && currentHour < h + 3,
          isPast: currentHour >= h,
        });
      }
      return bars;
    } else { // 'all'
      const dayOfWeek = now.getDay() || 7;
      const currentWeekZero = todayZero - (dayOfWeek - 1) * 86400000;
      const bars = [];
      for (let w = 7; w >= 0; w--) {
        const start = currentWeekZero - w * 7 * 86400000;
        const end = start + 7 * 86400000;
        const weekRecs = focusRecords.filter(r => r.timestamp >= start && r.timestamp < end);
        const sec = weekRecs.reduce((s, r) => s + (Number(r.duration) || 0), 0);
        bars.push({
          label: w === 0 ? t('insights.thisWeek', '本周') : `${w}w`,
          mins: Math.round(sec / 60),
          isToday: w === 0,
          isPast: true,
        });
      }
      return bars;
    }
  }, [focusRange, focusRecords, lang, t]);

  // 分类分布与二级任务Top5聚合
  const categoryDistribution = useMemo(() => {
    const catMap = {};
    let totalSec = 0;

    focusRecords.forEach(r => {
      let matchedKey = 'insights.uncategorized';
      if (r.category) {
        const found = FOCUS_CATEGORIES.find(c => c.key === r.category);
        if (found) matchedKey = found.key;
      } else {
        // 向前兼容：历史旧版本无 category 字段，分类存放在 goalName 或 locationName
        const raw = (r.goalName || r.locationName || '');
        if (raw.includes('学习') || raw.includes('Study') || raw.includes('📚')) matchedKey = 'pomodoro.helpStudy';
        else if (raw.includes('工作') || raw.includes('Work') || raw.includes('💼')) matchedKey = 'pomodoro.helpWork';
        else if (raw.includes('创作') || raw.includes('Create') || raw.includes('🎨')) matchedKey = 'pomodoro.helpCreate';
        else if (raw.includes('身心') || raw.includes('Wellness') || raw.includes('Body') || raw.includes('🧘')) matchedKey = 'pomodoro.helpBodyMind';
        else if (raw.includes('生活') || raw.includes('Life') || raw.includes('🧹')) matchedKey = 'pomodoro.helpLife';
        else if (raw.includes('规划') || raw.includes('Plan') || raw.includes('💡')) matchedKey = 'pomodoro.helpPlan';
      }
      const taskName = (r.goalName || r.locationName || '').trim() || t('home.unnamedFocus');
      const dur = Number(r.duration) || 0;
      totalSec += dur;

      if (!catMap[matchedKey]) {
        const meta = FOCUS_CATEGORIES.find(c => c.key === matchedKey) || UNCATEGORIZED;
        catMap[matchedKey] = {
          key: matchedKey,
          name: t(meta.nameKey, meta.key),
          icon: meta.icon,
          color: meta.color,
          sec: 0,
          count: 0,
          tasks: {},
        };
      }
      catMap[matchedKey].sec += dur;
      catMap[matchedKey].count += 1;
      catMap[matchedKey].tasks[taskName] = (catMap[matchedKey].tasks[taskName] || 0) + dur;
    });

    return Object.values(catMap)
      .map(item => {
        const topTasks = Object.entries(item.tasks)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([name, sec]) => ({ name, sec }));
        return {
          ...item,
          percent: totalSec > 0 ? Math.round((item.sec / totalSec) * 100) : 0,
          topTasks,
        };
      })
      .sort((a, b) => b.sec - a.sec);
  }, [focusRecords, FOCUS_CATEGORIES, UNCATEGORIZED, t]);

  // 习惯洞察引擎：黄金时段与智能总结
  const habitInsights = useMemo(() => {
    const periods = [
      { key: 'morning',   label: t('insights.timeMorning', '上午'),     span: t('insights.timeMorningSpan', '6–12 点'), sec: 0 },
      { key: 'afternoon', label: t('insights.timeAfternoon', '下午'),   span: t('insights.timeAfternoonSpan', '12–18 点'), sec: 0 },
      { key: 'evening',   label: t('insights.timeEvening', '晚上'),     span: t('insights.timeEveningSpan', '18–24 点'), sec: 0 },
      { key: 'lateNight', label: t('insights.timeLateNight', '深夜'),   span: t('insights.timeLateNightSpan', '0–6 点'), sec: 0 },
    ];

    focusRecords.forEach(r => {
      const h = new Date(r.timestamp).getHours();
      const dur = Number(r.duration) || 0;
      if (h >= 6 && h < 12) periods[0].sec += dur;
      else if (h >= 12 && h < 18) periods[1].sec += dur;
      else if (h >= 18 && h < 24) periods[2].sec += dur;
      else periods[3].sec += dur;
    });

    const maxPeriodSec = Math.max(...periods.map(p => p.sec));
    const peakPeriod = maxPeriodSec > 0 ? periods.find(p => p.sec === maxPeriodSec) : null;
    const avgPomodoroMin = pomodoroCount > 0 ? Math.round(focusTotalSec / pomodoroCount / 60) : 0;

    let summaryText = '';
    if (focusRecords.length === 0) {
      summaryText = t('insights.focusEmptyHint', '试着在首页开启一次室内专注吧');
    } else {
      // 优先选取具有明确业务归类的第一大类，避免出现“在【未分类】上花了最多时间”
      const topCat = categoryDistribution.find(c => c.key !== 'insights.uncategorized') || categoryDistribution[0];
      const isUncategorized = !topCat || topCat.key === 'insights.uncategorized';
      const topCatName = topCat ? topCat.name.replace(/^[^\s\w\u4e00-\u9fa5]+\s*/, '') : '';
      const topCatDurStr = topCat ? formatShortDuration(topCat.sec) : '';
      const totalDurStr = formatShortDuration(focusTotalSec);
      const peakName = peakPeriod ? peakPeriod.label : '';
      const rangeText = focusRange === 'today' ? t('insights.rangeToday') : focusRange === 'week' ? t('insights.rangeWeek') : focusRange === 'month' ? t('insights.rangeMonth') : '';

      if (!isUncategorized && topCat && peakName) {
        summaryText = lang === 'zh'
          ? `${rangeText}你在【${topCatName}】上花了最多时间，共 ${topCatDurStr}，大多集中在【${peakName}】。`
          : `Most of your focus ${rangeText.toLowerCase()} was in [${topCatName}] (${topCatDurStr}), primarily in the ${peakName.toLowerCase()}.`;
      } else if (!isUncategorized && topCat) {
        summaryText = lang === 'zh'
          ? `${rangeText}你在【${topCatName}】上专注投入了 ${topCatDurStr}，保持专注节奏！`
          : `You spent ${topCatDurStr} in [${topCatName}] ${rangeText.toLowerCase()}. Keep it up!`;
      } else if (peakName) {
        summaryText = lang === 'zh'
          ? `${rangeText}你已累计专注投入 ${totalDurStr}，大多集中在【${peakName}】。`
          : `You spent ${totalDurStr} focusing ${rangeText.toLowerCase()}, mostly in the ${peakName.toLowerCase()}.`;
      } else {
        summaryText = lang === 'zh'
          ? `已完成 ${pomodoroCount} 个专注番茄，总时长 ${totalDurStr}。`
          : `Completed ${pomodoroCount} pomodoros, totaling ${totalDurStr}.`;
      }
    }

    return { periods, peakPeriod, avgPomodoroMin, summaryText };
  }, [focusRecords, pomodoroCount, focusTotalSec, categoryDistribution, focusRange, lang, t, formatShortDuration]);

  const confirmRenameFocus = async () => {
    if (!draftName.trim() || !renameTarget) return;
    const newName = draftName.trim();
    if (newName !== renameTarget) {
      const allRecords = await getRecords();
      const toUpdate = allRecords.filter(r => isFocusRecord(r) && (r.goalName === renameTarget || (!r.goalName && renameTarget === t('home.unnamedFocus'))));
      for (const r of toUpdate) {
        await updateRecord(r.id, { goalName: newName, locationName: newName });
      }
      lastFingerprintRef.current = null;
      loadData();
    }
    setRenameTarget(null);
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={[styles.header, { paddingTop: insets.top + 4 }]}>
        <Text style={styles.title}>{t('insights.title')}</Text>
        <Text style={styles.subtitle}>{t('insights.subtitle')}</Text>
      </View>

      {/* 分段切换 */}
      <View style={styles.seg}>
        <TouchableOpacity style={[styles.segBtn, view === 'travel' && styles.segBtnActive]} onPress={() => setView('travel')} activeOpacity={0.8}>
          <Text style={[styles.segText, view === 'travel' && styles.segTextActive]}>{t('insights.segTravel', '🚗 行程')}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.segBtn, view === 'focus' && styles.segBtnActive]} onPress={() => setView('focus')} activeOpacity={0.8}>
          <Text style={[styles.segText, view === 'focus' && styles.segTextActive]}>{t('insights.segFocus', '🍅 专注')}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.segBtn, view === 'history' && styles.segBtnActive]} onPress={() => setView('history')} activeOpacity={0.8}>
          <Text style={[styles.segText, view === 'history' && styles.segTextActive]}>🕒 {t('insights.history')}</Text>
        </TouchableOpacity>
      </View>

      {view === 'history' ? (
        <HistoryView records={records.filter(r => !isFocusRecord(r))} onShowMap={setMapTrip} onShowReceipt={setReceiptTrip} />
      ) : view === 'focus' ? (
            <>
              {/* 顶部时间范围筛选器 */}
              <View style={styles.rangeFilterWrap}>
                {[
                  { key: 'today', label: t('insights.rangeToday', '今天') },
                  { key: 'week', label: t('insights.rangeWeek', '本周') },
                  { key: 'month', label: t('insights.rangeMonth', '本月') },
                  { key: 'all', label: t('insights.rangeAll', '全部') },
                ].map(opt => {
                  const isActive = focusRange === opt.key;
                  return (
                    <TouchableOpacity
                      key={opt.key}
                      onPress={() => {
                        setFocusRange(opt.key);
                        setSelectedBar(null);
                        setSelectedBarIndex(null);
                      }}
                      style={[styles.rangeChip, isActive && styles.rangeChipActive]}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.rangeChipText, isActive && styles.rangeChipTextActive]}>
                        {opt.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* ① 概览卡片 (3 张) */}
              <View style={styles.overviewGrid}>
                {/* 专注时长 */}
                <View style={styles.overviewCard}>
                  <Text style={styles.overviewNum}>
                    {formatShortDuration(focusTotalSec)}
                  </Text>
                  <Text style={styles.overviewLabel}>{t('insights.focusDuration', '专注时长')}</Text>
                  <Text style={[
                    styles.overviewSubLabel,
                    growthRate > 0 ? { color: colors.primaryStrong } : growthRate < 0 ? { color: colors.danger } : { color: colors.ink3 }
                  ]}>
                    {focusRange === 'all'
                      ? t('insights.vsPrevFlat', '较上期持平')
                      : growthRate > 0
                      ? t('insights.vsPrevUp', '较上期 ↑{pct}%').replace('{pct}', Math.abs(growthRate))
                      : growthRate < 0
                      ? t('insights.vsPrevDown', '较上期 ↓{pct}%').replace('{pct}', Math.abs(growthRate))
                      : t('insights.vsPrevFlat', '较上期持平')}
                  </Text>
                </View>

                {/* 番茄数 */}
                <View style={styles.overviewCard}>
                  <Text style={styles.overviewNum}>{pomodoroCount}</Text>
                  <Text style={styles.overviewLabel}>{t('insights.pomodoroCount', '番茄数')}</Text>
                  <Text style={[styles.overviewSubLabel, { color: colors.primaryStrong }]}>
                    {t('insights.completionRate', '完成率 {pct}%').replace('{pct}', completionRate)}
                  </Text>
                </View>

                {/* 日均 */}
                <View style={styles.overviewCard}>
                  <Text style={styles.overviewNum}>
                    {dailyAvgSec >= 3600
                      ? `${(dailyAvgSec / 3600).toFixed(1)}h`
                      : `${Math.round(dailyAvgSec / 60)}m`}
                  </Text>
                  <Text style={styles.overviewLabel}>{t('insights.dailyAvg', '日均')}</Text>
                  <Text style={styles.overviewSubLabel}>{daysLabel}</Text>
                </View>
              </View>

              {focusRecords.length > 0 ? (
                <>
                  {/* ② 专注时长趋势 */}
                  <View style={styles.card}>
                    <View style={styles.cardHeader}>
                      <Text style={styles.cardTitle}>{t('insights.trendTitle', '专注时长趋势')}</Text>
                      <Text style={styles.cardSubTitle}>{t('insights.unitMinutes', '单位:分钟')}</Text>
                    </View>

                    {selectedBar && (
                      <View style={styles.trendTooltip}>
                        <Text style={styles.trendTooltipText}>
                          {selectedBar.dateStr ? `${selectedBar.dateStr} · ` : ''}{selectedBar.fullLabel || selectedBar.label}: {selectedBar.mins} {t('insights.min', '分钟')}
                        </Text>
                      </View>
                    )}

                    <View style={styles.trendChartWrap}>
                      {trendData.map((bar, idx) => {
                        const maxMins = Math.max(...trendData.map(b => b.mins), 60);
                        const heightPercent = bar.mins > 0 ? Math.max(10, (bar.mins / maxMins) * 100) : 0;
                        const isSelected = selectedBarIndex === idx;

                        return (
                          <TouchableOpacity
                            key={idx}
                            style={styles.trendCol}
                            onPress={() => {
                              setSelectedBarIndex(idx);
                              setSelectedBar(bar);
                            }}
                            activeOpacity={0.7}
                          >
                            {bar.mins > 0 && (
                              <Text style={[styles.trendBarVal, bar.isToday && { color: colors.primaryStrong, fontWeight: '700' }]}>
                                {bar.mins}
                              </Text>
                            )}

                            <View style={styles.trendBarTrack}>
                              {bar.mins > 0 ? (
                                <View
                                  style={[
                                    styles.trendBarFill,
                                    { height: `${heightPercent}%` },
                                    bar.isToday
                                      ? { backgroundColor: colors.primaryStrong }
                                      : isSelected
                                      ? { backgroundColor: colors.primary }
                                      : { backgroundColor: colors.primary + '99' },
                                  ]}
                                />
                              ) : (
                                <View style={[styles.trendDot, bar.isToday && { backgroundColor: colors.primaryStrong }]} />
                              )}
                            </View>

                            <Text
                              style={[
                                styles.trendXLabel,
                                bar.isToday && { color: colors.primaryStrong, fontWeight: '800' },
                                isSelected && { color: colors.ink, fontWeight: '700' },
                              ]}
                              numberOfLines={1}
                            >
                              {bar.label}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>

                    <Text style={styles.trendNote}>
                      {t('insights.trendNote', '日均 {avg} 分钟 = 总计 {total} 分钟 ÷ {days} 天。浅色小点标出断档。')
                        .replace('{avg}', Math.round(dailyAvgSec / 60))
                        .replace('{total}', Math.round(focusTotalSec / 60))
                        .replace('{days}', daysCount)}
                    </Text>
                  </View>

                  {/* ③ 分类分布 (核心模块) */}
                  <View style={styles.card}>
                    <View style={styles.cardHeader}>
                      <Text style={styles.cardTitle}>{t('insights.categoryDist', '分类分布')}</Text>
                      <Text style={styles.cardSubTitle}>
                        {t('insights.rangeTotalPomodoros', '共 {n} 个番茄').replace('{n}', pomodoroCount)}
                      </Text>
                    </View>

                    <View style={styles.catDistList}>
                      {categoryDistribution.map((cat) => {
                        const isExpanded = !!expandedCats[cat.key];
                        return (
                          <View key={cat.key} style={styles.catDistItem}>
                            <TouchableOpacity
                              style={styles.catDistHeader}
                              onPress={() => toggleCatExpand(cat.key)}
                              activeOpacity={0.7}
                            >
                              <View style={styles.catDistLeft}>
                                <Text style={styles.catDistIcon}>{cat.icon}</Text>
                                <Text style={styles.catDistName} numberOfLines={1}>{cat.name}</Text>
                              </View>

                              <View style={styles.catDistRight}>
                                <Text style={styles.catDistCount}>
                                  {t('insights.catCountUnit', '{n} 个').replace('{n}', cat.count)}
                                </Text>
                                <Text style={styles.catDistDur}>{formatShortDuration(cat.sec)}</Text>
                                <Text style={styles.catDistPct}>{cat.percent}%</Text>
                                <Ionicons
                                  name={isExpanded ? 'chevron-up' : 'chevron-down'}
                                  size={16}
                                  color={colors.ink3}
                                />
                              </View>
                            </TouchableOpacity>

                            {/* 彩色进度条 */}
                            <View style={styles.catProgressBarTrack}>
                              <View
                                style={[
                                  styles.catProgressBarFill,
                                  { width: `${Math.max(cat.percent, 3)}%`, backgroundColor: cat.color },
                                ]}
                              />
                            </View>

                            {/* 展开的 Top 5 任务二级明细 */}
                            {isExpanded && cat.topTasks.length > 0 && (
                              <View style={styles.catTasksBox}>
                                <Text style={styles.catTasksTitle}>{t('insights.topTasks', '任务 Top 5')}</Text>
                                {cat.topTasks.map((task, tIdx) => (
                                  <TouchableOpacity
                                    key={tIdx}
                                    style={styles.catTaskRow}
                                    onPress={() => {
                                      setRenameTarget(task.name);
                                      setDraftName(task.name === t('home.unnamedFocus') ? '' : task.name);
                                    }}
                                    activeOpacity={0.7}
                                  >
                                    <Text style={styles.catTaskName} numberOfLines={1}>
                                      • {task.name}
                                    </Text>
                                    <Text style={styles.catTaskDur}>{formatShortDuration(task.sec)}</Text>
                                  </TouchableOpacity>
                                ))}
                              </View>
                            )}
                          </View>
                        );
                      })}
                    </View>

                    <Text style={styles.catDistFooter}>
                      {t('insights.distNote', '点分类可展开任务标题。「未分类」来自没有选择分类的旧记录。')}
                    </Text>
                  </View>

                  {/* ④ 专注习惯 (Habit Insights) */}
                  <View style={styles.card}>
                    <View style={styles.cardHeader}>
                      <Text style={styles.cardTitle}>{t('insights.habitTitle', '专注习惯')}</Text>
                    </View>

                    {/* 黄金时段 (横向对比条形) */}
                    <Text style={styles.habitSubTitle}>{t('insights.goldenHours', '黄金时段')}</Text>
                    <View style={styles.goldenList}>
                      {habitInsights.periods.map((p) => {
                        const isPeak = habitInsights.peakPeriod?.key === p.key && p.sec > 0;
                        const maxSec = habitInsights.peakPeriod?.sec || 1;
                        const pct = p.sec > 0 ? Math.max(8, Math.round((p.sec / maxSec) * 100)) : 0;
                        return (
                          <View key={p.key} style={styles.goldenRow}>
                            <View style={styles.goldenLeftCol}>
                              <Text style={[styles.goldenPeriodName, isPeak && { color: colors.primaryStrong, fontWeight: '700' }]}>
                                {p.label}{isPeak ? ` ${t('insights.peakTag', '· 最多')}` : ''}
                              </Text>
                              <Text style={styles.goldenSpan}>{p.span}</Text>
                            </View>
                            <View style={styles.goldenBarTrack}>
                              {p.sec > 0 && (
                                <View
                                  style={[
                                    styles.goldenBarFill,
                                    { width: `${pct}%` },
                                    isPeak ? { backgroundColor: colors.primary } : { backgroundColor: colors.line2 || '#D9B8AD' },
                                  ]}
                                />
                              )}
                            </View>
                            <Text style={[styles.goldenDur, isPeak && { color: colors.primaryStrong, fontWeight: '700' }]}>
                              {formatShortDuration(p.sec)}
                            </Text>
                          </View>
                        );
                      })}
                    </View>

                    {/* 指标双小卡片 */}
                    <View style={styles.habitMetaRow}>
                      <View style={styles.habitMetaCard}>
                        <Text style={styles.habitMetaVal}>{habitInsights.avgPomodoroMin} {t('insights.min', '分钟')}</Text>
                        <Text style={styles.habitMetaLabel}>{t('insights.avgPerPomodoro', '平均每个番茄')}</Text>
                      </View>
                      <View style={styles.habitMetaCard}>
                        <Text style={styles.habitMetaVal}>{t('insights.placeTimes', '{n} 次').replace('{n}', '0')} · 100%</Text>
                        <Text style={styles.habitMetaLabel}>{t('insights.abandonCount', '中途放弃')}</Text>
                      </View>
                    </View>

                    {/* 智能分析总结卡片 */}
                    <View style={styles.smartSummaryCard}>
                      <View style={styles.smartSummaryHead}>
                        <Ionicons name="sparkles" size={16} color={colors.primaryStrong} />
                        <Text style={styles.smartSummaryHeadText}>{t('insights.summaryPrefix', '智能分析')}</Text>
                      </View>
                      <Text style={styles.smartSummaryText}>{habitInsights.summaryText}</Text>
                    </View>
                  </View>
                </>
              ) : (
                <View style={styles.emptyCard}>
                  <Ionicons name="timer-outline" size={56} color={colors.ink3} />
                  <Text style={styles.emptyCardTitle}>
                    {focusRange === 'today'
                      ? t('insights.emptyToday', '今天还没有专注记录')
                      : focusRange === 'week'
                      ? t('insights.emptyWeek', '本周还没有专注记录')
                      : focusRange === 'month'
                      ? t('insights.emptyMonth', '本月还没有专注记录')
                      : t('insights.emptyAll', '还没有专注记录')}
                  </Text>
                  <Text style={styles.emptyCardDesc}>
                    {t('insights.emptyDesc', '开始一个番茄钟并选好分类，这里就会生成专注分析。')}
                  </Text>

                  {/* 6 大分类胶囊标签 */}
                  <View style={styles.emptyCatRow}>
                    {FOCUS_CATEGORIES.map(c => (
                      <View key={c.key} style={styles.emptyCatChip}>
                        <Text style={styles.emptyCatChipText}>{t(c.nameKey)}</Text>
                      </View>
                    ))}
                  </View>

                  <TouchableOpacity
                    style={styles.emptyActionBtn}
                    onPress={() => navigation.navigate('Home')}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.emptyActionBtnText}>{t('pomodoro.start', '开始专注')}</Text>
                  </TouchableOpacity>

                  {focusRange !== 'all' && (
                    <Text style={styles.emptySwitchHint}>
                      {t('insights.emptySwitchHint', '想看以前的数据？切换到「本周」或「全部」。')}
                    </Text>
                  )}
                </View>
              )}
            </>
          ) : noData ? (
            <View style={styles.empty}>
              <Ionicons name="analytics-outline" size={40} color={colors.ink3} />
              <Text style={styles.emptyText}>{t('insights.empty.title')}</Text>
              <Text style={styles.emptyHint}>{t('insights.empty.hint')}</Text>
            </View>
          ) : (
            <>
              {/* 出行总览指标看板 */}
              <View style={styles.overviewGrid}>
            <View style={styles.overviewCard}>
              <Text style={styles.overviewNum}>{records.length}</Text>
              <Text style={styles.overviewLabel}>{t('insights.totalRecords')}</Text>
            </View>
            <View style={styles.overviewCard}>
              <Text style={styles.overviewNum}>{placeOptions.length}</Text>
              <Text style={styles.overviewLabel}>{t('insights.totalPlaces')}</Text>
            </View>
            <View style={styles.overviewCard}>
              <Text style={[styles.overviewNum, { color: colors.primary }]}>{paths.length}</Text>
              <Text style={styles.overviewLabel}>{t('insights.totalPaths')}</Text>
            </View>
          </View>

          {/* 高频通勤快捷查看标签 */}
          {paths.length > 0 && (
            <View style={styles.quickSection}>
              <View style={styles.quickHeader}>
                <Ionicons name="flash-outline" size={13} color={colors.primaryStrong} />
                <Text style={styles.quickTitle}>{t('insights.quickRoutes')}</Text>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.quickScroll}>
                {paths.filter(p => p.fromKey !== p.toKey).slice(0, 5).map((p, idx) => {
                  const isCur = fromKey === p.fromKey && toKey === p.toKey;
                  return (
                    <TouchableOpacity
                      key={`top-${idx}`}
                      style={[styles.quickChip, isCur && styles.quickChipActive]}
                      onPress={() => {
                        setFromKey(p.fromKey);
                        setToKey(p.toKey);
                      }}
                      activeOpacity={0.7}
                    >
                      <ModeIcon mode={p.mode} size={13} color={isCur ? colors.primaryStrong : colors.ink2} />
                      <Text style={[styles.quickChipText, isCur && styles.quickChipTextActive]}>
                        {p.fromName} → {p.toName}
                      </Text>
                      <Text style={[styles.quickChipDur, isCur && styles.quickChipDurActive]}>
                        {Math.round(p.medianSec / 60)}{t('insights.min')}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          )}

          {/* A→B 定向查询（核心） */}
          <View style={styles.card}>
            <Text style={styles.queryTitle}>{t('insights.queryTitle')}</Text>
            <View style={styles.queryRow}>
              <TouchableOpacity style={styles.queryPlace} onPress={() => setPickerFor('from')} activeOpacity={0.7}>
                <Text style={[styles.queryPlaceText, !fromPlace && styles.queryPlaceEmpty]} numberOfLines={1}>
                  {fromPlace ? fromPlace.name : t('insights.from')}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.swapBtn}
                onPress={swap}
                activeOpacity={0.7}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="swap-horizontal" size={20} color={colors.primaryStrong} />
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
            ) : fromKey && toKey ? (
              fromKey === toKey ? (
                <Text style={[styles.noData, { color: colors.danger }]}>{t('insights.samePlaceError')}</Text>
              ) : (
                <Text style={styles.noData}>{t('insights.noData')}。{t('insights.noDataHint')}</Text>
              )
            ) : null}
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
            <View style={styles.placeList}>
              <FlashList
                data={placeOptions}
                estimatedItemSize={50}
                showsVerticalScrollIndicator={false}
                keyExtractor={(item) => item.key}
                renderItem={({ item: o }) => {
                  const isSelected = (pickerFor === 'from' && o.key === fromKey) || (pickerFor === 'to' && o.key === toKey);
                  const isOpposing = (pickerFor === 'from' && o.key === toKey) || (pickerFor === 'to' && o.key === fromKey);
                  return (
                    <TouchableOpacity
                      style={[
                        styles.placeOption,
                        isSelected && styles.placeOptionActive,
                        isOpposing && styles.placeOptionDisabled,
                      ]}
                      onPress={() => !isOpposing && selectPlace(o.key)}
                      disabled={isOpposing}
                      activeOpacity={0.7}
                    >
                      <View style={styles.placeOptionLeft}>
                        {isSelected && <Ionicons name="checkmark-circle" size={17} color={colors.primary} style={{ marginRight: 6 }} />}
                        <Text
                          style={[
                            styles.placeOptionText,
                            isSelected && styles.placeOptionTextActive,
                            isOpposing && styles.placeOptionTextDisabled,
                          ]}
                          numberOfLines={1}
                        >
                          {o.name}
                        </Text>
                        {isOpposing && (
                          <View style={styles.opposingTag}>
                            <Text style={styles.opposingTagText}>
                              {pickerFor === 'from' ? t('insights.to') : t('insights.from')}
                            </Text>
                          </View>
                        )}
                      </View>
                      <Text style={[styles.placeOptionCount, isOpposing && { opacity: 0.5 }]}>
                        {t('insights.placeTimes', { n: o.count })}
                      </Text>
                    </TouchableOpacity>
                  );
                }}
              />
            </View>
            <TouchableOpacity style={styles.dialogCancel} onPress={() => setPickerFor(null)}>
              <Text style={styles.dialogCancelText}>{t('common.cancel')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* 线路轨迹地图（全屏） */}
      <RouteMapScreen visible={mapTrip != null} tripRecords={mapTrip?.records || []} onClose={() => setMapTrip(null)} />

      {/* 行程小票卡片（弹窗） */}
      <TripReceiptModal visible={receiptTrip != null} trip={receiptTrip} onClose={() => setReceiptTrip(null)} />

      {/* Rename Focus Modal */}
      <Modal visible={!!renameTarget} transparent animationType="fade">
        <View style={styles.overlay}>
          <View style={styles.dialog}>
            <Text style={styles.dialogTitle}>{t('home.renameFocusTitle', '修改专注标签')}</Text>
            <Text style={styles.dialogSub}>{t('insights.renameBatchDesc', '将修改历史中所有该名称的专注记录')}</Text>

            <TextInput
              style={styles.input}
              value={draftName}
              onChangeText={setDraftName}
              placeholder={t('home.renameFocusPlaceholder', '如：读书 / 写代码')}
              placeholderTextColor={colors.ink3}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={confirmRenameFocus}
            />

            <View style={styles.quickPlaceWrap}>
              <View style={styles.chipRow}>
                {FOCUS_PRESETS_KEYS.map((k, pIdx) => {
                  const place = t(k);
                  const isSelected = draftName === place;
                  return (
                    <TouchableOpacity
                      key={'rename-place-' + pIdx}
                      style={[styles.quickChip, isSelected && styles.quickChipActive]}
                      onPress={() => setDraftName(place)}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.quickChipText, isSelected && styles.quickChipTextActive]}>
                        {place}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            <View style={styles.dialogRow}>
              <TouchableOpacity style={[styles.dialogBtn, styles.dialogCancel]} onPress={() => setRenameTarget(null)}>
                <Text style={styles.dialogCancelText}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.dialogBtn, styles.dialogOk]} onPress={confirmRenameFocus}>
                <Text style={styles.dialogOkText}>{t('common.save')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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

  modeSwitchWrap: { flexDirection: 'row', backgroundColor: colors.chip, padding: 4, borderRadius: 16, marginBottom: 20 },
  modeSwitchBtn: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 12 },
  modeSwitchActive: { backgroundColor: colors.surface, ...shadow.sm },
  modeSwitchText: { fontSize: 14, color: colors.ink3, fontWeight: '600' },
  modeSwitchTextActive: { color: colors.ink, fontWeight: '800' },

  empty: { alignItems: 'center', paddingVertical: 60, gap: 10 },
  emptyText: { fontSize: 16, color: colors.ink, fontWeight: '700' },
  emptyHint: { fontSize: 13, color: colors.ink3 },

  overviewGrid: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
  },
  overviewCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingVertical: 14,
    paddingHorizontal: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.line,
    ...shadow.card,
  },
  overviewNum: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.ink,
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.5,
  },
  overviewLabel: {
    fontSize: 11,
    color: colors.ink3,
    marginTop: 4,
    fontWeight: '500',
  },
  overviewSubLabel: {
    fontSize: 10,
    color: colors.ink3,
    marginTop: 3,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },

  // Range Filter
  rangeFilterWrap: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
  },
  rangeChip: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 16,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  rangeChipActive: {
    backgroundColor: colors.primaryStrong,
    borderColor: colors.primaryStrong,
  },
  rangeChipText: {
    fontSize: 13,
    color: colors.ink2,
    fontWeight: '500',
  },
  rangeChipTextActive: {
    color: '#fff',
    fontWeight: '700',
  },

  // Trend Chart
  trendTooltip: {
    backgroundColor: colors.chip,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 8,
    alignSelf: 'center',
    marginBottom: 8,
  },
  trendTooltipText: {
    fontSize: 12,
    color: colors.ink,
    fontWeight: '600',
  },
  trendChartWrap: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: 140,
    paddingTop: 24,
    paddingBottom: 6,
    gap: 6,
  },
  trendCol: {
    flex: 1,
    alignItems: 'center',
    height: '100%',
    justifyContent: 'flex-end',
  },
  trendBarVal: {
    fontSize: 10,
    color: colors.ink3,
    fontWeight: '600',
    marginBottom: 4,
    fontVariant: ['tabular-nums'],
  },
  trendBarTrack: {
    flex: 1,
    width: 14,
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  trendBarFill: {
    width: '100%',
    borderRadius: 7,
  },
  trendDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.line2 || '#d0d0d0',
    marginBottom: 2,
  },
  trendXLabel: {
    fontSize: 11,
    color: colors.ink3,
    marginTop: 6,
    fontWeight: '500',
  },
  trendNote: {
    fontSize: 11,
    color: colors.ink3,
    marginTop: 12,
    lineHeight: 16,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    paddingTop: 10,
  },

  // Category Distribution
  catDistList: {
    marginTop: 4,
    gap: 12,
  },
  catDistItem: {
    backgroundColor: colors.surface,
    borderRadius: 12,
  },
  catDistHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  catDistLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  catDistIcon: {
    fontSize: 18,
  },
  catDistName: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.ink,
    flex: 1,
  },
  catDistRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  catDistCount: {
    fontSize: 12,
    color: colors.ink3,
    fontWeight: '500',
  },
  catDistDur: {
    fontSize: 13,
    color: colors.ink,
    fontWeight: '700',
  },
  catDistPct: {
    fontSize: 12,
    color: colors.ink3,
    fontWeight: '600',
    width: 32,
    textAlign: 'right',
  },
  catProgressBarTrack: {
    height: 6,
    backgroundColor: colors.chip,
    borderRadius: 3,
    marginTop: 6,
    overflow: 'hidden',
  },
  catProgressBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  catTasksBox: {
    marginTop: 8,
    backgroundColor: colors.chip,
    borderRadius: 10,
    padding: 10,
    gap: 6,
  },
  catTasksTitle: {
    fontSize: 11,
    color: colors.ink3,
    fontWeight: '700',
    marginBottom: 2,
    textTransform: 'uppercase',
  },
  catTaskRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 3,
  },
  catTaskName: {
    fontSize: 13,
    color: colors.ink,
    flex: 1,
    marginRight: 8,
  },
  catTaskDur: {
    fontSize: 12,
    color: colors.ink2,
    fontWeight: '600',
  },
  catDistFooter: {
    fontSize: 11,
    color: colors.ink3,
    marginTop: 12,
    lineHeight: 16,
  },

  // Habit Insights
  habitSubTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.ink2,
    marginBottom: 8,
  },
  // Habit Insights
  habitSubTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.ink2,
    marginBottom: 10,
  },
  goldenList: {
    gap: 10,
    marginBottom: 16,
  },
  goldenRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  goldenLeftCol: {
    width: 84,
  },
  goldenPeriodName: {
    fontSize: 13,
    color: colors.ink,
    fontWeight: '500',
  },
  goldenSpan: {
    fontSize: 11,
    color: colors.ink3,
    marginTop: 2,
  },
  goldenBarTrack: {
    flex: 1,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.chip,
    overflow: 'hidden',
  },
  goldenBarFill: {
    height: '100%',
    borderRadius: 5,
  },
  goldenDur: {
    width: 44,
    textAlign: 'right',
    fontSize: 13,
    color: colors.ink2,
    fontWeight: '500',
  },
  habitMetaRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
  },
  habitMetaCard: {
    flex: 1,
    backgroundColor: colors.chip,
    borderRadius: 14,
    padding: 12,
  },
  habitMetaVal: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.ink,
    marginBottom: 4,
  },
  habitMetaLabel: {
    fontSize: 11,
    color: colors.ink3,
  },
  smartSummaryCard: {
    backgroundColor: colors.primarySoft || (colors.primary + '12'),
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.primary + '30',
  },
  smartSummaryHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  smartSummaryHeadText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.primaryStrong,
  },
  smartSummaryText: {
    fontSize: 13,
    color: colors.ink,
    lineHeight: 18,
    fontWeight: '500',
  },

  // Focus Empty Card
  emptyCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 20,
    padding: 32,
    alignItems: 'center',
    gap: 12,
    marginTop: 8,
    ...shadow.card,
  },
  emptyCardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.ink,
    textAlign: 'center',
  },
  emptyCardDesc: {
    fontSize: 13,
    color: colors.ink2,
    textAlign: 'center',
    lineHeight: 18,
    maxWidth: 260,
  },
  emptyCatRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
    marginTop: 4,
  },
  emptyCatChip: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: colors.chip,
  },
  emptyCatChipText: {
    fontSize: 13,
    color: colors.ink2,
  },
  emptyActionBtn: {
    marginTop: 8,
    backgroundColor: colors.primary,
    paddingVertical: 12,
    paddingHorizontal: 36,
    borderRadius: 999,
    ...shadow.primary,
  },
  emptyActionBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
  },
  emptySwitchHint: {
    fontSize: 12,
    color: colors.ink3,
    textAlign: 'center',
    marginTop: 4,
  },

  quickSection: {
    marginBottom: 14,
  },
  quickHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 8,
    marginLeft: 4,
  },
  quickTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.ink2,
  },
  quickScroll: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 2,
  },
  quickChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.surface,
    paddingVertical: 7,
    paddingHorizontal: 11,
    borderRadius: 999,
    borderWidth: 1.2,
    borderColor: colors.line,
    ...shadow.sm,
  },
  quickChipActive: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
  },
  quickChipText: {
    fontSize: 12,
    color: colors.ink2,
    fontWeight: '600',
  },
  quickChipTextActive: {
    color: colors.primaryStrong,
  },
  quickChipDur: {
    fontSize: 11,
    color: colors.ink3,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  quickChipDurActive: {
    color: colors.primaryStrong,
  },

  card: {
    backgroundColor: colors.surface, borderRadius: radius.lg, padding: 16,
    marginBottom: 16, borderWidth: 1, borderColor: colors.line, ...shadow.card,
  },
  queryTitle: { fontSize: 13, color: colors.ink2, fontWeight: '700', marginBottom: 12 },
  queryRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  queryPlace: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 12,
    paddingVertical: 11,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: colors.line,
    ...shadow.sm,
  },
  queryPlaceText: { fontSize: 14.5, color: colors.ink, fontWeight: '700' },
  queryPlaceEmpty: { color: colors.ink3, fontWeight: '500' },
  swapBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.chip,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.line,
  },

  result: { marginTop: 16, borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 14 },
  routeHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  routeTitle: { fontSize: 18, color: colors.ink, fontWeight: '800', flex: 1 },
  arrow: { color: colors.primary, fontWeight: '800' },

  statRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  statMain: { flex: 1 },
  statSubCol: { alignItems: 'flex-end' },
  statLabel: { fontSize: 12, color: colors.ink3, marginBottom: 2 },
  statBig: { fontSize: 28, fontWeight: '800', color: colors.primaryStrong, letterSpacing: -1 },
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
    width: '100%', backgroundColor: colors.surface, borderRadius: 20, padding: 20,
    maxHeight: '80%',
  },
  dialogTitle: { fontSize: 18, fontWeight: '700', color: colors.ink, textAlign: 'center' },
  dialogSub: { fontSize: 13, color: colors.ink3, marginTop: 4, textAlign: 'center' },
  input: {
    marginTop: 14, borderWidth: 1.5, borderColor: colors.line2, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 10, fontSize: 15, color: colors.ink,
    backgroundColor: colors.chip,
  },
  dialogRow: { flexDirection: 'row', gap: 10, marginTop: 18 },
  dialogBtn: { flex: 1, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  dialogOk: { backgroundColor: colors.primary },
  dialogOkText: { fontSize: 15, color: '#fff', fontWeight: '700' },
  quickPlaceWrap: { marginTop: 12 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  quickChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8,
    backgroundColor: colors.chip, borderWidth: 1, borderColor: colors.line,
  },
  quickChipActive: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
  quickChipText: { fontSize: 12, color: colors.ink2, fontWeight: '500' },
  quickChipTextActive: { color: colors.primaryStrong, fontWeight: '700' },
  placeList: { height: 340, width: '100%', marginTop: 12 },
  placeOption: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 13, paddingHorizontal: 12, borderRadius: 12,
  },
  placeOptionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 8,
  },
  placeOptionActive: {
    backgroundColor: colors.primarySofter,
  },
  placeOptionText: { fontSize: 15, color: colors.ink, flex: 1 },
  placeOptionTextActive: { color: colors.primaryStrong, fontWeight: '700' },
  placeOptionDisabled: {
    opacity: 0.42,
  },
  placeOptionTextDisabled: {
    color: colors.ink3,
  },
  opposingTag: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: colors.line,
    marginLeft: 6,
  },
  opposingTagText: {
    fontSize: 10,
    color: colors.ink3,
    fontWeight: '600',
  },
  placeOptionCount: { fontSize: 12, color: colors.ink3 },
  dialogCancel: {
    backgroundColor: colors.chip,
  },
  dialogCancelText: { fontSize: 15, color: colors.ink2, fontWeight: '600' },
});
