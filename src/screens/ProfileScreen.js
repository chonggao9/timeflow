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

  const loadProfile = useCallback(async () => {
    const p = await getProfile();
    setNickname(p.nickname || '');
  }, []);
  React.useEffect(() => { loadProfile(); }, [loadProfile]);

  const saveNickname = async () => {
    await saveProfile({ nickname: nickname.trim() });
    Alert.alert(t('profile.savedTitle'), t('profile.savedBody'));
  };

  const version = Constants?.expoConfig?.version || '1.0.0';

  const handleCheckUpdate = async () => {
    const u = await checkForUpdate();
    if (!u) Alert.alert(t('profile.upToDate'), t('profile.version', { v: version }));
    else Alert.alert(t('update.title'), t('update.latest', { l: u.latestVersion }), [
      { text: t('update.later'), style: 'cancel' },
      { text: t('update.go'), onPress: () => Linking.openURL(u.downloadUrl) },
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
                onSubmitEditing={saveNickname}
              />
            </View>
          </View>
          <TouchableOpacity style={styles.saveBtn} onPress={saveNickname}>
            <Text style={styles.saveBtnText}>{t('profile.saveNickname')}</Text>
          </TouchableOpacity>
        </View>

        {/* 数据管理 */}
        <Text style={styles.section}>{t('profile.sectionData')}</Text>
        <View style={styles.card}>
          <Row icon="download-outline" label={t('profile.export')} onPress={handleExport} />
          <View style={styles.divider} />
          <Row icon="trash-outline" label={t('profile.clear')} danger onPress={handleClear} />
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
  saveBtn: {
    marginTop: 8, marginHorizontal: 6, height: 44, borderRadius: 12,
    backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center',
  },
  saveBtnText: { fontSize: 14, color: colors.primaryStrong, fontWeight: '700' },

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
  langOption: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 14, paddingHorizontal: 12, borderRadius: 12,
  },
  langOptionActive: { backgroundColor: colors.primarySofter },
  langOptionText: { fontSize: 16, color: colors.ink },
  langOptionTextActive: { color: colors.primaryStrong, fontWeight: '700' },
});
