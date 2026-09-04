import React, { useMemo } from 'react';
import { TouchableOpacity, Text, StyleSheet, View } from 'react-native';
import { shadow } from '../theme';
import { useTheme } from '../theme/ThemeContext';
import { useI18n } from '../i18n/LanguageContext';

export default function CheckInButton({ onPress, onLongPress, loading, success }) {
  const { t } = useI18n();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const isSuccess = !!success;
  const isEnded = success === 'ended';

  const labelText = isEnded
    ? t('checkin.ended')
    : isSuccess
      ? t('checkin.done')
      : t('checkin.btn');

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={[
          styles.button,
          isSuccess && styles.buttonSuccess,
          isEnded && styles.buttonEnded,
        ]}
        onPress={onPress}
        onLongPress={onLongPress}
        delayLongPress={500}
        activeOpacity={0.85}
        disabled={loading || isSuccess}
      >
        <View style={styles.inner}>
          {isSuccess && <Text style={styles.check}>{isEnded ? '🏁' : '✓'}</Text>}
          <Text style={[styles.label, isSuccess && styles.labelSuccess]}>{labelText}</Text>
        </View>
      </TouchableOpacity>
      <Text style={styles.hintText}>{t('checkin.hint')}</Text>
    </View>
  );
}

const makeStyles = (colors) => StyleSheet.create({
  container: {
    width: '100%',
    alignItems: 'center',
  },
  button: {
    width: '100%',
    backgroundColor: colors.primary,
    borderRadius: 20,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.primary,
  },
  buttonSuccess: {
    backgroundColor: colors.success,
    shadowColor: colors.success,
  },
  buttonEnded: {
    backgroundColor: colors.ink2,
    shadowColor: colors.ink2,
  },
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  check: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '800',
  },
  label: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 4,
    textAlign: 'center',
  },
  labelSuccess: {
    letterSpacing: 1.5,
  },
  hintText: {
    fontSize: 11,
    color: colors.ink3,
    marginTop: 7,
    letterSpacing: 0.5,
    fontWeight: '500',
  },
});
