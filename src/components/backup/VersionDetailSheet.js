// 备份详情弹层：打开时才读该文件（取专注/行程条数），恢复 / 保存到文件 / 删除（两步确认）。
import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useI18n } from '../../i18n/LanguageContext';
import { useTheme } from '../../theme/ThemeContext';
import { readPackage, removeBackup } from '../../backup/files';
import Sheet from './Sheet';
import { Btn, CountTiles, SheetTitle } from './Buttons';
import { extractCounts } from '../../backup/format';
import { formatSize, formatTime } from './util';

export default function VersionDetailSheet({ version, starName, visible, onClose, onRestore, onSave, onDeleted }) {
  const { colors } = useTheme();
  const { t, lang } = useI18n();
  const [pkg, setPkg] = useState(null);
  const [loading, setLoading] = useState(false);
  const [delAsk, setDelAsk] = useState(false);

  useEffect(() => {
    if (!visible || !version) return;
    setDelAsk(false);
    setPkg(null);
    setLoading(true);
    readPackage(version.name)
      .then((p) => setPkg(p))
      .finally(() => setLoading(false));
  }, [visible, version?.name]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!version) return null;

  const kindLabel = version.kind === 'safe' ? t('dataBackup.kindSafe')
    : version.kind === 'manual' ? t('dataBackup.kindManual')
    : t('dataBackup.kindAuto');
  const counts = pkg ? extractCounts(pkg.data) : { records: version.records, focus: '?', trips: '?' };
  const isStar = version.name === starName;

  const handleDelete = async () => {
    if (!delAsk) { setDelAsk(true); return; }
    await removeBackup(version.name);
    onDeleted(version.name);
  };

  return (
    <Sheet visible={visible} onClose={onClose}>
      <SheetTitle
        title={t('dataBackup.verTitle', { time: formatTime(version.at, lang) })}
        sub={`${t('dataBackup.verSub', { kind: kindLabel, size: formatSize(version.size) })}${isStar ? ` · ${t('dataBackup.verStarTag')}` : ''}`}
      />

      {!loading && !pkg ? (
        <View style={[styles.errBox, { backgroundColor: colors.errBg }]}>
          <Text style={{ color: colors.err, fontSize: 13, lineHeight: 18 }}>{t('dataBackup.verReadFail')}</Text>
        </View>
      ) : (
        <CountTiles counts={counts} />
      )}

      <View style={styles.btnStack}>
        <Btn
          label={t('dataBackup.verRestore')}
          onPress={() => onRestore(pkg, version)}
          disabled={!pkg}
        />
        <Btn
          variant="ghost"
          label={t('dataBackup.verSave')}
          onPress={() => onSave(version)}
        />
        <Btn
          variant="danger"
          label={delAsk ? t('dataBackup.verDeleteConfirm') : t('dataBackup.verDelete')}
          onPress={handleDelete}
        />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  btnStack: { gap: 10, marginTop: 16 },
  errBox: { borderRadius: 14, padding: 14 },
});
