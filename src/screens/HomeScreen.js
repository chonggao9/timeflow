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
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle } from 'react-native-svg';
import * as Location from 'expo-location';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
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
  getLastMode,
  setLastMode,
  getRecordsFingerprint,
} from '../storage/store';
import { computePathStats, placeKey, UNNAMED, isPlaceholderName, formatDuration, formatTime } from '../utils/stats';
import { getPlaceOptions } from '../utils/analytics';
import { useTheme } from '../theme/ThemeContext';
import { useI18n } from '../i18n/LanguageContext';
import { getPositionFast, reverseGeocodeWithTimeout } from '../utils/location';
import { refreshWidget } from '../utils/widgetRefresh';
import { runBackupIfDue } from '../backup/schedule';
import Timeline from '../components/Timeline';
import ModeIcon from '../components/ModeIcon';
import PomodoroTimer from '../components/PomodoroTimer';
import RouteMapScreen from './RouteMapScreen';
import TripReceiptModal from '../components/TripReceiptModal';
import BackfillModal from '../components/BackfillModal';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const makeId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const PRIMARY_MODES = ['walk', 'bike', 'drive', 'taxi', 'subway'];
const MORE_MODES = ['transit', 'train', 'flight', 'boat'];

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { t, formatDate, lang } = useI18n();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [scene, setScene] = useState('travel'); // 'travel' | 'focus'
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
  const [estimate, setEstimate] = useState(null);
  const [hasActiveTrip, setHasActiveTrip] = useState(false);
  const [locStatus, setLocStatus] = useState(null);
  const [activeLocStatus, setActiveLocStatus] = useState(null);
  const locAnim = useRef(new Animated.Value(0)).current;
  const locTargetRef = useRef(null);
  const fillSeqRef = useRef(0);
  const checkingInRef = useRef(false);
  const pathStatsCacheRef = useRef({ fp: null, stats: [] });

  const [commonPlaces, setCommonPlaces] = useState([]);
  const [renameTarget, setRenameTarget] = useState(null);
  const [draftName, setDraftName] = useState('');
  const [draftMode, setDraftMode] = useState('walk');
  const [draftTimestamp, setDraftTimestamp] = useState(Date.now());

  // 主打卡按钮物理下潜与环形蓄力充能进度
  const checkinScale = useRef(new Animated.Value(1)).current;
  const chargeProgress = useRef(new Animated.Value(0)).current;
  const isChargingLongRef = useRef(false);

  // 补卡相关状态
  const [backfillVisible, setBackfillVisible] = useState(false);

  // 更多出行方式弹窗
  const [showMoreModes, setShowMoreModes] = useState(false);

  // 路段出行方式修改弹窗
  const [segmentTarget, setSegmentTarget] = useState(null);

  // 地图与小票
  const [mapTrip, setMapTrip] = useState(null);
  const [receiptTrip, setReceiptTrip] = useState(null);

  const loadToday = useCallback(async () => {
    const today = await getTodayRecords();
    const sorted = today.sort((a, b) => a.timestamp - b.timestamp);
    setRecords(sorted);
    const trip = await getCurrentTripId();
    setHasActiveTrip(!!trip);

    // 常用地点快选（Top 5 最高频地名）
    try {
      const all = await getRecords();
      const options = getPlaceOptions(all);
      const topPlaces = options
        .map((o) => o.name)
        .filter((nm) => nm && !isPlaceholderName(nm) && nm !== UNNAMED)
        .slice(0, 5);
      setCommonPlaces(topPlaces);
    } catch (e) {}
    return sorted;
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

  // 前台唤醒时静默补定位
  useEffect(() => {
    const sub = AppState.addEventListener('change', async (nextState) => {
      if (nextState === 'active') {
        const today = await loadToday();
        if (today && today.length) {
          const latest = today[today.length - 1];
          const age = Date.now() - latest.timestamp;
          if ((latest.lat == null || latest.lng == null) && age < 10 * 60 * 1000) {
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
    const travelRecs = records.filter((r) => r.mode !== 'focus');
    if (travelRecs.length < 1) {
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
      const last = travelRecs[travelRecs.length - 1];
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
    const tnow = Date.now();
    try {
      const tripId = await ensureTrip();
      const id = makeId();
      await saveRecord({
        id,
        timestamp: tnow,
        locationName: UNNAMED,
        lat: null,
        lng: null,
        mode,
        tripId,
      });
      await setLastMode(mode);

      if (isEndTrip) {
        await endTrip();
      }

      setLoading(false);
      setSuccess(isEndTrip ? 'ended' : true);
      if (isEndTrip) {
        Vibration.vibrate(40);
      } else {
        Vibration.vibrate(15);
      }

      await loadToday();
      refreshWidget();
      runBackupIfDue().catch(() => {});
      setTimeout(() => setSuccess(false), isEndTrip ? 1500 : 1200);

      fillLocation(id);
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

      const patch = { lat, lng };
      if (addr && isPlaceholderName(current.locationName)) {
        patch.locationName = addr;
      }
      await updateRecord(id, patch);
      await loadToday();
      refreshWidget();
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

  // ---- 打卡点编辑 ----
  const openRename = (record) => {
    setRenameTarget(record);
    setDraftName(record.locationName && record.locationName !== UNNAMED ? record.locationName : '');
    setDraftMode(record.mode || 'walk');
    setDraftTimestamp(record.timestamp || Date.now());
  };
  const closeRename = () => {
    setRenameTarget(null);
    setDraftName('');
    setDraftMode('walk');
    setDraftTimestamp(Date.now());
  };
  const confirmRename = async () => {
    if (!renameTarget) return;
    const name = draftName.trim();
    if (!name) {
      Alert.alert(t('home.renameEmpty'));
      return;
    }
    await updateRecord(renameTarget.id, {
      locationName: name,
      mode: draftMode,
      timestamp: draftTimestamp,
    });
    closeRename();
    await loadToday();
    refreshWidget();
  };

  const handleModalEndTrip = async () => {
    await endTrip();
    closeRename();
    await loadToday();
    Alert.alert(t('trip.endedTitle', '提示'), t('trip.endedToast'));
  };

  const confirmDelete = () => {
    if (!renameTarget) return;
    Alert.alert(t('home.deleteTitle'), t('home.deleteBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: async () => {
          await deleteRecord(renameTarget.id);
          setLocStatus(null);
          closeRename();
          await loadToday();
          refreshWidget();
        },
      },
    ]);
  };

  // ---- 补记打卡（BackfillModal） ----
  const handleSaveBackfill = async (data) => {
    if (checkingInRef.current) return;
    checkingInRef.current = true;
    const tCheckin = Date.now() - data.offsetMin * 60 * 1000;
    try {
      const tripId = await ensureTrip();
      const id = makeId();
      await saveRecord({
        id,
        timestamp: tCheckin,
        locationName: data.locationName,
        lat: null,
        lng: null,
        mode: data.mode,
        tripId,
      });
      Vibration.vibrate(25);
      setBackfillVisible(false);
      await loadToday();
      refreshWidget();
      runBackupIfDue().catch(() => {});
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
    refreshWidget();
  };

  // ---- 室内专注处理 ----
  const handleStartFocus = async (data) => {
    try {
      await AsyncStorage.setItem(
        'timeflow_active_focus',
        JSON.stringify({
          startTs: Date.now(),
          durationSec: data.durationSec,
          goalName: data.goalName,
        })
      );
      refreshWidget();
    } catch (e) {}
  };

  const handleSaveFocus = async (data) => {
    const tnow = Date.now();
    try {
      await AsyncStorage.removeItem('timeflow_active_focus');
      const tripId = await ensureTrip();
      const id = makeId();
      await saveRecord({
        id,
        timestamp: tnow,
        locationName: data.goalName,
        lat: null,
        lng: null,
        mode: 'focus',
        tripId,
        duration: data.duration,
        category: data.category,
        note: data.note,
      });
      Vibration.vibrate(40);
      await loadToday();
      refreshWidget();
      runBackupIfDue().catch(() => {});
    } catch (e) {
      Alert.alert(t('home.failTitle'), t('home.failBody'));
    }
  };

  const handleUpdateFocusRecord = async (id, patch) => {
    await updateRecord(id, patch);
    await loadToday();
    refreshWidget();
  };

  const handleDeleteFocusRecord = async (id) => {
    await deleteRecord(id);
    await loadToday();
    refreshWidget();
  };

  // ---- 数据分离与统计 ----
  const dateStr = formatDate(new Date());

  // 1. 行程轨迹专属数据（严格排除 focus）
  const travelRecords = useMemo(
    () => records.filter((r) => r.mode !== 'focus'),
    [records]
  );
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
  const focusRecords = useMemo(
    () => records.filter((r) => r.mode === 'focus'),
    [records]
  );
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

          {/* 右侧：模式切换分段器 (🚗 行程轨迹 vs ⏱ 室内专注) */}
          <View style={styles.sceneToggleWrap}>
            <TouchableOpacity
              style={[styles.sceneToggleBtn, scene === 'travel' && styles.sceneToggleBtnActive]}
              onPress={() => setScene('travel')}
              activeOpacity={0.7}
            >
              <Ionicons
                name="car-outline"
                size={15}
                color={scene === 'travel' ? '#B3302C' : '#5C4B43'}
              />
              <Text style={[styles.sceneToggleText, scene === 'travel' && styles.sceneToggleTextActive]}>
                {t('home.sceneTravel', '行程轨迹').replace(/^[^\w\u4e00-\u9fa5]+\s*/, '')}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.sceneToggleBtn, scene === 'focus' && styles.sceneToggleBtnActive]}
              onPress={() => setScene('focus')}
              activeOpacity={0.7}
            >
              <Ionicons
                name="timer-outline"
                size={15}
                color={scene === 'focus' ? '#B3302C' : '#5C4B43'}
              />
              <Text style={[styles.sceneToggleText, scene === 'focus' && styles.sceneToggleTextActive]}>
                {t('home.sceneFocus', '室内专注').replace(/^[^\w\u4e00-\u9fa5]+\s*/, '')}
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
              estimate={estimate}
              onRename={openRename}
              onShowMap={setMapTrip}
              onShowReceipt={setReceiptTrip}
              onChangeSegmentMode={handleOpenSegmentMode}
              hasActiveTrip={hasActiveTrip}
            />
          </ScrollView>

          {/* 底部操作区：出行方式 + 补记 + 打卡 */}
          <View style={styles.bottomComposer}>
            {/* 出行方式 6 宫格 */}
            <View style={styles.modesGrid}>
              {PRIMARY_MODES.map((m) => {
                const isSelected = mode === m;
                return (
                  <TouchableOpacity
                    key={'mode-btn-' + m}
                    style={[styles.modeBtn, isSelected && styles.modeBtnActive]}
                    onPress={async () => {
                      setMode(m);
                      await setLastMode(m);
                    }}
                    activeOpacity={0.7}
                  >
                    <ModeIcon mode={m} size={20} color={isSelected ? '#B3302C' : '#4A3F39'} />
                    <Text style={[styles.modeBtnText, isSelected && styles.modeBtnTextActive]}>
                      {t('mode.' + m)}
                    </Text>
                  </TouchableOpacity>
                );
              })}

              {/* 第 6 个：更多 */}
              <TouchableOpacity
                style={[
                  styles.modeBtnMore,
                  MORE_MODES.includes(mode) && styles.modeBtnActive,
                ]}
                onPress={() => setShowMoreModes(true)}
                activeOpacity={0.7}
              >
                <Ionicons
                  name="ellipsis-horizontal"
                  size={20}
                  color={MORE_MODES.includes(mode) ? '#B3302C' : '#4A3F39'}
                />
                <Text
                  style={[
                    styles.modeBtnText,
                    MORE_MODES.includes(mode) && styles.modeBtnTextActive,
                  ]}
                >
                  {MORE_MODES.includes(mode) ? t('mode.' + mode) : t('home.moreModes')}
                </Text>
              </TouchableOpacity>
            </View>

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

              {/* 核心打卡主按钮（带物理下潜与环形蓄力充能） */}
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
                        <Text style={styles.checkinBtnTitle}>{t('checkin.btn')}</Text>
                        <Text style={styles.checkinBtnSub}>{t('checkin.hint')}</Text>
                      </View>
                    </View>
                  )}
                </Pressable>
              </Animated.View>
            </View>
          </View>
        </>
      ) : (
        /* 室内专注模式 */
        <View
          style={[
            styles.focusContainer,
            isFocusRunning && { paddingTop: insets.top, paddingBottom: insets.bottom, flex: 1 },
          ]}
        >
          <PomodoroTimer
            onStartFocus={handleStartFocus}
            onSaveFocus={handleSaveFocus}
            todayFocusCount={focusCount}
            todayFocusSec={todayFocusSec}
            todayFocusRecords={focusRecords}
            onUpdateRecord={handleUpdateFocusRecord}
            onDeleteRecord={handleDeleteFocusRecord}
            onGoInsights={() => navigation.navigate('Insights')}
            onRunningChange={setIsFocusRunning}
          />
        </View>
      )}

      {/* 补记抽屉面板 */}
      <BackfillModal
        visible={backfillVisible}
        onClose={() => setBackfillVisible(false)}
        onSave={handleSaveBackfill}
        commonPlaces={commonPlaces}
        initialMode={mode}
      />

      {/* 地名编辑弹窗 */}
      <Modal visible={!!renameTarget} transparent animationType="fade" onRequestClose={closeRename}>
        <View style={styles.overlay}>
          <View style={styles.dialog}>
            <Text style={styles.dialogTitle}>{t('home.renameTitle')}</Text>
            <Text style={styles.dialogSub}>{t('home.renameSub')}</Text>
            <TextInput
              style={styles.input}
              value={draftName}
              onChangeText={setDraftName}
              placeholder={t('home.renamePlaceholder')}
              placeholderTextColor="#9A8A80"
              autoFocus={false}
              returnKeyType="done"
              onSubmitEditing={confirmRename}
            />

            {/* 常用地点快选 */}
            {commonPlaces.length > 0 && (
              <View style={styles.quickPlaceWrap}>
                <View style={styles.chipRow}>
                  {commonPlaces.map((place, pIdx) => {
                    const isSelected = draftName === place;
                    return (
                      <TouchableOpacity
                        key={'rename-place-' + pIdx}
                        style={[styles.quickChip, isSelected && styles.quickChipActive]}
                        onPress={() => setDraftName(place)}
                        activeOpacity={0.7}
                      >
                        <Ionicons
                          name="location-outline"
                          size={12}
                          color={isSelected ? '#B3302C' : '#5C4B43'}
                        />
                        <Text style={[styles.quickChipText, isSelected && styles.quickChipTextActive]}>
                          {place}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            )}

            {/* 修改打卡时间 */}
            <Text style={styles.dialogSectionLabel}>{t('home.editTime')}</Text>
            <View style={styles.timeEditRow}>
              <View style={styles.timeDisplayPill}>
                <Ionicons name="time-outline" size={16} color="#B3302C" />
                <Text style={styles.timeDisplayText}>{formatTime(draftTimestamp)}</Text>
              </View>
              <View style={styles.timeOffsetBtns}>
                {[-10, -5, 5, 10].map((delta) => (
                  <TouchableOpacity
                    key={'time-adj-' + delta}
                    style={styles.timeOffsetBtn}
                    onPress={() => setDraftTimestamp((prev) => prev + delta * 60 * 1000)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.timeOffsetBtnText}>
                      {delta > 0 ? `+${delta}分` : `${delta}分`}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* 修改出行方式 */}
            <Text style={styles.dialogSectionLabel}>{t('home.editMode')}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dialogModeScroll}>
              {[...PRIMARY_MODES, ...MORE_MODES].map((m) => {
                const isSelected = draftMode === m;
                return (
                  <TouchableOpacity
                    key={'rename-mode-' + m}
                    style={[styles.dialogModeChip, isSelected && styles.dialogModeChipActive]}
                    onPress={() => setDraftMode(m)}
                    activeOpacity={0.7}
                  >
                    <ModeIcon mode={m} size={15} color={isSelected ? '#B3302C' : '#5C4B43'} />
                    <Text style={[styles.dialogModeChipText, isSelected && styles.dialogModeChipTextActive]}>
                      {t('mode.' + m)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* 设为终点与删除 */}
            <View style={styles.dialogActionRow}>
              {hasActiveTrip && (
                <TouchableOpacity style={styles.endTripBtn} onPress={handleModalEndTrip}>
                  <Ionicons name="flag-outline" size={14} color="#5C4B43" />
                  <Text style={styles.endTripBtnText}>{t('trip.markAsEnd')}</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={styles.deleteLink} onPress={confirmDelete}>
                <Ionicons name="trash-outline" size={14} color="#D63B3B" />
                <Text style={styles.deleteLinkText}>{t('home.deleteBtn')}</Text>
              </TouchableOpacity>
            </View>

            {/* 确认 / 取消 */}
            <View style={styles.dialogButtons}>
              <TouchableOpacity style={styles.dialogBtnCancel} onPress={closeRename}>
                <Text style={styles.dialogBtnCancelText}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.dialogBtnConfirm} onPress={confirmRename}>
                <Text style={styles.dialogBtnConfirmText}>{t('common.save')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* 修改路段出行方式弹窗 */}
      <Modal visible={!!segmentTarget} transparent animationType="fade" onRequestClose={() => setSegmentTarget(null)}>
        <View style={styles.overlay}>
          <View style={styles.dialog}>
            <Text style={styles.dialogTitle}>{t('home.changeSegmentMode')}</Text>
            <View style={styles.segModeGrid}>
              {[...PRIMARY_MODES, ...MORE_MODES].map((m) => {
                const isCur = (segmentTarget?.mode || 'walk') === m;
                return (
                  <TouchableOpacity
                    key={'seg-mode-' + m}
                    style={[styles.segModeItem, isCur && styles.segModeItemActive]}
                    onPress={() => handleConfirmSegmentMode(m)}
                    activeOpacity={0.7}
                  >
                    <ModeIcon mode={m} size={18} color={isCur ? '#B3302C' : '#5C4B43'} />
                    <Text style={[styles.segModeText, isCur && styles.segModeTextActive]}>
                      {t('mode.' + m)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <TouchableOpacity style={styles.dialogBtnCancelFull} onPress={() => setSegmentTarget(null)}>
              <Text style={styles.dialogBtnCancelText}>{t('common.cancel')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* 更多出行方式弹窗 */}
      <Modal visible={showMoreModes} transparent animationType="fade" onRequestClose={() => setShowMoreModes(false)}>
        <View style={styles.overlay}>
          <View style={styles.dialog}>
            <Text style={styles.dialogTitle}>{t('home.moreModesTitle')}</Text>
            <View style={styles.segModeGrid}>
              {MORE_MODES.map((m) => {
                const isCur = mode === m;
                return (
                  <TouchableOpacity
                    key={'more-mode-' + m}
                    style={[styles.segModeItem, isCur && styles.segModeItemActive]}
                    onPress={async () => {
                      setMode(m);
                      await setLastMode(m);
                      setShowMoreModes(false);
                    }}
                    activeOpacity={0.7}
                  >
                    <ModeIcon mode={m} size={20} color={isCur ? '#B3302C' : '#5C4B43'} />
                    <Text style={[styles.segModeText, isCur && styles.segModeTextActive]}>
                      {t('mode.' + m)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <TouchableOpacity style={styles.dialogBtnCancelFull} onPress={() => setShowMoreModes(false)}>
              <Text style={styles.dialogBtnCancelText}>{t('common.cancel')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* 轨迹地图模态框 */}
      {mapTrip && (
        <RouteMapScreen
          visible={!!mapTrip}
          trip={mapTrip}
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

const makeStyles = (colors) =>
  StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: '#FBF4ED',
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
      color: '#2B1F1A',
      lineHeight: 28,
    },
    date: {
      fontSize: 12,
      color: '#6F5F57',
      lineHeight: 16,
      marginTop: 2,
    },
    sceneToggleWrap: {
      flexDirection: 'row',
      backgroundColor: '#F1E6DC',
      borderRadius: 14,
      padding: 3,
      gap: 2,
    },
    sceneToggleBtn: {
      height: 40,
      paddingHorizontal: 12,
      borderRadius: 11,
      backgroundColor: 'transparent',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
    },
    sceneToggleBtnActive: {
      backgroundColor: '#fff',
      shadowColor: '#502814',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.12,
      shadowRadius: 3,
      elevation: 2,
    },
    sceneToggleText: {
      fontSize: 13,
      fontWeight: '600',
      color: '#5C4B43',
    },
    sceneToggleTextActive: {
      fontWeight: '700',
      color: '#B3302C',
    },
    statsCard: {
      flexDirection: 'row',
      marginHorizontal: 16,
      marginBottom: 10,
      paddingVertical: 8,
      backgroundColor: '#fff',
      borderWidth: 1,
      borderColor: '#EFE2D7',
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
      borderColor: '#EFE2D7',
    },
    statsValue: {
      fontSize: 18,
      fontWeight: '800',
      color: '#2B1F1A',
      lineHeight: 22,
    },
    statsLabel: {
      fontSize: 11,
      color: '#6F5F57',
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
      backgroundColor: '#FBF4ED',
      paddingHorizontal: 12,
      paddingTop: 10,
      paddingBottom: Platform.OS === 'ios' ? 14 : 10,
      shadowColor: '#784628',
      shadowOffset: { width: 0, height: -6 },
      shadowOpacity: 0.07,
      shadowRadius: 14,
      elevation: 8,
    },
    modesGrid: {
      flexDirection: 'row',
      gap: 6,
      marginBottom: 10,
    },
    modeBtn: {
      flex: 1,
      height: 58,
      borderRadius: 14,
      borderWidth: 1.5,
      borderColor: '#EADDD2',
      backgroundColor: '#fff',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 3,
    },
    modeBtnActive: {
      borderColor: '#D63B3B',
      backgroundColor: '#FDE9E6',
    },
    modeBtnMore: {
      flex: 1,
      height: 58,
      borderRadius: 14,
      borderWidth: 1.5,
      borderColor: '#CDBCAF',
      borderStyle: 'dashed',
      backgroundColor: 'transparent',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 3,
    },
    modeBtnText: {
      fontSize: 12,
      fontWeight: '600',
      color: '#4A3F39',
    },
    modeBtnTextActive: {
      fontWeight: '800',
      color: '#B3302C',
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
      borderColor: '#E4D5C9',
      backgroundColor: '#fff',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 2,
    },
    backfillSquareText: {
      fontSize: 12,
      fontWeight: '800',
      color: '#B3302C',
    },
    checkinMainBtn: {
      width: '100%',
      height: 60,
      borderRadius: 18,
      backgroundColor: '#D63B3B',
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: '#D63B3B',
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.32,
      shadowRadius: 14,
      elevation: 6,
      position: 'relative',
      overflow: 'hidden',
    },
    checkinBtnEnded: {
      backgroundColor: '#5C4B43',
      shadowColor: '#5C4B43',
    },
    checkinBtnSuccess: {
      backgroundColor: '#2E9E6B',
      shadowColor: '#2E9E6B',
    },
    chargeFill: {
      position: 'absolute',
      top: 0,
      left: 0,
      bottom: 0,
      backgroundColor: '#FFFFFF',
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
      color: '#fff',
      letterSpacing: 4,
      lineHeight: 24,
    },
    checkinBtnSub: {
      fontSize: 11,
      fontWeight: '600',
      color: '#fff',
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
      backgroundColor: '#FDE9E6',
      borderWidth: 1,
      borderColor: '#D63B3B',
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 10,
    },
    timeDisplayText: {
      fontSize: 15,
      fontWeight: '800',
      color: '#B3302C',
    },
    timeOffsetBtns: {
      flexDirection: 'row',
      gap: 6,
    },
    timeOffsetBtn: {
      paddingHorizontal: 9,
      paddingVertical: 6,
      backgroundColor: '#F8F1EA',
      borderWidth: 1,
      borderColor: '#EADDD2',
      borderRadius: 8,
    },
    timeOffsetBtnText: {
      fontSize: 12,
      fontWeight: '700',
      color: '#5C4B43',
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
      backgroundColor: '#fff',
      borderWidth: 1,
      borderColor: '#EFE2D7',
      shadowColor: '#000',
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
      color: '#6F5F57',
    },
    capsuleTextDanger: {
      fontSize: 12,
      color: '#D63B3B',
      fontWeight: '600',
    },
    overlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.45)',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 20,
    },
    dialog: {
      width: '100%',
      backgroundColor: '#fff',
      borderRadius: 20,
      padding: 20,
    },
    dialogTitle: {
      fontSize: 17,
      fontWeight: '800',
      color: '#2B1F1A',
      marginBottom: 6,
      textAlign: 'center',
    },
    dialogSub: {
      fontSize: 13,
      color: '#6F5F57',
      marginBottom: 14,
      textAlign: 'center',
    },
    input: {
      height: 46,
      borderWidth: 1.5,
      borderColor: '#EADDD2',
      borderRadius: 14,
      paddingHorizontal: 12,
      fontSize: 15,
      color: '#2B1F1A',
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
      backgroundColor: '#F8F1EA',
      borderWidth: 1,
      borderColor: '#EADDD2',
    },
    quickChipActive: {
      backgroundColor: '#FDE9E6',
      borderColor: '#D63B3B',
    },
    quickChipText: {
      fontSize: 12,
      color: '#4A3F39',
      fontWeight: '600',
    },
    quickChipTextActive: {
      color: '#B3302C',
      fontWeight: '700',
    },
    dialogSectionLabel: {
      fontSize: 13,
      fontWeight: '700',
      color: '#5C4B43',
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
      backgroundColor: '#F8F1EA',
      borderWidth: 1,
      borderColor: '#EADDD2',
    },
    dialogModeChipActive: {
      backgroundColor: '#FDE9E6',
      borderColor: '#D63B3B',
    },
    dialogModeChipText: {
      fontSize: 13,
      color: '#4A3F39',
      fontWeight: '600',
    },
    dialogModeChipTextActive: {
      color: '#B3302C',
      fontWeight: '700',
    },
    dialogActionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 10,
      borderTopWidth: 1,
      borderTopColor: '#F3E9E0',
      marginBottom: 10,
    },
    endTripBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    endTripBtnText: {
      fontSize: 13,
      color: '#5C4B43',
      fontWeight: '600',
    },
    deleteLink: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    deleteLinkText: {
      fontSize: 13,
      color: '#D63B3B',
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
      backgroundColor: '#F1E6DC',
      alignItems: 'center',
      justifyContent: 'center',
    },
    dialogBtnCancelFull: {
      width: '100%',
      height: 44,
      borderRadius: 14,
      backgroundColor: '#F1E6DC',
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 10,
    },
    dialogBtnCancelText: {
      fontSize: 14,
      fontWeight: '600',
      color: '#5C4B43',
    },
    dialogBtnConfirm: {
      flex: 1,
      height: 44,
      borderRadius: 14,
      backgroundColor: '#D63B3B',
      alignItems: 'center',
      justifyContent: 'center',
    },
    dialogBtnConfirmText: {
      fontSize: 14,
      fontWeight: '700',
      color: '#fff',
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
      borderColor: '#EADDD2',
      backgroundColor: '#fff',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
    },
    segModeItemActive: {
      borderColor: '#D63B3B',
      backgroundColor: '#FDE9E6',
    },
    segModeText: {
      fontSize: 13,
      fontWeight: '600',
      color: '#4A3F39',
    },
    segModeTextActive: {
      color: '#B3302C',
      fontWeight: '800',
    },
  });
