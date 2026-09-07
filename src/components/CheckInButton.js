import React, { useMemo, useRef, useEffect } from 'react';
import { Pressable, Text, StyleSheet, View, Animated, Easing } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { shadow, radius } from '../theme';
import { useTheme } from '../theme/ThemeContext';
import { useI18n } from '../i18n/LanguageContext';

export default function CheckInButton({ onPress, onLongPress, loading, success }) {
  const { t } = useI18n();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const isSuccess = !!success;
  const isEnded = success === 'ended';

  // 动效引用
  const pressScale = useRef(new Animated.Value(1)).current;
  const chargeProgress = useRef(new Animated.Value(0)).current;
  const bounceAnim = useRef(new Animated.Value(1)).current;
  const isChargingRef = useRef(false);

  // 成功/结程状态变化时的微弹簧弹跳
  useEffect(() => {
    if (isSuccess) {
      Animated.sequence([
        Animated.spring(bounceAnim, { toValue: 1.08, friction: 4, tension: 120, useNativeDriver: true }),
        Animated.spring(bounceAnim, { toValue: 1, friction: 5, tension: 100, useNativeDriver: true }),
      ]).start();
    }
  }, [isSuccess, bounceAnim]);

  // 按下：开始充能并产生物理下潜感
  const handlePressIn = () => {
    if (loading || isSuccess) return;
    isChargingRef.current = true;

    // 物理下潜
    Animated.spring(pressScale, {
      toValue: 0.96,
      friction: 6,
      tension: 140,
      useNativeDriver: true,
    }).start();

    // 500ms 蓄力充能进度
    chargeProgress.setValue(0);
    Animated.timing(chargeProgress, {
      toValue: 1,
      duration: 500,
      easing: Easing.bezier(0.2, 0.8, 0.25, 1),
      useNativeDriver: false, // 涉及 width 样式
    }).start();
  };

  // 抬手：重置缩放与充能进度
  const handlePressOut = () => {
    isChargingRef.current = false;

    // 平滑回弹
    Animated.spring(pressScale, {
      toValue: 1,
      friction: 5,
      tension: 100,
      useNativeDriver: true,
    }).start();

    // 充能进度平滑归零
    Animated.timing(chargeProgress, {
      toValue: 0,
      duration: 160,
      easing: Easing.out(Easing.ease),
      useNativeDriver: false,
    }).start();
  };

  // 长按触发（满500ms结程）
  const handleLongPress = () => {
    if (loading || isSuccess) return;
    // 满充能震颤反馈
    Animated.sequence([
      Animated.timing(pressScale, { toValue: 1.04, duration: 100, useNativeDriver: true }),
      Animated.spring(pressScale, { toValue: 1, friction: 4, tension: 100, useNativeDriver: true }),
    ]).start();
    if (onLongPress) onLongPress();
  };

  const labelText = isEnded
    ? t('checkin.ended')
    : isSuccess
      ? t('checkin.done')
      : t('checkin.btn');

  const chargeBarWidth = chargeProgress.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  const chargeGlowOpacity = chargeProgress.interpolate({
    inputRange: [0, 0.2, 1],
    outputRange: [0, 0.15, 0.4],
  });

  return (
    <View style={styles.container}>
      <Animated.View style={[{ width: '100%' }, { transform: [{ scale: pressScale }, { scale: bounceAnim }] }]}>
        <Pressable
          style={[
            styles.button,
            isSuccess && styles.buttonSuccess,
            isEnded && styles.buttonEnded,
          ]}
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
          onPress={onPress}
          onLongPress={handleLongPress}
          delayLongPress={500}
          disabled={loading || isSuccess}
        >
          {/* 长按充能内衬与底部发光条 */}
          <Animated.View
            style={[
              styles.chargeFill,
              {
                width: chargeBarWidth,
                opacity: chargeGlowOpacity,
              },
            ]}
          />
          <Animated.View
            style={[
              styles.chargeBar,
              {
                width: chargeBarWidth,
              },
            ]}
          />

          <View style={styles.inner}>
            {isSuccess ? (
              <Text style={styles.checkIcon}>{isEnded ? '🏁' : '✓'}</Text>
            ) : (
              <Ionicons name="finger-print-outline" size={22} color="rgba(255,255,255,0.85)" style={styles.btnIcon} />
            )}
            <Text style={[styles.label, isSuccess && styles.labelSuccess]}>{labelText}</Text>
          </View>
        </Pressable>
      </Animated.View>

      <View style={styles.hintRow}>
        <Ionicons name="radio-button-on" size={10} color={colors.primary} style={styles.hintDot} />
        <Text style={styles.hintText}>{t('checkin.hint')}</Text>
      </View>
    </View>
  );
}

const makeStyles = (colors) => StyleSheet.create({
  container: {
    width: '100%',
    alignItems: 'center',
  },
  button: {
    width: '100%',
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    paddingVertical: 17,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    overflow: 'hidden',
    ...shadow.primary,
  },
  buttonSuccess: {
    backgroundColor: colors.success,
    shadowColor: colors.success,
  },
  buttonEnded: {
    backgroundColor: colors.ink2,
    shadowColor: colors.ink2,
  },
  chargeFill: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    backgroundColor: '#FFFFFF',
    zIndex: 1,
  },
  chargeBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    height: 3.5,
    backgroundColor: '#FFFFFF',
    borderRadius: 2,
    zIndex: 3,
  },
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    zIndex: 2,
  },
  btnIcon: {
    marginRight: 2,
  },
  checkIcon: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '800',
  },
  label: {
    color: '#fff',
    fontSize: 19,
    fontWeight: '800',
    letterSpacing: 4,
    textAlign: 'center',
  },
  labelSuccess: {
    letterSpacing: 1.5,
  },
  hintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    gap: 5,
  },
  hintDot: {
    opacity: 0.8,
  },
  hintText: {
    fontSize: 12,
    color: colors.ink3,
    letterSpacing: 0.3,
    fontWeight: '500',
  },
});
