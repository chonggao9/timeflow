import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  Modal,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Animated,
  useWindowDimensions,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Defs, LinearGradient, Stop, Rect } from 'react-native-svg';
import { WidgetPreview } from 'react-native-android-widget';

import { useI18n } from '../i18n/LanguageContext';
import { useTheme } from '../theme/ThemeContext';
import { modePalette, tripPalette } from '../../widget/widgetTheme';
import { makeStrings } from '../../widget/widgetStrings';

import {
  PomodoroWidget4x2,
  PomodoroWidget2x2,
  PomodoroWidget4x1,
  PomodoroWidgetTomato2x2,
  PomodoroWidgetDark2x2,
  PomodoroWidgetStats2x2,
} from '../../widget/widgets/PomodoroWidgets';

import {
  TravelWidget4x2,
  TravelWidget2x2,
  TravelWidget4x1,
  TravelWidgetWeek4x1,
  TravelWidgetMap2x2,
  TravelWidgetHeat2x2,
} from '../../widget/widgets/TravelWidgets';

// 双语示例数据生成器
function makeSampleData(isZh) {
  return {
    pomo: {
      mode: 'focus',
      running: true,
      status: 'focusing',
      remainingMs: 19 * 60 * 1000,
      remainingCeilMin: 19,
      totalMs: 25 * 60 * 1000,
      completedToday: 2,
      endsAtHHMM: '12:45',
      categoryName: isZh ? '深度工作' : 'Deep Work',
    },
    weekBars: {
      days: isZh ? ['四', '五', '六', '日', '一', '二', '今'] : ['Thu', 'Fri', 'Sat', 'Sun', 'Mon', 'Tue', 'Now'],
      heights: [26, 15, 34, 20, 29, 34, 12],
      values: [45, 30, 90, 40, 75, 90, 35],
      active: [false, false, false, false, false, false, true],
    },
    timeline: {
      empty: false,
      latestName: isZh ? '老街面馆午餐' : 'Noodle House',
      latestTime: '12:30',
      countText: isZh ? '1/4' : '1/4',
      weekday: isZh ? '周五' : 'Fri',
      count: 1,
      checkedCountText: isZh ? '已打卡 1/4' : 'Checked 1/4',
      rows: [
        { done: true, cur: false, name: isZh ? '到达公司' : 'Arrive Office', time: '09:02' },
        { done: false, cur: true, name: isZh ? '老街面馆午餐' : 'Noodle House', time: isZh ? '待打卡' : 'Pending' },
        { done: false, cur: false, name: isZh ? '健身房' : 'Gym Workout', time: '18:30' },
        { done: false, cur: false, name: isZh ? '回家' : 'Return Home', time: '21:00' },
      ],
    },
    weekDays: {
      days: isZh ? ['一', '二', '三', '四', '五', '六', '日'] : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
      active: [true, true, true, true, false, false, false],
      todayIdx: 4,
    },
  };
}

const sampleHeatGrid = [
  1, 0, 2, 2, 1, 0, 2,
  2, 1, 2, 2, 1, 2, 2,
  2, 1, 2, 2, 1, 2, 2,
  1, 2, 2, 0, 2, 2, 2,
];

