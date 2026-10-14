import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Modal,
  TextInput,
  Linking,
  Platform,
} from 'react-native';
import Constants from 'expo-constants';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getRecords } from '../storage/store';
import { getProfile, saveProfile } from '../storage/profile';
import { getAmapKey, setAmapKey, getAmapLocKeyRaw, setAmapLocKey } from '../config';
import { checkForUpdate } from '../utils/updater';
import { diagnoseLocation } from '../utils/location';
import { refreshWidget } from '../utils/widgetRefresh';
import { useI18n } from '../i18n/LanguageContext';
import { radius } from '../theme';
import { useTheme } from '../theme/ThemeContext';
import PrivacyAgreement from './PrivacyAgreement';

// 计算连续打卡天数
function calculateStreakDays(records) {
  if (!records || records.length === 0) return 0;
  const dateSet = new Set();
  records.forEach((r) => {
    if (r.timestamp) {
      const d = new Date(r.timestamp);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      dateSet.add(key);
    }
  });
  if (dateSet.size === 0) return 0;

  const now = new Date();
  const formatDay = (d) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  let current = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let todayKey = formatDay(current);

  if (!dateSet.has(todayKey)) {
    current.setDate(current.getDate() - 1);
    const yesterdayKey = formatDay(current);
    if (!dateSet.has(yesterdayKey)) return 0;
  }

  let streak = 0;
  while (dateSet.has(formatDay(current))) {
    streak++;
    current.setDate(current.getDate() - 1);
  }
  return streak;
}

