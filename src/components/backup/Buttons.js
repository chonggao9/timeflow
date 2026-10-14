// 备份弹层共享小组件：主/次/危险按钮、绿色 safe 提示条、三格条数摘要。
import React from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useI18n } from '../../i18n/LanguageContext';
import { useTheme } from '../../theme/ThemeContext';

// variant: 'primary' | 'ghost' | 'danger'(红字 ghost) | 'dangerFill'(红底白字)
export function Btn({ label, onPress, variant = 'primary', disabled, loading }) {
  const { colors } = useTheme();
  const bg = variant === 'primary' ? colors.primary
    : variant === 'dangerFill' ? colors.err
    : variant === 'danger' ? 'transparent'
    : colors.chip;
  const fg = variant === 'primary' || variant === 'dangerFill' ? '#FFFFFF'
    : variant === 'danger' ? colors.err
    : colors.ink2;
  return (
    <TouchableOpacity
      style={[
        base.btn,
        { backgroundColor: bg, borderWidth: variant === 'danger' ? 1 : 0, borderColor: colors.line },
        disabled && { opacity: 0.45 },
      ]}
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.8}
    >
      {loading
        ? <ActivityIndicator size="small" color={fg} />
        : <Text style={[base.btnText, { color: fg }]}>{label}</Text>}
    </TouchableOpacity>
  );
}

// 绿色提示条：恢复/清空前的 safe 备份说明
export function SafeNote({ text }) {
  const { colors } = useTheme();
  return (
    <View style={[base.safeNote, { backgroundColor: colors.okBg }]}>
      <Ionicons name="shield-checkmark" size={15} color={colors.ok} style={base.safeIcon} />
      <Text style={[base.safeText, { color: colors.ok }]}>{text}</Text>
    </View>
  );
}

// 三格条数摘要（打卡/专注/行程）
export function CountTiles({ counts }) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const items = [
    { label: t('dataBackup.tileRecords'), value: counts?.records ?? 0 },
    { label: t('dataBackup.tileFocus'), value: counts?.focus ?? 0 },
    { label: t('dataBackup.tileTrips'), value: counts?.trips ?? 0 },
  ];
  return (
    <View style={base.tilesRow}>
      {items.map((it) => (
        <View key={it.label} style={[base.tile, { backgroundColor: colors.chip }]}>
          <Text style={[base.tileValue, { color: colors.ink }]}>{it.value}</Text>
          <Text style={[base.tileLabel, { color: colors.ink2 }]}>{it.label}</Text>
        </View>
      ))}
    </View>
  );
}

export function SheetTitle({ title, sub }) {
  const { colors } = useTheme();
  return (
    <View style={base.titleWrap}>
      <Text style={[base.title, { color: colors.ink }]}>{title}</Text>
      {!!sub && <Text style={[base.sub, { color: colors.ink2 }]}>{sub}</Text>}
    </View>
  );
}

const base = StyleSheet.create({
  btn: { height: 48, borderRadius: 15, alignItems: 'center', justifyContent: 'center', flex: 1 },
  btnText: { fontSize: 15, fontWeight: '700' },
  safeNote: { flexDirection: 'row', alignItems: 'flex-start', gap: 7, borderRadius: 14, padding: 12 },
  safeIcon: { marginTop: 1 },
  safeText: { flex: 1, fontSize: 12.5, lineHeight: 18, fontWeight: '500' },
  tilesRow: { flexDirection: 'row', gap: 10 },
  tile: { flex: 1, borderRadius: 14, paddingVertical: 12, alignItems: 'center' },
  tileValue: { fontSize: 19, fontWeight: '800' },
  tileLabel: { fontSize: 11.5, marginTop: 2, fontWeight: '500' },
  titleWrap: { marginBottom: 14 },
  title: { fontSize: 17.5, fontWeight: '800' },
  sub: { fontSize: 12.5, marginTop: 3, lineHeight: 18 },
});
