import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ToastAndroid,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useI18n } from '../i18n/LanguageContext';
import { useTheme } from '../theme/ThemeContext';
import { decrypt, BadPassphraseError } from '../backup/crypto';
import {
  createPreRestoreSnapshot,
  restoreFromRaw,
  getVersionRawContent,
} from '../backup/backup';

export default function BackupRestoreSheet({
  visible,
  versionItem,
  currentCounts = { records: 0, focus: 0, trips: 0 },
  onClose,
  onRestored,
}) {
  const { t } = useI18n();
  const { colors } = useTheme();

  const [step, setStep] = useState(1); // 1: 验密, 2: 模式, 3: 对照确认, 4: 恢复中, 5: 完成
  const [passphrase, setPassphrase] = useState('');
  const [passError, setPassError] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [mode, setMode] = useState('merge'); // 'merge' | 'overwrite'
  const [rawContent, setRawContent] = useState(null);
  const [decryptedPlaintext, setDecryptedPlaintext] = useState(null);
  const [createdSnapshotName, setCreatedSnapshotName] = useState(null);
  const [restoredResult, setRestoredResult] = useState(null);

  // 每次打开时重置状态
  useEffect(() => {
    if (visible) {
      setStep(1);
      setPassphrase('');
      setPassError(false);
      setVerifying(false);
      setMode('merge');
      setRawContent(null);
      setDecryptedPlaintext(null);
      setCreatedSnapshotName(null);
      setRestoredResult(null);
    }
  }, [visible, versionItem]);

  if (!visible || !versionItem) return null;

  const showToastMsg = (msg) => {
    if (Platform.OS === 'android') {
      ToastAndroid.show(msg, ToastAndroid.SHORT);
    } else {
      Alert.alert(t('common.tip', '提示'), msg);
    }
  };

  // 格式化时间
  const formatTimeStr = (isoOrMs) => {
    if (!isoOrMs) return '';
    const d = new Date(isoOrMs);
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const h = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    return `${m}-${day} ${h}:${min}`;
  };

  const vCounts = versionItem.counts || { records: 0, focus: 0, trips: 0 };
  const currentTotal = currentCounts.records || 0;
  const backupTotal = vCounts.records || 0;
  const addEstimate = Math.max(0, backupTotal - currentTotal);
  const delEstimate = Math.max(0, currentTotal - backupTotal);

  // 1. 验证密码
  const handleVerifyPass = async () => {
    if (!passphrase.trim() || verifying) return;
    setVerifying(true);
    setPassError(false);

    try {
      const raw = await getVersionRawContent(versionItem);
      let parsed;
      try {
        parsed = JSON.parse(raw);
      } catch (e) {
        throw new BadPassphraseError('备份文件损坏');
      }

      const plaintext = decrypt(passphrase.trim(), parsed);
      setRawContent(raw);
      setDecryptedPlaintext(plaintext);
      setStep(2);
    } catch (e) {
      setPassError(true);
    } finally {
      setVerifying(false);
    }
  };

  // 2. 选择恢复方式 -> 确认对照
  const handleToStep3 = () => {
    setStep(3);
  };

  // 3. 开始恢复（先保存快照，再恢复）
  const handleDoRestore = async () => {
    setStep(4);
    try {
      // 3.1 保存快照
      const snapName = await createPreRestoreSnapshot(passphrase.trim()).catch(() => null);
      setCreatedSnapshotName(snapName);

      // 3.2 执行恢复
      const res = await restoreFromRaw(rawContent, passphrase.trim(), mode);
      setRestoredResult(res);
      setStep(5);
      if (onRestored) {
        onRestored(res);
      }
    } catch (err) {
      Alert.alert(t('common.tip', '提示'), err.message || '恢复失败，请重试');
      setStep(3);
    }
  };

  // 4. 回退到恢复前快照
  const handleUndo = async () => {
    if (!createdSnapshotName) {
      onClose();
      return;
    }
    try {
      const raw = await getVersionRawContent({
        name: createdSnapshotName,
        sources: ['local'],
      });
      await restoreFromRaw(raw, passphrase.trim(), 'overwrite');
      showToastMsg(t('backup.undoDoneToast', '已回退到恢复前的状态'));
      if (onRestored) {
        onRestored();
      }
      onClose();
    } catch (e) {
      Alert.alert(t('common.tip', '提示'), '回退快照失败: ' + e.message);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.overlay}
      >
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />

        <View style={[styles.sheet, { backgroundColor: colors.surface }]}>
          {/* STEP 1: 验证密码 */}
          {step === 1 && (
            <View>
              <Text style={[styles.title, { color: colors.ink }]}>
                {t('backup.restoreSheetTitle', '恢复这个版本')}
              </Text>
              <Text style={[styles.subText, { color: colors.ink3 }]}>
                {formatTimeStr(versionItem.createdAt || versionItem.modifiedAt)} · {versionItem.device || '设备'}
              </Text>

              {/* 三格概览卡片 */}
              <View style={[styles.vsum, { backgroundColor: colors.bg }]}>
                <View style={styles.vsumItem}>
                  <Text style={[styles.vsumNum, { color: colors.ink }]}>{vCounts.records.toLocaleString()}</Text>
                  <Text style={[styles.vsumLbl, { color: colors.ink3 }]}>{t('tab.checkin', '打卡')}</Text>
                </View>
                <View style={styles.vsumItem}>
                  <Text style={[styles.vsumNum, { color: colors.ink }]}>{vCounts.focus.toLocaleString()}</Text>
                  <Text style={[styles.vsumLbl, { color: colors.ink3 }]}>{t('home.sceneFocus', '专注').replace(/[^\u4e00-\u9fa5]/g, '') || '专注'}</Text>
                </View>
                <View style={styles.vsumItem}>
                  <Text style={[styles.vsumNum, { color: colors.ink }]}>{vCounts.trips.toLocaleString()}</Text>
                  <Text style={[styles.vsumLbl, { color: colors.ink3 }]}>{t('home.sceneTravel', '行程').replace(/[^\u4e00-\u9fa5]/g, '') || '行程'}</Text>
                </View>
              </View>

              <Text style={[styles.fieldLabel, { color: colors.ink2 }]}>
                {t('backup.password', '备份密码')}
              </Text>
              <TextInput
                style={[
                  styles.input,
                  {
                    backgroundColor: colors.surface,
                    borderColor: passError ? '#CF3B3B' : colors.line,
                    color: colors.ink,
                  },
                ]}
                value={passphrase}
                onChangeText={(val) => {
                  setPassphrase(val);
                  setPassError(false);
                }}
                secureTextEntry
                placeholder={t('backup.password', '输入备份密码')}
                placeholderTextColor={colors.ink3}
                autoFocus
              />
              {passError && (
                <Text style={styles.errText}>
                  {t('backup.restoreWrongPass', '密码不正确，请重试')}
                </Text>
              )}

              <View style={styles.btnRow}>
                <TouchableOpacity
                  style={[styles.btnSec, { backgroundColor: colors.chip }]}
                  onPress={onClose}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.btnSecText, { color: colors.ink }]}>{t('common.cancel', '取消')}</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.btnPri,
                    { backgroundColor: colors.primary },
                    (!passphrase.trim() || verifying) && { opacity: 0.5 },
                  ]}
                  onPress={handleVerifyPass}
                  disabled={!passphrase.trim() || verifying}
                  activeOpacity={0.7}
                >
                  {verifying ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={styles.btnPriText}>验证</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* STEP 2: 选择恢复方式 */}
          {step === 2 && (
            <View>
              <Text style={[styles.title, { color: colors.ink }]}>
                {t('backup.restoreModeTitle', '选择恢复方式')}
              </Text>
              <Text style={[styles.subText, { color: colors.ink3 }]}>
                {formatTimeStr(versionItem.createdAt || versionItem.modifiedAt)} · {backupTotal.toLocaleString()} 条打卡
              </Text>

              {/* 方式 1: 合并 */}
              <TouchableOpacity
                style={[
                  styles.optCard,
                  { borderColor: mode === 'merge' ? colors.primary : colors.line },
                  mode === 'merge' && { backgroundColor: '#FFF8F6' },
                ]}
                onPress={() => setMode('merge')}
                activeOpacity={0.7}
              >
                <View
                  style={[
                    styles.radioCircle,
                    { borderColor: mode === 'merge' ? colors.primary : colors.ink3 },
                  ]}
                >
                  {mode === 'merge' && <View style={[styles.radioDot, { backgroundColor: colors.primary }]} />}
                </View>
                <View style={styles.optContent}>
                  <Text style={[styles.optTitle, { color: colors.ink }]}>
                    {t('backup.restoreModeMerge', '合并（推荐）')}
                  </Text>
                  <Text style={[styles.optDesc, { color: colors.ink2 }]}>
                    {t('backup.restoreModeMergeDesc', '保留当前数据，只补入备份里缺少的记录。')}
                    {addEstimate > 0 ? ` 预计补入 ${addEstimate} 条。` : ' 数据将安全合并。'}
                  </Text>
                </View>
              </TouchableOpacity>

              {/* 方式 2: 完全覆盖 */}
              <TouchableOpacity
                style={[
                  styles.optCard,
                  { borderColor: mode === 'overwrite' ? '#CF3B3B' : colors.line },
                  mode === 'overwrite' && { backgroundColor: '#FFF6F5' },
                ]}
                onPress={() => setMode('overwrite')}
                activeOpacity={0.7}
              >
                <View
                  style={[
                    styles.radioCircle,
                    { borderColor: mode === 'overwrite' ? '#CF3B3B' : colors.ink3 },
                  ]}
                >
                  {mode === 'overwrite' && <View style={[styles.radioDot, { backgroundColor: '#CF3B3B' }]} />}
                </View>
                <View style={styles.optContent}>
                  <Text style={[styles.optTitle, { color: '#CF3B3B' }]}>
                    {t('backup.restoreModeOverwrite', '完全覆盖')}
                  </Text>
                  <Text style={[styles.optDesc, { color: colors.ink2 }]}>
                    {t('backup.restoreModeOverwriteDesc', '以备份为准替换当前全部数据。当前多出的记录将被删除。')}
                    {delEstimate > 0 ? ` 本地多出的 ${delEstimate} 条记录将被替换删除。` : ''}
                  </Text>
                </View>
              </TouchableOpacity>

              <View style={styles.btnRow}>
                <TouchableOpacity
                  style={[styles.btnSec, { backgroundColor: colors.chip }]}
                  onPress={onClose}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.btnSecText, { color: colors.ink }]}>{t('common.cancel', '取消')}</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.btnPri, { backgroundColor: colors.primary }]}
                  onPress={handleToStep3}
                  activeOpacity={0.7}
                >
                  <Text style={styles.btnPriText}>下一步</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* STEP 3: 对照确认 */}
          {step === 3 && (
            <View>
              <Text style={[styles.title, { color: colors.ink }]}>
                {t('backup.restoreConfirmBtn', '开始恢复')}
              </Text>
              <Text style={[styles.subText, { color: colors.ink3 }]}>
                {mode === 'overwrite'
                  ? '覆盖模式会替换当前所有数据。'
                  : '合并模式不会删除任何现有记录。'}
              </Text>

              {/* 条数对照卡 */}
              <View style={[styles.vsum, { backgroundColor: colors.bg }]}>
                <View style={styles.vsumItem}>
                  <Text style={[styles.vsumNum, { color: colors.ink }]}>{currentTotal.toLocaleString()}</Text>
                  <Text style={[styles.vsumLbl, { color: colors.ink3 }]}>恢复前</Text>
                </View>
                <View style={[styles.vsumItem, { justifyContent: 'center' }]}>
                  <Text style={[styles.arrowSym, { color: colors.primary }]}>→</Text>
                  <Text style={[styles.vsumLbl, { color: colors.ink3 }]}>
                    {mode === 'overwrite' ? '完全覆盖' : '合并补入'}
                  </Text>
                </View>
                <View style={styles.vsumItem}>
                  <Text style={[styles.vsumNum, { color: colors.ink }]}>
                    {(mode === 'overwrite' ? backupTotal : currentTotal + addEstimate).toLocaleString()}
                  </Text>
                  <Text style={[styles.vsumLbl, { color: colors.ink3 }]}>恢复后</Text>
                </View>
              </View>

              {/* 绿色盾牌提示 */}
              <View style={styles.safeBox}>
                <Ionicons name="shield-checkmark" size={17} color="#25915F" style={{ marginRight: 6, marginTop: 1 }} />
                <Text style={styles.safeText}>
                  {t('backup.restoreConfirmPreSnapshot', '开始前会先自动保存「恢复前快照」，不满意可以一键回退。')}
                </Text>
              </View>

              <View style={styles.btnRow}>
                <TouchableOpacity
                  style={[styles.btnSec, { backgroundColor: colors.chip }]}
                  onPress={onClose}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.btnSecText, { color: colors.ink }]}>{t('common.cancel', '取消')}</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.btnPri,
                    { backgroundColor: mode === 'overwrite' ? '#CF3B3B' : colors.primary },
                  ]}
                  onPress={handleDoRestore}
                  activeOpacity={0.7}
                >
                  <Text style={styles.btnPriText}>
                    {mode === 'overwrite'
                      ? t('backup.restoreOverwriteBtn', '覆盖并恢复')
                      : t('backup.restoreConfirmBtn', '开始恢复')}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* STEP 4: 正在恢复中 */}
          {step === 4 && (
            <View style={styles.loadingBox}>
              <ActivityIndicator size="large" color={colors.primary} style={{ marginBottom: 16 }} />
              <Text style={[styles.title, { textAlign: 'center', color: colors.ink }]}>
                {t('backup.restoringTitle', '正在恢复…')}
              </Text>
              <Text style={[styles.subText, { textAlign: 'center', color: colors.ink3, marginTop: 6 }]}>
                {t('backup.restoringDesc', '先保存快照，再写入数据，请不要关闭应用。')}
              </Text>
            </View>
          )}

          {/* STEP 5: 恢复完成 */}
          {step === 5 && (
            <View>
              <View style={styles.doneIconWrap}>
                <View style={styles.doneCircle}>
                  <Ionicons name="checkmark" size={32} color="#25915F" />
                </View>
                <Text style={[styles.title, { textAlign: 'center', color: colors.ink, marginTop: 10 }]}>
                  {t('backup.restoreDoneTitle', '恢复完成')}
                </Text>
                <Text style={[styles.subText, { textAlign: 'center', color: colors.ink2, marginTop: 6 }]}>
                  {t('backup.restoreDoneSub', { n: (restoredResult?.counts?.records || backupTotal).toLocaleString() })}
                </Text>
              </View>

              <View style={styles.btnRow}>
                <TouchableOpacity
                  style={[styles.btnSec, { backgroundColor: colors.chip }]}
                  onPress={handleUndo}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.btnSecText, { color: colors.ink }]}>
                    {t('backup.btnUndoRestore', '回退到恢复前')}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.btnPri, { backgroundColor: colors.primary }]}
                  onPress={onClose}
                  activeOpacity={0.7}
                >
                  <Text style={styles.btnPriText}>{t('common.done', '完成')}</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(30, 20, 10, 0.45)',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  sheet: {
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: Platform.OS === 'ios' ? 34 : 24,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 4,
  },
  subText: {
    fontSize: 13,
    marginBottom: 14,
    lineHeight: 18,
  },
  vsum: {
    flexDirection: 'row',
    borderRadius: 14,
    padding: 12,
    marginBottom: 14,
    alignItems: 'center',
  },
  vsumItem: {
    flex: 1,
    alignItems: 'center',
  },
  vsumNum: {
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 2,
  },
  vsumLbl: {
    fontSize: 11.5,
  },
  arrowSym: {
    fontSize: 18,
    fontWeight: '700',
  },
  fieldLabel: {
    fontSize: 12.5,
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 15,
    marginBottom: 12,
  },
  errText: {
    color: '#CF3B3B',
    fontSize: 12.5,
    marginTop: -6,
    marginBottom: 10,
  },
  optCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 13,
    borderWidth: 1.5,
    borderRadius: 16,
    marginBottom: 10,
  },
  radioCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  optContent: {
    flex: 1,
  },
  optTitle: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 2,
  },
  optDesc: {
    fontSize: 12,
    lineHeight: 16,
  },
  safeBox: {
    flexDirection: 'row',
    backgroundColor: '#E5F4EA',
    borderRadius: 13,
    padding: 10,
    marginBottom: 14,
    alignItems: 'flex-start',
  },
  safeText: {
    flex: 1,
    fontSize: 12.5,
    color: '#1F6F4A',
    lineHeight: 17,
  },
  btnRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  btnSec: {
    flex: 1,
    height: 46,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  btnSecText: {
    fontSize: 15,
    fontWeight: '600',
  },
  btnPri: {
    flex: 1,
    height: 46,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  btnPriText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  loadingBox: {
    paddingVertical: 36,
    alignItems: 'center',
  },
  doneIconWrap: {
    alignItems: 'center',
    paddingVertical: 16,
  },
  doneCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#E5F4EA',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
