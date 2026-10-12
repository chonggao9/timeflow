import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Modal,
  AppState,
  Platform,
  AccessibilityInfo,
  BackHandler,
  Animated,
  Easing as RNEasing,
  useWindowDimensions,
} from 'react-native';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withRepeat,
  withSequence,
  runOnJS,
  Easing as ReanimatedEasing,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Ellipse, Path } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Audio } from 'expo-av';
import * as Haptics from 'expo-haptics';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../theme/ThemeContext';
import { useI18n } from '../i18n/LanguageContext';
import { formatDuration } from '../utils/stats';
import {
  FOCUS_CATEGORIES,
  getCategoryMeta,
  normalizeCategory,
} from '../utils/focusCategories';
import FocusHistoryModal from './FocusHistoryModal';

// 时长与手势参数
const DEFAULT_DURATION_MIN = 25;
const MIN_MIN = 5;
const MAX_MIN = 120; // 支持 5~120 分钟
const STEP_MIN = 5;
const STEP_PX = 10;
const HOLD_MS = 1000; // 约 1 秒按住
const ABANDON_CONFIRM_MS = 3000;
const REST_DURATION_MIN = 5;
const REST_DURATION_SEC = REST_DURATION_MIN * 60;

// 时长快捷档位：5 / 15 / 25 / 45 / 60，升序排列，统一不带单位
const DURATION_PRESETS = [5, 15, 25, 45, 60];

// 收获态 8 个彩点散开参数（提取自 Interactive.dc.html）
const BURST_PARTICLES = [
  { dx: -120, dy: -110, color: '#D93A2B', delay: 0 },
  { dx: 0, dy: -150, color: '#E9A23B', delay: 50 },
  { dx: 120, dy: -110, color: '#4E8F4A', delay: 100 },
  { dx: 150, dy: 0, color: '#E9A23B', delay: 0 },
  { dx: 120, dy: 110, color: '#D93A2B', delay: 50 },
  { dx: -150, dy: 0, color: '#4E8F4A', delay: 100 },
  { dx: -120, dy: 110, color: '#D93A2B', delay: 50 },
  { dx: 0, dy: 140, color: '#E9A23B', delay: 0 },
];

const AMBIENT_OPTIONS = [
  { key: 'none', icon: 'volume-mute-outline', label: 'pomodoro.ambient_none' },
  { key: 'rain', icon: 'rainy-outline', label: 'pomodoro.ambient_rain' },
  { key: 'forest', icon: 'leaf-outline', label: 'pomodoro.ambient_forest' },
  { key: 'ocean', icon: 'water-outline', label: 'pomodoro.ambient_ocean' },
  { key: 'fire', icon: 'bonfire-outline', label: 'pomodoro.ambient_fire' },
  { key: 'cafe', icon: 'cafe-outline', label: 'pomodoro.ambient_cafe' },
  { key: 'train', icon: 'train-outline', label: 'pomodoro.ambient_train' },
  { key: 'stream', icon: 'water-outline', label: 'pomodoro.ambient_stream' },
];

const AMBIENT_SOUND_FILES = {
  rain: require('../../assets/sounds/rain.mp3'),
  forest: require('../../assets/sounds/forest.mp3'),
  ocean: require('../../assets/sounds/ocean.mp3'),
  fire: require('../../assets/sounds/fire.mp3'),
  cafe: require('../../assets/sounds/cafe.mp3'),
  train: require('../../assets/sounds/train.mp3'),
  stream: require('../../assets/sounds/stream.mp3'),
};

const STORAGE_KEY_ACTIVE = 'timeflow_active_focus';
const STORAGE_KEY_LAST_CATEGORY = 'timeflow_last_focus_category';
const STORAGE_KEY_SLID_ADJUST = 'timeflow_pomodoro_has_slid';

const CATEGORY_DESC_KEYS = {
  work: 'pomodoro.helpWorkDesc',
  study: 'pomodoro.helpStudyDesc',
  create: 'pomodoro.helpCreateDesc',
  wellbeing: 'pomodoro.helpBodyMindDesc',
  life: 'pomodoro.helpLifeDesc',
  review: 'pomodoro.helpPlanDesc',
};

const clamp = (val, min, max) => Math.max(min, Math.min(max, val));

const hapticImpact = (style) => {
  try {
    Haptics.impactAsync(style).catch(() => {});
  } catch (e) {}
};

const hapticNotify = (type) => {
  try {
    Haptics.notificationAsync(type).catch(() => {});
  } catch (e) {}
};

const makeSessionId = (ts) => `focus-${ts}`;

const formatTime = (secs) => {
  const m = Math.floor(secs / 60);
  const s = Math.max(0, Math.floor(secs % 60));
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
};

// 动态计算番茄成熟颜色：青色(#8DB255) -> 橙黄色(#E9A23B) -> 番茄红(#D93A2B)
const getTomatoColor = (progress) => {
  const pClamped = clamp(progress, 0, 1);
  if (pClamped <= 0.5) {
    const p = pClamped / 0.5;
    const r = Math.round(0x8d + (0xe9 - 0x8d) * p);
    const g = Math.round(0xb2 + (0xa2 - 0xb2) * p);
    const b = Math.round(0x55 + (0x3b - 0x55) * p);
    return `rgb(${r},${g},${b})`;
  } else {
    const p = (pClamped - 0.5) / 0.5;
    const r = Math.round(0xe9 + (0xd9 - 0xe9) * p);
    const g = Math.round(0xa2 + (0x3a - 0xa2) * p);
    const b = Math.round(0x3b + (0x2b - 0x3b) * p);
    return `rgb(${r},${g},${b})`;
  }
};

/**
 * 单个分类 Chip（支持 150~200ms scale 1.05 与颜色高亮动效）
 */
