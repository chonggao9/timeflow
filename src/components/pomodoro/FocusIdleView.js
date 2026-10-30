import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Modal,
  Pressable,
} from 'react-native';
import Reanimated from 'react-native-reanimated';
import { GestureDetector } from 'react-native-gesture-handler';
import Svg, { Defs, LinearGradient, Stop, Rect } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { FOCUS_CATEGORIES } from '../../utils/focusCategories';
import TomatoVisual from './TomatoVisual';

const DURATION_PRESETS = [2, 5, 10, 15, 20, 25, 30, 45, 60, 90, 120];

export default function FocusIdleView({
  isDark,
  colors,
  t,
  durationMin,
  onSelectDuration,
  panGesture,
  animatedTomatoStyle,
  stageHintText,
  todayCount,
  category,
  onSelectCategory,
  goalName,
  onChangeGoal,
  recentGoals,
  selectedCategoryMeta,
  onStartFocus,
  onOpenHistory,
}) {
  // P1-1 折叠「这次做什么」，默认折叠
  const [isTaskExpanded, setIsTaskExpanded] = useState(false);

  // 自定义时长弹窗
  const [showCustomModal, setShowCustomModal] = useState(false);
  const [customInput, setCustomInput] = useState(String(durationMin));
  const [customError, setCustomError] = useState('');

  const handleOpenCustom = () => {
    setCustomInput(String(durationMin));
    setCustomError('');
    setShowCustomModal(true);
  };

  const handleConfirmCustom = () => {
    const val = parseInt(customInput.trim(), 10);
    if (isNaN(val) || val < 2 || val > 120) {
      setCustomError(t('pomodoro.customDurHint', { min: 2, max: 120 })
        .replace('{min}', '2')
        .replace('{max}', '120'));
      return;
    }
    onSelectDuration(val);
    setShowCustomModal(false);
  };

  const currentGoalTrimmed = (goalName || '').trim();

  return (
    <View style={styles.idleContainer}>
      {/* 顶部今日摘要（降级为单行小字，右侧保留历史入口） */}
      <View style={styles.topSummaryRow}>
        <Text style={[styles.todaySummaryText, { color: isDark ? '#A6988D' : '#6B5B4F' }]}>
          {t('pomodoro.todayCount', '今日已完成')} <Text style={{ fontWeight: '700', color: colors.primary }}>{todayCount}</Text> {t('pomodoro.unitCount', '个番茄')}
        </Text>
        <TouchableOpacity
          style={styles.historyBtn}
          onPress={onOpenHistory}
          activeOpacity={0.7}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="time-outline" size={15} color={isDark ? '#A6988D' : '#6B5B4F'} />
          <Text style={[styles.historyBtnText, { color: isDark ? '#A6988D' : '#6B5B4F' }]}>
            {t('pomodoro.historyTitle', '记录')}
          </Text>
        </TouchableOpacity>
      </View>

      {/* P1-1: 折叠式「这次做什么」摘要胶囊 */}
      <View style={styles.taskSectionWrap}>
        <TouchableOpacity
          style={[
            styles.foldedCapsule,
            {
              backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#FFFFFF',
              borderColor: isDark ? 'rgba(255,255,255,0.12)' : '#EFE5D8',
            },
          ]}
          onPress={() => setIsTaskExpanded((prev) => !prev)}
          activeOpacity={0.7}
        >
          <View style={[styles.catChipDot, { backgroundColor: selectedCategoryMeta?.color || colors.primary }]} />
          <Text style={[styles.foldedCatName, { color: isDark ? '#F5EDE4' : '#2B211C' }]}>
            {selectedCategoryMeta?.name}
          </Text>
          <Text style={{ color: isDark ? '#5A4A40' : '#D0C4B8', marginHorizontal: 6 }}>·</Text>
          <Text
            style={[
              styles.foldedGoalText,
              {
                color: currentGoalTrimmed
                  ? isDark ? '#D5C7BA' : '#5E4F44'
                  : isDark ? '#7A6B60' : '#A6988D',
              },
            ]}
            numberOfLines={1}
          >
            {currentGoalTrimmed || t('pomodoro.foldGoalSummaryEmpty', '点击设定专注目标')}
          </Text>
          <Ionicons
            name={isTaskExpanded ? 'chevron-up' : 'chevron-down'}
            size={14}
            color={isDark ? '#A6988D' : '#6B5B4F'}
            style={{ marginLeft: 6 }}
          />
        </TouchableOpacity>

        {/* 展开的分类、历史任务与输入框卡片 */}
        {isTaskExpanded && (
          <View
            style={[
              styles.expandedCard,
              {
                backgroundColor: isDark ? '#231B18' : '#FFFFFF',
                borderColor: isDark ? '#3D312A' : '#EFE8DE',
              },
            ]}
          >
            {/* 分类横滑 */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 4, paddingVertical: 4 }}
            >
              {FOCUS_CATEGORIES.map((item) => {
                const isSelected = category === item.key;
                return (
                  <TouchableOpacity
                    key={`idle-cat-${item.key}`}
                    style={[
                      styles.catChip,
                      {
                        backgroundColor: isSelected
                          ? isDark
                            ? 'rgba(217, 58, 43, 0.22)'
                            : '#FDECEB'
                          : isDark
                          ? '#1A1210'
                          : '#FAF6F0',
                        borderColor: isSelected
                          ? '#D93A2B'
                          : isDark
                          ? '#332722'
                          : '#EFE8DE',
                      },
                    ]}
                    onPress={() => onSelectCategory(item.key)}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.catChipDot, { backgroundColor: item.color }]} />
                    <Text
                      style={[
                        styles.catChipText,
                        {
                          color: isSelected
                            ? isDark ? '#FF7A6E' : '#D93A2B'
                            : isDark ? '#A6988D' : '#6B5B4F',
                          fontWeight: isSelected ? '700' : '500',
                        },
                      ]}
                    >
                      {t(item.i18nKey).replace(/^[^\w一-龥]+\s*/, '')}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* 目标输入框 */}
            <View
              style={[
                styles.goalInputWrap,
                {
                  backgroundColor: isDark ? '#1A1210' : '#FAF6F0',
                  borderColor: isDark ? '#332722' : '#EFE8DE',
                },
              ]}
            >
              <Ionicons
                name="bookmark-outline"
                size={15}
                color={isDark ? '#7A6B60' : '#A6988D'}
                style={{ marginRight: 8 }}
              />
              <TextInput
                style={[styles.goalInput, { color: isDark ? '#F5EDE4' : '#2B211C' }]}
                value={goalName}
                onChangeText={onChangeGoal}
                placeholder={t('pomodoro.notePlaceholder', '具体做什么？（选填）')}
                placeholderTextColor={isDark ? '#6B5B4F' : '#A6988D'}
                maxLength={40}
                returnKeyType="done"
              />
              {goalName.length > 0 && (
                <TouchableOpacity onPress={() => onChangeGoal('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="close-circle" size={16} color={isDark ? '#7A6B60' : '#A6988D'} />
                </TouchableOpacity>
              )}
            </View>

            {/* 最近任务 Chip */}
            {recentGoals && recentGoals.length > 0 && (
              <View style={styles.recentWrap}>
                <Text style={[styles.recentLabel, { color: isDark ? '#7A6B60' : '#A6988D' }]}>
                  {t('pomodoro.recentGoals', '最近：')}
                </Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  {recentGoals.map((rg, idx) => (
                    <TouchableOpacity
                      key={`recent-goal-${idx}`}
                      style={[
                        styles.recentChip,
                        {
                          backgroundColor: isDark ? '#2D221C' : '#F0EAE1',
                          borderColor: isDark ? '#4A3B32' : '#E0D5C7',
                        },
                      ]}
                      onPress={() => onChangeGoal(rg)}
                      activeOpacity={0.7}
                    >
                      <Text
                        style={[styles.recentChipText, { color: isDark ? '#D5C7BA' : '#5E4F44' }]}
                        numberOfLines={1}
                      >
                        {rg}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}
          </View>
        )}
      </View>

      {/* 中部核心主角：大番茄 + 上下滑动调节手势 */}
      <View style={styles.tomatoCenterWrap}>
        <GestureDetector gesture={panGesture}>
          <Reanimated.View style={[styles.tomatoBox, animatedTomatoStyle]}>
            <TomatoVisual fillColor="#8DB255" showCheckmark={false} />
          </Reanimated.View>
        </GestureDetector>
        {/* 常驻微弱滑动提示 */}
        <View style={styles.slideHintRow}>
          <Ionicons name="swap-vertical-outline" size={13} color={isDark ? '#7A6B60' : '#A6988D'} />
          <Text style={[styles.slideHintText, { color: isDark ? '#7A6B60' : '#A6988D' }]}>
            {durationMin} {t('common.minutes', '分钟')} · {stageHintText}
          </Text>
        </View>
      </View>

      {/* P1-2: 时长档位快捷选择栏 */}
      <View style={styles.durationSection}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.durationScroll}
        >
          {DURATION_PRESETS.map((preset) => {
            const isSelected = durationMin === preset;
            return (
              <TouchableOpacity
                key={`preset-${preset}`}
                style={[
                  styles.presetChip,
                  {
                    backgroundColor: isSelected
                      ? colors.primary
                      : isDark
                      ? '#231B18'
                      : '#FFFFFF',
                    borderColor: isSelected
                      ? colors.primary
                      : isDark
                      ? '#3D312A'
                      : '#EFE8DE',
                  },
                ]}
                onPress={() => onSelectDuration(preset)}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.presetText,
                    {
                      color: isSelected
                        ? colors.onPrimary || '#FFFFFF'
                        : isDark
                        ? '#F5EDE4'
                        : '#2B211C',
                      fontWeight: isSelected ? '700' : '500',
                    },
                  ]}
                >
                  {preset}
                </Text>
              </TouchableOpacity>
            );
          })}

          {/* 自定义时长按钮 */}
          <TouchableOpacity
            style={[
              styles.presetChip,
              {
                backgroundColor: !DURATION_PRESETS.includes(durationMin)
                  ? colors.primary
                  : isDark
                  ? '#231B18'
                  : '#FFFFFF',
                borderColor: !DURATION_PRESETS.includes(durationMin)
                  ? colors.primary
                  : isDark
                  ? '#3D312A'
                  : '#EFE8DE',
              },
            ]}
            onPress={handleOpenCustom}
            activeOpacity={0.7}
          >
            <Text
              style={[
                styles.presetText,
                {
                  color: !DURATION_PRESETS.includes(durationMin)
                    ? colors.onPrimary || '#FFFFFF'
                    : isDark
                    ? '#F5EDE4'
                    : '#2B211C',
                  fontWeight: !DURATION_PRESETS.includes(durationMin) ? '700' : '500',
                },
              ]}
            >
              {!DURATION_PRESETS.includes(durationMin) ? `${durationMin}m` : t('pomodoro.custom', '自定义')}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </View>

      {/* 底部一键「开始专注」实心渐变大按钮 */}
      <View style={styles.startBtnWrap}>
        <TouchableOpacity
          style={styles.startBtn}
          onPress={onStartFocus}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={t('pomodoro.startFocus', '开始专注')}
        >
          <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
            <Defs>
              <LinearGradient id="startBtnGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <Stop offset="0%" stopColor={colors.primary} />
                <Stop offset="100%" stopColor={colors.primary2 || colors.primary} />
              </LinearGradient>
            </Defs>
            <Rect width="100%" height="100%" rx={28} fill="url(#startBtnGrad)" />
          </Svg>
          <Text style={[styles.startBtnText, { color: colors.onPrimary || '#FFFFFF' }]}>
            {t('pomodoro.startFocus', '开始专注')} · {durationMin}m
          </Text>
        </TouchableOpacity>
      </View>

      {/* 自定义时长弹窗 */}
      <Modal
        visible={showCustomModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowCustomModal(false)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setShowCustomModal(false)}
        >
          <Pressable
            style={[
              styles.modalCard,
              {
                backgroundColor: isDark ? '#231B18' : '#FFFFFF',
                borderColor: isDark ? '#3D312A' : '#EFE8DE',
              },
            ]}
            onPress={(e) => e.stopPropagation()}
          >
            <Text style={[styles.modalTitle, { color: isDark ? '#F5EDE4' : '#2B211C' }]}>
              {t('pomodoro.customDuration', '自定义专注时长')}
            </Text>
            <Text style={[styles.modalHint, { color: isDark ? '#A6988D' : '#6B5B4F' }]}>
              {t('pomodoro.customDurHint', { min: 2, max: 120 })
                .replace('{min}', '2')
                .replace('{max}', '120')}
            </Text>

            <View
              style={[
                styles.modalInputWrap,
                {
                  backgroundColor: isDark ? '#1A1210' : '#FAF6F0',
                  borderColor: customError ? '#D93A2B' : isDark ? '#332722' : '#EFE8DE',
                },
              ]}
            >
              <TextInput
                style={[styles.modalInput, { color: isDark ? '#F5EDE4' : '#2B211C' }]}
                value={customInput}
                onChangeText={(val) => {
                  setCustomInput(val);
                  setCustomError('');
                }}
                keyboardType="number-pad"
                maxLength={3}
                autoFocus
              />
              <Text style={{ color: isDark ? '#A6988D' : '#6B5B4F', marginLeft: 8 }}>
                {t('common.minutes', '分钟')}
              </Text>
            </View>

            {customError ? (
              <Text style={styles.modalErrorText}>{customError}</Text>
            ) : null}

            <View style={styles.modalBtnRow}>
              <TouchableOpacity
                style={[
                  styles.modalCancelBtn,
                  {
                    backgroundColor: isDark ? '#2D221C' : '#F6EFE8',
                    borderColor: isDark ? '#4A3B32' : '#E2D5C7',
                  },
                ]}
                onPress={() => setShowCustomModal(false)}
              >
                <Text style={{ color: isDark ? '#A6988D' : '#6B5B4F', fontWeight: '600' }}>
                  {t('common.cancel', '取消')}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalConfirmBtn, { backgroundColor: colors.primary }]}
                onPress={handleConfirmCustom}
              >
                <Text style={{ color: colors.onPrimary || '#FFFFFF', fontWeight: '700' }}>
                  {t('common.confirm', '确认')}
                </Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  idleContainer: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  topSummaryRow: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  todaySummaryText: {
    fontSize: 13,
  },
  historyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  historyBtnText: {
    fontSize: 13,
    marginLeft: 4,
    fontWeight: '500',
  },
  taskSectionWrap: {
    width: '100%',
    alignItems: 'center',
    marginBottom: 12,
  },
  foldedCapsule: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    maxWidth: 320,
  },
  catChipDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 6,
  },
  foldedCatName: {
    fontSize: 13,
    fontWeight: '700',
  },
  foldedGoalText: {
    fontSize: 13,
    maxWidth: 160,
  },
  expandedCard: {
    width: '100%',
    maxWidth: 340,
    borderRadius: 16,
    borderWidth: 1,
    padding: 12,
    marginTop: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
  },
  catChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    borderWidth: 1,
    marginRight: 6,
  },
  catChipText: {
    fontSize: 12,
  },
  goalInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 10,
  },
  goalInput: {
    flex: 1,
    fontSize: 13,
    padding: 0,
  },
  recentWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 0.5,
    borderTopColor: 'rgba(150,150,150,0.15)',
  },
  recentLabel: {
    fontSize: 11,
    marginRight: 6,
  },
  recentChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    borderWidth: 1,
    marginRight: 6,
    maxWidth: 100,
  },
  recentChipText: {
    fontSize: 11,
  },
  tomatoCenterWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 16,
  },
  tomatoBox: {
    width: 220,
    height: 220,
    alignItems: 'center',
    justifyContent: 'center',
  },
  slideHintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
  },
  slideHintText: {
    fontSize: 12,
    marginLeft: 4,
    fontWeight: '500',
  },
  durationSection: {
    width: '100%',
    marginVertical: 12,
  },
  durationScroll: {
    paddingHorizontal: 8,
    alignItems: 'center',
  },
  presetChip: {
    minWidth: 44,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    marginHorizontal: 4,
  },
  presetText: {
    fontSize: 14,
  },
  startBtnWrap: {
    width: '100%',
    maxWidth: 320,
    marginTop: 8,
    marginBottom: 20,
  },
  startBtn: {
    width: '100%',
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
    elevation: 4,
  },
  startBtnText: {
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  modalCard: {
    width: '100%',
    maxWidth: 320,
    borderRadius: 20,
    borderWidth: 1,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 6,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 4,
  },
  modalHint: {
    fontSize: 12,
    marginBottom: 16,
  },
  modalInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 8,
  },
  modalInput: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
    padding: 0,
  },
  modalErrorText: {
    color: '#D93A2B',
    fontSize: 12,
    marginBottom: 8,
  },
  modalBtnRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 12,
  },
  modalCancelBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 14,
    borderWidth: 1,
    marginRight: 10,
  },
  modalConfirmBtn: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 14,
  },
});
