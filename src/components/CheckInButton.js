import React, { useMemo } from 'react';
import { TouchableOpacity, Text, StyleSheet, View } from 'react-native';
import { shadow } from '../theme';
import { useTheme } from '../theme/ThemeContext';
import { useI18n } from '../i18n/LanguageContext';

export default function CheckInButton({ onPress, loading, success }) {
  const { t } = useI18n();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <TouchableOpacity
      style={[styles.button, success && styles.buttonSuccess]}
      onPress={onPress}
      activeOpacity={0.85}
      disabled={loading || success}
    >
      <View style={styles.inner}>
        {success && <Text style={styles.check}>✓</Text>}
        <Text style={[styles.label, success && styles.labelSuccess]}>{success ? t('checkin.done') : t('checkin.btn')}</Text>
      </View>
    </TouchableOpacity>
  );
}

const makeStyles = (colors) => StyleSheet.create({
  button: {
    backgroundColor: colors.primary,
    borderRadius: 18,
    paddingVertical: 17,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.primary,
  },
  buttonSuccess: {
    backgroundColor: colors.success,
    shadowColor: colors.success,
  },
  inner: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  check: { color: '#fff', fontSize: 20, fontWeight: '800' },
  label: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 6,
    marginLeft: 6,
    textAlign: 'center',
  },
  labelSuccess: { letterSpacing: 2, marginLeft: 0 },
});