// 动态小组件配置表（多语言支持）
function getWidgetGroups(t, s) {
  return {
    pomo: [
      {
        k: 'p42',
        size: '4×2',
        name: t('widget.item.p42.name'),
        sh: 'a',
        w: 358,
        h: 168,
        s: 0.9,
        d: t('widget.item.p42.desc'),
        pts: [t('widget.item.p42.p1'), t('widget.item.p42.p2')],
        render: ({ pal, strings }) => (
          <PomodoroWidget4x2 d={s.pomo} strings={strings} pal={pal} />
        ),
      },
      {
        k: 'p41',
        size: '4×1',
        name: t('widget.item.p41.name'),
        sh: 'b',
        w: 358,
        h: 80,
        s: 0.9,
        d: t('widget.item.p41.desc'),
        pts: [t('widget.item.p41.p1'), t('widget.item.p41.p2')],
        render: ({ pal, strings }) => (
          <PomodoroWidget4x1 d={s.pomo} strings={strings} pal={pal} />
        ),
      },
      {
        k: 'p22ring',
        size: '2×2',
        name: t('widget.item.p22ring.name'),
        sh: 'c',
        w: 170,
        h: 168,
        s: 1.08,
        d: t('widget.item.p22ring.desc'),
        pts: [t('widget.item.p22ring.p1'), t('widget.item.p22ring.p2')],
        render: ({ pal, strings }) => (
          <PomodoroWidget2x2 d={s.pomo} strings={strings} pal={pal} />
        ),
      },
      {
        k: 'p22tomato',
        size: '2×2',
        name: t('widget.item.p22tomato.name'),
        sh: 'c',
        w: 170,
        h: 168,
        s: 1.08,
        d: t('widget.item.p22tomato.desc'),
        pts: [t('widget.item.p22tomato.p1'), t('widget.item.p22tomato.p2')],
        render: ({ pal, strings }) => (
          <PomodoroWidgetTomato2x2 d={s.pomo} strings={strings} pal={pal} />
        ),
      },
      {
        k: 'p22dark',
        size: '2×2',
        name: t('widget.item.p22dark.name'),
        sh: 'c',
        w: 170,
        h: 168,
        s: 1.08,
        d: t('widget.item.p22dark.desc'),
        pts: [t('widget.item.p22dark.p1'), t('widget.item.p22dark.p2')],
        render: ({ darkPal, strings }) => (
          <PomodoroWidgetDark2x2 d={s.pomo} strings={strings} darkPal={darkPal} />
        ),
      },
      {
        k: 'p22stat',
        size: '2×2',
        name: t('widget.item.p22stat.name'),
        sh: 'c',
        w: 170,
        h: 168,
        s: 1.08,
        d: t('widget.item.p22stat.desc'),
        pts: [t('widget.item.p22stat.p1'), t('widget.item.p22stat.p2')],
        render: ({ pal, strings }) => (
          <PomodoroWidgetStats2x2
            strings={strings}
            pal={pal}
            todayMin={75}
            weekBars={s.weekBars}
          />
        ),
      },
    ],
    trip: [
      {
        k: 't42',
        size: '4×2',
        name: t('widget.item.t42.name'),
        sh: 'a',
        w: 358,
        h: 168,
        s: 0.9,
        d: t('widget.item.t42.desc'),
        pts: [t('widget.item.t42.p1'), t('widget.item.t42.p2')],
        render: ({ pal, strings }) => (
          <TravelWidget4x2 timeline={s.timeline} strings={strings} pal={pal} />
        ),
      },
      {
        k: 't41',
        size: '4×1',
        name: t('widget.item.t41.name'),
        sh: 'b',
        w: 358,
        h: 80,
        s: 0.9,
        d: t('widget.item.t41.desc'),
        pts: [t('widget.item.t41.p1'), t('widget.item.t41.p2')],
        render: ({ pal, strings }) => (
          <TravelWidget4x1 timeline={s.timeline} strings={strings} pal={pal} />
        ),
      },
      {
        k: 't41week',
        size: '4×1',
        name: t('widget.item.t41week.name'),
        sh: 'b',
        w: 358,
        h: 80,
        s: 0.9,
        d: t('widget.item.t41week.desc'),
        pts: [t('widget.item.t41week.p1'), t('widget.item.t41week.p2')],
        render: ({ darkPal, strings }) => (
          <TravelWidgetWeek4x1
            streakDays={12}
            weekDays={s.weekDays}
            strings={strings}
            darkPal={darkPal}
          />
        ),
      },
      {
        k: 't22cta',
        size: '2×2',
        name: t('widget.item.t22cta.name'),
        sh: 'c',
        w: 170,
        h: 168,
        s: 1.08,
        d: t('widget.item.t22cta.desc'),
        pts: [t('widget.item.t22cta.p1'), t('widget.item.t22cta.p2')],
        render: ({ pal, strings }) => (
          <TravelWidget2x2 timeline={s.timeline} strings={strings} pal={pal} />
        ),
      },
      {
        k: 't22map',
        size: '2×2',
        name: t('widget.item.t22map.name'),
        sh: 'c',
        w: 170,
        h: 168,
        s: 1.08,
        d: t('widget.item.t22map.desc'),
        pts: [t('widget.item.t22map.p1'), t('widget.item.t22map.p2')],
        render: ({ pal, strings, isDark }) => (
          <TravelWidgetMap2x2
            timeline={{ ...s.timeline, count: 1 }}
            strings={strings}
            pal={pal}
            isDark={isDark}
          />
        ),
      },
      {
        k: 't22heat',
        size: '2×2',
        name: t('widget.item.t22heat.name'),
        sh: 'c',
        w: 170,
        h: 168,
        s: 1.08,
        d: t('widget.item.t22heat.desc'),
        pts: [t('widget.item.t22heat.p1'), t('widget.item.t22heat.p2')],
        render: ({ darkPal, strings }) => (
          <TravelWidgetHeat2x2
            streakDays={12}
            heatGrid={sampleHeatGrid}
            strings={strings}
            darkPal={darkPal}
          />
        ),
      },
    ],
  };
}

