import React, { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, Alert, Modal, TextInput, Linking,
} from 'react-native';
import Constants from 'expo-constants';
import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getRecords, clearAll } from '../storage/store';
import { getProfile, saveProfile } from '../storage/profile';
import { getAmapKey, setAmapKey } from '../config';
import { checkForUpdate } from '../utils/updater';
import { useI18n } from '../i18n/LanguageContext';
import { colors, radius, shadow } from '../theme';
import PrivacyAgreement from './PrivacyAgreement';

function Row({ icon, label, value, onPress, danger }) {
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

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const { t, lang, isSystem, setLang } = useI18n();
  const [nickname, setNickname] = useState('');
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [showLang, setShowLang] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [showAmapKey, setShowAmapKey] = useState(false);
  const [amapKeyDraft, setAmapKeyDraft] = useState('');
  const [amapKeySet, setAmapKeySet] = useState(false);
  const [amapKeyInvalid, setAmapKeyInvalid] = useState(false);

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

  const saveNickname = async () => {
    await saveProfile({ nickname: nickname.trim() });
    Alert.alert(t('profile.savedTitle'), t('profile.savedBody'));
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
          <Text style={styles.nicknameHint}>{t('profile.nicknameHint')}</Text>
        </View>

        {/* 数据管理 */}
        <Text style={styles.section}>{t('profile.sectionData')}</Text>
        <View style={styles.card}>
          <Row icon="download-outline" label={t('profile.export')} onPress={handleExport} />
          <View style={styles.divider} />
          <Row icon="trash-outline" label={t('profile.clear')} danger onPress={handleClear} />
        </View>

        {/* 位置服务 */}
        <Text style={styles.section}>{t('profile.sectionLocation')}</Text>
        <View style={styles.card}>
          <Row
            icon="map-outline"
            label={t('profile.amapKey')}
            value={amapKeySet ? t('profile.amapKeySet') : t('profile.amapKeyEmpty')}
            onPress={openAmapKey}
          />
        </View>

        {/* 关于 */}
        <Text style={styles.section}>{t('profile.sectionAbout')}</Text>
        <View style={styles.card}>
          <Row icon="shield-checkmark-outline" label={t('profile.privacy')} onPress={() => setShowPrivacy(true)} />
          <View style={styles.divider} />
          <Row icon="language-outline" label={t('profile.language')} value={languageValue} onPress={() => setShowLang(true)} />
          <View style={styles.divider} />
          <Row icon="refresh-circle-outline" label={t('profile.checkUpdate')} value={`v${version}`} onPress={handleCheckUpdate} />
          <View style={styles.divider} />
          <Row icon="mail-outline" label={t('profile.contact')} value="chaseli9@gmail.com" />
        </View>

        <Text style={styles.footer}>{t('profile.version', { v: version })}</Text>
      </ScrollView>

      <Modal visible={showPrivacy} animationType="slide" onRequestClose={() => setShowPrivacy(false)}>
        <PrivacyAgreement onClose={() => setShowPrivacy(false)} />
      </Modal>

      {/* 语言选择弹窗 */}
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
    </View>
  );
}

const styles = StyleSheet.create({
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
  nicknameHint: { fontSize: 11, color: colors.ink3, marginTop: 4, marginLeft: 6 },

  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13, paddingHorizontal: 6 },
  rowIcon: { width: 28, height: 28, borderRadius: 8, backgroundColor: colors.primarySofter, alignItems: 'center', justifyContent: 'center' },
  rowLabel: { flex: 1, fontSize: 15, color: colors.ink, fontWeight: '600' },
  rowValue: { fontSize: 13, color: colors.ink3, marginRight: 4 },
  divider: { height: 1, backgroundColor: colors.line, marginHorizontal: 6 },

  footer: { textAlign: 'center', fontSize: 12, color: colors.ink3, marginTop: 8 },

  overlay: {
    flex: 1, backgroundColor: 'rgba(43,35,30,0.35)',
    alignItems: 'center', justifyContent: 'center', padding: 28,
  },
  dialog: { width: '100%', backgroundColor: colors.surface, borderRadius: 20, padding: 16 },
  dialogTitle: { fontSize: 17, fontWeight: '700', color: colors.ink, textAlign: 'center', marginBottom: 8 },
  dialogSub: { fontSize: 12, color: colors.ink3, marginTop: 2, marginBottom: 4, lineHeight: 17 },
  input: {
    marginTop: 8, borderWidth: 1.5, borderColor: colors.line2, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, color: colors.ink,
    backgroundColor: '#FAF6F1',
  },
  errorText: { marginTop: 8, fontSize: 12, color: colors.danger },
  dialogGhost: {
    flex: 1, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#fff', borderWidth: 1.5, borderColor: colors.line,
  },
  dialogGhostText: { fontSize: 15, color: colors.danger, fontWeight: '600' },
  dialogRow: { flexDirection: 'row', gap: 10, marginTop: 18 },
  dialogBtn: { flex: 1, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  dialogCancel: { backgroundColor: '#FAF6F1' },
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
