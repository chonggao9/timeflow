import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, Animated, PanResponder, Pressable, Vibration, Easing, TouchableOpacity, ScrollView, TextInput, Modal, Alert, AppState } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../theme/ThemeContext';
import { useI18n } from '../i18n/LanguageContext';
import { radius, shadow } from '../theme';

import { formatDuration } from '../utils/stats';
import FocusHistoryModal from './FocusHistoryModal';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

// 6 大类的 i18n key 和对应的彩色色值（严格与设计稿色彩保持一致）
const CATEGORY_ITEMS = [
  { key: 'pomodoro.helpWork', icon: '💼', color: '#3B6FD6' },
  { key: 'pomodoro.helpStudy', icon: '📚', color: '#D63B3B' },
  { key: 'pomodoro.helpCreate', icon: '🎨', color: '#E58A1F' },
  { key: 'pomodoro.helpBodyMind', icon: '🧘', color: '#2E9E6B' },
  { key: 'pomodoro.helpLife', icon: '🧹', color: '#2B8FB5' },
  { key: 'pomodoro.helpPlan', icon: '💡', color: '#7B5BC4' },
];

const DURATION_PRESETS = [15, 25, 45, 60];

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

export default function PomodoroTimer({
  onStartFocus,
  onSaveFocus,
  todayFocusCount = 0,
  todayFocusSec = 0,
  todayFocusRecords = [],
  onUpdateRecord,
  onDeleteRecord,
  onGoInsights,
  onRunningChange,
}) {
  const { colors } = useTheme();
  const { t, lang } = useI18n();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [durationSec, setDurationSec] = useState(25 * 60);
  const [timeLeft, setTimeLeft] = useState(25 * 60);
  const [running, setRunning] = useState(false);
  const [paused, setPaused] = useState(false);
  const [flowMode, setFlowMode] = useState(false);
  const [overtimeSec, setOvertimeSec] = useState(0);

  useEffect(() => {
    if (onRunningChange) {
      onRunningChange(running);
    }
  }, [running, onRunningChange]);

  const [ambient, setAmbient] = useState('none');
  const [showAmbientPicker, setShowAmbientPicker] = useState(false);
  const soundRef = useRef(null);
  const playReqIdRef = useRef(0);

  const [category, setCategory] = useState(null);
  const [goalName, setGoalName] = useState('');
  const [showHelp, setShowHelp] = useState(false);
  const [showPostFocus, setShowPostFocus] = useState(false);
  const [showAbandonModal, setShowAbandonModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [showCustomModal, setShowCustomModal] = useState(false);
  const [customMinutesInput, setCustomMinutesInput] = useState('');
  const [postCategory, setPostCategory] = useState(null);
  const [postNote, setPostNote] = useState('');
  const pendingSaveRef = useRef(null);

  // 计算今日专注总时长与各分类占比
  const todayFocusRecordsList = todayFocusRecords || [];
  const totalFocusSecCalculated = todayFocusSec || todayFocusRecordsList.reduce((s, r) => s + (Number(r.duration) || 0), 0);
  const totalFocusCountCalculated = todayFocusCount || todayFocusRecordsList.length;

  const distributionBar = useMemo(() => {
    if (!totalFocusSecCalculated || !todayFocusRecordsList.length) return [];
    const map = {};
    for (const r of todayFocusRecordsList) {
      const catKey = r.category || 'unnamed';
      const meta = CATEGORY_ITEMS.find(c => c.key === catKey);
      const color = meta ? meta.color : '#B9A99D';
      if (!map[catKey]) map[catKey] = { color, sec: 0 };
      map[catKey].sec += Number(r.duration) || 0;
    }
    return Object.values(map).map(m => ({
      color: m.color,
      pct: Math.max(3, Math.round((m.sec / totalFocusSecCalculated) * 100)),
    }));
  }, [todayFocusRecordsList, totalFocusSecCalculated]);

  const timerRef = useRef(null);

  // Animation Values
  const progressAnim = useRef(new Animated.Value(1)).current;
  const pressScale = useRef(new Animated.Value(1)).current;
  const glowOpacity = useRef(new Animated.Value(0)).current;

  // Circle configs
  const size = 240;
  const strokeWidth = 12;
  const cx = size / 2;
  const cy = size / 2;
  const r = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * r;

  // Gestural Dial - 仅在明确垂直拖拽时响应，不抢占点击与滚动
  const initialDurationRef = useRef(durationSec);
  const dialResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (evt, gestureState) => {
        if (running) return false;
        // 严格垂直阈值：垂直位移超过 18px 且垂直意图明显大于水平
        return (
          Math.abs(gestureState.dy) > 18 &&
          Math.abs(gestureState.dy) > Math.abs(gestureState.dx) * 2
        );
      },
      onPanResponderGrant: () => {
        initialDurationRef.current = durationSec;
      },
      onPanResponderMove: (evt, gestureState) => {
        if (running) return;
        const deltaMins = Math.round(-gestureState.dy / 22) * 5;
        let newSec = initialDurationRef.current + deltaMins * 60;
        if (newSec < 5 * 60) newSec = 5 * 60;
        if (newSec > 180 * 60) newSec = 180 * 60;

        if (newSec !== durationSec) {
          setDurationSec(newSec);
          setTimeLeft(newSec);
        }
      },
    })
  ).current;

  // 基于绝对时间戳的实时计时同步器（解决息屏/后台计时挂起问题）
  const targetEndTsRef = useRef(null);
  const accumulatedFocusSecRef = useRef(0);

  const syncTimeTick = useCallback(() => {
    if (!running || paused) return;
    const targetEnd = targetEndTsRef.current;
    if (!targetEnd) return;
    const now = Date.now();

    if (now < targetEnd) {
      // 倒计时阶段
      const remSec = Math.max(1, Math.round((targetEnd - now) / 1000));
      setTimeLeft(remSec);
      setOvertimeSec(0);
      progressAnim.setValue(remSec / durationSec);
    } else {
      // 倒计时已跑完，进入心流延展超时阶段
      setTimeLeft(0);
      const overSec = Math.max(0, Math.round((now - targetEnd) / 1000));
      setOvertimeSec(overSec);
      progressAnim.setValue(1);
      if (!flowMode) {
        setFlowMode(true);
        Vibration.vibrate([0, 100, 50, 100]);
      }
    }
  }, [running, paused, durationSec, flowMode, progressAnim]);

  // 息屏/前后台唤醒时立即校准时间
  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active' && running && !paused) {
        syncTimeTick();
      }
    });
    return () => sub.remove();
  }, [running, paused, syncTimeTick]);

  // 前台 UI 刷新定时器（仅负责每秒调度 syncTimeTick，不再依赖累加减一）
  useEffect(() => {
    if (running && !paused) {
      syncTimeTick();
      timerRef.current = setInterval(() => {
        syncTimeTick();
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [running, paused, syncTimeTick]);

  // Breathing effect during focus
  useEffect(() => {
    if (running && !paused) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(glowOpacity, { toValue: flowMode ? 1 : 0.4, duration: flowMode ? 2000 : 1500, useNativeDriver: true }),
          Animated.timing(glowOpacity, { toValue: flowMode ? 0.3 : 0.1, duration: flowMode ? 2000 : 1500, useNativeDriver: true })
        ])
      ).start();
    } else {
      glowOpacity.stopAnimation();
      glowOpacity.setValue(0);
    }
  }, [flowMode, running, paused]);

  // 1. 初始化全局音频模式
  useEffect(() => {
    Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      staysActiveInBackground: true,
      playsInSilentModeIOS: true,
      shouldDuckAndroid: true,
      playThroughEarpieceAndroid: false,
    }).catch((err) => {
      console.warn('[Audio] setAudioModeAsync error:', err);
    });

    return () => {
      if (soundRef.current) {
        soundRef.current.unloadAsync().catch(() => {});
        soundRef.current = null;
      }
    };
  }, []);

  // 2. 统一白噪音播放核心函数（防竞态与泄露）
  const playAmbientSound = async (soundKey) => {
    const reqId = ++playReqIdRef.current;

    // 卸载已加载声音
    if (soundRef.current) {
      const prev = soundRef.current;
      soundRef.current = null;
      try {
        await prev.stopAsync();
        await prev.unloadAsync();
      } catch (e) {}
    }

    if (soundKey === 'none' || !AMBIENT_SOUND_FILES[soundKey]) {
      return;
    }

    try {
      const { sound } = await Audio.Sound.createAsync(
        AMBIENT_SOUND_FILES[soundKey],
        {
          shouldPlay: true,
          isLooping: true,
          volume: 0.7,
        }
      );

      // 若在加载过程中已有新请求，立即释放并退出
      if (reqId !== playReqIdRef.current) {
        await sound.stopAsync().catch(() => {});
        await sound.unloadAsync().catch(() => {});
        return;
      }

      soundRef.current = sound;
      await sound.playAsync();
    } catch (err) {
      console.warn('[Audio] playAmbientSound error:', soundKey, err);
    }
  };

  const stopAmbientSound = async () => {
    playReqIdRef.current++;
    if (soundRef.current) {
      const cur = soundRef.current;
      soundRef.current = null;
      try {
        await cur.stopAsync();
        await cur.unloadAsync();
      } catch (e) {}
    }
  };

  // 3. 专注状态与音频播放联动
  useEffect(() => {
    if (running) {
      if (paused) {
        if (soundRef.current) {
          soundRef.current.pauseAsync().catch(() => {});
        }
      } else {
        if (soundRef.current) {
          soundRef.current.playAsync().catch(() => {});
        } else if (ambient !== 'none') {
          playAmbientSound(ambient);
        }
      }
    } else {
      if (!showAmbientPicker) {
        stopAmbientSound();
      }
    }
  }, [running, paused, ambient, showAmbientPicker]);

  const handleStart = () => {
    if (!category) {
      Vibration.vibrate(50);
      Alert.alert(t('pomodoro.requireCategory', '请先选择一个专注分类'));
      return;
    }
    if (!running) {
      Vibration.vibrate(20);
      accumulatedFocusSecRef.current = 0;
      targetEndTsRef.current = Date.now() + durationSec * 1000;
      setRunning(true);
      setPaused(false);
      setFlowMode(false);
      setOvertimeSec(0);
      setTimeLeft(durationSec);
      progressAnim.setValue(1);
      if (onStartFocus) onStartFocus({ durationSec, goalName: goalName.trim() || t('home.unnamedFocus'), category });
    }
  };

  const handlePause = () => {
    Vibration.vibrate(20);
    const now = Date.now();
    if (targetEndTsRef.current) {
      if (now < targetEndTsRef.current) {
        const remSec = Math.max(0, Math.round((targetEndTsRef.current - now) / 1000));
        accumulatedFocusSecRef.current = durationSec - remSec;
        setTimeLeft(remSec);
      } else {
        const overSec = Math.max(0, Math.round((now - targetEndTsRef.current) / 1000));
        accumulatedFocusSecRef.current = durationSec + overSec;
        setOvertimeSec(overSec);
        setTimeLeft(0);
      }
    }
    targetEndTsRef.current = null;
    setPaused(true);
  };

  const handleResume = () => {
    Vibration.vibrate(20);
    const now = Date.now();
    if (!flowMode) {
      targetEndTsRef.current = now + timeLeft * 1000;
    } else {
      targetEndTsRef.current = now - overtimeSec * 1000;
    }
    setPaused(false);
  };

  const handleAbandon = () => {
    Vibration.vibrate(20);
    setShowAbandonModal(true);
  };

  // 计时会话结束（放弃 / 无保存结束 / 已保存）时统一清理活跃专注标记，
  // 否则未保存的会话会让 widget 一直显示"专注中"。
  const clearActiveFocus = useCallback(() => {
    AsyncStorage.removeItem('timeflow_active_focus').catch(() => {});
  }, []);

  const confirmAbandon = () => {
    setShowAbandonModal(false);
    Vibration.vibrate(30);
    stopAmbientSound();
    targetEndTsRef.current = null;
    accumulatedFocusSecRef.current = 0;
    setRunning(false);
    setPaused(false);
    setFlowMode(false);
    setTimeLeft(durationSec);
    setOvertimeSec(0);
    progressAnim.setValue(1);
    clearActiveFocus();
  };

  const handleFinish = () => {
    Vibration.vibrate(80);
    stopAmbientSound();
    const actualFocusSec = durationSec - timeLeft + overtimeSec;
    targetEndTsRef.current = null;
    accumulatedFocusSecRef.current = 0;
    setRunning(false);
    setPaused(false);

    if (actualFocusSec > 30) {
      // Show post-focus modal for review
      pendingSaveRef.current = { duration: actualFocusSec, goalName: goalName.trim() || t('home.unnamedFocus'), category };
      setPostCategory(category);
      setPostNote('');
      setShowPostFocus(true);
    } else {
      // 太短不保存，直接清掉活跃标记
      clearActiveFocus();
    }

    setFlowMode(false);
    setTimeLeft(durationSec);
    setOvertimeSec(0);
    progressAnim.setValue(1);
  };

  const confirmPostFocus = () => {
    if (pendingSaveRef.current && onSaveFocus) {
      onSaveFocus({
        ...pendingSaveRef.current,
        category: postCategory || pendingSaveRef.current.category,
        note: postNote.trim(),
      });
    }
    pendingSaveRef.current = null;
    setShowPostFocus(false);
    clearActiveFocus();
  };

  const handleDurationPreset = (mins) => {
    const sec = mins * 60;
    setDurationSec(sec);
    setTimeLeft(sec);
  };

  const handleCustomDurationConfirm = () => {
    const mins = parseInt(customMinutesInput, 10);
    if (!isNaN(mins) && mins >= 1 && mins <= 180) {
      handleDurationPreset(mins);
      setShowCustomModal(false);
    } else {
      Alert.alert(t('pomodoro.customDurTitle', '自定义专注时长'), t('pomodoro.customDurHint', '请输入 1~180 之间的分钟数'));
    }
  };

  const formatTime = (secs) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const formatShortDur = (sec) => {
    if (sec >= 3600) return `${(sec / 3600).toFixed(1)}h`;
    return `${Math.floor(sec / 60)}m`;
  };

  const strokeDashoffset = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [circumference, 0],
  });

  const ringColor = flowMode ? colors.success : colors.primary;
  const durationMin = Math.round(durationSec / 60);
  const currentAmbient = AMBIENT_OPTIONS.find(a => a.key === ambient);
  const currentAmbientLabel = currentAmbient ? t(currentAmbient.label, currentAmbient.key) : t('pomodoro.ambient_none', '无声');

  const handleSelectAmbientInModal = (key) => {
    setAmbient(key);
    if (key === 'none') {
      stopAmbientSound();
    } else {
      playAmbientSound(key);
    }
  };

  const handleCloseAmbientModal = () => {
    setShowAmbientPicker(false);
    if (!running) {
      stopAmbientSound();
    }
  };

  const renderAmbientModal = () => (
    <Modal visible={showAmbientPicker} transparent animationType="fade" onRequestClose={handleCloseAmbientModal}>
      <View style={styles.modalBg}>
        <View style={styles.modalContent}>
          <Text style={styles.modalTitle}>{t('pomodoro.bgSound', '背景声音')}</Text>
          <View style={styles.ambientGrid}>
            {AMBIENT_OPTIONS.map(item => {
              const isActive = ambient === item.key;
              return (
                <TouchableOpacity
                  key={item.key}
                  style={[styles.ambientOption, isActive && styles.ambientOptionActive]}
                  onPress={() => handleSelectAmbientInModal(item.key)}
                  activeOpacity={0.7}
                >
                  <Ionicons name={item.icon} size={20} color={isActive ? colors.primaryStrong : colors.ink2} />
                  <Text style={[styles.ambientOptionText, isActive && { color: colors.primaryStrong, fontWeight: '700' }]}>
                    {t(item.label, item.key)}
                  </Text>
                  {isActive && item.key !== 'none' && (
                    <Ionicons name="volume-high" size={14} color={colors.primaryStrong} style={{ marginLeft: 'auto' }} />
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
          <TouchableOpacity style={[styles.modalClose, { backgroundColor: colors.chip }]} onPress={handleCloseAmbientModal}>
            <Text style={[styles.modalCloseText, { color: colors.ink }]}>{t('common.done', '完成')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );

  const renderAbandonModal = () => (
    <Modal visible={showAbandonModal} transparent animationType="fade">
      <View style={styles.modalBg}>
        <View style={styles.abandonModalCard}>
          <View style={[styles.abandonIconWrap, { backgroundColor: colors.danger + '18' }]}>
            <Ionicons name="alert-circle" size={32} color={colors.danger} />
          </View>
          <Text style={styles.abandonModalTitle}>{t('pomodoro.abandonTitle', '放弃专注')}</Text>
          <Text style={styles.abandonModalMsg}>
            {t('pomodoro.abandonMsg', '确定要放弃这次专注吗？已完成的时间将不会被记录。')}
          </Text>

          <View style={styles.abandonBtnRow}>
            <TouchableOpacity
              style={[styles.abandonBtnCancel, { backgroundColor: colors.chip }]}
              onPress={() => setShowAbandonModal(false)}
              activeOpacity={0.7}
            >
              <Text style={[styles.abandonBtnCancelText, { color: colors.ink }]}>
                {t('pomodoro.keepFocusing', '继续专注')}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.abandonBtnConfirm, { backgroundColor: colors.danger }]}
              onPress={confirmAbandon}
              activeOpacity={0.8}
            >
              <Text style={styles.abandonBtnConfirmText}>
                {t('pomodoro.confirmAbandon', '放弃')}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );

  // 专注结束后弹出（确认分类/备注）。必须在 running 与 idle 两个渲染分支都挂载：
  // handleFinish 会先 setRunning(false)，弹窗若只挂在 running 分支就会被卸载，导致永远无法保存。
  const renderPostFocusModal = () => (
    <Modal visible={showPostFocus} transparent animationType="slide">
      <View style={styles.modalBg}>
        <View style={styles.modalContent}>
          <Text style={styles.modalTitle}>{t('pomodoro.postTitle', '🎉 专注完成！')}</Text>
          <Text style={styles.postDuration}>{formatShortDur(pendingSaveRef.current?.duration || 0)}</Text>

          <Text style={styles.postLabel}>{t('pomodoro.postCatLabel', '确认分类')}</Text>
          <View style={styles.postCatGrid}>
            {CATEGORY_ITEMS.map(item => {
              const isSelected = postCategory === item.key;
              // 去除可能自带的 emoji 前缀，保证只显示单个大图标与纯文本
              const cleanLabel = t(item.key).replace(/^[^\w\u4e00-\u9fa5]+\s*/, '');
              return (
                <TouchableOpacity
                  key={item.key}
                  style={[styles.postCatBtn, isSelected && { borderColor: item.color, borderWidth: 2 }]}
                  onPress={() => setPostCategory(item.key)}
                >
                  <Text style={styles.postCatIcon}>{item.icon}</Text>
                  <Text style={[styles.postCatText, isSelected && { fontWeight: '700' }]}>{cleanLabel}</Text>
                  {isSelected && <Ionicons name="checkmark-circle" size={16} color={item.color} style={{ position: 'absolute', top: 4, right: 4 }} />}
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={styles.postLabel}>{t('pomodoro.postNoteLabel', '补充备注（选填）')}</Text>
          <TextInput
            style={styles.postNoteInput}
            value={postNote}
            onChangeText={setPostNote}
            placeholder={t('pomodoro.postNotePlaceholder', '这次专注做了什么？')}
            placeholderTextColor={colors.ink3}
            maxLength={100}
            multiline
          />

          <TouchableOpacity style={styles.modalClose} onPress={confirmPostFocus}>
            <Text style={styles.modalCloseText}>{t('pomodoro.postConfirm', '确认保存')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );

  // ==================== RUNNING STATE ====================
  if (running) {
    const pomodoroNumber = todayFocusCount + 1;
    const catItem = CATEGORY_ITEMS.find(c => c.key === category);
    const elapsedSec = durationSec - timeLeft;
    const elapsedMin = Math.floor(elapsedSec / 60);
    const elapsedRemSec = elapsedSec % 60;

    return (
      <View style={styles.runningContainer}>
        {/* Top: Today nth pomodoro & Category/Task pill */}
        <View style={styles.runTopWrap}>
          <Text style={styles.runCountText}>
            {t('pomodoro.todayNth', '今天第 {n} 个番茄').replace('{n}', pomodoroNumber)}
          </Text>
          {catItem && (
            <View style={[styles.runCatPill, { borderColor: catItem.color + '40', backgroundColor: catItem.color + '15' }]}>
              <Text style={styles.runCatText}>{t(catItem.key)}</Text>
              {goalName.trim() ? (
                <Text style={styles.runGoalText}> · {goalName.trim()}</Text>
              ) : null}
            </View>
          )}
        </View>

        {/* Timer Ring */}
        <View style={styles.ringContainer}>
          <Svg width={size} height={size}>
            <Circle cx={cx} cy={cy} r={r} stroke={colors.line2} strokeWidth={strokeWidth} fill="none" />
            <AnimatedCircle
              cx={cx} cy={cy} r={r}
              stroke={ringColor}
              strokeWidth={strokeWidth}
              strokeDasharray={circumference}
              strokeDashoffset={flowMode ? 0 : strokeDashoffset}
              strokeLinecap="round"
              fill="none"
              transform={`rotate(-90 ${cx} ${cy})`}
            />
            {!paused && (
              <AnimatedCircle
                cx={cx} cy={cy} r={r}
                stroke={ringColor}
                strokeWidth={strokeWidth + (flowMode ? 10 : 6)}
                strokeOpacity={glowOpacity}
                strokeDasharray={circumference}
                strokeDashoffset={flowMode ? 0 : strokeDashoffset}
                strokeLinecap="round"
                fill="none"
                transform={`rotate(-90 ${cx} ${cy})`}
              />
            )}
          </Svg>

          <View style={styles.timeWrap}>
            {flowMode ? (
              <>
                <Text style={[styles.runTimeText, { color: colors.success }]}>+{formatTime(overtimeSec)}</Text>
                <Text style={styles.runSubText}>
                  {t('pomodoro.focusedTime', '已专注 {time}').replace('{time}', formatTime(durationSec))}
                </Text>
              </>
            ) : (
              <>
                <Text style={[styles.runTimeText, paused && { opacity: 0.4 }]}>{formatTime(timeLeft)}</Text>
                <Text style={styles.runSubText}>
                  {paused ? t('pomodoro.pausedLabel', '已暂停') : (
                    t('pomodoro.runningSubText', '共 {total} 分钟 · 已专注 {min} 分 {sec} 秒')
                      .replace('{total}', durationMin)
                      .replace('{min}', elapsedMin)
                      .replace('{sec}', elapsedRemSec)
                  )}
                </Text>
              </>
            )}
          </View>
        </View>

        {/* Action Buttons: Abandon & Pause/Resume (2 buttons grouped as a whole, strictly centered) */}
        <View style={styles.runActionsWrap}>
          <View style={styles.runActionsGroup}>
            {!flowMode && (
              <Pressable style={styles.subActionBtn} onPress={handleAbandon}>
                <Text style={styles.subActionText}>{t('pomodoro.abandon', '放弃')}</Text>
              </Pressable>
            )}

            {paused ? (
              <Pressable style={[styles.mainActionBtn, { backgroundColor: colors.primary }]} onPress={handleResume}>
                <Ionicons name="play" size={20} color="#fff" />
                <Text style={styles.mainActionText}>{t('pomodoro.resume', '继续专注')}</Text>
              </Pressable>
            ) : (
              <Pressable
                style={[
                  styles.mainActionBtn,
                  { backgroundColor: flowMode ? colors.success : colors.primary },
                  flowMode && { width: 180, marginLeft: 0 },
                ]}
                onPress={flowMode ? handleFinish : handlePause}
              >
                <Ionicons name={flowMode ? "checkmark" : "pause"} size={20} color="#fff" />
                <Text style={styles.mainActionText}>
                  {flowMode ? t('pomodoro.endSave', '结束并保存') : t('pomodoro.pause', '暂停')}
                </Text>
              </Pressable>
            )}
          </View>
        </View>

        {/* Ambient sound bar in running */}
        <TouchableOpacity
          style={styles.runSoundRow}
          onPress={() => setShowAmbientPicker(true)}
          activeOpacity={0.7}
        >
          <Ionicons name={currentAmbient?.icon || 'volume-mute-outline'} size={18} color={colors.ink2} />
          <Text style={styles.runSoundText}>{currentAmbientLabel}</Text>
          <Text style={styles.runSoundStatus}>
            {ambient !== 'none' ? t('pomodoro.playingSound', '正在播放') : t('pomodoro.ambient_none', '无声')}
          </Text>
          <Ionicons name="chevron-forward" size={14} color={colors.ink3} />
        </TouchableOpacity>

        {/* Notice text */}
        <Text style={styles.runNoticeText}>
          {t('pomodoro.runningNotice', '专注中隐藏底部导航。点「放弃」会再确认一次，避免误触。')}
        </Text>

        {renderPostFocusModal()}

        {/* Ambient Picker Modal (Running) */}
        {renderAmbientModal()}

        {/* Abandon Confirmation Themed Modal */}
        {renderAbandonModal()}
      </View>
    );
  }



  // ==================== IDLE STATE ====================
  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
      {/* 1. 今日专注卡片：点开看记录 */}
      <TouchableOpacity
        style={styles.todayFocusCard}
        onPress={() => setShowHistoryModal(true)}
        activeOpacity={0.7}
      >
        <View style={styles.todayFocusHeader}>
          <Text style={styles.todayFocusTitle}>{t('pomodoro.todayFocus', '今日专注')}</Text>
          <Text style={styles.todayFocusStatText}>
            {totalFocusCountCalculated} 次 · {formatDuration(totalFocusSecCalculated, lang)}
          </Text>
          <View style={styles.todayFocusRight}>
            <Text style={styles.todayFocusViewLogs}>{t('pomodoro.viewRecords', '查看记录')}</Text>
            <Ionicons name="chevron-forward" size={13} color="#5C4B43" />
          </View>
        </View>

        {/* 用途分布条 */}
        <View style={styles.todayFocusBar}>
          {distributionBar.length > 0 ? (
            distributionBar.map((b, idx) => (
              <View
                key={'bar-' + idx}
                style={{
                  width: `${b.pct}%`,
                  backgroundColor: b.color,
                  height: '100%',
                }}
              />
            ))
          ) : (
            <View style={{ flex: 1, backgroundColor: '#EFE2D7' }} />
          )}
        </View>
      </TouchableOpacity>

      {/* 2. 这次专注做什么？ (3x2 Grid) */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{t('pomodoro.whatToDo', '这次专注做什么？')}</Text>
          <TouchableOpacity onPress={() => setShowHelp(true)}>
            <Text style={styles.helpLink}>{t('pomodoro.categoryHelp', '分类说明')}</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.catGrid}>
          {CATEGORY_ITEMS.map(item => {
            const isSelected = category === item.key;
            return (
              <TouchableOpacity
                key={item.key}
                style={[
                  styles.catBtn,
                  isSelected && { borderColor: '#D63B3B', borderWidth: 1.5, backgroundColor: '#FDE9E6' },
                ]}
                onPress={() => setCategory(item.key)}
                activeOpacity={0.7}
              >
                <View style={[styles.catBtnDot, { backgroundColor: item.color }]} />
                <Text style={[styles.catLabel, isSelected && { fontWeight: '800', color: '#B3302C' }]}>
                  {t(item.key).replace(/^[^\w\u4e00-\u9fa5]+\s*/, '')}
                </Text>
                {isSelected && (
                  <Ionicons name="checkmark" size={14} color="#D63B3B" style={{ marginLeft: 2 }} />
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* 3. 具体内容输入框 */}
      <View style={styles.section}>
        <View style={styles.taskInputWrap}>
          <Ionicons name="pencil-outline" size={16} color="#6F5F57" />
          <TextInput
            style={styles.taskInput}
            value={goalName}
            onChangeText={setGoalName}
            placeholder={t('pomodoro.taskPlaceholder', '具体做什么？（选填，如：英语听力）')}
            placeholderTextColor="#9A8A80"
            maxLength={30}
            returnKeyType="done"
          />
        </View>
      </View>

      {/* 4. 居中计时大环 (200x200) - 手势严格限制在圆圈内，外部不拦截滚动 */}
      <View style={styles.dialWrap}>
        <View style={styles.dialRing} {...dialResponder.panHandlers}>
          <TouchableOpacity
            style={styles.dialRingInnerTouch}
            activeOpacity={0.88}
            onPress={() => {
              setCustomMinutesInput(String(durationMin));
              setShowCustomModal(true);
            }}
          >
            <Svg width={200} height={200}>
              <Circle cx={100} cy={100} r={90} stroke="#F1E3D8" strokeWidth={12} fill="none" />
              <Circle cx={100} cy={100} r={90} stroke="#D63B3B" strokeWidth={12} fill="none" strokeLinecap="round" />
            </Svg>
            <View style={styles.dialTimeCenter}>
              <Text style={styles.dialTimeText}>{formatTime(timeLeft)}</Text>
              <Text style={styles.dialSubText}>
                {category ? `${t(category).replace(/^[^\w\u4e00-\u9fa5]+\s*/, '')} · ` : ''}
                {t('pomodoro.focusDurLabel', '专注时长')}
              </Text>
            </View>
          </TouchableOpacity>
        </View>
      </View>

      {/* 5. 时长选择器 (15, 25, 45, 60, 自定义) */}
      <View style={styles.durGrid}>
        {DURATION_PRESETS.map(mins => {
          const isActive = durationMin === mins;
          return (
            <TouchableOpacity
              key={'dur-' + mins}
              style={[styles.durPill, isActive && styles.durPillActive]}
              onPress={() => handleDurationPreset(mins)}
              activeOpacity={0.7}
            >
              <Text style={[styles.durPillText, isActive && styles.durPillTextActive]}>{mins}</Text>
            </TouchableOpacity>
          );
        })}
        <TouchableOpacity
          style={[styles.durPillDashed, !DURATION_PRESETS.includes(durationMin) && styles.durPillActive]}
          onPress={() => {
            setCustomMinutesInput(String(durationMin));
            setShowCustomModal(true);
          }}
          activeOpacity={0.7}
        >
          <Text style={[styles.durPillText, !DURATION_PRESETS.includes(durationMin) && styles.durPillTextActive]}>
            {!DURATION_PRESETS.includes(durationMin) ? `${durationMin}分` : t('pomodoro.custom', '自定义')}
          </Text>
        </TouchableOpacity>
      </View>

      {/* 6. 白噪声条 */}
      <TouchableOpacity
        style={styles.whiteNoiseBar}
        onPress={() => setShowAmbientPicker(true)}
        activeOpacity={0.7}
      >
        <Ionicons name="cellular-outline" size={18} color="#4A3F39" />
        <Text style={styles.whiteNoiseTitle}>{t('pomodoro.bgSound', '白噪声')}</Text>
        <Text style={styles.whiteNoiseCurrent}>
          {ambient === 'none' ? t('pomodoro.soundNone', '无声') : currentAmbientLabel}
        </Text>
        <Ionicons name="chevron-forward" size={14} color="#9A8A80" />
      </TouchableOpacity>

      {/* 7. 底部开始按钮 */}
      <View style={styles.startBtnWrap}>
        <TouchableOpacity
          style={[styles.startBtn, !category && { opacity: 0.85 }]}
          onPress={handleStart}
          activeOpacity={0.8}
        >
          <Ionicons name="play" size={20} color="#fff" />
          <Text style={styles.startBtnText}>
            {t('pomodoro.startFocusWithMin', { min: durationMin })}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Post-Focus Modal（handleFinish 后 running 已置 false，这里才是实际承载保存弹窗的分支） */}
      {renderPostFocusModal()}

      {/* FocusHistoryModal 弹窗 */}
      <FocusHistoryModal
        visible={showHistoryModal}
        onClose={() => setShowHistoryModal(false)}
        records={todayFocusRecordsList}
        onUpdateRecord={onUpdateRecord}
        onDeleteRecord={onDeleteRecord}
      />

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
                placeholder="25"
                placeholderTextColor="#9A8A80"
                keyboardType="number-pad"
                maxLength={3}
                autoFocus
              />
              <Text style={{ fontSize: 16, fontWeight: '700', color: '#2B1F1A' }}>{t('pomodoro.minUnit', '分钟')}</Text>
            </View>
            <View style={styles.customDurBtnRow}>
              <TouchableOpacity
                style={styles.customDurBtnCancel}
                onPress={() => setShowCustomModal(false)}
              >
                <Text style={styles.customDurBtnCancelText}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.customDurBtnConfirm}
                onPress={handleCustomDurationConfirm}
              >
                <Text style={styles.customDurBtnConfirmText}>{t('common.done')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Ambient Picker Modal */}
      {renderAmbientModal()}

      {/* Help Modal */}
      <Modal visible={showHelp} transparent animationType="fade">
        <View style={styles.modalBg}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{t('pomodoro.helpTitle', '专注分类说明')}</Text>
            <ScrollView style={{ maxHeight: 400 }}>
              {[
                { title: t('pomodoro.helpWork', '💼 工作'), desc: t('pomodoro.helpWorkDesc', '涵盖：写代码、办公、会议、邮件、客户沟通、接单\n一句话判断：为职场或收入做的事') },
                { title: t('pomodoro.helpStudy', '📚 学习'), desc: t('pomodoro.helpStudyDesc', '涵盖：备考、课业、阅读、网课、学新技能\n一句话判断：为了"输入知识"的事') },
                { title: t('pomodoro.helpCreate', '🎨 创作'), desc: t('pomodoro.helpCreateDesc', '涵盖：写作、设计、剪辑、个人项目、爱好\n一句话判断：为了"产出自己的东西"的事') },
                { title: t('pomodoro.helpBodyMind', '🧘 身心'), desc: t('pomodoro.helpBodyMindDesc', '涵盖：冥想、锻炼、休整\n一句话判断：照顾自己身体和状态的事') },
                { title: t('pomodoro.helpLife', '🧹 生活'), desc: t('pomodoro.helpLifeDesc', '涵盖：家务整理、杂事、行政琐事\n一句话判断：维护日常运转的事') },
                { title: t('pomodoro.helpPlan', '💡 规划复盘'), desc: t('pomodoro.helpPlanDesc', '涵盖：复盘、计划、拆目标、整理思路\n一句话判断：管理自己和时间的事') },
              ].map((c, i) => (
                <View key={i} style={styles.modalRow}>
                  <Text style={styles.modalRowTitle}>{c.title}</Text>
                  <Text style={styles.modalRowDesc}>{c.desc}</Text>
                </View>
              ))}
            </ScrollView>
            <TouchableOpacity style={styles.modalClose} onPress={() => setShowHelp(false)}>
              <Text style={styles.modalCloseText}>{t('pomodoro.helpBtn', '知道了')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const makeStyles = (colors) => StyleSheet.create({
  // ====== IDLE STATE ======
  container: {
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
    paddingBottom: 40,
  },
  todayFocusCard: {
    width: '100%',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#EFE2D7',
    borderRadius: 16,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: 14,
  },
  todayFocusHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 28,
  },
  todayFocusTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#2B1F1A',
  },
  todayFocusStatText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#B3302C',
  },
  todayFocusRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  todayFocusViewLogs: {
    fontSize: 12,
    fontWeight: '700',
    color: '#5C4B43',
  },
  todayFocusBar: {
    flexDirection: 'row',
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
    gap: 2,
    marginTop: 8,
    backgroundColor: '#F3E4DB',
  },
  catBtnDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  dialWrap: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 12,
  },
  dialRing: {
    position: 'relative',
    width: 200,
    height: 200,
  },
  dialRingInnerTouch: {
    width: 200,
    height: 200,
    position: 'relative',
  },
  dialTimeCenter: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dialTimeText: {
    fontSize: 44,
    fontWeight: '800',
    letterSpacing: 1,
    color: '#2B1F1A',
    lineHeight: 48,
  },
  dialSubText: {
    fontSize: 12,
    color: '#6F5F57',
    marginTop: 4,
    fontWeight: '600',
  },
  durGrid: {
    width: '100%',
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  durPill: {
    flex: 1,
    height: 44,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#EADDD2',
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  durPillActive: {
    borderColor: '#D63B3B',
    backgroundColor: '#FDE9E6',
  },
  durPillDashed: {
    flex: 1.2,
    height: 44,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#CDBCAF',
    borderStyle: 'dashed',
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  durPillText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#4A3F39',
  },
  durPillTextActive: {
    fontWeight: '800',
    color: '#B3302C',
  },
  whiteNoiseBar: {
    width: '100%',
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#EFE2D7',
    borderRadius: 14,
    backgroundColor: '#fff',
    marginBottom: 14,
  },
  whiteNoiseTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#4A3F39',
  },
  whiteNoiseCurrent: {
    flex: 1,
    textAlign: 'right',
    fontSize: 13,
    color: '#6F5F57',
    marginRight: 4,
  },
  startBtnWrap: {
    width: '100%',
    marginBottom: 10,
  },
  customDurDialog: {
    width: '85%',
    backgroundColor: '#fff',
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
    borderColor: '#D63B3B',
    borderRadius: 14,
    fontSize: 22,
    fontWeight: '800',
    textAlign: 'center',
    color: '#2B1F1A',
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
    backgroundColor: '#F1E6DC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  customDurBtnCancelText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#5C4B43',
  },
  customDurBtnConfirm: {
    flex: 1,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#D63B3B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  customDurBtnConfirmText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
  },
  todayStats: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-end',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: colors.primarySoft || (colors.primary + '15'),
    borderRadius: 16,
    marginBottom: 8,
  },
  todayStatsText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.primaryStrong,
  },
  section: {
    width: '100%',
    marginBottom: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.ink,
    marginBottom: 8,
  },
  helpLink: {
    fontSize: 13,
    color: colors.primaryStrong,
    fontWeight: '600',
    marginBottom: 8,
  },

  // Category Grid (3x2)
  catGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  catBtn: {
    width: '31.5%',
    height: 44,
    backgroundColor: colors.surface,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.line,
    gap: 6,
    paddingHorizontal: 4,
  },
  catDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  catLabel: {
    fontSize: 14,
    color: colors.ink,
    fontWeight: '500',
  },
  catCheckIcon: {
    marginLeft: 2,
  },

  // Task Input
  taskInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 14,
    paddingHorizontal: 14,
    height: 48,
    borderWidth: 1,
    borderColor: colors.line,
    gap: 10,
  },
  taskInput: {
    flex: 1,
    fontSize: 14,
    color: colors.ink,
    paddingVertical: 0,
  },

  // Duration Row
  durRow: {
    flexDirection: 'row',
    gap: 6,
  },
  durBtn: {
    flex: 1,
    height: 44,
    borderRadius: 999,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.line,
  },
  durBtnActive: {
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.primary,
  },
  durText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.ink2,
  },
  durTextActive: {
    color: colors.ink,
    fontWeight: '700',
  },

  // Ring (idle)
  ringContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    marginVertical: 8,
  },
  timeWrap: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  timeText: {
    fontSize: 52,
    fontWeight: '700',
    color: colors.ink,
    fontVariant: ['tabular-nums'],
    letterSpacing: -1,
    lineHeight: 56,
  },
  timeSubCategory: {
    fontSize: 13,
    color: colors.ink3,
    marginTop: 4,
    fontWeight: '500',
  },
  hintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    gap: 4,
  },
  hintText: {
    fontSize: 11,
    color: colors.ink3,
    fontWeight: '500',
  },

  // Sound Row
  soundRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
    marginBottom: 20,
  },
  soundLabel: {
    flex: 1,
    fontSize: 14,
    color: colors.ink,
    fontWeight: '500',
  },

  // Start Button
  startBtn: {
    backgroundColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 56,
    borderRadius: 999,
    gap: 8,
    width: '100%',
    ...shadow.primary,
  },
  startBtnText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
  },

  // ====== RUNNING STATE ======
  runningContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 20,
  },
  runTopWrap: {
    alignItems: 'center',
    marginBottom: 36,
    gap: 10,
  },
  runCountText: {
    fontSize: 13,
    color: colors.ink3,
    fontWeight: '500',
  },
  runCatPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 999,
    borderWidth: 1,
  },
  colorDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  runCatText: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.ink,
  },
  runGoalText: {
    fontSize: 15,
    color: colors.ink2,
    fontWeight: '500',
  },
  runTimeText: {
    fontSize: 64,
    fontWeight: '700',
    color: colors.ink,
    fontVariant: ['tabular-nums'],
    letterSpacing: -1,
    lineHeight: 70,
  },
  runSubText: {
    fontSize: 13,
    color: colors.ink3,
    marginTop: 6,
    textAlign: 'center',
  },
  runActionsWrap: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 44,
  },
  runActionsGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  subActionBtn: {
    width: 88,
    height: 56,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.line2 || colors.line,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 24,
    ...shadow.sm,
  },
  subActionText: {
    fontSize: 15,
    color: colors.ink2,
    fontWeight: '500',
  },
  mainActionBtn: {
    width: 160,
    height: 64,
    borderRadius: 999,
    backgroundColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    ...shadow.primary,
  },
  mainActionText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  runSoundRow: {
    width: '100%',
    height: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    gap: 10,
    marginTop: 24,
  },
  runSoundText: {
    fontSize: 14,
    color: colors.ink,
    fontWeight: '500',
  },
  runSoundStatus: {
    flex: 1,
    textAlign: 'right',
    fontSize: 13,
    color: colors.ink3,
  },
  runNoticeText: {
    fontSize: 12,
    color: colors.ink3,
    textAlign: 'center',
    marginTop: 16,
    lineHeight: 18,
    paddingHorizontal: 16,
  },

  // ====== MODALS ======
  modalBg: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  abandonModalCard: {
    backgroundColor: colors.surface,
    borderRadius: 22,
    padding: 24,
    width: '100%',
    maxWidth: 320,
    alignItems: 'center',
    ...shadow.card,
  },
  abandonIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  abandonModalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.ink,
    marginBottom: 8,
    textAlign: 'center',
  },
  abandonModalMsg: {
    fontSize: 14,
    color: colors.ink2,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
  },
  abandonBtnRow: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  abandonBtnCancel: {
    flex: 1,
    height: 46,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  abandonBtnCancelText: {
    fontSize: 15,
    fontWeight: '600',
  },
  abandonBtnConfirm: {
    flex: 1,
    height: 46,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.sm,
  },
  abandonBtnConfirmText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  modalContent: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    ...shadow.md,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.ink,
    marginBottom: 16,
    textAlign: 'center',
  },
  modalRow: {
    marginBottom: 16,
    backgroundColor: colors.chip,
    padding: 12,
    borderRadius: 12,
  },
  modalRowTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.ink,
    marginBottom: 4,
  },
  modalRowDesc: {
    fontSize: 14,
    color: colors.ink2,
    marginBottom: 2,
    lineHeight: 20,
  },
  modalClose: {
    marginTop: 10,
    backgroundColor: colors.primary,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  modalCloseText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },

  // Ambient Picker Grid
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
    backgroundColor: colors.chip,
    borderWidth: 1,
    borderColor: colors.line,
  },
  ambientOptionActive: {
    backgroundColor: colors.primarySoft || (colors.primary + '15'),
    borderColor: colors.primary,
  },
  ambientOptionText: {
    fontSize: 14,
    color: colors.ink2,
    fontWeight: '500',
  },

  // Post-Focus Modal
  postDuration: {
    fontSize: 36,
    fontWeight: '800',
    color: colors.primaryStrong,
    textAlign: 'center',
    marginBottom: 16,
  },
  postLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.ink,
    marginBottom: 8,
    marginTop: 8,
  },
  postCatGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  postCatBtn: {
    width: '31%',
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 12,
    backgroundColor: colors.chip,
    borderWidth: 1,
    borderColor: colors.line,
    position: 'relative',
  },
  postCatIcon: {
    fontSize: 18,
    marginBottom: 2,
  },
  postCatText: {
    fontSize: 11,
    color: colors.ink2,
  },
  postNoteInput: {
    backgroundColor: colors.chip,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    fontSize: 14,
    color: colors.ink,
    borderWidth: 1,
    borderColor: colors.line,
    minHeight: 60,
    textAlignVertical: 'top',
    marginBottom: 8,
  },
});