export default function WidgetGuideModal({ visible, onClose }) {
  const { t, lang } = useI18n();
  const isZh = lang === 'zh';
  const { isDark } = useTheme();
  const { width: windowWidth } = useWindowDimensions();

  const [group, setGroup] = useState('pomo'); // 'pomo' | 'trip'
  const [idx, setIdx] = useState(0);
  const [tipOpen, setTipOpen] = useState(false);

  // 顶部分段滑块动画
  const segAnim = useRef(new Animated.Value(0)).current;

  // 横向尺寸芯片滚动引用
  const chipsScrollRef = useRef(null);
  const chipLayoutsRef = useRef({});
  const chipsViewportWidthRef = useRef(windowWidth);

  // 舞台滑动手势检测
  const touchStartXRef = useRef(null);

  const sampleData = React.useMemo(() => makeSampleData(isZh), [isZh]);
  const groups = React.useMemo(() => getWidgetGroups(t, sampleData), [t, sampleData]);
  const currentList = groups[group];
  const currentItem = currentList[idx] || currentList[0];

  // 调色板
  const pomoPal = modePalette('focus', isDark);
  const tripPal = tripPalette(isDark);
  const darkPal = modePalette('focus', true);

  // 小组件多语言字典与 App 语言动态一致
  const widgetStrings = React.useMemo(() => makeStrings(lang), [lang]);

  // 切换分组
  const handleSwitchGroup = useCallback((targetGroup) => {
    if (targetGroup === group) return;
    setGroup(targetGroup);
    setIdx(0);
    Animated.timing(segAnim, {
      toValue: targetGroup === 'pomo' ? 0 : 1,
      duration: 250,
      useNativeDriver: false,
    }).start();
  }, [group, segAnim]);

  // 切换选中项并自动平滑居中滚动到视口内
  const handleSelectIndex = useCallback((newIdx) => {
    if (newIdx < 0 || newIdx >= currentList.length) return;
    setIdx(newIdx);
    const layout = chipLayoutsRef.current[newIdx];
    if (layout && chipsScrollRef.current) {
      const scrollX = Math.max(0, layout.x - (chipsViewportWidthRef.current - layout.width) / 2);
      chipsScrollRef.current.scrollTo({ x: scrollX, animated: true });
    }
  }, [currentList.length]);

  // 监听 group 切换重置滚动位置
  useEffect(() => {
    if (chipsScrollRef.current) {
      chipsScrollRef.current.scrollTo({ x: 0, animated: false });
    }
  }, [group]);

  // 舞台背景渐变色
  const stageGradColors = group === 'pomo'
    ? (isDark ? ['#3D2A24', '#34221D', '#2B1C17'] : ['#F8E8D8', '#F3D5C5', '#E8C7C0'])
    : (isDark ? ['#1E352B', '#182C23', '#14241D'] : ['#E2F0E7', '#D3E8DC', '#C8E0D2']);

  const accentColor = group === 'pomo' ? '#C23128' : '#17805A';

  const styles = makeStyles(isDark, accentColor);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.safeArea}>
        {/* 1. 顶栏：不透明独立页面，带返回键 */}
        <View style={styles.topHeader}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel={isZh ? '返回' : 'Back'}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Ionicons name="chevron-back" size={24} color={isDark ? '#FBEFE4' : '#2A211B'} />
          </TouchableOpacity>
          <Text style={styles.pageTitle}>{t('widget.guideTitle', '桌面小组件')}</Text>
          <View style={styles.backButtonPlaceholder} />
        </View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* 说明文字 */}
          <Text style={styles.introText}>
            {t('widget.guideSubtitle', '两个独立的小组件，挑顺手的尺寸放到桌面。')}
          </Text>

          {/* 2. 顶部分段滑块切换 */}
          <View
            style={styles.segContainer}
            onLayout={(e) => {
              const w = e.nativeEvent.layout.width;
              chipsViewportWidthRef.current = w;
            }}
          >
            <Animated.View
              style={[
                styles.segPill,
                {
                  transform: [
                    {
                      translateX: segAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0, (windowWidth - 32 - 8) / 2],
                      }),
                    },
                  ],
                },
              ]}
            />
            <TouchableOpacity
              style={styles.segTab}
              onPress={() => handleSwitchGroup('pomo')}
              activeOpacity={0.8}
            >
              <Ionicons
                name="timer-outline"
                size={18}
                color={group === 'pomo' ? '#C23128' : (isDark ? '#A6988D' : '#6B5B50')}
                style={{ marginRight: 6 }}
              />
              <Text style={[styles.segTabText, group === 'pomo' && styles.segTabTextPomoActive]}>
                {t('widget.tabPomodoro', '番茄专注')}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.segTab}
              onPress={() => handleSwitchGroup('trip')}
              activeOpacity={0.8}
            >
              <Ionicons
                name="navigate-outline"
                size={18}
                color={group === 'trip' ? '#17805A' : (isDark ? '#A6988D' : '#6B5B50')}
                style={{ marginRight: 6 }}
              />
              <Text style={[styles.segTabText, group === 'trip' && styles.segTabTextTripActive]}>
                {t('widget.tabTravel', '行程打卡')}
              </Text>
            </TouchableOpacity>
          </View>

          {/* 3 & 4. 预览舞台（渐变背景 + 真实组件缩放展示 + 左右切换与手势） */}
          <View
            style={styles.stage}
            onTouchStart={(e) => {
              touchStartXRef.current = e.nativeEvent.pageX;
            }}
            onTouchEnd={(e) => {
              if (touchStartXRef.current === null) return;
              const dx = e.nativeEvent.pageX - touchStartXRef.current;
              touchStartXRef.current = null;
              if (Math.abs(dx) > 40) {
                if (dx < 0 && idx < currentList.length - 1) {
                  handleSelectIndex(idx + 1);
                } else if (dx > 0 && idx > 0) {
                  handleSelectIndex(idx - 1);
                }
              }
            }}
          >
            {/* SVG 渐变背景 */}
            <Svg style={StyleSheet.absoluteFill} width="100%" height="100%">
              <Defs>
                <LinearGradient id="guideStageGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <Stop offset="0%" stopColor={stageGradColors[0]} />
                  <Stop offset="55%" stopColor={stageGradColors[1]} />
                  <Stop offset="100%" stopColor={stageGradColors[2]} />
                </LinearGradient>
              </Defs>
              <Rect width="100%" height="100%" fill="url(#guideStageGrad)" rx={28} />
            </Svg>

            {/* 居中真实组件预览 */}
            <View style={styles.stageInnerCenter}>
              <View
                style={{
                  width: currentItem.w * currentItem.s,
                  height: currentItem.h * currentItem.s,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <View
                  style={{
                    width: currentItem.w,
                    height: currentItem.h,
                    transform: [{ scale: currentItem.s }],
                  }}
                >
                  <WidgetPreview
                    key={`${currentItem.k}-${isDark}`}
                    renderWidget={() =>
                      currentItem.render({
                        isDark,
                        strings: widgetStrings,
                        pal: group === 'pomo' ? pomoPal : tripPal,
                        darkPal,
                      })
                    }
                    width={currentItem.w}
                    height={currentItem.h}
                  />
                </View>
              </View>
            </View>

            {/* 舞台底部：左右箭头与计数器 */}
            <TouchableOpacity
              style={[styles.arrowBtn, styles.arrowLeft, idx === 0 && styles.arrowDisabled]}
              disabled={idx === 0}
              onPress={() => handleSelectIndex(idx - 1)}
              activeOpacity={0.7}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Ionicons name="chevron-back" size={20} color={isDark ? '#FBEFE4' : '#2A211B'} />
            </TouchableOpacity>

            <View style={styles.counterBadge}>
              <Text style={styles.counterText}>
                {idx + 1} / {currentList.length}
              </Text>
            </View>

            <TouchableOpacity
              style={[
                styles.arrowBtn,
                styles.arrowRight,
                idx === currentList.length - 1 && styles.arrowDisabled,
              ]}
              disabled={idx === currentList.length - 1}
              onPress={() => handleSelectIndex(idx + 1)}
              activeOpacity={0.7}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Ionicons name="chevron-forward" size={20} color={isDark ? '#FBEFE4' : '#2A211B'} />
            </TouchableOpacity>
          </View>

          {/* 5. 尺寸芯片（横向滚动，带形状图标） */}
          <ScrollView
            ref={chipsScrollRef}
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.chipsScroll}
            contentContainerStyle={styles.chipsContent}
          >
            {currentList.map((item, i) => {
              const isSelected = i === idx;
              return (
                <TouchableOpacity
                  key={item.k}
                  style={[styles.chip, isSelected && styles.chipSelected]}
                  onPress={() => handleSelectIndex(i)}
                  activeOpacity={0.8}
                  onLayout={(e) => {
                    chipLayoutsRef.current[i] = e.nativeEvent.layout;
                  }}
                >
                  <View
                    style={[
                      styles.shapeIcon,
                      styles[`shape_${item.sh}`],
                      isSelected && styles.shapeSelected,
                    ]}
                  />
                  <Text style={[styles.chipText, isSelected && styles.chipTextSelected]}>
                    {item.size} {item.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* 6. 信息卡：名称 + 尺寸徽标 + 一句说明 + 两条要点 */}
          <View style={styles.infoCard}>
            <View style={styles.infoHeader}>
              <Text style={styles.infoTitle}>{currentItem.name}</Text>
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{currentItem.size}</Text>
              </View>
            </View>
            <Text style={styles.infoDesc}>{currentItem.d}</Text>
            <View style={styles.pointsList}>
              {currentItem.pts.map((pt, pIdx) => (
                <View key={pIdx} style={styles.pointRow}>
                  <Ionicons
                    name="checkmark-circle"
                    size={16}
                    color={accentColor}
                    style={{ marginTop: 2, marginRight: 8 }}
                  />
                  <Text style={styles.pointText}>{pt}</Text>
                </View>
              ))}
            </View>
          </View>

          {/* 7. 添加到桌面（三步连线串联） */}
          <Text style={styles.sectionHeaderTitle}>
            {t('widget.howToAdd', '添加到桌面')}
          </Text>
          <View style={styles.stepsCard}>
            <View style={styles.stepItem}>
              <View style={styles.stepCircle}>
                <Text style={styles.stepNum}>1</Text>
              </View>
              <View style={styles.stepLine} />
              <View style={styles.stepContent}>
                <Text style={styles.stepMain}>{t('widget.step1Title')}</Text>
                <Text style={styles.stepSub}>{t('widget.step1Desc')}</Text>
              </View>
            </View>

            <View style={styles.stepItem}>
              <View style={styles.stepCircle}>
                <Text style={styles.stepNum}>2</Text>
              </View>
              <View style={styles.stepLine} />
              <View style={styles.stepContent}>
                <Text style={styles.stepMain}>{t('widget.step2Title')}</Text>
                <Text style={styles.stepSub}>{t('widget.step2Desc')}</Text>
              </View>
            </View>

            <View style={[styles.stepItem, { paddingBottom: 0 }]}>
              <View style={styles.stepCircle}>
                <Text style={styles.stepNum}>3</Text>
              </View>
              <View style={styles.stepContent}>
                <Text style={styles.stepMain}>{t('widget.step3Title')}</Text>
                <Text style={styles.stepSub}>{t('widget.step3Desc')}</Text>
              </View>
            </View>
          </View>

          {/* 7. 省电提示（默认折叠，点击展开） */}
          <TouchableOpacity
            style={styles.tipCard}
            onPress={() => setTipOpen(!tipOpen)}
            activeOpacity={0.8}
          >
            <View style={styles.tipHeader}>
              <Ionicons
                name="battery-charging-outline"
                size={20}
                color={isDark ? '#F5B85A' : '#8F5608'}
                style={{ marginRight: 8 }}
              />
              <Text style={styles.tipTitle}>
                {t('widget.batteryTipTitle', '倒计时不准时怎么办')}
              </Text>
              <Ionicons
                name={tipOpen ? 'chevron-down' : 'chevron-forward'}
                size={18}
                color={isDark ? '#F5B85A' : '#8F5608'}
              />
            </View>
            {tipOpen && (
              <Text style={styles.tipBody}>
                {t(
                  'widget.batteryTipBody',
                  '部分手机系统会清理后台。请在「设置 → 应用管理 → TimeFlow」里开启「允许自启动」，并关闭电池优化，番茄结束提醒才会准时。'
                )}
              </Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

function makeStyles(isDark, accentColor) {
  const bg = isDark ? '#1C1613' : '#FAF5EE';
  const cardBg = isDark ? '#261F1A' : '#FFFFFF';
  const ink = isDark ? '#FBEFE4' : '#2A211B';
  const sub = isDark ? '#D9C9BA' : '#6B5B50';
  const segBg = isDark ? '#2A221C' : '#EFE5DA';
  const segPillBg = isDark ? '#3D322B' : '#FFFFFF';
  const borderLine = isDark ? '#3A3029' : '#F0E6DA';

  return StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: bg,
    },
    topHeader: {
      height: 56,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 8,
      backgroundColor: bg,
    },
    backButton: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
    },
    backButtonPlaceholder: {
      width: 44,
      height: 44,
    },
    pageTitle: {
      fontSize: 17,
      fontWeight: '700',
      color: ink,
    },
    scrollView: {
      flex: 1,
    },
    scrollContent: {
      paddingHorizontal: 16,
      paddingTop: 4,
      paddingBottom: 48, // 留足底部内边距，小屏幕完全可见
    },
    introText: {
      fontSize: 13,
      lineHeight: 19,
      color: sub,
      marginHorizontal: 4,
      marginBottom: 14,
    },

    // 分段滑块
    segContainer: {
      position: 'relative',
      flexDirection: 'row',
      height: 52,
      padding: 4,
      borderRadius: 26,
      backgroundColor: segBg,
      marginBottom: 14,
    },
    segPill: {
      position: 'absolute',
      top: 4,
      left: 4,
      width: '50%',
      height: 44,
      borderRadius: 22,
      backgroundColor: segPillBg,
      elevation: 2,
      shadowColor: '#5F3E20',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.16,
      shadowRadius: 6,
    },
    segTab: {
      flex: 1,
      height: 44,
      borderRadius: 22,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1,
    },
    segTabText: {
      fontSize: 14,
      fontWeight: '500',
      color: sub,
    },
    segTabTextPomoActive: {
      color: '#C23128',
      fontWeight: '700',
    },
    segTabTextTripActive: {
      color: '#17805A',
      fontWeight: '700',
    },

    // 预览舞台
    stage: {
      position: 'relative',
      height: 270,
      borderRadius: 28,
      overflow: 'hidden',
      marginBottom: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    stageInnerCenter: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 62, // 避让底部箭头与计数器
      alignItems: 'center',
      justifyContent: 'center',
    },
    arrowBtn: {
      position: 'absolute',
      bottom: 12,
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: isDark ? 'rgba(42, 33, 27, 0.85)' : 'rgba(255, 253, 250, 0.85)',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 2,
    },
    arrowLeft: {
      left: 12,
    },
    arrowRight: {
      right: 12,
    },
    arrowDisabled: {
      opacity: 0.35,
    },
    counterBadge: {
      position: 'absolute',
      bottom: 20,
      paddingHorizontal: 12,
      paddingVertical: 4,
      borderRadius: 12,
      backgroundColor: 'rgba(42, 33, 27, 0.65)',
      zIndex: 2,
    },
    counterText: {
      color: '#FFFFFF',
      fontSize: 12,
      fontWeight: '600',
    },

    // 尺寸芯片横向滚动
    chipsScroll: {
      marginHorizontal: -16,
      marginBottom: 10,
    },
    chipsContent: {
      paddingHorizontal: 16,
      paddingVertical: 4,
      gap: 8,
    },
    chip: {
      height: 44,
      paddingHorizontal: 14,
      borderRadius: 22,
      backgroundColor: cardBg,
      borderWidth: 1.5,
      borderColor: borderLine,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    chipSelected: {
      backgroundColor: isDark ? '#FBEFE4' : '#2A211B',
      borderColor: 'transparent',
    },
    chipText: {
      fontSize: 13,
      fontWeight: '500',
      color: sub,
    },
    chipTextSelected: {
      color: isDark ? '#241D19' : '#FBEFE4',
      fontWeight: '700',
    },
    shapeIcon: {
      borderWidth: 1.6,
      borderColor: sub,
    },
    shapeSelected: {
      borderColor: isDark ? '#241D19' : '#FBEFE4',
    },
    shape_a: {
      width: 18,
      height: 10,
      borderRadius: 2.5,
    },
    shape_b: {
      width: 18,
      height: 6,
      borderRadius: 2,
    },
    shape_c: {
      width: 11,
      height: 11,
      borderRadius: 2.5,
    },

    // 信息卡
    infoCard: {
      backgroundColor: cardBg,
      borderRadius: 20,
      paddingHorizontal: 18,
      paddingVertical: 16,
      marginBottom: 20,
      elevation: 2,
      shadowColor: '#5F3E20',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.08,
      shadowRadius: 10,
    },
    infoHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    infoTitle: {
      fontSize: 17,
      fontWeight: '700',
      color: ink,
    },
    badge: {
      paddingHorizontal: 9,
      paddingVertical: 2,
      borderRadius: 10,
      backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : (accentColor === '#C23128' ? '#FDE6E1' : '#DCF3E8'),
    },
    badgeText: {
      fontSize: 12,
      fontWeight: '700',
      color: accentColor,
    },
    infoDesc: {
      fontSize: 13,
      lineHeight: 20,
      color: sub,
      marginTop: 8,
      marginBottom: 10,
    },
    pointsList: {
      gap: 6,
    },
    pointRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
    },
    pointText: {
      flex: 1,
      fontSize: 13,
      lineHeight: 19,
      color: ink,
    },

    // 步骤卡
    sectionHeaderTitle: {
      fontSize: 13,
      fontWeight: '700',
      color: sub,
      marginHorizontal: 4,
      marginBottom: 8,
    },
    stepsCard: {
      backgroundColor: cardBg,
      borderRadius: 20,
      padding: 18,
      marginBottom: 14,
      elevation: 2,
      shadowColor: '#5F3E20',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.08,
      shadowRadius: 10,
    },
    stepItem: {
      position: 'relative',
      flexDirection: 'row',
      alignItems: 'flex-start',
      paddingBottom: 16,
    },
    stepCircle: {
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: '#D63B32',
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 14,
      zIndex: 1,
    },
    stepNum: {
      color: '#FFFFFF',
      fontSize: 13,
      fontWeight: '700',
    },
    stepLine: {
      position: 'absolute',
      left: 13,
      top: 26,
      bottom: 0,
      width: 2,
      backgroundColor: isDark ? '#4A342F' : '#F1C9C3',
    },
    stepContent: {
      flex: 1,
    },
    stepMain: {
      fontSize: 14,
      fontWeight: '700',
      color: ink,
      lineHeight: 20,
    },
    stepSub: {
      fontSize: 12,
      color: sub,
      marginTop: 2,
      lineHeight: 18,
    },

    // 省电提示
    tipCard: {
      borderRadius: 18,
      backgroundColor: isDark ? '#2D2316' : '#FFF3D6',
      paddingHorizontal: 16,
      paddingVertical: 14,
    },
    tipHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    tipTitle: {
      flex: 1,
      fontSize: 14,
      fontWeight: '700',
      color: isDark ? '#F5B85A' : '#6B4306',
    },
    tipBody: {
      fontSize: 13,
      lineHeight: 20,
      color: isDark ? '#E5C492' : '#6B4306',
      marginTop: 10,
    },
  });
}
