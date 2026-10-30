import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeContext';
import { useI18n } from '../../i18n/LanguageContext';
import { formatTime, UNNAMED } from '../../utils/stats';
import ModeIcon from '../ModeIcon';

const PRIMARY_MODES = ['walk', 'bike', 'drive', 'taxi', 'subway'];
const MORE_MODES = ['transit', 'train', 'flight', 'boat'];
const ALL_MODES = [...PRIMARY_MODES, ...MORE_MODES];

export default function PointEditSheet({
  visible,
  record,
  commonPlaces = [],
  hasActiveTrip = false,
  onSave,
  onDelete,
  onEndTrip,
  onClose,
}) {
  const { colors, isDark } = useTheme();
  const { t } = useI18n();

  const [draftName, setDraftName] = useState('');
  const [draftMode, setDraftMode] = useState('walk');
  const [draftTimestamp, setDraftTimestamp] = useState(Date.now());
  const [showMore, setShowMore] = useState(false);

  useEffect(() => {
    if (record) {
      setDraftName(record.locationName && record.locationName !== UNNAMED ? record.locationName : '');
      setDraftMode(record.mode || 'walk');
      setDraftTimestamp(record.timestamp || Date.now());
      setShowMore(false);
    }
  }, [record, visible]);

  if (!visible || !record) return null;

  const handleSave = () => {
    const name = draftName.trim();
    if (!name) {
      Alert.alert(t('home.renameEmpty'));
      return;
    }
    onSave({
      id: record.id,
      locationName: name,
      mode: draftMode,
      timestamp: draftTimestamp,
    });
  };

  const handleDelete = () => {
    Alert.alert(t('home.deleteTitle'), t('home.deleteBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: () => onDelete(record.id),
      },
    ]);
  };

  const styles = makeStyles(colors, isDark);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.dialog}>
          {/* Header */}
          <View style={styles.headerRow}>
            <View>
              <Text style={styles.dialogTitle}>{t('home.renameTitle')}</Text>
              <Text style={styles.dialogSub}>{t('home.renameSub')}</Text>
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close" size={20} color={colors.ink3} />
            </TouchableOpacity>
          </View>

          {/* 第一层：核心地名输入 */}
          <TextInput
            style={styles.input}
            value={draftName}
            onChangeText={setDraftName}
            placeholder={t('home.renamePlaceholder')}
            placeholderTextColor="#9A8A80"
            autoFocus={false}
            returnKeyType="done"
            onSubmitEditing={handleSave}
          />

          {/* 常用地点快选芯片 */}
          {commonPlaces.length > 0 && (
            <View style={styles.quickPlaceWrap}>
              <View style={styles.chipRow}>
                {commonPlaces.map((place, pIdx) => {
                  const isSelected = draftName === place;
                  return (
                    <TouchableOpacity
                      key={'place-chip-' + pIdx}
                      style={[styles.quickChip, isSelected && styles.quickChipActive]}
                      onPress={() => setDraftName(place)}
                      activeOpacity={0.7}
                    >
                      <Ionicons
                        name="location-outline"
                        size={12}
                        color={isSelected ? colors.primaryStrong : colors.ink2}
                      />
                      <Text style={[styles.quickChipText, isSelected && styles.quickChipTextActive]}>
                        {place}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}

          {/* 更多选项折叠开关 */}
          <TouchableOpacity
            style={styles.toggleMoreBtn}
            onPress={() => setShowMore((prev) => !prev)}
            activeOpacity={0.7}
          >
            <Text style={styles.toggleMoreText}>
              {showMore ? t('home.editLess', '收起选项') : t('home.editMore', '更多选项')}
            </Text>
            <Ionicons
              name={showMore ? 'chevron-up' : 'chevron-down'}
              size={14}
              color={colors.primaryStrong}
            />
          </TouchableOpacity>

          {/* 第二层：低频选项（折叠展现） */}
          {showMore && (
            <View style={styles.moreSection}>
              {/* 修改打卡时间 */}
              <Text style={styles.dialogSectionLabel}>{t('home.editTime')}</Text>
              <View style={styles.timeEditRow}>
                <View style={styles.timeDisplayPill}>
                  <Ionicons name="time-outline" size={15} color={colors.primary} />
                  <Text style={styles.timeDisplayText}>{formatTime(draftTimestamp)}</Text>
                </View>
                <View style={styles.timeOffsetBtns}>
                  {[-10, -5, 5, 10].map((delta) => (
                    <TouchableOpacity
                      key={'time-adj-' + delta}
                      style={styles.timeOffsetBtn}
                      onPress={() => setDraftTimestamp((prev) => prev + delta * 60 * 1000)}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.timeOffsetBtnText}>
                        {delta > 0 ? `+${delta}m` : `${delta}m`}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* 修改出行方式 */}
              <Text style={styles.dialogSectionLabel}>{t('home.editMode')}</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.dialogModeScroll}
              >
                {ALL_MODES.map((m) => {
                  const isSelected = draftMode === m;
                  return (
                    <TouchableOpacity
                      key={'edit-mode-' + m}
                      style={[styles.dialogModeChip, isSelected && styles.dialogModeChipActive]}
                      onPress={() => setDraftMode(m)}
                      activeOpacity={0.7}
                    >
                      <ModeIcon mode={m} size={14} color={isSelected ? colors.primaryStrong : colors.ink2} />
                      <Text style={[styles.dialogModeChipText, isSelected && styles.dialogModeChipTextActive]}>
                        {t('mode.' + m)}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              {/* 设为终点与删除点 */}
              <View style={styles.dialogActionRow}>
                {hasActiveTrip && onEndTrip && (
                  <TouchableOpacity style={styles.endTripBtn} onPress={onEndTrip} activeOpacity={0.7}>
                    <Ionicons name="flag-outline" size={13} color={colors.ink2} />
                    <Text style={styles.endTripBtnText}>{t('trip.markAsEnd')}</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity style={styles.deleteLink} onPress={handleDelete} activeOpacity={0.7}>
                  <Ionicons name="trash-outline" size={13} color="#D63B3B" />
                  <Text style={styles.deleteLinkText}>{t('home.deleteBtn')}</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* 确认 / 取消 动作区 */}
          <View style={styles.dialogButtons}>
            <TouchableOpacity style={styles.dialogBtnCancel} onPress={onClose} activeOpacity={0.7}>
              <Text style={styles.dialogBtnCancelText}>{t('common.cancel')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.dialogBtnConfirm} onPress={handleSave} activeOpacity={0.7}>
              <Text style={styles.dialogBtnConfirmText}>{t('common.save')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const makeStyles = (colors, isDark) =>
  StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.45)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: 20,
    },
    dialog: {
      width: '100%',
      maxWidth: 360,
      backgroundColor: colors.surface,
      borderRadius: 22,
      padding: 18,
      borderWidth: 1,
      borderColor: colors.line,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.15,
      shadowRadius: 16,
      elevation: 8,
    },
    headerRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: 10,
    },
    dialogTitle: {
      fontSize: 16,
      fontWeight: '800',
      color: colors.ink,
    },
    dialogSub: {
      fontSize: 12,
      color: colors.ink2,
      marginTop: 2,
    },
    input: {
      backgroundColor: colors.primarySoft,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 10,
      fontSize: 14,
      fontWeight: '600',
      color: colors.ink,
      borderWidth: 1,
      borderColor: colors.line,
      marginVertical: 10,
    },
    quickPlaceWrap: {
      marginBottom: 10,
    },
    chipRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
    },
    quickChip: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surface2,
      paddingHorizontal: 9,
      paddingVertical: 5,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.line,
      gap: 4,
    },
    quickChipActive: {
      backgroundColor: colors.primarySoft,
      borderColor: colors.primary,
    },
    quickChipText: {
      fontSize: 12,
      color: colors.ink2,
      fontWeight: '500',
    },
    quickChipTextActive: {
      color: colors.primaryStrong,
      fontWeight: '700',
    },
    toggleMoreBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 8,
      gap: 4,
      marginTop: 4,
    },
    toggleMoreText: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.primaryStrong,
    },
    moreSection: {
      marginTop: 6,
      paddingTop: 10,
      borderTopWidth: 1,
      borderTopColor: colors.line,
    },
    dialogSectionLabel: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.ink2,
      marginBottom: 6,
      marginTop: 4,
    },
    timeEditRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 12,
    },
    timeDisplayPill: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.primarySoft,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 8,
      gap: 6,
    },
    timeDisplayText: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.ink,
    },
    timeOffsetBtns: {
      flexDirection: 'row',
      gap: 4,
    },
    timeOffsetBtn: {
      backgroundColor: colors.surface2,
      paddingHorizontal: 7,
      paddingVertical: 5,
      borderRadius: 6,
      borderWidth: 1,
      borderColor: colors.line,
    },
    timeOffsetBtnText: {
      fontSize: 11,
      fontWeight: '600',
      color: colors.ink2,
    },
    dialogModeScroll: {
      flexDirection: 'row',
      gap: 6,
      paddingVertical: 4,
      marginBottom: 12,
    },
    dialogModeChip: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 8,
      backgroundColor: colors.surface2,
      borderWidth: 1,
      borderColor: colors.line,
      gap: 4,
    },
    dialogModeChipActive: {
      backgroundColor: colors.primarySoft,
      borderColor: colors.primary,
    },
    dialogModeChipText: {
      fontSize: 12,
      color: colors.ink2,
      fontWeight: '500',
    },
    dialogModeChipTextActive: {
      color: colors.primaryStrong,
      fontWeight: '700',
    },
    dialogActionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginVertical: 6,
    },
    endTripBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingVertical: 4,
    },
    endTripBtnText: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.ink2,
    },
    deleteLink: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingVertical: 4,
    },
    deleteLinkText: {
      fontSize: 12,
      fontWeight: '600',
      color: '#D63B3B',
    },
    dialogButtons: {
      flexDirection: 'row',
      gap: 10,
      marginTop: 14,
    },
    dialogBtnCancel: {
      flex: 1,
      backgroundColor: colors.surface2,
      paddingVertical: 10,
      borderRadius: 12,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: colors.line,
    },
    dialogBtnCancelText: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.ink2,
    },
    dialogBtnConfirm: {
      flex: 1,
      backgroundColor: colors.primary,
      paddingVertical: 10,
      borderRadius: 12,
      alignItems: 'center',
    },
    dialogBtnConfirmText: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.onPrimary || '#FFFFFF',
    },
  });
