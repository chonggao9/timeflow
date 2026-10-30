import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  TextInput,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeContext';
import { useI18n } from '../../i18n/LanguageContext';

export default function TripRenameModal({
  visible,
  trip,
  onSave,
  onClose,
}) {
  const { colors, isDark } = useTheme();
  const { t } = useI18n();
  const [draftName, setDraftName] = useState('');

  useEffect(() => {
    if (trip) {
      setDraftName(trip.name || '');
    }
  }, [trip, visible]);

  if (!visible || !trip) return null;

  // 推荐名称：根据起点与终点推导（例如「公司 → 家」），以及「日常通勤」
  const suggestions = [];
  if (trip.records && trip.records.length > 0) {
    const first = trip.records[0]?.locationName;
    const last = trip.records[trip.records.length - 1]?.locationName;
    if (first && last && first !== last) {
      suggestions.push(`${first} → ${last}`);
    } else if (first) {
      suggestions.push(first);
    }
  }
  suggestions.push(t('trip.defaultCommute', '通勤'));

  const handleConfirm = () => {
    onSave(trip.tripId || trip.id, draftName.trim());
  };

  const styles = makeStyles(colors, isDark);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.dialog}>
          <View style={styles.headerRow}>
            <Text style={styles.dialogTitle}>{t('trip.renameTitle', '行程命名')}</Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close" size={20} color={colors.ink3} />
            </TouchableOpacity>
          </View>

          <TextInput
            style={styles.input}
            value={draftName}
            onChangeText={setDraftName}
            placeholder={t('trip.renamePlaceholder', '输入行程名称（如：通勤）')}
            placeholderTextColor="#9A8A80"
            autoFocus
            returnKeyType="done"
            onSubmitEditing={handleConfirm}
          />

          {/* 推荐名称芯片 */}
          {suggestions.length > 0 && (
            <View style={styles.suggestionsWrap}>
              <Text style={styles.sectionLabel}>{t('trip.recommendName', '推荐名称')}</Text>
              <View style={styles.chipRow}>
                {suggestions.map((sug, idx) => (
                  <TouchableOpacity
                    key={'sug-' + idx}
                    style={styles.chip}
                    onPress={() => setDraftName(sug)}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="sparkles-outline" size={12} color={colors.primaryStrong} />
                    <Text style={styles.chipText}>{sug}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          <View style={styles.buttonRow}>
            <TouchableOpacity style={styles.btnCancel} onPress={onClose} activeOpacity={0.7}>
              <Text style={styles.btnCancelText}>{t('common.cancel')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.btnConfirm} onPress={handleConfirm} activeOpacity={0.7}>
              <Text style={styles.btnConfirmText}>{t('common.save')}</Text>
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
      maxWidth: 340,
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
      alignItems: 'center',
      marginBottom: 12,
    },
    dialogTitle: {
      fontSize: 16,
      fontWeight: '800',
      color: colors.ink,
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
      marginBottom: 12,
    },
    suggestionsWrap: {
      marginBottom: 14,
    },
    sectionLabel: {
      fontSize: 11,
      fontWeight: '700',
      color: colors.ink2,
      marginBottom: 6,
    },
    chipRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
    },
    chip: {
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
    chipText: {
      fontSize: 12,
      fontWeight: '500',
      color: colors.ink2,
    },
    buttonRow: {
      flexDirection: 'row',
      gap: 10,
      marginTop: 4,
    },
    btnCancel: {
      flex: 1,
      backgroundColor: colors.surface2,
      paddingVertical: 10,
      borderRadius: 12,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: colors.line,
    },
    btnCancelText: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.ink2,
    },
    btnConfirm: {
      flex: 1,
      backgroundColor: colors.primary,
      paddingVertical: 10,
      borderRadius: 12,
      alignItems: 'center',
    },
    btnConfirmText: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.onPrimary || '#FFFFFF',
    },
  });
