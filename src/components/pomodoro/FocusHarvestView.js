import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Animated,
} from 'react-native';
import Reanimated from 'react-native-reanimated';
import Svg, { Defs, LinearGradient, Stop, Rect } from 'react-native-svg';
import { FOCUS_CATEGORIES } from '../../utils/focusCategories';
import TomatoVisual from './TomatoVisual';

const BURST_PARTICLES = [
  { dx: -60, dy: -50, color: '#FFD166' },
  { dx: 60, dy: -50, color: '#06D6A0' },
  { dx: -80, dy: 10, color: '#118AB2' },
  { dx: 80, dy: 10, color: '#EF476F' },
  { dx: -45, dy: 60, color: '#F78C6B' },
  { dx: 45, dy: 60, color: '#8338EC' },
  { dx: 0, dy: -80, color: '#FFBE0B' },
  { dx: 0, dy: 80, color: '#3A86FF' },
];

export default function FocusHarvestView({
  isDark,
  colors,
  t,
  reduceMotion,
  isPartialHarvest,
  durationMin,
  category,
  onChangeCategory,
  goalName,
  todayCount,
  harvestDurationSec,
  isLongRest,
  longRestMin,
  shortRestMin,
  selectedCategoryMeta,
  harvestParticleAnim,
  animatedTomatoStyle,
  animatedPageBg,
  isSavingRecord,
  onSaveAndRest,
  onSaveAndAnother,
  onSaveAndAnother5Min,
  onSaveOnly,
}) {
  const [showMoreActions, setShowMoreActions] = useState(false);

  const displayMin = isPartialHarvest
    ? Math.max(1, Math.floor((harvestDurationSec || 60) / 60))
    : durationMin;

  const restMin = isLongRest ? longRestMin : shortRestMin;

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
            !isPartialHarvest &&
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
            <TomatoVisual fillColor="#D93A2B" showCheckmark={true} />
          </Reanimated.View>
        </View>

        <Text style={[styles.harvestTitle, { color: isDark ? '#F5EDE4' : '#2B211C' }]}>
          {isPartialHarvest
            ? t('pomodoro.partialHarvestTitle', '提前完成专注')
            : t('pomodoro.harvestTitle', '收获一颗番茄')}
        </Text>

        <Text style={[styles.harvestSub, { color: isDark ? '#A6988D' : '#6B5B4F' }]}>
          {isPartialHarvest
            ? t('pomodoro.partialHarvestSub', { min: displayMin }).replace('{min}', String(displayMin))
            : isLongRest
            ? t('pomodoro.harvestSubLong', { n: todayCount + 1, min: longRestMin })
                .replace('{n}', String(todayCount + 1))
                .replace('{min}', String(longRestMin))
            : t('pomodoro.harvestSub', {
                n: todayCount + 1,
                cat: selectedCategoryMeta?.name || '',
                min: durationMin,
              })
                .replace('{n}', String(todayCount + 1))
                .replace('{cat}', selectedCategoryMeta?.name || '')
                .replace('{min}', String(durationMin))}
        </Text>

        {goalName ? (
          <Text style={[styles.harvestTaskText, { color: isDark ? '#D5C7BA' : '#5E4F44' }]}>
            {goalName}
          </Text>
        ) : null}

        {/* 分类快捷微调 */}
        <Text style={[styles.postCatHint, { color: isDark ? '#8A7B70' : '#8A7B70' }]}>
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
                  {
                    backgroundColor: isDark
                      ? isSelected
                        ? 'rgba(217, 58, 43, 0.22)'
                        : '#231B18'
                      : isSelected
                      ? '#FDECEB'
                      : '#FFFFFF',
                    borderColor: isDark
                      ? isSelected
                        ? '#D93A2B'
                        : '#3D312A'
                      : isSelected
                      ? '#D93A2B'
                      : '#EFE8DE',
                  },
                ]}
                onPress={() => onChangeCategory(item.key)}
                activeOpacity={0.7}
                accessibilityRole="radio"
                accessibilityState={{ selected: isSelected }}
              >
                <View style={[styles.catChipDot, { backgroundColor: item.color }]} />
                <Text
                  style={[
                    styles.catBtnDoneText,
                    {
                      color: isSelected
                        ? isDark
                          ? '#FF7A6E'
                          : '#D93A2B'
                        : isDark
                        ? '#A6988D'
                        : '#6B5B4F',
                      fontWeight: isSelected ? '700' : '400',
                    },
                  ]}
                >
                  {t(item.i18nKey).replace(/^[^\w一-龥]+\s*/, '')}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* P3-1 按钮区域：单主按钮 + 次按钮 + 更多操作 */}
        <View style={styles.doneBtnGroup}>
          {/* 1. 主按钮：记入并休息 N 分钟（135° 渐变，突出主角） */}
          <TouchableOpacity
            style={[styles.primaryGradientBtn, isSavingRecord && { opacity: 0.5 }]}
            onPress={onSaveAndRest}
            disabled={isSavingRecord}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={t('pomodoro.saveAndRestBtn', { min: restMin }).replace('{min}', String(restMin))}
          >
            <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
              <Defs>
                <LinearGradient id="harvestBtnGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <Stop offset="0%" stopColor={colors.primary} />
                  <Stop offset="100%" stopColor={colors.primary2 || colors.primary} />
                </LinearGradient>
              </Defs>
              <Rect width="100%" height="100%" rx={26} fill="url(#harvestBtnGrad)" />
            </Svg>
            <Text style={[styles.primaryBtnText, { color: colors.onPrimary || '#FFFFFF' }]}>
              {t('pomodoro.saveAndRestBtn', { min: restMin }).replace('{min}', String(restMin))}
            </Text>
          </TouchableOpacity>

          {/* 2. 次按钮：再来一个 (N 分钟) */}
          <TouchableOpacity
            style={[
              styles.secondaryBtn,
              {
                backgroundColor: isDark ? '#261F1A' : '#FAF6F0',
                borderColor: isDark ? '#3D332A' : '#E8DDD0',
                opacity: isSavingRecord ? 0.5 : 1,
              },
            ]}
            onPress={onSaveAndAnother}
            disabled={isSavingRecord}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={t('pomodoro.saveAndAnotherBtn', { min: durationMin }).replace('{min}', String(durationMin))}
          >
            <Text style={[styles.secondaryBtnText, { color: isDark ? '#F5EDE4' : '#2B211C' }]}>
              {t('pomodoro.saveAndAnotherBtn', { min: durationMin }).replace('{min}', String(durationMin))}
            </Text>
          </TouchableOpacity>

          {/* 3. 更多选项（轻量收纳，保持功能全部可达） */}
          {!showMoreActions ? (
            <TouchableOpacity
              style={styles.moreActionToggle}
              onPress={() => setShowMoreActions(true)}
              hitSlop={{ top: 8, bottom: 8, left: 16, right: 16 }}
            >
              <Text style={[styles.moreActionToggleText, { color: isDark ? '#8A7B70' : '#8A7B70' }]}>
                {t('common.more', '更多选项 ›')}
              </Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.moreActionRow}>
              <TouchableOpacity
                style={[styles.moreLinkBtn, isSavingRecord && { opacity: 0.5 }]}
                onPress={onSaveAndAnother5Min}
                disabled={isSavingRecord}
                activeOpacity={0.7}
              >
                <Text style={[styles.moreLinkText, { color: colors.primary }]}>
                  {t('pomodoro.saveAnother5MinLink', '再来 5 分钟')}
                </Text>
              </TouchableOpacity>
              <Text style={{ color: isDark ? '#4A3B32' : '#D5C7BA', marginHorizontal: 8 }}>·</Text>
              <TouchableOpacity
                style={[styles.moreLinkBtn, isSavingRecord && { opacity: 0.5 }]}
                onPress={onSaveOnly}
                disabled={isSavingRecord}
                activeOpacity={0.7}
              >
                <Text style={[styles.moreLinkText, { color: isDark ? '#A6988D' : '#6B5B4F' }]}>
                  {t('pomodoro.saveOnlyLink', '仅记入今日专注')}
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </ScrollView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  doneContainer: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  doneScroll: {
    alignItems: 'center',
    paddingBottom: 40,
  },
  harvestVisualWrap: {
    width: 140,
    height: 140,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
    marginBottom: 8,
  },
  burstDot: {
    position: 'absolute',
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  tomatoBox: {
    width: 120,
    height: 120,
    alignItems: 'center',
    justifyContent: 'center',
  },
  harvestTitle: {
    fontSize: 22,
    fontWeight: '800',
    marginTop: 6,
    letterSpacing: -0.3,
  },
  harvestSub: {
    fontSize: 14,
    marginTop: 6,
    textAlign: 'center',
  },
  harvestTaskText: {
    fontSize: 14,
    fontWeight: '600',
    marginTop: 4,
    textAlign: 'center',
    paddingHorizontal: 16,
  },
  postCatHint: {
    fontSize: 12,
    marginTop: 18,
    marginBottom: 8,
    textAlign: 'center',
  },
  catGridDone: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    marginHorizontal: 4,
    marginBottom: 16,
  },
  catBtnDone: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    marginHorizontal: 4,
    marginVertical: 4,
  },
  catChipDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 6,
  },
  catBtnDoneText: {
    fontSize: 13,
  },
  doneBtnGroup: {
    width: '100%',
    maxWidth: 320,
    marginTop: 12,
    alignItems: 'center',
  },
  primaryGradientBtn: {
    width: '100%',
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 3,
  },
  primaryBtnText: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  secondaryBtn: {
    width: '100%',
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  secondaryBtnText: {
    fontSize: 15,
    fontWeight: '600',
  },
  moreActionToggle: {
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  moreActionToggleText: {
    fontSize: 13,
    fontWeight: '500',
  },
  moreActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  moreLinkBtn: {
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  moreLinkText: {
    fontSize: 13,
    fontWeight: '600',
  },
});
