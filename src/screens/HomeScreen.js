import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Alert,
  TouchableOpacity,
  ActivityIndicator,
  Animated,
  Vibration,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  saveRecord,
  getRecords,
  getTodayRecords,
  updateRecord,
  deleteRecord,
  endTrip,
  getCurrentTripId,
  getTrips,
  updateTripName,
  getLastMode,
  getRecordsFingerprint,
  saveFocusSession,
  getFocusSessions,
  getTodayFocusSessions,
  updateFocusSession,
  deleteFocusSession,
  syncWidgetFocusStats,
} from '../storage/store';
import { computePathStats, placeKey } from '../utils/stats';
import { getTimeContextPlaceOptions } from '../utils/analytics';
import { useTheme } from '../theme/ThemeContext';
import { useI18n } from '../i18n/LanguageContext';
import { refreshTravelWidgets, refreshPomodoroWidgets } from '../utils/widgetRefresh';
import { notifyDataChanged } from '../backup/schedule';
import PomodoroTimer from '../components/PomodoroTimer';
import RouteMapScreen from './RouteMapScreen';
import TripReceiptModal from '../components/TripReceiptModal';
import BackfillModal from '../components/BackfillModal';
import UndoBar from '../components/travel/UndoBar';
import PointEditSheet from '../components/travel/PointEditSheet';
import SegmentModeSheet from '../components/travel/SegmentModeSheet';
import TripRenameModal from '../components/travel/TripRenameModal';
import { cancelTripReminder } from '../services/tripNotifications';
import { useTripCheckIn } from './home/useTripCheckIn';
import TravelScene from './home/TravelScene';

const makeId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  /** @type {any} */
  const navigation = useNavigation();
  /** @type {any} */
  const route = useRoute();
  const { t, formatDate, lang } = useI18n();
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => makeStyles(colors, isDark), [colors, isDark]);

  const [records, setRecords] = useState(/** @type {any[]} */ ([]));
  const [focusSessions, setFocusSessions] = useState(/** @type {any[]} */ ([]));
  const [allFocusSessions, setAllFocusSessions] = useState(/** @type {any[]} */ ([]));
  const [scene, setScene] = useState(/** @type {'travel' | 'focus'} */ ('focus'));
  const [isFocusRunning, setIsFocusRunning] = useState(false);
  const [mode, setMode] = useState('walk');
  const [estimate, setEstimate] = useState(/** @type {any} */ (null));
  const [hasActiveTrip, setHasActiveTrip] = useState(false);
  const [trips, setTrips] = useState(/** @type {any[]} */ ([]));
  const [commonPlaces, setCommonPlaces] = useState(/** @type {string[]} */ ([]));

  // 弹窗与抽屉状态
  const [renameTripTarget, setRenameTripTarget] = useState(/** @type {any} */ (null));
  const [renameTarget, setRenameTarget] = useState(/** @type {any} */ (null));
  const [backfillVisible, setBackfillVisible] = useState(false);
  const [segmentTarget, setSegmentTarget] = useState(/** @type {any} */ (null));
  const [mapTrip, setMapTrip] = useState(/** @type {any} */ (null));
  const [receiptTrip, setReceiptTrip] = useState(/** @type {any} */ (null));

  const pathStatsCacheRef = useRef(/** @type {{ fp: string | null, stats: any[] }} */ ({ fp: null, stats: [] }));
  const topPlacesFpRef = useRef(/** @type {{ fp: string | null, places: string[] }} */ ({ fp: null, places: [] }));
  const allFocusFpRef = useRef(/** @type {{ fp: string | null, list: any[] }} */ ({ fp: null, list: [] }));

  useEffect(() => {
    navigation.setOptions({
      tabBarStyle: isFocusRunning ? { display: 'none' } : undefined,
    });
    return () => {
      navigation.setOptions({ tabBarStyle: undefined });
    };
  }, [isFocusRunning, navigation]);

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

  // 出行打卡与定位 Hook
  const {
    loading,
    success,
    locStatus,
    setLocStatus,
    activeLocStatus,
    locAnim,
    handleLocBarPress,
    undoAction,
    setUndoAction,
    handleUndo,
    checkinScale,
    chargeProgress,
    handleCheckinPressIn,
    handleCheckinPressOut,
    handleCheckinLongPress,
    handleCheckinPress,
    handleDirectEndTrip,
  } = useTripCheckIn({
    mode,
    hasActiveTrip,
    loadToday,
    t,
  });

  // 初始化上次出行方式
  useEffect(() => {
    (async () => setMode(await getLastMode()))();
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadToday();
    }, [loadToday])
  );

  // 深链驱动场景：小组件空白区点击 timeflow://focus|checkin → 切到对应场景
  useEffect(() => {
    const p = route.params;
    if (p && (p.scene === 'focus' || p.scene === 'travel')) {
      setScene(p.scene);
      navigation.setParams({ scene: undefined });
    }
  }, [route.params, navigation]);

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
    }
  };

  // ---- 修改路段出行方式 ----
  const handleConfirmSegmentMode = async (newMode) => {
    if (!segmentTarget) return;
    await updateRecord(segmentTarget.id, { mode: newMode });
    setSegmentTarget(null);
    await loadToday();
    refreshTravelWidgets();
  };

  // ---- 室内专注处理 ----
  const handleStartFocus = async () => {
    try {
      refreshPomodoroWidgets();
    } catch (e) {}
  };

  const handleSaveFocus = async (data) => {
    const sessionTs = (data && data.timestamp) || Date.now();
    try {
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

  // ---- 统计计算 ----
  const dateStr = formatDate(new Date());

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
        <TravelScene
          records={travelRecords}
          trips={trips}
          estimate={estimate}
          travelCount={travelCount}
          travelTripsCount={travelTripsCount}
          travelDurationSec={travelDurationSec}
          mode={mode}
          setMode={setMode}
          hasActiveTrip={hasActiveTrip}
          commonPlaces={commonPlaces}
          loading={loading}
          success={success}
          checkinScale={checkinScale}
          chargeProgress={chargeProgress}
          onCheckinPressIn={handleCheckinPressIn}
          onCheckinPressOut={handleCheckinPressOut}
          onCheckinPress={handleCheckinPress}
          onCheckinLongPress={handleCheckinLongPress}
          onOpenBackfill={() => setBackfillVisible(true)}
          onRenamePoint={setRenameTarget}
          onShowMap={setMapTrip}
          onShowReceipt={setReceiptTrip}
          onChangeSegmentMode={setSegmentTarget}
          onEndTrip={handleDirectEndTrip}
          onRenameTrip={setRenameTripTarget}
          onAddStopBetween={handleAddStopBetween}
          onQuickName={handleQuickName}
          onDeleteRecord={handleDeletePoint}
        />
      ) : (
        /* 室内专注模式 */
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
      fontWeight: '500',
      color: colors.ink3,
      marginTop: 2,
    },
    sceneToggleWrap: {
      flexDirection: 'row',
      backgroundColor: colors.chip,
      padding: 3,
      borderRadius: 12,
      gap: 3,
      borderWidth: 1,
      borderColor: colors.line2,
    },
    sceneToggleBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 9,
    },
    sceneToggleBtnActive: {
      backgroundColor: colors.surface,
      shadowColor: colors.ink,
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.12,
      shadowRadius: 2,
      elevation: 2,
    },
    sceneToggleText: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.ink2,
    },
    sceneToggleTextActive: {
      color: colors.primaryStrong,
      fontWeight: '800',
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
  });
