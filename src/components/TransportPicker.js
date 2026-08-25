import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { colors } from '../theme';

const MODES = [
  { key: 'walk',    label: '步行', icon: '🚶' },
  { key: 'bike',    label: '骑行', icon: '🚲' },
  { key: 'drive',   label: '驾车', icon: '🚗' },
  { key: 'transit', label: '公交', icon: '🚌' },
];

export default function TransportPicker({ selected, onSelect }) {
  return (
    <View style={styles.container}>
      {MODES.map(m => (
        <TouchableOpacity
          key={m.key}
          style={[styles.item, selected === m.key && styles.itemSelected]}
          onPress={() => onSelect(m.key)}
          activeOpacity={0.7}
        >
          <Text style={styles.icon}>{m.icon}</Text>
          <Text style={[styles.label, selected === m.key && styles.labelSelected]}>{m.label}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    gap: 8,
  },
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
  icon: { fontSize: 20 },
  label: { fontSize: 11, color: colors.ink2, fontWeight: '600', marginTop: 4 },
  labelSelected: { color: colors.primaryStrong },
});
