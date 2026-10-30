import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Alert,
  Modal,
  TextInput,
  TouchableOpacity,
  Pressable,
  Linking,
  ActivityIndicator,
  Vibration,
  AppState,
  Animated,
  Easing,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle } from 'react-native-svg';
import * as Location from 'expo-location';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  saveRecord,
  getRecords,
  getTodayRecords,
  getRecordById,
  updateRecord,
  deleteRecord,
  ensureTrip,
  endTrip,
  getCurrentTripId,
  getTrips,
  updateTripName,
  setCurrentTripId,
  getLastMode,
  setLastMode,
  getRecordsFingerprint,
  saveFocusSession,
  getFocusSessions,
  getTodayFocusSessions,
  updateFocusSession,
  deleteFocusSession,
  syncWidgetFocusStats,
} from '../storage/store';
import { computePathStats, placeKey, UNNAMED, isPlaceholderName, formatDuration, formatTime } from '../utils/stats';
import { getPlaceOptions, getTimeContextPlaceOptions } from '../utils/analytics';
import { useTheme } from '../theme/ThemeContext';
import { useI18n } from '../i18n/LanguageContext';
import { getPositionFast, reverseGeocodeWithTimeout } from '../utils/location';
import { refreshTravelWidgets, refreshPomodoroWidgets } from '../utils/widgetRefresh';
import { quickCheckIn } from '../services/quickCheckIn';
import { notifyDataChanged } from '../backup/schedule';
import Timeline from '../components/Timeline';
import ModeIcon from '../components/ModeIcon';
import PomodoroTimer from '../components/PomodoroTimer';
import RouteMapScreen from './RouteMapScreen';
import TripReceiptModal from '../components/TripReceiptModal';
import BackfillModal from '../components/BackfillModal';
import UndoBar from '../components/travel/UndoBar';
import PointEditSheet from '../components/travel/PointEditSheet';
import SegmentModeSheet from '../components/travel/SegmentModeSheet';
import TripRenameModal from '../components/travel/TripRenameModal';
import { scheduleTripReminder, cancelTripReminder } from '../services/tripNotifications';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const makeId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const PRIMARY_MODES = ['walk', 'bike', 'drive', 'taxi', 'subway'];
const MORE_MODES = ['transit', 'train', 'flight', 'boat'];
// 底部横向滑动条：格宽取「可用宽度 / 4.4」而非 /5，让第 5 格只露出一截，
// 作为「还能左滑」的视觉提示；9 种方式全部排在一行里，冷门方式一个手势直达。
const MODE_PEEK_SLOTS = 4.4;
// 横条外层（bottomComposer）的水平内边距；格宽按 winWidth 减去两侧留白推算
const MODE_STRIP_PADDING = 12;
// 格间距。不折进单格宽度，而是与宽度并列成「名义槽宽 slot = itemW + gap」，
// 于是第 n 格左边界恰好是 n × slot，滚动定位用一次乘法即可。
const MODE_GAP = 6;
const ALL_MODES = [...PRIMARY_MODES, ...MORE_MODES];

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const route = useRoute();
  const { t, formatDate, lang } = useI18n();
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => makeStyles(colors, isDark), [colors, isDark]);

  // 出行方式横条的几何：window 变化（旋转/折叠屏）时重算，故不缓存到常量。
  const { width: winWidth } = useWindowDimensions();
  const modeGeo = useMemo(() => {
    const avail = winWidth - MODE_STRIP_PADDING * 2;
    const slot = avail / MODE_PEEK_SLOTS;      // 含一个间隙的「名义槽宽」
    return { slot, itemW: slot - MODE_GAP };
  }, [winWidth]);
  const modeStripRef = useRef(null);
  // 横条当前滚动位置。放 ref 而不是 state：它只服务于「选中项要不要滚」这一个判断，
  // 进 state 会让整页在每次滑动时重渲染。
  const modeStripXRef = useRef(0);
  // 横条可视宽度反过来要进 state：选中项靠它判断是否已可见，且它只在
  // 首次布局与旋转/折叠时变化，重渲染代价可以忽略。
  const [modeStripW, setModeStripW] = useState(0);

  const [records, setRecords] = useState([]);
  const [focusSessions, setFocusSessions] = useState([]); // 今日专注记录
  const [allFocusSessions, setAllFocusSessions] = useState([]); // 全部专注记录，供专注历史弹窗跨天查看
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [scene, setScene] = useState('focus'); // 'travel' | 'focus'
  const [isFocusRunning, setIsFocusRunning] = useState(false);

  useEffect(() => {
    navigation.setOptions({
      tabBarStyle: isFocusRunning ? { display: 'none' } : undefined,
    });
    return () => {
      navigation.setOptions({ tabBarStyle: undefined });
    };
  }, [isFocusRunning, navigation]);

  const [mode, setMode] = useState('walk');

  // 选中项滑进视野：从持久化偏好恢复出冷门方式时（如上次选了「轮船」），
  // 横条初始位置会把它藏在屏幕外，选中态看似丢失。等一帧布局完成后再滚。
  // 只在真正看不见时才滚——否则用户每点一次都会把横条拽一下，手感很跳。
  useEffect(() => {
    const idx = ALL_MODES.indexOf(mode);
    if (idx < 0 || !modeStripW) return;
    const left = MODE_STRIP_PADDING + idx * modeGeo.slot; // 格子在内容坐标系里的位置
    const right = left + modeGeo.itemW;
    const x = modeStripXRef.current;
    if (left >= x - 1 && right <= x + modeStripW + 1) return; // 已完整可见
    const timer = setTimeout(() => {
      modeStripRef.current?.scrollTo({ x: Math.max(0, idx * modeGeo.slot), animated: true });
    }, 60);
    return () => clearTimeout(timer);
  }, [mode, modeGeo.slot, modeGeo.itemW, modeStripW]);

  const [estimate, setEstimate] = useState(null);
  const [hasActiveTrip, setHasActiveTrip] = useState(false);
  const [trips, setTrips] = useState([]);
  const [undoAction, setUndoAction] = useState(null);
  const [renameTripTarget, setRenameTripTarget] = useState(null);
  const [locStatus, setLocStatus] = useState(null);
  const [activeLocStatus, setActiveLocStatus] = useState(null);
  const locAnim = useRef(new Animated.Value(0)).current;
  const locTargetRef = useRef(null);
  const fillSeqRef = useRef(0);
  const checkingInRef = useRef(false);
  const pathStatsCacheRef = useRef({ fp: null, stats: [] });

  const [commonPlaces, setCommonPlaces] = useState([]);
  const [renameTarget, setRenameTarget] = useState(null);

  // 主打卡按钮物理下潜与环形蓄力充能进度
  const checkinScale = useRef(new Animated.Value(1)).current;
  const chargeProgress = useRef(new Animated.Value(0)).current;
  const isChargingLongRef = useRef(false);

  // 补卡相关状态
  const [backfillVisible, setBackfillVisible] = useState(false);

  // 路段出行方式修改弹窗
  const [segmentTarget, setSegmentTarget] = useState(null);

  // 地图与小票
  const [mapTrip, setMapTrip] = useState(null);
  const [receiptTrip, setReceiptTrip] = useState(null);

  // 全表扫描指纹缓存：指纹未变时复用缓存，杜绝重复查全表
  const topPlacesFpRef = useRef({ fp: null, places: [] });
  const allFocusFpRef = useRef({ fp: null, list: [] });

  const loadToday = useCallback(async () => {
    const [today, todayFocus, allTrips] = await Promise.all([
      getTodayRecords(),
      getTodayFocusSessions(),
      getTrips(),
    ]);
    const sorted = [...today].sort((a, b) => a.timestamp - b.timestamp);
    setRecords(sorted);
    setFocusSessions([...todayFocus].sort((a, b) => a.timestamp - b.timestamp));
    setTrips(allTrips);
    const trip = await getCurrentTripId();
    setHasActiveTrip(!!trip);

    // 常用地点快选与全部专注记录（基于 90 天按时段加权推荐）
    try {
      const fp = await getRecordsFingerprint();
      if (topPlacesFpRef.current.fp !== fp || !topPlacesFpRef.current.places.length) {
        const all = await getRecords();
        const topPlaces = getTimeContextPlaceOptions(all, 6);
        topPlacesFpRef.current = { fp, places: topPlaces };
        setCommonPlaces(topPlaces);
      }
      if (allFocusFpRef.current.fp !== fp || !allFocusFpRef.current.list.length) {
        const allFocus = await getFocusSessions();
        const sortedFocus = [...allFocus].sort((a, b) => a.timestamp - b.timestamp);
        allFocusFpRef.current = { fp, list: sortedFocus };
        setAllFocusSessions(sortedFocus);
      }
      syncWidgetFocusStats().catch(() => {});
    } catch (e) {}
    return { today: sorted, focus: todayFocus, trips: allTrips };
  }, []);

  // 初始化上次出行方式
  useEffect(() => {
    (async () => setMode(await getLastMode()))();
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadToday();
    }, [loadToday])
  );

  // 深链驱动场景：小组件空白区点击 timeflow://focus|checkin → 切到对应场景。
  // 消费后清除 params，避免下次聚焦重复跳转（route.params 不随聚焦自动清空）。
  useEffect(() => {
    const p = route.params;
    if (p && (p.scene === 'focus' || p.scene === 'travel')) {
      setScene(p.scene);
      navigation.setParams({ scene: undefined });
    }
  }, [route.params, navigation]);

  // 前台唤醒时静默补定位
  useEffect(() => {
    const sub = AppState.addEventListener('change', async (nextState) => {
      if (nextState === 'active') {
        const { today } = await loadToday();
        if (today && today.length) {
          const latest = today[today.length - 1];
          const age = Date.now() - latest.timestamp;
          if (
            latest.tripId != null &&
            (latest.lat == null || latest.lng == null) &&
            age < 10 * 60 * 1000
          ) {
            fillLocation(latest.id);
          }
        }
      }
    });
    return () => sub.remove();
  }, [loadToday]);

  // 定位状态胶囊动效
  useEffect(() => {
    if (locStatus) {
      setActiveLocStatus(locStatus);
      Animated.spring(locAnim, {
        toValue: 1,
        friction: 7,
        tension: 110,
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(locAnim, {
        toValue: 0,
        duration: 220,
        useNativeDriver: true,
      }).start(() => {
        setActiveLocStatus(null);
      });
    }
  }, [locStatus, locAnim]);

  // 预估到达计算
  useEffect(() => {
    if (records.length < 1) {
      setEstimate(null);
      return;
    }
    (async () => {
      const fp = await getRecordsFingerprint();
      let stats = pathStatsCacheRef.current.stats;
      if (pathStatsCacheRef.current.fp !== fp || !stats.length) {
        const all = await getRecords();
        stats = computePathStats(all);
        pathStatsCacheRef.current = { fp, stats };
      }
      if (!stats.length) {
        setEstimate(null);
        return;
      }
      const last = records[records.length - 1];
      const key = placeKey(last);
      const match = stats.find((s) => s.fromKey === key);
      if (match) {
        setEstimate({ locationName: match.toName, estimatedSec: match.medianSec });
      } else {
        setEstimate(null);
      }
    })();
  }, [records]);

  // 一键打卡（轻按打卡，长按结束行程）
  const handleCheckIn = async (isEndTrip = false) => {
    if (checkingInRef.current) return;
    checkingInRef.current = true;
    setLoading(true);
    const hadActiveBefore = hasActiveTrip;
    try {
      // 与桌面小组件「打卡」同一段数据写入逻辑（quickCheckIn）：乐观落库占位记录。
      const { id, tripId } = await quickCheckIn({ mode });
      await setLastMode(mode);

      if (isEndTrip) {
        await endTrip();
        await cancelTripReminder();
      } else {
        await scheduleTripReminder(t('notification.tripReminderTitle'), t('notification.tripReminderBody'));
      }

      setLoading(false);
      setSuccess(isEndTrip ? 'ended' : true);
      if (isEndTrip) {
        Vibration.vibrate(40);
      } else {
        Vibration.vibrate(15);
      }

      await loadToday();
      refreshTravelWidgets();
      notifyDataChanged();
      setTimeout(() => setSuccess(false), isEndTrip ? 1500 : 1200);

      fillLocation(id);

      // 5 秒内可撤销
      setUndoAction({
        type: isEndTrip ? 'endTrip' : 'checkin',
        recordId: id,
        tripId,
        hadActiveBefore,
        message: isEndTrip ? t('trip.undoEnded') : t('trip.undoCheckIn'),
      });
    } catch (e) {
      setLoading(false);
      Vibration.vibrate([0, 40, 30, 40]);
      Alert.alert(t('home.failTitle'), t('home.failBody'));
    } finally {
      setTimeout(() => {
        checkingInRef.current = false;
      }, 1000);
    }
  };

  // 后台补定位与逆地理编码
  const fillLocation = async (id) => {
    const seq = ++fillSeqRef.current;
    locTargetRef.current = id;
    setLocStatus('pending');
    const isStale = () => seq !== fillSeqRef.current;
    try {
      let { status } = await Location.getForegroundPermissionsAsync();
      if (status !== 'granted') {
        ({ status } = await Location.requestForegroundPermissionsAsync());
      }
      if (status !== 'granted') {
        if (!isStale()) setLocStatus('denied');
        return;
      }

      const { loc, reason } = await getPositionFast();
      if (!loc) {
        if (!isStale()) setLocStatus(reason === 'services-off' ? 'services' : 'failed');
        return;
      }
      const lat = loc.coords.latitude,
        lng = loc.coords.longitude;

      let addr = loc.address;
      if (!addr) {
        addr = await reverseGeocodeWithTimeout(lat, lng);
      }

      const current = await getRecordById(id);
      if (!current) {
        if (!isStale()) setLocStatus(null);
        return;
      }

      // 双重防护：目标记录若本就不带行程，不写入坐标
      if (current.tripId == null) {
        if (!isStale()) setLocStatus(null);
        return;
      }

      const patch = { lat, lng };
      if (addr && isPlaceholderName(current.locationName)) {
        patch.locationName = addr;
      }
      await updateRecord(id, patch);
      await loadToday();
      refreshTravelWidgets();
      if (!isStale()) setLocStatus(null);
    } catch (e) {
      if (!isStale()) setLocStatus('failed');
    }
  };

  const handleLocBarPress = async () => {
    if (locStatus === 'denied') {
      const { status } = await Location.getForegroundPermissionsAsync();
      if (status === 'granted') {
        const id = locTargetRef.current;
        if (id) fillLocation(id);
      } else Linking.openSettings();
    } else if (locStatus === 'services') {
      Linking.openSettings();
    } else if (locStatus === 'failed') {
      let servicesOn = true;
      try {
        servicesOn = await Location.hasServicesEnabledAsync();
      } catch (e) {}
      if (!servicesOn) Linking.openSettings();
      else {
        const id = locTargetRef.current;
        if (id) fillLocation(id);
      }
    }
  };

  // 主打卡按钮手势交互
  const handleCheckinPressIn = () => {
    if (loading || success) return;
    isChargingLongRef.current = false;
    Animated.spring(checkinScale, {
      toValue: 0.95,
      friction: 6,
      tension: 140,
      useNativeDriver: true,
    }).start();

    chargeProgress.setValue(0);
    Animated.timing(chargeProgress, {
      toValue: 1,
      duration: 650,
      easing: Easing.linear,
      useNativeDriver: false,
    }).start();
  };

  const handleCheckinPressOut = () => {
    Animated.spring(checkinScale, {
      toValue: 1,
      friction: 5,
      tension: 100,
      useNativeDriver: true,
    }).start();

    Animated.timing(chargeProgress, {
      toValue: 0,
      duration: 160,
      easing: Easing.out(Easing.ease),
      useNativeDriver: false,
    }).start();
  };

  const handleCheckinLongPress = () => {
    if (loading || success) return;
    isChargingLongRef.current = true;
    handleCheckIn(true);
  };

  const handleCheckinPress = () => {
    if (isChargingLongRef.current) return;
    handleCheckIn(false);
  };

  // ---- 显式结束当前行程 ----
  const handleDirectEndTrip = async (tripId) => {
    Alert.alert(t('trip.endConfirmTitle', '结束当前行程？'), t('trip.endConfirmBody', '结束后，下次打卡将开启新的行程'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('trip.end', '结束行程'),
        style: 'destructive',
        onPress: async () => {
          await endTrip();
          await cancelTripReminder();
          await loadToday();
          refreshTravelWidgets();
          notifyDataChanged();
          setUndoAction({
            type: 'endTrip',
            tripId,
            message: t('trip.undoEnded'),
          });
        },
      },
    ]);
  };

  // ---- 撤销操作（打卡或结束行程） ----
  const handleUndo = async () => {
    if (!undoAction) return;
    const action = undoAction;
    setUndoAction(null);
    try {
      if (action.type === 'checkin' && action.recordId) {
        await deleteRecord(action.recordId);
        if (!action.hadActiveBefore && action.tripId) {
          const db = await import('../storage/store').then((m) => m.getDb());
          const countRow = await db.getFirstAsync('SELECT COUNT(*) AS c FROM records WHERE trip_id = ?', action.tripId);
          if (countRow && countRow.c === 0) {
            await db.runAsync('DELETE FROM trips WHERE id = ?', action.tripId);
          }
        }
      } else if (action.type === 'endTrip' && action.tripId) {
        await setCurrentTripId(action.tripId);
        await scheduleTripReminder(t('notification.tripReminderTitle'), t('notification.tripReminderBody'));
      }
      Vibration.vibrate(20);
      await loadToday();
      refreshTravelWidgets();
      notifyDataChanged();
    } catch (e) {}
  };

  // ---- 打卡点编辑抽屉 ----
  const handleSavePointEdit = async (data) => {
    if (!data || !data.id) return;
    await updateRecord(data.id, {
      locationName: data.locationName,
      mode: data.mode,
      timestamp: data.timestamp,
    });
    setRenameTarget(null);
    await loadToday();
    refreshTravelWidgets();
  };

  const handleDeletePoint = async (id) => {
    if (!id) return;
    await deleteRecord(id);
    setLocStatus(null);
    setRenameTarget(null);
    await loadToday();
    refreshTravelWidgets();
  };

  const handleModalEndTrip = async () => {
    await endTrip();
    await cancelTripReminder();
    setRenameTarget(null);
    await loadToday();
    refreshTravelWidgets();
    notifyDataChanged();
    Alert.alert(t('trip.endedTitle', '提示'), t('trip.endedToast'));
  };

  // ---- 行内快捷设常用地点 ----
  const handleQuickName = async (recordId, placeName) => {
    await updateRecord(recordId, { locationName: placeName });
    await loadToday();
    refreshTravelWidgets();
  };

  // ---- 行程重命名 ----
  const handleSaveTripName = async (tripId, name) => {
    await updateTripName(tripId, name);
    setRenameTripTarget(null);
    await loadToday();
  };

  // ---- 相邻点补一站 ----
  const handleAddStopBetween = ({ mode: segMode }) => {
    if (segMode) setMode(segMode);
    setBackfillVisible(true);
  };

  // ---- 补记打卡（BackfillModal） ----
  const handleSaveBackfill = async (data) => {
    if (checkingInRef.current) return;
    checkingInRef.current = true;
    const tCheckin = Date.now() - data.offsetMin * 60 * 1000;
    try {
      const id = makeId();
      await saveRecord({
        id,
        timestamp: tCheckin,
        locationName: data.locationName,
        lat: null,
        lng: null,
        mode: data.mode,
      });
      Vibration.vibrate(25);
      setBackfillVisible(false);
      await loadToday();
      refreshTravelWidgets();
      notifyDataChanged();
    } catch (e) {
      Alert.alert(t('home.failTitle'), t('home.failBody'));
    } finally {
      setTimeout(() => {
        checkingInRef.current = false;
      }, 800);
    }
  };

  // ---- 修改路段出行方式 ----
  const handleOpenSegmentMode = (record) => {
    setSegmentTarget(record);
  };
  const handleConfirmSegmentMode = async (newMode) => {
    if (!segmentTarget) return;
    await updateRecord(segmentTarget.id, { mode: newMode });
    setSegmentTarget(null);
    await loadToday();
    refreshTravelWidgets();
  };

  // ---- 室内专注处理 ----
  const handleStartFocus = async (data) => {
    try {
      // 专注会话的完整持久化上下文由 PomodoroTimer 自行维护，
      // 这里只负责触发桌面小部件刷新。
      refreshPomodoroWidgets();
    } catch (e) {}
  };

  const handleSaveFocus = async (data) => {
    const sessionTs = (data && data.timestamp) || Date.now();
    try {
      // timeflow_active_focus 由 PomodoroTimer 自行维护，保存成功后由它清理；
      // 这里直接落库并刷新今日数据。
      const id = makeId();
      await saveFocusSession({
        id,
        timestamp: sessionTs,
        goalName: data.goalName,
        duration: data.duration,
        category: data.category,
        note: data.note,
        partial: data.partial ? 1 : 0,
      });
      Vibration.vibrate(40);
      await loadToday();
      refreshPomodoroWidgets();
      notifyDataChanged();
      return true;
    } catch (e) {
      Alert.alert(t('home.failTitle'), t('home.failBody'));
      return false;
    }
  };

  const handleUpdateFocusSession = async (id, patch) => {
    await updateFocusSession(id, patch);
    await loadToday();
    refreshPomodoroWidgets();
  };

  const handleDeleteFocusSession = async (id) => {
    await deleteFocusSession(id);
    await loadToday();
    refreshPomodoroWidgets();
  };

  // ---- 数据分离与统计 ----
  const dateStr = formatDate(new Date());

  // 1. 行程轨迹专属数据
  const travelRecords = records;
  const travelCount = travelRecords.length;

  const travelTripsCount = useMemo(() => {
    if (!travelRecords.length) return 0;
    const set = new Set();
    for (const r of travelRecords) {
      set.add(r.tripId || 'legacy');
    }
    return set.size;
  }, [travelRecords]);

  const travelDurationSec = useMemo(() => {
    if (travelRecords.length < 2) return 0;
    const minT = Math.min(...travelRecords.map((r) => r.timestamp));
    const maxT = Math.max(...travelRecords.map((r) => r.timestamp));
    return Math.max(0, Math.round((maxT - minT) / 1000));
  }, [travelRecords]);

  // 2. 室内专注专属数据
  const focusRecords = focusSessions;
  const focusCount = focusRecords.length;
  const todayFocusSec = useMemo(
    () => focusRecords.reduce((sum, r) => sum + (Number(r.duration) || 0), 0),
    [focusRecords]
  );

  return (
    <View style={styles.screen}>
      {!(scene === 'focus' && isFocusRunning) && (
        <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
          {/* 左侧：今天 + 日期 */}
          <View style={styles.titleBlock}>
            <Text style={styles.title}>{t('home.today')}</Text>
            <Text style={styles.date}>{dateStr}</Text>
          </View>

          {/* 右侧：模式切换分段控件 (⏱ 室内专注 vs 🚗 行程轨迹) */}
          <View style={styles.sceneToggleWrap}>
            <TouchableOpacity
              style={[styles.sceneToggleBtn, scene === 'focus' && styles.sceneToggleBtnActive]}
              onPress={() => setScene('focus')}
              activeOpacity={0.7}
            >
              <Ionicons
                name="timer-outline"
                size={14}
                color={scene === 'focus' ? colors.primaryStrong : (isDark ? colors.ink2 : '#5E4F44')}
              />
              <Text style={[styles.sceneToggleText, scene === 'focus' && styles.sceneToggleTextActive]}>
                {t('home.sceneFocus', '室内专注').replace(/^[^\w\u4e00-\u9fa5]+\s*/, '')}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.sceneToggleBtn, scene === 'travel' && styles.sceneToggleBtnActive]}
              onPress={() => setScene('travel')}
              activeOpacity={0.7}
            >
              <Ionicons
                name="car-outline"
                size={14}
                color={scene === 'travel' ? colors.primaryStrong : (isDark ? colors.ink2 : '#5E4F44')}
              />
              <Text style={[styles.sceneToggleText, scene === 'travel' && styles.sceneToggleTextActive]}>
                {t('home.sceneTravel', '行程轨迹').replace(/^[^\w\u4e00-\u9fa5]+\s*/, '')}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* 悬浮灵动定位胶囊 */}
      {activeLocStatus && (
        <Animated.View
          style={[
            styles.floatingCapsule,
            { top: insets.top + 60 },
            {
              opacity: locAnim,
              transform: [
                {
                  translateY: locAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [-14, 0],
                  }),
                },
                {
                  scale: locAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.92, 1],
                  }),
                },
              ],
            },
          ]}
          pointerEvents={locStatus ? 'auto' : 'none'}
        >
          <TouchableOpacity
            style={styles.capsuleInner}
            onPress={handleLocBarPress}
            activeOpacity={locStatus === 'pending' ? 1 : 0.7}
            disabled={locStatus === 'pending'}
          >
            {activeLocStatus === 'pending' ? (
              <View style={styles.capsuleRow}>
                <ActivityIndicator size="small" color="#D63B3B" style={{ transform: [{ scale: 0.78 }] }} />
                <Text style={styles.capsuleTextPending}>{t('home.locPending')}</Text>
              </View>
            ) : (
              <View style={styles.capsuleRow}>
                <Ionicons name="warning-outline" size={14} color="#D63B3B" />
                <Text style={styles.capsuleTextDanger}>
                  {activeLocStatus === 'denied'
                    ? t('home.locDenied')
                    : activeLocStatus === 'services'
                    ? t('home.locServices')
                    : t('home.locFailed')}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        </Animated.View>
      )}

      {/* 主视图内容 */}
      {scene === 'travel' ? (
        <>
          {/* 行程统计 3 列卡片 */}
          <View style={styles.statsCard}>
            <View style={styles.statsCol}>
              <Text style={styles.statsValue}>{travelCount}</Text>
              <Text style={styles.statsLabel}>{t('home.statCheckins')}</Text>
            </View>
            <View style={[styles.statsCol, styles.statsColBorder]}>
              <Text style={styles.statsValue}>{travelTripsCount}</Text>
              <Text style={styles.statsLabel}>{t('home.statTrips')}</Text>
            </View>
            <View style={styles.statsCol}>
              <Text style={styles.statsValue}>
                {travelCount > 1 ? formatDuration(travelDurationSec, lang) : '--'}
              </Text>
              <Text style={styles.statsLabel}>{t('home.statElapsed')}</Text>
            </View>
          </View>

          {/* 时间轴滚动区 */}
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            <Timeline
              records={travelRecords}
              trips={trips}
              estimate={estimate}
              onRename={setRenameTarget}
              onShowMap={setMapTrip}
              onShowReceipt={setReceiptTrip}
              onChangeSegmentMode={setSegmentTarget}
              onEndTrip={handleDirectEndTrip}
              onRenameTrip={setRenameTripTarget}
              onAddStopBetween={handleAddStopBetween}
              onQuickName={handleQuickName}
              onDeleteRecord={handleDeletePoint}
              commonPlaces={commonPlaces}
              hasActiveTrip={hasActiveTrip}
            />
          </ScrollView>

          {/* 底部操作区：出行方式 + 补记 + 打卡 */}
          <View style={styles.bottomComposer}>
            {/* 行程进行中：接下来的出行方式指示标签 */}
            {hasActiveTrip && (
              <View style={styles.nextModeRow}>
                <Ionicons name="arrow-forward-circle-outline" size={13} color={colors.primaryStrong} />
                <Text style={styles.nextModeTitle}>{t('home.nextModeLabel', '接下来的出行方式')}</Text>
              </View>
            )}

            {/* 出行方式横滑条：9 种方式一行排开，左右滑动取用 */}
            <ScrollView
              ref={modeStripRef}
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.modesStrip}
              contentContainerStyle={styles.modesStripContent}
              scrollEventThrottle={16}
              onScroll={(e) => { modeStripXRef.current = e.nativeEvent.contentOffset.x; }}
              onLayout={(e) => setModeStripW(e.nativeEvent.layout.width)}
            >
              {ALL_MODES.map((m) => {
                const isSelected = mode === m;
                return (
                  <TouchableOpacity
                    key={'mode-btn-' + m}
                    style={[
                      styles.modeBtn,
                      { width: modeGeo.itemW },
                      isSelected && styles.modeBtnActive,
                    ]}
                    onPress={async () => {
                      setMode(m);
                      await setLastMode(m);
                    }}
                    activeOpacity={0.7}
                  >
                    <ModeIcon mode={m} size={20} color={isSelected ? colors.primaryStrong : colors.ink2} />
                    <Text style={[styles.modeBtnText, isSelected && styles.modeBtnTextActive]}>
                      {t('mode.' + m)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* 核心操作行：[+ 补记] 与 [打卡] */}
            <View style={styles.actionBtnRow}>
              {/* 独立补记按钮 */}
              <TouchableOpacity
                style={styles.backfillSquareBtn}
                onPress={() => setBackfillVisible(true)}
                activeOpacity={0.7}
              >
                <Ionicons name="add" size={22} color="#B3302C" />
                <Text style={styles.backfillSquareText}>{t('home.backfill')}</Text>
              </TouchableOpacity>

              {/* 核心打卡主按钮（状态化：开始行程 / 到达打卡） */}
              <Animated.View style={[{ flex: 1 }, { transform: [{ scale: checkinScale }] }]}>
                <Pressable
                  style={[
                    styles.checkinMainBtn,
                    success === 'ended' && styles.checkinBtnEnded,
                    success === true && styles.checkinBtnSuccess,
                  ]}
                  onPressIn={handleCheckinPressIn}
                  onPressOut={handleCheckinPressOut}
                  onPress={handleCheckinPress}
                  onLongPress={handleCheckinLongPress}
                  delayLongPress={650}
                  disabled={loading || !!success}
                >
                  {/* 长按充能内衬 */}
                  <Animated.View
                    style={[
                      styles.chargeFill,
                      {
                        width: chargeProgress.interpolate({
                          inputRange: [0, 1],
                          outputRange: ['0%', '100%'],
                        }),
                        opacity: chargeProgress.interpolate({
                          inputRange: [0, 0.2, 1],
                          outputRange: [0, 0.15, 0.35],
                        }),
                      },
                    ]}
                  />

                  {loading ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : success ? (
                    <View style={styles.checkinInnerRow}>
                      <Text style={{ fontSize: 22, color: '#fff' }}>
                        {success === 'ended' ? '🏁' : '✓'}
                      </Text>
                      <View style={styles.checkinTextGroup}>
                        <Text style={styles.checkinBtnTitle}>
                          {success === 'ended' ? t('checkin.ended') : t('checkin.done')}
                        </Text>
                      </View>
                    </View>
                  ) : (
                    <View style={styles.checkinInnerRow}>
                      {/* 指纹图标与环形充能圈 */}
                      <View style={styles.fingerRingWrap}>
                        <Svg width={40} height={40}>
                          {/* 环形底轨 */}
                          <Circle
                            cx={20}
                            cy={20}
                            r={17}
                            stroke="rgba(255,255,255,0.25)"
                            strokeWidth={3}
                            fill="none"
                          />
                          {/* 充能进度环 */}
                          <AnimatedCircle
                            cx={20}
                            cy={20}
                            r={17}
                            stroke="#FFFFFF"
                            strokeWidth={3}
                            strokeDasharray={106.8}
                            strokeDashoffset={chargeProgress.interpolate({
                              inputRange: [0, 1],
                              outputRange: [106.8, 0],
                            })}
                            strokeLinecap="round"
                            fill="none"
                            transform="rotate(-90 20 20)"
                          />
                        </Svg>
                        <View style={styles.fingerIconCenter}>
                          <Ionicons name="finger-print-outline" size={24} color="#fff" />
                        </View>
                      </View>

                      <View style={styles.checkinTextGroup}>
                        <Text style={styles.checkinBtnTitle}>
                          {hasActiveTrip ? t('home.btnCheckIn', '到达打卡') : t('home.btnStartTrip', '开始行程')}
                        </Text>
                        <Text style={styles.checkinBtnSub}>
                          {hasActiveTrip ? t('checkin.hint') : t('home.btnPressToStart', '点击开始行程')}
                        </Text>
                      </View>
                    </View>
                  )}
                </Pressable>
              </Animated.View>
            </View>
          </View>
        </>
      ) : (
        /* 室内专注模式。沉浸式专注页自己按 insets 留白并铺满整屏，
           这里不再额外加 padding，否则专注页背景色与外层底色之间会露出上下两条色带。 */
        <View style={styles.focusContainer}>
          <PomodoroTimer
            onStartFocus={handleStartFocus}
            onSaveFocus={handleSaveFocus}
            todayFocusCount={focusCount}
            todayFocusSec={todayFocusSec}
            todayFocusRecords={focusRecords}
            allFocusRecords={allFocusSessions}
            onUpdateFocusSession={handleUpdateFocusSession}
            onDeleteFocusSession={handleDeleteFocusSession}
            onGoInsights={() => navigation.navigate('Insights')}
            onRunningChange={setIsFocusRunning}
          />
        </View>
      )}

      {/* 5 秒操作撤销浮条 */}
      <UndoBar
        visible={!!undoAction}
        message={undoAction?.message}
        onUndo={handleUndo}
        onDismiss={() => setUndoAction(null)}
      />

      {/* 补记抽屉面板 */}
      <BackfillModal
        visible={backfillVisible}
        onClose={() => setBackfillVisible(false)}
        onSave={handleSaveBackfill}
        commonPlaces={commonPlaces}
        initialMode={mode}
      />

      {/* 打卡点分层编辑抽屉 */}
      <PointEditSheet
        visible={!!renameTarget}
        record={renameTarget}
        commonPlaces={commonPlaces}
        hasActiveTrip={hasActiveTrip}
        onSave={handleSavePointEdit}
        onDelete={handleDeletePoint}
        onEndTrip={handleModalEndTrip}
        onClose={() => setRenameTarget(null)}
      />

      {/* 修改路段出行方式抽屉 */}
      <SegmentModeSheet
        visible={!!segmentTarget}
        currentMode={segmentTarget?.mode || 'walk'}
        onSelectMode={handleConfirmSegmentMode}
        onClose={() => setSegmentTarget(null)}
      />

      {/* 行程命名弹窗 */}
      <TripRenameModal
        visible={!!renameTripTarget}
        trip={renameTripTarget}
        onSave={handleSaveTripName}
        onClose={() => setRenameTripTarget(null)}
      />

      {/* 轨迹地图模态框 */}
      {mapTrip && (
        <RouteMapScreen
          visible={!!mapTrip}
          tripRecords={mapTrip?.records || []}
          onClose={() => setMapTrip(null)}
        />
      )}

      {/* 行程小票模态框 */}
      {receiptTrip && (
        <TripReceiptModal
          visible={!!receiptTrip}
          trip={receiptTrip}
          onClose={() => setReceiptTrip(null)}
        />
      )}
    </View>
  );
}

const makeStyles = (colors, isDark) =>
  StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: colors.bg,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingBottom: 8,
    },
    titleBlock: {
      justifyContent: 'center',
    },
    title: {
      fontSize: 24,
      fontWeight: '800',
      color: colors.ink,
      lineHeight: 28,
    },
    date: {
      fontSize: 12,
      color: colors.ink2,
      lineHeight: 16,
      marginTop: 2,
    },
    sceneToggleWrap: {
      flexDirection: 'row',
      backgroundColor: isDark ? '#2D241C' : '#EFE7DD',
      borderRadius: 999,
      padding: 3,
      alignItems: 'center',
    },
    sceneToggleBtn: {
      height: 34,
      paddingHorizontal: 12,
      borderRadius: 999,
      backgroundColor: 'transparent',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
    },
    sceneToggleBtnActive: {
      backgroundColor: colors.surface,
      shadowColor: colors.ink,
      shadowOffset: { width: 0, height: 1.5 },
      shadowOpacity: 0.12,
      shadowRadius: 3,
      elevation: 2,
    },
    sceneToggleText: {
      fontSize: 13,
      fontWeight: '500',
      color: isDark ? colors.ink2 : '#5E4F44',
    },
    sceneToggleTextActive: {
      fontWeight: '700',
      color: colors.primaryStrong,
    },
    statsCard: {
      flexDirection: 'row',
      marginHorizontal: 16,
      marginBottom: 10,
      paddingVertical: 8,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.line,
      borderRadius: 16,
    },
    statsCol: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    statsColBorder: {
      borderLeftWidth: 1,
      borderRightWidth: 1,
      borderColor: colors.line,
    },
    statsValue: {
      fontSize: 18,
      fontWeight: '800',
      color: colors.ink,
      lineHeight: 22,
    },
    statsLabel: {
      fontSize: 11,
      color: colors.ink2,
      marginTop: 2,
    },
    scroll: {
      flex: 1,
    },
    scrollContent: {
      paddingHorizontal: 12,
      paddingBottom: 16,
    },
    bottomComposer: {
      backgroundColor: colors.bg,
      paddingHorizontal: 12,
      paddingTop: 10,
      paddingBottom: Platform.OS === 'ios' ? 14 : 10,
      shadowColor: colors.ink,
      shadowOffset: { width: 0, height: -6 },
      shadowOpacity: 0.07,
      shadowRadius: 14,
      elevation: 8,
    },
    nextModeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      marginBottom: 6,
      paddingHorizontal: 2,
    },
    nextModeTitle: {
      fontSize: 11,
      fontWeight: '700',
      color: colors.primaryStrong,
    },
    modesStrip: {
      marginBottom: 10,
      // 反向抵消 bottomComposer 的水平内边距：横条本身通铺到屏幕两侧，
      // 首格靠 contentContainerStyle 的 paddingHorizontal 退回来与下方按钮对齐，
      // 而右侧的下一格可以被屏幕边缘自然裁掉，露出「还能滑」的一截。
      marginHorizontal: -MODE_STRIP_PADDING,
    },
    modesStripContent: {
      paddingHorizontal: MODE_STRIP_PADDING,
      gap: MODE_GAP,
    },
    modeBtn: {
      height: 58,
      borderRadius: 14,
      borderWidth: 1.5,
      borderColor: colors.line2,
      backgroundColor: colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 3,
    },
    modeBtnActive: {
      borderColor: colors.primary,
      backgroundColor: colors.primarySoft,
    },
    modeBtnText: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.ink2,
    },
    modeBtnTextActive: {
      fontWeight: '800',
      color: colors.primaryStrong,
    },
    actionBtnRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    backfillSquareBtn: {
      width: 68,
      height: 60,
      borderRadius: 18,
      borderWidth: 1.5,
      borderColor: colors.line2,
      backgroundColor: colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 2,
    },
    backfillSquareText: {
      fontSize: 12,
      fontWeight: '800',
      color: colors.primaryStrong,
    },
    checkinMainBtn: {
      width: '100%',
      height: 60,
      borderRadius: 18,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: colors.primary,
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.32,
      shadowRadius: 14,
      elevation: 6,
      position: 'relative',
      overflow: 'hidden',
    },
    checkinBtnEnded: {
      backgroundColor: colors.ink2,
      shadowColor: colors.ink2,
    },
    checkinBtnSuccess: {
      backgroundColor: colors.success,
      shadowColor: colors.success,
    },
    chargeFill: {
      position: 'absolute',
      top: 0,
      left: 0,
      bottom: 0,
      backgroundColor: colors.surface,
      borderRadius: 18,
      zIndex: 1,
    },
    checkinInnerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
      zIndex: 2,
    },
    fingerRingWrap: {
      width: 40,
      height: 40,
      alignItems: 'center',
      justifyContent: 'center',
    },
    fingerIconCenter: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      alignItems: 'center',
      justifyContent: 'center',
    },
    checkinTextGroup: {
      justifyContent: 'center',
    },
    checkinBtnTitle: {
      fontSize: 20,
      fontWeight: '800',
      color: colors.surface,
      letterSpacing: 4,
      lineHeight: 24,
    },
    checkinBtnSub: {
      fontSize: 11,
      fontWeight: '600',
      color: colors.surface,
      opacity: 0.95,
      lineHeight: 14,
    },
    timeEditRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 14,
    },
    timeDisplayPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: colors.primarySoft,
      borderWidth: 1,
      borderColor: colors.primary,
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 10,
    },
    timeDisplayText: {
      fontSize: 15,
      fontWeight: '800',
      color: colors.primaryStrong,
    },
    timeOffsetBtns: {
      flexDirection: 'row',
      gap: 6,
    },
    timeOffsetBtn: {
      paddingHorizontal: 9,
      paddingVertical: 6,
      backgroundColor: colors.chip,
      borderWidth: 1,
      borderColor: colors.line2,
      borderRadius: 8,
    },
    timeOffsetBtnText: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.ink2,
    },
    focusContainer: {
      flex: 1,
    },
    floatingCapsule: {
      position: 'absolute',
      left: 16,
      right: 16,
      zIndex: 99,
      alignItems: 'center',
    },
    capsuleInner: {
      paddingHorizontal: 14,
      paddingVertical: 7,
      borderRadius: 20,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.line,
      shadowColor: colors.ink,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 4,
      elevation: 3,
    },
    capsuleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    capsuleTextPending: {
      fontSize: 12,
      color: colors.ink2,
    },
    capsuleTextDanger: {
      fontSize: 12,
      color: colors.primary,
      fontWeight: '600',
    },
    overlay: {
      flex: 1,
      backgroundColor: colors.scrim,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 20,
    },
    dialog: {
      width: '100%',
      backgroundColor: colors.surface,
      borderRadius: 20,
      padding: 20,
    },
    dialogTitle: {
      fontSize: 17,
      fontWeight: '800',
      color: colors.ink,
      marginBottom: 6,
      textAlign: 'center',
    },
    dialogSub: {
      fontSize: 13,
      color: colors.ink2,
      marginBottom: 14,
      textAlign: 'center',
    },
    input: {
      height: 46,
      borderWidth: 1.5,
      borderColor: colors.line2,
      borderRadius: 14,
      paddingHorizontal: 12,
      fontSize: 15,
      color: colors.ink,
      marginBottom: 14,
    },
    quickPlaceWrap: {
      marginBottom: 14,
    },
    chipRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
    },
    quickChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 10,
      backgroundColor: colors.chip,
      borderWidth: 1,
      borderColor: colors.line2,
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
      fontWeight: '700',
    },
    dialogSectionLabel: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.ink2,
      marginBottom: 8,
    },
    dialogModeScroll: {
      gap: 8,
      paddingBottom: 14,
    },
    dialogModeChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: 12,
      backgroundColor: colors.chip,
      borderWidth: 1,
      borderColor: colors.line2,
    },
    dialogModeChipActive: {
      backgroundColor: colors.primarySoft,
      borderColor: colors.primary,
    },
    dialogModeChipText: {
      fontSize: 13,
      color: colors.ink2,
      fontWeight: '600',
    },
    dialogModeChipTextActive: {
      color: colors.primaryStrong,
      fontWeight: '700',
    },
    dialogActionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 10,
      borderTopWidth: 1,
      borderTopColor: colors.line,
      marginBottom: 10,
    },
    endTripBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    endTripBtnText: {
      fontSize: 13,
      color: colors.ink2,
      fontWeight: '600',
    },
    deleteLink: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    deleteLinkText: {
      fontSize: 13,
      color: colors.primary,
      fontWeight: '700',
    },
    dialogButtons: {
      flexDirection: 'row',
      gap: 10,
    },
    dialogBtnCancel: {
      flex: 1,
      height: 44,
      borderRadius: 14,
      backgroundColor: colors.chip,
      alignItems: 'center',
      justifyContent: 'center',
    },
    dialogBtnCancelFull: {
      width: '100%',
      height: 44,
      borderRadius: 14,
      backgroundColor: colors.chip,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 10,
    },
    dialogBtnCancelText: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.ink2,
    },
    dialogBtnConfirm: {
      flex: 1,
      height: 44,
      borderRadius: 14,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    dialogBtnConfirmText: {
      fontSize: 14,
      fontWeight: '700',
      color: colors.surface,
    },
    segModeGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginVertical: 14,
    },
    segModeItem: {
      width: '48%',
      height: 44,
      borderRadius: 12,
      borderWidth: 1.5,
      borderColor: colors.line2,
      backgroundColor: colors.surface,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
    },
    segModeItemActive: {
      borderColor: colors.primary,
      backgroundColor: colors.primarySoft,
    },
    segModeText: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.ink2,
    },
    segModeTextActive: {
      color: colors.primaryStrong,
      fontWeight: '800',
    },
  });
