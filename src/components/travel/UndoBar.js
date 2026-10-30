import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, Easing } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeContext';
import { useI18n } from '../../i18n/LanguageContext';

export default function UndoBar({
  visible,
  message,
  onUndo,
  onDismiss,
  duration = 5000,
}) {
  const { colors, isDark } = useTheme();
  const { t } = useI18n();
  const progressAnim = useRef(new Animated.Value(1)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      fadeAnim.setValue(0);
      progressAnim.setValue(1);

      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }).start();

      Animated.timing(progressAnim, {
        toValue: 0,
        duration,
        easing: Easing.linear,
        useNativeDriver: false,
      }).start(({ finished }) => {
        if (finished && onDismiss) {
          onDismiss();
        }
      });
    } else {
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 150,
        useNativeDriver: true,
      }).start();
    }
  }, [visible, duration, onDismiss]);

  if (!visible) return null;

  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <Animated.View
      style={[
        styles.container,
        {
          opacity: fadeAnim,
          backgroundColor: isDark ? '#2C2523' : '#322824',
        },
      ]}
    >
      <View style={styles.contentRow}>
        <Ionicons name="information-circle-outline" size={18} color="#FFB199" style={{ marginRight: 8 }} />
        <Text style={styles.messageText} numberOfLines={1}>
          {message}
        </Text>
        <TouchableOpacity
          style={styles.undoBtn}
          onPress={onUndo}
          activeOpacity={0.8}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={styles.undoBtnText}>{t('common.undo', '撤销')}</Text>
        </TouchableOpacity>
      </View>
      {/* 底部进度条 */}
      <View style={styles.track}>
        <Animated.View
          style={[
            styles.progressBar,
            {
              width: progressWidth,
              backgroundColor: colors.primary,
            },
          ]}
        />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 90,
    left: 16,
    right: 16,
    borderRadius: 14,
    overflow: 'hidden',
    zIndex: 999,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 8,
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  messageText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  undoBtn: {
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 8,
    marginLeft: 10,
  },
  undoBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFB199',
  },
  track: {
    height: 3,
    width: '100%',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  progressBar: {
    height: 3,
  },
});
