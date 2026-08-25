import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { colors } from '../theme';
import ModeIcon from './ModeIcon';

const MODES = [
  { key: 'walk',    label: '步行' },
  { key: 'bike',    label: '骑行' },
  { key: 'drive',   label: '驾车' },
  { key: 'transit', label: '公交' },
];

export default function TransportPicker({ selected, onSelect }) {
  return (
    <View style={styles.container}>
      {MODES.map(m => {
        const on = selected === m.key;
        return (
          <TouchableOpacity
            key={m.key}
            style={[styles.item, on && styles.itemSelected]}
            onPress={() => onSelect(m.key)}
            activeOpacity={0.7}
          >
            <View style={styles.iconWrap}>
              <ModeIcon mode={m.key} size={20} color={on ? colors.primaryStrong : colors.ink2} />
            </View>
            <Text style={[styles.label, on && styles.labelSelected]}>{m.label}</Text>
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
