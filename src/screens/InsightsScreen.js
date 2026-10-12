import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Modal, Alert, TextInput, BackHandler } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getRecords, clearAll, getRecordsFingerprint, updateFocusSession, getFocusSessions, updateRecord } from '../storage/store';
import { computePathStats, formatDuration, formatTime, isPlaceholderName, placeKey } from '../utils/stats';
import { getPlaceOptions, queryJourney, buildDurationHistogram, computeWeekTravelStats, findLatestTripForRoute, groupTrips, groupTripsByDate } from '../utils/analytics';
import { radius, shadow } from '../theme';
import { useTheme } from '../theme/ThemeContext';
import { useI18n } from '../i18n/LanguageContext';
import ModeIcon from '../components/ModeIcon';
import {
  FOCUS_CATEGORIES,
  UNCATEGORIZED,
  normalizeCategory,
  getCategoryMeta,
} from '../utils/focusCategories';
import BarChart from '../components/charts/BarChart';
import RouteMapScreen from './RouteMapScreen';
import TripReceiptModal from '../components/TripReceiptModal';
import TripDetailView from '../components/TripDetailView';

export default function InsightsScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { t, lang, formatDate } = useI18n();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const FOCUS_PRESETS_KEYS = ['pomodoro.helpWork', 'pomodoro.helpStudy', 'pomodoro.helpCreate', 'pomodoro.helpBodyMind', 'pomodoro.helpLife', 'pomodoro.helpPlan'];

  const [records, setRecords] = useState([]);
  const [focusSessions, setFocusSessions] = useState([]);
  const [placeOptions, setPlaceOptions] = useState([]);
  const [paths, setPaths] = useState([]);
  const [fromKey, setFromKey] = useState(null);
  const [toKey, setToKey] = useState(null);
  const [pickerFor, setPickerFor] = useState(null); // 'from' | 'to' | null
  const [result, setResult] = useState(null);
  const [view, setView] = useState('travel'); // 'travel' | 'focus'
  const [travelRange, setTravelRange] = useState('7d'); // '7d' | '30d' | 'all'
  const [showRangeModal, setShowRangeModal] = useState(false);
  const [focusRange, setFocusRange] = useState('week'); // 'today' | 'week' | 'month' | 'all'
  const [selectedBarIndex, setSelectedBarIndex] = useState(null);
  const [selectedBar, setSelectedBar] = useState(null);

  const rangeLabel = useMemo(() => {
    if (travelRange === '30d') return t('insights.range30Days');
    if (travelRange === 'all') return t('insights.rangeAll');
    return t('insights.range7Days');
  }, [travelRange, t]);
  const [expandedCats, setExpandedCats] = useState({});
  const [mapTrip, setMapTrip] = useState(null); // 当前查看地图的行程
  const [receiptTrip, setReceiptTrip] = useState(null); // 当前查看小票的行程
  const [detailTrip, setDetailTrip] = useState(null); // 当前查看详情的行程
  const [renameTarget, setRenameTarget] = useState(null);
  const [draftName, setDraftName] = useState('');
  const lastFingerprintRef = useRef(null);

  useEffect(() => {
    if (!detailTrip) return;
    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
      setDetailTrip(null);
      return true;
    });
    return () => backHandler.remove();
  }, [detailTrip]);

  const loadData = useCallback(async () => {
    const fp = await getRecordsFingerprint();
    if (lastFingerprintRef.current === fp) return;
    lastFingerprintRef.current = fp;
    const [travel, focus] = await Promise.all([getRecords(), getFocusSessions()]);
    setRecords(travel);
    setFocusSessions(focus);
    setPlaceOptions(getPlaceOptions(travel));
    const computedPaths = computePathStats(travel);
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

  const [selectedRouteIdx, setSelectedRouteIdx] = useState(0);

  const discoveredRoutes = useMemo(() => {
    return paths.filter(p => p.fromKey !== p.toKey);
  }, [paths]);

  useEffect(() => {
    if (discoveredRoutes.length > 0) {
      const idx = Math.min(selectedRouteIdx, discoveredRoutes.length - 1);
      const r = discoveredRoutes[idx];
      if (r) {
        setFromKey(r.fromKey);
        setToKey(r.toKey);
      }
    } else {
      setFromKey(null);
      setToKey(null);
    }
  }, [discoveredRoutes, selectedRouteIdx]);

  const weekTravelStats = useMemo(() => {
    return computeWeekTravelStats(travelRecords, lang);
  }, [travelRecords, lang]);

  const handleViewLatestTrip = useCallback(() => {
    if (!fromKey || !toKey) return;
    const latest = findLatestTripForRoute(travelRecords, fromKey, toKey);
    if (latest) {
      setDetailTrip(latest);
    } else {
      Alert.alert(t('insights.noData'), t('insights.noDataHint'));
    }
  }, [travelRecords, fromKey, toKey, t]);

  const PLACE_PRESETS = ['家', '公司', '健身房', '学校', '商场', '地铁站'];
  const TRIP_MODES = ['all', 'walk', 'bike', 'drive', 'taxi', 'subway', 'transit', 'train', 'flight', 'boat'];

  const [searchQuery, setSearchQuery] = useState('');
  const [modeFilter, setModeFilter] = useState('all');
  const [namingRecord, setNamingRecord] = useState(null);
  const [placeDraftName, setPlaceDraftName] = useState('');

  const handleStartRename = useCallback((rec) => {
    if (!rec) return;
    setNamingRecord(rec);
    setPlaceDraftName(isPlaceholderName(rec.locationName) ? '' : (rec.locationName || ''));
  }, []);

  const confirmRenamePlace = useCallback(async () => {
    if (!namingRecord) return;
    const name = placeDraftName.trim();
    if (!name) {
      Alert.alert(t('common.tip', '提示'), t('home.renameEmpty', '地名不能为空'));
      return;
    }
    await updateRecord(namingRecord.id, { locationName: name });
    setNamingRecord(null);
    setPlaceDraftName('');
    lastFingerprintRef.current = null;
    await loadData();
  }, [namingRecord, placeDraftName, t, loadData]);

  const unnamedRecords = useMemo(() => {
    return travelRecords.filter(r => isPlaceholderName(r.locationName));
  }, [travelRecords]);

  const allTrips = useMemo(() => groupTrips(travelRecords), [travelRecords]);

  const currentDetailTrip = useMemo(() => {
    if (!detailTrip) return null;
    const found = allTrips.find(tr => tr.tripId === detailTrip.tripId);
    return found || detailTrip;
  }, [detailTrip, allTrips]);

  const filteredTrips = useMemo(() => {
    let list = allTrips;
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      list = list.filter(t =>
        t.route.some(nm => (nm || '').toLowerCase().includes(q)) ||
        t.records.some(r => (r.locationName || '').toLowerCase().includes(q))
      );
    }
    if (modeFilter && modeFilter !== 'all') {
      list = list.filter(t => t.mode === modeFilter || t.records.some(r => (r.mode || 'walk') === modeFilter));
    }
    return list;
  }, [allTrips, searchQuery, modeFilter]);

  const dateGroupedTrips = useMemo(() => {
    return groupTripsByDate(filteredTrips);
  }, [filteredTrips]);

  const isDiscoveredTrip = useCallback((trip) => {
    if (!trip || trip.route.length < 2) return false;
    const first = trip.records[0];
    const last = trip.records[trip.records.length - 1];
    const fk = placeKey(first);
    const tk = placeKey(last);
    return discoveredRoutes.some(dr => dr.fromKey === fk && dr.toKey === tk);
  }, [discoveredRoutes]);

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
          setFocusSessions([]);
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
  // 行程域记录：专注记录不属于行程，总览看板与下面的历史列表都只看各自域
  const travelRecords = useMemo(() => records, [records]);
  const noData = travelRecords.length === 0;

  // 结果派生
  const hist = result ? buildDurationHistogram(result.durations) : null;
  const histLabels = hist ? [...new Set([0, hist.highlight, hist.labels.length - 1])].map(i => ({ index: i, text: `${hist.labels[i]}` })) : [];
  const peakHour = result && result.hourDist.length ? result.hourDist.indexOf(Math.max(...result.hourDist)) : 0;
  const weeklyData = result ? result.weeklyTrend.map(v => v ?? 0) : [];
  const delta = result && result.weeklyTrend[7] != null && result.weeklyTrend[6] != null
    ? result.weeklyTrend[7] - result.weeklyTrend[6] : null;
  const breakdown = result && result.breakdown.length > 1 ? result.breakdown : null;

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
  const allFocusRecords = useMemo(() => focusSessions, [focusSessions]);

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
      const normalizedKey = r.category
        ? normalizeCategory(r.category)
        : null;
      const matchedKey = normalizedKey || UNCATEGORIZED.key;
      const taskName = (r.goalName || r.locationName || '').trim() || t('home.unnamedFocus');
      const dur = Number(r.duration) || 0;
      totalSec += dur;

      if (!catMap[matchedKey]) {
        const meta = getCategoryMeta(matchedKey, t);
        catMap[matchedKey] = {
          key: matchedKey,
          name: meta.name,
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
  }, [focusRecords, t]);

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
      const allFocus = await getFocusSessions();
      const focusName = (r) => (r.goalName || r.locationName || '').trim() || t('home.unnamedFocus');
      const toUpdate = allFocus.filter(r => focusName(r) === renameTarget);
      for (const r of toUpdate) {
        await updateFocusSession(r.id, { goalName: newName });
      }
      setFocusSessions(await getFocusSessions());
    }
    setRenameTarget(null);
  };

  const renderPlaceRenameModal = () => (
    <Modal visible={!!namingRecord} transparent animationType="fade" onRequestClose={() => setNamingRecord(null)}>
      <View style={styles.overlay}>
        <View style={styles.dialog}>
          <Text style={styles.dialogTitle}>{t('insights.renamePlaceTitle')}</Text>
          <TextInput
            style={styles.input}
            value={placeDraftName}
            onChangeText={setPlaceDraftName}
            placeholder={t('insights.renamePlacePlaceholder')}
            placeholderTextColor={colors.ink3}
            autoFocus
            returnKeyType="done"
            onSubmitEditing={confirmRenamePlace}
          />
          <View style={styles.quickPlaceWrap}>
            <View style={styles.chipRow}>
              {PLACE_PRESETS.map((p, pIdx) => {
                const isSelected = placeDraftName === p;
                return (
                  <TouchableOpacity
                    key={'place-preset-' + pIdx}
                    style={[styles.quickChip, isSelected && styles.quickChipActive]}
                    onPress={() => setPlaceDraftName(p)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.quickChipText, isSelected && styles.quickChipTextActive]}>
                      {p}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
          <View style={styles.dialogRow}>
            <TouchableOpacity style={[styles.dialogBtn, styles.dialogCancel]} onPress={() => setNamingRecord(null)}>
              <Text style={styles.dialogCancelText}>{t('common.cancel')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.dialogBtn, styles.dialogOk]} onPress={confirmRenamePlace}>
              <Text style={styles.dialogOkText}>{t('common.save')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );

  if (currentDetailTrip) {
    return (
      <View style={styles.detailScreen}>
        <TripDetailView
          trip={currentDetailTrip}
          allTrips={allTrips}
          discoveredRoutes={discoveredRoutes}
          onClose={() => setDetailTrip(null)}
          onRenameStop={handleStartRename}
          onShowMap={(tr) => setMapTrip(tr)}
          onShowReceipt={(tr) => setReceiptTrip(tr)}
        />

        {/* 线路轨迹地图（全屏） */}
        <RouteMapScreen visible={mapTrip != null} tripRecords={mapTrip?.records || []} onClose={() => setMapTrip(null)} />

        {/* 行程小票卡片（弹窗） */}
        <TripReceiptModal visible={receiptTrip != null} trip={receiptTrip} onClose={() => setReceiptTrip(null)} />

        {/* 给未命名地点命名弹窗 */}
        {renderPlaceRenameModal()}
      </View>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={[styles.headerRow, { paddingTop: insets.top + 4 }]}>
        <View style={styles.headerTextWrap}>
          <Text style={styles.title}>{t('insights.title')}</Text>
          <Text style={styles.subtitle}>{t('insights.subtitle')}</Text>
        </View>
        <TouchableOpacity
          style={styles.pillBtn}
          onPress={() => setShowRangeModal(true)}
          activeOpacity={0.7}
          accessibilityRole="button"
        >
          <Text style={styles.pillBtnText}>{rangeLabel}</Text>
          <Ionicons name="chevron-down" size={14} color={colors.ink} />
        </TouchableOpacity>
      </View>

      {/* 顶部 Tab 切换（专注 / 行程） */}
      <View style={styles.tabsContainer}>
        <TouchableOpacity
          style={[styles.tabButton, view === 'focus' && styles.tabButtonActive]}
          onPress={() => setView('focus')}
          activeOpacity={0.8}
        >
          <Text style={[styles.tabButtonText, view === 'focus' && styles.tabButtonTextActive]}>
            {t('insights.tabFocus')}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabButton, view === 'travel' && styles.tabButtonActive]}
          onPress={() => setView('travel')}
          activeOpacity={0.8}
        >
          <Text style={[styles.tabButtonText, view === 'travel' && styles.tabButtonTextActive]}>
            {t('insights.tabTravel')}
          </Text>
        </TouchableOpacity>
      </View>

      {view === 'focus' ? (
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
                        <Text style={styles.emptyCatChipText}>{t(c.i18nKey)}</Text>
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
              {/* 出行总览三个统计指标卡片 */}
              <View style={styles.statsGrid}>
                <View style={styles.statCard}>
                  <Text style={styles.statNum}>{travelRecords.length}</Text>
                  <Text style={styles.statLabel}>{t('insights.totalRecords')}</Text>
                </View>
                <View style={styles.statCard}>
                  <Text style={styles.statNum}>{placeOptions.length}</Text>
                  <Text style={styles.statLabel}>{t('insights.totalPlaces')}</Text>
                </View>
                <View style={styles.statCard}>
                  <Text style={[styles.statNum, { color: colors.primaryStrong }]}>{paths.length}</Text>
                  <Text style={styles.statLabel}>{t('insights.totalPaths')}</Text>
                </View>
              </View>

          {/* 近 7 天出行卡片 */}
          <View style={styles.card}>
            <View style={styles.cardHeaderRow}>
              <Text style={styles.cardTitle}>{t('insights.recent7Days')}</Text>
              <Text style={styles.cardSubText}>
                {t('insights.totalTime')} <Text style={styles.cardSubBold}>{formatDuration(weekTravelStats.totalMins * 60, lang)}</Text>
              </Text>
            </View>

            {/* 7 天柱状图 */}
            <View style={styles.weekChartRow}>
              {weekTravelStats.days.map((d, i) => {
                const maxMins = Math.max(...weekTravelStats.days.map(x => x.mins), 48);
                const barH = d.mins > 0 ? Math.max(6, Math.round((d.mins / maxMins) * 52)) : 3;
                const barBg = d.mins === 0 ? colors.chip : (d.isToday ? colors.primaryStrong : '#F2A39B');
                return (
                  <View key={`day-${i}`} style={styles.weekCol}>
                    <View style={styles.weekBarWrap}>
                      <Text style={[styles.weekBarMins, d.isToday && { color: colors.primaryStrong, fontWeight: '700' }]}>
                        {d.mins > 0 ? d.mins : ''}
                      </Text>
                      <View style={[styles.weekBarFill, { height: barH, backgroundColor: barBg }]} />
                    </View>
                    <Text style={[styles.weekDayLabel, d.isToday && styles.weekDayLabelToday]}>
                      {d.label}
                    </Text>
                  </View>
                );
              })}
            </View>

            {/* 出行方式占比条与图例 */}
            {weekTravelStats.shares.length > 0 && (
              <View style={styles.shareBlock}>
                <View style={styles.shareBarRow}>
                  {weekTravelStats.shares.map((s, idx) => (
                    <View
                      key={`share-${idx}`}
                      style={[styles.shareBarSeg, { flex: Math.max(s.pct, 2), backgroundColor: s.color }]}
                    />
                  ))}
                </View>
                <View style={styles.legendRow}>
                  {weekTravelStats.shares.map((s, idx) => (
                    <View key={`legend-${idx}`} style={styles.legendItem}>
                      <View style={[styles.legendDot, { backgroundColor: s.color }]} />
                      <Text style={styles.legendText}>
                        {t('mode.' + s.mode, s.mode)} {s.pct}%
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            )}
          </View>

          {/* 路线洞察卡片 */}
          <View style={styles.card}>
            <View style={styles.cardHeaderRow}>
              <Text style={styles.cardTitle}>{t('insights.routeInsights')}</Text>
              {result && (
                <TouchableOpacity
                  style={styles.linkBtn}
                  onPress={handleViewLatestTrip}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={styles.linkBtnText}>{t('insights.viewLatest')}</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* 顶部已发现路线 chips 横向切换 */}
            {discoveredRoutes.length > 0 ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.routeChipsRow}
              >
                {discoveredRoutes.map((r, i) => {
                  const isCur = i === selectedRouteIdx;
                  return (
                    <TouchableOpacity
                      key={`route-chip-${i}`}
                      style={[styles.routeChip, isCur && styles.routeChipActive]}
                      onPress={() => setSelectedRouteIdx(i)}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.routeChipName, isCur && styles.routeChipNameActive]} numberOfLines={1}>
                        {r.fromName} → {r.toName}
                      </Text>
                      <Text style={[styles.routeChipMode, isCur && styles.routeChipModeActive]}>
                        {t('mode.' + (r.mode || 'walk'), r.mode)}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            ) : (
              <View style={styles.emptyCardBox}>
                <Text style={styles.emptyCardTitle}>{t('insights.noRoutesDiscovered')}</Text>
                <Text style={styles.emptyCardHint}>{t('insights.noRoutesHint')}</Text>
              </View>
            )}

            {/* 选中路线详情 */}
            {result && (
              <View style={styles.routeBody}>
                {/* 耗时与指标概览 */}
                <View style={styles.routeStatRow}>
                  <View style={styles.routeStatLeft}>
                    <Text style={styles.routeStatLabel}>
                      {result.sampleCount < 2 ? t('insights.refDuration') : t('insights.typicalDuration')}
                    </Text>
                    {result.sampleCount >= 2 ? (
                      <View style={styles.routeBigRow}>
                        <Text style={styles.routeBigNum}>{Math.round(result.medianSec / 60)}</Text>
                        <Text style={styles.routeBigUnit}>{t('insights.min')}</Text>
                      </View>
                    ) : (
                      <View style={styles.routeBigRow}>
                        <Text style={[styles.routeBigNum, { color: colors.ink2 }]}>
                          {Math.round(result.medianSec / 60)}
                        </Text>
                        <Text style={[styles.routeBigUnit, { color: colors.ink2 }]}>{t('insights.min')}</Text>
                      </View>
                    )}
                    <Text style={styles.routeTransferText}>
                      {breakdown && breakdown.length > 1
                        ? t('insights.transfers', { n: breakdown.length - 1 })
                        : t('insights.journeyNote')}
                    </Text>
                  </View>

                  <View style={styles.routeStatRight}>
                    <Text style={styles.routeMetaText}>
                      {t('insights.fluctuation')}{' '}
                      <Text style={styles.routeMetaBold}>
                        {Math.round(result.p25Sec / 60)} – {Math.round(result.p75Sec / 60)} {t('insights.min')}
                      </Text>
                    </Text>
                    <Text style={styles.routeMetaText}>
                      {t('insights.samplesCount')}{' '}
                      <Text style={styles.routeMetaBold}>{result.sampleCount} 次</Text>
                    </Text>
                    <Text style={styles.routeMetaText}>
                      {t('insights.typicalDeparture')}{' '}
                      <Text style={styles.routeMetaBold}>{peakHour} 时</Text>
                    </Text>
                  </View>
                </View>

                {/* 趋势与样本不足提示 */}
                {result.sampleCount < 2 && (
                  <View style={styles.tipGray}>
                    <Text style={styles.tipGrayText}>{t('insights.insufficientSamples')}</Text>
                  </View>
                )}

                {delta != null && delta !== 0 && (
                  <View style={styles.tipSoft}>
                    <Text style={styles.tipSoftText}>
                      {delta < 0
                        ? `最近一次比上周快 ${Math.abs(delta)} 分钟，耗时在慢慢变短。`
                        : `最近一次比上周慢 ${delta} 分钟。`}
                    </Text>
                  </View>
                )}

                {/* 图表 1: 耗时分布（分钟） */}
                {hist && (
                  <View style={styles.chartBlock}>
                    <Text style={styles.chartTitle}>{t('insights.durationDistTitle')}</Text>
                    <BarChart
                      data={hist.counts}
                      highlightIndex={hist.highlight}
                      height={90}
                      xLabels={histLabels}
                      valueLabel={`${Math.round(result.medianSec / 60)}${t('insights.min')}`}
                    />
                  </View>
                )}

                {/* 图表 2: 通常出发时段 (0-24时) */}
                <View style={styles.chartBlock}>
                  <Text style={styles.chartTitle}>{t('insights.departureDistTitle')}</Text>
                  <BarChart
                    data={result.hourDist}
                    highlightIndex={peakHour}
                    height={85}
                    xLabels={[
                      { index: 0, text: '0' },
                      { index: 6, text: '6' },
                      { index: 12, text: '12' },
                      { index: 18, text: '18' },
                      { index: 23, text: '24时' },
                    ]}
                    valueLabel={`${peakHour}${t('insights.hourUnit')}`}
                  />
                </View>

                {/* 图表 3: 近 8 周趋势 */}
                <View style={styles.chartBlock}>
                  <View style={styles.chartTitleRow}>
                    <Text style={styles.chartTitle}>{t('insights.weeklyTrendTitle')}</Text>
                    {delta != null && delta !== 0 && (
                      <Text style={[styles.delta, { color: delta < 0 ? colors.success : colors.danger }]}>
                        {delta < 0 ? '↓' : '↑'} {Math.abs(delta)} {t('insights.min')}
                      </Text>
                    )}
                  </View>
                  <BarChart
                    data={weeklyData}
                    highlightIndex={7}
                    height={85}
                    xLabels={[
                      { index: 0, text: t('insights.weekAgo') },
                      { index: 7, text: t('insights.thisWeek') },
                    ]}
                  />
                </View>
              </View>
            )}
          </View>

          {/* 6. 未命名地点提示条 */}
          {unnamedRecords.length > 0 && (
            <View style={styles.banner}>
              <View style={styles.bannerTextCol}>
                <Text style={styles.bannerTitle}>
                  {t('insights.unnamedBannerTitle', { n: unnamedRecords.length })}
                </Text>
                <Text style={styles.bannerHint}>
                  {t('insights.unnamedBannerHint')}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.bannerBtn}
                onPress={() => handleStartRename(unnamedRecords[0])}
                activeOpacity={0.8}
              >
                <Text style={styles.bannerBtnText}>{t('insights.goName')}</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* 7. 出行记录模块 */}
          <View style={styles.historySection}>
            <View style={styles.historyHeaderRow}>
              <Text style={styles.historySectionTitle}>{t('insights.tripRecords')}</Text>
              <Text style={styles.historyCountText}>{t('insights.recordsCount', { n: filteredTrips.length })}</Text>
            </View>

            {/* 地名搜索框 */}
            <View style={styles.searchBox}>
              <Ionicons name="search" size={18} color={colors.ink2} />
              <TextInput
                style={styles.searchInput}
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder={t('history.searchPlaceholder', '搜索地名')}
                placeholderTextColor={colors.ink3}
                returnKeyType="search"
              />
              {searchQuery ? (
                <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="close-circle" size={16} color={colors.ink3} />
                </TouchableOpacity>
              ) : null}
            </View>

            {/* 交通方式筛选 chips */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.modeChipsRow}>
              {TRIP_MODES.map((m) => {
                const isCur = modeFilter === m;
                const label = m === 'all' ? t('history.all') : t('mode.' + m, m);
                return (
                  <TouchableOpacity
                    key={`mode-filter-${m}`}
                    style={[styles.modeChip, isCur && styles.modeChipActive]}
                    onPress={() => setModeFilter(m)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.modeChipText, isCur && styles.modeChipTextActive]}>
                      {label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* 按日期分组的出行列表 */}
            {dateGroupedTrips.length === 0 ? (
              <View style={styles.emptyListBox}>
                <Text style={styles.emptyListText}>
                  {modeFilter !== 'all'
                    ? t('insights.noModeMatch')
                    : searchQuery
                    ? t('history.noMatch')
                    : t('history.empty')}
                </Text>
              </View>
            ) : (
              <View style={styles.daysListContainer}>
                {dateGroupedTrips.map(({ ts, list }) => {
                  const dayTotalSec = Math.round(list.reduce((sum, t) => sum + (t.durationMs > 0 ? t.durationMs : 0), 0) / 1000);
                  const daySummary = dayTotalSec > 0
                    ? t('insights.timesDuration', { n: list.length, d: formatDuration(dayTotalSec, lang) })
                    : t('insights.timesCount', { n: list.length });

                  return (
                    <View key={`day-group-${ts}`} style={styles.dayGroup}>
                      <View style={styles.dayGroupHeader}>
                        <Text style={styles.dayGroupTitle}>{formatDate(new Date(ts))}</Text>
                        <Text style={styles.dayGroupSummary}>{daySummary}</Text>
                      </View>

                      <View style={styles.dayCardsList}>
                        {list.map((trip, tripIdx) => {
                          const isDiscovered = isDiscoveredTrip(trip);
                          const from = trip.route[0] || (isPlaceholderName(trip.records[0]?.locationName) ? t('common.unnamed') : trip.records[0]?.locationName);
                          const to = trip.route[trip.route.length - 1];
                          const tripTitle = trip.route.length > 1 ? `${from} → ${to}` : from;
                          const hasDuration = trip.durationMs > 0;
                          const isUnnamedSingle = !hasDuration && trip.records.length === 1 && isPlaceholderName(trip.records[0]?.locationName);
                          const canOpenDetail = trip.records.length > 1;

                          return (
                            <TouchableOpacity
                              key={trip.tripId || `trip-${tripIdx}`}
                              style={[styles.tripItem, tripIdx > 0 && styles.tripItemBorder]}
                              onPress={() => {
                                if (canOpenDetail) {
                                  setDetailTrip(trip);
                                }
                              }}
                              activeOpacity={canOpenDetail ? 0.7 : 1}
                            >
                              <View style={styles.tripIconBox}>
                                <ModeIcon mode={trip.mode} size={18} color={colors.primaryStrong} />
                              </View>

                              <View style={styles.tripMid}>
                                <View style={styles.tripTitleRow}>
                                  <Text style={styles.tripTitleText} numberOfLines={1}>
                                    {tripTitle}
                                  </Text>
                                  {isDiscovered && (
                                    <View style={styles.badgeDiscovered}>
                                      <Text style={styles.badgeDiscoveredText}>
                                        {t('insights.discoveredRouteBadge')}
                                      </Text>
                                    </View>
                                  )}
                                </View>
                                <Text style={styles.tripMetaLine}>
                                  {formatTime(trip.startTs)} · {t('history.stops', { n: trip.records.length })}
                                </Text>
                              </View>

                              <View style={styles.tripRightCol}>
                                {hasDuration ? (
                                  <>
                                    <Text style={styles.tripDurBig}>
                                      {formatDuration(Math.round(trip.durationMs / 1000), lang)}
                                    </Text>
                                    {trip.records.length > 2 && (
                                      <Text style={styles.tripViaSmall}>
                                        {t('history.via', { n: trip.records.length - 2 })}
                                      </Text>
                                    )}
                                  </>
                                ) : isUnnamedSingle ? (
                                  <TouchableOpacity
                                    style={styles.nameBtn}
                                    onPress={() => handleStartRename(trip.records[0])}
                                    activeOpacity={0.7}
                                  >
                                    <Text style={styles.nameBtnText}>{t('insights.nameBtn')}</Text>
                                  </TouchableOpacity>
                                ) : (
                                  <Text style={styles.dashText}>—</Text>
                                )}
                              </View>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
          </View>

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

      {/* 时间范围选择弹窗 */}
      <Modal visible={showRangeModal} transparent animationType="fade" onRequestClose={() => setShowRangeModal(false)}>
        <TouchableOpacity
          style={styles.rangeOverlay}
          activeOpacity={1}
          onPress={() => setShowRangeModal(false)}
        >
          <View style={styles.rangeDialog}>
            <Text style={styles.rangeDialogTitle}>{t('insights.timeRange')}</Text>
            {[
              { key: '7d', label: t('insights.range7Days') },
              { key: '30d', label: t('insights.range30Days') },
              { key: 'all', label: t('insights.rangeAll') },
            ].map(opt => {
              const isSelected = travelRange === opt.key;
              return (
                <TouchableOpacity
                  key={opt.key}
                  style={[styles.rangeOption, isSelected && styles.rangeOptionActive]}
                  onPress={() => {
                    setTravelRange(opt.key);
                    setShowRangeModal(false);
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.rangeOptionText, isSelected && styles.rangeOptionTextActive]}>
                    {opt.label}
                  </Text>
                  {isSelected && <Ionicons name="checkmark" size={18} color={colors.primaryStrong} />}
                </TouchableOpacity>
              );
            })}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* 给未命名地点命名弹窗 */}
      {renderPlaceRenameModal()}
    </ScrollView>
  );
}

const makeStyles = (colors) => StyleSheet.create({
  detailScreen: { flex: 1, backgroundColor: colors.bg },
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, paddingBottom: 40 },

  banner: {
    backgroundColor: colors.primarySoft,
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 16,
  },
  bannerTextCol: {
    flex: 1,
  },
  bannerTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.ink,
  },
  bannerHint: {
    fontSize: 12,
    color: colors.ink2,
    marginTop: 2,
    lineHeight: 16,
  },
  bannerBtn: {
    minHeight: 44,
    paddingHorizontal: 16,
    borderRadius: 22,
    backgroundColor: colors.primaryStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bannerBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },

  historySection: {
    marginTop: 4,
    marginBottom: 16,
  },
  historyHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 10,
    paddingHorizontal: 2,
  },
  historySectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.ink,
  },
  historyCountText: {
    fontSize: 12,
    color: colors.ink2,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 44,
    paddingHorizontal: 14,
    backgroundColor: colors.surface,
    borderRadius: 22,
    ...shadow.sm,
    borderWidth: 1,
    borderColor: colors.line,
    marginBottom: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: colors.ink,
    paddingVertical: 0,
  },
  modeChipsRow: {
    flexDirection: 'row',
    gap: 8,
    paddingBottom: 4,
    marginBottom: 14,
  },
  modeChip: {
    minHeight: 44,
    paddingHorizontal: 16,
    borderRadius: 22,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: '#EADFD7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modeChipActive: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primaryStrong,
  },
  modeChipText: {
    fontSize: 13,
    color: colors.ink,
    fontWeight: '500',
  },
  modeChipTextActive: {
    color: colors.primaryStrong,
    fontWeight: '700',
  },
  emptyListBox: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    paddingVertical: 28,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.sm,
    borderWidth: 1,
    borderColor: colors.line,
  },
  emptyListText: {
    fontSize: 13,
    color: colors.ink2,
    textAlign: 'center',
  },
  daysListContainer: {
    gap: 14,
  },
  dayGroup: {
    gap: 8,
  },
  dayGroupHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    paddingHorizontal: 4,
  },
  dayGroupTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.ink,
  },
  dayGroupSummary: {
    fontSize: 12,
    color: colors.ink2,
  },
  dayCardsList: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    ...shadow.card,
    borderWidth: 1,
    borderColor: colors.line,
    overflow: 'hidden',
  },
  tripItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    minHeight: 56,
  },
  tripItemBorder: {
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  tripIconBox: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FDEDEA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tripMid: {
    flex: 1,
    minWidth: 0,
  },
  tripTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  tripTitleText: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.ink,
    maxWidth: '80%',
  },
  badgeDiscovered: {
    backgroundColor: '#FDEDEA',
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 1,
    marginLeft: 6,
  },
  badgeDiscoveredText: {
    fontSize: 11,
    color: colors.primaryStrong,
    fontWeight: '600',
  },
  tripMetaLine: {
    fontSize: 12,
    color: colors.ink2,
    marginTop: 3,
  },
  tripRightCol: {
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  tripDurBig: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.primaryStrong,
  },
  tripViaSmall: {
    fontSize: 11,
    color: colors.ink2,
    marginTop: 2,
  },
  nameBtn: {
    minHeight: 44,
    paddingHorizontal: 12,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#F0C9C5',
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nameBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.primaryStrong,
  },
  dashText: {
    fontSize: 15,
    color: colors.ink3,
  },

  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 14,
  },
  headerTextWrap: {
    flex: 1,
    paddingRight: 10,
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    color: colors.ink,
    letterSpacing: -0.5,
    lineHeight: 32,
  },
  subtitle: {
    fontSize: 13,
    color: colors.ink2,
    marginTop: 4,
  },
  pillBtn: {
    minHeight: 44,
    paddingHorizontal: 12,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#EADFD7',
    backgroundColor: colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    ...shadow.sm,
  },
  pillBtnText: {
    fontSize: 13,
    color: colors.ink,
    fontWeight: '600',
  },

  tabsContainer: {
    flexDirection: 'row',
    gap: 4,
    padding: 4,
    backgroundColor: colors.chip,
    borderRadius: 16,
    marginBottom: 14,
  },
  tabButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  tabButtonActive: {
    backgroundColor: colors.surface,
    ...shadow.sm,
  },
  tabButtonText: {
    fontSize: 14,
    color: colors.ink2,
    fontWeight: '600',
  },
  tabButtonTextActive: {
    color: colors.primaryStrong,
    fontWeight: '700',
  },

  statsGrid: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
  },
  statCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.line,
    ...shadow.card,
  },
  statNum: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.ink,
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.5,
  },
  statLabel: {
    fontSize: 12,
    color: colors.ink2,
    marginTop: 4,
    fontWeight: '500',
  },

  rangeOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  rangeDialog: {
    width: '100%',
    maxWidth: 320,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: 16,
    ...shadow.float,
  },
  rangeDialogTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.ink,
    marginBottom: 12,
    textAlign: 'center',
  },
  rangeOption: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: colors.chip,
    marginBottom: 8,
  },
  rangeOptionActive: {
    backgroundColor: colors.primarySoft,
  },
  rangeOptionText: {
    fontSize: 14,
    color: colors.ink,
    fontWeight: '500',
  },
  rangeOptionTextActive: {
    color: colors.primaryStrong,
    fontWeight: '700',
  },

  header: { paddingHorizontal: 4, marginBottom: 16 },
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
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: 16,
    marginBottom: 14,
    ...shadow.card,
    borderWidth: 1,
    borderColor: colors.line,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.ink,
  },
  cardSubText: {
    fontSize: 12,
    color: colors.ink2,
  },
  cardSubBold: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.ink,
  },
  linkBtn: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  linkBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.primaryStrong,
  },

  weekChartRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 12,
  },
  weekCol: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
  },
  weekBarWrap: {
    height: 76,
    width: '100%',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 3,
  },
  weekBarMins: {
    fontSize: 10,
    color: colors.ink2,
    fontVariant: ['tabular-nums'],
    height: 14,
  },
  weekBarFill: {
    width: '100%',
    maxWidth: 24,
    borderRadius: 6,
  },
  weekDayLabel: {
    fontSize: 11,
    color: colors.ink2,
  },
  weekDayLabelToday: {
    color: colors.primaryStrong,
    fontWeight: '700',
  },

  shareBlock: {
    marginTop: 4,
    gap: 10,
  },
  shareBarRow: {
    flexDirection: 'row',
    height: 10,
    borderRadius: 5,
    overflow: 'hidden',
    gap: 3,
  },
  shareBarSeg: {
    height: 10,
    borderRadius: 5,
  },
  legendRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  legendDot: {
    width: 9,
    height: 9,
    borderRadius: 3,
  },
  legendText: {
    fontSize: 12,
    color: colors.ink,
  },

  routeChipsRow: {
    flexDirection: 'row',
    gap: 8,
    paddingBottom: 4,
    marginBottom: 12,
  },
  routeChip: {
    minHeight: 44,
    paddingVertical: 4,
    paddingHorizontal: 14,
    borderRadius: 22,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: '#EADFD7',
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  routeChipActive: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primaryStrong,
  },
  routeChipName: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.ink,
  },
  routeChipNameActive: {
    color: colors.primaryStrong,
  },
  routeChipMode: {
    fontSize: 11,
    color: colors.ink2,
    marginTop: 1,
  },
  routeChipModeActive: {
    color: colors.primaryStrong,
    opacity: 0.9,
  },

  routeBody: {
    gap: 14,
  },
  routeStatRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  routeStatLeft: {
    flex: 1,
  },
  routeStatLabel: {
    fontSize: 12,
    color: colors.ink2,
  },
  routeBigRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
    marginVertical: 2,
  },
  routeBigNum: {
    fontSize: 44,
    fontWeight: '800',
    color: colors.primaryStrong,
    lineHeight: 48,
    fontVariant: ['tabular-nums'],
  },
  routeBigUnit: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.primaryStrong,
  },
  routeTransferText: {
    fontSize: 12,
    color: colors.ink2,
  },
  routeStatRight: {
    alignItems: 'flex-end',
    gap: 4,
  },
  routeMetaText: {
    fontSize: 12,
    color: colors.ink2,
    lineHeight: 18,
  },
  routeMetaBold: {
    color: colors.ink,
    fontWeight: '700',
  },
  tipGray: {
    backgroundColor: colors.chip,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  tipGrayText: {
    fontSize: 13,
    color: colors.ink2,
    lineHeight: 18,
  },
  tipSoft: {
    backgroundColor: colors.primarySoft,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  tipSoftText: {
    fontSize: 13,
    color: colors.primaryStrong,
    lineHeight: 18,
  },

  chartBlock: { marginTop: 8 },
  chartTitleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  chartTitle: { fontSize: 12, color: colors.ink2, fontWeight: '700', marginBottom: 8 },
  delta: { fontSize: 13, fontWeight: '800', marginBottom: 8 },

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
