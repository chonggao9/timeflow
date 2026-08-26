import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { colors } from '../theme';
import { useI18n } from '../i18n/LanguageContext';
import ModeIcon from './ModeIcon';

const MODE_KEYS = ['walk', 'bike', 'drive', 'transit'];

export default function TransportPicker({ selected, onSelect }) {
  const { t } = useI18n();
  return (
    <View style={styles.container}>
      {MODE_KEYS.map(key => {
        const on = selected === key;
        return (
          <TouchableOpacity
            key={key}
            style={[styles.item, on && styles.itemSelected]}
            onPress={() => onSelect(key)}
            activeOpacity={0.7}
          >
            <View style={styles.iconWrap}>
              <ModeIcon mode={key} size={20} color={on ? colors.primaryStrong : colors.ink2} />
            </View>
            <Text style={[styles.label, on && styles.labelSelected]}>{t(`mode.${key}`)}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flexDirection: 'row', gap: 8 },
  item: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderRadius: 14,
    backgroundColor: '#FAF6F1',
    borderWidth: 1.5,
    borderColor: colors.line,
  },
  itemSelected: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
  },
  iconWrap: { height: 24, justifyContent: 'center' },
  label: { fontSize: 11, color: colors.ink2, fontWeight: '600', marginTop: 4 },
  labelSelected: { color: colors.primaryStrong },
});
