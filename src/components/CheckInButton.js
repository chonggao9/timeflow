import React from 'react';
import { TouchableOpacity, Text, StyleSheet, ActivityIndicator, View } from 'react-native';
import { colors, shadow } from '../theme';

export default function CheckInButton({ onPress, loading, success }) {
  return (
    <TouchableOpacity
      style={[styles.button, success && styles.buttonSuccess]}
      onPress={onPress}
      activeOpacity={0.85}
      disabled={loading || success}
    >
      {loading
        ? <ActivityIndicator color="#fff" size="small" />
        : (
          <View style={styles.inner}>
            {success && <Text style={styles.check}>✓</Text>}
            <Text style={[styles.label, success && styles.labelSuccess]}>{success ? '已打卡' : '打 卡'}</Text>
          </View>
        )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
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
  },
  labelSuccess: { letterSpacing: 2, marginLeft: 0 },
});
