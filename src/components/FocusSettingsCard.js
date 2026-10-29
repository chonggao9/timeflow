import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Animated,
  Keyboard,
  useWindowDimensions,
  Switch,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Defs, LinearGradient, Stop, Rect } from 'react-native-svg';
import { Audio } from 'expo-av';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const FOCUS_AMBIENT_OPTIONS = [
  { key: 'none', icon: 'volume-mute-outline', label: 'pomodoro.ambient_none', defaultLabel: '无声' },
  { key: 'cafe', icon: 'cafe-outline', label: 'pomodoro.ambient_cafe', defaultLabel: '咖啡厅' },
  { key: 'rain', icon: 'rainy-outline', label: 'pomodoro.ambient_rain', defaultLabel: '雨声' },
  { key: 'ocean', icon: 'water-outline', label: 'pomodoro.ambient_ocean', defaultLabel: '海浪' },
  { key: 'forest', icon: 'leaf-outline', label: 'pomodoro.ambient_forest', defaultLabel: '森林' },
  { key: 'fire', icon: 'bonfire-outline', label: 'pomodoro.ambient_fire', defaultLabel: '篝火' },
  { key: 'train', icon: 'train-outline', label: 'pomodoro.ambient_train', defaultLabel: '列车' },
  { key: 'stream', icon: 'water-outline', label: 'pomodoro.ambient_stream', defaultLabel: '溪流' },
];

export const STORAGE_KEY_LAST_AMBIENT = 'timeflow_last_focus_ambient';
export const STORAGE_KEY_HOLD_START = 'timeflow_focus_hold_start';
export const STORAGE_KEY_FOCUS_FEEDBACK = 'timeflow_focus_feedback_type';

export const ITEM_WIDTH = 72;
export const ITEM_GAP = 8;
export const SNAP_STEP = ITEM_WIDTH + ITEM_GAP;
export const PADDING_LEFT = 4;
export const PADDING_RIGHT = 16;

const hapticImpact = (style) => {
  try {
    Haptics.impactAsync(style).catch(() => {});
  } catch (e) {}
};

/**
 * 智能居中聚焦算法：
 * 计算将第 index 项滚动到最佳视野位置的目标 offset.x
 * - 当选中前两项（无声、咖啡厅）时，由于 targetX <= 0，自动钳位为 0，自然靠左紧凑展示，左侧 0 死区！
 * - 当选中靠后的项（雨声、海浪、森林等）时，平滑居中聚焦于视口中央。
 */
export const getTargetScrollX = (index, cWidth) => {
  const maxScroll = Math.max(
    0,
    PADDING_LEFT + FOCUS_AMBIENT_OPTIONS.length * SNAP_STEP - ITEM_GAP + PADDING_RIGHT - cWidth
  );
  const itemCenter = PADDING_LEFT + index * SNAP_STEP + ITEM_WIDTH / 2;
  const targetX = itemCenter - cWidth / 2;
  return Math.max(0, Math.min(maxScroll, Math.round(targetX)));
};

/**
 * 滑动停止时获取最靠近视口焦点的项索引
 */
export const getNearestOptionIndex = (offsetX, cWidth) => {
  const maxScroll = Math.max(
    0,
    PADDING_LEFT + FOCUS_AMBIENT_OPTIONS.length * SNAP_STEP - ITEM_GAP + PADDING_RIGHT - cWidth
  );
  if (offsetX <= 20) return 0;
  if (offsetX >= maxScroll - 20) return FOCUS_AMBIENT_OPTIONS.length - 1;

  const viewportCenter = offsetX + cWidth / 2;
  let nearestIdx = 0;
  let minDiff = Infinity;
  for (let i = 0; i < FOCUS_AMBIENT_OPTIONS.length; i++) {
    const itemCenter = PADDING_LEFT + i * SNAP_STEP + ITEM_WIDTH / 2;
    const diff = Math.abs(itemCenter - viewportCenter);
    if (diff < minDiff) {
      minDiff = diff;
      nearestIdx = i;
    }
  }
  return nearestIdx;
};

/**
 * FocusSettingsCard: 室内专注首页一体化设置卡
 * 第一行：常驻单行备注输入框（占位符、聚焦深红、清空按钮、键盘防遮挡）
 * 第二行：横向自然流式白噪音选择器（左侧零死区自然对齐、智能居中聚焦、微震动、150ms停稳试听、持久化）
 */
