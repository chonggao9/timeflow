// @ts-check
import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Animated,
  Easing,
  Alert,
  Vibration,
  Linking,
  AppState,
} from 'react-native';
import * as Location from 'expo-location';
import {
  getRecordById,
  updateRecord,
  deleteRecord,
  endTrip,
  setCurrentTripId,
  setLastMode,
  getCurrentTripId,
  getTodayRecords,
} from '../../storage/store';
import { isPlaceholderName } from '../../utils/stats';
import { getPositionFast, reverseGeocodeWithTimeout } from '../../utils/location';
import { refreshTravelWidgets } from '../../utils/widgetRefresh';
import { quickCheckIn } from '../../services/quickCheckIn';
import { notifyDataChanged } from '../../backup/schedule';
import { scheduleTripReminder, cancelTripReminder, REMINDER_DELAY_SEC } from '../../services/tripNotifications';

/**
 * @typedef {import('../../types').UndoState} UndoState
 * @typedef {import('../../types').TransportMode} TransportMode
 */

/**
 * @param {Object} params
 * @param {TransportMode | string} params.mode
 * @param {boolean} params.hasActiveTrip
 * @param {() => Promise<any>} params.loadToday
 * @param {(key: string, defaultVal?: any, opt?: any) => string} params.t
 */
export function useTripCheckIn({ mode, hasActiveTrip, loadToday, t }) {
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(/** @type {boolean | 'ended'} */ (false));

  const [undoAction, setUndoAction] =
    /** @type {[UndoState | null, import('react').Dispatch<import('react').SetStateAction<UndoState | null>>]} */ (
      useState(null)
    );

  const [locStatus, setLocStatus] = useState(/** @type {string | null} */ (null));
  const [activeLocStatus, setActiveLocStatus] = useState(/** @type {string | null} */ (null));
  const locAnim = useRef(new Animated.Value(0)).current;
  const locTargetRef = useRef(/** @type {string | null} */ (null));
  const fillSeqRef = useRef(0);
  const checkingInRef = useRef(false);

  // 主打卡按钮物理下潜与环形蓄力充能进度
  const checkinScale = useRef(new Animated.Value(1)).current;
  const chargeProgress = useRef(new Animated.Value(0)).current;
  const isChargingLongRef = useRef(false);

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

  // 后台补定位与逆地理编码
  const fillLocation = useCallback(async (id) => {
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
      const lat = loc.coords.latitude;
      const lng = loc.coords.longitude;

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

      /** @type {{ lat: number; lng: number; locationName?: string }} */
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
  }, [loadToday]);

  // ---- 行程提醒对账逻辑 ----
  // 残留缺口说明：
  // 由于桌面小组件运行在独立进程（Android AppWidgetProvider），无法直接调用 Expo Notifications 调度原生提醒；
  // 当用户在桌面小组件打卡顺延行程后，若 App 一直未打开，此前在 App 进程排期的旧提醒仍会误弹。
  // 只有当用户打开或切回 App 时，此处的对账逻辑才会触发，读取最新打卡时间并重新校准/顺延定时提醒。
  const reconcileTripReminder = useCallback(async () => {
    try {
      const activeTripId = await getCurrentTripId();
      if (!activeTripId) {
        await cancelTripReminder();
        return;
      }
      const today = await getTodayRecords();
      const tripRecords = today.filter((r) => r.tripId === activeTripId);
      if (!tripRecords.length) {
        await cancelTripReminder();
        return;
      }
      const lastRecord = tripRecords[tripRecords.length - 1];
      const elapsedSec = (Date.now() - lastRecord.timestamp) / 1000;
      const remainingSec = REMINDER_DELAY_SEC - elapsedSec;
      if (remainingSec > 0) {
        await scheduleTripReminder(
          t('notification.tripReminderTitle'),
          t('notification.tripReminderBody'),
          remainingSec
        );
      } else {
        await cancelTripReminder();
      }
    } catch (e) {}
  }, [t]);

  // 前台唤醒时静默补定位与行程提醒对账
  useEffect(() => {
    reconcileTripReminder();
    const sub = AppState.addEventListener('change', async (nextState) => {
      if (nextState === 'active') {
        reconcileTripReminder();
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
  }, [loadToday, fillLocation, reconcileTripReminder]);

  // 一键打卡（轻按打卡，长按结束行程）
  const handleCheckIn = useCallback(async (isEndTrip = false) => {
    if (checkingInRef.current) return;
    checkingInRef.current = true;
    setLoading(true);
    const hadActiveBefore = hasActiveTrip;
    try {
      const targetMode = /** @type {TransportMode} */ (mode);
      const { id, tripId } = await quickCheckIn({ mode: targetMode });
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
  }, [hasActiveTrip, mode, loadToday, t, fillLocation]);

  const handleLocBarPress = useCallback(async () => {
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
  }, [locStatus, fillLocation]);

  // 主打卡按钮手势交互
  const handleCheckinPressIn = useCallback(() => {
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
  }, [loading, success, checkinScale, chargeProgress]);

  const handleCheckinPressOut = useCallback(() => {
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
  }, [checkinScale, chargeProgress]);

  const handleCheckinLongPress = useCallback(() => {
    if (loading || success) return;
    isChargingLongRef.current = true;
    handleCheckIn(true);
  }, [loading, success, handleCheckIn]);

  const handleCheckinPress = useCallback(() => {
    if (isChargingLongRef.current) return;
    handleCheckIn(false);
  }, [handleCheckIn]);

  // 显式结束当前行程
  const handleDirectEndTrip = useCallback(async (tripId) => {
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
  }, [loadToday, t]);

  // 撤销操作（打卡或结束行程）
  const handleUndo = useCallback(async () => {
    if (!undoAction) return;
    const action = undoAction;
    setUndoAction(null);
    try {
      if (action.type === 'checkin' && action.recordId) {
        await deleteRecord(action.recordId);
      } else if (action.type === 'endTrip' && action.tripId) {
        await setCurrentTripId(action.tripId);
        await scheduleTripReminder(t('notification.tripReminderTitle'), t('notification.tripReminderBody'));
      }
      Vibration.vibrate(20);
      await loadToday();
      refreshTravelWidgets();
      notifyDataChanged();
    } catch (e) {}
  }, [undoAction, loadToday, t]);

  return {
    loading,
    success,
    locStatus,
    setLocStatus,
    activeLocStatus,
    locAnim,
    locTargetRef,
    fillLocation,
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
    handleCheckIn,
  };
}
