// 数据与备份页顶部 hero 状态卡：与「我的」页状态卡共用 statusInfo 取数，
// 只展示图标/标题/副文案（操作由页面主按钮承担，不带 pill）。
import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useI18n } from '../../i18n/LanguageContext';
import { useTheme } from '../../theme/ThemeContext';
import { shadow } from '../../theme';
import { statusInfo, toneColors } from './util';

export default function HeroCard({ state }) {
  const { colors } = useTheme();
  const { t, lang } = useI18n();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const info = statusInfo(state, t, lang);
  const tone = toneColors(colors, info.tone);

  return (
    <View style={[styles.card, shadow.card]}>
      <View style={[styles.iconHolder, { backgroundColor: tone.bg }]}>
        <Ionicons name={info.icon} size={26} color={tone.fg} />
      </View>
      <View style={styles.textWrap}>
        <Text style={styles.title} numberOfLines={1}>{info.title}</Text>
        <Text style={styles.sub} numberOfLines={2}>{info.sub}</Text>
      </View>
    </View>
  );
}

const makeStyles = (colors) => StyleSheet.create({
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: colors.surface, borderRadius: 20,
    borderWidth: 1, borderColor: colors.line,
    padding: 16, marginBottom: 10,
  },
  iconHolder: { width: 50, height: 50, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  textWrap: { flex: 1, minWidth: 0 },
  title: { fontSize: 16.5, fontWeight: '800', color: colors.ink },
  sub: { fontSize: 12.5, color: colors.ink2, marginTop: 3, lineHeight: 18 },
});
