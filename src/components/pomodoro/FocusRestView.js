import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
} from 'react-native';

export default function FocusRestView({
  isDark,
  colors,
  t,
  insets,
  restTimeLeftSec,
  formatTime,
  isLongRest,
  reduceMotion,
  animatedPageBg,
  breatheAnim,
  onSkipRest,
}) {
  // 健康小贴士轮播
  const tips = [
    t('pomodoro.restTipWater', '喝杯水，滋润一下身体'),
    t('pomodoro.restTipLookFar', '远眺窗外，让眼睛放松片刻'),
    t('pomodoro.restTipStretch', '起身做几个深呼吸与简单拉伸'),
  ];
  const [tipIndex, setTipIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setTipIndex((prev) => (prev + 1) % tips.length);
    }, 8000);
    return () => clearInterval(timer);
  }, [tips.length]);

  return (
    <Animated.View
      style={[
        styles.restContainer,
        {
          backgroundColor: animatedPageBg,
          paddingTop: insets.top + 24,
          paddingBottom: insets.bottom + 24,
        },
      ]}
    >
      <View style={styles.restContent}>
        <Text style={[styles.restTitle, { color: isDark ? '#F5EDE4' : '#2B211C' }]}>
          {isLongRest
            ? t('pomodoro.longRestTitle', '深度放松')
            : t('pomodoro.shortRestTitle', '小憩一下')}
        </Text>

        {/* 呼吸动画环与倒计时 */}
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
              styles.restBreatheOuterRing,
              {
                backgroundColor: isDark
                  ? 'rgba(78, 143, 74, 0.08)'
                  : 'rgba(78, 143, 74, 0.05)',
                borderColor: isDark
                  ? 'rgba(78, 143, 74, 0.2)'
                  : 'rgba(78, 143, 74, 0.15)',
              },
            ]}
          >
            <View
              style={[
                styles.restBreatheRing,
                {
                  backgroundColor: isDark
                    ? 'rgba(78, 143, 74, 0.14)'
                    : 'rgba(78, 143, 74, 0.10)',
                  borderColor: isDark
                    ? 'rgba(78, 143, 74, 0.35)'
                    : 'rgba(78, 143, 74, 0.25)',
                },
              ]}
            >
              <Text style={[styles.restTimer, { color: isDark ? '#81C784' : '#4E8F4A' }]}>
                {formatTime(restTimeLeftSec)}
              </Text>
              {!reduceMotion && (
                <Text style={[styles.breatheSubText, { color: isDark ? '#81C784' : '#4E8F4A' }]}>
                  {t('pomodoro.restBreatheIn', '缓缓吸气')} · {t('pomodoro.restBreatheOut', '慢慢呼气')}
                </Text>
              )}
            </View>
          </View>
        </Animated.View>

        {/* 轮播小建议 */}
        <Text style={[styles.restHint, { color: isDark ? '#A6988D' : '#6B5B4F' }]}>
          {tips[tipIndex]}
        </Text>

        <TouchableOpacity
          style={[
            styles.restSkipBtn,
            {
              backgroundColor: isDark ? '#261F1A' : '#FAF6F0',
              borderColor: isDark ? '#3D332A' : '#E8DDD0',
            },
          ]}
          onPress={onSkipRest}
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

const styles = StyleSheet.create({
  restContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  restContent: {
    alignItems: 'center',
    width: '100%',
    maxWidth: 320,
  },
  restTitle: {
    fontSize: 24,
    fontWeight: '800',
    marginBottom: 24,
    letterSpacing: -0.3,
  },
  restTimerWrap: {
    width: 220,
    height: 220,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 28,
  },
  restBreatheOuterRing: {
    width: 220,
    height: 220,
    borderRadius: 110,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  restBreatheRing: {
    width: 180,
    height: 180,
    borderRadius: 90,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  restTimer: {
    fontSize: 44,
    fontWeight: '800',
    letterSpacing: -1,
  },
  breatheSubText: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 4,
    opacity: 0.85,
  },
  restHint: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 32,
    paddingHorizontal: 20,
    lineHeight: 20,
  },
  restSkipBtn: {
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: 24,
    borderWidth: 1,
  },
  restSkipBtnText: {
    fontSize: 14,
    fontWeight: '600',
  },
});
