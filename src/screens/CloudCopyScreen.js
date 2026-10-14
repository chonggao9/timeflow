// 「云端副本」页（全屏 Modal）。阶段 2：界面与交互骨架；测试连接/上传在阶段 3 接 cloud.js。
// 设计稿要点：每次进入页面重置 tested=false，测试通过前「保存并开启」不可点；
// 应用密码只存 SecureStore，绝不写入备份。
import React, { useEffect, useMemo, useState } from 'react';
import {
  KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useI18n } from '../i18n/LanguageContext';
import { useTheme } from '../theme/ThemeContext';
import { useBackupState } from '../backup/state';
import { Btn } from '../components/backup/Buttons';

export default function CloudCopyScreen({ visible, onClose, onChanged }) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { t } = useI18n();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const state = useBackupState();

  const [url, setUrl] = useState('');
  const [user, setUser] = useState('');
  const [pass, setPass] = useState('');
  const [testState, setTestState] = useState('idle'); // idle | testing | ok | fail | soon
  const [busy, setBusy] = useState(false);

  // 每次进入页面重置测试状态（设计要求：需重新测试连接才能保存）
  useEffect(() => {
    if (visible) setTestState('idle');
  }, [visible]);

  const handleTest = async () => {
    // 阶段 3：接 cloud.js testConnection(url, user, pass)
    setTestState('soon');
  };

  const handleSaveOn = async () => {
    // 阶段 3：写 timeflow_webdav(url+username) + SecureStore 应用密码 + cloudEnabled=true
    setBusy(true);
    setBusy(false);
  };

  const handleDisable = async () => {
    // 阶段 3：cloudEnabled=false（保留凭证配置，仅停止同步）
    setBusy(true);
    setBusy(false);
  };

  const canSave = testState === 'ok';

  return (
    <Modal visible={visible} animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <View style={styles.screen}>
        <View style={[styles.nav, { paddingTop: insets.top + 8 }]}>
          <TouchableOpacity onPress={onClose} style={styles.backBtn} activeOpacity={0.6}>
            <Ionicons name="chevron-back" size={24} color={colors.ink} />
          </TouchableOpacity>
          <Text style={styles.navTitle}>{t('cloud.title')}</Text>
          <View style={styles.backBtn} />
        </View>

        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView
            contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={styles.intro}>{t('cloud.intro')}</Text>

            <Text style={styles.label}>{t('cloud.url')}</Text>
            <TextInput
              style={styles.input}
              value={url}
              onChangeText={(v) => { setUrl(v); setTestState('idle'); }}
              placeholder={t('cloud.urlPlaceholder')}
              placeholderTextColor={colors.ink3}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
            />

            <Text style={styles.label}>{t('cloud.user')}</Text>
            <TextInput
              style={styles.input}
              value={user}
              onChangeText={(v) => { setUser(v); setTestState('idle'); }}
              placeholder={t('cloud.userPlaceholder')}
              placeholderTextColor={colors.ink3}
              autoCapitalize="none"
              autoCorrect={false}
            />

            <Text style={styles.label}>{t('cloud.pass')}</Text>
            <TextInput
              style={styles.input}
              value={pass}
              onChangeText={(v) => { setPass(v); setTestState('idle'); }}
              placeholder={t('cloud.passPlaceholder')}
              placeholderTextColor={colors.ink3}
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry
            />

            <View style={styles.testRow}>
              <View style={{ flex: 1 }}>
                <Btn
                  variant="ghost"
                  label={testState === 'testing' ? t('cloud.testing') : t('cloud.test')}
                  onPress={handleTest}
                  loading={testState === 'testing'}
                  disabled={!url.trim() || !user.trim() || !pass.trim()}
                />
              </View>
            </View>

            {testState === 'ok' && (
              <View style={[styles.testNote, { backgroundColor: colors.okBg }]}>
                <Text style={{ color: colors.ok, fontSize: 12.5, fontWeight: '600' }}>{t('cloud.testOk')}</Text>
              </View>
            )}
            {testState === 'fail' && (
              <View style={[styles.testNote, { backgroundColor: colors.errBg }]}>
                <Text style={{ color: colors.err, fontSize: 12.5, fontWeight: '600' }}>{t('cloud.testFail')}</Text>
              </View>
            )}
            {testState === 'soon' && (
              <View style={[styles.testNote, { backgroundColor: colors.idleBg }]}>
                <Text style={{ color: colors.idle, fontSize: 12.5, fontWeight: '600' }}>{t('dataBackup.toastComingSoon')}</Text>
              </View>
            )}

            <View style={styles.saveRow}>
              <Btn label={t('cloud.saveOn')} onPress={handleSaveOn} disabled={!canSave} loading={busy} />
            </View>

            {state.cloudEnabled && (
              <View style={styles.disableRow}>
                <Btn variant="danger" label={t('cloud.disable')} onPress={handleDisable} disabled={busy} />
              </View>
            )}

            <Text style={styles.note}>{t('cloud.note')}</Text>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const makeStyles = (colors) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  nav: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingBottom: 8 },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  navTitle: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '800', color: colors.ink },
  content: { paddingHorizontal: 20, paddingTop: 6 },
  intro: { fontSize: 13, lineHeight: 20, color: colors.ink2, marginBottom: 14 },
  label: { fontSize: 12.5, fontWeight: '700', color: colors.ink2, marginTop: 12, marginBottom: 6 },
  input: {
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line,
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11,
    fontSize: 14.5, color: colors.ink,
  },
  testRow: { flexDirection: 'row', marginTop: 16 },
  testNote: { borderRadius: 12, padding: 11, marginTop: 10 },
  saveRow: { flexDirection: 'row', marginTop: 14 },
  disableRow: { flexDirection: 'row', marginTop: 10 },
  note: { fontSize: 11.5, lineHeight: 17.5, color: colors.ink3, marginTop: 20 },
});
