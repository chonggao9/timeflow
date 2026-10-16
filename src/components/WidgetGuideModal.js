import React, { useState } from 'react';
import {
  View,
  Text,
  Modal,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useI18n } from '../i18n/LanguageContext';
import { useTheme } from '../theme/ThemeContext';
import { refreshAllWidgets } from '../utils/widgetRefresh';
import { radius } from '../theme';

export default function WidgetGuideModal({ visible, onClose }) {
  const { t } = useI18n();
  const { colors, isDark } = useTheme();
  const [activeTab, setActiveTab] = useState('pomodoro'); // 'pomodoro' | 'travel'
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await refreshAllWidgets();
      Alert.alert(t('common.tip', '提示'), t('widget.refreshDone'));
    } catch (e) {
      // 静默处理
    } finally {
      setRefreshing(false);
    }
  };

  const styles = makeStyles(colors, isDark);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.container}>
          {/* 顶栏 */}
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>{t('widget.guideTitle')}</Text>
              <Text style={styles.subtitle}>{t('widget.guideSubtitle')}</Text>
            </View>
            <TouchableOpacity style={styles.closeBtn} onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close" size={22} color={colors.ink2} />
            </TouchableOpacity>
          </View>

          {/* 分段 Tab */}
          <View style={styles.tabBar}>
            <TouchableOpacity
              style={[styles.tabItem, activeTab === 'pomodoro' && styles.tabItemActive]}
              onPress={() => setActiveTab('pomodoro')}
            >
              <Ionicons
                name="timer-outline"
                size={16}
                color={activeTab === 'pomodoro' ? colors.primaryStrong : colors.ink3}
              />
              <Text style={[styles.tabText, activeTab === 'pomodoro' && styles.tabTextActive]}>
                {t('widget.tabPomodoro')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tabItem, activeTab === 'travel' && styles.tabItemActive]}
              onPress={() => setActiveTab('travel')}
            >
              <Ionicons
                name="navigate-outline"
                size={16}
                color={activeTab === 'travel' ? colors.primaryStrong : colors.ink3}
              />
              <Text style={[styles.tabText, activeTab === 'travel' && styles.tabTextActive]}>
                {t('widget.tabTravel')}
              </Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
            {/* 组件卡片与尺寸介绍 */}
            {activeTab === 'pomodoro' ? (
              <View style={styles.section}>
                <View style={styles.cardPreview}>
                  <View style={styles.previewHeader}>
                    <View style={[styles.badge, { backgroundColor: isDark ? '#3A302A' : '#FDE6E1' }]}>
                      <Text style={[styles.badgeText, { color: isDark ? '#FF7A6E' : '#C23128' }]}>4×2 完整版</Text>
                    </View>
                    <Text style={styles.cardDesc}>大圆环进度 + 模式切换（专注/短休/长休）+ 开始/重置</Text>
                  </View>
                </View>

                <View style={styles.cardPreview}>
                  <View style={styles.previewHeader}>
                    <View style={[styles.badge, { backgroundColor: isDark ? '#3A302A' : '#FDE6E1' }]}>
                      <Text style={[styles.badgeText, { color: isDark ? '#FF7A6E' : '#C23128' }]}>4×1 迷你条</Text>
                    </View>
                    <Text style={styles.cardDesc}>极简紧凑：剩余时刻 + 胶囊进度条 + 快捷开始/暂停</Text>
                  </View>
                </View>

                <View style={styles.cardPreview}>
                  <View style={styles.previewHeader}>
                    <View style={[styles.badge, { backgroundColor: isDark ? '#3A302A' : '#FDE6E1' }]}>
                      <Text style={[styles.badgeText, { color: isDark ? '#FF7A6E' : '#C23128' }]}>2×2 圆环版</Text>
                    </View>
                    <Text style={styles.cardDesc}>高辨识度居中大圆环，整卡盲操轻按即开始/暂停</Text>
                  </View>
                </View>

                <View style={styles.cardPreview}>
                  <View style={styles.previewHeader}>
                    <View style={[styles.badge, { backgroundColor: isDark ? '#3A302A' : '#FDE6E1' }]}>
                      <Text style={[styles.badgeText, { color: isDark ? '#FF7A6E' : '#C23128' }]}>2×2 番茄卡</Text>
                    </View>
                    <Text style={styles.cardDesc}>拟物番茄图形与灌满进度，下方大字显示倒计时</Text>
                  </View>
                </View>

                <View style={styles.cardPreview}>
                  <View style={styles.previewHeader}>
                    <View style={[styles.badge, { backgroundColor: '#3A302A' }]}>
                      <Text style={[styles.badgeText, { color: '#FF7A6E' }]}>2×2 深色大字</Text>
                    </View>
                    <Text style={styles.cardDesc}>纯黑 OLED 质感：超大数字 + 底部四番茄循环点</Text>
                  </View>
                </View>

                <View style={styles.cardPreview}>
                  <View style={styles.previewHeader}>
                    <View style={[styles.badge, { backgroundColor: isDark ? '#3A302A' : '#FDE6E1' }]}>
                      <Text style={[styles.badgeText, { color: isDark ? '#FF7A6E' : '#C23128' }]}>2×2 今日统计</Text>
                    </View>
                    <Text style={styles.cardDesc}>今日专注累计时长与过去 7 天专注柱状趋势图</Text>
                  </View>
                </View>
              </View>
            ) : (
              <View style={styles.section}>
                <View style={styles.cardPreview}>
                  <View style={styles.previewHeader}>
                    <View style={[styles.badge, { backgroundColor: isDark ? '#3A302A' : '#DCF3E8' }]}>
                      <Text style={[styles.badgeText, { color: isDark ? '#4FD6A0' : '#17805A' }]}>4×2 今日行程</Text>
                    </View>
                    <Text style={styles.cardDesc}>左侧圆形一键打卡按钮 + 右侧今日打卡足迹时间轴</Text>
                  </View>
                </View>

                <View style={styles.cardPreview}>
                  <View style={styles.previewHeader}>
                    <View style={[styles.badge, { backgroundColor: isDark ? '#3A302A' : '#DCF3E8' }]}>
                      <Text style={[styles.badgeText, { color: isDark ? '#4FD6A0' : '#17805A' }]}>4×1 下一站</Text>
                    </View>
                    <Text style={styles.cardDesc}>横向通栏：最近一站地点名称 + 右侧一键打卡按钮</Text>
                  </View>
                </View>

                <View style={styles.cardPreview}>
                  <View style={styles.previewHeader}>
                    <View style={[styles.badge, { backgroundColor: '#3A302A' }]}>
                      <Text style={[styles.badgeText, { color: '#4FD6A0' }]}>4×1 本周连续</Text>
                    </View>
                    <Text style={styles.cardDesc}>左侧连续打卡天数 + 右侧周一至周日 7 天圆圈打卡状态</Text>
                  </View>
                </View>

                <View style={styles.cardPreview}>
                  <View style={styles.previewHeader}>
                    <View style={[styles.badge, { backgroundColor: isDark ? '#3A302A' : '#DCF3E8' }]}>
                      <Text style={[styles.badgeText, { color: isDark ? '#4FD6A0' : '#17805A' }]}>2×2 一键打卡</Text>
                    </View>
                    <Text style={styles.cardDesc}>大号圆形打卡按钮，整卡轻触一键记录当前位置</Text>
                  </View>
                </View>

                <View style={styles.cardPreview}>
                  <View style={styles.previewHeader}>
                    <View style={[styles.badge, { backgroundColor: isDark ? '#3A302A' : '#DCF3E8' }]}>
                      <Text style={[styles.badgeText, { color: isDark ? '#4FD6A0' : '#17805A' }]}>2×2 足迹地图</Text>
                    </View>
                    <Text style={styles.cardDesc}>微缩地图矢量折线背景，清晰显示今日打卡足迹点</Text>
                  </View>
                </View>

                <View style={styles.cardPreview}>
                  <View style={styles.previewHeader}>
                    <View style={[styles.badge, { backgroundColor: '#3A302A' }]}>
                      <Text style={[styles.badgeText, { color: '#4FD6A0' }]}>2×2 打卡热力</Text>
                    </View>
                    <Text style={styles.cardDesc}>连续天数大字 + 过去四周 28 格多色阶打卡活跃度热力图</Text>
                  </View>
                </View>
              </View>
            )}

            {/* 添加步骤 */}
            <View style={styles.stepsCard}>
              <Text style={styles.sectionTitle}>{t('widget.howToAdd')}</Text>
              <View style={styles.stepRow}>
                <View style={styles.stepNum}><Text style={styles.stepNumText}>1</Text></View>
                <Text style={styles.stepText}>{t('widget.step1')}</Text>
              </View>
              <View style={styles.stepRow}>
                <View style={styles.stepNum}><Text style={styles.stepNumText}>2</Text></View>
                <Text style={styles.stepText}>{t('widget.step2')}</Text>
              </View>
              <View style={styles.stepRow}>
                <View style={styles.stepNum}><Text style={styles.stepNumText}>3</Text></View>
                <Text style={styles.stepText}>{t('widget.step3')}</Text>
              </View>
            </View>

            {/* 后台省电保活提示 */}
            <View style={styles.batteryCard}>
              <View style={styles.batteryHeader}>
                <Ionicons name="battery-charging-outline" size={18} color="#D97706" />
                <Text style={styles.batteryTitle}>{t('widget.batteryTipTitle')}</Text>
              </View>
              <Text style={styles.batteryBody}>{t('widget.batteryTipBody')}</Text>
            </View>

            {/* 刷新组件按钮 */}
            <TouchableOpacity
              style={styles.refreshBtn}
              onPress={handleRefresh}
              disabled={refreshing}
            >
              <Ionicons name="refresh" size={18} color="#FFFFFF" />
              <Text style={styles.refreshBtnText}>
                {refreshing ? '正在刷新…' : t('widget.refreshBtn')}
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function makeStyles(colors, isDark) {
  return StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.45)',
      justifyContent: 'flex-end',
    },
    container: {
      backgroundColor: colors.bgCard,
      borderTopLeftRadius: 28,
      borderTopRightRadius: 28,
      maxHeight: '85%',
      paddingTop: 20,
      paddingHorizontal: 20,
      paddingBottom: 24,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      marginBottom: 16,
    },
    title: {
      fontSize: 18,
      fontWeight: '700',
      color: colors.ink,
    },
    subtitle: {
      fontSize: 13,
      color: colors.ink3,
      marginTop: 2,
    },
    closeBtn: {
      padding: 4,
    },
    tabBar: {
      flexDirection: 'row',
      backgroundColor: colors.bgField || (isDark ? '#2A211B' : '#F4EBE1'),
      borderRadius: 14,
      padding: 4,
      marginBottom: 16,
    },
    tabItem: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 8,
      borderRadius: 10,
      gap: 6,
    },
    tabItemActive: {
      backgroundColor: colors.bgCard,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.1,
      shadowRadius: 2,
      elevation: 2,
    },
    tabText: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.ink3,
    },
    tabTextActive: {
      color: colors.primaryStrong,
    },
    scroll: {
      flexGrow: 0,
    },
    scrollContent: {
      paddingBottom: 16,
    },
    section: {
      gap: 10,
      marginBottom: 18,
    },
    cardPreview: {
      backgroundColor: colors.bgField || (isDark ? '#2A211B' : '#F9F4EE'),
      borderRadius: 16,
      padding: 12,
    },
    previewHeader: {
      gap: 6,
    },
    badge: {
      alignSelf: 'flex-start',
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 8,
    },
    badgeText: {
      fontSize: 12,
      fontWeight: '700',
    },
    cardDesc: {
      fontSize: 13,
      lineHeight: 18,
      color: colors.ink2,
    },
    stepsCard: {
      backgroundColor: colors.bgField || (isDark ? '#2A211B' : '#F9F4EE'),
      borderRadius: 16,
      padding: 14,
      marginBottom: 14,
      gap: 10,
    },
    sectionTitle: {
      fontSize: 14,
      fontWeight: '700',
      color: colors.ink,
      marginBottom: 4,
    },
    stepRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    stepNum: {
      width: 20,
      height: 20,
      borderRadius: 10,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    stepNumText: {
      color: '#FFFFFF',
      fontSize: 11,
      fontWeight: '700',
    },
    stepText: {
      flex: 1,
      fontSize: 13,
      color: colors.ink2,
      lineHeight: 18,
    },
    batteryCard: {
      backgroundColor: isDark ? 'rgba(217, 119, 6, 0.12)' : '#FEF3C7',
      borderRadius: 16,
      padding: 14,
      marginBottom: 18,
      gap: 6,
    },
    batteryHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    batteryTitle: {
      fontSize: 13,
      fontWeight: '700',
      color: isDark ? '#F59E0B' : '#B45309',
    },
    batteryBody: {
      fontSize: 12,
      lineHeight: 17,
      color: isDark ? '#D97706' : '#92400E',
    },
    refreshBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.primaryStrong,
      height: 44,
      borderRadius: 22,
      gap: 8,
    },
    refreshBtnText: {
      color: '#FFFFFF',
      fontSize: 14,
      fontWeight: '700',
    },
  });
}
