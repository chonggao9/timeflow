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
  Keyboard,
  KeyboardAvoidingView,
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
import Svg, { Ellipse, Path, Defs, LinearGradient, Stop, Rect } from 'react-native-svg';
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
import { STORAGE_KEY_LAST_AMBIENT } from './FocusSettingsCard';
// 番茄引擎：App 与桌面小组件共用同一份状态（AsyncStorage timeflow_pomodoro_state）。
// UI/动画不动，只把计时真值从组件内 refs 换成 engine 派生（deriveDisplay）。
import {
  createState,
  start as engineStart,
  pause as enginePause,
  reset as engineReset,
  switchMode as engineSwitchMode,
  setFocusMin as engineSetFocusMin,
  nextModeAfterEnd,
  SHORT_MS,
  LONG_MS,
  deriveDisplay,
  ackHarvest,
} from '../pomodoro/engine';
import { loadState, saveState } from '../pomodoro/stateStore';
import { settleAndPersist } from '../pomodoro/settle';
import { ensureNotificationSetup, syncNotifications } from '../pomodoro/notifications';
import { refreshPomodoroWidgets } from '../utils/widgetRefresh';

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
const STORAGE_KEY_RECENT_GOALS = '@timeflow_recent_pomodoro_goals';
const MAX_RECENT_GOALS = 5;
// 休息时长统一由引擎常量派生，避免文案与逻辑漂移
const SHORT_REST_MIN = SHORT_MS / 60000;
const LONG_REST_MIN = LONG_MS / 60000;