// 统一列表 Row 项：默认统一暖色调图标风格
function Row({ icon, label, value, onPress, danger, iconColor, iconBg }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const defaultIconColor = '#9A6B4B';
  const defaultIconBg = '#F6ECE2';

  return (
    <TouchableOpacity style={styles.row} onPress={onPress} activeOpacity={0.6}>
      <View
        style={[
          styles.iconHolder,
          { backgroundColor: danger ? 'rgba(239, 68, 68, 0.12)' : (iconBg || defaultIconBg) },
        ]}
      >
        <Ionicons
          name={icon}
          size={17}
          color={danger ? colors.danger : (iconColor || defaultIconColor)}
        />
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
  const [showTheme, setShowTheme] = useState(false);

  const [showAmapKey, setShowAmapKey] = useState(false);
  const [amapKeyDraft, setAmapKeyDraft] = useState('');
  const [amapKeySet, setAmapKeySet] = useState(false);
  const [amapKeyInvalid, setAmapKeyInvalid] = useState(false);

  const [showLocKey, setShowLocKey] = useState(false);
  const [locKeyDraft, setLocKeyDraft] = useState('');
  const [locKeyState, setLocKeyState] = useState('default');
  const [locKeyInvalid, setLocKeyInvalid] = useState(false);

  const [showLocationDebug, setShowLocationDebug] = useState(false);
  const [showWidgetGuide, setShowWidgetGuide] = useState(false);
  const [diagRunning, setDiagRunning] = useState(false);

  const [streakDays, setStreakDays] = useState(0);
  const [showEditNickname, setShowEditNickname] = useState(false);
  const [nicknameDraft, setNicknameDraft] = useState('');

  const loadProfile = useCallback(async () => {
    const [p, recs] = await Promise.all([getProfile(), getRecords()]);
    setNickname(p?.nickname || '');
    setStreakDays(calculateStreakDays(recs));
  }, []);
  React.useEffect(() => { loadProfile(); }, [loadProfile]);

  const persistNickname = async () => {
    const val = nicknameDraft.trim();
    setNickname(val);
    await saveProfile({ nickname: val });
    setShowEditNickname(false);
  };

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

  // 高德 Key 保存
  const persistAmapKey = async () => {
    const val = amapKeyDraft.trim();
    if (val && !/^[a-zA-Z0-9]{16,64}$/.test(val)) {
      setAmapKeyInvalid(true);
      return;
    }
    setAmapKeyInvalid(false);
    await setAmapKey(val || null);
    setAmapKeySet(!!val);
    setShowAmapKey(false);
    Alert.alert(t('profile.amapKeySavedTitle'), t('profile.amapKeySavedBody'));
  };

  const clearAmapKeyAction = async () => {
    await setAmapKey(null);
    setAmapKeySet(false);
    setShowAmapKey(false);
    Alert.alert(t('profile.amapKeySavedTitle'), t('profile.amapKeySavedBody'));
  };

  // 高德定位 Key 保存
  const persistLocKey = async (mode) => {
    if (mode === 'default') {
      await setAmapLocKey(null);
      setLocKeyState('default');
      setShowLocKey(false);
    } else if (mode === 'disabled') {
      await setAmapLocKey('');
      setLocKeyState('disabled');
      setShowLocKey(false);
    } else {
      const val = locKeyDraft.trim();
      if (!val || !/^[a-zA-Z0-9]{16,64}$/.test(val)) {
        setLocKeyInvalid(true);
        return;
      }
      setLocKeyInvalid(false);
      await setAmapLocKey(val);
      setLocKeyState('set');
      setShowLocKey(false);
    }
  };

  // 定位自检排查
  const handleLocationDiag = async () => {
    if (diagRunning) return;
    setDiagRunning(true);
    try {
      const report = await diagnoseLocation(lang);
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

  const languageValue = isSystem ? t('language.system') : (lang === 'zh' ? t('language.zh') : t('language.en'));
  const themeValue = themeIsSystem ? t('theme.system') : theme === 'dark' ? t('theme.dark') : t('theme.light');

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Text style={styles.title}>{t('profile.title')}</Text>
        <Text style={styles.subtitle}>{t('profile.subtitle')}</Text>
      </View>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]} showsVerticalScrollIndicator={false}>
        {/* 1. 现代个人身份卡片 */}
        <View style={styles.fancyProfileCard}>
          <View style={styles.avatarFancyWrap}>
            <View style={styles.avatarFancy}>
              <Ionicons name="person" size={26} color="#FFFFFF" />
            </View>
            <View style={styles.badgeStar}>
              <Text style={styles.badgeStarText}>★</Text>
            </View>
          </View>

          <View style={styles.profileTextWrap}>
            <Text style={styles.profileNickname} numberOfLines={1}>
              {nickname || t('profile.defaultNickname')}
            </Text>
            <View style={styles.streakBadge}>
              <Text style={styles.streakBadgeText}>
                {streakDays > 0 ? t('profile.streakDays', { n: streakDays }) : t('profile.streakToday')}
              </Text>
            </View>
          </View>

          <TouchableOpacity
            style={styles.editProfileBtn}
            onPress={() => {
              setNicknameDraft(nickname);
              setShowEditNickname(true);
            }}
            activeOpacity={0.7}
          >
            <Text style={styles.editProfileBtnText}>{t('profile.editProfile')} ✎</Text>
          </TouchableOpacity>
        </View>

        {/* 2. 分组一：通用 */}
        <Text style={styles.sectionHeader}>{t('profile.sectionGeneral', '通用')}</Text>
        <View style={styles.card}>
          <Row
            icon="language-outline"
            label={t('profile.language')}
            value={languageValue}
            onPress={() => setShowLang(true)}
          />
          <View style={styles.divider} />
          <Row
            icon="color-palette-outline"
            label={t('profile.theme')}
            value={themeValue}
            onPress={() => setShowTheme(true)}
          />
        </View>

        {/* 4. 分组二：打卡 */}
        <Text style={styles.sectionHeader}>{t('profile.sectionCheckin', '打卡')}</Text>
        <View style={styles.card}>
          <Row
            icon="shapes-outline"
            label={t('profile.sectionWidget')}
            value="查看说明"
            onPress={() => setShowWidgetGuide(true)}
          />
          <View style={styles.divider} />
          <Row
            icon="locate-outline"
            label={t('profile.locationDebug')}
            onPress={() => setShowLocationDebug(true)}
          />
          <View style={styles.divider} />
          <Row
            icon="map-outline"
            label={t('profile.amapKey')}
            value={amapKeySet ? t('profile.amapKeySet') : t('profile.amapKeyEmpty')}
            onPress={async () => {
              const k = await getAmapKey();
              setAmapKeyDraft(k || '');
              setAmapKeyInvalid(false);
              setShowAmapKey(true);
            }}
          />
          <View style={styles.divider} />
          <Row
            icon="navigate-circle-outline"
            label={t('profile.amapLocKey')}
            value={
              locKeyState === 'default'
                ? t('profile.amapLocKeyDefault')
                : locKeyState === 'disabled'
                ? t('profile.amapLocKeyDisabled')
                : t('profile.amapKeySet')
            }
            onPress={async () => {
              const raw = await getAmapLocKeyRaw();
              setLocKeyDraft(raw && raw !== '' ? raw : '');
              setLocKeyInvalid(false);
              setShowLocKey(true);
            }}
          />
        </View>

        {/* 5. 分组三：关于 */}
        <Text style={styles.sectionHeader}>{t('profile.sectionAbout')}</Text>
        <View style={styles.card}>
          <Row
            icon="cloud-download-outline"
            label={t('profile.checkUpdate')}
            onPress={handleCheckUpdate}
          />
          <View style={styles.divider} />
          <Row
            icon="shield-outline"
            label={t('profile.privacy')}
            onPress={() => setShowPrivacy(true)}
          />
        </View>

        <Text style={styles.footer}>{t('profile.version', { v: version })}</Text>
      </ScrollView>

      {/* 隐私协议 */}
      <Modal
        visible={showPrivacy}
        animationType="slide"
        statusBarTranslucent
        onRequestClose={() => setShowPrivacy(false)}
      >
        <PrivacyAgreement onClose={() => setShowPrivacy(false)} />
      </Modal>

      {/* 语言选择 Modal */}
      <Modal visible={showLang} transparent animationType="fade" onRequestClose={() => setShowLang(false)}>
        <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={() => setShowLang(false)}>
          <View style={styles.dialog} onStartShouldSetResponder={() => true}>
            <Text style={styles.dialogTitle}>{t('profile.languageTitle')}</Text>
            {LANG_OPTIONS.map((opt) => {
              const active = isSystem ? opt.key === 'system' : lang === opt.key;
              return (
                <TouchableOpacity
                  key={opt.key}
                  style={[styles.langOption, active && styles.langOptionActive]}
                  onPress={async () => {
                    await setLang(opt.key);
                    setShowLang(false);
                  }}
                >
                  <Text style={[styles.langOptionText, active && styles.langOptionTextActive]}>
                    {t(opt.labelKey)}
                  </Text>
                  {active && <Ionicons name="checkmark" size={18} color={colors.primaryStrong} />}
                </TouchableOpacity>
              );
            })}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* 主题选择 Modal */}
      <Modal visible={showTheme} transparent animationType="fade" onRequestClose={() => setShowTheme(false)}>
        <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={() => setShowTheme(false)}>
          <View style={styles.dialog} onStartShouldSetResponder={() => true}>
            <Text style={styles.dialogTitle}>{t('profile.theme')}</Text>
            {THEME_OPTIONS.map((opt) => {
              const active = themeIsSystem ? opt.key === 'system' : theme === opt.key;
              return (
                <TouchableOpacity
                  key={opt.key}
                  style={[styles.langOption, active && styles.langOptionActive]}
                  onPress={async () => {
                    await setTheme(opt.key);
                    setShowTheme(false);
                  }}
                >
                  <Text style={[styles.langOptionText, active && styles.langOptionTextActive]}>
                    {t(opt.labelKey)}
                  </Text>
                  {active && <Ionicons name="checkmark" size={18} color={colors.primaryStrong} />}
                </TouchableOpacity>
              );
            })}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* 桌面小组件指南 Modal */}
      <Modal visible={showWidgetGuide} transparent animationType="fade" onRequestClose={() => setShowWidgetGuide(false)}>
        <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={() => setShowWidgetGuide(false)}>
          <View style={styles.dialog} onStartShouldSetResponder={() => true}>
            <Text style={styles.dialogTitle}>{t('profile.sectionWidget')}</Text>
            <Text style={styles.dialogSub}>
              长按桌面空白处 → 添加「微件/小组件」→ 找到「TimeFlow 时空流」并拖至桌面，即可无需打开应用一键打卡或查看今日足迹。
            </Text>
            <View style={styles.dialogRow}>
              <TouchableOpacity
                style={[styles.dialogBtn, styles.dialogOk]}
                onPress={async () => {
                  await refreshWidget();
                  setShowWidgetGuide(false);
                }}
              >
                <Text style={styles.dialogOkText}>{t('common.done') || '知道了'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* 昵称编辑 Modal */}
      <Modal visible={showEditNickname} transparent animationType="fade" onRequestClose={() => setShowEditNickname(false)}>
        <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={() => setShowEditNickname(false)}>
          <View style={styles.dialog} onStartShouldSetResponder={() => true}>
            <Text style={styles.dialogTitle}>{t('profile.nickname')}</Text>
            <TextInput
              style={styles.input}
              value={nicknameDraft}
              onChangeText={setNicknameDraft}
              placeholder={t('profile.nicknamePlaceholder')}
              placeholderTextColor={colors.ink3}
              maxLength={20}
              autoFocus
            />
            <View style={styles.dialogRow}>
              <TouchableOpacity
                style={[styles.dialogBtn, styles.dialogCancel]}
                onPress={() => setShowEditNickname(false)}
              >
                <Text style={styles.dialogCancelText}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.dialogBtn, styles.dialogOk]}
                onPress={persistNickname}
              >
                <Text style={styles.dialogOkText}>{t('common.save')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* 高德 Web 服务 Key 设置 Modal */}
      <Modal visible={showAmapKey} transparent animationType="fade" onRequestClose={() => setShowAmapKey(false)}>
        <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={() => setShowAmapKey(false)}>
          <View style={styles.dialog} onStartShouldSetResponder={() => true}>
            <Text style={styles.dialogTitle}>{t('profile.amapKeyTitle')}</Text>
            <Text style={styles.dialogSub}>{t('profile.amapKeySub')}</Text>
            <TextInput
              style={styles.input}
              value={amapKeyDraft}
              onChangeText={(text) => {
                setAmapKeyDraft(text);
                setAmapKeyInvalid(false);
              }}
              placeholder={t('profile.amapKeyPlaceholder')}
              placeholderTextColor={colors.ink3}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {amapKeyInvalid && <Text style={styles.errorText}>{t('profile.amapKeyInvalid')}</Text>}
            <View style={styles.dialogRow}>
              {amapKeySet && (
                <TouchableOpacity
                  style={styles.dialogGhost}
                  onPress={clearAmapKeyAction}
                >
                  <Text style={styles.dialogGhostText}>{t('profile.amapKeyClear')}</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={[styles.dialogBtn, styles.dialogCancel]}
                onPress={() => setShowAmapKey(false)}
              >
                <Text style={styles.dialogCancelText}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.dialogBtn, styles.dialogOk]}
                onPress={persistAmapKey}
              >
                <Text style={styles.dialogOkText}>{t('common.save')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* 高德定位 SDK Key 设置 Modal */}
      <Modal visible={showLocKey} transparent animationType="fade" onRequestClose={() => setShowLocKey(false)}>
        <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={() => setShowLocKey(false)}>
          <View style={styles.dialog} onStartShouldSetResponder={() => true}>
            <Text style={styles.dialogTitle}>{t('profile.amapLocKeyTitle')}</Text>
            <Text style={styles.dialogSub}>{t('profile.amapLocKeySub')}</Text>
            <TextInput
              style={styles.input}
              value={locKeyDraft}
              onChangeText={(text) => {
                setLocKeyDraft(text);
                setLocKeyInvalid(false);
              }}
              placeholder={t('profile.amapLocKeyPlaceholder')}
              placeholderTextColor={colors.ink3}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {locKeyInvalid && <Text style={styles.errorText}>{t('profile.amapKeyInvalid')}</Text>}
            <View style={styles.dialogRow}>
              <TouchableOpacity
                style={[styles.dialogBtn, styles.dialogCancel]}
                onPress={() => setShowLocKey(false)}
              >
                <Text style={styles.dialogCancelText}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.dialogBtn, styles.dialogOk]}
                onPress={() => persistLocKey('custom')}
              >
                <Text style={styles.dialogOkText}>{t('common.save')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* 位置排查诊断 Modal */}
      <Modal visible={showLocationDebug} transparent animationType="fade" onRequestClose={() => setShowLocationDebug(false)}>
        <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={() => setShowLocationDebug(false)}>
          <View style={styles.dialog} onStartShouldSetResponder={() => true}>
            <Text style={styles.dialogTitle}>{t('profile.locationDebug')}</Text>
            <Text style={styles.dialogSub}>
              检测当前设备的系统定位服务、运行时权限、高德定位 SDK 及逆地理编码状态。
            </Text>
            <View style={styles.dialogRow}>
              <TouchableOpacity
                style={[styles.dialogBtn, styles.dialogCancel]}
                onPress={() => setShowLocationDebug(false)}
              >
                <Text style={styles.dialogCancelText}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.dialogBtn, styles.dialogOk]}
                onPress={async () => {
                  setShowLocationDebug(false);
                  await handleLocationDiag();
                }}
              >
                <Text style={styles.dialogOkText}>{diagRunning ? '检测中…' : t('profile.locationDiag')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const makeStyles = (colors) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: { paddingHorizontal: 20, paddingBottom: 12 },
  title: { fontSize: 24, fontWeight: '700', color: colors.ink },
  subtitle: { fontSize: 13, color: colors.ink3, marginTop: 2, fontWeight: '500' },
  content: { paddingHorizontal: 16, paddingTop: 4 },

  fancyProfileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.line,
  },
  avatarFancyWrap: { position: 'relative', marginRight: 14 },
  avatarFancy: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeStar: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#F59E0B',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.surface,
  },
  badgeStarText: { color: '#FFFFFF', fontSize: 10, fontWeight: '700' },
  profileTextWrap: { flex: 1, justifyContent: 'center' },
  profileNickname: { fontSize: 17, fontWeight: '700', color: colors.ink, marginBottom: 4 },
  streakBadge: {
    alignSelf: 'flex-start',
    backgroundColor: colors.primarySoft,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  streakBadgeText: { fontSize: 11, fontWeight: '600', color: colors.primaryStrong },
  editProfileBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: colors.chip,
  },
  editProfileBtnText: { fontSize: 12, fontWeight: '600', color: colors.ink2 },

  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    paddingVertical: 4,
    paddingHorizontal: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.line,
  },
  sectionHeader: {
    fontSize: 12.5,
    color: colors.ink2,
    fontWeight: '700',
    marginTop: 8,
    marginBottom: 8,
    marginLeft: 4,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11, paddingHorizontal: 4 },
  iconHolder: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowLabel: { flex: 1, fontSize: 14, color: colors.ink, fontWeight: '600' },
  rowValue: { fontSize: 12.5, color: colors.ink3, marginRight: 4, fontWeight: '500' },
  divider: { height: 1, backgroundColor: colors.line, marginHorizontal: 6 },
  footer: { textAlign: 'center', fontSize: 12, color: colors.ink3, marginTop: 12, fontWeight: '500' },

  overlay: {
    flex: 1,
    backgroundColor: colors.scrim,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
  },
  dialog: { width: '100%', backgroundColor: colors.surface, borderRadius: 20, padding: 18 },
  dialogTitle: { fontSize: 17, fontWeight: '700', color: colors.ink, textAlign: 'center', marginBottom: 8 },
  dialogSub: { fontSize: 12.5, color: colors.ink3, marginTop: 2, marginBottom: 8, lineHeight: 18 },
  input: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.ink,
    backgroundColor: colors.chip,
  },
  errorText: { marginTop: 6, fontSize: 12, color: colors.danger },
  dialogGhost: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  dialogGhostText: { fontSize: 14, color: colors.danger, fontWeight: '600' },
  dialogRow: { flexDirection: 'row', gap: 10, marginTop: 16 },
  dialogBtn: { flex: 1, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  dialogCancel: { backgroundColor: colors.chip },
  dialogCancelText: { fontSize: 14, color: colors.ink2, fontWeight: '600' },
  dialogOk: { backgroundColor: colors.primary },
  dialogOkText: { fontSize: 14, color: '#fff', fontWeight: '700' },
  langOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 12,
  },
  langOptionActive: { backgroundColor: colors.primarySofter },
  langOptionText: { fontSize: 15, color: colors.ink },
  langOptionTextActive: { color: colors.primaryStrong, fontWeight: '700' },
});
