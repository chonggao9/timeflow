import React from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Pressable,
} from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { useI18n } from '../i18n/LanguageContext';

export default function AbandonActionModal({
  visible,
  onClose,
  onContinue,
  onEarlyFinish,
  onAbandon,
  focusedSec = 0,
}) {
  const { isDark } = useTheme();
  const { t } = useI18n();

  const focusedMin = Math.floor(focusedSec / 60);
  const canEarlyFinish = focusedSec >= 60;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[
            styles.card,
            {
              backgroundColor: isDark ? '#231B18' : '#FFFFFF',
              borderColor: isDark ? '#3D312A' : '#EFE8DE',
            },
          ]}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={styles.handleBar} />

          <Text
            style={[
              styles.title,
              { color: isDark ? '#F5EDE4' : '#2B211C' },
            ]}
          >
            {t('pomodoro.abandonModalTitle', '确定要放弃专注吗？')}
          </Text>

          {/* 1. 继续专注（高亮主按钮） */}
          <TouchableOpacity
            style={[
              styles.primaryBtn,
              { backgroundColor: isDark ? '#D95338' : '#D93A2B' },
            ]}
            onPress={onContinue}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel={t('pomodoro.continueFocus', '继续专注')}
          >
            <Text style={styles.primaryBtnText}>
              {t('pomodoro.continueFocus', '继续专注')}
            </Text>
          </TouchableOpacity>

          {/* 2. 提前结束并记入（仅已满 1 分钟时展示） */}
          {canEarlyFinish && (
            <TouchableOpacity
              style={[
                styles.secondaryBtn,
                {
                  backgroundColor: isDark ? '#2A201B' : '#F6F1EB',
                  borderColor: isDark ? '#4A3B32' : '#E4DCD3',
                },
              ]}
              onPress={onEarlyFinish}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel={t('pomodoro.earlyFinishAndSave', { min: focusedMin })}
            >
              <Text
                style={[
                  styles.secondaryBtnText,
                  { color: isDark ? '#81C784' : '#2E7D32' },
                ]}
              >
                {t('pomodoro.earlyFinishAndSave', { min: focusedMin })
                  .replace('{min}', focusedMin)}
              </Text>
            </TouchableOpacity>
          )}

          {/* 3. 放弃，不记录（次要红字按钮） */}
          <TouchableOpacity
            style={styles.textBtn}
            onPress={onAbandon}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={t('pomodoro.abandonNoLog', '放弃，不记录')}
          >
            <Text
              style={[
                styles.textBtnText,
                { color: isDark ? '#EF5350' : '#D32F2F' },
              ]}
            >
              {t('pomodoro.abandonNoLog', '放弃，不记录')}
            </Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'flex-end',
  },
  card: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderBottomWidth: 0,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 32,
    alignItems: 'center',
  },
  handleBar: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#CCCCCC',
    marginBottom: 16,
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 20,
    textAlign: 'center',
  },
  primaryBtn: {
    width: '100%',
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    marginBottom: 10,
  },
  primaryBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  secondaryBtn: {
    width: '100%',
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    marginBottom: 10,
  },
  secondaryBtnText: {
    fontSize: 15,
    fontWeight: '600',
  },
  textBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  textBtnText: {
    fontSize: 14,
    fontWeight: '600',
  },
});
