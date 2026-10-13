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
  { key: 'whitenoise', icon: 'disc-outline', label: 'pomodoro.ambient_whitenoise', defaultLabel: '白噪音' },
];

export const STORAGE_KEY_LAST_AMBIENT = 'timeflow_last_focus_ambient';

export const ITEM_WIDTH = 72;
export const ITEM_GAP = 8;
export const SNAP_STEP = ITEM_WIDTH + ITEM_GAP;

const hapticImpact = (style) => {
  try {
    Haptics.impactAsync(style).catch(() => {});
  } catch (e) {}
};

/**
 * FocusSettingsCard: 室内专注首页一体化设置卡
 * 第一行：常驻单行备注输入框（占位符、聚焦深红、清空按钮、键盘防遮挡）
 * 第二行：横向吸附式白噪音选择器（两端内边距、居中放大高亮、渐隐遮罩、微震动、150ms停稳试听、持久化）
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

  // 初始估算卡片宽度为屏幕宽度 - 外部内边距(32) - 卡片内边距(20)
  const [containerWidth, setContainerWidth] = useState(Math.max(260, winWidth - 52));

  const scrollRef = useRef(null);
  const scrollX = useRef(new Animated.Value(0)).current;
  const lastHapticIndexRef = useRef(0);
  const isScrollingRef = useRef(false);

  // 试听声音相关 Ref
  const previewTimerRef = useRef(null);
  const previewSoundRef = useRef(null);
  const previewReqIdRef = useRef(0);

  // 两侧内边距使首尾项恰好滑到视口正中
  const spacerWidth = Math.max(0, (containerWidth - ITEM_WIDTH) / 2);

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

  // 点击小卡片平滑滚动到中间并选中
  const handleItemPress = useCallback(
    (key, index) => {
      onSelectAmbient(key);
      AsyncStorage.setItem(STORAGE_KEY_LAST_AMBIENT, key).catch(() => {});
      hapticImpact(Haptics.ImpactFeedbackStyle.Light);
      scrollRef.current?.scrollTo?.({
        x: index * SNAP_STEP,
        animated: true,
      });
      triggerAmbientPreview(key);
    },
    [onSelectAmbient, triggerAmbientPreview]
  );

  // 恢复上次选择并在布局后滚动到中间
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
              scrollRef.current?.scrollTo?.({
                x: idx * SNAP_STEP,
                animated: false,
              });
            }, 300);
          }
        }
      } catch (e) {}
    })();
  }, [onSelectAmbient]);

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

        {/* 第二行：背景声音横向吸附选择器 */}
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
            snapToInterval={SNAP_STEP}
            snapToAlignment="start"
            nestedScrollEnabled={true}
            contentContainerStyle={{
              paddingHorizontal: spacerWidth,
              alignItems: 'center',
            }}
            onScroll={Animated.event(
              [{ nativeEvent: { contentOffset: { x: scrollX } } }],
              {
                useNativeDriver: false,
                listener: (e) => {
                  const offsetX = e.nativeEvent.contentOffset.x;
                  const nearestIndex = Math.max(
                    0,
                    Math.min(
                      FOCUS_AMBIENT_OPTIONS.length - 1,
                      Math.round(offsetX / SNAP_STEP)
                    )
                  );
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
              const index = Math.max(
                0,
                Math.min(
                  FOCUS_AMBIENT_OPTIONS.length - 1,
                  Math.round(offsetX / SNAP_STEP)
                )
              );
              const targetItem = FOCUS_AMBIENT_OPTIONS[index];
              if (targetItem) {
                onSelectAmbient(targetItem.key);
                AsyncStorage.setItem(STORAGE_KEY_LAST_AMBIENT, targetItem.key).catch(() => {});
                triggerAmbientPreview(targetItem.key);
              }
            }}
            onScrollEndDrag={(e) => {
              const velocity = e.nativeEvent.velocity?.x || 0;
              if (Math.abs(velocity) < 0.1) {
                isScrollingRef.current = false;
                const offsetX = e.nativeEvent.contentOffset.x;
                const index = Math.max(
                  0,
                  Math.min(
                    FOCUS_AMBIENT_OPTIONS.length - 1,
                    Math.round(offsetX / SNAP_STEP)
                  )
                );
                const targetItem = FOCUS_AMBIENT_OPTIONS[index];
                if (targetItem) {
                  onSelectAmbient(targetItem.key);
                  AsyncStorage.setItem(STORAGE_KEY_LAST_AMBIENT, targetItem.key).catch(() => {});
                  triggerAmbientPreview(targetItem.key);
                }
              }
            }}
            scrollEventThrottle={16}
          >
            {FOCUS_AMBIENT_OPTIONS.map((item, idx) => {
              const isSelected = ambient === item.key;
              const itemCenterPos = idx * SNAP_STEP;
              const scale = scrollX.interpolate({
                inputRange: [
                  itemCenterPos - SNAP_STEP,
                  itemCenterPos,
                  itemCenterPos + SNAP_STEP,
                ],
                outputRange: [0.88, 1, 0.88],
                extrapolate: 'clamp',
              });
              const opacity = scrollX.interpolate({
                inputRange: [
                  itemCenterPos - SNAP_STEP,
                  itemCenterPos,
                  itemCenterPos + SNAP_STEP,
                ],
                outputRange: [0.6, 1, 0.6],
                extrapolate: 'clamp',
              });

              return (
                <TouchableOpacity
                  key={item.key}
                  onPress={() => handleItemPress(item.key, idx)}
                  activeOpacity={0.8}
                  style={{
                    marginRight: idx === FOCUS_AMBIENT_OPTIONS.length - 1 ? 0 : ITEM_GAP,
                  }}
                >
                  <Animated.View
                    style={[
                      styles.ambientCard,
                      {
                        width: ITEM_WIDTH,
                        transform: [{ scale }],
                        opacity,
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
                  </Animated.View>
                </TouchableOpacity>
              );
            })}
          </Animated.ScrollView>

          {/* 左右两侧渐隐羽化遮罩 */}
          <View style={styles.fadeLeft} pointerEvents="none">
            <Svg width={24} height={50}>
              <Defs>
                <LinearGradient id="cardFadeL" x1="0" y1="0" x2="1" y2="0">
                  <Stop offset="0" stopColor={isDark ? '#261F1A' : '#FFFFFF'} stopOpacity="1" />
                  <Stop offset="1" stopColor={isDark ? '#261F1A' : '#FFFFFF'} stopOpacity="0" />
                </LinearGradient>
              </Defs>
              <Rect width={24} height={50} fill="url(#cardFadeL)" />
            </Svg>
          </View>
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
    width: 24,
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
});