export default function FocusSettingsCard({
  goalName,
  onChangeGoalName,
  ambient,
  onSelectAmbient,
  soundFiles,
  isDark = false,
  colors,
  t,
}) {
  const { width: winWidth } = useWindowDimensions();
  const [isNoteFocused, setIsNoteFocused] = useState(false);

  const [containerWidth, setContainerWidth] = useState(Math.max(260, winWidth - 52));
  const [holdToStart, setHoldToStart] = useState(false);
  const [feedbackType, setFeedbackType] = useState('sound'); // 'sound' | 'vibrate' | 'silent'

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY_HOLD_START).then((v) => {
      setHoldToStart(v === '1');
    }).catch(() => {});

    AsyncStorage.getItem(STORAGE_KEY_FOCUS_FEEDBACK).then((v) => {
      if (v === 'sound' || v === 'vibrate' || v === 'silent') {
        setFeedbackType(v);
      }
    }).catch(() => {});
  }, []);

  const handleToggleHoldToStart = useCallback(async (value) => {
    setHoldToStart(value);
    hapticImpact(Haptics.ImpactFeedbackStyle.Light);
    try {
      await AsyncStorage.setItem(STORAGE_KEY_HOLD_START, value ? '1' : '0');
    } catch (e) {}
  }, []);

  const handleSelectFeedbackType = useCallback(async (type) => {
    setFeedbackType(type);
    if (type === 'vibrate' || type === 'sound') {
      try {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      } catch (e) {}
    }
    try {
      await AsyncStorage.setItem(STORAGE_KEY_FOCUS_FEEDBACK, type);
    } catch (e) {}
  }, []);

  const scrollRef = useRef(null);
  const scrollX = useRef(new Animated.Value(0)).current;
  const lastHapticIndexRef = useRef(0);
  const isScrollingRef = useRef(false);

  // 试听声音相关 Ref
  const previewTimerRef = useRef(null);
  const previewSoundRef = useRef(null);
  const previewReqIdRef = useRef(0);

  const currentOption = FOCUS_AMBIENT_OPTIONS.find((a) => a.key === ambient);
  const currentAmbientLabel = currentOption
    ? t(currentOption.label, currentOption.defaultLabel)
    : t('pomodoro.ambient_none', '无声');

  // 停止并销毁试听声音
  const stopPreviewSound = useCallback(async () => {
    previewReqIdRef.current++;
    if (previewTimerRef.current) {
      clearTimeout(previewTimerRef.current);
      previewTimerRef.current = null;
    }
    if (previewSoundRef.current) {
      const cur = previewSoundRef.current;
      previewSoundRef.current = null;
      try {
        await cur.stopAsync();
        await cur.unloadAsync();
      } catch (e) {}
    }
  }, []);

  // 滑动停稳约 150ms 后自动试听该声音 2 秒，音量约 30%，带淡入淡出；若系统静音则静默捕获
  const triggerAmbientPreview = useCallback(
    (key) => {
      if (previewTimerRef.current) {
        clearTimeout(previewTimerRef.current);
        previewTimerRef.current = null;
      }
      stopPreviewSound();

      if (key === 'none' || !soundFiles || !soundFiles[key]) return;

      const reqId = ++previewReqIdRef.current;
      previewTimerRef.current = setTimeout(async () => {
        try {
          const { sound } = await Audio.Sound.createAsync(
            soundFiles[key],
            {
              shouldPlay: true,
              isLooping: false,
              volume: 0, // 初始为 0 便于淡入
            }
          );
          if (reqId !== previewReqIdRef.current) {
            await sound.stopAsync().catch(() => {});
            await sound.unloadAsync().catch(() => {});
            return;
          }
          previewSoundRef.current = sound;

          // 250ms 内平滑淡入至 0.3
          let currentVol = 0;
          const targetVol = 0.3;
          const fadeStep = 0.06;
          const fadeInTimer = setInterval(async () => {
            if (reqId !== previewReqIdRef.current || !previewSoundRef.current) {
              clearInterval(fadeInTimer);
              return;
            }
            currentVol = Math.min(targetVol, currentVol + fadeStep);
            try {
              await sound.setVolumeAsync(currentVol);
            } catch (e) {}
            if (currentVol >= targetVol) clearInterval(fadeInTimer);
          }, 50);

          // 播放约 1.5 秒后淡出
          setTimeout(async () => {
            if (reqId !== previewReqIdRef.current || !previewSoundRef.current) return;
            const fadeOutTimer = setInterval(async () => {
              if (reqId !== previewReqIdRef.current || !previewSoundRef.current) {
                clearInterval(fadeOutTimer);
                return;
              }
              currentVol = Math.max(0, currentVol - fadeStep);
              try {
                await sound.setVolumeAsync(currentVol);
              } catch (e) {}
              if (currentVol <= 0) {
                clearInterval(fadeOutTimer);
                stopPreviewSound();
              }
            }, 50);
          }, 1500);
        } catch (err) {
          // 静默处理硬件静音、媒体音量为0等场景
        }
      }, 150);
    },
    [soundFiles, stopPreviewSound]
  );

  // 点击小卡片智能滚动到聚焦位置并选中
  const handleItemPress = useCallback(
    (key, index) => {
      onSelectAmbient(key);
      AsyncStorage.setItem(STORAGE_KEY_LAST_AMBIENT, key).catch(() => {});
      hapticImpact(Haptics.ImpactFeedbackStyle.Light);
      const targetX = getTargetScrollX(index, containerWidth);
      scrollRef.current?.scrollTo?.({
        x: targetX,
        animated: true,
      });
      triggerAmbientPreview(key);
    },
    [onSelectAmbient, triggerAmbientPreview, containerWidth]
  );

  // 恢复上次选择并在布局后智能对齐
  useEffect(() => {
    (async () => {
      try {
        const saved = await AsyncStorage.getItem(STORAGE_KEY_LAST_AMBIENT);
        if (saved && FOCUS_AMBIENT_OPTIONS.some((a) => a.key === saved)) {
          onSelectAmbient(saved);
          const idx = FOCUS_AMBIENT_OPTIONS.findIndex((a) => a.key === saved);
          if (idx >= 0) {
            lastHapticIndexRef.current = idx;
            setTimeout(() => {
              const targetX = getTargetScrollX(idx, containerWidth);
              scrollRef.current?.scrollTo?.({
                x: targetX,
                animated: false,
              });
            }, 300);
          }
        }
      } catch (e) {}
    })();
  }, [onSelectAmbient, containerWidth]);

  // 组件卸载时释放试听资源
  useEffect(() => {
    return () => {
      stopPreviewSound();
    };
  }, [stopPreviewSound]);

  return (
    <View style={styles.cardWrap}>
      <View
        style={[
          styles.cardContainer,
          {
            backgroundColor: isDark ? '#261F1A' : '#FFFFFF',
            borderColor: isDark ? '#3D332A' : '#EFE5D8',
          },
        ]}
      >
        {/* 第一行：备注输入框 */}
        <View
          style={[
            styles.noteRow,
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
              styles.noteInput,
              { color: colors?.ink || (isDark ? '#F5EDE4' : '#2B211C') },
            ]}
            value={goalName}
            onChangeText={onChangeGoalName}
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
              onPress={() => onChangeGoalName('')}
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

        {/* 第二行：背景声音横向自然流式选择器 */}
        <View
          style={styles.carouselWrapper}
          onLayout={(e) => setContainerWidth(e.nativeEvent.layout.width)}
          accessible={true}
          accessibilityLabel={`背景声音，当前为${currentAmbientLabel}，可左右滑动调整`}
          accessibilityRole="adjustable"
        >
          <Animated.ScrollView
            ref={scrollRef}
            horizontal
            showsHorizontalScrollIndicator={false}
            decelerationRate="fast"
            nestedScrollEnabled={true}
            contentContainerStyle={{
              paddingLeft: PADDING_LEFT,
              paddingRight: PADDING_RIGHT,
              alignItems: 'center',
            }}
            onScroll={Animated.event(
              [{ nativeEvent: { contentOffset: { x: scrollX } } }],
              {
                useNativeDriver: false,
                listener: (e) => {
                  const offsetX = e.nativeEvent.contentOffset.x;
                  const nearestIndex = getNearestOptionIndex(offsetX, containerWidth);
                  if (nearestIndex !== lastHapticIndexRef.current) {
                    lastHapticIndexRef.current = nearestIndex;
                    hapticImpact(Haptics.ImpactFeedbackStyle.Light);
                  }
                },
              }
            )}
            onScrollBeginDrag={() => {
              isScrollingRef.current = true;
              stopPreviewSound();
            }}
            onMomentumScrollEnd={(e) => {
              isScrollingRef.current = false;
              const offsetX = e.nativeEvent.contentOffset.x;
              const index = getNearestOptionIndex(offsetX, containerWidth);
              const targetItem = FOCUS_AMBIENT_OPTIONS[index];
              if (targetItem) {
                onSelectAmbient(targetItem.key);
                AsyncStorage.setItem(STORAGE_KEY_LAST_AMBIENT, targetItem.key).catch(() => {});
                triggerAmbientPreview(targetItem.key);
                // 智能磁吸对齐焦点
                const snapX = getTargetScrollX(index, containerWidth);
                if (Math.abs(snapX - offsetX) > 4) {
                  scrollRef.current?.scrollTo?.({ x: snapX, animated: true });
                }
              }
            }}
            onScrollEndDrag={(e) => {
              const velocity = e.nativeEvent.velocity?.x || 0;
              if (Math.abs(velocity) < 0.1) {
                isScrollingRef.current = false;
                const offsetX = e.nativeEvent.contentOffset.x;
                const index = getNearestOptionIndex(offsetX, containerWidth);
                const targetItem = FOCUS_AMBIENT_OPTIONS[index];
                if (targetItem) {
                  onSelectAmbient(targetItem.key);
                  AsyncStorage.setItem(STORAGE_KEY_LAST_AMBIENT, targetItem.key).catch(() => {});
                  triggerAmbientPreview(targetItem.key);
                  const snapX = getTargetScrollX(index, containerWidth);
                  if (Math.abs(snapX - offsetX) > 4) {
                    scrollRef.current?.scrollTo?.({ x: snapX, animated: true });
                  }
                }
              }
            }}
            scrollEventThrottle={16}
          >
            {FOCUS_AMBIENT_OPTIONS.map((item, idx) => {
              const isSelected = ambient === item.key;
              return (
                <TouchableOpacity
                  key={item.key}
                  onPress={() => handleItemPress(item.key, idx)}
                  activeOpacity={0.75}
                  style={{
                    marginRight: idx === FOCUS_AMBIENT_OPTIONS.length - 1 ? 0 : ITEM_GAP,
                  }}
                >
                  <View
                    style={[
                      styles.ambientCard,
                      {
                        width: ITEM_WIDTH,
                        backgroundColor: isSelected
                          ? '#C63D31'
                          : (isDark ? '#1F1915' : '#FAF6F0'),
                        borderColor: isSelected
                          ? '#C63D31'
                          : (isDark ? '#3D332A' : '#EADFD0'),
                      },
                    ]}
                  >
                    <Ionicons
                      name={item.icon}
                      size={16}
                      color={isSelected ? '#FFFFFF' : (isDark ? '#8C7D73' : '#6B5B4F')}
                    />
                    <Text
                      style={[
                        styles.ambientText,
                        {
                          color: isSelected ? '#FFFFFF' : (isDark ? '#8C7D73' : '#6B5B4F'),
                          fontWeight: isSelected ? '700' : '500',
                        },
                      ]}
                      numberOfLines={1}
                    >
                      {t(item.label, item.defaultLabel)}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </Animated.ScrollView>

          {/* 左侧动态羽化遮罩（仅当列表向右滚动时淡入，scrollX=0时完全透明隐藏） */}
          <Animated.View
            style={[
              styles.fadeLeft,
              {
                opacity: scrollX.interpolate({
                  inputRange: [0, 20],
                  outputRange: [0, 1],
                  extrapolate: 'clamp',
                }),
              },
            ]}
            pointerEvents="none"
          >
            <Svg width={20} height={50}>
              <Defs>
                <LinearGradient id="cardFadeL" x1="0" y1="0" x2="1" y2="0">
                  <Stop offset="0" stopColor={isDark ? '#261F1A' : '#FFFFFF'} stopOpacity="1" />
                  <Stop offset="1" stopColor={isDark ? '#261F1A' : '#FFFFFF'} stopOpacity="0" />
                </LinearGradient>
              </Defs>
              <Rect width={20} height={50} fill="url(#cardFadeL)" />
            </Svg>
          </Animated.View>

          {/* 右侧渐隐遮罩（提示右侧还有森林、篝火、白噪音可横向滑动） */}
          <View style={styles.fadeRight} pointerEvents="none">
            <Svg width={24} height={50}>
              <Defs>
                <LinearGradient id="cardFadeR" x1="0" y1="0" x2="1" y2="0">
                  <Stop offset="0" stopColor={isDark ? '#261F1A' : '#FFFFFF'} stopOpacity="0" />
                  <Stop offset="1" stopColor={isDark ? '#261F1A' : '#FFFFFF'} stopOpacity="1" />
                </LinearGradient>
              </Defs>
              <Rect width={24} height={50} fill="url(#cardFadeR)" />
            </Svg>
          </View>
        </View>

        {/* 第三行：防误触按住 1 秒开始设置 */}
        <View
          style={[
            styles.holdSettingRow,
            { borderTopColor: isDark ? '#3D312A' : '#F0E8DE' },
          ]}
        >
          <View style={{ flex: 1, marginRight: 12 }}>
            <Text
              style={[
                styles.holdSettingTitle,
                { color: colors?.ink || (isDark ? '#F5EDE4' : '#2B211C') },
              ]}
            >
              {t('pomodoro.settingHoldToStart', '按住 1 秒开始')}
            </Text>
            <Text
              style={[
                styles.holdSettingDesc,
                { color: isDark ? '#8C7D73' : '#A6988D' },
              ]}
            >
              {t('pomodoro.settingHoldToStartDesc', '防误触，开启后需按住 1 秒才启动专注')}
            </Text>
          </View>
          <Switch
            value={holdToStart}
            onValueChange={handleToggleHoldToStart}
            trackColor={{ false: isDark ? '#3D312A' : '#E0D6CB', true: '#D93A2B' }}
            thumbColor={holdToStart ? '#FFFFFF' : (isDark ? '#8C7D73' : '#FAF6F0')}
            accessibilityLabel={t('pomodoro.settingHoldToStart', '按住 1 秒开始')}
          />
        </View>

        {/* 第四行：到期提醒反馈设置 */}
        <View
          style={[
            styles.holdSettingRow,
            { borderTopColor: isDark ? '#3D312A' : '#F0E8DE' },
          ]}
        >
          <View style={{ flex: 1, marginRight: 8 }}>
            <Text
              style={[
                styles.holdSettingTitle,
                { color: colors?.ink || (isDark ? '#F5EDE4' : '#2B211C') },
              ]}
            >
              {t('pomodoro.settingFeedbackTitle', '到期提醒反馈')}
            </Text>
            <Text
              style={[
                styles.holdSettingDesc,
                { color: isDark ? '#8C7D73' : '#A6988D' },
              ]}
            >
              {t('pomodoro.settingFeedbackDesc', '专注或休息结束时的提醒形式')}
            </Text>
          </View>

          <View style={[styles.feedbackSegWrap, { backgroundColor: isDark ? '#1F1915' : '#EFE8DE' }]}>
            {[
              { key: 'sound', label: t('pomodoro.feedbackSound', '铃声'), icon: 'volume-high-outline' },
              { key: 'vibrate', label: t('pomodoro.feedbackVibrate', '仅轻震'), icon: 'phone-portrait-outline' },
              { key: 'silent', label: t('pomodoro.feedbackSilent', '静音'), icon: 'notifications-off-outline' },
            ].map((opt) => {
              const isSelected = feedbackType === opt.key;
              return (
                <TouchableOpacity
                  key={opt.key}
                  style={[
                    styles.feedbackSegBtn,
                    isSelected && {
                      backgroundColor: '#C63D31',
                    },
                  ]}
                  onPress={() => handleSelectFeedbackType(opt.key)}
                  activeOpacity={0.7}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: isSelected }}
                  accessibilityLabel={opt.label}
                >
                  <Ionicons
                    name={opt.icon}
                    size={11}
                    color={isSelected ? '#FFFFFF' : (isDark ? '#8C7D73' : '#6B5B4F')}
                    style={{ marginRight: 2 }}
                  />
                  <Text
                    style={[
                      styles.feedbackSegText,
                      {
                        color: isSelected ? '#FFFFFF' : (isDark ? '#8C7D73' : '#6B5B4F'),
                        fontWeight: isSelected ? '700' : '500',
                      },
                    ]}
                  >
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  cardWrap: {
    width: '100%',
    paddingHorizontal: 16,
    marginBottom: 14,
  },
  cardContainer: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 10,
    gap: 8,
  },
  noteRow: {
    height: 38,
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
  },
  pencilIcon: {
    marginRight: 6,
  },
  noteInput: {
    flex: 1,
    fontSize: 13,
    paddingVertical: 0,
    fontWeight: '500',
  },
  carouselWrapper: {
    height: 52,
    position: 'relative',
    justifyContent: 'center',
  },
  ambientCard: {
    height: 46,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    paddingHorizontal: 4,
  },
  ambientText: {
    fontSize: 11,
  },
  fadeLeft: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 20,
    justifyContent: 'center',
  },
  fadeRight: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: 24,
    justifyContent: 'center',
  },
  holdSettingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 8,
    borderTopWidth: 1,
    marginTop: 2,
  },
  holdSettingTitle: {
    fontSize: 13,
    fontWeight: '600',
  },
  holdSettingDesc: {
    fontSize: 11,
    marginTop: 1,
  },
  feedbackSegWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 8,
    padding: 2,
  },
  feedbackSegBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  feedbackSegText: {
    fontSize: 11,
  },
});

