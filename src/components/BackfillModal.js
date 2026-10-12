import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TouchableWithoutFeedback,
  TextInput,
  ScrollView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeContext';
import { useI18n } from '../i18n/LanguageContext';
import ModeIcon from './ModeIcon';

const OFFSETS = [
  { min: 0, labelKey: 'home.justNow' },
  { min: 5, labelKey: 'home.m5Ago' },
  { min: 15, labelKey: 'home.m15Ago' },
  { min: 30, labelKey: 'home.m30Ago' },
  { min: 60, labelKey: 'home.h1Ago' },
];

export default function BackfillModal({
  visible,
  onClose,
  onSave,
  commonPlaces = [],
  initialMode = 'walk',
}) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [offsetMin, setOffsetMin] = useState(5);
  const [selectedPlace, setSelectedPlace] = useState('');
  const [customInput, setCustomInput] = useState('');
  const [isCustomMode, setIsCustomMode] = useState(false);

  useEffect(() => {
    if (visible) {
      setOffsetMin(5);
      setSelectedPlace(commonPlaces[0] || '');
      setCustomInput('');
      setIsCustomMode(false);
    }
  }, [visible, commonPlaces]);

  // 计算目标时间文案（HH:MM）
  const targetTimeStr = useMemo(() => {
    const d = new Date(Date.now() - offsetMin * 60 * 1000);
    const h = String(d.getHours()).padStart(2, '0');
    const m = String(d.getMinutes()).padStart(2, '0');
    return `${h}:${m}`;
  }, [offsetMin]);

  const finalPlaceName = isCustomMode ? customInput.trim() : selectedPlace.trim();

  const handleSelectPlace = (place) => {
    setIsCustomMode(false);
    setSelectedPlace(place);
  };

  const handleOpenCustom = () => {
    setIsCustomMode(true);
    setSelectedPlace('');
  };

  const handleConfirm = () => {
    const name = finalPlaceName || t('common.unnamed');
    onSave({
      offsetMin,
      locationName: name,
      mode: initialMode || 'walk',
    });
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.overlay}>
          <TouchableWithoutFeedback>
            <View style={styles.sheet}>
              {/* Top Handle */}
              <View style={styles.handle} />

              {/* Header */}
              <View style={styles.headerRow}>
                <Text style={styles.title}>{t('backfill.title')}</Text>
                <TouchableOpacity
                  style={styles.closeBtn}
                  onPress={onClose}
                  activeOpacity={0.7}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons name="close" size={20} color={colors.ink2} />
                </TouchableOpacity>
              </View>

              {/* 1. 什么时候？ */}
              <Text style={styles.sectionLabel}>{t('backfill.when')}</Text>
              <View style={styles.pillsRow}>
                {OFFSETS.map((item) => {
                  const isActive = offsetMin === item.min;
                  return (
                    <TouchableOpacity
                      key={'offset-' + item.min}
                      style={[styles.pillBtn, isActive && styles.pillBtnActive]}
                      onPress={() => setOffsetMin(item.min)}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.pillText, isActive && styles.pillTextActive]}>
                        {t(item.labelKey)}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* 2. 在哪里？ */}
              <View style={styles.labelRow}>
                <Text style={styles.sectionLabel}>{t('backfill.where')}</Text>
                <Text style={styles.sectionSub}>{t('backfill.whereSub')}</Text>
              </View>
              <View style={styles.placePillsWrap}>
                {commonPlaces.slice(0, 5).map((place, idx) => {
                  const isSelected = !isCustomMode && selectedPlace === place;
                  return (
                    <TouchableOpacity
                      key={'common-place-' + idx}
                      style={[styles.placePill, isSelected && styles.placePillActive]}
                      onPress={() => handleSelectPlace(place)}
                      activeOpacity={0.7}
                    >
                      <Ionicons
                        name="location-outline"
                        size={14}
                        color={isSelected ? colors.primaryStrong : colors.ink2}
                      />
                      <Text
                        style={[styles.placePillText, isSelected && styles.placePillTextActive]}
                        numberOfLines={1}
                      >
                        {place}
                      </Text>
                    </TouchableOpacity>
                  );
                })}

                <TouchableOpacity
                  style={[styles.placePillDashed, isCustomMode && styles.placePillActive]}
                  onPress={handleOpenCustom}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.placePillText, isCustomMode && styles.placePillTextActive]}>
                    {t('backfill.searchOther')}
                  </Text>
                </TouchableOpacity>
              </View>

              {/* 自定义地点输入框 */}
              {isCustomMode && (
                <View style={styles.customInputWrap}>
                  <Ionicons name="search-outline" size={16} color={colors.ink2} />
                  <TextInput
                    style={styles.customInput}
                    value={customInput}
                    onChangeText={setCustomInput}
                    placeholder={t('backfill.customPlacePlaceholder')}
                    placeholderTextColor={colors.ink3}
                    autoFocus
                    returnKeyType="done"
                  />
                  {customInput.length > 0 && (
                    <TouchableOpacity onPress={() => setCustomInput('')}>
                      <Ionicons name="close-circle" size={16} color={colors.ink3} />
                    </TouchableOpacity>
                  )}
                </View>
              )}

              {/* 3. 底部主按钮 */}
              <TouchableOpacity
                style={styles.submitBtn}
                onPress={handleConfirm}
                activeOpacity={0.8}
              >
                <Text style={styles.submitBtnText}>
                  {t('backfill.submitBtn', { time: targetTimeStr })}
                </Text>
              </TouchableOpacity>
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
      backgroundColor: colors.scrim,
      justifyContent: 'flex-end',
    },
    sheet: {
      backgroundColor: colors.bg,
      borderTopLeftRadius: 28,
      borderTopRightRadius: 28,
      paddingHorizontal: 16,
      paddingTop: 10,
      paddingBottom: Platform.OS === 'ios' ? 34 : 20,
    },
    handle: {
      width: 40,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.line2,
      alignSelf: 'center',
      marginBottom: 14,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 16,
    },
    title: {
      fontSize: 20,
      fontWeight: '800',
      color: colors.ink,
    },
    closeBtn: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: colors.chip,
      alignItems: 'center',
      justifyContent: 'center',
    },
    sectionLabel: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.ink2,
      marginBottom: 8,
    },
    labelRow: {
      flexDirection: 'row',
      alignItems: 'baseline',
      gap: 6,
      marginBottom: 8,
    },
    sectionSub: {
      fontSize: 12,
      fontWeight: '500',
      color: colors.ink2,
    },
    pillsRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginBottom: 18,
    },
    pillBtn: {
      height: 44,
      paddingHorizontal: 16,
      borderRadius: 14,
      borderWidth: 1.5,
      borderColor: colors.line2,
      backgroundColor: colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    pillBtnActive: {
      borderColor: colors.primary,
      backgroundColor: colors.primarySoft,
    },
    pillText: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.ink2,
    },
    pillTextActive: {
      fontWeight: '800',
      color: colors.primaryStrong,
    },
    placePillsWrap: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginBottom: 16,
    },
    placePill: {
      height: 44,
      paddingHorizontal: 14,
      borderRadius: 14,
      borderWidth: 1.5,
      borderColor: colors.line2,
      backgroundColor: colors.surface,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      maxWidth: '48%',
    },
    placePillActive: {
      borderColor: colors.primary,
      backgroundColor: colors.primarySoft,
    },
    placePillDashed: {
      height: 44,
      paddingHorizontal: 14,
      borderRadius: 14,
      borderWidth: 1.5,
      borderColor: colors.ink3,
      borderStyle: 'dashed',
      backgroundColor: 'transparent',
      alignItems: 'center',
      justifyContent: 'center',
    },
    placePillText: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.ink2,
    },
    placePillTextActive: {
      fontWeight: '800',
      color: colors.primaryStrong,
    },
    customInputWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: colors.surface,
      borderWidth: 1.5,
      borderColor: colors.primary,
      borderRadius: 14,
      paddingHorizontal: 12,
      height: 46,
      marginBottom: 16,
    },
    customInput: {
      flex: 1,
      fontSize: 14,
      color: colors.ink,
      padding: 0,
    },
    submitBtn: {
      height: 56,
      borderRadius: 18,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: colors.primary,
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.3,
      shadowRadius: 14,
      elevation: 6,
    },
    submitBtnText: {
      fontSize: 17,
      fontWeight: '800',
      color: colors.surface,
      letterSpacing: 0.5,
    },
  });
