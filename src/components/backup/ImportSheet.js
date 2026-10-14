// 导入文件弹层（2 步）：未选文件 → 说明 + 选择文件；已选中 → 文件卡 + 三格摘要 + 继续。
// 选文件动作由父级实现（expo-document-picker）；picked = { pkg, name, size } | null。
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useI18n } from '../../i18n/LanguageContext';
import { useTheme } from '../../theme/ThemeContext';
import { extractCounts } from '../../backup/format';
import Sheet from './Sheet';
import { Btn, CountTiles, SheetTitle } from './Buttons';
import { formatSize, formatTime } from './util';

export default function ImportSheet({ visible, picked, invalid, onClose, onPickFile, onProceed }) {
  const { colors } = useTheme();
  const { t, lang } = useI18n();

  return (
    <Sheet visible={visible} onClose={onClose}>
      {!picked ? (
        <>
          <SheetTitle title={t('import.title')} sub={t('import.desc')} />
          {invalid && (
            <View style={[styles.errRow, { backgroundColor: colors.errBg }]}>
              <Ionicons name="alert-circle" size={15} color={colors.err} />
              <Text style={{ color: colors.err, fontSize: 12.5, flex: 1 }}>{t('import.invalid')}</Text>
            </View>
          )}
          <View style={styles.row}>
            <Btn variant="ghost" label={t('common.cancel')} onPress={onClose} />
            <Btn label={t('import.pick')} onPress={onPickFile} />
          </View>
        </>
      ) : (
        <>
          <SheetTitle title={t('import.found')} />
          <View style={[styles.fileCard, { backgroundColor: colors.chip }]}>
            <View style={[styles.fileIcon, { backgroundColor: colors.okBg }]}>
              <Ionicons name="checkmark-circle" size={20} color={colors.ok} />
            </View>
            <View style={styles.fileText}>
              <Text style={[styles.fileName, { color: colors.ink }]} numberOfLines={1}>{picked.name}</Text>
              <Text style={[styles.fileSub, { color: colors.ink2 }]}>
                {t('import.createdOn', {
                  time: formatTime(picked.pkg?.createdAt ? Date.parse(picked.pkg.createdAt) : null, lang),
                  device: picked.pkg?.device || '?',
                })}
                {` · ${formatSize(picked.size)}`}
              </Text>
            </View>
          </View>
          <View style={styles.tiles}>
            <CountTiles counts={extractCounts(picked.pkg?.data)} />
          </View>
          <View style={styles.row}>
            <Btn variant="ghost" label={t('common.cancel')} onPress={onClose} />
            <Btn label={t('import.cont')} onPress={() => onProceed(picked)} />
          </View>
        </>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 10, marginTop: 16 },
  errRow: { flexDirection: 'row', alignItems: 'center', gap: 7, borderRadius: 12, padding: 11, marginTop: 2 },
  fileCard: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 14, padding: 13 },
  fileIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  fileText: { flex: 1, minWidth: 0 },
  fileName: { fontSize: 13.5, fontWeight: '700' },
  fileSub: { fontSize: 11.5, marginTop: 2, lineHeight: 16 },
  tiles: { marginTop: 12 },
});
