// 「数据与备份」页（全屏 Modal，沿用项目惯例不占路由）。
// 结构（自上而下，对照设计稿 data()）：hero 状态卡 + chips → 条件横幅 → 主按钮 →
// 我的数据 tiles → 备份记录 → 保存与导入 → 设置 → 危险操作。
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated, Modal, ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import { useI18n } from '../i18n/LanguageContext';
import { useTheme } from '../theme/ThemeContext';
import { radius, shadow } from '../theme';
import { BACKUP_DIR, listVersions, readPackageFromUri, writeCacheFile } from '../backup/files';
import { formatStamp } from '../backup/format';
import { planPrune } from '../backup/plan';
import { runBackup, getCurrentCounts, collectData } from '../backup/backup';
import { buildCsv } from '../backup/csv';
import { useBackupState, updateBackupState } from '../backup/state';
import { clearAll } from '../storage/store';
import HeroCard from '../components/backup/HeroCard';
import VersionList from '../components/backup/VersionList';
import VersionDetailSheet from '../components/backup/VersionDetailSheet';
import RestoreSheet from '../components/backup/RestoreSheet';
import SaveFileSheet from '../components/backup/SaveFileSheet';
import ImportSheet from '../components/backup/ImportSheet';
import ClearConfirmModal from '../components/backup/ClearConfirmModal';
import { useToast } from '../components/backup/Toast';
import { toneColors } from '../components/backup/util';
import CloudCopyScreen from './CloudCopyScreen';

