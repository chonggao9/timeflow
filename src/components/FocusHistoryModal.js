import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TouchableWithoutFeedback,
  ScrollView,
  Platform,
  Alert,
  TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeContext';
import { useI18n } from '../i18n/LanguageContext';
import { formatDuration, formatTime, UNNAMED, isPlaceholderName } from '../utils/stats';

// 6 大分类与设计稿保持色彩一致
export const FOCUS_CATEGORIES = [
  { key: 'pomodoro.helpWork', label: '工作', color: '#3B6FD6' },
  { key: 'pomodoro.helpStudy', label: '学习', color: '#D63B3B' },
  { key: 'pomodoro.helpCreate', label: '创作', color: '#E58A1F' },
  { key: 'pomodoro.helpBodyMind', label: '身心', color: '#2E9E6B' },
  { key: 'pomodoro.helpLife', label: '生活', color: '#2B8FB5' },
  { key: 'pomodoro.helpPlan', label: '规划复盘', color: '#7B5BC4' },
];

export const UNNAMED_COLOR = '#B9A99D';

export function getCategoryMeta(catKey, t) {
  const match = FOCUS_CATEGORIES.find(c => c.key === catKey || c.label === catKey);
  if (match) {
    return {
      color: match.color,
      name: t ? t(match.key) : match.label,
      key: match.key,
    };
  }
  return {
    color: UNNAMED_COLOR,
    name: t ? t('common.unnamed') : '未命名',
    key: null,
  };
}

