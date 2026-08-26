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

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const [nickname, setNickname] = useState('');
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [exporting, setExporting] = useState(false);

  const loadProfile = useCallback(async () => {
    const p = await getProfile();
    setNickname(p.nickname || '');
  }, []);
  React.useEffect(() => { loadProfile(); }, [loadProfile]);

  const saveNickname = async () => {
    await saveProfile({ nickname: nickname.trim() });
    Alert.alert('已保存', '昵称已更新');
  };

  const version = Constants?.expoConfig?.version || '1.0.0';

  const handleCheckUpdate = async () => {
    const u = await checkForUpdate();
    if (!u) Alert.alert('已是最新版本', `当前版本 ${version}`);
    else Alert.alert('发现新版本', `最新版本 ${u.latestVersion}`, [
      { text: '稍后', style: 'cancel' },
      { text: '去更新', onPress: () => Linking.openURL(u.downloadUrl) },
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
        await Sharing.shareAsync(file, { mimeType: 'application/json', dialogTitle: '导出 TimeFlow 数据' });
      } else {
        Alert.alert('导出失败', '当前设备不支持分享');
      }
    } catch (e) {
      Alert.alert('导出失败', '无法导出数据');
    } finally {
      setExporting(false);
    }
  };

  const handleClear = () => {
    Alert.alert('清空数据', '确定要删除所有打卡记录吗？此操作不可恢复。', [
      { text: '取消', style: 'cancel' },
      { text: '确定删除', style: 'destructive', onPress: async () => {
        await clearAll();
        Alert.alert('已清空', '所有打卡记录已删除');
      } },
    ]);
  };

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Text style={styles.title}>我的</Text>
        <Text style={styles.subtitle}>个人信息与偏好</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* 个人信息 */}
        <Text style={styles.section}>个人信息</Text>
        <View style={styles.card}>
          <View style={styles.nicknameRow}>
            <View style={styles.avatar}><Ionicons name="person" size={22} color="#fff" /></View>
            <View style={styles.nicknameInputWrap}>
              <Text style={styles.nicknameLabel}>昵称</Text>
              <TextInput
                style={styles.nicknameInput}
                value={nickname}
                onChangeText={setNickname}
                placeholder="给自己起个名字"
                placeholderTextColor={colors.ink3}
                returnKeyType="done"
                onSubmitEditing={saveNickname}
              />
            </View>
          </View>
          <TouchableOpacity style={styles.saveBtn} onPress={saveNickname}>
            <Text style={styles.saveBtnText}>保存昵称</Text>
          </TouchableOpacity>
        </View>

        {/* 数据管理 */}
        <Text style={styles.section}>数据管理</Text>
        <View style={styles.card}>
          <Row icon="download-outline" label="导出数据" onPress={handleExport} />
          <View style={styles.divider} />
          <Row icon="trash-outline" label="清空所有打卡记录" danger onPress={handleClear} />
        </View>

        {/* 关于 */}
        <Text style={styles.section}>关于</Text>
        <View style={styles.card}>
          <Row icon="shield-checkmark-outline" label="隐私协议" onPress={() => setShowPrivacy(true)} />
          <View style={styles.divider} />
          <Row icon="refresh-circle-outline" label="检查更新" value={`v${version}`} onPress={handleCheckUpdate} />
          <View style={styles.divider} />
          <Row icon="mail-outline" label="联系我们" value="chaseli9@gmail.com" />
        </View>

        <Text style={styles.footer}>TimeFlow · 版本 {version}</Text>
      </ScrollView>

      {/* 隐私协议全屏 */}
      <Modal visible={showPrivacy} animationType="slide" onRequestClose={() => setShowPrivacy(false)}>
        <PrivacyAgreement onClose={() => setShowPrivacy(false)} />
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
});
