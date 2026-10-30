import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Pressable,
  Animated,
  Linking,
  Modal,
} from 'react-native';
import Reanimated from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import TomatoVisual from './TomatoVisual';

export default function FocusRunningView({
  isDark,
  colors,
  t,
  insets,
  isPaused,
  timeLeftSec,
  formatTime,
  stageHintText,
  tomatoFillColor,
  animatedTomatoStyle,
  animatedPageBg,
  undoCountdown,
  onUndoStart,
  permDeniedBanner,
  todayCountOrdinal,
  selectedCategoryMeta,
  goalName,
  onEditGoal,
  onAdd5Min,
  onAbandon,
  onTogglePause,
  ambient,
  onChangeAmbient,
  ambientOptions,
  reduceMotion,
}) {
  // P2-1 沉浸模式：运行 5 秒后次要元素淡出
  const [isImmersive, setIsImmersive] = useState(false);
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const hideTimerRef = useRef(null);

  // 白噪音小弹层
  const [showAmbientModal, setShowAmbientModal] = useState(false);

  // 临近结束 60 秒呼吸脉冲
  const isNearEnd = timeLeftSec <= 60 && timeLeftSec > 0 && !isPaused;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (isNearEnd && !reduceMotion) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.05,
            duration: 1000,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1.0,
            duration: 1000,
            useNativeDriver: true,
          }),
        ])
      ).start();
    } else {
      pulseAnim.setValue(1);
    }
  }, [isNearEnd, reduceMotion, pulseAnim]);

  // 重置沉浸淡出倒计时
  const scheduleImmersiveHide = () => {
    if (isPaused) {
      // 暂停时不淡出
      setIsImmersive(false);
      fadeAnim.setValue(1);
      return;
    }
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => {
      if (reduceMotion) {
        setIsImmersive(true);
        fadeAnim.setValue(0);
      } else {
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 400,
          useNativeDriver: true,
        }).start(() => setIsImmersive(true));
      }
    }, 5000);
  };

  useEffect(() => {
    if (isPaused) {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
      setIsImmersive(false);
      fadeAnim.setValue(1);
    } else {
      scheduleImmersiveHide();
    }
    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, [isPaused]);

  const handleScreenTouch = () => {
    if (isImmersive || fadeAnim._value < 1) {
      setIsImmersive(false);
      if (reduceMotion) {
        fadeAnim.setValue(1);
      } else {
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 250,
          useNativeDriver: true,
        }).start();
      }
      scheduleImmersiveHide();
    }
  };

  return (
    <Animated.View
      style={[
        styles.runningContainer,
        {
          backgroundColor: animatedPageBg,
          paddingTop: insets.top + 16,
          paddingBottom: insets.bottom + 20,
        },
      ]}
    >
      <Pressable style={{ flex: 1, alignSelf: 'stretch' }} onPress={handleScreenTouch}>
        <ScrollView
          style={{ flex: 1, alignSelf: 'stretch' }}
          contentContainerStyle={styles.runningScrollContent}
          showsVerticalScrollIndicator={false}
          scrollEnabled={!isImmersive}
        >
          {/* 5 秒可撤销开始条 */}
          {undoCountdown > 0 && (
            <View style={styles.undoBarWrap}>
              <View
                style={[
                  styles.undoBar,
                  {
                    backgroundColor: isDark ? '#2D221C' : '#F6EFE8',
                    borderColor: isDark ? '#4A3B32' : '#E2D5C7',
                  },
                ]}
              >
                <Ionicons name="time-outline" size={16} color="#D93A2B" style={{ marginRight: 6 }} />
                <Text style={[styles.undoBarText, { color: isDark ? '#F5EDE4' : '#2B211C' }]}>
                  {t('pomodoro.undoStart', { n: undoCountdown }).replace('{n}', String(undoCountdown))}
                </Text>
                <TouchableOpacity
                  onPress={onUndoStart}
                  style={styles.undoBtn}
                  hitSlop={{ top: 8, bottom: 8, left: 12, right: 12 }}
                  accessibilityRole="button"
                  accessibilityLabel="撤销开始"
                >
                  <Text style={styles.undoBtnText}>{t('common.cancel', '撤销')}</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* 权限被拒轻提示条 */}
          {permDeniedBanner && (
            <TouchableOpacity
              style={[
                styles.permBanner,
                {
                  backgroundColor: isDark ? 'rgba(217, 58, 43, 0.15)' : '#FDECEB',
                  borderColor: isDark ? '#8A2A20' : '#F5C6CB',
                },
              ]}
              onPress={() => Linking.openSettings()}
              activeOpacity={0.7}
              accessibilityRole="link"
            >
              <Ionicons name="notifications-off-outline" size={15} color="#D93A2B" style={{ marginRight: 6 }} />
              <Text style={[styles.permBannerText, { color: isDark ? '#FF8A80' : '#D93A2B' }]} numberOfLines={1}>
                {t('pomodoro.permBannerDenied', '提醒已关闭，时间到了不会响')}
              </Text>
              <Text style={[styles.permBannerBtn, { color: isDark ? '#FF8A80' : '#D93A2B' }]}>
                {` [${t('pomodoro.permGoSetting', '去开启')}]`}
              </Text>
            </TouchableOpacity>
          )}

          {/* 顶部第 N 次与分类胶囊（带沉浸淡出 + 白噪音小按钮） */}
          <Animated.View
            style={[
              styles.runTopWrap,
              { opacity: fadeAnim },
            ]}
            pointerEvents={isImmersive ? 'none' : 'auto'}
          >
            <Text style={[styles.runCountText, { color: isDark ? '#A6988D' : '#6B5B4F' }]}>
              {t('pomodoro.todayNth', { n: todayCountOrdinal })}
            </Text>

            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <TouchableOpacity
                style={[
                  styles.runCatCapsule,
                  {
                    backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#FFFFFF',
                    borderColor: isDark ? 'rgba(255,255,255,0.12)' : '#EFE5D8',
                  },
                ]}
                activeOpacity={0.7}
                onPress={onEditGoal}
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

              {/* P2-2: 白噪音小图标按钮 */}
              <TouchableOpacity
                style={[
                  styles.ambientIconBtn,
                  {
                    backgroundColor: ambient !== 'none'
                      ? colors.primaryTint || (isDark ? '#3D2420' : '#FFE4DC')
                      : isDark
                      ? 'rgba(255,255,255,0.08)'
                      : '#FFFFFF',
                    borderColor: ambient !== 'none'
                      ? colors.primary
                      : isDark
                      ? 'rgba(255,255,255,0.12)'
                      : '#EFE5D8',
                  },
                ]}
                onPress={() => setShowAmbientModal(true)}
                activeOpacity={0.7}
              >
                <Ionicons
                  name={ambient !== 'none' ? 'volume-high' : 'volume-mute-outline'}
                  size={15}
                  color={ambient !== 'none' ? colors.primary : isDark ? '#A6988D' : '#6B5B4F'}
                />
              </TouchableOpacity>
            </View>
          </Animated.View>

          {/* 中部成熟番茄（主角保持常驻） */}
          <View style={styles.runTomatoWrap}>
            <Reanimated.View style={[styles.tomatoBox, animatedTomatoStyle]}>
              <TomatoVisual fillColor={tomatoFillColor} showCheckmark={false} />
            </Reanimated.View>
          </View>

          {/* 倒计时与阶段文案（主角保持常驻，最后 60 秒微呼吸） */}
          <View style={styles.runTimerWrap}>
            <Animated.Text
              style={[
                styles.runClockText,
                {
                  color: isNearEnd ? colors.accent : isDark ? '#F5EDE4' : '#2B211C',
                  transform: [{ scale: pulseAnim }],
                },
              ]}
            >
              {formatTime(timeLeftSec)}
            </Animated.Text>
            <Text style={[styles.runStageText, { color: isDark ? '#A6988D' : '#6B5B4F' }]}>
              {stageHintText}
            </Text>
          </View>

          {/* P2-2: +5 分钟轻量小胶囊（带沉浸淡出） */}
          <Animated.View
            style={[
              styles.add5MinWrap,
              { opacity: fadeAnim },
            ]}
            pointerEvents={isImmersive ? 'none' : 'auto'}
          >
            <TouchableOpacity
              style={[
                styles.add5MinBtn,
                {
                  backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : '#FAF6F0',
                  borderColor: isDark ? 'rgba(255, 255, 255, 0.14)' : '#E8DDD0',
                },
              ]}
              onPress={onAdd5Min}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={t('pomodoro.add5Min', '+5 分钟')}
            >
              <Text style={[styles.add5MinText, { color: isDark ? '#D5C7BA' : '#5E4F44' }]}>
                {t('pomodoro.add5Min', '+5 分钟')}
              </Text>
            </TouchableOpacity>
          </Animated.View>

          {/* 底部按钮控制区：暂停主控 + 放弃次级链接 */}
          <View style={styles.runControlRow}>
            {/* P2-2 放弃降级为次要文字链接（带沉浸淡出） */}
            <Animated.View
              style={[styles.abandonWrap, { opacity: fadeAnim }]}
              pointerEvents={isImmersive ? 'none' : 'auto'}
            >
              <TouchableOpacity
                style={styles.abandonLinkBtn}
                onPress={onAbandon}
                activeOpacity={0.7}
                hitSlop={{ top: 8, bottom: 8, left: 16, right: 16 }}
              >
                <Text style={[styles.abandonLinkText, { color: isDark ? '#A6988D' : '#8A7B70' }]}>
                  {t('pomodoro.abandon', '放弃')}
                </Text>
              </TouchableOpacity>
            </Animated.View>

            {/* 暂停/继续按钮（核心主操作，常驻） */}
            <TouchableOpacity
              style={[
                styles.runPauseBtn,
                {
                  backgroundColor: isPaused
                    ? colors.primary
                    : isDark
                    ? '#2D221C'
                    : '#2B211C',
                },
              ]}
              onPress={onTogglePause}
              activeOpacity={0.8}
            >
              <Ionicons
                name={isPaused ? 'play' : 'pause'}
                size={20}
                color="#FFFFFF"
              />
              <Text style={styles.runPauseBtnText}>
                {isPaused ? t('pomodoro.resume', '继续') : t('pomodoro.pause', '暂停')}
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </Pressable>

      {/* P2-2 白噪音选择微型弹层 */}
      <Modal
        visible={showAmbientModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowAmbientModal(false)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setShowAmbientModal(false)}
        >
          <Pressable
            style={[
              styles.ambientModalCard,
              {
                backgroundColor: isDark ? '#231B18' : '#FFFFFF',
                borderColor: isDark ? '#3D312A' : '#EFE8DE',
              },
            ]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.ambientModalHeader}>
              <Text style={[styles.ambientModalTitle, { color: isDark ? '#F5EDE4' : '#2B211C' }]}>
                {t('pomodoro.ambientTitle', '背景白噪音')}
              </Text>
              <TouchableOpacity
                onPress={() => setShowAmbientModal(false)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="close" size={20} color={isDark ? '#A6988D' : '#6B5B4F'} />
              </TouchableOpacity>
            </View>

            <View style={styles.ambientGrid}>
              {ambientOptions.map((opt) => {
                const isSelected = ambient === opt.key;
                return (
                  <TouchableOpacity
                    key={`modal-amb-${opt.key}`}
                    style={[
                      styles.ambientOptionItem,
                      {
                        backgroundColor: isSelected
                          ? colors.primaryTint || (isDark ? '#3D2420' : '#FFE4DC')
                          : isDark
                          ? '#1A1210'
                          : '#F9F6F0',
                        borderColor: isSelected
                          ? colors.primary
                          : isDark
                          ? '#332722'
                          : '#EFE8DE',
                      },
                    ]}
                    onPress={() => {
                      onChangeAmbient(opt.key);
                      setShowAmbientModal(false);
                    }}
                    activeOpacity={0.7}
                  >
                    <Ionicons
                      name={opt.icon}
                      size={18}
                      color={isSelected ? colors.primary : isDark ? '#A6988D' : '#6B5B4F'}
                      style={{ marginBottom: 4 }}
                    />
                    <Text
                      style={[
                        styles.ambientOptionText,
                        {
                          color: isSelected
                            ? colors.primary
                            : isDark
                            ? '#D5C7BA'
                            : '#2B211C',
                          fontWeight: isSelected ? '700' : '400',
                        },
                      ]}
                    >
                      {t(opt.i18nKey)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  runningContainer: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  runningScrollContent: {
    alignItems: 'center',
    paddingBottom: 24,
  },
  undoBarWrap: {
    width: '100%',
    maxWidth: 360,
    marginBottom: 10,
    alignItems: 'center',
  },
  undoBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  undoBarText: {
    fontSize: 13,
    fontWeight: '500',
    flex: 1,
  },
  undoBtn: {
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  undoBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#D93A2B',
  },
  permBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    maxWidth: 360,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 10,
  },
  permBannerText: {
    fontSize: 12,
    fontWeight: '500',
    flex: 1,
  },
  permBannerBtn: {
    fontSize: 12,
    fontWeight: '700',
  },
  runTopWrap: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    paddingHorizontal: 4,
  },
  runCountText: {
    fontSize: 13,
    fontWeight: '600',
  },
  runCatCapsule: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    borderWidth: 1,
    maxWidth: 220,
  },
  catChipDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 6,
  },
  runCatName: {
    fontSize: 12,
    fontWeight: '600',
  },
  runGoalText: {
    fontSize: 12,
    maxWidth: 120,
  },
  ambientIconBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  runTomatoWrap: {
    width: 220,
    height: 220,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 12,
  },
  tomatoBox: {
    width: 200,
    height: 200,
    alignItems: 'center',
    justifyContent: 'center',
  },
  runTimerWrap: {
    alignItems: 'center',
    marginBottom: 12,
  },
  runClockText: {
    fontSize: 54,
    fontWeight: '800',
    letterSpacing: -1.5,
  },
  runStageText: {
    fontSize: 13,
    marginTop: 4,
    fontWeight: '500',
  },
  add5MinWrap: {
    alignItems: 'center',
    marginBottom: 20,
  },
  add5MinBtn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
  },
  add5MinText: {
    fontSize: 12,
    fontWeight: '600',
  },
  runControlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    maxWidth: 320,
    marginTop: 8,
  },
  abandonWrap: {
    position: 'absolute',
    left: 8,
  },
  abandonLinkBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  abandonLinkText: {
    fontSize: 14,
    fontWeight: '500',
  },
  runPauseBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  runPauseBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    marginLeft: 6,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  ambientModalCard: {
    width: '100%',
    maxWidth: 340,
    borderRadius: 20,
    borderWidth: 1,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 6,
  },
  ambientModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  ambientModalTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  ambientGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  ambientOptionItem: {
    width: '31%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 10,
  },
  ambientOptionText: {
    fontSize: 12,
  },
});
