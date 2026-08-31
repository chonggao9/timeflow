import React, { useState, useCallback, useMemo, useRef } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, Alert, Modal, TextInput, Linking,
} from 'react-native';
import Constants from 'expo-constants';
import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getRecords, clearAll } from '../storage/store';
import { getProfile, saveProfile } from '../storage/profile';
import { getAmapKey, setAmapKey, getAmapLocKeyRaw, setAmapLocKey } from '../config';
import { checkForUpdate } from '../utils/updater';
import { diagnoseLocation } from '../utils/location';
import { refreshWidget } from '../utils/widgetRefresh';
import { makeLocalBackup, shareBackup, readAndRestore, readAndRestoreFromRaw } from '../backup/backup';
import {
  backupNow, getBackupPassphrase, setBackupPassphrase, setAutoBackup, isAutoBackupEnabled, getLastBackupTime,
} from '../backup/schedule';
import {
  getWebDavConfig, saveWebDavConfig, clearWebDavConfig, testConnectionWith, getLatestBackupRaw, WebDavError,
} from '../backup/webdav';
import { useI18n } from '../i18n/LanguageContext';
import { radius, shadow } from '../theme';
import { useTheme } from '../theme/ThemeContext';
import PrivacyAgreement from './PrivacyAgreement';

function Row({ icon, label, value, onPress, danger }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <TouchableOpacity style={styles.row} onPress={onPress} activeOpacity={0.6}>
      <View style={styles.rowIcon}>
        <Ionicons name={icon} size={19} color={danger ? colors.danger : colors.primary} />
      </View>
      <Text style={[styles.rowLabel, danger && { color: colors.danger }]}>{label}</Text>
      {value != null && <Text style={styles.rowValue}>{value}</Text>}
      {onPress && <Ionicons name="chevron-forward" size={17} color={colors.ink3} />}
    </TouchableOpacity>
  );
}

const LANG_OPTIONS = [
  { key: 'system', labelKey: 'language.system' },
  { key: 'zh', labelKey: 'language.zh' },
  { key: 'en', labelKey: 'language.en' },
];

