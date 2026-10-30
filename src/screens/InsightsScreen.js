import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Alert,
  TextInput,
  BackHandler,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  getRecords,
  getFocusSessions,
  getRecordsFingerprint,
  updateRecord,
  updateFocusSession,
  deleteFocusSession,
} from '../storage/store';
import { computePathStats, isPlaceholderName } from '../utils/stats';
import { useTheme } from '../theme/ThemeContext';
import { useI18n } from '../i18n/LanguageContext';
import { radius } from '../theme';

import FocusInsights from '../components/insights/FocusInsights';
import TravelInsights from '../components/insights/TravelInsights';
import TravelHistoryModal from '../components/insights/TravelHistoryModal';
import FocusHistoryModal from '../components/FocusHistoryModal';
import RouteMapScreen from './RouteMapScreen';
import TripReceiptModal from '../components/TripReceiptModal';
import TripDetailView from '../components/TripDetailView';

const STORAGE_KEY_TAB = 'timeflow_insights_tab';
const STORAGE_KEY_RANGE = 'timeflow_insights_range';

const PLACE_PRESETS = ['presetHome', 'presetWork', 'presetGym', 'presetSchool', 'presetMall', 'presetStation'];
const FOCUS_PRESETS_KEYS = [
  'pomodoro.helpWork',
  'pomodoro.helpStudy',
  'pomodoro.helpCreate',
  'pomodoro.helpBodyMind',
  'pomodoro.helpLife',
  'pomodoro.helpPlan',
];

