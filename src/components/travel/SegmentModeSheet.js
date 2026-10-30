import React from 'react';
import { View, Text, Modal, TouchableOpacity, StyleSheet } from 'react-native';
import { useTheme } from '../../theme/ThemeContext';
import { useI18n } from '../../i18n/LanguageContext';
import ModeIcon from '../ModeIcon';

const PRIMARY_MODES = ['walk', 'bike', 'drive', 'taxi', 'subway'];
const MORE_MODES = ['transit', 'train', 'flight', 'boat'];
const ALL_MODES = [...PRIMARY_MODES, ...MORE_MODES];

export default function SegmentModeSheet({
  visible,
  currentMode = 'walk',
  onSelectMode,
  onClose,
}) {
  const { colors, isDark } = useTheme();
  const { t } = useI18n();

  if (!visible) return null;

  const styles = makeStyles(colors, isDark);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.dialog}>
          <Text style={styles.dialogTitle}>{t('home.changeSegmentMode')}</Text>
          <View style={styles.segModeGrid}>
            {ALL_MODES.map((m) => {
              const isCur = currentMode === m;
              return (
                <TouchableOpacity
                  key={'seg-mode-' + m}
                  style={[styles.segModeItem, isCur && styles.segModeItemActive]}
                  onPress={() => {
                    onSelectMode(m);
                  }}
                  activeOpacity={0.7}
                >
                  <ModeIcon mode={m} size={20} color={isCur ? colors.primaryStrong : colors.ink2} />
                  <Text style={[styles.segModeText, isCur && styles.segModeTextActive]}>
                    {t('mode.' + m)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <TouchableOpacity style={styles.dialogBtnCancelFull} onPress={onClose} activeOpacity={0.7}>
            <Text style={styles.dialogBtnCancelText}>{t('common.cancel')}</Text>
          </TouchableOpacity>
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
    dialogTitle: {
      fontSize: 15,
      fontWeight: '800',
      color: colors.ink,
      marginBottom: 14,
      textAlign: 'center',
    },
    segModeGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      justifyContent: 'center',
      marginBottom: 16,
    },
    segModeItem: {
      width: '30%',
      aspectRatio: 1.3,
      borderRadius: 12,
      backgroundColor: colors.surface2,
      borderWidth: 1,
      borderColor: colors.line,
      justifyContent: 'center',
      alignItems: 'center',
      gap: 4,
    },
    segModeItemActive: {
      backgroundColor: colors.primarySoft,
      borderColor: colors.primary,
    },
    segModeText: {
      fontSize: 12,
      fontWeight: '500',
      color: colors.ink2,
    },
    segModeTextActive: {
      color: colors.primaryStrong,
      fontWeight: '700',
    },
    dialogBtnCancelFull: {
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
  });
