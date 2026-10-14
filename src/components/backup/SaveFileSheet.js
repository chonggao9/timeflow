// 保存备份文件弹层：文件卡 + 三个去向行（微信/QQ、手机文件、网盘）。
// 去向点击回调由父级实现（阶段 2 占位提示，阶段 3 接 expo-sharing）。
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useI18n } from '../../i18n/LanguageContext';
import { useTheme } from '../../theme/ThemeContext';
import Sheet from './Sheet';
import { SheetTitle } from './Buttons';
import { formatSize, formatTime } from './util';

const DESTS = [
  { key: 'wechat', icon: 'chatbubbles-outline', labelKey: 'save.destWechat' },
  { key: 'files', icon: 'folder-outline', labelKey: 'save.destFiles' },
  { key: 'cloud', icon: 'cloud-upload-outline', labelKey: 'save.destCloud' },
];

export default function SaveFileSheet({ visible, version, onClose, onPickDest }) {
  const { colors } = useTheme();
  const { t, lang } = useI18n();
  if (!version) return null;

  return (
    <Sheet visible={visible} onClose={onClose}>
      <SheetTitle title={t('save.title')} />
      <View style={[styles.fileCard, { backgroundColor: colors.chip }]}>
        <View style={[styles.fileIcon, { backgroundColor: colors.icoBg }]}>
          <Ionicons name="document-text-outline" size={20} color={colors.ico} />
        </View>
        <View style={styles.fileText}>
          <Text style={[styles.fileName, { color: colors.ink }]} numberOfLines={1}>{version.name}</Text>
          <Text style={[styles.fileSub, { color: colors.ink2 }]}>
            {t('dataBackup.rowSub', { n: version.records, size: formatSize(version.size) })}
            {` · ${formatTime(version.at, lang)}`}
          </Text>
        </View>
      </View>

      <View style={styles.destList}>
        {DESTS.map((d, i) => (
          <View key={d.key}>
            {i > 0 && <View style={[styles.divider, { backgroundColor: colors.line }]} />}
            <TouchableOpacity style={styles.destRow} onPress={() => onPickDest(d, version)} activeOpacity={0.6}>
              <Ionicons name={d.icon} size={19} color={colors.ico} />
              <Text style={[styles.destLabel, { color: colors.ink }]}>{t(d.labelKey)}</Text>
              <Ionicons name="chevron-forward" size={16} color={colors.ink3} />
            </TouchableOpacity>
          </View>
        ))}
      </View>

      <Text style={[styles.note, { color: colors.ink3 }]}>{t('save.note')}</Text>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  fileCard: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 14, padding: 13 },
  fileIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  fileText: { flex: 1, minWidth: 0 },
  fileName: { fontSize: 13.5, fontWeight: '700' },
  fileSub: { fontSize: 11.5, marginTop: 2 },
  destList: { marginTop: 14, borderRadius: 16, overflow: 'hidden' },
  destRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13, paddingHorizontal: 4 },
  destLabel: { flex: 1, fontSize: 14, fontWeight: '600' },
  divider: { height: 1, marginHorizontal: 4 },
  note: { fontSize: 11.5, lineHeight: 17, marginTop: 12, marginHorizontal: 2 },
});