export default function DataBackupScreen({ visible, initialAction, onClose }) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { t, lang } = useI18n();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const state = useBackupState();
  const { show, node: toastNode } = useToast();

  const [versions, setVersions] = useState([]);
  const [counts, setCounts] = useState({ records: 0, focus: 0, trips: 0 });
  const [running, setRunning] = useState(false);
  const [detailVer, setDetailVer] = useState(null);
  const [restoreSrc, setRestoreSrc] = useState(null);
  const [saveVer, setSaveVer] = useState(null);
  const [showImport, setShowImport] = useState(false);
  const [importPicked, setImportPicked] = useState(null);
  const [importInvalid, setImportInvalid] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [showClear, setShowClear] = useState(false);
  const [clearBusy, setClearBusy] = useState(false);
  const [showCloud, setShowCloud] = useState(false);

  // 「正在备份…」不定进度条动画（设计稿为进度条；实际耗时不可预估，用循环滑动近似）
  const progressAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!running) { progressAnim.setValue(0); return undefined; }
    progressAnim.setValue(0);
    const loop = Animated.loop(Animated.timing(progressAnim, { toValue: 1, duration: 1100, useNativeDriver: false }));
    loop.start();
    return () => loop.stop();
  }, [running, progressAnim]);

  const refresh = useCallback(async () => {
    const [vs, cs] = await Promise.all([listVersions(), getCurrentCounts()]);
    setVersions(vs);
    setCounts(cs);
  }, []);

  const quickTimer = useRef(null);
  useEffect(() => {
    if (!visible) return undefined;
    refresh().catch(() => {});
    if (initialAction === 'quick') {
      quickTimer.current = setTimeout(() => { handleManualBackup(); }, 250);
    }
    return () => { if (quickTimer.current) clearTimeout(quickTimer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  // 保留策略只算一次：star（详情弹层标记）与 manual/safe 超限提示共用
  const prune = useMemo(() => planPrune(versions), [versions]);
  const starName = prune.starName;

  const handleManualBackup = async () => {
    if (running) return;
    setRunning(true);
    const res = await runBackup({ kind: 'manual' });
    setRunning(false);
    await refresh();
    if (res.status === 'done') {
      // 本机备份成功是事实；云端失败如实提示（横幅/状态卡也会显示 CLOUD_FAIL）
      if (res.cloud === 'fail') show(t('dataBackup.errCloudFail'));
      else show(res.cloud === 'ok' ? t('dataBackup.toastDoneCloud') : t('dataBackup.toastDone'));
    } else if (res.status === 'skipped') {
      show(t('dataBackup.toastSame'));
    } else if (res.status === 'busy') {
      show(t('dataBackup.btnBacking'));
    } else if (res.status === 'error') {
      show(res.code === 'NO_SPACE' ? t('dataBackup.errNoSpace') : t('dataBackup.errWriteFail'));
    }
  };

  const handleClearConfirm = async () => {
    if (clearBusy) return;
    setClearBusy(true);
    const safe = await runBackup({ kind: 'safe', force: true });
    if (safe.status !== 'done') {
      setClearBusy(false);
      setShowClear(false);
      show(t('clear.failSafe'));
      return;
    }
    try {
      await clearAll();
    } catch (e) {
      // 清空失败：如实告知，不显示成功 toast（safe 备份已在，数据可能原样）
      setClearBusy(false);
      setShowClear(false);
      show(t('restore.failRestore'));
      refresh().catch(() => {});
      return;
    }
    setClearBusy(false);
    setShowClear(false);
    show(t('clear.toast'));
    refresh().catch(() => {});
  };

  const handleToggleAuto = async (val) => {
    await updateBackupState((s) => ({ ...s, autoEnabled: val }));
    show(val ? t('dataBackup.toastAutoOn') : t('dataBackup.toastAutoOff'));
  };

  // 保存备份文件：三个去向都走系统分享面板（微信/QQ、文件、网盘由用户在面板里选）；
  // 先收起弹层再动作，避免 toast 被嵌套 Modal 挡住。完成后记 savedToFileAt（chips/横幅联动）。
  const handleSaveDest = async (dest, version) => {
    setSaveVer(null);
    try {
      await Sharing.shareAsync(BACKUP_DIR + version.name, {
        mimeType: 'application/json',
        dialogTitle: t('save.title'),
      });
      await updateBackupState((s) => ({ ...s, savedToFileAt: Date.now() }));
      show(t('save.toast', { dest: t(dest.labelKey) }));
    } catch (e) {
      show(t('dataBackup.shareFail'));
    }
  };

  // 从文件导入：选 .json → 校验（无效文件行内红字提示，可重选）
  const handlePickFile = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        // 各文件管理器对 .json 的 MIME 上报不一致（常见 octet-stream），
        // 故不收紧过滤，由 validatePackage 严格把关
        type: '*/*',
        copyToCacheDirectory: true,
      });
      const asset = res?.assets?.[0];
      if (!asset) return; // 用户取消
      const pkg = await readPackageFromUri(asset.uri);
      if (!pkg) {
        setImportPicked(null);
        setImportInvalid(true);
        return;
      }
      setImportPicked({ pkg, name: asset.name || 'backup.json', size: asset.size || 0 });
      setImportInvalid(false);
    } catch (e) {
      setImportPicked(null);
      setImportInvalid(true);
    }
  };

  // 导出为表格（真 CSV，UTF-8 BOM 保证 Excel 中文不乱码；文件名与备份共用时间戳口径）
  const handleExportCsv = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const data = await collectData();
      const now = new Date();
      const csv = buildCsv(data, { lang, now });
      const uri = await writeCacheFile(`timeflow-export-${formatStamp(now)}.csv`, `﻿${csv}`);
      await Sharing.shareAsync(uri, { mimeType: 'text/csv', dialogTitle: t('dataBackup.exportCsv') });
    } catch (e) {
      show(t('dataBackup.exportFail'));
    } finally {
      setExporting(false);
    }
  };

  // 横幅（互斥：failed > stale > ok-仅本机）
  const ui = state.uiStatus;
  const showLocalBanner = ui === 'ok' && !state.cloudEnabled && !state.savedToFileAt;
  let banner = null;
  if (ui === 'failed') {
    const noSpace = state.lastError?.code === 'NO_SPACE';
    banner = {
      tone: 'err',
      // 标题按错误类型区分：空间不足才说「存储空间不足」，其余用通用失败标题
      title: noSpace ? t('dataBackup.bannerFailedTitle') : t('dataBackup.statusFailedTitle'),
      body: noSpace ? t('dataBackup.bannerFailedBody') : t('dataBackup.errWriteFail'),
      action: versions.length ? { label: t('dataBackup.btnSaveFile'), fn: () => setSaveVer(versions[0]) } : null,
    };
  } else if (ui === 'stale') {
    banner = { tone: 'warn', title: t('dataBackup.bannerStaleTitle'), body: t('dataBackup.bannerStaleBody'), action: null };
  } else if (showLocalBanner) {
    banner = {
      tone: 'warn',
      title: t('dataBackup.bannerLocalTitle'),
      body: t('dataBackup.bannerLocalBody'),
      action: versions.length ? { label: t('dataBackup.btnSaveFile'), fn: () => setSaveVer(versions[0]) } : null,
    };
  }

  const mainLabel = ui === 'empty' ? t('dataBackup.btnFirst')
    : ui === 'failed' ? t('dataBackup.btnRetry')
    : t('dataBackup.btnQuick');

  return (
    <Modal visible={visible} animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <View style={styles.screen}>
        {/* 导航行 */}
        <View style={[styles.nav, { paddingTop: insets.top + 8 }]}>
          <TouchableOpacity onPress={onClose} style={styles.backBtn} activeOpacity={0.6}>
            <Ionicons name="chevron-back" size={24} color={colors.ink} />
          </TouchableOpacity>
          <Text style={styles.navTitle}>{t('dataBackup.navTitle')}</Text>
          <View style={styles.backBtn} />
        </View>

        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]}
          showsVerticalScrollIndicator={false}
        >
          {/* hero 状态卡 + chips */}
          <HeroCard state={state} />
          <View style={styles.chipsRow}>
            <Chip
              label={versions.length ? t('dataBackup.chipLocalOk') : t('dataBackup.chipLocalNone')}
              tone={versions.length ? 'ok' : 'idle'}
              icon={versions.length ? 'checkmark-circle' : 'remove-circle'}
            />
            {state.cloudEnabled ? (
              state.lastCloudError ? (
                <Chip label={t('dataBackup.chipCloudFail')} tone="warn" icon="cloud-offline" />
              ) : (
                <Chip label={t('dataBackup.chipCloudOk')} tone="ok" icon="cloud-done" />
              )
            ) : (
              <Chip label={t('dataBackup.chipCloudOff')} tone="idle" icon="cloud-outline" />
            )}
            {!!state.savedToFileAt && (
              <Chip label={t('dataBackup.chipSaved')} tone="ok" icon="folder-open" />
            )}
          </View>

          {/* 条件横幅 */}
          {banner && (
            <Banner
              tone={banner.tone}
              title={banner.title}
              body={banner.body}
              action={banner.action}
            />
          )}

          {/* 主按钮 */}
          {running ? (
            <View style={[styles.mainBtn, { backgroundColor: colors.primary }]}>
              <View style={styles.progressTrack}>
                <Animated.View
                  style={[styles.progressFill, {
                    transform: [{
                      translateX: progressAnim.interpolate({ inputRange: [0, 1], outputRange: [-60, 220] }),
                    }],
                  }]}
                />
              </View>
              <Text style={styles.mainBtnText}>{t('dataBackup.btnBacking')}</Text>
            </View>
          ) : (
            <TouchableOpacity
              style={[styles.mainBtn, { backgroundColor: colors.primary }, shadow.primary]}
              onPress={() => handleManualBackup()}
              activeOpacity={0.85}
            >
              <Ionicons name="cloud-upload-outline" size={18} color="#FFFFFF" style={{ marginRight: 7 }} />
              <Text style={styles.mainBtnText}>{mainLabel}</Text>
            </TouchableOpacity>
          )}

          {/* 我的数据 */}
          <Text style={styles.sectionHeader}>{t('dataBackup.myData')}</Text>
          <View style={styles.tilesRow}>
            {[
              { label: t('dataBackup.tileRecords'), value: counts.records },
              { label: t('dataBackup.tileFocus'), value: counts.focus },
              { label: t('dataBackup.tileTrips'), value: counts.trips },
            ].map((it) => (
              <View key={it.label} style={[styles.tile, { backgroundColor: colors.surface, borderColor: colors.line }]}>
                <Text style={[styles.tileValue, { color: colors.ink }]}>{it.value}</Text>
                <Text style={[styles.tileLabel, { color: colors.ink2 }]}>{it.label}</Text>
              </View>
            ))}
          </View>

          {/* 备份记录 */}
          <View style={styles.versionsHeader}>
            <Text style={styles.sectionHeader}>{t('dataBackup.versionsTitle')}</Text>
            <Text style={styles.versionsHint}>{t('dataBackup.versionsHint')}</Text>
          </View>
          <VersionList
            versions={versions}
            onPress={setDetailVer}
            starName={starName}
            overManualSafe={prune.overManualSafe}
          />

          {/* 保存与导入 */}
          <Text style={styles.sectionHeader}>{t('dataBackup.saveImportTitle')}</Text>
          <View style={[styles.group, { backgroundColor: colors.surface, borderColor: colors.line }]}>
            <GroupRow
              icon="share-social-outline"
              label={t('dataBackup.saveFile')}
              note={t('dataBackup.saveFileNote')}
              onPress={() => (versions.length ? setSaveVer(versions[0]) : show(t('dataBackup.versionsEmptyTitle')))}
              last={false}
            />
            <GroupRow
              icon="download-outline"
              label={t('dataBackup.importFile')}
              onPress={() => { setImportPicked(null); setImportInvalid(false); setShowImport(true); }}
              last={false}
            />
            <GroupRow
              icon="grid-outline"
              label={t('dataBackup.exportCsv')}
              note={exporting ? t('dataBackup.exporting') : t('dataBackup.exportCsvNote')}
              onPress={handleExportCsv}
              last
            />
          </View>

          {/* 设置 */}
          <Text style={styles.sectionHeader}>{t('dataBackup.settingsTitle')}</Text>
          <View style={[styles.group, { backgroundColor: colors.surface, borderColor: colors.line }]}>
            <View style={styles.switchRow}>
              <View style={[styles.iconHolder, { backgroundColor: colors.icoBg }]}>
                <Ionicons name="sync-outline" size={17} color={colors.ico} />
              </View>
              <View style={styles.rowTextWrap}>
                <Text style={styles.rowLabel}>{t('dataBackup.autoSwitch')}</Text>
                <Text style={styles.rowSub}>{t('dataBackup.autoSwitchSub')}</Text>
              </View>
              <Switch
                value={state.autoEnabled}
                onValueChange={handleToggleAuto}
                trackColor={{ true: colors.primary, false: colors.line2 }}
                thumbColor="#FFFFFF"
              />
            </View>
            <View style={[styles.divider, { backgroundColor: colors.line }]} />
            <GroupRow
              icon="cloud-outline"
              label={t('dataBackup.cloudEntry')}
              note={state.cloudEnabled ? t('dataBackup.cloudOn') : t('dataBackup.cloudOff')}
              onPress={() => setShowCloud(true)}
              last
            />
          </View>

          {/* 危险操作 */}
          <Text style={[styles.sectionHeader, { color: colors.err }]}>{t('dataBackup.dangerTitle')}</Text>
          <View style={[styles.group, { backgroundColor: colors.surface, borderColor: colors.line }]}>
            <GroupRow
              icon="trash-outline"
              danger
              label={t('dataBackup.clearAll')}
              note={t('dataBackup.clearAllSub')}
              onPress={() => setShowClear(true)}
              last
            />
          </View>
        </ScrollView>

        {/* 弹层 */}
        <VersionDetailSheet
          version={detailVer}
          starName={starName}
          visible={!!detailVer}
          onClose={() => setDetailVer(null)}
          onRestore={(pkg, version) => { setDetailVer(null); setRestoreSrc({ pkg, fromFile: false }); }}
          onSave={(v) => { setDetailVer(null); setSaveVer(v); }}
          onDeleted={() => { setDetailVer(null); show(t('dataBackup.toastDeleted')); refresh().catch(() => {}); }}
        />
        <RestoreSheet
          visible={!!restoreSrc}
          source={restoreSrc}
          onClose={() => setRestoreSrc(null)}
          onUndoToast={() => show(t('restore.undoToast'))}
          onFinished={() => refresh().catch(() => {})}
        />
        <SaveFileSheet
          visible={!!saveVer}
          version={saveVer}
          onClose={() => setSaveVer(null)}
          onPickDest={handleSaveDest}
        />
        <ImportSheet
          visible={showImport}
          picked={importPicked}
          invalid={importInvalid}
          onClose={() => setShowImport(false)}
          onPickFile={handlePickFile}
          onProceed={(picked) => { setShowImport(false); setRestoreSrc({ pkg: picked.pkg, fromFile: true }); }}
        />
        <ClearConfirmModal
          visible={showClear}
          totalCount={counts.records + counts.focus + counts.trips}
          busy={clearBusy}
          onClose={() => setShowClear(false)}
          onConfirm={handleClearConfirm}
        />
        <CloudCopyScreen
          visible={showCloud}
          onClose={() => setShowCloud(false)}
          onChanged={(ev) => {
            refresh().catch(() => {});
            if (ev === 'enabled') show(t('cloud.toastOn'));
            else if (ev === 'disabled') show(t('cloud.toastOff'));
          }}
        />
        {toastNode}
      </View>
    </Modal>
  );

  // ---------- 页内子组件（共享闭包里的 colors/styles/t） ----------

  function Chip({ label, tone, icon }) {
    const c = toneColors(colors, tone);
    return (
      <View style={[styles.chip, { backgroundColor: c.bg }]}>
        <Ionicons name={icon} size={13} color={c.fg} />
        <Text style={[styles.chipText, { color: c.fg }]}>{label}</Text>
      </View>
    );
  }

  function Banner({ tone, title, body, action }) {
    const c = toneColors(colors, tone);
    return (
      <View style={[styles.banner, { backgroundColor: c.bg }]}>
        <View style={styles.bannerHead}>
          <Ionicons name={tone === 'err' ? 'alert-circle' : 'information-circle'} size={16} color={c.fg} />
          <Text style={[styles.bannerTitle, { color: c.fg }]}>{title}</Text>
        </View>
        <Text style={[styles.bannerBody, { color: c.fg }]}>{body}</Text>
        {action && (
          <TouchableOpacity
            style={[styles.bannerBtn, { backgroundColor: tone === 'err' ? colors.err : colors.ink }]}
            onPress={action.fn}
            activeOpacity={0.8}
          >
            <Text style={styles.bannerBtnText}>{action.label}</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  function GroupRow({ icon, label, note, onPress, danger, last }) {
    return (
      <View>
        <TouchableOpacity style={styles.groupRow} onPress={onPress} activeOpacity={0.6}>
          <View style={[styles.iconHolder, { backgroundColor: danger ? colors.errBg : colors.icoBg }]}>
            <Ionicons name={icon} size={17} color={danger ? colors.err : colors.ico} />
          </View>
          <View style={styles.rowTextWrap}>
            <Text style={[styles.rowLabel, danger && { color: colors.err }]}>{label}</Text>
            {!!note && <Text style={styles.rowSub}>{note}</Text>}
          </View>
          <Ionicons name="chevron-forward" size={17} color={colors.ink3} />
        </TouchableOpacity>
        {!last && <View style={[styles.divider, { backgroundColor: colors.line }]} />}
      </View>
    );
  }
}

const makeStyles = (colors) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  nav: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingBottom: 8 },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  navTitle: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '800', color: colors.ink },
  content: { paddingHorizontal: 16, paddingTop: 4 },

  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5 },
  chipText: { fontSize: 11.5, fontWeight: '600' },

  banner: { borderRadius: 14, padding: 14, marginBottom: 12 },
  bannerHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  bannerTitle: { fontSize: 13.5, fontWeight: '800' },
  bannerBody: { fontSize: 12, lineHeight: 17.5, marginTop: 5, opacity: 0.9 },
  bannerBtn: { alignSelf: 'flex-start', borderRadius: 11, paddingHorizontal: 14, paddingVertical: 8, marginTop: 10 },
  bannerBtnText: { color: '#FFFFFF', fontSize: 12.5, fontWeight: '700' },

  mainBtn: { height: 52, borderRadius: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 18, overflow: 'hidden' },
  mainBtnText: { color: '#FFFFFF', fontSize: 15.5, fontWeight: '800' },
  progressTrack: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, opacity: 0.25 },
  progressFill: { width: 90, height: '100%', backgroundColor: '#FFFFFF', borderRadius: 26 },

  sectionHeader: { fontSize: 12.5, color: colors.ink2, fontWeight: '700', marginTop: 6, marginBottom: 8, marginLeft: 4 },
  tilesRow: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  tile: { flex: 1, borderRadius: 16, borderWidth: 1, paddingVertical: 14, alignItems: 'center' },
  tileValue: { fontSize: 20, fontWeight: '800' },
  tileLabel: { fontSize: 11.5, marginTop: 2, fontWeight: '500' },

  versionsHeader: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  versionsHint: { fontSize: 11, color: colors.ink3, marginBottom: 8, marginRight: 4 },

  group: { borderRadius: radius.lg, borderWidth: 1, paddingHorizontal: 14, marginBottom: 14, overflow: 'hidden' },
  groupRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  iconHolder: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  rowTextWrap: { flex: 1, minWidth: 0 },
  rowLabel: { fontSize: 14, fontWeight: '600', color: colors.ink },
  rowSub: { fontSize: 11.5, color: colors.ink3, marginTop: 2, lineHeight: 16 },
  divider: { height: 1, marginLeft: 46 },
});
