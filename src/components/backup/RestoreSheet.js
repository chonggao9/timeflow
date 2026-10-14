// 恢复弹层（3 步）：选方式（replace 默认 / merge）→ 执行中 → 完成（可撤销）。
// source: { pkg, fromFile } —— pkg 必须已通过 validatePackage。
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useI18n } from '../../i18n/LanguageContext';
import { useTheme } from '../../theme/ThemeContext';
import { extractCounts } from '../../backup/format';
import { previewRestore, restoreFromPackage, undoRestore } from '../../backup/restore';
import Sheet from './Sheet';
import { Btn, CountTiles, SafeNote, SheetTitle } from './Buttons';

export default function RestoreSheet({ visible, source, onClose, onUndoToast, onFinished }) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const [step, setStep] = useState('choose'); // choose | running | done | error
  const [mode, setMode] = useState('replace');
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);
  const [errMsg, setErrMsg] = useState('');
  const [undoing, setUndoing] = useState(false);

  useEffect(() => {
    if (!visible || !source?.pkg) return;
    setStep('choose');
    setMode('replace');
    setResult(null);
    previewRestore(source.pkg).then(setPreview).catch(() => setPreview(null));
  }, [visible, source]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!source?.pkg) return null;
  const pkg = source.pkg;
  const counts = extractCounts(pkg.data);

  const startRestore = async () => {
    setStep('running');
    const res = await restoreFromPackage(pkg, mode);
    if (res.ok) {
      setResult(res);
      setStep('done');
      onFinished?.();
    } else {
      setErrMsg(
        res.code === 'BUSY' ? t('restore.busy')
        : res.code === 'SAFE_FAIL' ? t('restore.failSafe')
        : t('restore.failRestore')
      );
      setStep('error');
    }
  };

  const handleUndo = async () => {
    if (undoing || !result?.safeName) return;
    setUndoing(true);
    const res = await undoRestore(result.safeName);
    setUndoing(false);
    if (res.ok) {
      onUndoToast?.();
      onFinished?.();
      onClose();
    } else {
      setErrMsg(t('restore.failRestore'));
      setStep('error');
    }
  };

  const replaceBody = preview && preview.replaceOverwritten > 0
    ? t('restore.modeReplaceBody', { n: preview.replaceOverwritten })
    : t('restore.modeReplaceBodyNone');
  const mergeBody = preview && preview.mergeAdded > 0
    ? t('restore.modeMergeBody', { n: preview.mergeAdded })
    : t('restore.modeMergeBodyNone');

  const Option = ({ value, title, body }) => {
    const active = mode === value;
    return (
      <TouchableOpacity
        style={[styles.option, { backgroundColor: active ? colors.primarySofter : colors.chip, borderColor: active ? colors.primary : 'transparent' }]}
        onPress={() => setMode(value)}
        activeOpacity={0.8}
      >
        <View style={[styles.radio, { borderColor: active ? colors.primary : colors.ink3 }]}>
          {active && <View style={[styles.radioDot, { backgroundColor: colors.primary }]} />}
        </View>
        <View style={styles.optionText}>
          <Text style={[styles.optionTitle, { color: colors.ink }]}>{title}</Text>
          <Text style={[styles.optionBody, { color: colors.ink2 }]}>{body}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <Sheet visible={visible} onClose={step === 'running' ? () => {} : onClose}>
      {step === 'choose' && (
        <>
          <SheetTitle
            title={t('restore.title')}
            sub={source.fromFile ? t('restore.sourceFile') : t('restore.sourceLocal')}
          />
          <CountTiles counts={counts} />
          <View style={styles.options}>
            <Option value="replace" title={t('restore.modeReplaceTitle')} body={replaceBody} />
            <Option value="merge" title={t('restore.modeMergeTitle')} body={mergeBody} />
          </View>
          <SafeNote text={t('restore.safeNote')} />
          <View style={styles.row}>
            <Btn variant="ghost" label={t('common.cancel')} onPress={onClose} />
            <Btn label={t('restore.confirm')} onPress={startRestore} />
          </View>
        </>
      )}

      {step === 'running' && (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.centerTitle, { color: colors.ink }]}>{t('restore.running')}</Text>
          <Text style={[styles.centerSub, { color: colors.ink2 }]}>{t('restore.runningSub')}</Text>
        </View>
      )}

      {step === 'done' && (
        <View>
          <View style={styles.center}>
            <View style={[styles.doneIcon, { backgroundColor: colors.okBg }]}>
              <Ionicons name="checkmark" size={40} color={colors.ok} />
            </View>
            <Text style={[styles.centerTitle, { color: colors.ink }]}>{t('restore.doneTitle')}</Text>
            <Text style={[styles.centerSub, { color: colors.ink2 }]}>
              {t('restore.doneBody', { n: result?.newCounts?.records ?? counts.records })}
            </Text>
          </View>
          <View style={styles.row}>
            <Btn variant="ghost" label={t('restore.undo')} onPress={handleUndo} loading={undoing} />
            <Btn label={t('common.done')} onPress={onClose} />
          </View>
        </View>
      )}

      {step === 'error' && (
        <View>
          <View style={styles.center}>
            <View style={[styles.doneIcon, { backgroundColor: colors.errBg }]}>
              <Ionicons name="alert-circle" size={36} color={colors.err} />
            </View>
            <Text style={[styles.centerSub, { color: colors.ink2, textAlign: 'center' }]}>{errMsg}</Text>
          </View>
          <View style={styles.row}>
            <Btn label={t('common.done')} onPress={onClose} />
          </View>
        </View>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  options: { gap: 10, marginTop: 14, marginBottom: 12 },
  option: { flexDirection: 'row', gap: 11, borderRadius: 15, padding: 13, borderWidth: 1.5 },
  radio: { width: 19, height: 19, borderRadius: 10, borderWidth: 2, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  radioDot: { width: 9, height: 9, borderRadius: 5 },
  optionText: { flex: 1, minWidth: 0 },
  optionTitle: { fontSize: 14, fontWeight: '700' },
  optionBody: { fontSize: 12, lineHeight: 17, marginTop: 3 },
  row: { flexDirection: 'row', gap: 10, marginTop: 16 },
  center: { alignItems: 'center', paddingVertical: 26, gap: 6 },
  centerTitle: { fontSize: 17, fontWeight: '800', marginTop: 6 },
  centerSub: { fontSize: 13, lineHeight: 19 },
  doneIcon: { width: 74, height: 74, borderRadius: 37, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
});