const formatOrdinal = (num, currentLang) => {
  if (currentLang === 'zh') return String(num);
  const s = ['th', 'st', 'nd', 'rd'];
  const v = num % 100;
  return num + (s[(v - 20) % 10] || s[v] || s[0]);
};

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
  { key: 'cafe', icon: 'cafe-outline', label: 'pomodoro.ambient_cafe' },
  { key: 'rain', icon: 'rainy-outline', label: 'pomodoro.ambient_rain' },
  { key: 'ocean', icon: 'water-outline', label: 'pomodoro.ambient_ocean' },
  { key: 'forest', icon: 'leaf-outline', label: 'pomodoro.ambient_forest' },
  { key: 'fire', icon: 'bonfire-outline', label: 'pomodoro.ambient_fire' },
  { key: 'whitenoise', icon: 'disc-outline', label: 'pomodoro.ambient_whitenoise' },
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
  whitenoise: require('../../assets/sounds/stream.mp3'),
};

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

  // Phase 状态机: 'idle' | 'holding' | 'running' | 'paused' | 'done' | 'rest'（兼容旧持久化值 'resting'）
  const [phase, setPhase] = useState('idle');

  // 基础计时状态
  const [durationMin, setDurationMin] = useState(DEFAULT_DURATION_MIN);
  const [timeLeftSec, setTimeLeftSec] = useState(DEFAULT_DURATION_MIN * 60);
  const [category, setCategory] = useState('study'); // 首次使用默认「学习」
  const [goalName, setGoalName] = useState('');
  const [isEditingGoalInRun, setIsEditingGoalInRun] = useState(false);
  const [runGoalDraft, setRunGoalDraft] = useState('');
  const [isNoteEditing, setIsNoteEditing] = useState(false);
  const [ambient, setAmbient] = useState('none');
  const [isNoteFocused, setIsNoteFocused] = useState(false);
  const [recentGoals, setRecentGoals] = useState([]);
  const recentGoalsRef = useRef([]);

  // 用户是否曾经滑动手势（用于控制“上下滑动调节”提示的展示）
  const [hasSlidAdjust, setHasSlidAdjust] = useState(false);

  // 引擎真值：计时状态不再存组件 refs，统一读写 engine（App 与小组件同源）
  const engineRef = useRef(null);
  const harvestedRef = useRef(null); // 收获页待手动保存的已结束 focus 会话
  const timerRef = useRef(null);
  const categoryRef = useRef('study');
  const savedRef = useRef(false);
  const phaseRef = useRef('idle');

  // 分类 Chip 居中滚动计算相关
  const catScrollRef = useRef(null);
  const catChipLayoutsRef = useRef({});
  const catViewportWidthRef = useRef(0);

  // 白噪音横滑 Chip 居中滚动计算相关
  const ambientScrollRef = useRef(null);
  const ambientChipLayoutsRef = useRef({});
  const ambientViewportWidthRef = useRef(0);

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
  const breatheAnim = useRef(new Animated.Value(1)).current;
  const restDoneHandlingRef = useRef(false);

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
  const totalSecForCalc = durationMin * 60;
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

  // 平滑滚动选中白噪音 Chip 到视口居中
  const scrollToAmbientCenter = useCallback((ambKey) => {
    const layout = ambientChipLayoutsRef.current[ambKey];
    const vpW = ambientViewportWidthRef.current;
    if (layout && vpW && ambientScrollRef.current) {
      const targetX = layout.x - (vpW - layout.width) / 2;
      ambientScrollRef.current.scrollTo({
        x: Math.max(0, targetX),
        animated: true,
      });
    }
  }, []);

  // 进入专注运行页或切换时，自动将选中项居中
  useEffect(() => {
    if (phase === 'running' || phase === 'paused') {
      const timer = setTimeout(() => {
        scrollToAmbientCenter(ambient);
      }, 200);
      return () => clearTimeout(timer);
    }
  }, [phase, ambient, scrollToAmbientCenter]);

  // ==================== Effects ====================

  useEffect(() => {
    if (onRunningChange) {
      onRunningChange(phase === 'running' || phase === 'paused' || phase === 'rest' || phase === 'resting');
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

  // 恢复上次使用的背景声音偏好（静默继承，无需在待开始卡片上重复选择）
  useEffect(() => {
    (async () => {
      try {
        const last = await AsyncStorage.getItem(STORAGE_KEY_LAST_AMBIENT);
        if (last && AMBIENT_OPTIONS.some((a) => a.key === last)) {
          setAmbient(last);
        }
      } catch (e) {}
    })();
  }, []);

  // 空闲态调时长 → 防抖写入 engine.focusMin（组件与 App 同源共享时长设置）
  useEffect(() => {
    if (phase !== 'idle') return undefined;
    const id = setTimeout(async () => {
      try {
        const st = await ensureEngine();
        if (!st.running && st.mode === 'focus' && st.focusMin !== durationMin) {
          const next = engineSetFocusMin(st, durationMin, Date.now());
          engineRef.current = next;
          await saveState(next);
          refreshPomodoroWidgets();
        }
      } catch (e) {}
    }, 400);
    return () => clearTimeout(id);
  }, [durationMin, phase, ensureEngine]);



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
    ensureNotificationSetup(); // handler + Android channel（结束通知唯一封装，仅配置通道不弹窗）
  }, []);

  // 首次挂载同步（修复旧版「首挂载不恢复」缺口）：补结算 + 通知对账 + UI 相位恢复，
  // 含小组件发起、App 全程未打开的会话 → pendingHarvests 补显收获页。
  useEffect(() => {
    syncEngineToUiRef.current?.();
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
      if (phase === 'done' || phase === 'rest' || phase === 'resting') {
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

  // AppState 回前台：统一同步（放宽旧条件——无论当前相位都对账，杀进程结束/小组件操作都能恢复）
  const syncEngineToUiRef = useRef(null);
  useEffect(() => {
    const sub = AppState.addEventListener('change', async (nextState) => {
      if (nextState === 'active') {
        await syncEngineToUiRef.current?.();
      }
    });
    return () => sub?.remove?.();
  }, []);

  // 计时器主循环
  useEffect(() => {
    if (phase !== 'running' && phase !== 'rest' && phase !== 'resting') {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      return;
    }

    timerRef.current = setInterval(() => {
      const st = engineRef.current;
      if (!st) return;
      const d = deriveDisplay(st, Date.now());
      if (phase === 'rest' || phase === 'resting') {
        setRestTimeLeftSec(d.remainingSec);
        if (d.ended || d.remainingSec <= 0) {
          handleRestDone();
        }
        return;
      }
      setTimeLeftSec(Math.max(0, d.remainingSec));
      if (d.ended || d.remainingSec <= 0) {
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

  // 休息态 8 秒循环呼吸动画（吸气 4s 放大，呼气 4s 还原；开启减少动态效果时关闭）
  useEffect(() => {
    if (phase === 'rest' || phase === 'resting') {
      if (reduceMotion) {
        breatheAnim.setValue(1);
        return;
      }
      breatheAnim.setValue(1);
      const anim = Animated.loop(
        Animated.sequence([
          Animated.timing(breatheAnim, {
            toValue: 1.15,
            duration: 4000,
            easing: RNEasing.inOut(RNEasing.sin),
            useNativeDriver: true,
          }),
          Animated.timing(breatheAnim, {
            toValue: 1.0,
            duration: 4000,
            easing: RNEasing.inOut(RNEasing.sin),
            useNativeDriver: true,
          }),
        ])
      );
      anim.start();
      return () => anim.stop();
    }
  }, [phase, reduceMotion, breatheAnim]);

  // 加载最近使用的任务名（最多 5 个，去重，最新排前）
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY_RECENT_GOALS);
        if (raw) {
          const list = JSON.parse(raw);
          if (Array.isArray(list)) {
            const filtered = list.filter((x) => typeof x === 'string' && x.trim()).slice(0, MAX_RECENT_GOALS);
            recentGoalsRef.current = filtered;
            setRecentGoals(filtered);
          }
        }
      } catch (e) {}
    })();
  }, []);

  const addRecentGoal = useCallback(async (name) => {
    const trimmed = (name || '').trim();
    if (!trimmed) return;
    const isUnnamed =
      trimmed === t('home.unnamedFocus', '未命名专注') ||
      trimmed === '未命名专注' ||
      trimmed === 'Unnamed focus';
    if (isUnnamed) return;

    // 以 ref 为单一真值计算并落盘，不在 setState updater 内执行副作用
    const nextList = [trimmed, ...recentGoalsRef.current.filter((item) => item !== trimmed)].slice(
      0,
      MAX_RECENT_GOALS
    );
    recentGoalsRef.current = nextList;
    setRecentGoals(nextList);
    try {
      await AsyncStorage.setItem(STORAGE_KEY_RECENT_GOALS, JSON.stringify(nextList));
    } catch (e) {}
  }, [t]);

  const animatedTomatoStyle = useAnimatedStyle(() => {
    return {
      transform: [
        { scale: scaleShared.value },
        { translateY: breathTranslateY.value },
      ],
    };
  });

  // ==================== Core Timer Logic ====================

  // 读取并缓存 engine 状态（stateStore 内部含 v1 旧 key 一次性迁移，复制不删除）
  const ensureEngine = useCallback(async () => {
    if (engineRef.current) return engineRef.current;
    const now = Date.now();
    let loaded = null;
    try {
      loaded = await loadState(now);
    } catch (e) {}
    engineRef.current = loaded || createState({ now, focusMin: durationMin });
    return engineRef.current;
  }, [durationMin]);

  // engine 变换落盘的唯一出口：通知对账（补排/精确取消）→ 保存 → 刷新桌面番茄组件
  const persistEngine = useCallback(async (next, prev = null) => {
    const texts = next.mode === 'focus'
      ? {
          title: t('pomodoro.harvestTitle', '收获一颗番茄'),
          body: t('pomodoro.doneBody', '番茄钟时间到了，快来查看你的收获吧'),
        }
      : {
          title: t('pomodoro.restEndTitle', '休息结束'),
          body: t('pomodoro.restEndBody', '准备好开始下一个番茄了吗？'),
        };
    // 无条件落盘：reset/abandon 等变换 notifId 前后同为 null，条件保存会漏持久化
    let saved = next;
    try {
      saved = await syncNotifications(next, texts, prev);
      saved = await saveState(saved);
    } catch (e) {}
    engineRef.current = saved;
    refreshPomodoroWidgets();
    return saved;
  }, [t]);

  // 统一同步（首次挂载 / AppState 回前台共用）：
  // 补结算（杀进程/小组件侧错过的结束迁移）→ 通知对账 → engine 真值恢复 UI 相位。
  const syncEngineToUi = useCallback(async () => {
    if (phaseRef.current === 'holding') return; // 长按开始中不打断
    let state = await ensureEngine();
    try {
      const settled = await settleAndPersist(Date.now()); // 含惰性结算 + CAS 防双写
      state = await persistEngine(settled.state); // 通知对账（running 缺排期补排 / 停止取消）
    } catch (e) { /* 用内存态兜底 */ }

    const now = Date.now();
    const d = deriveDisplay(state, now);
    const hasPending = (state.pendingHarvests || []).length > 0;

    // 有活动/暂停会话：恢复用户偏好上下文（idle 时不动，避免覆盖用户在页面上的选择）
    if (d.running || d.status === 'paused') {
      if (state.focusMin && state.focusMin !== durationMin) {
        setDurationMin(state.focusMin);
        currentMinShared.value = state.focusMin;
      }
      if (state.category) {
        categoryRef.current = state.category;
        setCategory(state.category);
      }
      if (
        state.goalName &&
        state.goalName !== t('home.unnamedFocus', '未命名专注') &&
        state.goalName !== '未命名专注' &&
        state.goalName !== 'Unnamed focus'
      ) {
        setGoalName(state.goalName);
      } else {
        setGoalName('');
      }
      if (state.ambient) setAmbient(state.ambient);
    }

    if (hasPending && phaseRef.current !== 'done') {
      // 补显收获页（含从组件发起、App 未打开时结束的会话）；手动保存才落库
      harvestedRef.current = state.pendingHarvests[0];
      savedRef.current = false;
      setTimeLeftSec(0);
      setPhaseAndRef('done');
      if (onRunningChange) onRunningChange(false);
      return;
    }
    if (d.running && d.mode === 'focus') {
      setTimeLeftSec(d.remainingSec);
      setPhaseAndRef('running');
    } else if (d.running) {
      setRestTimeLeftSec(d.remainingSec);
      setPhaseAndRef('rest');
    } else if (d.status === 'paused') {
      setTimeLeftSec(d.remainingSec);
      setPhaseAndRef('paused');
    } else if (phaseRef.current !== 'done') {
      // idle：不覆盖收获页（收获页由保存/关闭流程退出）
      setPhaseAndRef('idle');
    }
  }, [ensureEngine, persistEngine, durationMin, onRunningChange]);

  syncEngineToUiRef.current = syncEngineToUi;

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
    if (Platform.OS === 'android' || Platform.OS === 'ios') {
      Notifications.getPermissionsAsync().then(({ status }) => {
        if (status !== 'granted') {
          Notifications.requestPermissionsAsync().catch(() => {});
        }
      }).catch(() => {});
    }
    const now = Date.now();
    const totalSec = durationMin * 60;
    const resolvedGoal = goalName.trim() || t('home.unnamedFocus', '未命名专注');

    let st = await ensureEngine();
    // 空闲开始：强制回 focus 满时长新会话；本次上下文写入 state（收获页补显需要）
    if (st.mode !== 'focus' || st.running) st = engineSwitchMode(st, 'focus', now);
    st = engineSetFocusMin(st, durationMin, now);
    st = {
      ...st,
      category: categoryRef.current || 'study',
      goalName: resolvedGoal,
      ambient,
      sessionId: null,
      startTs: null,
    };
    st = engineStart(st, now);
    engineRef.current = st;

    savedRef.current = false;
    setTimeLeftSec(totalSec);
    setPhaseAndRef('running');

    if (onStartFocus) {
      onStartFocus({
        durationSec: totalSec,
        goalName: resolvedGoal,
        category: st.category,
      });
    }

    await persistEngine(st); // 落盘 + 排期结束通知 + 刷新组件
    if (ambient !== 'none') {
      await playAmbientSound(ambient);
    }
  }, [durationMin, goalName, t, ambient, onStartFocus, ensureEngine, persistEngine, playAmbientSound]);

  // 前台计时到点：settle 推进状态机（completedToday++、模式循环、取消通知），
  // 会话进 pendingHarvests——收获页手动保存仍是 focus_sessions 唯一写入口径。
  const handleTimerDone = useCallback(async () => {
    if (phaseRef.current !== 'running') return;
    setPhaseAndRef('done'); // 先切相位防 interval 重入
    setTimeLeftSec(0);
    hapticNotify(Haptics.NotificationFeedbackType.Success);
    await stopAmbientSound();
    let state = engineRef.current;
    let harvested = null;
    try {
      const settled = await settleAndPersist(Date.now());
      state = settled.state;
      harvested = settled.harvested;
      engineRef.current = state;
      refreshPomodoroWidgets();
    } catch (e) {}
    const pending = harvested || (state && state.pendingHarvests || [])[0] || null;
    harvestedRef.current = pending;
    savedRef.current = false;
    if (!pending) {
      // 异常兜底（结算失败/已被他处消费）：回待开始，不卡收获页
      setPhaseAndRef('idle');
      if (state) setTimeLeftSec(state.focusMin * 60);
      if (onRunningChange) onRunningChange(false);
    }
  }, [stopAmbientSound, onRunningChange]);

  // 休息到点：结算落盘（回 focus 待开始），刷新组件
  const handleRestDone = useCallback(async () => {
    if (phaseRef.current !== 'rest' && phaseRef.current !== 'resting') return;
    if (restDoneHandlingRef.current) return;
    try {
      restDoneHandlingRef.current = true;
      setPhaseAndRef('idle');
      hapticNotify(Haptics.NotificationFeedbackType.Success);
      const { state } = await settleAndPersist(Date.now());
      engineRef.current = state;
      setTimeLeftSec(state.focusMin * 60);
    } catch (e) {
      const st = engineRef.current;
      if (st) setTimeLeftSec(st.focusMin * 60);
    } finally {
      restDoneHandlingRef.current = false;
    }
    refreshPomodoroWidgets();
    if (onRunningChange) onRunningChange(false);
  }, [onRunningChange]);

  const pauseFocus = useCallback(async () => {
    if (phase !== 'running') return;
    const prev = engineRef.current;
    if (!prev) return;
    const now = Date.now();
    const next = enginePause(prev, now);
    setPhaseAndRef('paused');
    setTimeLeftSec(deriveDisplay(next, now).remainingSec);
    await pauseAmbientSound();
    await persistEngine(next, prev); // prev 携带 notifId：精确取消结束通知
  }, [phase, pauseAmbientSound, persistEngine]);

  const resumeFocus = useCallback(async () => {
    if (phase !== 'paused') return;
    const prev = engineRef.current;
    if (!prev) return;
    const now = Date.now();
    const next = engineStart(prev, now); // start = resume：按 remainingMs 重算 endAt
    setPhaseAndRef('running');
    setTimeLeftSec(deriveDisplay(next, now).remainingSec);
    await resumeAmbientSound();
    await persistEngine(next, prev); // 重新排期结束通知
  }, [phase, resumeAmbientSound, persistEngine]);

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
      await stopAmbientSound();
      // 放弃 = 回当前模式满时长（pendingHarvests 不动，未保存收获保留）
      const prev = engineRef.current;
      const now = Date.now();
      let next = engineReset(prev || createState({ now, focusMin: durationMin }), now);
      next = { ...next, goalName: '' };
      savedRef.current = false;
      harvestedRef.current = null;
      setGoalName('');
      setPhaseAndRef('idle');
      setTimeLeftSec(next.focusMin * 60);
      engineRef.current = next;
      await persistEngine(next, prev); // 取消结束通知 + 落盘 + 刷新组件
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
  }, [stopAmbientSound, persistEngine, durationMin]);

  const resetToIdle = useCallback(async (notifyParent = true) => {
    const now = Date.now();
    const prev = engineRef.current || createState({ now, focusMin: durationMin });
    // 回 focus 待开始（休息/收获关闭后统一落点）；pendingHarvests 不动
    let next = engineReset(prev, now);
    if (next.mode !== 'focus') next = engineSwitchMode(next, 'focus', now);
    next = { ...next, goalName: '' };
    if (abandonTimerRef.current) {
      clearTimeout(abandonTimerRef.current);
      abandonTimerRef.current = null;
    }
    abandonArmedRef.current = false;
    setAbandonArmed(false);
    setGoalName('');
    setIsNoteEditing(false);
    setPhaseAndRef('idle');
    setTimeLeftSec(next.focusMin * 60);
    setRestTimeLeftSec(REST_DURATION_SEC);
    savedRef.current = false;
    engineRef.current = next;
    if (notifyParent && onRunningChange) onRunningChange(false);
    await persistEngine(next, prev);
  }, [persistEngine, durationMin, onRunningChange]);

  // 收获出队：用户确认（保存或计入）后即从 pendingHarvests 移除，防止重复补显。
  const ackCurrentHarvest = useCallback(async () => {
    const h = harvestedRef.current;
    harvestedRef.current = null;
    if (!h) return;
    const st = engineRef.current;
    if (!st || !(st.pendingHarvests || []).length) return;
    const next = ackHarvest(st, h.sessionId);
    if (next !== st) {
      engineRef.current = next;
      try {
        await saveState(next);
      } catch (e) {}
      refreshPomodoroWidgets();
    }
  }, []);

  // 手动保存：focus_sessions 唯一写入口径不变（数据来自结算快照 harvested）
  const saveFocusRecord = useCallback(async () => {
    const h = harvestedRef.current;
    const totalSec = h ? h.durationSec : durationMin * 60;
    const currentGoal = (h && h.goalName) || goalName.trim();
    if (onSaveFocus && totalSec > 0 && !savedRef.current) {
      try {
        const ok = await onSaveFocus({
          timestamp: (h && (h.endAt || h.startTs)) || Date.now(),
          duration: totalSec,
          goalName: currentGoal || t('home.unnamedFocus', '未命名专注'),
          category: (h && h.category) || categoryRef.current || 'study',
          note: '',
        });
        if (ok !== false) {
          savedRef.current = true;
          if (currentGoal) {
            addRecentGoal(currentGoal);
          }
          await ackCurrentHarvest();
          return true;
        }
        return false;
      } catch (e) {
        return false;
      }
    } else if (savedRef.current) {
      await ackCurrentHarvest();
      return true;
    }
    return true;
  }, [onSaveFocus, goalName, t, durationMin, ackCurrentHarvest, addRecentGoal]);

  const saveDoneFocus = useCallback(async () => {
    const ok = await saveFocusRecord();
    if (ok) {
      await resetToIdle(false);
    }
  }, [saveFocusRecord, resetToIdle]);

  // 收获页「再来一个」：先幂等保存上一个番茄，沿用上一番茄分类、时长、任务名立即开始新番茄
  const startAnotherFocus = useCallback(async () => {
    hapticImpact(Haptics.ImpactFeedbackStyle.Heavy);
    const ok = await saveFocusRecord();
    if (ok) {
      await startFocus();
    }
  }, [saveFocusRecord, startFocus]);

  // 运行中轻触胶囊修改专注目标
  const openEditGoalInRun = useCallback(() => {
    setRunGoalDraft(goalName);
    setIsEditingGoalInRun(true);
  }, [goalName]);

  const saveGoalInRun = useCallback(async () => {
    const trimmed = runGoalDraft.trim();
    setGoalName(trimmed);
    setIsEditingGoalInRun(false);
    const resolved = trimmed || t('home.unnamedFocus', '未命名专注');
    if (engineRef.current) {
      const next = { ...engineRef.current, goalName: resolved };
      engineRef.current = next;
      await persistEngine(next);
    }
  }, [runGoalDraft, t, persistEngine]);

  // 长/短休由引擎周期唯一决定：settle 后 mode 已是 short/long（LONG_REST_EVERY 控制）；
  // 仅当结算失败（mode 仍为 focus）时按 nextModeAfterEnd 预测，避免与引擎漂移
  const isLongRest = (() => {
    const st = engineRef.current;
    if (!st) return false;
    if (st.mode === 'long') return true;
    if (st.mode === 'short') return false;
    return nextModeAfterEnd(st) === 'long';
  })();

  // 计入并开始休息：引擎周期决定长/短休（第 1~3 个短休，第 4/8/12... 个长休）
  const startRest = useCallback(async () => {
    await saveFocusRecord(); // 幂等落库 + 出队
    hapticImpact(Haptics.ImpactFeedbackStyle.Medium);
    const now = Date.now();
    const prev = engineRef.current || createState({ now });
    // settle 已把 mode 置为 short/long 时沿用；仍为 focus（结算失败）才切换，目标模式由引擎推导
    const base = prev.mode === 'focus' ? engineSwitchMode(prev, nextModeAfterEnd(prev), now) : prev;
    const next = engineStart(base, now);
    setRestTimeLeftSec(deriveDisplay(next, now).remainingSec);
    setPhaseAndRef('rest');
    if (onRunningChange) onRunningChange(true);
    await persistEngine(next, prev); // 排期休息结束通知 + 刷新组件
  }, [saveFocusRecord, onRunningChange, persistEngine]);

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

  const handleSelectAmbient = useCallback(async (key) => {
    hapticImpact(Haptics.ImpactFeedbackStyle.Light);
    setAmbient(key);
    AsyncStorage.setItem(STORAGE_KEY_LAST_AMBIENT, key).catch(() => {});
    scrollToAmbientCenter(key);
    if (key === 'none') {
      await stopAmbientSound();
    } else {
      await playAmbientSound(key);
    }
  }, [playAmbientSound, stopAmbientSound, scrollToAmbientCenter]);

  const handleSelectAmbientInModal = handleSelectAmbient;

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
            paddingTop: 8,
            paddingBottom: 0,
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
              onPress={startAnotherFocus}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel={t('pomodoro.anotherOne', { min: durationMin })}
            >
              <Text style={styles.doneSaveBtnText}>
                {t('pomodoro.anotherOne', { min: durationMin })}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.doneRestBtn,
                {
                  backgroundColor: isDark ? '#261F1A' : '#F5EFE6',
                  borderColor: isDark ? '#3D332A' : '#E8DDD0',
                },
              ]}
              onPress={startRest}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={
                isLongRest
                  ? t('pomodoro.saveAndRestLong', { min: LONG_REST_MIN })
                  : t('pomodoro.saveAndRestShort', { min: SHORT_REST_MIN })
              }
            >
              <Text style={[styles.doneRestBtnText, { color: isDark ? '#F5EDE4' : '#2B211C' }]}>
                {isLongRest
                  ? t('pomodoro.saveAndRestLong', { min: LONG_REST_MIN })
                  : t('pomodoro.saveAndRestShort', { min: SHORT_REST_MIN })}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.doneOnlySaveBtn}
              onPress={saveDoneFocus}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={t('pomodoro.saveToToday', '记入今日专注')}
            >
              <Text style={[styles.doneOnlySaveBtnText, { color: isDark ? '#A6988D' : '#6B5B4F' }]}>
                {t('pomodoro.saveToToday', '记入今日专注')}
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </Animated.View>
    );
  }

  // ==================== 休息中 (REST) ====================
  if (phase === 'rest' || phase === 'resting') {
    return (
      <Animated.View
        style={[
          styles.restContainer,
          { backgroundColor: animatedPageBg, paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 },
        ]}
      >
        <View style={styles.restContent}>
          <Text style={[styles.restTitle, { color: isDark ? '#F5EDE4' : '#2B211C' }]}>
            {t('pomodoro.relaxTitle', '放松一下')}
          </Text>

          {/* 8 秒呼吸动画环与大倒计时 */}
          <Animated.View
            style={[
              styles.restTimerWrap,
              {
                transform: [{ scale: reduceMotion ? 1 : breatheAnim }],
              },
            ]}
          >
            <View
              style={[
                styles.restBreatheRing,
                {
                  backgroundColor: isDark ? 'rgba(78, 143, 74, 0.12)' : 'rgba(78, 143, 74, 0.08)',
                  borderColor: isDark ? 'rgba(78, 143, 74, 0.3)' : 'rgba(78, 143, 74, 0.2)',
                },
              ]}
            >
              <Text style={[styles.restTimer, { color: isDark ? '#81C784' : '#4E8F4A' }]}>
                {formatTime(restTimeLeftSec)}
              </Text>
            </View>
          </Animated.View>

          <Text style={[styles.restHint, { color: isDark ? '#A6988D' : '#6B5B4F' }]}>
            {t('pomodoro.restHint', '让大脑喘口气，倒计时结束后会自动返回')}
          </Text>

          <TouchableOpacity
            style={[
              styles.restSkipBtn,
              {
                backgroundColor: isDark ? '#261F1A' : '#FAF6F0',
                borderColor: isDark ? '#3D332A' : '#E8DDD0',
              },
            ]}
            onPress={() => resetToIdle(true)}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={t('pomodoro.skipRest', '跳过休息')}
          >
            <Text style={[styles.restSkipBtnText, { color: isDark ? '#D5C7BA' : '#5E4F44' }]}>
              {t('pomodoro.skipRest', '跳过休息')}
            </Text>
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
              {t('pomodoro.todayNth', { n: formatOrdinal(todaySummary.count + 1, lang) })}
            </Text>
            <TouchableOpacity
              style={[
                styles.runCatCapsule,
                {
                  backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#FFFFFF',
                  borderColor: isDark ? 'rgba(255,255,255,0.12)' : '#EFE5D8',
                },
              ]}
              activeOpacity={0.7}
              onPress={openEditGoalInRun}
            >
              <View
                style={[
                  styles.catChipDot,
                  { backgroundColor: selectedCategoryMeta?.color || colors.primary },
                ]}
              />
              <Text style={[styles.runCatName, { color: isDark ? '#F5EDE4' : '#2B211C' }]}>
                {selectedCategoryMeta?.name}
              </Text>
              {(() => {
                const currentGoal = (goalName || '').trim();
                const isUnnamed =
                  !currentGoal ||
                  currentGoal === t('home.unnamedFocus', '未命名专注') ||
                  currentGoal === '未命名专注' ||
                  currentGoal === 'Unnamed focus';
                if (!isUnnamed) {
                  return (
                    <Text
                      style={[styles.runGoalText, { color: isDark ? '#D5C7BA' : '#5E4F44' }]}
                      numberOfLines={1}
                      ellipsizeMode="tail"
                    >
                      {' · ' + currentGoal}
                    </Text>
                  );
                }
                return null;
              })()}
              <Ionicons
                name="pencil-outline"
                size={11}
                color={isDark ? 'rgba(255,255,255,0.4)' : '#A6988D'}
                style={{ marginLeft: 2 }}
              />
            </TouchableOpacity>
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

          {/* 白噪音水平滑动选择条：横滑点选即切，无需弹窗 */}
          <View
            style={styles.ambientStripWrap}
            onLayout={(e) => {
              ambientViewportWidthRef.current = e.nativeEvent.layout.width;
            }}
          >
            <ScrollView
              ref={ambientScrollRef}
              horizontal
              showsHorizontalScrollIndicator={false}
              nestedScrollEnabled={true}
              contentContainerStyle={styles.ambientStripContent}
            >
              {AMBIENT_OPTIONS.map((item) => {
                const isActive = ambient === item.key;
                return (
                  <TouchableOpacity
                    key={item.key}
                    style={[
                      styles.ambientStripChip,
                      {
                        backgroundColor: isDark ? '#261F1A' : '#FFFFFF',
                        borderColor: isDark ? '#3D332A' : '#EFE5D8',
                      },
                      isActive && styles.ambientStripChipActive,
                    ]}
                    onPress={() => handleSelectAmbient(item.key)}
                    onLayout={(e) => {
                      ambientChipLayoutsRef.current[item.key] = e.nativeEvent.layout;
                    }}
                    activeOpacity={0.7}
                  >
                    <Ionicons
                      name={item.icon}
                      size={15}
                      color={isActive ? '#FFFFFF' : (isDark ? colors.ink2 : '#6B5B4F')}
                    />
                    <Text
                      style={[
                        styles.ambientStripChipText,
                        { color: isDark ? colors.ink2 : '#6B5B4F' },
                        isActive && styles.ambientStripChipTextActive,
                      ]}
                    >
                      {t(item.label, item.key)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </ScrollView>

        {/* 运行中编辑专注目标 Modal */}
        <Modal
          visible={isEditingGoalInRun}
          transparent
          animationType="fade"
          onRequestClose={() => setIsEditingGoalInRun(false)}
        >
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.modalBg}
          >
            <View
              style={[
                styles.modalContent,
                {
                  backgroundColor: colors.card || (isDark ? '#1F1E1D' : '#FFFFFF'),
                  borderColor: isDark ? 'rgba(255,255,255,0.1)' : '#EFE5D8',
                  borderWidth: 1,
                },
              ]}
            >
              <Text
                style={[
                  styles.modalTitle,
                  { color: colors.ink || (isDark ? '#F5EDE4' : '#2B211C'), marginBottom: 8 },
                ]}
              >
                {t('home.renameFocusTitle', '修改专注目标')}
              </Text>
              <Text
                style={{
                  fontSize: 13,
                  color: isDark ? '#A6988D' : '#6B5B4F',
                  textAlign: 'center',
                  marginBottom: 16,
                }}
              >
                {t('home.renameFocusSub', '给这次专注起个响亮的名字')}
              </Text>
              <TextInput
                style={{
                  height: 48,
                  borderRadius: 12,
                  paddingHorizontal: 14,
                  fontSize: 15,
                  backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#FAF4EC',
                  color: colors.ink || (isDark ? '#F5EDE4' : '#2B211C'),
                  borderWidth: 1,
                  borderColor: isDark ? 'rgba(255,255,255,0.12)' : '#EADFD0',
                  marginBottom: 20,
                }}
                value={runGoalDraft}
                onChangeText={setRunGoalDraft}
                placeholder={t('pomodoro.notePlaceholder', '具体做什么？（选填）')}
                placeholderTextColor={isDark ? '#7A6F66' : '#A6988D'}
                maxLength={30}
                autoFocus
                returnKeyType="done"
                onSubmitEditing={saveGoalInRun}
              />
              <View style={styles.customDurBtnRow}>
                <TouchableOpacity
                  style={[
                    styles.customDurBtnCancel,
                    {
                      backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#FAF4EC',
                      borderColor: isDark ? 'rgba(255,255,255,0.1)' : '#EADFD0',
                    },
                  ]}
                  onPress={() => setIsEditingGoalInRun(false)}
                >
                  <Text
                    style={[
                      styles.customDurBtnCancelText,
                      { color: isDark ? '#D5C7BA' : '#6B5B4F' },
                    ]}
                  >
                    {t('common.cancel')}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.customDurBtnConfirm,
                    { backgroundColor: colors.primary || '#C63D31' },
                  ]}
                  onPress={saveGoalInRun}
                >
                  <Text style={styles.customDurBtnConfirmText}>{t('common.save')}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>
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
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
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

        {/* 4.5 最近任务名快捷选择（最多 5 个芯片，去重，最新排前；无记录时整行隐藏） */}
        {recentGoals.length > 0 ? (
          <View style={styles.recentGoalsWrap}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.recentGoalsScroll}
              keyboardShouldPersistTaps="handled"
            >
              {recentGoals.map((item) => {
                const isSelected = goalName === item;
                return (
                  <TouchableOpacity
                    key={`recent-goal-${item}`}
                    style={[
                      styles.recentGoalChip,
                      {
                        backgroundColor: isSelected
                          ? (isDark ? 'rgba(198, 61, 49, 0.18)' : '#FDE8E6')
                          : (isDark ? '#261F1A' : '#FAF6F0'),
                        borderColor: isSelected
                          ? '#C63D31'
                          : (isDark ? '#3D332A' : '#E8DDD0'),
                      },
                    ]}
                    onPress={() => {
                      setGoalName(isSelected ? '' : item);
                      hapticImpact(Haptics.ImpactFeedbackStyle.Light);
                    }}
                    activeOpacity={0.7}
                    hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isSelected }}
                    accessibilityLabel={item}
                  >
                    <Text
                      style={[
                        styles.recentGoalChipText,
                        {
                          color: isSelected
                            ? '#C63D31'
                            : (isDark ? '#D5C7BA' : '#5E4F44'),
                          fontWeight: isSelected ? '700' : '500',
                        },
                      ]}
                      numberOfLines={1}
                    >
                      {item}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        ) : null}

        {/* 4.5 目标备注输入框（上移至分类下方，自然聚合且防键盘遮挡） */}
        <View style={styles.noteInputWrap}>
          <View
            style={[
              styles.noteInputCard,
              {
                backgroundColor: isDark ? '#1F1915' : '#FAF6F0',
                borderColor: isNoteFocused
                  ? '#C63D31'
                  : (isDark ? '#3D332A' : '#EADFD0'),
              },
            ]}
          >
            <Ionicons
              name="pencil-outline"
              size={15}
              color={isNoteFocused ? '#C63D31' : (isDark ? '#8C7D73' : '#6B5B4F')}
              style={styles.pencilIcon}
            />
            <TextInput
              style={[
                styles.noteInputText,
                { color: colors?.ink || (isDark ? '#F5EDE4' : '#2B211C') },
              ]}
              value={goalName}
              onChangeText={setGoalName}
              placeholder={t('pomodoro.notePlaceholder', '具体做什么？（选填）')}
              placeholderTextColor={isDark ? '#7A6F66' : '#A6988D'}
              maxLength={30}
              onFocus={() => setIsNoteFocused(true)}
              onBlur={() => setIsNoteFocused(false)}
              returnKeyType="done"
              onSubmitEditing={() => Keyboard.dismiss()}
            />
            {goalName && goalName.length > 0 ? (
              <TouchableOpacity
                onPress={() => setGoalName('')}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                activeOpacity={0.7}
              >
                <Ionicons
                  name="close-circle"
                  size={17}
                  color={isDark ? '#8C7D73' : '#A6988D'}
                />
              </TouchableOpacity>
            ) : null}
          </View>
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

  // 4. 分类横向滚动条（紧凑连接目标输入框）
  catScrollWrapper: {
    position: 'relative',
    width: '100%',
    minHeight: 44,
    marginBottom: 10,
  },
  // 4.4 最近任务名快捷选择芯片
  recentGoalsWrap: {
    width: '100%',
    marginBottom: 8,
  },
  recentGoalsScroll: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    gap: 8,
  },
  recentGoalChip: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 32,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
  },
  recentGoalChipText: {
    fontSize: 12,
    maxWidth: 160,
  },
  // 4.5 目标备注输入框
  noteInputWrap: {
    width: '100%',
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  noteInputCard: {
    height: 42,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  pencilIcon: {
    marginRight: 8,
  },
  noteInputText: {
    flex: 1,
    fontSize: 13,
    paddingVertical: 0,
    fontWeight: '500',
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
    marginBottom: 16,
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
    maxWidth: '88%',
  },
  runCatName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#2B211C',
  },
  runGoalText: {
    fontSize: 15,
    color: '#5E4F44',
    flexShrink: 1,
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
  ambientStripWrap: {
    width: '100%',
    marginTop: 10,
    marginBottom: 20,
  },
  ambientStripContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    gap: 8,
  },
  ambientStripChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    minHeight: 38,
  },
  ambientStripChipActive: {
    backgroundColor: '#C63D31',
    borderColor: '#C63D31',
  },
  ambientStripChipText: {
    fontSize: 13,
    fontWeight: '500',
  },
  ambientStripChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },

  // 收获页面
  doneContainer: {
    flex: 1,
    alignSelf: 'stretch',
  },
  doneScroll: {
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  harvestVisualWrap: {
    width: 200,
    height: 200,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    marginTop: 10,
    marginBottom: 8,
  },
  burstDot: {
    position: 'absolute',
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  harvestTitle: {
    fontSize: 26,
    fontWeight: '700',
    color: '#2B211C',
    marginTop: 6,
  },
  harvestSub: {
    fontSize: 13,
    color: '#5E4F44',
    marginTop: 4,
  },
  harvestTaskText: {
    fontSize: 13,
    color: '#5E4F44',
    marginTop: 2,
  },
  postCatHint: {
    fontSize: 12,
    color: '#5E4F44',
    marginTop: 12,
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
    height: 42,
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
    fontSize: 13,
    color: '#2B211C',
    fontWeight: '500',
  },
  catBtnDoneTextSelected: {
    fontWeight: '700',
  },
  doneBtnGroup: {
    width: '100%',
    marginTop: 14,
    gap: 8,
  },
  doneSaveBtn: {
    width: '100%',
    height: 52,
    borderRadius: 999,
    backgroundColor: '#C63D31',
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneSaveBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  doneRestBtn: {
    width: '100%',
    height: 48,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneRestBtnText: {
    fontSize: 14,
    fontWeight: '600',
  },
  doneOnlySaveBtn: {
    width: '100%',
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  doneOnlySaveBtnText: {
    fontSize: 14,
    fontWeight: '500',
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
    marginBottom: 24,
  },
  restTimerWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  restBreatheRing: {
    width: 220,
    height: 220,
    borderRadius: 110,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  restTimer: {
    fontSize: 54,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
    letterSpacing: -1,
  },
  restHint: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 36,
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