const THEME_OPTIONS = [
  { key: 'system', labelKey: 'theme.system' },
  { key: 'light', labelKey: 'theme.light' },
  { key: 'dark', labelKey: 'theme.dark' },
];

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const { t, lang, isSystem, setLang } = useI18n();
  const { colors, theme, isSystem: themeIsSystem, setTheme } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [nickname, setNickname] = useState('');
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [showLang, setShowLang] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [showAmapKey, setShowAmapKey] = useState(false);
  const [amapKeyDraft, setAmapKeyDraft] = useState('');
  const [amapKeySet, setAmapKeySet] = useState(false);
  const [amapKeyInvalid, setAmapKeyInvalid] = useState(false);
  const [diagRunning, setDiagRunning] = useState(false);
  const [showTheme, setShowTheme] = useState(false);
  const [showLocKey, setShowLocKey] = useState(false);
  const [locKeyDraft, setLocKeyDraft] = useState('');
  const [locKeyState, setLocKeyState] = useState('default'); // 'default' | 'set' | 'disabled'
  const [locKeyInvalid, setLocKeyInvalid] = useState(false);
  const [showLocationDebug, setShowLocationDebug] = useState(false);
  const [showWidgetGuide, setShowWidgetGuide] = useState(false);

  // 数据备份
  const [autoEnabled, setAutoEnabled] = useState(false);
  const [hasPassphrase, setHasPassphrase] = useState(false);
  const [cloudSet, setCloudSet] = useState(false);
  const [lastBackup, setLastBackup] = useState(0);
  const [backupBusy, setBackupBusy] = useState(false);
  const pendingActionRef = useRef(null); // 'auto' | 'backup' | 'export' 待口令设置后执行
  // 备份口令弹窗
  const [showPassphrase, setShowPassphrase] = useState(false);
  const [passDraft, setPassDraft] = useState('');
  const [passConfirm, setPassConfirm] = useState('');
  const [passError, setPassError] = useState('');
  // WebDAV 弹窗
  const [showWebdav, setShowWebdav] = useState(false);
  const [webdavUrl, setWebdavUrl] = useState('');
  const [webdavUser, setWebdavUser] = useState('');
  const [webdavPass, setWebdavPass] = useState('');
  const [webdavTesting, setWebdavTesting] = useState(false);
  // 恢复弹窗
  const [showRestore, setShowRestore] = useState(false);
  const [restorePassDraft, setRestorePassDraft] = useState('');
  const [restoreBusy, setRestoreBusy] = useState(false);

  const loadProfile = useCallback(async () => {
    const p = await getProfile();
    setNickname(p.nickname || '');
  }, []);
  React.useEffect(() => { loadProfile(); }, [loadProfile]);

  const loadAmapKey = useCallback(async () => {
    const k = await getAmapKey();
    setAmapKeySet(!!k);
  }, []);
  React.useEffect(() => { loadAmapKey(); }, [loadAmapKey]);

  const loadLocKey = useCallback(async () => {
    const raw = await getAmapLocKeyRaw();
    setLocKeyState(raw === null ? 'default' : raw === '' ? 'disabled' : 'set');
  }, []);
  React.useEffect(() => { loadLocKey(); }, [loadLocKey]);

  // ---------- 数据备份 ----------
  const WEBDAV_FAIL_KEY = {
    auth: 'backup.webdavFailAuth',
    network: 'backup.webdavFailNet',
    notFound: 'backup.webdavFailNotFound',
    server: 'backup.webdavFailServer',
    conflict: 'backup.webdavFailConflict',
    unknown: 'backup.webdavFailUnknown',
  };

  const loadBackupState = useCallback(async () => {
    const [auto, pass, cloud, last] = await Promise.all([
      isAutoBackupEnabled(), getBackupPassphrase(), getWebDavConfig(), getLastBackupTime(),
    ]);
    setAutoEnabled(auto);
    setHasPassphrase(!!pass);
    setCloudSet(!!(cloud && cloud.url));
    setLastBackup(last || 0);
  }, []);
  React.useEffect(() => { loadBackupState(); }, [loadBackupState]);

  const fmtBackupTime = (ms) => {
    if (!ms) return t('backup.never');
    const d = new Date(ms);
    const p = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  };

  // 需要口令的动作用 withPassphrase 包一层：有口令直接跑，否则开弹窗并记录待执行动作（存证在 pendingActionRef）。
  const runAction = async (action) => {
    if (action === 'auto') {
      await setAutoBackup(true);
      await loadBackupState();
    } else if (action === 'backup') {
      setBackupBusy(true);
      try {
        const res = await backupNow({});
        if (!res) { Alert.alert(t('backup.failTitle'), t('backup.fail')); return; }
        Alert.alert(t('backup.successTitle'), res.uploaded ? t('backup.successUploaded') : t('backup.successLocal'));
        await loadBackupState();
      } finally { setBackupBusy(false); }
    } else if (action === 'export') {
      setBackupBusy(true);
      try {
        const pass = await getBackupPassphrase();
        const uri = await makeLocalBackup({ passphrase: pass });
        await shareBackup(uri, t('backup.exportTitle'));
        await loadBackupState();
      } finally { setBackupBusy(false); }
    }
  };
  const withPassphrase = async (action) => {
    const pass = await getBackupPassphrase();
    if (!pass) { pendingActionRef.current = action; setShowPassphrase(true); return; }
    await runAction(action);
  };

  const toggleAuto = () => {
    if (autoEnabled) { setAutoBackup(false).then(loadBackupState); }
    else withPassphrase('auto');
  };

  // 备份口令弹窗
  const confirmPassphrase = async () => {
    const p = passDraft;
    if (!p) { setPassError(t('backup.passphraseEmpty')); return; }
    if (p.length < 4) { setPassError(t('backup.passphraseShort')); return; }
    if (p !== passConfirm) { setPassError(t('backup.passphraseMismatch')); return; }
    await setBackupPassphrase(p);
    setShowPassphrase(false); setPassDraft(''); setPassConfirm(''); setPassError('');
    await loadBackupState();
    if (pendingActionRef.current) {
      const a = pendingActionRef.current; pendingActionRef.current = null; await runAction(a);
    }
  };
  const clearPassphrase = () => {
    Alert.alert(t('backup.clearPassTitle'), t('backup.clearPassBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('backup.passphraseClear'), style: 'destructive', onPress: async () => {
        await setBackupPassphrase(null); await setAutoBackup(false); await loadBackupState();
        setShowPassphrase(false); setPassDraft(''); setPassConfirm(''); setPassError('');
      } },
    ]);
  };

  // WebDAV 配置弹窗
  const openWebdav = async () => {
    const cfg = await getWebDavConfig();
    setWebdavUrl(cfg ? cfg.url : '');
    setWebdavUser(cfg ? cfg.username : '');
    setWebdavPass('');
    setShowWebdav(true);
  };
  const closeWebdav = () => { setShowWebdav(false); setWebdavTesting(false); };
  const confirmWebdav = async () => {
    if (!webdavUrl.trim() || !webdavUser.trim()) {
      Alert.alert(t('backup.webdavFailTitle'), t('backup.webdavFailAuth')); return;
    }
    setWebdavTesting(true);
    try {
      await testConnectionWith(webdavUrl, webdavUser, webdavPass);
      await saveWebDavConfig({ url: webdavUrl, username: webdavUser, appPassword: webdavPass });
      Alert.alert(undefined, t('backup.webdavSaved'));
      setShowWebdav(false);
      await loadBackupState();
    } catch (e) {
      const code = e instanceof WebDavError ? e.code : 'unknown';
      Alert.alert(t('backup.webdavFailTitle'), t(WEBDAV_FAIL_KEY[code] || 'backup.webdavFailUnknown'));
    } finally { setWebdavTesting(false); }
  };
  const clearWebdav = () => {
    Alert.alert(t('backup.webdavClear'), t('backup.webdavNoConfig'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('backup.webdavClear'), style: 'destructive', onPress: async () => {
        await clearWebDavConfig(); await loadBackupState(); setShowWebdav(false);
      } },
    ]);
  };

  // 恢复弹窗
  const openRestore = () => { setRestorePassDraft(''); setShowRestore(true); };
  const closeRestore = () => { setShowRestore(false); setRestorePassDraft(''); };

  // 拿到数据源（uri 或 raw 串）后：确认 → 拿口令 → 恢复 → 提示结果。
  const doRestore = (restoreFn) => {
    if (!restorePassDraft) { Alert.alert(t('backup.restoreTitle'), t('backup.passphraseEmpty')); return; }
    Alert.alert(t('backup.restoreConfirmTitle'), t('backup.restoreConfirmBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('backup.confirmRestore'), onPress: async () => {
        setRestoreBusy(true);
        try {
          const { imported, skipped } = await restoreFn(restorePassDraft);
          Alert.alert(t('backup.restoreTitle'), t('backup.restoreDone', { imported, skipped }));
          setShowRestore(false);
          await loadBackupState();
        } catch (e) {
          Alert.alert(t('backup.restoreTitle'), t('backup.restoreWrongPass'));
        } finally { setRestoreBusy(false); }
      } },
    ]);
  };

  const pickRestoreFile = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({ type: 'application/json', copyToCacheDirectory: true });
      if (res.canceled || !res.assets || !res.assets[0]) return;
      const uri = res.assets[0].uri;
      await doRestore((pass) => readAndRestore(uri, pass));
    } catch (e) {
      Alert.alert(t('backup.restoreTitle'), t('backup.restoreNoFile'));
    }
  };

  const restoreFromCloud = async () => {
    if (!cloudSet) { Alert.alert(t('backup.webdavTitle'), t('backup.webdavNoConfig')); return; }
    setRestoreBusy(true);
    try {
      const raw = await getLatestBackupRaw();
      setRestoreBusy(false);
      await doRestore((pass) => readAndRestoreFromRaw(raw, pass));
    } catch (e) {
      setRestoreBusy(false);
      const code = e instanceof WebDavError ? e.code : 'unknown';
      Alert.alert(t('backup.webdavFailTitle'), t(WEBDAV_FAIL_KEY[code] || 'backup.webdavFailUnknown'));
    }
  };

  const persistNickname = async () => {
    await saveProfile({ nickname: nickname.trim() });
  };

  const openAmapKey = async () => {
    setAmapKeyDraft(await getAmapKey());
    setAmapKeyInvalid(false);
    setShowAmapKey(true);
  };
  const closeAmapKey = () => { setShowAmapKey(false); setAmapKeyInvalid(false); };
  const confirmAmapKey = async () => {
    const k = amapKeyDraft.trim();
    if (!k || /\s/.test(k)) { setAmapKeyInvalid(true); return; }
    const saved = await setAmapKey(k);
    if (!saved) {
      Alert.alert(t('profile.amapKeySaveFailTitle'), t('profile.amapKeySaveFailBody'));
      return;
    }
    setAmapKeySet(true);
    setShowAmapKey(false);
    setAmapKeyInvalid(false);
    Alert.alert(t('profile.amapKeySavedTitle'), t('profile.amapKeySavedBody'));
  };
  const clearAmapKey = async () => {
    const saved = await setAmapKey('');
    if (!saved) {
      Alert.alert(t('profile.amapKeySaveFailTitle'), t('profile.amapKeySaveFailBody'));
      return;
    }
    setAmapKeySet(false);
    setAmapKeyDraft('');
    setShowAmapKey(false);
    setAmapKeyInvalid(false);
  };

  const openLocKey = async () => {
    setLocKeyDraft(await getAmapLocKeyRaw() || '');
    setLocKeyInvalid(false);
    setShowLocKey(true);
  };
  const closeLocKey = () => { setShowLocKey(false); setLocKeyInvalid(false); };
  const confirmLocKey = async () => {
    const k = locKeyDraft.trim();
    if (!k || /\s/.test(k)) { setLocKeyInvalid(true); return; }
    const saved = await setAmapLocKey(k);
    if (!saved) {
      Alert.alert(t('profile.amapKeySaveFailTitle'), t('profile.amapKeySaveFailBody'));
      return;
    }
    setLocKeyState('set');
    setShowLocKey(false);
    setLocKeyInvalid(false);
    Alert.alert(t('profile.amapKeySavedTitle'), t('profile.amapKeySavedBody'));
  };
  const clearLocKey = async () => {
    const saved = await setAmapLocKey('');
    if (!saved) {
      Alert.alert(t('profile.amapKeySaveFailTitle'), t('profile.amapKeySaveFailBody'));
      return;
    }
    setLocKeyState('disabled');
    setLocKeyDraft('');
    setShowLocKey(false);
    setLocKeyInvalid(false);
  };

  // 定位排查：逐项自检每一环（系统服务/权限/缓存/实时/反查），把失败点找出来
  const handleLocationDiag = async () => {
    if (diagRunning) return;
    setDiagRunning(true);
    try {
      const report = await diagnoseLocation();
      Alert.alert(t('profile.locationDiagTitle'), report);
    } catch (e) {
      Alert.alert(t('profile.locationDiagTitle'), String((e && e.message) || '?'));
    } finally {
      setDiagRunning(false);
    }
  };

  const version = Constants?.expoConfig?.version || '1.0.0';

  const handleCheckUpdate = async () => {
    const u = await checkForUpdate();
    if (!u) Alert.alert(t('profile.upToDate'), t('profile.version', { v: version }));
    else Alert.alert(t('update.title'), `${t('update.latest', { l: u.latestVersion })}\n${t('update.downloadHint')}`, [
      { text: t('update.later'), style: 'cancel' },
      { text: t('update.go'), onPress: () => Linking.openURL(u.releaseUrl || u.downloadUrl) },
    ]);
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const data = await getRecords();
      const json = JSON.stringify({ app: 'TimeFlow', version, exportedAt: new Date().toISOString(), records: data }, null, 2);
      const file = `${FileSystem.cacheDirectory}timeflow-export.json`;
      await FileSystem.writeAsStringAsync(file, json);
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(file, { mimeType: 'application/json', dialogTitle: t('profile.exportDialog') });
      } else {
        Alert.alert(t('profile.exportFailTitle'), t('profile.exportFailShare'));
      }
    } catch (e) {
      Alert.alert(t('profile.exportFailTitle'), t('profile.exportFail'));
    } finally {
      setExporting(false);
    }
  };

  const handleClear = () => {
    Alert.alert(t('common.clearTitle'), t('profile.clearBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.delete'), style: 'destructive', onPress: async () => {
        await clearAll();
        Alert.alert(t('profile.clearedTitle'), t('profile.clearedBody'));
      } },
    ]);
  };

  const currentLangKey = isSystem ? 'system' : lang;
  const languageValue = isSystem ? t('language.system') : (lang === 'zh' ? t('language.zh') : t('language.en'));
  const currentThemeKey = themeIsSystem ? 'system' : theme;
  const themeValue = themeIsSystem ? t('theme.system') : theme === 'dark' ? t('theme.dark') : t('theme.light');

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Text style={styles.title}>{t('profile.title')}</Text>
        <Text style={styles.subtitle}>{t('profile.subtitle')}</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* 个人信息 */}
        <Text style={styles.section}>{t('profile.sectionProfile')}</Text>
        <View style={styles.card}>
          <View style={styles.nicknameRow}>
            <View style={styles.avatar}><Ionicons name="person" size={22} color="#fff" /></View>
            <View style={styles.nicknameInputWrap}>
              <Text style={styles.nicknameLabel}>{t('profile.nickname')}</Text>
              <TextInput
                style={styles.nicknameInput}
                value={nickname}
                onChangeText={setNickname}
                placeholder={t('profile.nicknamePlaceholder')}
                placeholderTextColor={colors.ink3}
                returnKeyType="done"
                onSubmitEditing={persistNickname}
                onBlur={persistNickname}
              />
            </View>
          </View>
        </View>

        {/* 数据管理 */}
        <Text style={styles.section}>{t('profile.sectionData')}</Text>
        <View style={styles.card}>
          <Row icon="download-outline" label={t('profile.export')} onPress={handleExport} />
          <View style={styles.divider} />
          <Row icon="trash-outline" label={t('profile.clear')} danger onPress={handleClear} />
        </View>

        {/* 数据备份 */}
        <Text style={styles.section}>{t('backup.sectionData')}</Text>
        <View style={styles.card}>
          <Row
            icon="cloud-upload-outline"
            label={t('backup.cloud')}
            value={cloudSet ? t('backup.cloudSet') : t('backup.cloudEmpty')}
            onPress={openWebdav}
          />
          <View style={styles.divider} />
          <Row icon="flash-outline" label={t('backup.auto')} value={autoEnabled ? t('backup.on') : t('backup.off')} onPress={toggleAuto} />
          <View style={styles.divider} />
          <Row
            icon="shield-checkmark-outline"
            label={t('backup.passphraseTitle')}
            value={hasPassphrase ? t('backup.on') : t('backup.off')}
            onPress={() => setShowPassphrase(true)}
          />
          <View style={styles.divider} />
          <Row
            icon="save-outline"
            label={t('backup.now')}
            onPress={() => withPassphrase('backup')}
            value={backupBusy ? '…' : undefined}
          />
          <View style={styles.divider} />
          <Row icon="share-outline" label={t('backup.export')} onPress={() => withPassphrase('export')} value={backupBusy ? '…' : undefined} />
          <View style={styles.divider} />
          <Row icon="refresh-outline" label={t('backup.restore')} onPress={openRestore} />
          <View style={styles.divider} />
          <Row icon="time-outline" label={t('backup.last')} value={fmtBackupTime(lastBackup)} />
        </View>

        {/* 位置服务 */}
        <Text style={styles.section}>{t('profile.sectionLocation')}</Text>
        <View style={styles.card}>
          <Row
            icon="locate-outline"
            label={t('profile.locationDebug')}
            onPress={() => setShowLocationDebug(true)}
          />
        </View>

        {/* 桌面小组件 */}
        <Text style={styles.section}>{t('profile.sectionWidget')}</Text>
        <View style={styles.card}>
          <Row icon="grid-outline" label={t('widget.desc')} onPress={() => { refreshWidget(); setShowWidgetGuide(true); }} />
        </View>

        {/* 关于 */}
        <Text style={styles.section}>{t('profile.sectionAbout')}</Text>
        <View style={styles.card}>
          <Row icon="shield-checkmark-outline" label={t('profile.privacy')} onPress={() => setShowPrivacy(true)} />
          <View style={styles.divider} />
          <Row icon="language-outline" label={t('profile.language')} value={languageValue} onPress={() => setShowLang(true)} />
          <View style={styles.divider} />
          <Row icon="contrast-outline" label={t('profile.theme')} value={themeValue} onPress={() => setShowTheme(true)} />
          <View style={styles.divider} />
          <Row icon="refresh-circle-outline" label={t('profile.checkUpdate')} value={`v${version}`} onPress={handleCheckUpdate} />
          <View style={styles.divider} />
          <Row icon="mail-outline" label={t('profile.contact')} value="chonggao9@gmail.com" />
        </View>

        <Text style={styles.footer}>{t('profile.version', { v: version })}</Text>
      </ScrollView>

      <Modal visible={showPrivacy} animationType="slide" onRequestClose={() => setShowPrivacy(false)}>
        <PrivacyAgreement onClose={() => setShowPrivacy(false)} />
      </Modal>

      {/* 高德 Key 配置弹窗 */}
      <Modal visible={showAmapKey} transparent animationType="fade" onRequestClose={closeAmapKey}>
        <View style={styles.overlay}>
          <View style={styles.dialog}>
            <Text style={styles.dialogTitle}>{t('profile.amapKeyTitle')}</Text>
            <Text style={styles.dialogSub}>{t('profile.amapKeySub')}</Text>
            <TextInput
              style={styles.input}
              value={amapKeyDraft}
              onChangeText={setAmapKeyDraft}
              placeholder={t('profile.amapKeyPlaceholder')}
              placeholderTextColor={colors.ink3}
              autoCapitalize="none"
              autoCorrect={false}
              autoFocus
            />
            {amapKeyInvalid && <Text style={styles.errorText}>{t('profile.amapKeyInvalid')}</Text>}
            <View style={styles.dialogRow}>
              <TouchableOpacity style={[styles.dialogBtn, styles.dialogGhost]} onPress={clearAmapKey}>
                <Text style={styles.dialogGhostText}>{t('profile.amapKeyClear')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.dialogBtn, styles.dialogCancel]} onPress={closeAmapKey}>
                <Text style={styles.dialogCancelText}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.dialogBtn, styles.dialogOk]} onPress={confirmAmapKey}>
                <Text style={styles.dialogOkText}>{t('common.save')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* 高德定位 Key 配置弹窗 */}
      <Modal visible={showLocKey} transparent animationType="fade" onRequestClose={closeLocKey}>
        <View style={styles.overlay}>
          <View style={styles.dialog}>
            <Text style={styles.dialogTitle}>{t('profile.amapLocKeyTitle')}</Text>
            <Text style={styles.dialogSub}>{t('profile.amapLocKeySub')}</Text>
            <TextInput
              style={styles.input}
              value={locKeyDraft}
              onChangeText={setLocKeyDraft}
              placeholder={t('profile.amapLocKeyPlaceholder')}
              placeholderTextColor={colors.ink3}
              autoCapitalize="none"
              autoCorrect={false}
              autoFocus
            />
            {locKeyInvalid && <Text style={styles.errorText}>{t('profile.amapKeyInvalid')}</Text>}
            <View style={styles.dialogRow}>
              <TouchableOpacity style={[styles.dialogBtn, styles.dialogGhost]} onPress={clearLocKey}>
                <Text style={styles.dialogGhostText}>{t('profile.amapKeyClear')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.dialogBtn, styles.dialogCancel]} onPress={closeLocKey}>
                <Text style={styles.dialogCancelText}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.dialogBtn, styles.dialogOk]} onPress={confirmLocKey}>
                <Text style={styles.dialogOkText}>{t('common.save')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* 位置调试弹窗：第二层级，收敛三个定位相关入口 */}
      <Modal visible={showLocationDebug} transparent animationType="fade" onRequestClose={() => setShowLocationDebug(false)}>
        <View style={styles.overlay}>
          <View style={styles.dialog}>
            <Text style={styles.dialogTitle}>{t('profile.locationDebug')}</Text>
            <Row
              icon="map-outline"
              label={t('profile.amapKey')}
              value={amapKeySet ? t('profile.amapKeySet') : t('profile.amapKeyEmpty')}
              onPress={() => { setShowLocationDebug(false); openAmapKey(); }}
            />
            <View style={styles.divider} />
            <Row
              icon="navigate-outline"
              label={t('profile.amapLocKey')}
              value={locKeyState === 'default' ? t('profile.amapLocKeyDefault') : locKeyState === 'disabled' ? t('profile.amapLocKeyDisabled') : t('profile.amapKeySet')}
              onPress={() => { setShowLocationDebug(false); openLocKey(); }}
            />
            <View style={styles.divider} />
            <Row
              icon="locate-outline"
              label={t('profile.locationDiag')}
              value={diagRunning ? '…' : undefined}
              onPress={() => { setShowLocationDebug(false); handleLocationDiag(); }}
            />
            <View style={styles.dialogRow}>
              <TouchableOpacity style={[styles.dialogBtn, styles.dialogCancel]} onPress={() => setShowLocationDebug(false)}>
                <Text style={styles.dialogCancelText}>{t('common.cancel')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* 桌面小组件说明弹窗 */}
      <Modal visible={showWidgetGuide} transparent animationType="fade" onRequestClose={() => setShowWidgetGuide(false)}>
        <View style={styles.overlay}>
          <View style={styles.dialog}>
            <Text style={styles.dialogTitle}>{t('widget.desc')}</Text>
            <Text style={styles.dialogSub}>{t('widget.guide')}</Text>
            <Text style={styles.dialogSub}>{t('widget.howto')}</Text>
            <View style={styles.dialogRow}>
              <TouchableOpacity style={[styles.dialogBtn, styles.dialogCancel]} onPress={() => setShowWidgetGuide(false)}>
                <Text style={styles.dialogCancelText}>{t('common.cancel')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* 备份口令弹窗 */}
      <Modal visible={showPassphrase} transparent animationType="fade" onRequestClose={() => { setShowPassphrase(false); pendingActionRef.current = null; }}>
        <View style={styles.overlay}>
          <View style={styles.dialog}>
            <Text style={styles.dialogTitle}>{t('backup.passphraseTitle')}</Text>
            <Text style={styles.dialogSub}>{t('backup.passphraseSub')}</Text>
            <TextInput
              style={styles.input}
              value={passDraft}
              onChangeText={setPassDraft}
              placeholder={t('backup.passphrasePlaceholder')}
              placeholderTextColor={colors.ink3}
              secureTextEntry
              autoFocus
            />
            <TextInput
              style={styles.input}
              value={passConfirm}
              onChangeText={setPassConfirm}
              placeholder={t('backup.passphraseConfirm')}
              placeholderTextColor={colors.ink3}
              secureTextEntry
            />
            {!!passError && <Text style={styles.errorText}>{passError}</Text>}
            <View style={styles.dialogRow}>
              <TouchableOpacity style={[styles.dialogBtn, styles.dialogGhost]} onPress={clearPassphrase}>
                <Text style={styles.dialogGhostText}>{t('backup.passphraseClear')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.dialogBtn, styles.dialogCancel]}
                onPress={() => { setShowPassphrase(false); setPassDraft(''); setPassConfirm(''); setPassError(''); pendingActionRef.current = null; }}
              >
                <Text style={styles.dialogCancelText}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.dialogBtn, styles.dialogOk]} onPress={confirmPassphrase}>
                <Text style={styles.dialogOkText}>{t('common.save')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* WebDAV 云同步弹窗 */}
      <Modal visible={showWebdav} transparent animationType="fade" onRequestClose={closeWebdav}>
        <View style={styles.overlay}>
          <View style={styles.dialog}>
            <Text style={styles.dialogTitle}>{t('backup.webdavTitle')}</Text>
            <Text style={styles.dialogSub}>{t('backup.webdavSub')}</Text>
            <TextInput
              style={styles.input}
              value={webdavUrl}
              onChangeText={setWebdavUrl}
              placeholder={t('backup.webdavUrlPlaceholder')}
              placeholderTextColor={colors.ink3}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
            />
            <TextInput
              style={styles.input}
              value={webdavUser}
              onChangeText={setWebdavUser}
              placeholder={t('backup.webdavUser')}
              placeholderTextColor={colors.ink3}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TextInput
              style={styles.input}
              value={webdavPass}
              onChangeText={setWebdavPass}
              placeholder={t('backup.webdavPassPlaceholder')}
              placeholderTextColor={colors.ink3}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
            />
            {webdavTesting && <Text style={styles.errorText}>{t('backup.webdavTesting')}</Text>}
            <View style={styles.dialogRow}>
              {cloudSet && (
                <TouchableOpacity style={[styles.dialogBtn, styles.dialogGhost]} onPress={clearWebdav}>
                  <Text style={styles.dialogGhostText}>{t('backup.webdavClear')}</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={[styles.dialogBtn, styles.dialogCancel]} onPress={closeWebdav}>
                <Text style={styles.dialogCancelText}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.dialogBtn, styles.dialogOk]} onPress={confirmWebdav} disabled={webdavTesting}>
                <Text style={styles.dialogOkText}>{t('backup.webdavSave')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* 从备份恢复弹窗 */}
      <Modal visible={showRestore} transparent animationType="fade" onRequestClose={closeRestore}>
        <View style={styles.overlay}>
          <View style={styles.dialog}>
            <Text style={styles.dialogTitle}>{t('backup.restoreTitle')}</Text>
            <Text style={styles.dialogSub}>{t('backup.restoreSub')}</Text>
            <TextInput
              style={styles.input}
              value={restorePassDraft}
              onChangeText={setRestorePassDraft}
              placeholder={t('backup.passphrasePlaceholder')}
              placeholderTextColor={colors.ink3}
              secureTextEntry
            />
            {restoreBusy && <Text style={styles.errorText}>{t('backup.restoreBusy')}</Text>}
            <View style={styles.dialogRow}>
              <TouchableOpacity style={[styles.dialogBtn, styles.dialogCancel]} onPress={pickRestoreFile} disabled={restoreBusy}>
                <Text style={styles.dialogCancelText}>{t('backup.restoreFile')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.dialogBtn, styles.dialogOk]} onPress={restoreFromCloud} disabled={restoreBusy}>
                <Text style={styles.dialogOkText}>{t('backup.restoreCloud')}</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.dialogRow}>
              <TouchableOpacity style={[styles.dialogBtn, styles.dialogCancel]} onPress={closeRestore}>
                <Text style={styles.dialogCancelText}>{t('common.cancel')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={showLang} transparent animationType="fade" onRequestClose={() => setShowLang(false)}>
        <View style={styles.overlay}>
          <View style={styles.dialog}>
            <Text style={styles.dialogTitle}>{t('profile.languageTitle')}</Text>
            {LANG_OPTIONS.map(opt => {
              const active = currentLangKey === opt.key;
              return (
                <TouchableOpacity
                  key={opt.key}
                  style={[styles.langOption, active && styles.langOptionActive]}
                  onPress={() => { setLang(opt.key); setShowLang(false); }}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.langOptionText, active && styles.langOptionTextActive]}>{t(opt.labelKey)}</Text>
                  {active && <Ionicons name="checkmark" size={20} color={colors.primary} />}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </Modal>

      {/* 主题选择弹窗 */}
      <Modal visible={showTheme} transparent animationType="fade" onRequestClose={() => setShowTheme(false)}>
        <View style={styles.overlay}>
          <View style={styles.dialog}>
            <Text style={styles.dialogTitle}>{t('profile.themeTitle')}</Text>
            {THEME_OPTIONS.map(opt => {
              const active = currentThemeKey === opt.key;
              return (
                <TouchableOpacity
                  key={opt.key}
                  style={[styles.langOption, active && styles.langOptionActive]}
                  onPress={async () => { await setTheme(opt.key); setShowTheme(false); }}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.langOptionText, active && styles.langOptionTextActive]}>{t(opt.labelKey)}</Text>
                  {active && <Ionicons name="checkmark" size={20} color={colors.primary} />}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const makeStyles = (colors) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: { paddingHorizontal: 20, paddingBottom: 6 },
  title: { fontSize: 26, fontWeight: '800', color: colors.ink, letterSpacing: -0.5 },
  subtitle: { fontSize: 13, color: colors.ink2, marginTop: 3 },

  content: { padding: 16, paddingBottom: 40 },
  section: { fontSize: 13, color: colors.ink2, fontWeight: '700', letterSpacing: 0.4, marginBottom: 10, marginTop: 4, marginLeft: 4 },

  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: 12, marginBottom: 20, ...shadow.sm },

  nicknameRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 6 },
  avatar: {
    width: 52, height: 52, borderRadius: 26, backgroundColor: colors.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  nicknameInputWrap: { flex: 1 },
  nicknameLabel: { fontSize: 12, color: colors.ink3 },
  nicknameInput: { fontSize: 16, color: colors.ink, paddingVertical: 4 },

  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13, paddingHorizontal: 6 },
  rowIcon: { width: 28, height: 28, borderRadius: 8, backgroundColor: colors.primarySofter, alignItems: 'center', justifyContent: 'center' },
  rowLabel: { flex: 1, fontSize: 15, color: colors.ink, fontWeight: '600' },
  rowValue: { fontSize: 13, color: colors.ink3, marginRight: 4 },
  divider: { height: 1, backgroundColor: colors.line, marginHorizontal: 6 },

  footer: { textAlign: 'center', fontSize: 12, color: colors.ink3, marginTop: 8 },

  overlay: {
    flex: 1, backgroundColor: colors.scrim,
    alignItems: 'center', justifyContent: 'center', padding: 28,
  },
  dialog: { width: '100%', backgroundColor: colors.surface, borderRadius: 20, padding: 16 },
  dialogTitle: { fontSize: 17, fontWeight: '700', color: colors.ink, textAlign: 'center', marginBottom: 8 },
  dialogSub: { fontSize: 12, color: colors.ink3, marginTop: 2, marginBottom: 4, lineHeight: 17 },
  input: {
    marginTop: 8, borderWidth: 1.5, borderColor: colors.line2, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, color: colors.ink,
    backgroundColor: colors.chip,
  },
  errorText: { marginTop: 8, fontSize: 12, color: colors.danger },
  dialogGhost: {
    flex: 1, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.line,
  },
  dialogGhostText: { fontSize: 15, color: colors.danger, fontWeight: '600' },
  dialogRow: { flexDirection: 'row', gap: 10, marginTop: 18 },
  dialogBtn: { flex: 1, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  dialogCancel: { backgroundColor: colors.chip },
  dialogCancelText: { fontSize: 15, color: colors.ink2, fontWeight: '600' },
  dialogOk: { backgroundColor: colors.primary },
  dialogOkText: { fontSize: 15, color: '#fff', fontWeight: '700' },
  langOption: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 14, paddingHorizontal: 12, borderRadius: 12,
  },
  langOptionActive: { backgroundColor: colors.primarySofter },
  langOptionText: { fontSize: 16, color: colors.ink },
  langOptionTextActive: { color: colors.primaryStrong, fontWeight: '700' },
});
