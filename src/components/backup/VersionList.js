// 「备份记录」列表（设计稿 ver 区）：图标（safe→undo 其余→file）、时间加粗、
// 「N 条打卡 · X MB」、标签（自动=蓝/手动=棕/恢复前=黄 + 最完整=绿 star）。
import React, { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useI18n } from '../../i18n/LanguageContext';
import { useTheme } from '../../theme/ThemeContext';
import { formatSize, formatTime } from './util';

// 标签配色：自动=蓝、手动=棕、恢复前=黄、最完整=绿（star 叠加显示），全部走 theme token
function tagStyle(colors, tone) {
  switch (tone) {
    case 'blue': return { bg: colors.infoBg, fg: colors.info };
    case 'brown': return { bg: colors.icoBg, fg: colors.ico };
    case 'warn': return { bg: colors.warnBg, fg: colors.warn };
    default: return { bg: colors.okBg, fg: colors.ok };
  }
}

function Tag({ label, tone, colors }) {
  const c = tagStyle(colors, tone);
  return (
    <View style={[baseStyles.tag, { backgroundColor: c.bg }]}>
      <Text style={[baseStyles.tagText, { color: c.fg }]}>{label}</Text>
    </View>
  );
}

// starName / overManualSafe 由父级传入（父级已统一算一次 planPrune，避免重复扫描）
export default function VersionList({ versions, onPress, starName, overManualSafe }) {
  const { colors } = useTheme();
  const { t, lang } = useI18n();
  const styles = useMemo(() => ({ ...baseStyles, ...makeStyles(colors) }), [colors]);

  const totalSize = versions.reduce((s, v) => s + (v.size || 0), 0);

  if (!versions.length) {
    return (
      <View style={styles.empty}>
        <Ionicons name="file-tray-outline" size={30} color={colors.ink3} />
        <Text style={styles.emptyTitle}>{t('dataBackup.versionsEmptyTitle')}</Text>
        <Text style={styles.emptyBody}>{t('dataBackup.versionsEmptyBody')}</Text>
      </View>
    );
  }

  return (
    <View>
      <View style={styles.listCard}>
        {versions.map((v, i) => {
          const kindTone = v.kind === 'safe' ? 'warn' : v.kind === 'manual' ? 'brown' : 'blue';
          const kindLabel = v.kind === 'safe' ? t('dataBackup.tagSafe')
            : v.kind === 'manual' ? t('dataBackup.tagManual') : t('dataBackup.tagAuto');
          return (
            <View key={v.name}>
              {i > 0 && <View style={styles.divider} />}
              <TouchableOpacity style={styles.row} onPress={() => onPress(v)} activeOpacity={0.6}>
                <View style={[styles.iconHolder, { backgroundColor: colors.icoBg }]}>
                  <Ionicons
                    name={v.kind === 'safe' ? 'arrow-undo' : 'document-text-outline'}
                    size={17}
                    color={colors.ico}
                  />
                </View>
                <View style={styles.rowText}>
                  <Text style={styles.rowTitle}>{formatTime(v.at, lang)}</Text>
                  <Text style={styles.rowSub}>
                    {t('dataBackup.rowSub', { n: v.records, size: formatSize(v.size) })}
                  </Text>
                </View>
                <View style={styles.tagCol}>
                  <Tag label={kindLabel} tone={kindTone} colors={colors} />
                  {v.name === starName && <Tag label={t('dataBackup.tagStar')} tone="ok" colors={colors} />}
                </View>
                <Ionicons name="chevron-forward" size={16} color={colors.ink3} />
              </TouchableOpacity>
            </View>
          );
        })}
      </View>
      <Text style={styles.note}>
        {t('dataBackup.versionsNote', { n: versions.length, size: formatSize(totalSize) })}
      </Text>
      {overManualSafe && <Text style={[styles.note, { color: colors.warn }]}>{t('dataBackup.overNote')}</Text>}
    </View>
  );
}

const baseStyles = StyleSheet.create({
  listCard: { borderRadius: 20, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 12, paddingHorizontal: 14 },
  iconHolder: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  rowText: { flex: 1, minWidth: 0 },
  rowTitle: { fontSize: 14, fontWeight: '700' },
  rowSub: { fontSize: 12, marginTop: 2 },
  tagCol: { alignItems: 'flex-end', gap: 4 },
  tag: { borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2.5 },
  tagText: { fontSize: 10.5, fontWeight: '600' },
  divider: { height: 1, marginHorizontal: 14 },
  empty: { alignItems: 'center', paddingVertical: 28, gap: 4 },
  emptyTitle: { fontSize: 14, fontWeight: '700', marginTop: 6 },
  emptyBody: { fontSize: 12, textAlign: 'center' },
  note: { fontSize: 11.5, lineHeight: 17, marginTop: 8, marginHorizontal: 4 },
});

// 依赖 colors 的部分在 makeStyles 中
const makeStyles = (colors) => StyleSheet.create({
  listCard: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
  rowTitle: { color: colors.ink },
  rowSub: { color: colors.ink2 },
  divider: { backgroundColor: colors.line },
  emptyTitle: { color: colors.ink2 },
  emptyBody: { color: colors.ink3 },
  note: { color: colors.ink3 },
});