function CategoryChip({ item, isSelected, onSelect, onLayout, t }) {
  const scaleAnim = useRef(new Animated.Value(isSelected ? 1.05 : 1)).current;

  useEffect(() => {
    Animated.timing(scaleAnim, {
      toValue: isSelected ? 1.05 : 1,
      duration: 180,
      easing: RNEasing.out(RNEasing.quad),
      useNativeDriver: true,
    }).start();
  }, [isSelected]);

  return (
    <Animated.View
      style={{ transform: [{ scale: scaleAnim }] }}
      onLayout={(e) => onLayout && onLayout(e.nativeEvent.layout)}
    >
      <TouchableOpacity
        style={[
          styles.catChip,
          isSelected && {
            borderColor: item.color,
            backgroundColor: item.color + '15',
            borderWidth: 1.5,
          },
        ]}
        onPress={onSelect}
        activeOpacity={0.7}
        hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
        accessibilityRole="radio"
        accessibilityState={{ selected: isSelected }}
      >
        <View style={[styles.catChipDot, { backgroundColor: item.color }]} />
        <Text
          numberOfLines={1}
          style={[
            styles.catChipLabel,
            isSelected && { color: item.color, fontWeight: '700' },
          ]}
        >
          {t(item.i18nKey).replace(/^[^\w一-龥]+\s*/, '')}
        </Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

export default function PomodoroTimer({
  onStartFocus,
  onSaveFocus,
  todayFocusCount = 0,
  todayFocusSec = 0,
  todayFocusRecords = [],
  allFocusRecords,
  onUpdateFocusSession,
  onDeleteFocusSession,
  onGoInsights,
  onRunningChange,
}) {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { t, lang } = useI18n();

  // Phase 状态机: 'idle' | 'holding' | 'running' | 'paused' | 'done' | 'resting'
  const [phase, setPhase] = useState('idle');

  // 基础计时状态
  const [durationMin, setDurationMin] = useState(DEFAULT_DURATION_MIN);
  const [timeLeftSec, setTimeLeftSec] = useState(DEFAULT_DURATION_MIN * 60);
  const [category, setCategory] = useState('study'); // 首次使用默认「学习」
  const [goalName, setGoalName] = useState('');
  const [isNoteEditing, setIsNoteEditing] = useState(false);
  const [ambient, setAmbient] = useState('none');

  // 用户是否曾经滑动手势（用于控制“上下滑动调节”提示的展示）
  const [hasSlidAdjust, setHasSlidAdjust] = useState(false);

  // Refs for timestamp logic
  const startTsRef = useRef(null);
  const totalDurationSecRef = useRef(DEFAULT_DURATION_MIN * 60);
  const pausedTotalSecRef = useRef(0);
  const lastPauseTsRef = useRef(null);
  const timerRef = useRef(null);
  const restEndTsRef = useRef(null);
  const categoryRef = useRef('study');
  const sessionIdRef = useRef(null);
  const savedRef = useRef(false);
  const phaseRef = useRef('idle');

  // 分类 Chip 居中滚动计算相关
  const catScrollRef = useRef(null);
  const catChipLayoutsRef = useRef({});
  const catViewportWidthRef = useRef(0);

  const setPhaseAndRef = useCallback((next) => {
    phaseRef.current = next;
    setPhase(next);
  }, []);

  // Ambient sound refs
  const soundRef = useRef(null);
  const playReqIdRef = useRef(0);

  // Toast
  const [toast, setToast] = useState({ visible: false, message: '' });
  const toastTimerRef = useRef(null);

  // 放弃二次确认状态
  const [abandonArmed, setAbandonArmed] = useState(false);
  const abandonArmedRef = useRef(false);
  const abandonTimerRef = useRef(null);

  // 按住开始按钮文案提示
  const [holdEarlyRelease, setHoldEarlyRelease] = useState(false);
  const holdReleaseTimerRef = useRef(null);

  // 休息倒计时
  const [restTimeLeftSec, setRestTimeLeftSec] = useState(REST_DURATION_SEC);

  // 模态弹窗
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showCustomModal, setShowCustomModal] = useState(false);
  const [showAmbientPicker, setShowAmbientPicker] = useState(false);
  const [customMinutesInput, setCustomMinutesInput] = useState(String(DEFAULT_DURATION_MIN));

  // 减弱动效
  const [reduceMotion, setReduceMotion] = useState(false);

  // 拖动调时长手势状态（拖动时禁止外层滚动）
  const [isDragging, setIsDragging] = useState(false);

  // 响应式番茄尺寸计算：放大约 1.4 倍（240 * 1.4 = 336），小屏自适应压缩，杜绝重叠
  const { width: winWidth, height: winHeight } = useWindowDimensions();
  const [dialAreaHeight, setDialAreaHeight] = useState(0);

  const responsiveTomatoSize = useMemo(() => {
    const maxByWidth = Math.max(160, winWidth - 32);
    const maxByHeight = dialAreaHeight > 0
      ? Math.max(160, dialAreaHeight - 36)
      : Math.max(160, winHeight * 0.36);
    return Math.round(Math.min(336, maxByWidth, maxByHeight));
  }, [winWidth, winHeight, dialAreaHeight]);

  const idleTomatoBoxStyle = useMemo(
    () => ({
      width: responsiveTomatoSize,
      height: responsiveTomatoSize,
      alignItems: 'center',
      justifyContent: 'center',
    }),
    [responsiveTomatoSize]
  );

  const dialNumberFontSize = useMemo(() => {
    return responsiveTomatoSize >= 300 ? 56 : Math.max(38, Math.round(responsiveTomatoSize * 0.17));
  }, [responsiveTomatoSize]);

  // ==================== Reanimated 动画系统 ====================
  // 番茄缩放共享值：待开始态 0.85 + 0.15*(min/120)，专注中 0.55 + 0.45*p
  const scaleShared = useSharedValue(0.85 + 0.15 * (DEFAULT_DURATION_MIN / MAX_MIN));
  const breathTranslateY = useSharedValue(0);

  // 原生 Animated（用于背景过渡、按住进度条填充及彩点散开）
  const holdProgressAnim = useRef(new Animated.Value(0)).current;
  const pageBgAnim = useRef(new Animated.Value(0)).current;
  const harvestParticleAnim = useRef(new Animated.Value(0)).current;

  // 今日统计派生
  const totalFocusCountCalculated = todayFocusCount || 0;
  const totalFocusSecCalculated = todayFocusSec || 0;
  const todayFocusRecordsList = todayFocusRecords || [];
  const focusHistoryRecords = allFocusRecords || todayFocusRecordsList;

  // 今日专注统计摘要
  const todaySummary = useMemo(() => {
    const recs = todayFocusRecordsList;
    const count = recs.length || totalFocusCountCalculated;
    let totalSec = 0;
    for (const r of recs) {
      totalSec += Number(r.duration) || 0;
    }
    if (totalSec === 0 && totalFocusSecCalculated > 0) {
      totalSec = totalFocusSecCalculated;
    }
    return { count, totalSec };
  }, [todayFocusRecordsList, totalFocusCountCalculated, totalFocusSecCalculated]);

  const currentAmbient = AMBIENT_OPTIONS.find((a) => a.key === ambient);
  const currentAmbientLabel = currentAmbient
    ? t(currentAmbient.label, currentAmbient.key)
    : t('pomodoro.ambient_none', '无声');

  const selectedCategoryMeta = useMemo(
    () => getCategoryMeta(category, t),
    [category, t]
  );

  // 番茄成熟进度 p (0 到 1)
  const totalSecForCalc = totalDurationSecRef.current || durationMin * 60;
  const tomatoProgress = totalSecForCalc > 0
    ? 1 - Math.min(1, Math.max(0, timeLeftSec) / totalSecForCalc)
    : 0;
  const tomatoFillColor = phase === 'idle'
    ? '#8DB255'
    : phase === 'done'
    ? '#D93A2B'
    : getTomatoColor(tomatoProgress);

  // 阶段提示文案
  const stageHintText = useMemo(() => {
    if (phase === 'paused') return t('pomodoro.pausedLabel', '已暂停');
    if (tomatoProgress >= 0.9) return t('pomodoro.stageRipe', '马上就能收获了');
    if (tomatoProgress >= 0.66) return t('pomodoro.stageRipening', '快熟了');
    if (tomatoProgress >= 0.33) return t('pomodoro.stageTurning', '正在转红');
    return t('pomodoro.stageGreen', '青涩的小番茄');
  }, [phase, tomatoProgress, t]);

  // 平滑滚动选中 Chip 到视口居中
  const scrollToCategoryCenter = useCallback((catKey) => {
    const layout = catChipLayoutsRef.current[catKey];
    const vpW = catViewportWidthRef.current;
    if (layout && vpW && catScrollRef.current) {
      const targetX = layout.x - (vpW - layout.width) / 2;
      catScrollRef.current.scrollTo({
        x: Math.max(0, targetX),
        animated: true,
      });
    }
  }, []);

  const handleSelectCategory = useCallback((catKey) => {
    setCategory(catKey);
    categoryRef.current = catKey;
    hapticImpact(Haptics.ImpactFeedbackStyle.Light);
    scrollToCategoryCenter(catKey);
  }, [scrollToCategoryCenter]);

  // ==================== Effects ====================

  useEffect(() => {
    if (onRunningChange) {
      onRunningChange(phase === 'running' || phase === 'paused' || phase === 'resting');
    }
  }, [phase, onRunningChange]);

  useEffect(() => {
    Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      staysActiveInBackground: true,
      playsInSilentModeIOS: true,
      shouldDuckAndroid: true,
      playThroughEarpieceAndroid: false,
    }).catch(() => {});

    return () => {
      stopAmbientSound();
    };
  }, []);

  // 恢复上次分类（首次默认「学习」）并在布局完成后滚动居中
  useEffect(() => {
    (async () => {
      try {
        const last = await AsyncStorage.getItem(STORAGE_KEY_LAST_CATEGORY);
        const finalCat = (last && normalizeCategory(last)) || 'study';
        setCategory(finalCat);
        categoryRef.current = finalCat;
        setTimeout(() => {
          scrollToCategoryCenter(finalCat);
        }, 300);
      } catch (e) {
        setCategory('study');
        categoryRef.current = 'study';
      }
    })();
  }, [scrollToCategoryCenter]);

  useEffect(() => {
    if (category) {
      categoryRef.current = category;
      AsyncStorage.setItem(STORAGE_KEY_LAST_CATEGORY, category).catch(() => {});
    }
  }, [category]);

  // 恢复是否已滑动手势调节的持久化状态（调节过一次后永久隐藏）
  useEffect(() => {
    (async () => {
      try {
        const slid = await AsyncStorage.getItem(STORAGE_KEY_SLID_ADJUST);
        if (slid === '1') {
          setHasSlidAdjust(true);
        }
      } catch (e) {}
    })();
  }, []);

  useEffect(() => {
    if (Platform.OS === 'android' || Platform.OS === 'ios') {
      Notifications.requestPermissionsAsync().catch(() => {});
    }
  }, []);

  useEffect(() => {
    const check = async () => {
      try {
        const isReduceMotion = await AccessibilityInfo.isReduceMotionEnabled();
        setReduceMotion(isReduceMotion);
      } catch (e) {}
    };
    check();
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'android') return undefined;
    const onBackPress = () => {
      if (phase === 'done' || phase === 'resting') {
        return true;
      }
      return false;
    };
    const sub = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => sub?.remove?.();
  }, [phase]);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      if (abandonTimerRef.current) clearTimeout(abandonTimerRef.current);
      if (holdReleaseTimerRef.current) clearTimeout(holdReleaseTimerRef.current);
      toastTimerRef.current = null;
      abandonTimerRef.current = null;
      holdReleaseTimerRef.current = null;
    };
  }, []);

  // AppState 前后台恢复
  const recoverActiveSessionRef = useRef(null);
  useEffect(() => {
    const sub = AppState.addEventListener('change', async (nextState) => {
      if (nextState === 'active' && (phaseRef.current === 'running' || phaseRef.current === 'paused')) {
        await recoverActiveSessionRef.current?.();
      }
    });
    return () => sub?.remove?.();
  }, []);

  // 计时器主循环
  useEffect(() => {
    if (phase !== 'running' && phase !== 'resting') {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      return;
    }

    timerRef.current = setInterval(() => {
      if (phase === 'resting') {
        const restEnd = restEndTsRef.current;
        const next = restEnd ? Math.max(0, Math.ceil((restEnd - Date.now()) / 1000)) : 0;
        setRestTimeLeftSec(next);
        if (next <= 0) {
          setPhaseAndRef('idle');
          hapticNotify(Haptics.NotificationFeedbackType.Success);
          if (onRunningChange) onRunningChange(false);
        }
        return;
      }
      const remaining = computeRemainingSec();
      setTimeLeftSec(Math.max(0, remaining));
      if (remaining <= 0) {
        handleTimerDone();
      }
    }, 250);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [phase, durationMin, onRunningChange]);

  // ==================== 视觉动画联动 ====================

  // 番茄缩放动画（放大并支持 5~120 范围动态平滑过渡）
  useEffect(() => {
    if (phase === 'idle') {
      const targetScale = 0.85 + 0.15 * (durationMin / MAX_MIN);
      scaleShared.value = withTiming(targetScale, {
        duration: 220,
        easing: ReanimatedEasing.bezier(0.2, 0.8, 0.2, 1),
      });
      Animated.timing(pageBgAnim, {
        toValue: 0,
        duration: 250,
        useNativeDriver: false,
      }).start();
    } else if (phase === 'running' || phase === 'paused') {
      const targetScale = 0.6 + 0.4 * tomatoProgress;
      scaleShared.value = withTiming(targetScale, {
        duration: 350,
        easing: ReanimatedEasing.linear,
      });
      Animated.timing(pageBgAnim, {
        toValue: tomatoProgress,
        duration: 500,
        useNativeDriver: false,
      }).start();
    } else if (phase === 'done') {
      scaleShared.value = 0.8;
      scaleShared.value = withSequence(
        withTiming(1.08, { duration: 280, easing: ReanimatedEasing.out(ReanimatedEasing.quad) }),
        withTiming(1.0, { duration: 180, easing: ReanimatedEasing.inOut(ReanimatedEasing.quad) })
      );
      Animated.timing(pageBgAnim, {
        toValue: 1,
        duration: 450,
        useNativeDriver: false,
      }).start();
    }
  }, [durationMin, phase, tomatoProgress]);

  // 呼吸动画
  useEffect(() => {
    if (phase === 'running' && !reduceMotion) {
      breathTranslateY.value = withRepeat(
        withSequence(
          withTiming(-5, { duration: 1600, easing: ReanimatedEasing.inOut(ReanimatedEasing.sin) }),
          withTiming(0, { duration: 1600, easing: ReanimatedEasing.inOut(ReanimatedEasing.sin) })
        ),
        -1,
        true
      );
    } else {
      breathTranslateY.value = withTiming(0, { duration: 200 });
    }
  }, [phase, reduceMotion]);

  // 收获态彩点散开
  useEffect(() => {
    if (phase === 'done') {
      if (reduceMotion) {
        harvestParticleAnim.setValue(1);
        return;
      }
      harvestParticleAnim.setValue(0);
      Animated.timing(harvestParticleAnim, {
        toValue: 1,
        duration: 900,
        easing: RNEasing.out(RNEasing.quad),
        useNativeDriver: true,
      }).start();
    }
  }, [phase, reduceMotion]);

  const animatedTomatoStyle = useAnimatedStyle(() => {
    return {
      transform: [
        { scale: scaleShared.value },
        { translateY: breathTranslateY.value },
      ],
    };
  });

  // ==================== Core Timer Logic ====================

  const computeRemainingSec = useCallback(() => {
    if (!startTsRef.current) return durationMin * 60;
    const now = Date.now();
    let elapsed = (now - startTsRef.current) / 1000;

    let currentPause = 0;
    if (lastPauseTsRef.current) {
      currentPause = (now - lastPauseTsRef.current) / 1000;
    }
    elapsed -= pausedTotalSecRef.current + currentPause;

    const remaining = totalDurationSecRef.current - elapsed;
    return Math.ceil(remaining);
  }, [durationMin]);

  const persistActiveSession = useCallback(async () => {
    const payload = {
      sessionId: sessionIdRef.current,
      phase: phaseRef.current,
      startTs: startTsRef.current,
      totalDurationSec: totalDurationSecRef.current,
      durationSec: totalDurationSecRef.current,
      pausedTotalSec: pausedTotalSecRef.current,
      lastPauseTs: lastPauseTsRef.current,
      category: categoryRef.current,
      goalName: goalName.trim() || t('home.unnamedFocus', '未命名专注'),
      durationMin,
      ambient,
    };
    try {
      await AsyncStorage.setItem(STORAGE_KEY_ACTIVE, JSON.stringify(payload));
    } catch (e) {}
  }, [durationMin, ambient, t, goalName]);

  const clearActiveSession = useCallback(async () => {
    try {
      await AsyncStorage.removeItem(STORAGE_KEY_ACTIVE);
    } catch (e) {}
  }, []);

  const recoverActiveSession = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY_ACTIVE);
      if (!raw) return;
      const data = JSON.parse(raw);
      if (!data || !data.startTs) return;

      if (savedRef.current) return;

      const total = data.totalDurationSec || data.durationSec || data.durationMin * 60 || durationMin * 60;
      const pausedSoFar = data.pausedTotalSec || 0;

      let extraPause = 0;
      if (data.phase === 'paused' && data.lastPauseTs) {
        extraPause = (Date.now() - data.lastPauseTs) / 1000;
      }

      const elapsed = (Date.now() - data.startTs) / 1000 - pausedSoFar - extraPause;
      const remaining = Math.ceil(total - elapsed);

      startTsRef.current = data.startTs;
      totalDurationSecRef.current = total;
      pausedTotalSecRef.current = pausedSoFar;
      lastPauseTsRef.current = data.lastPauseTs || null;
      sessionIdRef.current = data.sessionId;
      categoryRef.current = data.category || 'study';
      setCategory(data.category || 'study');
      setGoalName(data.goalName || '');
      setAmbient(data.ambient || 'none');
      setDurationMin(data.durationMin || DEFAULT_DURATION_MIN);

      if (data.phase === 'running' && remaining <= 0) {
        setTimeLeftSec(0);
        setPhaseAndRef('done');
      } else if (data.phase === 'running') {
        setTimeLeftSec(Math.max(0, remaining));
        setPhaseAndRef('running');
        await scheduleNotification();
      } else {
        setTimeLeftSec(Math.max(0, remaining));
        setPhaseAndRef(data.phase);
      }
    } catch (e) {}
  }, [durationMin]);

  recoverActiveSessionRef.current = recoverActiveSession;

  const scheduleNotification = useCallback(async () => {
    try {
      await Notifications.cancelAllScheduledNotificationsAsync();
      if (phaseRef.current !== 'running' || !startTsRef.current) return;
      const endTime = startTsRef.current + totalDurationSecRef.current * 1000 - pausedTotalSecRef.current * 1000;
      const trigger = new Date(endTime);
      if (trigger <= new Date()) return;

      await Notifications.scheduleNotificationAsync({
        content: {
          title: t('pomodoro.harvestTitle', '收获一颗番茄'),
          body: t('pomodoro.doneBody', '番茄钟时间到了，快来查看你的收获吧'),
          sound: 'default',
        },
        trigger: { type: 'date', date: trigger },
      });
    } catch (e) {}
  }, [t]);

  const cancelNotification = useCallback(async () => {
    try {
      await Notifications.cancelAllScheduledNotificationsAsync();
    } catch (e) {}
  }, []);

  const playAmbientSound = useCallback(async (key) => {
    const reqId = ++playReqIdRef.current;

    if (soundRef.current) {
      const prev = soundRef.current;
      soundRef.current = null;
      try {
        await prev.stopAsync();
        await prev.unloadAsync();
      } catch (e) {}
    }

    if (key === 'none' || !AMBIENT_SOUND_FILES[key]) return;

    try {
      const { sound } = await Audio.Sound.createAsync(
        AMBIENT_SOUND_FILES[key],
        {
          shouldPlay: true,
          isLooping: true,
          volume: 0.7,
        }
      );
      if (reqId !== playReqIdRef.current) {
        await sound.stopAsync().catch(() => {});
        await sound.unloadAsync().catch(() => {});
        return;
      }
      soundRef.current = sound;
      await sound.playAsync();
    } catch (err) {}
  }, []);

  const stopAmbientSound = useCallback(async () => {
    playReqIdRef.current++;
    if (soundRef.current) {
      const cur = soundRef.current;
      soundRef.current = null;
      try {
        await cur.stopAsync();
        await cur.unloadAsync();
      } catch (e) {}
    }
  }, []);

  const pauseAmbientSound = useCallback(async () => {
    if (soundRef.current) {
      try {
        await soundRef.current.pauseAsync();
      } catch (e) {}
    }
  }, []);

  const resumeAmbientSound = useCallback(async () => {
    if (soundRef.current) {
      try {
        await soundRef.current.playAsync();
      } catch (e) {}
    } else if (ambient !== 'none') {
      await playAmbientSound(ambient);
    }
  }, [ambient, playAmbientSound]);

  const showToast = useCallback((message) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ visible: true, message });
    toastTimerRef.current = setTimeout(() => {
      setToast({ visible: false, message: '' });
    }, 1500);
  }, []);

  const startFocus = useCallback(async () => {
    hapticImpact(Haptics.ImpactFeedbackStyle.Heavy);
    const now = Date.now();
    const totalSec = durationMin * 60;
    startTsRef.current = now;
    totalDurationSecRef.current = totalSec;
    pausedTotalSecRef.current = 0;
    lastPauseTsRef.current = null;
    sessionIdRef.current = makeSessionId(now);
    savedRef.current = false;
    setTimeLeftSec(totalSec);
    setPhaseAndRef('running');

    if (onStartFocus) {
      onStartFocus({
        durationSec: totalSec,
        goalName: goalName.trim() || t('home.unnamedFocus', '未命名专注'),
        category: categoryRef.current || 'study',
      });
    }

    await persistActiveSession();
    await scheduleNotification();
    if (ambient !== 'none') {
      await playAmbientSound(ambient);
    }
  }, [durationMin, goalName, t, onStartFocus, persistActiveSession, scheduleNotification, ambient, playAmbientSound]);

  const handleTimerDone = useCallback(async () => {
    if (phaseRef.current !== 'running') return;
    setPhaseAndRef('done');
    setTimeLeftSec(0);
    hapticNotify(Haptics.NotificationFeedbackType.Success);
    await cancelNotification();
    await stopAmbientSound();
    await clearActiveSession();
  }, [cancelNotification, stopAmbientSound, clearActiveSession]);

  const pauseFocus = useCallback(async () => {
    if (phase !== 'running') return;
    lastPauseTsRef.current = Date.now();
    setPhaseAndRef('paused');
    await persistActiveSession();
    await cancelNotification();
    await pauseAmbientSound();
  }, [phase, persistActiveSession, cancelNotification, pauseAmbientSound]);

  const resumeFocus = useCallback(async () => {
    if (phase !== 'paused') return;
    if (lastPauseTsRef.current) {
      const pauseDuration = (Date.now() - lastPauseTsRef.current) / 1000;
      pausedTotalSecRef.current += pauseDuration;
      lastPauseTsRef.current = null;
    }
    setPhaseAndRef('running');
    await persistActiveSession();
    await scheduleNotification();
    await resumeAmbientSound();
  }, [phase, persistActiveSession, scheduleNotification, resumeAmbientSound]);

  // 放弃专注（二次确认机制；确认放弃后清空任务名）
  const abandonFocus = useCallback(async () => {
    if (abandonArmedRef.current) {
      abandonArmedRef.current = false;
      if (abandonTimerRef.current) {
        clearTimeout(abandonTimerRef.current);
        abandonTimerRef.current = null;
      }
      setAbandonArmed(false);
      hapticImpact(Haptics.ImpactFeedbackStyle.Light);
      await cancelNotification();
      await stopAmbientSound();
      await clearActiveSession();
      savedRef.current = false;
      setGoalName('');
      setPhaseAndRef('idle');
      setTimeLeftSec(durationMin * 60);
      startTsRef.current = null;
      totalDurationSecRef.current = durationMin * 60;
      pausedTotalSecRef.current = 0;
      lastPauseTsRef.current = null;
      sessionIdRef.current = null;
      return;
    }
    abandonArmedRef.current = true;
    setAbandonArmed(true);
    hapticImpact(Haptics.ImpactFeedbackStyle.Light);
    if (abandonTimerRef.current) clearTimeout(abandonTimerRef.current);
    abandonTimerRef.current = setTimeout(() => {
      abandonArmedRef.current = false;
      setAbandonArmed(false);
      abandonTimerRef.current = null;
    }, ABANDON_CONFIRM_MS);
  }, [cancelNotification, stopAmbientSound, clearActiveSession, durationMin]);

  const resetToIdle = useCallback(async (notifyParent = true) => {
    await clearActiveSession();
    if (abandonTimerRef.current) {
      clearTimeout(abandonTimerRef.current);
      abandonTimerRef.current = null;
    }
    abandonArmedRef.current = false;
    setAbandonArmed(false);
    setGoalName('');
    setIsNoteEditing(false);
    setPhaseAndRef('idle');
    setTimeLeftSec(durationMin * 60);
    setRestTimeLeftSec(REST_DURATION_SEC);
    restEndTsRef.current = null;
    startTsRef.current = null;
    totalDurationSecRef.current = durationMin * 60;
    pausedTotalSecRef.current = 0;
    lastPauseTsRef.current = null;
    sessionIdRef.current = null;
    savedRef.current = false;
    if (notifyParent && onRunningChange) onRunningChange(false);
  }, [clearActiveSession, durationMin, onRunningChange]);

  const saveFocusRecord = useCallback(async () => {
    const totalSec = totalDurationSecRef.current;
    if (onSaveFocus && totalSec > 0) {
      savedRef.current = true;
      await onSaveFocus({
        duration: totalSec,
        goalName: goalName.trim() || t('home.unnamedFocus', '未命名专注'),
        category: categoryRef.current || 'study',
        note: '',
      });
    }
  }, [onSaveFocus, goalName, t]);

  const saveDoneFocus = useCallback(async () => {
    await saveFocusRecord();
    await resetToIdle(false);
  }, [saveFocusRecord, resetToIdle]);

  const startRest = useCallback(async () => {
    await saveFocusRecord();
    hapticImpact(Haptics.ImpactFeedbackStyle.Medium);
    await clearActiveSession();
    restEndTsRef.current = Date.now() + REST_DURATION_SEC * 1000;
    setRestTimeLeftSec(REST_DURATION_SEC);
    setPhaseAndRef('resting');
    if (onRunningChange) onRunningChange(true);
  }, [saveFocusRecord, clearActiveSession, onRunningChange]);

  // ==================== 按住开始 (Hold to Start) ====================

  const holdTimerRef = useRef(null);

  const startHolding = useCallback(() => {
    if (phase !== 'idle' && phase !== 'holding') return;
    setHoldEarlyRelease(false);
    if (holdReleaseTimerRef.current) clearTimeout(holdReleaseTimerRef.current);

    Animated.timing(holdProgressAnim, {
      toValue: 1,
      duration: HOLD_MS,
      easing: RNEasing.linear,
      useNativeDriver: false,
    }).start();

    holdTimerRef.current = setTimeout(() => {
      startFocus();
    }, HOLD_MS);
  }, [phase, startFocus, holdProgressAnim]);

  const cancelHolding = useCallback(() => {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    Animated.timing(holdProgressAnim, {
      toValue: 0,
      duration: 150,
      useNativeDriver: false,
    }).start();

    if (phase === 'holding') {
      setPhaseAndRef('idle');
      setHoldEarlyRelease(true);
      if (holdReleaseTimerRef.current) clearTimeout(holdReleaseTimerRef.current);
      holdReleaseTimerRef.current = setTimeout(() => {
        setHoldEarlyRelease(false);
      }, 1500);
    }
  }, [holdProgressAnim, phase]);

  // 按住按钮文案
  const holdButtonLabel = useMemo(() => {
    if (holdEarlyRelease) {
      return t('pomodoro.hold1sHint', '按住 1 秒开始');
    }
    if (phase === 'holding') {
      return t('pomodoro.holding', '继续按住…');
    }
    return t('pomodoro.holdStartWithMin', '按住开始专注 · {min}分').replace('{min}', durationMin);
  }, [holdEarlyRelease, phase, durationMin, t]);

  // ==================== react-native-gesture-handler 转盘拖动 ====================
  const dragStartMinShared = useSharedValue(DEFAULT_DURATION_MIN);
  const currentMinShared = useSharedValue(DEFAULT_DURATION_MIN);

  const handleMinuteChangeWorklet = useCallback((nextMin) => {
    setDurationMin(nextMin);
    setTimeLeftSec(nextMin * 60);
    setHasSlidAdjust((prev) => {
      if (!prev) {
        AsyncStorage.setItem(STORAGE_KEY_SLID_ADJUST, '1').catch(() => {});
      }
      return true;
    });
    hapticImpact(Haptics.ImpactFeedbackStyle.Light);
  }, []);

  const panGesture = useMemo(() => {
    return Gesture.Pan()
      .activeOffsetY([-6, 6])
      .failOffsetX([-25, 25])
      .onBegin(() => {
        'worklet';
        dragStartMinShared.value = currentMinShared.value;
        runOnJS(setIsDragging)(true);
      })
      .onUpdate((e) => {
        'worklet';
        const deltaSteps = Math.round(-e.translationY / STEP_PX);
        const rawMin = dragStartMinShared.value + deltaSteps * STEP_MIN;
        const targetMin = Math.max(MIN_MIN, Math.min(MAX_MIN, rawMin));
        if (targetMin !== currentMinShared.value) {
          currentMinShared.value = targetMin;
          runOnJS(handleMinuteChangeWorklet)(targetMin);
        }
      })
      .onFinalize(() => {
        'worklet';
        runOnJS(setIsDragging)(false);
      });
  }, [handleMinuteChangeWorklet]);

  const handleDurationPreset = (mins) => {
    currentMinShared.value = mins;
    setDurationMin(mins);
    setTimeLeftSec(mins * 60);
    setHasSlidAdjust(true);
    hapticImpact(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleCustomDurationConfirm = () => {
    const mins = parseInt(customMinutesInput, 10);
    if (!isNaN(mins) && mins >= MIN_MIN && mins <= MAX_MIN) {
      handleDurationPreset(mins);
      setShowCustomModal(false);
    } else {
      showToast(t('pomodoro.customDurHint', '请输入 5~120 之间的分钟数'));
    }
  };

  const handleSelectAmbientInModal = async (key) => {
    setAmbient(key);
    if (key === 'none') {
      await stopAmbientSound();
    } else {
      await playAmbientSound(key);
    }
  };

  // ==================== 番茄标准 SVG 绘制 (240x240) ====================
  const renderTomatoSvg = (showCheckmark = false) => (
    <Svg width="100%" height="100%" viewBox="0 0 240 240">
      {/* 底部微投影 */}
      <Ellipse cx={120} cy={226} rx={70} ry={8} fill="#2B211C" opacity={0.08} />
      {/* 番茄椭圆主体 */}
      <Ellipse cx={120} cy={138} rx={94} ry={86} fill={tomatoFillColor} />
      {/* 左上角半透明高光 */}
      <Ellipse
        cx={82}
        cy={108}
        rx={22}
        ry={12}
        fill="#FFFFFF"
        opacity={0.28}
        transform="rotate(-30 82 108)"
      />
      {/* 顶部叶片 */}
      <Path
        d="M120 62 C108 66 88 62 74 74 C92 76 104 82 120 84 C136 82 148 76 166 74 C152 62 132 66 120 62 Z"
        fill="#4E8F4A"
      />
      {/* 茎 */}
      <Path
        d="M120 64 C120 50 124 42 132 36"
        stroke="#3E7A3C"
        strokeWidth={7}
        strokeLinecap="round"
        fill="none"
      />
      {/* 收获态中心白色对勾 */}
      {showCheckmark && (
        <Path
          d="M86 140l24 24 44-50"
          stroke="#FFFFFF"
          strokeWidth={12}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      )}
    </Svg>
  );

  const animatedPageBg = pageBgAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [colors.bg, isDark ? '#261C19' : '#FBE3D6'],
  });

  const holdFillWidth = holdProgressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  // 背景白噪音选择弹窗
  const renderAmbientModal = () => (
    <Modal
      visible={showAmbientPicker}
      transparent
      animationType="fade"
      onRequestClose={() => setShowAmbientPicker(false)}
    >
      <View style={styles.modalBg}>
        <View style={styles.modalContent}>
          <Text style={styles.modalTitle}>{t('pomodoro.bgSound', '背景声音')}</Text>
          <View style={styles.ambientGrid}>
            {AMBIENT_OPTIONS.map((item) => {
              const isActive = ambient === item.key;
              return (
                <TouchableOpacity
                  key={item.key}
                  style={[styles.ambientOption, isActive && styles.ambientOptionActive]}
                  onPress={() => handleSelectAmbientInModal(item.key)}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name={item.icon}
                    size={20}
                    color={isActive ? colors.primaryStrong : colors.ink2}
                  />
                  <Text
                    style={[
                      styles.ambientOptionText,
                      isActive && { color: colors.primaryStrong, fontWeight: '700' },
                    ]}
                  >
                    {t(item.label, item.key)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <TouchableOpacity
            style={[styles.modalClose, { backgroundColor: colors.chip }]}
            onPress={() => setShowAmbientPicker(false)}
          >
            <Text style={[styles.modalCloseText, { color: colors.ink }]}>{t('common.done', '完成')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );

  // ==================== 页面三：收获 (DONE) ====================
  if (phase === 'done') {
    return (
      <Animated.View
        style={[
          styles.doneContainer,
          {
            backgroundColor: animatedPageBg,
            paddingTop: insets.top + 16,
            paddingBottom: insets.bottom + 20,
          },
        ]}
      >
        <ScrollView
          style={{ flex: 1, alignSelf: 'stretch' }}
          contentContainerStyle={styles.doneScroll}
          showsVerticalScrollIndicator={false}
        >
          {/* 番茄收获弹出区与 8 个散开彩点 */}
          <View style={styles.harvestVisualWrap}>
            {!reduceMotion &&
              BURST_PARTICLES.map((p, idx) => {
                const translateX = harvestParticleAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, p.dx],
                });
                const translateY = harvestParticleAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, p.dy],
                });
                const opacity = harvestParticleAnim.interpolate({
                  inputRange: [0, 0.8, 1],
                  outputRange: [1, 0.6, 0],
                });
                const scale = harvestParticleAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [1, 0.4],
                });
                return (
                  <Animated.View
                    key={`burst-${idx}`}
                    style={[
                      styles.burstDot,
                      {
                        backgroundColor: p.color,
                        transform: [{ translateX }, { translateY }, { scale }],
                        opacity,
                      },
                    ]}
                  />
                );
              })}

            <Reanimated.View style={[styles.tomatoBox, animatedTomatoStyle]}>
              {renderTomatoSvg(true)}
            </Reanimated.View>
          </View>

          <Text style={styles.harvestTitle}>{t('pomodoro.harvestTitle', '收获一颗番茄')}</Text>
          <Text style={styles.harvestSub}>
            {t('pomodoro.harvestSub', {
              n: todaySummary.count + 1,
              cat: selectedCategoryMeta?.name || '',
              min: durationMin,
            })
              .replace('{n}', todaySummary.count + 1)
              .replace('{cat}', selectedCategoryMeta?.name || '')
              .replace('{min}', durationMin)}
          </Text>
          {goalName.trim() ? <Text style={styles.harvestTaskText}>{goalName.trim()}</Text> : null}

          {/* 分类快捷微调 */}
          <Text style={styles.postCatHint}>
            {t('pomodoro.changeCatHint', '分类不对？现在点一下就能改')}
          </Text>
          <View style={styles.catGridDone}>
            {FOCUS_CATEGORIES.map((item) => {
              const isSelected = category === item.key;
              return (
                <TouchableOpacity
                  key={`done-cat-${item.key}`}
                  style={[
                    styles.catBtnDone,
                    isSelected && styles.catBtnDoneSelected,
                  ]}
                  onPress={() => setCategory(item.key)}
                  activeOpacity={0.7}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: isSelected }}
                >
                  <View style={[styles.catChipDot, { backgroundColor: item.color }]} />
                  <Text
                    style={[
                      styles.catBtnDoneText,
                      isSelected && styles.catBtnDoneTextSelected,
                    ]}
                  >
                    {t(item.i18nKey).replace(/^[^\w一-龥]+\s*/, '')}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* 按钮区域 */}
          <View style={styles.doneBtnGroup}>
            <TouchableOpacity
              style={styles.doneSaveBtn}
              onPress={saveDoneFocus}
              activeOpacity={0.8}
            >
              <Text style={styles.doneSaveBtnText}>
                {t('pomodoro.saveToToday', '记入今日专注')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.doneRestBtn}
              onPress={startRest}
              activeOpacity={0.7}
            >
              <Text style={styles.doneRestBtnText}>
                {t('pomodoro.saveAndRest', '记入并休息 5 分钟')}
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </Animated.View>
    );
  }

  // ==================== 休息中 (RESTING) ====================
  if (phase === 'resting') {
    return (
      <Animated.View
        style={[
          styles.restContainer,
          { backgroundColor: animatedPageBg, paddingTop: insets.top, paddingBottom: insets.bottom },
        ]}
      >
        <View style={styles.restContent}>
          <Text style={styles.restTitle}>{t('pomodoro.restTitle', '休息一下')}</Text>
          <Text style={styles.restTimer}>{formatTime(restTimeLeftSec)}</Text>
          <Text style={styles.restHint}>
            {t('pomodoro.restHint', '让大脑喘口气，倒计时结束后会自动返回')}
          </Text>
          <TouchableOpacity
            style={styles.restSkipBtn}
            onPress={() => resetToIdle(true)}
            activeOpacity={0.7}
          >
            <Text style={styles.restSkipBtnText}>{t('pomodoro.skipRest', '跳过休息')}</Text>
          </TouchableOpacity>
        </View>
      </Animated.View>
    );
  }

  // ==================== 页面二：专注中 (RUNNING / PAUSED) ====================
  if (phase === 'running' || phase === 'paused') {
    return (
      <Animated.View
        style={[
          styles.runningContainer,
          { backgroundColor: animatedPageBg, paddingTop: insets.top + 16, paddingBottom: insets.bottom + 20 },
        ]}
      >
        <ScrollView
          style={{ flex: 1, alignSelf: 'stretch' }}
          contentContainerStyle={styles.runningScrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* 顶部第 N 次与分类胶囊 */}
          <View style={styles.runTopWrap}>
            <Text style={styles.runCountText}>
              {t('pomodoro.todayNth', { n: todaySummary.count + 1 }).replace(
                '{n}',
                todaySummary.count + 1
              )}
            </Text>
            <View style={styles.runCatCapsule}>
              <View
                style={[
                  styles.catChipDot,
                  { backgroundColor: selectedCategoryMeta?.color || colors.primary },
                ]}
              />
              <Text style={styles.runCatName}>{selectedCategoryMeta?.name}</Text>
              {goalName.trim() ? (
                <Text style={styles.runGoalText}> · {goalName.trim()}</Text>
              ) : null}
            </View>
          </View>

          {/* 中部成熟番茄 */}
          <View style={styles.runTomatoWrap}>
            <Reanimated.View style={[styles.tomatoBox, animatedTomatoStyle]}>
              {renderTomatoSvg(false)}
            </Reanimated.View>
          </View>

          {/* 倒计时与阶段文案 */}
          <View style={styles.runTimerWrap}>
            <Text style={styles.runClockText}>{formatTime(timeLeftSec)}</Text>
            <Text style={styles.runStageText}>{stageHintText}</Text>
          </View>

          {/* 按钮控制区 */}
          <View style={styles.runControlRow}>
            <TouchableOpacity
              style={[styles.runQuitBtn, abandonArmed && styles.runQuitBtnArmed]}
              onPress={abandonFocus}
              activeOpacity={0.7}
            >
              <Text style={[styles.runQuitBtnText, abandonArmed && styles.runQuitBtnTextArmed]}>
                {abandonArmed ? t('pomodoro.confirmAbandon2', '再点一次放弃') : t('pomodoro.abandon', '放弃')}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.runPauseBtn}
              onPress={phase === 'paused' ? resumeFocus : pauseFocus}
              activeOpacity={0.8}
            >
              <Ionicons
                name={phase === 'paused' ? 'play' : 'pause'}
                size={20}
                color="#FFFFFF"
              />
              <Text style={styles.runPauseBtnText}>
                {phase === 'paused' ? t('pomodoro.resume', '继续') : t('pomodoro.pause', '暂停')}
              </Text>
            </TouchableOpacity>
          </View>

          {/* 背景声音行 */}
          <TouchableOpacity
            style={styles.runAmbientRow}
            onPress={() => setShowAmbientPicker(true)}
            activeOpacity={0.7}
          >
            <Ionicons name="volume-medium-outline" size={16} color="#6B5B4F" />
            <Text style={styles.runAmbientText}>{currentAmbientLabel}</Text>
            <Ionicons name="chevron-forward" size={13} color="#8C7D73" />
          </TouchableOpacity>

          {renderAmbientModal()}
        </ScrollView>
      </Animated.View>
    );
  }

  // ==================== 页面一：待开始 (IDLE) ====================
  const isCustomActive = !DURATION_PRESETS.includes(durationMin);

  return (
    <View style={styles.idleRoot}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.idleScrollContent}
        scrollEnabled={!isDragging}
        showsVerticalScrollIndicator={false}
      >
        {/* 2. "今日专注"横条：降级为轻量摘要 */}
        <TouchableOpacity
          style={styles.summaryRow}
          onPress={() => setShowHistoryModal(true)}
          activeOpacity={0.7}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text
            style={[
              styles.summaryText,
              todaySummary.count === 0 && styles.summaryTextEmpty,
            ]}
          >
            {t('pomodoro.todaySummaryText', '今日 {n} 次 · {d}')
              .replace('{n}', todaySummary.count)
              .replace(
                '{d}',
                todaySummary.totalSec > 0
                  ? formatDuration(todaySummary.totalSec, lang)
                  : (lang === 'en' ? '0 min' : '0 分钟')
              )}
          </Text>
          <Ionicons
            name="chevron-forward"
            size={13}
            color={todaySummary.count === 0 ? '#A6988D' : '#6B5B4F'}
          />
        </TouchableOpacity>

        {/* 3. 标题"这次专注做什么？" + 分类说明 */}
        <View style={styles.catHeaderRow}>
          <Text style={styles.sectionTitle}>{t('pomodoro.whatToDo', '这次专注做什么？')}</Text>
          <TouchableOpacity
            onPress={() => setShowHelp(true)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={styles.helpLink}>{t('pomodoro.categoryHelp', '分类说明')}</Text>
          </TouchableOpacity>
        </View>

        {/* 4. 分类：单行横向滚动 Chip */}
        <View style={styles.catScrollWrapper}>
          <ScrollView
            ref={catScrollRef}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.catScrollContent}
            onLayout={(e) => {
              catViewportWidthRef.current = e.nativeEvent.layout.width;
            }}
          >
            {FOCUS_CATEGORIES.map((item) => {
              const isSelected = category === item.key;
              return (
                <CategoryChip
                  key={item.key}
                  item={item}
                  isSelected={isSelected}
                  onSelect={() => handleSelectCategory(item.key)}
                  onLayout={(layout) => {
                    catChipLayoutsRef.current[item.key] = layout;
                  }}
                  t={t}
                />
              );
            })}
          </ScrollView>
          <View style={styles.catFadeRight} pointerEvents="none" />
        </View>

        {/* 5. 番茄计时器（放大居中，在分类区与时长档位之间垂直居中，支持上下滑动调节时长 5~120） */}
        <GestureDetector gesture={panGesture}>
          <View
            style={styles.idleDialArea}
            onLayout={(e) => setDialAreaHeight(e.nativeEvent.layout.height)}
          >
            <Reanimated.View style={[idleTomatoBoxStyle, animatedTomatoStyle]}>
              {renderTomatoSvg(false)}
            </Reanimated.View>
            <View style={styles.idleDialCenter} pointerEvents="none">
              <Text
                style={[
                  styles.idleDialMinutes,
                  { fontSize: dialNumberFontSize, lineHeight: dialNumberFontSize },
                ]}
              >
                {durationMin}
              </Text>
              <Text style={styles.idleDialUnitText}>{t('pomodoro.minUnit', '分')}</Text>
            </View>

            {/* 番茄下方提示：无底色纯文字小字，仅首次进入显示，滑动调节过一次后永久隐藏 */}
            {!hasSlidAdjust && (
              <View style={styles.slideHintRow} pointerEvents="none">
                <Ionicons name="swap-vertical" size={12} color={isDark ? colors.ink2 : '#7A6F66'} />
                <Text style={[styles.slideHintText, { color: isDark ? colors.ink2 : '#7A6F66' }]}>
                  {t('pomodoro.slideHint', '上下滑动调节时长')}
                </Text>
              </View>
            )}
          </View>
        </GestureDetector>

        {/* 底部操作组：时长档位 + 次要操作行 + 开始按钮整体下移，靠近开始按钮上方，消除中间大块空白 */}
        <View style={styles.bottomControlsWrap}>
          {/* 6. 时长快捷档位：5 / 15 / 25 / 45 / 60 / 自定义（升序排列，统一不带单位） */}
          <View style={styles.durGrid}>
            {DURATION_PRESETS.map((mins) => {
              const isActive = durationMin === mins;
              return (
                <TouchableOpacity
                  key={'dur-' + mins}
                  style={[styles.durPill, isActive && styles.durPillActive]}
                  onPress={() => handleDurationPreset(mins)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.durPillText, isActive && styles.durPillTextActive]}>
                    {mins}
                  </Text>
                </TouchableOpacity>
              );
            })}
            <TouchableOpacity
              style={[
                styles.durPillCustom,
                isCustomActive && styles.durPillCustomActive,
              ]}
              onPress={() => {
                if (DURATION_PRESETS.includes(durationMin)) {
                  handleDurationPreset(30);
                } else {
                  setCustomMinutesInput(String(durationMin));
                  setShowCustomModal(true);
                }
              }}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.durPillCustomText,
                  isCustomActive && styles.durPillCustomTextActive,
                ]}
              >
                {isCustomActive ? `${durationMin}` : t('pomodoro.custom', '自定义')}
              </Text>
            </TouchableOpacity>
          </View>

          {/* 7. 次要操作行：+ 添加备注 ｜ 🔊 背景声音：无声（1px 浅描边小胶囊，点击热区 >= 44dp） */}
          <View style={styles.subActionsRow}>
            {isNoteEditing ? (
              <View
                style={[
                  styles.noteInputInlineWrap,
                  {
                    borderColor: colors.primary,
                    backgroundColor: colors.surface,
                  },
                ]}
              >
                <Ionicons
                  name="pencil-outline"
                  size={14}
                  color={isDark ? colors.ink2 : '#5E4F44'}
                />
                <TextInput
                  style={[styles.noteInputInline, { color: colors.ink }]}
                  value={goalName}
                  onChangeText={setGoalName}
                  placeholder={t('pomodoro.taskPlaceholder', '选填，例如：写周报')}
                  placeholderTextColor={colors.ink3}
                  maxLength={30}
                  autoFocus
                  onBlur={() => {
                    if (!goalName.trim()) {
                      setIsNoteEditing(false);
                    }
                  }}
                  returnKeyType="done"
                  onSubmitEditing={() => setIsNoteEditing(false)}
                />
                <TouchableOpacity
                  onPress={() => setIsNoteEditing(false)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons name="checkmark-circle" size={20} color={colors.primaryStrong} />
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                style={[
                  styles.capsuleBtn,
                  {
                    borderColor: isDark ? colors.line2 : '#E6DACD',
                    backgroundColor: isDark ? '#261F1A' : '#FFFFFF',
                  },
                ]}
                onPress={() => setIsNoteEditing(true)}
                activeOpacity={0.7}
              >
                <Ionicons
                  name={goalName.trim() ? 'document-text-outline' : 'add-outline'}
                  size={15}
                  color={goalName.trim() ? colors.ink : (isDark ? colors.ink2 : '#5E4F44')}
                />
                <Text
                  numberOfLines={1}
                  style={[
                    styles.capsuleText,
                    { color: isDark ? colors.ink2 : '#5E4F44' },
                    goalName.trim() && { color: colors.ink, fontWeight: '600' },
                  ]}
                >
                  {goalName.trim() ? goalName.trim() : t('pomodoro.addNotePrompt', '+ 添加备注')}
                </Text>
              </TouchableOpacity>
            )}

            {!isNoteEditing && (
              <TouchableOpacity
                style={[
                  styles.capsuleBtn,
                  {
                    borderColor: isDark ? colors.line2 : '#E6DACD',
                    backgroundColor: isDark ? '#261F1A' : '#FFFFFF',
                  },
                ]}
                onPress={() => setShowAmbientPicker(true)}
                activeOpacity={0.7}
              >
                <Ionicons
                  name="volume-medium-outline"
                  size={15}
                  color={isDark ? colors.ink2 : '#5E4F44'}
                />
                <Text
                  style={[styles.capsuleText, { color: isDark ? colors.ink2 : '#5E4F44' }]}
                  numberOfLines={1}
                >
                  {t('pomodoro.soundPrefix', '背景声音：')}{currentAmbientLabel}
                </Text>
              </TouchableOpacity>
            )}
          </View>

          {/* 8. 开始按钮（长按 1 秒开始，带进度填充反馈） */}
          <View style={styles.startBtnBottomWrap}>
            <Pressable
              style={({ pressed }) => [styles.startBtn, pressed && { transform: [{ scale: 0.99 }] }]}
              onPressIn={() => {
                setPhaseAndRef('holding');
                startHolding();
              }}
              onPressOut={cancelHolding}
              accessibilityRole="button"
              accessibilityActions={[{ name: 'activate', label: '开始专注' }]}
              onAccessibilityAction={(event) => {
                if (event.nativeEvent.actionName === 'activate') {
                  startFocus();
                }
              }}
            >
              <View style={styles.startBtnInner}>
                <Animated.View style={[styles.startBtnFill, { width: holdFillWidth }]} />
                <Ionicons name="play" size={18} color="#FFFFFF" />
                <Text style={styles.startBtnText}>{holdButtonLabel}</Text>
              </View>
            </Pressable>
          </View>
        </View>

        {/* 分类说明模态框 */}
        <Modal visible={showHelp} transparent animationType="fade" onRequestClose={() => setShowHelp(false)}>
          <View style={styles.modalBg}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>{t('pomodoro.categoryHelp', '分类说明')}</Text>
              {FOCUS_CATEGORIES.map((c) => (
                <View key={c.key} style={styles.modalRow}>
                  <Text style={styles.modalRowTitle}>
                    {t(c.i18nKey).replace(/^[^\w一-龥]+\s*/, '')}
                  </Text>
                  <Text style={styles.modalRowDesc}>{t(CATEGORY_DESC_KEYS[c.key] || '')}</Text>
                </View>
              ))}
              <TouchableOpacity style={styles.modalClose} onPress={() => setShowHelp(false)}>
                <Text style={styles.modalCloseText}>{t('common.done')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* 自定义时长弹窗 */}
        <Modal visible={showCustomModal} transparent animationType="fade" onRequestClose={() => setShowCustomModal(false)}>
          <View style={styles.modalBg}>
            <View style={styles.customDurDialog}>
              <Text style={styles.modalTitle}>{t('pomodoro.customDurTitle', '自定义专注时长')}</Text>
              <View style={styles.customDurInputRow}>
                <TextInput
                  style={styles.customDurInput}
                  value={customMinutesInput}
                  onChangeText={setCustomMinutesInput}
                  keyboardType="number-pad"
                  maxLength={3}
                  autoFocus
                />
                <Text style={{ fontSize: 16, fontWeight: '700', color: colors.ink }}>
                  {t('pomodoro.minUnit', '分钟')}
                </Text>
              </View>
              <View style={styles.customDurBtnRow}>
                <TouchableOpacity style={styles.customDurBtnCancel} onPress={() => setShowCustomModal(false)}>
                  <Text style={styles.customDurBtnCancelText}>{t('common.cancel')}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.customDurBtnConfirm} onPress={handleCustomDurationConfirm}>
                  <Text style={styles.customDurBtnConfirmText}>{t('common.done')}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {renderAmbientModal()}

        <FocusHistoryModal
          visible={showHistoryModal}
          onClose={() => setShowHistoryModal(false)}
          focusSessions={focusHistoryRecords}
          onUpdateFocusSession={onUpdateFocusSession}
          onDeleteFocusSession={onDeleteFocusSession}
        />
      </ScrollView>

      {/* Toast 提示 */}
      {toast.visible && (
        <View style={styles.toastWrap} pointerEvents="none">
          <View style={styles.toastCard}>
            <Text style={styles.toastText}>{toast.message}</Text>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  idleRoot: {
    flex: 1,
    alignSelf: 'stretch',
  },
  idleScrollContent: {
    flexGrow: 1,
    paddingTop: 8,
    paddingBottom: 16,
    justifyContent: 'space-between',
  },
  toastWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 34,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    zIndex: 100,
  },
  toastCard: {
    minWidth: 220,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 999,
    backgroundColor: 'rgba(43, 31, 26, 0.88)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  toastText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#fff',
    textAlign: 'center',
  },

  // 2. 今日摘要行
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 4,
    gap: 4,
    marginBottom: 8,
  },
  summaryText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#B33427',
  },
  summaryTextEmpty: {
    color: '#A6988D',
    fontWeight: '500',
  },

  // 3. 分类标题行
  catHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    minHeight: 28,
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#2B211C',
  },
  helpLink: {
    fontSize: 13,
    color: '#8C7D73',
    fontWeight: '500',
  },

  // 4. 分类横向滚动条（区块间距 24）
  catScrollWrapper: {
    position: 'relative',
    width: '100%',
    minHeight: 44,
    marginBottom: 24,
  },
  catScrollContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    gap: 8,
  },
  catFadeRight: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: 24,
    backgroundColor: 'transparent',
  },
  catChip: {
    minHeight: 38,
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#EADFD0',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    gap: 7,
  },
  catChipDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  catChipLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: '#2B211C',
  },

  // 5. 番茄计时器放大居中（在分类区与时长档位之间垂直居中，小屏自适应）
  idleDialArea: {
    flex: 1,
    width: '100%',
    minHeight: 180,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    marginBottom: 24,
  },
  tomatoBox: {
    width: 240,
    height: 240,
    alignItems: 'center',
    justifyContent: 'center',
  },
  idleDialCenter: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: '57.5%',
    transform: [{ translateY: -30 }],
    alignItems: 'center',
    justifyContent: 'center',
  },
  idleDialMinutes: {
    fontWeight: '700',
    color: '#1F2B14',
  },
  idleDialUnitText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1F2B14',
    marginTop: 1,
  },
  slideHintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    marginTop: 8,
  },
  slideHintText: {
    fontSize: 12,
    fontWeight: '500',
  },

  // 底部操作区总容器（整体下移靠近开始按钮）
  bottomControlsWrap: {
    width: '100%',
    marginTop: 'auto',
    paddingBottom: 4,
  },

  // 6. 时长快捷档位
  durGrid: {
    width: '100%',
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 6,
    marginBottom: 12,
  },
  durPill: {
    flex: 1,
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#EADFD0',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  durPillActive: {
    borderColor: '#C63D31',
    backgroundColor: '#FFF1EC',
  },
  durPillText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#2B211C',
  },
  durPillTextActive: {
    fontWeight: '700',
    color: '#B33427',
  },
  durPillCustom: {
    flex: 1.15,
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#C9B8A8',
    borderStyle: 'dashed',
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  durPillCustomActive: {
    borderStyle: 'solid',
    borderColor: '#C63D31',
    backgroundColor: '#FFF1EC',
  },
  durPillCustomText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#5E4F44',
  },
  durPillCustomTextActive: {
    fontWeight: '700',
    color: '#B33427',
  },

  // 7. 次要设置合并行（1px 浅描边小胶囊，点击热区 >= 44dp）
  subActionsRow: {
    width: '100%',
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 16,
  },
  capsuleBtn: {
    flex: 1,
    height: 44,
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    gap: 6,
  },
  capsuleText: {
    fontSize: 13.5,
    fontWeight: '500',
  },
  noteInputInlineWrap: {
    flex: 1,
    height: 44,
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    gap: 6,
  },
  noteInputInline: {
    flex: 1,
    fontSize: 13.5,
    paddingVertical: 0,
  },

  // 8. 开始按钮（下移贴近底部单手拇指热区，长按 1 秒开始进度填充）
  startBtnBottomWrap: {
    width: '100%',
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  startBtn: {
    width: '100%',
    height: 56,
    borderRadius: 999,
    backgroundColor: '#C63D31',
    overflow: 'hidden',
  },
  startBtnInner: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    position: 'relative',
  },
  startBtnFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: '#8E2A20',
  },
  startBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },

  // 专注中页面
  runningContainer: {
    flex: 1,
    alignSelf: 'stretch',
    alignItems: 'center',
  },
  runningScrollContent: {
    flexGrow: 1,
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  runTopWrap: {
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 8,
    gap: 8,
  },
  runCountText: {
    fontSize: 13,
    color: '#6B5B4F',
  },
  runCatCapsule: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#EFE5D8',
  },
  runCatName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#2B211C',
  },
  runGoalText: {
    fontSize: 15,
    color: '#5E4F44',
  },
  runTomatoWrap: {
    width: '100%',
    minHeight: 240,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 12,
  },
  runTimerWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  runClockText: {
    fontSize: 68,
    fontWeight: '700',
    lineHeight: 72,
    fontVariant: ['tabular-nums'],
    color: '#2B211C',
  },
  runStageText: {
    fontSize: 14,
    color: '#6B5B4F',
    marginTop: 4,
  },
  runControlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    marginTop: 24,
    marginBottom: 20,
  },
  runQuitBtn: {
    minWidth: 104,
    height: 56,
    paddingHorizontal: 16,
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D9C9BA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  runQuitBtnArmed: {
    borderColor: '#D93A2B',
  },
  runQuitBtnText: {
    fontSize: 15,
    fontWeight: '500',
    color: '#5E4F44',
  },
  runQuitBtnTextArmed: {
    color: '#D93A2B',
    fontWeight: '700',
  },
  runPauseBtn: {
    minWidth: 160,
    height: 64,
    paddingHorizontal: 24,
    borderRadius: 999,
    backgroundColor: '#C63D31',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  runPauseBtnText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },
  runAmbientRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#EFE5D8',
    marginTop: 10,
  },
  runAmbientText: {
    fontSize: 13,
    color: '#6B5B4F',
    fontWeight: '500',
  },

  // 收获页面
  doneContainer: {
    flex: 1,
    alignSelf: 'stretch',
  },
  doneScroll: {
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 28,
  },
  harvestVisualWrap: {
    width: 240,
    height: 240,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    marginTop: 20,
    marginBottom: 12,
  },
  burstDot: {
    position: 'absolute',
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  harvestTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#2B211C',
    marginTop: 8,
  },
  harvestSub: {
    fontSize: 14,
    color: '#5E4F44',
    marginTop: 4,
  },
  harvestTaskText: {
    fontSize: 14,
    color: '#5E4F44',
    marginTop: 2,
  },
  postCatHint: {
    fontSize: 12,
    color: '#5E4F44',
    marginTop: 16,
    marginBottom: 8,
    alignSelf: 'flex-start',
  },
  catGridDone: {
    width: '100%',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  catBtnDone: {
    width: '31.5%',
    height: 44,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#EADFD0',
    gap: 8,
    paddingHorizontal: 4,
  },
  catBtnDoneSelected: {
    borderColor: '#C63D31',
    borderWidth: 1.5,
    backgroundColor: '#FFF1EC',
  },
  catBtnDoneText: {
    fontSize: 14,
    color: '#2B211C',
    fontWeight: '500',
  },
  catBtnDoneTextSelected: {
    fontWeight: '700',
  },
  doneBtnGroup: {
    width: '100%',
    marginTop: 20,
    gap: 8,
  },
  doneSaveBtn: {
    width: '100%',
    height: 56,
    borderRadius: 999,
    backgroundColor: '#C63D31',
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneSaveBtnText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
  },
  doneRestBtn: {
    width: '100%',
    height: 48,
    borderRadius: 999,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneRestBtnText: {
    fontSize: 15,
    fontWeight: '500',
    color: '#5E4F44',
  },

  // 休息中
  restContainer: {
    flex: 1,
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  restContent: {
    width: '100%',
    alignItems: 'center',
  },
  restTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#2B211C',
    marginBottom: 16,
  },
  restTimer: {
    fontSize: 64,
    fontWeight: '800',
    color: '#C63D31',
    marginBottom: 16,
    fontVariant: ['tabular-nums'],
    letterSpacing: -1,
  },
  restHint: {
    fontSize: 13,
    color: '#6B5B4F',
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 32,
    paddingHorizontal: 20,
  },
  restSkipBtn: {
    paddingVertical: 12,
    paddingHorizontal: 32,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#EADFD0',
    backgroundColor: '#FFFFFF',
  },
  restSkipBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#6B5B4F',
  },

  // 模态弹窗
  modalBg: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 400,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#2B211C',
    marginBottom: 16,
    textAlign: 'center',
  },
  modalRow: {
    marginBottom: 12,
    backgroundColor: '#FAF4EC',
    padding: 12,
    borderRadius: 12,
  },
  modalRowTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#2B211C',
    marginBottom: 4,
  },
  modalRowDesc: {
    fontSize: 13,
    color: '#6B5B4F',
    lineHeight: 18,
  },
  modalClose: {
    marginTop: 10,
    backgroundColor: '#C63D31',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  modalCloseText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  ambientGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 10,
  },
  ambientOption: {
    width: '47%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: '#FAF4EC',
    borderWidth: 1,
    borderColor: '#EADFD0',
  },
  ambientOptionActive: {
    backgroundColor: '#FFF1EC',
    borderColor: '#C63D31',
  },
  ambientOptionText: {
    fontSize: 14,
    color: '#2B211C',
    fontWeight: '500',
  },
  customDurDialog: {
    width: '85%',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    alignItems: 'center',
  },
  customDurInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginVertical: 18,
  },
  customDurInput: {
    width: 100,
    height: 48,
    borderWidth: 1.5,
    borderColor: '#C63D31',
    borderRadius: 14,
    fontSize: 22,
    fontWeight: '800',
    textAlign: 'center',
    color: '#2B211C',
  },
  customDurBtnRow: {
    flexDirection: 'row',
    width: '100%',
    gap: 12,
  },
  customDurBtnCancel: {
    flex: 1,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#FAF4EC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  customDurBtnCancelText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2B211C',
  },
  customDurBtnConfirm: {
    flex: 1,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#C63D31',
    alignItems: 'center',
    justifyContent: 'center',
  },
  customDurBtnConfirmText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
  },
});
