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
import { MODE_KEYS } from './TransportPicker';

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
  const [currentMode, setCurrentMode] = useState(initialMode);
  const [showModePicker, setShowModePicker] = useState(false);

  useEffect(() => {
    if (visible) {
      setOffsetMin(5);
      setSelectedPlace(commonPlaces[0] || '');
      setCustomInput('');
      setIsCustomMode(false);
      setCurrentMode(initialMode || 'walk');
      setShowModePicker(false);
    }
  }, [visible, commonPlaces, initialMode]);

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
      mode: currentMode,
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
                  <Ionicons name="close" size={20} color="#5C4B43" />
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
                        color={isSelected ? '#B3302C' : '#6F5F57'}
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
                  <Ionicons name="search-outline" size={16} color="#6F5F57" />
                  <TextInput
                    style={styles.customInput}
                    value={customInput}
                    onChangeText={setCustomInput}
                    placeholder={t('backfill.customPlacePlaceholder')}
                    placeholderTextColor="#9A8A80"
                    autoFocus
                    returnKeyType="done"
                  />
                  {customInput.length > 0 && (
                    <TouchableOpacity onPress={() => setCustomInput('')}>
                      <Ionicons name="close-circle" size={16} color="#9A8A80" />
                    </TouchableOpacity>
                  )}
                </View>
              )}

              {/* 3. 出行方式 */}
              <TouchableOpacity
                style={styles.modeCard}
                onPress={() => setShowModePicker(!showModePicker)}
                activeOpacity={0.7}
              >
                <Text style={styles.modeLabel}>{t('backfill.modeDesc')}</Text>
                <View style={styles.modeRightRow}>
                  <ModeIcon mode={currentMode} size={16} color="#B3302C" />
                  <Text style={styles.modeValText}>{t('mode.' + currentMode)}</Text>
                  <Ionicons
                    name={showModePicker ? 'chevron-up' : 'chevron-down'}
                    size={14}
                    color="#9A8A80"
                  />
                </View>
              </TouchableOpacity>

              {/* 展开可快捷切换交通方式 */}
              {showModePicker && (
                <View style={styles.modePickerContainer}>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.modePickerScroll}>
                    {MODE_KEYS.map((m) => {
                      const isCur = currentMode === m;
                      return (
                        <TouchableOpacity
                          key={'bf-mode-' + m}
                          style={[styles.modePickerItem, isCur && styles.modePickerItemActive]}
                          onPress={() => {
                            setCurrentMode(m);
                            setShowModePicker(false);
                          }}
                          activeOpacity={0.7}
                        >
                          <ModeIcon mode={m} size={15} color={isCur ? '#B3302C' : '#5C4B43'} />
                          <Text style={[styles.modePickerText, isCur && styles.modePickerTextActive]}>
                            {t('mode.' + m)}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </View>
              )}

              {/* 4. 底部主按钮 */}
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
    },
    handle: {
      width: 40,
      height: 4,
      borderRadius: 2,
      backgroundColor: '#D9CCC1',
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
    sectionLabel: {
      fontSize: 13,
      fontWeight: '700',
      color: '#5C4B43',
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
      color: '#6F5F57',
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
      borderColor: '#EADDD2',
      backgroundColor: '#fff',
      alignItems: 'center',
      justifyContent: 'center',
    },
    pillBtnActive: {
      borderColor: '#D63B3B',
      backgroundColor: '#FDE9E6',
    },
    pillText: {
      fontSize: 14,
      fontWeight: '600',
      color: '#4A3F39',
    },
    pillTextActive: {
      fontWeight: '800',
      color: '#B3302C',
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
      borderColor: '#EADDD2',
      backgroundColor: '#fff',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      maxWidth: '48%',
    },
    placePillActive: {
      borderColor: '#D63B3B',
      backgroundColor: '#FDE9E6',
    },
    placePillDashed: {
      height: 44,
      paddingHorizontal: 14,
      borderRadius: 14,
      borderWidth: 1.5,
      borderColor: '#CDBCAF',
      borderStyle: 'dashed',
      backgroundColor: 'transparent',
      alignItems: 'center',
      justifyContent: 'center',
    },
    placePillText: {
      fontSize: 14,
      fontWeight: '600',
      color: '#4A3F39',
    },
    placePillTextActive: {
      fontWeight: '800',
      color: '#B3302C',
    },
    customInputWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: '#fff',
      borderWidth: 1.5,
      borderColor: '#D63B3B',
      borderRadius: 14,
      paddingHorizontal: 12,
      height: 46,
      marginBottom: 16,
    },
    customInput: {
      flex: 1,
      fontSize: 14,
      color: '#2B1F1A',
      padding: 0,
    },
    modeCard: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: '#fff',
      borderWidth: 1,
      borderColor: '#EFE2D7',
      borderRadius: 14,
      paddingHorizontal: 14,
      height: 48,
      marginBottom: 16,
    },
    modeLabel: {
      fontSize: 13,
      color: '#6F5F57',
    },
    modeRightRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    modeValText: {
      fontSize: 14,
      fontWeight: '800',
      color: '#B3302C',
    },
    modePickerContainer: {
      backgroundColor: '#fff',
      borderRadius: 14,
      borderWidth: 1,
      borderColor: '#EFE2D7',
      paddingVertical: 8,
      paddingHorizontal: 6,
      marginBottom: 16,
      marginTop: -8,
    },
    modePickerScroll: {
      gap: 6,
      paddingHorizontal: 6,
    },
    modePickerItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: '#EFE2D7',
      backgroundColor: '#F8F1EA',
    },
    modePickerItemActive: {
      borderColor: '#D63B3B',
      backgroundColor: '#FDE9E6',
    },
    modePickerText: {
      fontSize: 12,
      color: '#5C4B43',
      fontWeight: '600',
    },
    modePickerTextActive: {
      color: '#B3302C',
      fontWeight: '700',
    },
    submitBtn: {
      height: 56,
      borderRadius: 18,
      backgroundColor: '#D63B3B',
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: '#D63B3B',
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.3,
      shadowRadius: 14,
      elevation: 6,
    },
    submitBtnText: {
      fontSize: 17,
      fontWeight: '800',
      color: '#fff',
      letterSpacing: 0.5,
    },
  });