export default function InsightsScreen() {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const { t, lang } = useI18n();
  const styles = useMemo(() => makeStyles(colors, isDark), [colors, isDark]);

  const [tab, setTab] = useState('focus'); // 'focus' | 'travel'
  const [range, setRange] = useState('week'); // 'today' | 'week' | 'month' | 'all'
  const [records, setRecords] = useState([]);
  const [focusSessions, setFocusSessions] = useState([]);
  const [paths, setPaths] = useState([]);

  // 弹窗状态
  const [showTravelHistory, setShowTravelHistory] = useState(false);
  const [showFocusHistory, setShowFocusHistory] = useState(false);
  const [detailTrip, setDetailTrip] = useState(null);
  const [mapTrip, setMapTrip] = useState(null);
  const [receiptTrip, setReceiptTrip] = useState(null);

  // 重命名弹窗
  const [namingRecord, setNamingRecord] = useState(null);
  const [placeDraftName, setPlaceDraftName] = useState('');
  const [renameFocusTarget, setRenameFocusTarget] = useState(null);
  const [focusDraftName, setFocusDraftName] = useState('');

  const lastFingerprintRef = useRef(null);

  // 读取持久化的 Tab 和 Range
  useEffect(() => {
    (async () => {
      try {
        const [savedTab, savedRange] = await Promise.all([
          AsyncStorage.getItem(STORAGE_KEY_TAB),
          AsyncStorage.getItem(STORAGE_KEY_RANGE),
        ]);
        if (savedTab === 'focus' || savedTab === 'travel') {
          setTab(savedTab);
        }
        if (['today', 'week', 'month', 'all'].includes(savedRange)) {
          setRange(savedRange);
        }
      } catch {}
    })();
  }, []);

  const handleSwitchTab = useCallback((newTab) => {
    setTab(newTab);
    AsyncStorage.setItem(STORAGE_KEY_TAB, newTab).catch(() => {});
  }, []);

  const handleSwitchRange = useCallback((newRange) => {
    setRange(newRange);
    AsyncStorage.setItem(STORAGE_KEY_RANGE, newRange).catch(() => {});
  }, []);

  // 硬件返回键处理
  useEffect(() => {
    if (!detailTrip) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      setDetailTrip(null);
      return true;
    });
    return () => sub.remove();
  }, [detailTrip]);

  const loadData = useCallback(async () => {
    const fp = await getRecordsFingerprint();
    if (lastFingerprintRef.current === fp) return;
    lastFingerprintRef.current = fp;

    const [travel, focus] = await Promise.all([getRecords(), getFocusSessions()]);
    setRecords(travel);
    setFocusSessions(focus);
    setPaths(computePathStats(travel));
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  // 地点命名
  const handleStartRenamePlace = useCallback((rec) => {
    if (!rec) return;
    setNamingRecord(rec);
    setPlaceDraftName(isPlaceholderName(rec.locationName) ? '' : (rec.locationName || ''));
  }, []);

  const confirmRenamePlace = useCallback(async () => {
    if (!namingRecord) return;
    const name = placeDraftName.trim();
    if (!name) {
      Alert.alert(t('common.tip'), t('home.renameEmpty'));
      return;
    }
    await updateRecord(namingRecord.id, { locationName: name });
    setNamingRecord(null);
    setPlaceDraftName('');
    lastFingerprintRef.current = null;
    await loadData();
  }, [namingRecord, placeDraftName, t, loadData]);

  // 专注任务重命名
  const handleStartRenameFocus = useCallback((taskName) => {
    if (!taskName) return;
    setRenameFocusTarget(taskName);
    setFocusDraftName(taskName === t('home.unnamedFocus') ? '' : taskName);
  }, [t]);

  const confirmRenameFocus = useCallback(async () => {
    if (!renameFocusTarget) return;
    const name = focusDraftName.trim();
    if (!name) {
      Alert.alert(t('common.tip'), t('home.renameEmpty'));
      return;
    }
    const matched = (focusSessions || []).filter(
      (s) => (s.taskName || t('home.unnamedFocus')) === renameFocusTarget
    );
    for (const session of matched) {
      await updateFocusSession(session.id, { taskName: name });
    }
    setRenameFocusTarget(null);
    setFocusDraftName('');
    lastFingerprintRef.current = null;
    await loadData();
  }, [renameFocusTarget, focusDraftName, focusSessions, t, loadData]);

  const rangeOptions = [
    { key: 'today', label: t('insights.rangeToday') },
    { key: 'week', label: t('insights.rangeWeek') },
    { key: 'month', label: t('insights.rangeMonth') },
    { key: 'all', label: t('insights.rangeAll') },
  ];

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {/* 顶部主导航栏 */}
      <View style={styles.topBar}>
        {/* 专注 / 行程 分段控制器 */}
        <View style={styles.segmentedControl}>
          <TouchableOpacity
            style={[styles.segmentBtn, tab === 'focus' && styles.segmentBtnActive]}
            onPress={() => handleSwitchTab('focus')}
            activeOpacity={0.8}
          >
            <Text style={[styles.segmentText, tab === 'focus' && styles.segmentTextActive]}>
              {t('insights.segFocus')}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.segmentBtn, tab === 'travel' && styles.segmentBtnActive]}
            onPress={() => handleSwitchTab('travel')}
            activeOpacity={0.8}
          >
            <Text style={[styles.segmentText, tab === 'travel' && styles.segmentTextActive]}>
              {t('insights.segTravel')}
            </Text>
          </TouchableOpacity>
        </View>

        {/* 右侧独立历史入口 */}
        <TouchableOpacity
          style={styles.historyBtn}
          onPress={() => {
            if (tab === 'focus') setShowFocusHistory(true);
            else setShowTravelHistory(true);
          }}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="time-outline" size={20} color={colors.ink} />
          <Text style={styles.historyBtnText}>{t('insights.history')}</Text>
        </TouchableOpacity>
      </View>

      {/* 统一时间范围胶囊筛选器 */}
      <View style={styles.rangeRow}>
        {rangeOptions.map((opt) => {
          const isActive = range === opt.key;
          return (
            <TouchableOpacity
              key={opt.key}
              style={[styles.rangeChip, isActive && styles.rangeChipActive]}
              onPress={() => handleSwitchRange(opt.key)}
              activeOpacity={0.7}
            >
              <Text style={[styles.rangeChipText, isActive && styles.rangeChipTextActive]}>
                {opt.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* 统计主内容滚动区 */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
      >
        {tab === 'focus' ? (
          <FocusInsights
            focusSessions={focusSessions}
            range={range}
            onRenameTask={handleStartRenameFocus}
            onOpenHistory={() => setShowFocusHistory(true)}
          />
        ) : (
          <TravelInsights
            travelRecords={records}
            paths={paths}
            range={range}
            onOpenAllHistory={() => setShowTravelHistory(true)}
            onStartRenameRecord={handleStartRenamePlace}
            onSelectTripDetail={(trip) => setDetailTrip(trip)}
          />
        )}
      </ScrollView>

      {/* 全屏弹层：出行历史 */}
      <TravelHistoryModal
        visible={showTravelHistory}
        onClose={() => setShowTravelHistory(false)}
        records={records}
        discoveredRoutes={paths}
        onShowMap={(tr) => setMapTrip(tr)}
        onShowReceipt={(tr) => setReceiptTrip(tr)}
        onRenameStop={handleStartRenamePlace}
      />

      {/* 全屏弹层：专注历史 */}
      <FocusHistoryModal
        visible={showFocusHistory}
        onClose={() => setShowFocusHistory(false)}
        focusSessions={focusSessions}
        onUpdateFocusSession={async (id, patch) => {
          await updateFocusSession(id, patch);
          lastFingerprintRef.current = null;
          await loadData();
        }}
        onDeleteFocusSession={async (id) => {
          await deleteFocusSession(id);
          lastFingerprintRef.current = null;
          await loadData();
        }}
      />

      {/* 单条行程详情弹层（从最近 3 条行程预览点击打开） */}
      {detailTrip && (
        <Modal visible={Boolean(detailTrip)} animationType="slide" onRequestClose={() => setDetailTrip(null)}>
          <View style={[styles.screen, { paddingTop: insets.top }]}>
            <TripDetailView
              trip={detailTrip}
              discoveredRoutes={paths}
              onClose={() => setDetailTrip(null)}
              onRenameStop={handleStartRenamePlace}
              onShowMap={(tr) => setMapTrip(tr)}
              onShowReceipt={(tr) => setReceiptTrip(tr)}
            />
          </View>
        </Modal>
      )}

      {/* 轨迹地图 Modal */}
      {mapTrip && (
        <Modal visible={Boolean(mapTrip)} animationType="slide" onRequestClose={() => setMapTrip(null)}>
          <RouteMapScreen route={{ params: { trip: mapTrip } }} navigation={{ goBack: () => setMapTrip(null) }} />
        </Modal>
      )}

      {/* 行程小票 Modal */}
      {receiptTrip && (
        <TripReceiptModal
          visible={Boolean(receiptTrip)}
          trip={receiptTrip}
          onClose={() => setReceiptTrip(null)}
        />
      )}

      {/* 地点命名 Modal */}
      <Modal visible={Boolean(namingRecord)} transparent animationType="fade" onRequestClose={() => setNamingRecord(null)}>
        <View style={styles.modalMask}>
          <View style={styles.dialogBox}>
            <Text style={styles.dialogTitle}>{t('insights.renamePlaceTitle')}</Text>
            <TextInput
              style={styles.dialogInput}
              value={placeDraftName}
              onChangeText={setPlaceDraftName}
              placeholder={t('insights.renamePlacePlaceholder')}
              placeholderTextColor={colors.ink3}
              autoFocus
            />
            <View style={styles.presetRow}>
              {PLACE_PRESETS.map((key) => {
                const label = t(`insights.${key}`);
                return (
                  <TouchableOpacity
                    key={key}
                    style={styles.presetChip}
                    onPress={() => setPlaceDraftName(label)}
                  >
                    <Text style={styles.presetText}>{label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <View style={styles.dialogActions}>
              <TouchableOpacity style={styles.dialogBtn} onPress={() => setNamingRecord(null)}>
                <Text style={styles.dialogBtnText}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.dialogBtn, styles.dialogBtnPrimary]} onPress={confirmRenamePlace}>
                <Text style={[styles.dialogBtnText, styles.dialogBtnPrimaryText]}>{t('common.save')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* 专注任务批量重命名 Modal */}
      <Modal visible={Boolean(renameFocusTarget)} transparent animationType="fade" onRequestClose={() => setRenameFocusTarget(null)}>
        <View style={styles.modalMask}>
          <View style={styles.dialogBox}>
            <Text style={styles.dialogTitle}>{t('home.renameFocusTitle')}</Text>
            <Text style={styles.dialogSubTitle}>{t('insights.renameBatchDesc')}</Text>
            <TextInput
              style={styles.dialogInput}
              value={focusDraftName}
              onChangeText={setFocusDraftName}
              placeholder={t('home.renameFocusPlaceholder')}
              placeholderTextColor={colors.ink3}
              autoFocus
            />
            <View style={styles.presetRow}>
              {FOCUS_PRESETS_KEYS.map((k) => {
                const label = t(k);
                return (
                  <TouchableOpacity
                    key={k}
                    style={styles.presetChip}
                    onPress={() => setFocusDraftName(label)}
                  >
                    <Text style={styles.presetText}>{label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <View style={styles.dialogActions}>
              <TouchableOpacity style={styles.dialogBtn} onPress={() => setRenameFocusTarget(null)}>
                <Text style={styles.dialogBtnText}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.dialogBtn, styles.dialogBtnPrimary]} onPress={confirmRenameFocus}>
                <Text style={[styles.dialogBtnText, styles.dialogBtnPrimaryText]}>{t('common.save')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const makeStyles = (colors, isDark) =>
  StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: colors.canvas,
    },
    topBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 10,
    },
    segmentedControl: {
      flexDirection: 'row',
      backgroundColor: colors.card,
      borderRadius: radius.full,
      padding: 3,
      borderWidth: 1,
      borderColor: colors.border,
    },
    segmentBtn: {
      paddingHorizontal: 16,
      paddingVertical: 6,
      borderRadius: radius.full,
    },
    segmentBtnActive: {
      backgroundColor: colors.primary,
    },
    segmentText: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.ink2,
    },
    segmentTextActive: {
      color: colors.card,
      fontWeight: '700',
    },
    historyBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: radius.md,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
    },
    historyBtnText: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.ink,
    },
    rangeRow: {
      flexDirection: 'row',
      paddingHorizontal: 16,
      paddingBottom: 10,
      gap: 8,
    },
    rangeChip: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 6,
      borderRadius: radius.full,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
    },
    rangeChipActive: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    rangeChipText: {
      fontSize: 12,
      fontWeight: '500',
      color: colors.ink2,
    },
    rangeChipTextActive: {
      color: colors.card,
      fontWeight: '700',
    },
    scroll: {
      flex: 1,
    },
    scrollContent: {
      paddingHorizontal: 16,
      gap: 12,
    },
    modalMask: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.5)',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
    },
    dialogBox: {
      width: '100%',
      backgroundColor: colors.card,
      borderRadius: radius.lg,
      padding: 20,
      gap: 14,
      borderWidth: 1,
      borderColor: colors.border,
    },
    dialogTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: colors.ink,
    },
    dialogSubTitle: {
      fontSize: 12,
      color: colors.ink3,
      marginTop: -8,
    },
    dialogInput: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 14,
      color: colors.ink,
      backgroundColor: colors.canvas,
    },
    presetRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
    },
    presetChip: {
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: radius.sm,
      backgroundColor: colors.canvas,
      borderWidth: 1,
      borderColor: colors.border,
    },
    presetText: {
      fontSize: 12,
      color: colors.ink2,
    },
    dialogActions: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      gap: 10,
      marginTop: 4,
    },
    dialogBtn: {
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderRadius: radius.md,
    },
    dialogBtnPrimary: {
      backgroundColor: colors.primary,
    },
    dialogBtnText: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.ink2,
    },
    dialogBtnPrimaryText: {
      color: colors.card,
    },
  });
