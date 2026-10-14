// 「我的」页备份状态卡（设计稿 scard）：四态图标+标题+副文案，右侧 › 或 pill 按钮。
// 整卡可点进「数据与备份」；pill 点击 = 进页并立即触发一次备份（onQuick）。
import React, { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useI18n } from '../../i18n/LanguageContext';
import { useTheme } from '../../theme/ThemeContext';
import { radius, shadow } from '../../theme';
import { useBackupState } from '../../backup/state';
import { statusInfo, toneColors } from './util';

export default function BackupStatusCard({ onPress, onQuick }) {
  const { colors } = useTheme();
  const { t, lang } = useI18n();
  const state = useBackupState();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const info = statusInfo(state, t, lang);
  const tone = toneColors(colors, info.tone);

  const pillLabel = info.action === 'create' ? t('dataBackup.btnCreate')
    : info.action === 'retry' ? t('dataBackup.btnRetry')
    : t('dataBackup.btnQuick');

  return (
    <TouchableOpacity style={[styles.card, shadow.card]} onPress={onPress} activeOpacity={0.75}>
      <View style={[styles.iconHolder, { backgroundColor: tone.bg }]}>
        <Ionicons name={info.icon} size={22} color={tone.fg} />
      </View>
      <View style={styles.textWrap}>
        <Text style={styles.title} numberOfLines={1}>{info.title}</Text>
        <Text style={styles.sub} numberOfLines={2}>{info.sub}</Text>
      </View>
      {info.action ? (
        <TouchableOpacity
          style={[styles.pill, { backgroundColor: tone.bg }]}
          onPress={(e) => { e.stopPropagation?.(); onQuick(); }}
          activeOpacity={0.7}
        >
          <Text style={[styles.pillText, { color: tone.fg }]}>{pillLabel}</Text>
        </TouchableOpacity>
      ) : (
        <Ionicons name="chevron-forward" size={18} color={colors.ink3} />
      )}
    </TouchableOpacity>
  );
}

const makeStyles = (colors) => StyleSheet.create({
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: colors.surface, borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.line,
    padding: 14, marginBottom: 12,
  },
  iconHolder: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  textWrap: { flex: 1, minWidth: 0 },
  title: { fontSize: 15, fontWeight: '700', color: colors.ink },
  sub: { fontSize: 12, color: colors.ink2, marginTop: 2, lineHeight: 17 },
  pill: { paddingHorizontal: 13, paddingVertical: 7, borderRadius: 15 },
  pillText: { fontSize: 12.5, fontWeight: '700' },
});