export default function FocusHistoryModal({
  visible,
  onClose,
  records = [], // 仅今日 focus 记录
  onUpdateRecord,
  onDeleteRecord,
}) {
  const { colors } = useTheme();
  const { t, lang } = useI18n();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [editItem, setEditItem] = useState(null);
  const [draftCat, setDraftCat] = useState(null);
  const [draftName, setDraftName] = useState('');

  // 1. 过滤并倒序排序今日 focus 记录
  const sortedRecords = useMemo(() => {
    return [...records].sort((a, b) => b.timestamp - a.timestamp);
  }, [records]);

  // 2. 统计数据：总次数、总时长、最长一次
  const totalCount = sortedRecords.length;
  const totalSec = sortedRecords.reduce((sum, r) => sum + (Number(r.duration) || 0), 0);
  const maxSec = sortedRecords.reduce((max, r) => Math.max(max, Number(r.duration) || 0), 0) || 1;

  // 3. 用途分布计算（按分类归集时长）
  const distribution = useMemo(() => {
    if (!totalSec) return [];
    const map = {};
    for (const r of sortedRecords) {
      const catKey = r.category || (isPlaceholderName(r.locationName) ? null : r.locationName);
      const meta = getCategoryMeta(catKey, t);
      const key = meta.key || 'unnamed';
      if (!map[key]) {
        map[key] = {
          name: meta.name,
          color: meta.color,
          sec: 0,
        };
      }
      map[key].sec += Number(r.duration) || 0;
    }
    return Object.values(map)
      .map(item => ({
        ...item,
        percent: Math.max(3, Math.round((item.sec / totalSec) * 100)),
      }))
      .sort((a, b) => b.sec - a.sec);
  }, [sortedRecords, totalSec, t]);

  const openEdit = (record) => {
    setEditItem(record);
    setDraftCat(record.category || null);
    setDraftName(isPlaceholderName(record.locationName) ? '' : record.locationName || '');
  };

  const closeEdit = () => {
    setEditItem(null);
    setDraftCat(null);
    setDraftName('');
  };

  const handleSaveEdit = async () => {
    if (!editItem) return;
    const catItem = FOCUS_CATEGORIES.find(c => c.key === draftCat);
    const catName = catItem ? t(catItem.key) : null;
    const fallbackName = draftName.trim() || catName || t('common.unnamed');

    if (onUpdateRecord) {
      await onUpdateRecord(editItem.id, {
        category: draftCat || null,
        locationName: fallbackName,
      });
    }
    closeEdit();
  };

  const handleDelete = () => {
    if (!editItem) return;
    Alert.alert(t('home.deleteTitle'), t('home.deleteBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: async () => {
          if (onDeleteRecord) await onDeleteRecord(editItem.id);
          closeEdit();
        },
      },
    ]);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.overlay}>
          <TouchableWithoutFeedback>
            <View style={styles.sheet}>
              {/* Handle */}
              <View style={styles.handle} />

              {/* Title & Close */}
              <View style={styles.headerRow}>
                <Text style={styles.title}>{t('focusHistory.title')}</Text>
                <TouchableOpacity
                  style={styles.closeBtn}
                  onPress={onClose}
                  activeOpacity={0.7}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons name="close" size={20} color="#5C4B43" />
                </TouchableOpacity>
              </View>

              {/* 1. 汇总卡片 (3 列) */}
              <View style={styles.summaryCard}>
                <View style={styles.sumCol}>
                  <Text style={styles.sumValue}>{totalCount}</Text>
                  <Text style={styles.sumLabel}>{t('focusHistory.count')}</Text>
                </View>
                <View style={[styles.sumCol, styles.sumColBorder]}>
                  <Text style={styles.sumValue}>{formatDuration(totalSec, lang)}</Text>
                  <Text style={styles.sumLabel}>{t('focusHistory.total')}</Text>
                </View>
                <View style={styles.sumCol}>
                  <Text style={styles.sumValue}>
                    {totalCount > 0 ? formatDuration(maxSec, lang) : '--'}
                  </Text>
                  <Text style={styles.sumLabel}>{t('focusHistory.longest')}</Text>
                </View>
              </View>

              {/* 2. 用途分布色彩条 + 图例 */}
              {distribution.length > 0 && (
                <View style={styles.distWrap}>
                  <View style={styles.distBar}>
                    {distribution.map((d, idx) => (
                      <View
                        key={'dist-bar-' + idx}
                        style={{
                          width: `${d.percent}%`,
                          backgroundColor: d.color,
                          height: '100%',
                        }}
                      />
                    ))}
                  </View>
                  <View style={styles.legendRow}>
                    {distribution.map((d, idx) => (
                      <View key={'legend-' + idx} style={styles.legendItem}>
                        <View style={[styles.legendBox, { backgroundColor: d.color }]} />
                        <Text style={styles.legendText}>
                          {d.name} {formatDuration(d.sec, lang)}
                        </Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}

              {/* 3. 记录倒序列表 */}
              <ScrollView style={styles.listScroll} showsVerticalScrollIndicator={false}>
                {sortedRecords.length === 0 ? (
                  <View style={styles.emptyWrap}>
                    <Text style={styles.emptyText}>{t('focusHistory.empty')}</Text>
                  </View>
                ) : (
                  sortedRecords.map((r) => {
                    const durSec = Number(r.duration) || 0;
                    const catMeta = getCategoryMeta(r.category, t);
                    const isPending = !r.category && isPlaceholderName(r.locationName);
                    const barWidth = Math.max(4, Math.round((durSec / maxSec) * 100));
                    const displayName = isPending
                      ? t('focusHistory.unnamedFocus')
                      : (isPlaceholderName(r.locationName) ? catMeta.name : r.locationName);

                    return (
                      <View key={r.id} style={styles.recordRow}>
                        <Text style={styles.recordTime}>{formatTime(r.timestamp)}</Text>
                        <TouchableOpacity
                          style={[
                            styles.recordCard,
                            isPending ? styles.recordCardPending : styles.recordCardNormal,
                          ]}
                          onPress={() => openEdit(r)}
                          activeOpacity={0.7}
                        >
                          <View style={styles.recordHeader}>
                            <View
                              style={[
                                styles.recordDot,
                                { backgroundColor: isPending ? UNNAMED_COLOR : catMeta.color },
                              ]}
                            />
                            <Text
                              style={[
                                styles.recordTitle,
                                isPending && styles.recordTitlePending,
                              ]}
                              numberOfLines={1}
                            >
                              {displayName}
                            </Text>

                            {isPending && (
                              <View style={styles.pendingBadge}>
                                <Text style={styles.pendingBadgeText}>
                                  {t('focusHistory.needCategory')}
                                </Text>
                              </View>
                            )}

                            <Text style={styles.recordDuration}>
                              {formatDuration(durSec, lang)}
                            </Text>
                          </View>

                          {/* 相对时长进度条 */}
                          <View style={styles.progressBg}>
                            <View
                              style={[
                                styles.progressBar,
                                {
                                  width: `${barWidth}%`,
                                  backgroundColor: isPending ? UNNAMED_COLOR : catMeta.color,
                                },
                              ]}
                            />
                          </View>
                        </TouchableOpacity>
                      </View>
                    );
                  })
                )}
              </ScrollView>

              {/* 编辑/补充用途弹窗 */}
              <Modal visible={!!editItem} transparent animationType="fade" onRequestClose={closeEdit}>
                <View style={styles.editOverlay}>
                  <View style={styles.editDialog}>
                    <Text style={styles.editTitle}>{t('focusHistory.editTitle')}</Text>

                    {/* 选择分类 */}
                    <Text style={styles.editSectionLabel}>{t('pomodoro.postCatLabel')}</Text>
                    <View style={styles.catGrid}>
                      {FOCUS_CATEGORIES.map(c => {
                        const isCur = draftCat === c.key;
                        return (
                          <TouchableOpacity
                            key={'edit-cat-' + c.key}
                            style={[
                              styles.catBtn,
                              isCur && { borderColor: c.color, backgroundColor: c.color + '15' },
                            ]}
                            onPress={() => setDraftCat(c.key)}
                            activeOpacity={0.7}
                          >
                            <View style={[styles.catBtnDot, { backgroundColor: c.color }]} />
                            <Text style={[styles.catBtnText, isCur && { fontWeight: '800', color: '#2B1F1A' }]}>
                              {t(c.key)}
                            </Text>
                            {isCur && <Ionicons name="checkmark" size={14} color={c.color} />}
                          </TouchableOpacity>
                        );
                      })}
                    </View>

                    {/* 备注内容 */}
                    <Text style={styles.editSectionLabel}>{t('focusHistory.taskName')}</Text>
                    <TextInput
                      style={styles.editInput}
                      value={draftName}
                      onChangeText={setDraftName}
                      placeholder={t('pomodoro.taskPlaceholder')}
                      placeholderTextColor="#9A8A80"
                      returnKeyType="done"
                    />

                    {/* 按钮组 */}
                    <View style={styles.editBtnRow}>
                      <TouchableOpacity style={styles.deleteBtn} onPress={handleDelete}>
                        <Ionicons name="trash-outline" size={16} color="#D63B3B" />
                        <Text style={styles.deleteBtnText}>{t('common.delete')}</Text>
                      </TouchableOpacity>

                      <View style={{ flex: 1 }} />

                      <TouchableOpacity style={styles.cancelBtn} onPress={closeEdit}>
                        <Text style={styles.cancelBtnText}>{t('common.cancel')}</Text>
                      </TouchableOpacity>

                      <TouchableOpacity style={styles.saveBtn} onPress={handleSaveEdit}>
                        <Text style={styles.saveBtnText}>{t('common.save')}</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              </Modal>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const makeStyles = (colors) =>
  StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: 'rgba(90, 74, 66, 0.65)',
      justifyContent: 'flex-end',
    },
    sheet: {
      backgroundColor: '#FBF4ED',
      borderTopLeftRadius: 28,
      borderTopRightRadius: 28,
      paddingHorizontal: 16,
      paddingTop: 10,
      paddingBottom: Platform.OS === 'ios' ? 34 : 20,
      maxHeight: '85%',
    },
    handle: {
      width: 40,
      height: 4,
      borderRadius: 2,
      backgroundColor: '#D9CCC1',
      alignSelf: 'center',
      marginBottom: 12,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 10,
    },
    title: {
      fontSize: 20,
      fontWeight: '800',
      color: '#2B1F1A',
    },
    closeBtn: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: '#F1E6DC',
      alignItems: 'center',
      justifyContent: 'center',
    },
    summaryCard: {
      flexDirection: 'row',
      backgroundColor: '#fff',
      borderWidth: 1,
      borderColor: '#EFE2D7',
      borderRadius: 16,
      paddingVertical: 8,
      marginBottom: 12,
    },
    sumCol: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    sumColBorder: {
      borderLeftWidth: 1,
      borderRightWidth: 1,
      borderColor: '#EFE2D7',
    },
    sumValue: {
      fontSize: 18,
      fontWeight: '800',
      color: '#2B1F1A',
      lineHeight: 22,
    },
    sumLabel: {
      fontSize: 11,
      color: '#6F5F57',
      marginTop: 2,
    },
    distWrap: {
      marginBottom: 12,
    },
    distBar: {
      flexDirection: 'row',
      height: 10,
      borderRadius: 5,
      overflow: 'hidden',
      gap: 2,
    },
    legendRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 12,
      marginTop: 8,
    },
    legendItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    legendBox: {
      width: 8,
      height: 8,
      borderRadius: 2,
    },
    legendText: {
      fontSize: 12,
      color: '#4A3F39',
      fontWeight: '500',
    },
    listScroll: {
      maxHeight: 380,
    },
    emptyWrap: {
      paddingVertical: 36,
      alignItems: 'center',
    },
    emptyText: {
      fontSize: 14,
      color: '#9A8A80',
    },
    recordRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 8,
      marginBottom: 8,
    },
    recordTime: {
      width: 40,
      textAlign: 'right',
      paddingTop: 14,
      fontSize: 13,
      fontWeight: '600',
      color: '#4A3F39',
    },
    recordCard: {
      flex: 1,
      borderRadius: 14,
      paddingVertical: 9,
      paddingHorizontal: 12,
    },
    recordCardNormal: {
      backgroundColor: '#fff',
      borderWidth: 1.5,
      borderColor: '#EFE2D7',
    },
    recordCardPending: {
      backgroundColor: '#F8F1EA',
      borderWidth: 1.5,
      borderColor: '#CDBCAF',
      borderStyle: 'dashed',
    },
    recordHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      height: 24,
    },
    recordDot: {
      width: 9,
      height: 9,
      borderRadius: 5,
    },
    recordTitle: {
      flex: 1,
      fontSize: 15,
      fontWeight: '700',
      color: '#2B1F1A',
    },
    recordTitlePending: {
      fontStyle: 'italic',
      color: '#6F5F57',
    },
    pendingBadge: {
      backgroundColor: '#FDE7E5',
      borderRadius: 8,
      paddingHorizontal: 7,
      paddingVertical: 2,
    },
    pendingBadgeText: {
      fontSize: 11,
      fontWeight: '700',
      color: '#B3302C',
    },
    recordDuration: {
      fontSize: 15,
      fontWeight: '800',
      color: '#2B1F1A',
    },
    progressBg: {
      height: 5,
      borderRadius: 3,
      backgroundColor: '#F3E4DB',
      marginTop: 6,
      overflow: 'hidden',
    },
    progressBar: {
      height: 5,
      borderRadius: 3,
    },
    editOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.45)',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 20,
    },
    editDialog: {
      width: '100%',
      backgroundColor: '#fff',
      borderRadius: 20,
      padding: 20,
    },
    editTitle: {
      fontSize: 17,
      fontWeight: '800',
      color: '#2B1F1A',
      marginBottom: 14,
      textAlign: 'center',
    },
    editSectionLabel: {
      fontSize: 13,
      fontWeight: '700',
      color: '#5C4B43',
      marginBottom: 8,
    },
    catGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginBottom: 14,
    },
    catBtn: {
      width: '48%',
      height: 40,
      borderRadius: 12,
      borderWidth: 1.5,
      borderColor: '#EADDD2',
      backgroundColor: '#fff',
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 10,
      gap: 6,
    },
    catBtnDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
    },
    catBtnText: {
      flex: 1,
      fontSize: 13,
      fontWeight: '600',
      color: '#4A3F39',
    },
    editInput: {
      height: 44,
      borderWidth: 1.5,
      borderColor: '#EADDD2',
      borderRadius: 12,
      paddingHorizontal: 12,
      fontSize: 14,
      color: '#2B1F1A',
      marginBottom: 18,
    },
    editBtnRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    deleteBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingVertical: 8,
      paddingHorizontal: 8,
    },
    deleteBtnText: {
      fontSize: 13,
      color: '#D63B3B',
      fontWeight: '700',
    },
    cancelBtn: {
      paddingVertical: 10,
      paddingHorizontal: 14,
      borderRadius: 12,
      backgroundColor: '#F1E6DC',
    },
    cancelBtnText: {
      fontSize: 14,
      fontWeight: '600',
      color: '#5C4B43',
    },
    saveBtn: {
      paddingVertical: 10,
      paddingHorizontal: 18,
      borderRadius: 12,
      backgroundColor: '#D63B3B',
    },
    saveBtnText: {
      fontSize: 14,
      fontWeight: '700',
      color: '#fff',
    },
  });
