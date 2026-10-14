// 「云端副本」页（全屏 Modal）：测试连接通过才能保存并开启。
// 设计稿要点：每次进入页面重置 tested=false，测试通过前「保存并开启」不可点；
// 应用密码只存 SecureStore，绝不写入备份。
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useI18n } from '../i18n/LanguageContext';
import { useTheme } from '../theme/ThemeContext';
import { useBackupState, updateBackupState } from '../backup/state';
import { getCloudConfig, saveCloudConfig, testConnection } from '../backup/cloud';
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
  const [testState, setTestState] = useState('idle'); // idle | testing | ok | fail
  const [busy, setBusy] = useState(false);

  // 表单最新值的镜像：测试请求在飞行途中用户改了输入时，旧结果不得给新内容放行
  const formRef = useRef({ url: '', user: '', pass: '' });
  const setField = (key, value) => {
    formRef.current = { ...formRef.current, [key]: value };
    setTestState('idle');
  };

  // 每次进入页面重置测试状态（设计要求：需重新测试连接才能保存），并回填已保存的配置
  useEffect(() => {
    if (!visible) return;
    setTestState('idle');
    let alive = true;
    getCloudConfig()
      .then((cfg) => {
        if (!alive) return;
        formRef.current = { url: cfg.url || '', user: cfg.username || '', pass: cfg.password || '' };
        setUrl(formRef.current.url);
        setUser(formRef.current.user);
        setPass(formRef.current.pass);
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [visible]);

  const handleTest = async () => {
    if (testState === 'testing') return;
    setTestState('testing');
    const snapshot = formRef.current;
    const res = await testConnection(snapshot.url, snapshot.user, snapshot.pass);
    // 请求期间输入被改过：结果作废，回到未测试态（保存按钮保持不可点）
    if (formRef.current !== snapshot) { setTestState('idle'); return; }
    setTestState(res.ok ? 'ok' : 'fail');
  };

  const handleSaveOn = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await saveCloudConfig({ url, username: user, password: pass });
      await updateBackupState((s) => ({ ...s, cloudEnabled: true }));
      if (onChanged) onChanged('enabled');
      onClose();
    } catch (e) {
      setTestState('fail'); // 凭证写入失败：回到未通过态，不允许开启
    } finally {
      setBusy(false);
    }
  };

  const handleDisable = async () => {
    if (busy) return;
    setBusy(true);
    try {
      // 仅停止同步，保留凭证配置（下次开启仍需重新测试连接）
      await updateBackupState((s) => ({ ...s, cloudEnabled: false }));
      if (onChanged) onChanged('disabled');
      onClose();
    } finally {
      setBusy(false);
    }
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
              onChangeText={(v) => { setUrl(v); setField('url', v); }}
              placeholder={t('cloud.urlPlaceholder')}
              placeholderTextColor={colors.ink3}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
            />
            {/* 非 HTTPS 时如实提示明文传输风险（不阻断：家用 NAS 局域网是合法场景） */}
            {!!url.trim() && /^http:\/\//i.test(url.trim()) && (
              <View style={[styles.testNote, { backgroundColor: colors.warnBg }]}>
                <Text style={{ color: colors.warn, fontSize: 12, fontWeight: '600' }}>{t('cloud.httpWarn')}</Text>
              </View>
            )}

            <Text style={styles.label}>{t('cloud.user')}</Text>
            <TextInput
              style={styles.input}
              value={user}
              onChangeText={(v) => { setUser(v); setField('user', v); }}
              placeholder={t('cloud.userPlaceholder')}
              placeholderTextColor={colors.ink3}
              autoCapitalize="none"
              autoCorrect={false}
            />

            <Text style={styles.label}>{t('cloud.pass')}</Text>
            <TextInput
              style={styles.input}
              value={pass}
              onChangeText={(v) => { setPass(v); setField('pass', v); }}
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
