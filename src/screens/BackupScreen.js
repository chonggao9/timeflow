import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  ActivityIndicator,
  TextInput,
  Modal,
  Alert,
  Platform,
  ToastAndroid,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { useI18n } from '../i18n/LanguageContext';
import { useTheme } from '../theme/ThemeContext';
import { getRecords, getFocusSessions, getTrips, clearAll } from '../storage/store';
import {
  executeBackupPipeline,
  listUnifiedVersions,
  createPreRestoreSnapshot,
} from '../backup/backup';
import {
  useBackupState,
  updateBackupState,
} from '../backup/state';
import {
  isAutoBackupEnabled,
  setAutoBackup,
} from '../backup/schedule';
import {
  getWebDavConfig,
  saveWebDavConfig,
  clearWebDavConfig,
  testConnectionWith,
  getWebDavPassword,
} from '../backup/webdav';
import BackupRestoreSheet from '../components/BackupRestoreSheet';

export default function BackupScreen({ visible, onBack, initialAction }) {
  const insets = useSafeAreaInsets();
  const { t } = useI18n();
  const { colors } = useTheme();
  const backupState = useBackupState();

  // 数据列表与加载
  const [versions, setVersions] = useState([]);
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [currentCounts, setCurrentCounts] = useState({ records: 0, focus: 0, trips: 0 });
  const [backingUp, setBackingUp] = useState(false);
  const [autoBackupOn, setAutoBackupOn] = useState(true);
  const [cloudConfigured, setCloudConfigured] = useState(false);

  // 恢复弹层
  const [selectedVersion, setSelectedVersion] = useState(null);
  const [showRestoreSheet, setShowRestoreSheet] = useState(false);

  // 云端独立设置弹层
  const [showCloudModal, setShowCloudModal] = useState(false);
  const [cloudDavUrl, setCloudDavUrl] = useState('');
  const [cloudDavUser, setCloudDavUser] = useState('');
  const [cloudDavPass, setCloudDavPass] = useState('');
  const [cloudDavTesting, setCloudDavTesting] = useState(false);
  const [cloudDavTested, setCloudDavTested] = useState(false);

  // 危险操作：清空确认
  const [showDangerModal, setShowDangerModal] = useState(false);
  const [dangerConfirmText, setDangerConfirmText] = useState('');
  const [clearing, setClearing] = useState(false);

  const showToastMsg = (msg) => {
    if (Platform.OS === 'android') {
      ToastAndroid.show(msg, ToastAndroid.SHORT);
    } else {
      Alert.alert(t('common.tip', '提示'), msg);
    }
  };

  // 加载数据
  const reloadData = useCallback(async () => {
    try {
      const [recs, focus, trips, autoOn, cloudCfg] = await Promise.all([
        getRecords(),
        getFocusSessions(),
        getTrips(),
        isAutoBackupEnabled(),
        getWebDavConfig(),
      ]);
      setCurrentCounts({
        records: recs ? recs.length : 0,
        focus: focus ? focus.length : 0,
        trips: trips ? trips.length : 0,
      });
      setAutoBackupOn(autoOn);
      setCloudConfigured(!!cloudCfg);
    } catch (e) {}

    setLoadingVersions(true);
    try {
      const vs = await listUnifiedVersions();
      setVersions(vs);
    } catch (e) {
    } finally {
      setLoadingVersions(false);
    }
  }, []);

  useEffect(() => {
    if (visible) {
      reloadData();
      if (initialAction === 'setup' || initialAction === 'cloud') {
        openCloudSettings();
      } else if (initialAction === 'backupNow') {
        setTimeout(() => {
          handleManualBackup(false);
        }, 350);
      }
    }
  }, [visible, initialAction, reloadData]);

  // 时间格式化
  const formatTimeStr = (isoOrMs) => {
    if (!isoOrMs) return '';
    const d = new Date(isoOrMs);
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const h = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    return `${m}-${day} ${h}:${min}`;
  };

  const getRelativeTime = (timeMs) => {
    if (!timeMs) return '从未';
    const diff = Date.now() - timeMs;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return '刚刚';
    if (mins < 60) return `${mins} 分钟前`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours} 小时前`;
    const days = Math.floor(hours / 24);
    return `${days} 天前`;
  };

  // 手动备份逻辑（免密直接备份）
  const handleManualBackup = async (forceOverwriteSafety = false) => {
    if (backingUp) return;
    setBackingUp(true);
    try {
      const result = await executeBackupPipeline({
        isManual: true,
        forceBypassConfirm: forceOverwriteSafety,
      });

      if (result.skippedReason === 'content_hash_identical') {
        showToastMsg(t('backup.sameDataToast', '数据无变化，已是最新'));
      } else if (result.skippedReason === 'needConfirm') {
        // 触发熔断
      } else {
        const cloudOk = result.cloudUploaded;
        const msg = cloudOk
          ? '备份完成 · 云端 + 本地'
          : result.cloudError
          ? `本地已备份；云端失败：${result.cloudError.message}`
          : '本地已安全备份';
        showToastMsg(msg);
      }
      await reloadData();
    } catch (err) {
      Alert.alert(t('common.tip', '提示'), err.message || '备份失败');
    } finally {
      setBackingUp(false);
    }
  };

  // 保持暂停
  const handleKeepPause = () => {
    showToastMsg('已保持暂停，不会自动上传');
  };

  // 切换自动备份
  const handleToggleAutoBackup = async (val) => {
    setAutoBackupOn(val);
    await setAutoBackup(val);
    showToastMsg(val ? '已开启自动备份' : '已关闭自动备份');
  };

  // 打开云端独立设置
  const openCloudSettings = async () => {
    const dav = await getWebDavConfig();
    const pass = await getWebDavPassword();
    setCloudDavUrl(dav?.url || 'https://dav.jianguoyun.com/dav/');
    setCloudDavUser(dav?.username || '');
    setCloudDavPass(pass || '');
    setCloudDavTesting(false);
    setCloudDavTested(false);
    setShowCloudModal(true);
  };

  // 导出未加密可读数据
  const handleExportReadable = async () => {
    try {
      const recs = await getRecords();
      const focus = await getFocusSessions();
      const trips = await getTrips();
      const payload = {
        app: 'TimeFlow',
        exportedAt: new Date().toISOString(),
        counts: {
          records: recs ? recs.length : 0,
          focus: focus ? focus.length : 0,
          trips: trips ? trips.length : 0,
        },
        records: recs || [],
        focusSessions: focus || [],
        trips: trips || [],
      };
      const jsonStr = JSON.stringify(payload, null, 2);
      const fileUri = `${FileSystem.cacheDirectory}timeflow-readable-${Date.now()}.json`;
      await FileSystem.writeAsStringAsync(fileUri, jsonStr);
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, {
          mimeType: 'application/json',
          dialogTitle: t('backup.exportReadable', '导出可读数据'),
        });
      } else {
        Alert.alert(t('common.tip', '提示'), '当前设备不支持分享导出文件');
      }
    } catch (e) {
      Alert.alert(t('common.tip', '提示'), '导出失败: ' + e.message);
    }
  };

  // 清空确认
  const handleConfirmClear = async () => {
    if (dangerConfirmText.trim() !== '清空' && dangerConfirmText.trim() !== 'CLEAR') {
      return;
    }
    setClearing(true);
    try {
      // 1. 先保存恢复前快照
      await createPreRestoreSnapshot().catch(() => null);
      // 2. 清空
      await clearAll();
      showToastMsg(t('backup.clearDoneToast', '已清空，恢复前快照已保存'));
      setShowDangerModal(false);
      await reloadData();
    } catch (e) {
      Alert.alert(t('common.tip', '提示'), '清空失败: ' + e.message);
    } finally {
      setClearing(false);
    }
  };

  if (!visible) return null;

  const st = backupState.status || 'ok';

  // Hero 卡片色彩与文字映射
  let heroTheme = {
    bg: '#E5F4EA',
    color: '#25915F',
    icon: 'shield-checkmark',
    title: t('backup.statusNormal', '备份正常'),
    subtitle: cloudConfigured
      ? '云端与本地实时同步'
      : '本地沙盒自动守护中',
  };

  if (st === 'stale') {
    heroTheme = {
      bg: '#FCF1D9',
      color: '#A96A0B',
      icon: 'time-outline',
      title: t('backup.statusStale', '已 3 天未备份'),
      subtitle: t('backup.lastBackupPrefix', {
        time: getRelativeTime(backupState.lastSuccessAt),
        n: (backupState.lastCounts?.records || currentCounts.records).toLocaleString(),
      }),
    };
  } else if (st === 'failed') {
    heroTheme = {
      bg: '#FDE7E4',
      color: '#CF3B3B',
      icon: 'alert-circle',
      title: t('backup.statusFailed', '云端备份失败'),
      subtitle: t('backup.descFailed', '授权已过期，本地备份正常'),
    };
  } else if (st === 'needConfirm') {
    heroTheme = {
      bg: '#FCF1D9',
      color: '#A96A0B',
      icon: 'pause-circle-outline',
      title: t('backup.statusNeedConfirm', '自动备份已暂停'),
      subtitle: t('backup.descNeedConfirm', {
        local: currentCounts.records,
        remote: backupState.lastCounts?.records || 0,
      }),
    };
  }

  // 胶囊标签状态
  const cloudChip = !cloudConfigured
    ? { ok: false, label: '云端 未开启' }
    : st === 'failed'
    ? { err: true, label: '云端 需修复' }
    : { ok: true, label: '云端 正常' };

  const localChip = { ok: true, label: '本地 正常' };

  return (
    <Modal visible={visible} animationType="slide" statusBarTranslucent onRequestClose={onBack}>
      <View style={[styles.container, { backgroundColor: colors.bg }]}>
        {/* 顶部导航 */}
        <View style={[styles.navBar, { paddingTop: insets.top + 8 }]}>
          <TouchableOpacity style={styles.navBackBtn} onPress={onBack} activeOpacity={0.7}>
            <Ionicons name="chevron-back" size={24} color={colors.ink} />
          </TouchableOpacity>
          <Text style={[styles.navTitle, { color: colors.ink }]}>
            {t('backup.navTitle', '备份与恢复')}
          </Text>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 32 }]}
          showsVerticalScrollIndicator={false}
        >
          {/* HERO 卡片 */}
          <View style={[styles.heroCard, { backgroundColor: colors.surface }]}>
            <View style={styles.heroTop}>
              <View style={[styles.heroIconBox, { backgroundColor: heroTheme.bg }]}>
                <Ionicons name={heroTheme.icon} size={24} color={heroTheme.color} />
              </View>
              <View style={styles.heroText}>
                <Text style={[styles.heroTitle, { color: heroTheme.color }]}>
                  {heroTheme.title}
                </Text>
                <Text style={[styles.heroSubtitle, { color: colors.ink3 }]}>
                  {heroTheme.subtitle}
                </Text>
              </View>
            </View>

            {/* 状态胶囊 */}
            <View style={styles.chipRow}>
              {[cloudChip, localChip].map((chip, idx) => (
                <View
                  key={idx}
                  style={[
                    styles.chip,
                    chip.ok && { backgroundColor: '#E5F4EA' },
                    chip.err && { backgroundColor: '#FDE7E4' },
                    !chip.ok && !chip.err && { backgroundColor: '#EEE9E3' },
                  ]}
                >
                  <Text
                    style={[
                      styles.chipText,
                      chip.ok && { color: '#25915F' },
                      chip.err && { color: '#CF3B3B' },
                      !chip.ok && !chip.err && { color: '#6F645C' },
                    ]}
                  >
                    {chip.label}
                  </Text>
                </View>
              ))}
            </View>

            {/* 异常横幅 */}
            {st === 'failed' && (
              <View style={[styles.banner, { backgroundColor: '#FDE7E4', borderColor: '#F8B4B4' }]}>
                <Text style={[styles.bannerTitle, { color: '#CF3B3B' }]}>云端授权已过期</Text>
                <Text style={[styles.bannerDesc, { color: colors.ink }]}>
                  最近一次云端备份失败，本地备份不受影响。请更新 WebDAV 应用密码。
                </Text>
                <View style={styles.bannerBtnRow}>
                  <TouchableOpacity
                    style={[styles.bannerBtn, { backgroundColor: colors.surface }]}
                    onPress={openCloudSettings}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.bannerBtnText, { color: colors.ink }]}>
                      {t('backup.btnFix', '去修复')}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {st === 'needConfirm' && (
              <View style={[styles.banner, { backgroundColor: '#FCF1D9', borderColor: '#FDE0B2' }]}>
                <Text style={[styles.bannerTitle, { color: '#A96A0B' }]}>记录数明显减少</Text>
                <Text style={[styles.bannerDesc, { color: colors.ink }]}>
                  本机现有 {currentCounts.records} 条，云端最新版本为 {backupState.lastCounts?.records || 0} 条。为防止覆盖云端历史，已暂停自动备份。
                </Text>
                <View style={styles.bannerBtnRow}>
                  <TouchableOpacity
                    style={[styles.bannerBtn, { backgroundColor: colors.surface }]}
                    onPress={handleKeepPause}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.bannerBtnText, { color: colors.ink }]}>
                      {t('backup.btnKeepPause', '保持暂停')}
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.bannerBtn, { backgroundColor: colors.primary }]}
                    onPress={() => handleManualBackup(true)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.bannerBtnText, { color: '#FFFFFF' }]}>
                      {t('backup.btnBackupAnyway', '仍然备份')}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {st === 'stale' && (
              <View style={[styles.banner, { backgroundColor: '#FCF1D9', borderColor: '#FDE0B2' }]}>
                <Text style={[styles.bannerTitle, { color: '#A96A0B' }]}>已超过 3 天没有备份</Text>
                <Text style={[styles.bannerDesc, { color: colors.ink }]}>
                  建议现在备份一次，避免换机或误删后丢失数据。
                </Text>
              </View>
            )}

            {/* 主操作按钮 */}
            {backingUp ? (
              <View style={[styles.progressBox, { backgroundColor: colors.chip }]}>
                <ActivityIndicator size="small" color={colors.primary} style={{ marginRight: 8 }} />
                <Text style={[styles.progressText, { color: colors.ink }]}>
                  {t('backup.backingUp', '正在备份…')}
                </Text>
              </View>
            ) : st === 'needConfirm' ? null : (
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: colors.primary }]}
                onPress={() => handleManualBackup(false)}
                activeOpacity={0.7}
              >
                <Text style={styles.actionBtnText}>
                  {st === 'failed' ? t('backup.btnRetry', '重新备份') : t('backup.btnQuick', '立即备份')}
                </Text>
              </TouchableOpacity>
            )}
          </View>

          {/* 历史版本区 */}
          <View style={styles.secHeaderWrap}>
            <Text style={[styles.secHeader, { color: colors.ink2 }]}>
              {t('backup.historySection', '历史版本')}{' '}
              <Text style={{ fontWeight: '400', fontSize: 12, color: colors.ink3 }}>
                {t('backup.historySub', '· 云端保留最近 7 份，本地 5 份')}
              </Text>
            </Text>
          </View>

          <View style={[styles.card, { backgroundColor: colors.surface }]}>
            {loadingVersions ? (
              <View style={styles.emptyBox}>
                <ActivityIndicator size="small" color={colors.primary} />
              </View>
            ) : versions.length === 0 ? (
              <View style={styles.emptyBox}>
                <Text style={[styles.emptyText, { color: colors.ink3 }]}>
                  {t('backup.historyEmpty', '还没有备份版本\n完成设置后，每次备份都会出现在这里')}
                </Text>
              </View>
            ) : (
              versions.map((v, idx) => {
                const isSnapshot = v.isSnap;
                return (
                  <TouchableOpacity
                    key={v.name + idx}
                    style={[
                      styles.versionRow,
                      idx < versions.length - 1 && { borderBottomColor: colors.line, borderBottomWidth: 1 },
                    ]}
                    onPress={() => {
                      setSelectedVersion(v);
                      setShowRestoreSheet(true);
                    }}
                    activeOpacity={0.6}
                  >
                    <View style={[styles.rowIcon, { backgroundColor: isSnapshot ? '#FCF1D9' : colors.chip }]}>
                      <Ionicons
                        name={isSnapshot ? 'arrow-undo' : 'document-text-outline'}
                        size={18}
                        color={isSnapshot ? '#A96A0B' : colors.ink}
                      />
                    </View>

                    <View style={styles.rowMain}>
                      <Text style={[styles.rowTitle, { color: colors.ink }]}>
                        {formatTimeStr(v.createdAt || v.modifiedAt)}
                      </Text>
                      <Text style={[styles.rowSub, { color: colors.ink3 }]}>
                        {v.device || 'Android'} · {(v.counts?.records ?? 0).toLocaleString()} 条打卡
                      </Text>
                    </View>

                    <View style={styles.tagWrap}>
                      {isSnapshot ? (
                        <View style={[styles.tagBadge, { backgroundColor: '#FCF1D9' }]}>
                          <Text style={[styles.tagBadgeText, { color: '#A96A0B' }]}>快照</Text>
                        </View>
                      ) : (
                        v.sources?.map((s) => (
                          <View
                            key={s}
                            style={[
                              styles.tagBadge,
                              s === 'cloud'
                                ? { backgroundColor: '#E8F0FD' }
                                : { backgroundColor: colors.chip },
                            ]}
                          >
                            <Text
                              style={[
                                styles.tagBadgeText,
                                s === 'cloud' ? { color: '#3B69C9' } : { color: colors.ink },
                              ]}
                            >
                              {s === 'cloud' ? '云端' : '本地'}
                            </Text>
                          </View>
                        ))
                      )}
                    </View>

                    <Ionicons name="chevron-forward" size={17} color={colors.ink3} />
                  </TouchableOpacity>
                );
              })
            )}
          </View>
          <Text style={[styles.noteText, { color: colors.ink3 }]}>
            {t('backup.historyTip', '点任意版本即可预览并恢复，恢复前自动生成快照保障安全。')}
          </Text>

          {/* 设置区 */}
          <Text style={[styles.secHeader, { color: colors.ink2, marginTop: 22 }]}>
            {t('backup.generalSettings', '设置')}
          </Text>

          <View style={[styles.card, { backgroundColor: colors.surface }]}>
            {/* 云端同步 */}
            <TouchableOpacity
              style={styles.settingRow}
              onPress={openCloudSettings}
              activeOpacity={0.6}
            >
              <View style={[styles.rowIcon, { backgroundColor: colors.chip }]}>
                <Ionicons name="cloud-upload-outline" size={18} color={colors.ink} />
              </View>
              <Text style={[styles.settingLabel, { color: colors.ink }]}>
                {t('backup.cloudSync', '云端同步（WebDAV）')}
              </Text>
              <Text
                style={[
                  styles.settingValue,
                  {
                    color: !cloudConfigured
                      ? colors.ink3
                      : st === 'failed'
                      ? '#CF3B3B'
                      : '#25915F',
                  },
                ]}
              >
                {!cloudConfigured ? '未开启' : st === 'failed' ? '需修复' : '已配置'}
              </Text>
              <Ionicons name="chevron-forward" size={17} color={colors.ink3} />
            </TouchableOpacity>

            <View style={[styles.divider, { backgroundColor: colors.line }]} />

            {/* 自动备份 Switch */}
            <View style={styles.settingRow}>
              <View style={[styles.rowIcon, { backgroundColor: colors.chip }]}>
                <Ionicons name="refresh-outline" size={18} color={colors.ink} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.settingLabel, { color: colors.ink }]}>
                  {t('backup.autoBackup', '自动备份')}
                </Text>
                <Text style={[styles.rowSub, { color: colors.ink3 }]}>
                  {t('backup.autoBackupDesc', '数据变化后自动备份，切后台时补一次')}
                </Text>
              </View>
              <Switch
                value={autoBackupOn}
                onValueChange={handleToggleAutoBackup}
                trackColor={{ false: '#D9D1C9', true: '#25915F' }}
                thumbColor="#FFFFFF"
              />
            </View>

            <View style={[styles.divider, { backgroundColor: colors.line }]} />

            {/* 导出可读数据 */}
            <TouchableOpacity
              style={styles.settingRow}
              onPress={handleExportReadable}
              activeOpacity={0.6}
            >
              <View style={[styles.rowIcon, { backgroundColor: colors.chip }]}>
                <Ionicons name="download-outline" size={18} color={colors.ink} />
              </View>
              <Text style={[styles.settingLabel, { color: colors.ink }]}>
                {t('backup.exportReadable', '导出可读数据')}
              </Text>
              <View style={[styles.tagBadge, { backgroundColor: '#FCF1D9', marginRight: 4 }]}>
                <Text style={[styles.tagBadgeText, { color: '#A96A0B' }]}>未加密</Text>
              </View>
              <Ionicons name="chevron-forward" size={17} color={colors.ink3} />
            </TouchableOpacity>
          </View>
          <Text style={[styles.noteText, { color: colors.ink3 }]}>
            {t('backup.exportReadableNote', '导出为 CSV / JSON，任何人拿到文件都能直接阅读，请妥善保管。')}
          </Text>

          {/* 危险操作区 */}
          <Text style={[styles.secHeader, { color: '#CF3B3B', marginTop: 22 }]}>
            {t('backup.dangerZone', '危险操作')}
          </Text>

          <View style={[styles.card, { backgroundColor: colors.surface }]}>
            <TouchableOpacity
              style={styles.settingRow}
              onPress={() => {
                setDangerConfirmText('');
                setShowDangerModal(true);
              }}
              activeOpacity={0.6}
            >
              <View style={[styles.rowIcon, { backgroundColor: '#FDE7E4' }]}>
                <Ionicons name="trash-outline" size={18} color="#CF3B3B" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.settingLabel, { color: '#CF3B3B' }]}>
                  {t('backup.clearAll', '清空所有打卡记录')}
                </Text>
                <Text style={[styles.rowSub, { color: colors.ink3 }]}>
                  {t('backup.clearAllDesc', '清空前会自动保存一份本地快照')}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={17} color={colors.ink3} />
            </TouchableOpacity>
          </View>
        </ScrollView>

        {/* 恢复版本 4 步 Sheet */}
        <BackupRestoreSheet
          visible={showRestoreSheet}
          versionItem={selectedVersion}
          currentCounts={currentCounts}
          onClose={() => {
            setShowRestoreSheet(false);
            setSelectedVersion(null);
          }}
          onRestored={() => {
            reloadData();
          }}
        />

        {/* WebDAV 独立配置 Modal */}
        <Modal
          visible={showCloudModal}
          transparent
          animationType="slide"
          onRequestClose={() => setShowCloudModal(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={[styles.modalCard, { backgroundColor: colors.surface }]}>
              <Text style={[styles.modalTitle, { color: colors.ink }]}>
                {t('backup.cloudSync', '云端同步（WebDAV）')}
              </Text>
              <Text style={[styles.modalSub, { color: colors.ink3 }]}>
                云端目录：timeflow/ · 只保存加密后的备份文件（.tfb），保留最近 7 份。
              </Text>

              <Text style={[styles.fieldLbl, { color: colors.ink2 }]}>服务器地址</Text>
              <TextInput
                style={[styles.modalInput, { borderColor: colors.line, color: colors.ink }]}
                value={cloudDavUrl}
                onChangeText={setCloudDavUrl}
                placeholder="https://dav.jianguoyun.com/dav/"
                placeholderTextColor={colors.ink3}
              />

              <Text style={[styles.fieldLbl, { color: colors.ink2, marginTop: 8 }]}>账号</Text>
              <TextInput
                style={[styles.modalInput, { borderColor: colors.line, color: colors.ink }]}
                value={cloudDavUser}
                onChangeText={setCloudDavUser}
                placeholder="name@example.com"
                placeholderTextColor={colors.ink3}
              />

              <Text style={[styles.fieldLbl, { color: colors.ink2, marginTop: 8 }]}>应用密码</Text>
              <TextInput
                style={[styles.modalInput, { borderColor: colors.line, color: colors.ink }]}
                value={cloudDavPass}
                onChangeText={setCloudDavPass}
                placeholder="粘贴新的应用密码"
                placeholderTextColor={colors.ink3}
                secureTextEntry
              />

              {cloudDavTesting && (
                <Text style={{ fontSize: 13, color: colors.ink2, marginTop: 6 }}>测试中…</Text>
              )}
              {cloudDavTested && (
                <Text style={{ fontSize: 13, color: '#25915F', marginTop: 6 }}>✓ 连接成功，已可写入</Text>
              )}

              <View style={[styles.bannerBtnRow, { marginTop: 14 }]}>
                <TouchableOpacity
                  style={[styles.bannerBtn, { backgroundColor: colors.chip }]}
                  onPress={async () => {
                    setCloudDavTesting(true);
                    const res = await testConnectionWith(cloudDavUrl, cloudDavUser, cloudDavPass);
                    setCloudDavTesting(false);
                    if (res.ok) {
                      setCloudDavTested(true);
                      showToastMsg('连接成功');
                    } else {
                      Alert.alert('连接失败', res.error?.message || '请检查配置');
                    }
                  }}
                >
                  <Text style={[styles.bannerBtnText, { color: colors.ink }]}>测试连接</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.bannerBtn, { backgroundColor: colors.primary }]}
                  onPress={async () => {
                    if (!cloudDavUser.trim()) {
                      await clearWebDavConfig();
                      await updateBackupState((s) => ({ ...s, cloud: { enabled: false, lastError: null } }));
                      showToastMsg('已清空云端配置');
                    } else {
                      await saveWebDavConfig({
                        url: cloudDavUrl,
                        username: cloudDavUser,
                        appPassword: cloudDavPass,
                      });
                      await updateBackupState((s) => ({ ...s, cloud: { enabled: true, lastError: null } }));
                      showToastMsg('已保存，云端同步恢复正常');
                    }
                    setShowCloudModal(false);
                    await reloadData();
                  }}
                >
                  <Text style={[styles.bannerBtnText, { color: '#FFFFFF' }]}>保存</Text>
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                style={{ marginTop: 12, alignItems: 'center', paddingVertical: 8 }}
                onPress={() => setShowCloudModal(false)}
              >
                <Text style={{ fontSize: 13, color: colors.ink3 }}>关闭</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* 清空危险确认 Modal */}
        <Modal
          visible={showDangerModal}
          transparent
          animationType="fade"
          onRequestClose={() => setShowDangerModal(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={[styles.modalCard, { backgroundColor: colors.surface }]}>
              <Text style={[styles.modalTitle, { color: '#CF3B3B' }]}>清空所有打卡记录？</Text>
              <Text style={[styles.modalSub, { color: colors.ink2 }]}>
                将删除本机全部 {currentCounts.records.toLocaleString()} 条打卡、专注与行程数据。云端备份不受影响。
              </Text>

              <View style={[styles.banner, { backgroundColor: '#E5F4EA', borderColor: '#BBE6CB' }]}>
                <Text style={[styles.bannerDesc, { color: '#1F6F4A' }]}>
                  清空前会自动保存「恢复前快照」，之后可在历史版本里找回。
                </Text>
              </View>

              <Text style={[styles.fieldLbl, { color: colors.ink2, marginTop: 4 }]}>
                请输入「清空」以确认
              </Text>
              <TextInput
                style={[styles.modalInput, { borderColor: colors.line, color: colors.ink }]}
                value={dangerConfirmText}
                onChangeText={setDangerConfirmText}
                placeholder="清空"
                placeholderTextColor={colors.ink3}
              />

              <View style={[styles.bannerBtnRow, { marginTop: 14 }]}>
                <TouchableOpacity
                  style={[styles.bannerBtn, { backgroundColor: colors.chip }]}
                  onPress={() => setShowDangerModal(false)}
                >
                  <Text style={[styles.bannerBtnText, { color: colors.ink }]}>取消</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.bannerBtn,
                    { backgroundColor: '#CF3B3B' },
                    dangerConfirmText.trim() !== '清空' && { opacity: 0.4 },
                  ]}
                  disabled={dangerConfirmText.trim() !== '清空' || clearing}
                  onPress={handleConfirmClear}
                >
                  {clearing ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text style={[styles.bannerBtnText, { color: '#FFFFFF' }]}>清空</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  navBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  navBackBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 6,
  },
  navTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
  },
  heroCard: {
    borderRadius: 22,
    padding: 16,
    marginTop: 4,
    shadowColor: '#5A3C1E',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 3,
  },
  heroTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  heroIconBox: {
    width: 44,
    height: 44,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  heroText: {
    flex: 1,
  },
  heroTitle: {
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 2,
  },
  heroSubtitle: {
    fontSize: 13,
  },
  chipRow: {
    flexDirection: 'row',
    gap: 6,
    flexWrap: 'wrap',
    marginTop: 12,
    marginBottom: 10,
  },
  chip: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 10,
  },
  chipText: {
    fontSize: 12,
    fontWeight: '600',
  },
  banner: {
    borderRadius: 14,
    padding: 12,
    marginTop: 4,
    marginBottom: 10,
    borderWidth: 1,
  },
  bannerTitle: {
    fontSize: 13.5,
    fontWeight: '700',
    marginBottom: 2,
  },
  bannerDesc: {
    fontSize: 12.5,
    lineHeight: 17,
  },
  bannerBtnRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  bannerBtn: {
    flex: 1,
    height: 38,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  bannerBtnText: {
    fontSize: 13.5,
    fontWeight: '600',
  },
  actionBtn: {
    height: 46,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 4,
  },
  actionBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  progressBox: {
    height: 46,
    borderRadius: 14,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 4,
  },
  progressText: {
    fontSize: 14,
    fontWeight: '600',
  },
  secHeaderWrap: {
    marginTop: 20,
    marginBottom: 8,
    marginLeft: 4,
  },
  secHeader: {
    fontSize: 13,
    fontWeight: '700',
  },
  card: {
    borderRadius: 18,
    overflow: 'hidden',
    shadowColor: '#5A3C1E',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  emptyBox: {
    paddingVertical: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
  },
  versionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  rowIcon: {
    width: 34,
    height: 34,
    borderRadius: 11,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  rowMain: {
    flex: 1,
  },
  rowTitle: {
    fontSize: 14.5,
    fontWeight: '600',
    marginBottom: 2,
  },
  rowSub: {
    fontSize: 12,
  },
  tagWrap: {
    flexDirection: 'row',
    gap: 4,
    marginRight: 6,
  },
  tagBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  tagBadgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  noteText: {
    fontSize: 12,
    marginTop: 7,
    marginHorizontal: 6,
    lineHeight: 16,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  settingLabel: {
    flex: 1,
    fontSize: 14.5,
    fontWeight: '500',
  },
  settingValue: {
    fontSize: 13,
    marginRight: 4,
  },
  divider: {
    height: 1,
    marginLeft: 54,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(30, 20, 10, 0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  modalCard: {
    width: '100%',
    borderRadius: 22,
    padding: 20,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 4,
  },
  modalSub: {
    fontSize: 12.5,
    marginBottom: 14,
    lineHeight: 17,
  },
  fieldLbl: {
    fontSize: 12,
    marginBottom: 4,
  },
  modalInput: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 14,
  },
  strengthBarBg: {
    height: 4,
    borderRadius: 2,
    backgroundColor: '#EEE6DD',
    marginTop: 6,
    overflow: 'hidden',
  },
  strengthBar: {
    height: '100%',
    borderRadius: 2,
  },
});
