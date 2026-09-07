import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View, Text, ScrollView, StyleSheet, Alert, Modal, TextInput, TouchableOpacity, Linking, ActivityIndicator, Vibration, AppState, Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  saveRecord, getRecords, getTodayRecords, getRecordById, updateRecord, deleteRecord, ensureTrip, endTrip,
  getCurrentTripId, getLastMode, setLastMode, getRecordsFingerprint,
} from '../storage/store';
import { computePathStats, placeKey, UNNAMED, isPlaceholderName } from '../utils/stats';
import { getPlaceOptions } from '../utils/analytics';
import { shadow } from '../theme';
import { useTheme } from '../theme/ThemeContext';
import { useI18n } from '../i18n/LanguageContext';
import { getPositionFast, reverseGeocodeWithTimeout } from '../utils/location';
import { refreshWidget } from '../utils/widgetRefresh';
import { runBackupIfDue } from '../backup/schedule';
import Timeline from '../components/Timeline';
import CheckInButton from '../components/CheckInButton';
import TransportPicker, { MODE_KEYS } from '../components/TransportPicker';
import ModeIcon from '../components/ModeIcon';
import RouteMapScreen from './RouteMapScreen';
const makeId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

const BACKFILL_OFFSETS = [
  { min: 0, labelKey: 'home.justNow' },
  { min: 5, labelKey: 'home.m5Ago' },
  { min: 15, labelKey: 'home.m15Ago' },
  { min: 30, labelKey: 'home.m30Ago' },
  { min: 60, labelKey: 'home.h1Ago' },
];

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { t, formatDate } = useI18n();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [mode, setMode] = useState('walk');
  const [estimate, setEstimate] = useState(null);
  const [hasActiveTrip, setHasActiveTrip] = useState(false);
  const [locStatus, setLocStatus] = useState(null); // null | 'pending' | 'denied' | 'services' | 'failed'
  const [activeLocStatus, setActiveLocStatus] = useState(null); // 用于胶囊渐退动画缓冲
  const locAnim = useRef(new Animated.Value(0)).current;
  const locTargetRef = useRef(null);
  const fillSeqRef = useRef(0); // 补位序号：状态条只反映最新一次补位
  const checkingInRef = useRef(false); // 同步原子锁：防毫秒级极速快速双击造成重复打卡
  const pathStatsCacheRef = useRef({ fp: null, stats: [] }); // 预估耗时计算缓存

  const [commonPlaces, setCommonPlaces] = useState([]);
  const [renameTarget, setRenameTarget] = useState(null);
  const [draftName, setDraftName] = useState('');
  const [draftMode, setDraftMode] = useState('walk');

  // 补卡相关状态
  const [backfillVisible, setBackfillVisible] = useState(false);
  const [backfillOffset, setBackfillOffset] = useState(15);
  const [backfillName, setBackfillName] = useState('');
  const [backfillMode, setBackfillMode] = useState('walk');

  const [mapTrip, setMapTrip] = useState(null); // 当前查看地图的行程

  const loadToday = useCallback(async () => {
    const today = await getTodayRecords();
    const sorted = today.sort((a, b) => a.timestamp - b.timestamp);
    setRecords(sorted);
    const trip = await getCurrentTripId();
    setHasActiveTrip(!!trip);

    // 弱网与补卡快选：提取历史常用地点（过滤占位符，前5个最高频）
    try {
      const all = await getRecords();
      const options = getPlaceOptions(all);
      const topPlaces = options
        .map(o => o.name)
        .filter(nm => nm && !isPlaceholderName(nm) && nm !== UNNAMED)
        .slice(0, 5);
      setCommonPlaces(topPlaces);
    } catch (e) { /* 容错忽略 */ }
    return sorted;
  }, []);

  // 初始化：记住上次出行方式
  useEffect(() => {
    (async () => setMode(await getLastMode()))();
  }, []);

  useFocusEffect(useCallback(() => { loadToday(); }, [loadToday]));

  // 前台唤醒：若10分钟内最新一次打卡仍处于无坐标状态（如地库打卡后走出室外），自动尝试静默补位一次
  useEffect(() => {
    const sub = AppState.addEventListener('change', async (nextState) => {
      if (nextState === 'active') {
        const today = await loadToday();
        if (today && today.length) {
          const latest = today[today.length - 1];
          const age = Date.now() - latest.timestamp;
          if ((latest.lat == null || latest.lng == null) && age < 10 * 60 * 1000) {
            fillLocation(latest.id);
          }
        }
      }
    });
    return () => sub.remove();
  }, [loadToday]);

  // 定位状态胶囊显隐动效（零布局推挤）
  useEffect(() => {
    if (locStatus) {
      setActiveLocStatus(locStatus);
      Animated.spring(locAnim, {
        toValue: 1,
        friction: 7,
        tension: 110,
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(locAnim, {
        toValue: 0,
        duration: 220,
        useNativeDriver: true,
      }).start(() => {
        setActiveLocStatus(null);
      });
    }
  }, [locStatus, locAnim]);

  // 计算预估：从最后一个点出发的最常见路段（带指纹缓存，避免每次打卡全量重算）
  useEffect(() => {
    if (records.length < 1) { setEstimate(null); return; }
    (async () => {
      const fp = await getRecordsFingerprint();
      let stats = pathStatsCacheRef.current.stats;
      if (pathStatsCacheRef.current.fp !== fp || !stats.length) {
        const all = await getRecords();
        stats = computePathStats(all);
        pathStatsCacheRef.current = { fp, stats };
      }
      if (!stats.length) { setEstimate(null); return; }
      const last = records[records.length - 1];
      const key = placeKey(last);
      const match = stats.find(s => s.fromKey === key);
      if (match) {
        setEstimate({ locationName: match.toName, estimatedSec: match.medianSec });
      } else {
        setEstimate(null);
      }
    })();
  }, [records]);

  // 一键打卡：轻按记录途经点，长按结程（打卡同时结束本次行程）
  const handleCheckIn = async (isEndTrip = false) => {
    if (checkingInRef.current) return;
    checkingInRef.current = true;
    setLoading(true);
    const tnow = Date.now();
    try {
      const tripId = await ensureTrip();
      const id = makeId();
      await saveRecord({ id, timestamp: tnow, locationName: UNNAMED, lat: null, lng: null, mode, tripId });
      await setLastMode(mode);

      if (isEndTrip) {
        await endTrip(); // 立即封存关闭当前行程，下次打卡自动开启新行程
      }

      setLoading(false);
      setSuccess(isEndTrip ? 'ended' : true);
      if (isEndTrip) {
        Vibration.vibrate(40); // 确定性触觉反馈：结程
      } else {
        Vibration.vibrate(15); // 轻触感：普通打卡
      }

      await loadToday();
      refreshWidget(); // 桌面 widget 即时同步最新次数/时间
      runBackupIfDue().catch(() => {}); // 打卡触发自动备份（fire-and-forget）
      setTimeout(() => setSuccess(false), isEndTrip ? 1500 : 1200);

      fillLocation(id); // 后台定位 + 反查，不阻塞打卡
    } catch (e) {
      setLoading(false);
      Vibration.vibrate([0, 40, 30, 40]); // 双震：保存失败
      Alert.alert(t('home.failTitle'), t('home.failBody'));
    } finally {
      setTimeout(() => { checkingInRef.current = false; }, 1000); // 1秒冷却锁
    }
  };

  // 后台补坐标 + 地名：状态条呈现 补位中/被拒/服务关闭/超时，成功则静默消失
  const fillLocation = async (id) => {
    const seq = ++fillSeqRef.current;
    locTargetRef.current = id;
    setLocStatus('pending');
    const isStale = () => seq !== fillSeqRef.current;
    const log = (...a) => { if (__DEV__) console.log(`[fillLocation:${seq}]`, ...a); };
    try {
      log('step1 权限只读查询');
      let { status } = await Location.getForegroundPermissionsAsync();
      if (status !== 'granted') {
        log('step1b 未授权，发起请求');
        ({ status } = await Location.requestForegroundPermissionsAsync());
      }
      log('step1c 权限结果 =', status);
      if (status !== 'granted') { if (!isStale()) setLocStatus('denied'); return; }

      log('step2 并行定位中');
      const { loc, reason, provider } = await getPositionFast();
      log('step2b 定位结果:', { reason, provider, coords: loc && loc.coords });
      if (!loc) {
        if (!isStale()) setLocStatus(reason === 'services-off' ? 'services' : 'failed');
        return;
      }
      const lat = loc.coords.latitude, lng = loc.coords.longitude;

      let addr = loc.address;
      if (!addr) {
        log('step3 反查地名（SDK 无地址）');
        addr = await reverseGeocodeWithTimeout(lat, lng);
      }
      log('step3b 地名 =', addr);

      const current = await getRecordById(id);
      if (!current) {
        log('step4 记录已被删除，跳过写库');
        if (!isStale()) setLocStatus(null);
        return;
      }

      const patch = { lat, lng };
      if (addr && isPlaceholderName(current.locationName)) {
        patch.locationName = addr;
      }
      await updateRecord(id, patch);
      log('step4 写库完成');
      await loadToday();
      refreshWidget();
      log('step5 完成，清状态条');
      if (!isStale()) setLocStatus(null);
    } catch (e) {
      log('ERROR', e && e.message);
      if (!isStale()) setLocStatus('failed');
    }
  };

  // 定位状态条点击
  const handleLocBarPress = async () => {
    if (locStatus === 'denied') {
      const { status } = await Location.getForegroundPermissionsAsync();
      if (status === 'granted') { const id = locTargetRef.current; if (id) fillLocation(id); }
      else Linking.openSettings();
    } else if (locStatus === 'services') {
      Linking.openSettings();
    } else if (locStatus === 'failed') {
      let servicesOn = true;
      try { servicesOn = await Location.hasServicesEnabledAsync(); } catch (e) { /* 忽略 */ }
      if (!servicesOn) Linking.openSettings();
      else { const id = locTargetRef.current; if (id) fillLocation(id); }
    }
  };

  // ---- 地名与交通方式编辑 ----
  const openRename = (record) => {
    setRenameTarget(record);
    setDraftName(record.locationName && record.locationName !== UNNAMED ? record.locationName : '');
    setDraftMode(record.mode || 'walk');
  };
  const closeRename = () => {
    setRenameTarget(null);
    setDraftName('');
    setDraftMode('walk');
  };
  const confirmRename = async () => {
    if (!renameTarget) return;
    const name = draftName.trim();
    if (!name) { Alert.alert(t('home.renameEmpty')); return; }
    await updateRecord(renameTarget.id, { locationName: name, mode: draftMode });
    closeRename();
    await loadToday();
    refreshWidget();
  };

  // 补救结程：在编辑弹窗中直接将当前点标记为终点
  const handleModalEndTrip = async () => {
    await endTrip();
    closeRename();
    await loadToday();
    Alert.alert(t('trip.endedTitle'), t('trip.endedToast'));
  };

  // 误打卡：确认后删除这条记录
  const confirmDelete = () => {
    if (!renameTarget) return;
    Alert.alert(t('home.deleteTitle'), t('home.deleteBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.delete'), style: 'destructive', onPress: async () => {
        await deleteRecord(renameTarget.id);
        setLocStatus(null);
        closeRename();
        await loadToday();
        refreshWidget();
      } },
    ]);
  };

  // ---- 补记打卡（补卡） ----
  const openBackfill = () => {
    setBackfillOffset(15);
    setBackfillName('');
    setBackfillMode(mode || 'walk');
    setBackfillVisible(true);
  };
  const closeBackfill = () => {
    setBackfillVisible(false);
    setBackfillName('');
    setBackfillMode('walk');
  };
  const handleSaveBackfill = async () => {
    if (checkingInRef.current) return;
    const name = backfillName.trim();
    if (!name) {
      Alert.alert(t('home.backfillEmpty'));
      return;
    }
    checkingInRef.current = true;
    const tCheckin = Date.now() - backfillOffset * 60 * 1000;
    try {
      const tripId = await ensureTrip();
      const id = makeId();
      await saveRecord({
        id,
        timestamp: tCheckin,
        locationName: name,
        lat: null,
        lng: null,
        mode: backfillMode,
        tripId,
      });
      Vibration.vibrate(25);
      closeBackfill();
      await loadToday();
      refreshWidget();
      runBackupIfDue().catch(() => {});
    } catch (e) {
      Alert.alert(t('home.failTitle'), t('home.failBody'));
    } finally {
      setTimeout(() => { checkingInRef.current = false; }, 800);
    }
  };

  const dateStr = formatDate(new Date());

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <View style={styles.titleBlock}>
          <Text style={styles.title}>{t('home.today')}</Text>
          <Text style={styles.date}>{dateStr}</Text>
        </View>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{t('home.checkins', { n: records.length })}</Text>
        </View>
      </View>

      {/* 悬浮灵动定位胶囊（绝对定位，彻底消除页面抖动与布局推挤） */}
      {activeLocStatus && (
        <Animated.View
          style={[
            styles.floatingCapsule,
            { top: insets.top + 60 },
            {
              opacity: locAnim,
              transform: [
                {
                  translateY: locAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [-14, 0],
                  }),
                },
                {
                  scale: locAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.92, 1],
                  }),
                },
              ],
            },
          ]}
          pointerEvents={locStatus ? 'auto' : 'none'}
        >
          <TouchableOpacity
            style={styles.capsuleInner}
            onPress={handleLocBarPress}
            activeOpacity={locStatus === 'pending' ? 1 : 0.7}
            disabled={locStatus === 'pending'}
          >
            {activeLocStatus === 'pending' ? (
              <View style={styles.capsuleRow}>
                <ActivityIndicator size="small" color={colors.primary} style={{ transform: [{ scale: 0.78 }] }} />
                <Text style={styles.capsuleTextPending}>{t('home.locPending')}</Text>
              </View>
            ) : (
              <View style={styles.capsuleRow}>
                <Ionicons name="warning-outline" size={14} color={colors.danger} />
                <Text style={styles.capsuleTextDanger}>
                  {activeLocStatus === 'denied' ? t('home.locDenied')
                    : activeLocStatus === 'services' ? t('home.locServices')
                    : t('home.locFailed')}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        </Animated.View>
      )}

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Timeline
          records={records}
          estimate={estimate}
          onRename={openRename}
          onShowMap={setMapTrip}
          onBackfill={openBackfill}
          hasActiveTrip={hasActiveTrip}
        />
      </ScrollView>

      {/* 底部居中全宽操作区 */}
      <View style={styles.composer}>
        <TransportPicker selected={mode} onSelect={setMode} />
        <View style={styles.gap} />
        <View style={styles.checkinWrap}>
          <CheckInButton
            onPress={() => handleCheckIn(false)}
            onLongPress={() => handleCheckIn(true)}
            loading={loading}
            success={success}
          />
        </View>
      </View>

      {/* 地名与交通方式编辑弹窗 */}
      <Modal visible={!!renameTarget} transparent animationType="fade" onRequestClose={closeRename}>
        <View style={styles.overlay}>
          <View style={styles.dialog}>
            <Text style={styles.dialogTitle}>{t('home.renameTitle')}</Text>
            <Text style={styles.dialogSub}>{t('home.renameSub')}</Text>
            <TextInput
              style={styles.input}
              value={draftName}
              onChangeText={setDraftName}
              placeholder={t('home.renamePlaceholder')}
              placeholderTextColor={colors.ink3}
              autoFocus={false}
              returnKeyType="done"
              onSubmitEditing={confirmRename}
            />

            {/* 弱网/离线地点快选 */}
            {commonPlaces.length > 0 && (
              <View style={styles.quickPlaceWrap}>
                <View style={styles.chipRow}>
                  {commonPlaces.map((place, pIdx) => {
                    const isSelected = draftName === place;
                    return (
                      <TouchableOpacity
                        key={'rename-place-' + pIdx}
                        style={[styles.quickChip, isSelected && styles.quickChipActive]}
                        onPress={() => setDraftName(place)}
                        activeOpacity={0.7}
                      >
                        <Ionicons
                          name="location-outline"
                          size={12}
                          color={isSelected ? colors.primaryStrong : colors.ink2}
                        />
                        <Text style={[styles.quickChipText, isSelected && styles.quickChipTextActive]}>
                          {place}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            )}

            {/* 切换出行方式 */}
            <Text style={styles.dialogSectionLabel}>{t('home.editMode')}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dialogModeScroll}>
              {MODE_KEYS.map((k) => {
                const on = draftMode === k;
                return (
                  <TouchableOpacity
                    key={k}
                    style={[styles.dialogModeItem, on && styles.dialogModeItemSelected]}
                    onPress={() => setDraftMode(k)}
                    activeOpacity={0.7}
                  >
                    <ModeIcon mode={k} size={16} color={on ? colors.primaryStrong : colors.ink2} />
                    <Text style={[styles.dialogModeLabel, on && styles.dialogModeLabelSelected]}>{t(`mode.${k}`)}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <View style={styles.dialogRow}>
              <TouchableOpacity style={[styles.dialogBtn, styles.dialogCancel]} onPress={closeRename}>
                <Text style={styles.dialogCancelText}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.dialogBtn, styles.dialogOk]} onPress={confirmRename}>
                <Text style={styles.dialogOkText}>{t('common.save')}</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.dialogFooterRow}>
              {hasActiveTrip && records.length > 0 && renameTarget && renameTarget.id === records[records.length - 1].id ? (
                <TouchableOpacity style={styles.dialogEndTrip} onPress={handleModalEndTrip} activeOpacity={0.6}>
                  <Ionicons name="flag-outline" size={15} color={colors.primary} />
                  <Text style={styles.dialogEndTripText}>{t('trip.markAsEnd')}</Text>
                </TouchableOpacity>
              ) : (
                <View />
              )}
              <TouchableOpacity style={styles.dialogDelete} onPress={confirmDelete} activeOpacity={0.6}>
                <Ionicons name="trash-outline" size={15} color={colors.danger} />
                <Text style={styles.dialogDeleteText}>{t('home.deleteBtn')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* 补记打卡弹窗（离线/遗漏打卡补录） */}
      <Modal visible={backfillVisible} transparent animationType="fade" onRequestClose={closeBackfill}>
        <View style={styles.overlay}>
          <View style={styles.dialog}>
            <Text style={styles.dialogTitle}>{t('home.backfillTitle')}</Text>
            <Text style={styles.dialogSub}>{t('home.backfillSub')}</Text>

            {/* 1. 时间偏移选择器 */}
            <Text style={styles.dialogSectionLabel}>{t('home.backfillTime')}</Text>
            <View style={styles.timeOffsetRow}>
              {BACKFILL_OFFSETS.map((item) => {
                const on = backfillOffset === item.min;
                return (
                  <TouchableOpacity
                    key={item.min}
                    style={[styles.timeChip, on && styles.timeChipSelected]}
                    onPress={() => setBackfillOffset(item.min)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.timeChipText, on && styles.timeChipTextSelected]}>
                      {t(item.labelKey)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* 2. 地点输入与常用地点快选 */}
            <Text style={styles.dialogSectionLabel}>{t('home.backfillLocation')}</Text>
            <TextInput
              style={styles.input}
              value={backfillName}
              onChangeText={setBackfillName}
              placeholder={t('home.renamePlaceholder')}
              placeholderTextColor={colors.ink3}
              returnKeyType="done"
            />
            {commonPlaces.length > 0 && (
              <View style={styles.quickPlaceWrap}>
                <View style={styles.chipRow}>
                  {commonPlaces.map((place, pIdx) => {
                    const isSelected = backfillName === place;
                    return (
                      <TouchableOpacity
                        key={'backfill-place-' + pIdx}
                        style={[styles.quickChip, isSelected && styles.quickChipActive]}
                        onPress={() => setBackfillName(place)}
                        activeOpacity={0.7}
                      >
                        <Ionicons
                          name="location-outline"
                          size={12}
                          color={isSelected ? colors.primaryStrong : colors.ink2}
                        />
                        <Text style={[styles.quickChipText, isSelected && styles.quickChipTextActive]}>
                          {place}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            )}

            {/* 3. 切换出行方式 */}
            <Text style={styles.dialogSectionLabel}>{t('home.editMode')}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dialogModeScroll}>
              {MODE_KEYS.map((k) => {
                const on = backfillMode === k;
                return (
                  <TouchableOpacity
                    key={k}
                    style={[styles.dialogModeItem, on && styles.dialogModeItemSelected]}
                    onPress={() => setBackfillMode(k)}
                    activeOpacity={0.7}
                  >
                    <ModeIcon mode={k} size={16} color={on ? colors.primaryStrong : colors.ink2} />
                    <Text style={[styles.dialogModeLabel, on && styles.dialogModeLabelSelected]}>{t(`mode.${k}`)}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <View style={styles.dialogRow}>
              <TouchableOpacity style={[styles.dialogBtn, styles.dialogCancel]} onPress={closeBackfill}>
                <Text style={styles.dialogCancelText}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.dialogBtn, styles.dialogOk]} onPress={handleSaveBackfill}>
                <Text style={styles.dialogOkText}>{t('common.save')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* 线路轨迹地图（全屏） */}
      <RouteMapScreen visible={mapTrip != null} tripRecords={mapTrip?.records || []} onClose={() => setMapTrip(null)} />
    </View>
  );
}

const makeStyles = (colors) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingBottom: 10,
  },
  titleBlock: { flex: 1 },
  title: { fontSize: 28, fontWeight: '800', color: colors.ink, letterSpacing: -0.6, lineHeight: 32 },
  date: { fontSize: 13, color: colors.ink2, marginTop: 4, fontWeight: '500' },
  badge: {
    backgroundColor: colors.primarySoft, borderRadius: 999,
    paddingHorizontal: 13, paddingVertical: 6,
    borderWidth: 1, borderColor: colors.line,
  },
  badgeText: { fontSize: 12, color: colors.primaryStrong, fontWeight: '700' },

  floatingCapsule: {
    position: 'absolute',
    alignSelf: 'center',
    zIndex: 999,
    borderRadius: 999,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    ...shadow.float,
  },
  capsuleInner: {
    paddingVertical: 7,
    paddingHorizontal: 16,
    borderRadius: 999,
  },
  capsuleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  capsuleTextPending: {
    fontSize: 12,
    color: colors.ink2,
    fontWeight: '500',
  },
  capsuleTextDanger: {
    fontSize: 12,
    color: colors.danger,
    fontWeight: '600',
  },

  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingBottom: 12 },

  composer: {
    paddingHorizontal: 16, paddingTop: 10, paddingBottom: 12,
    backgroundColor: colors.bg,
  },
  gap: { height: 10 },
  checkinWrap: { width: '100%' },

  overlay: {
    flex: 1, backgroundColor: colors.scrim,
    alignItems: 'center', justifyContent: 'center', padding: 28,
  },
  dialog: { width: '100%', backgroundColor: colors.surface, borderRadius: 20, padding: 20 },
  dialogTitle: { fontSize: 18, fontWeight: '700', color: colors.ink },
  dialogSub: { fontSize: 13, color: colors.ink3, marginTop: 4 },
  input: {
    marginTop: 14, borderWidth: 1.5, borderColor: colors.line2, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 10, fontSize: 15, color: colors.ink,
    backgroundColor: colors.chip,
  },
  dialogSectionLabel: {
    fontSize: 13, color: colors.ink2, fontWeight: '600', marginTop: 14, marginBottom: 8,
  },
  dialogModeScroll: { flexDirection: 'row', gap: 8, paddingVertical: 2 },
  dialogModeItem: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4,
    paddingVertical: 8, paddingHorizontal: 11, borderRadius: 10, backgroundColor: colors.chip,
    borderWidth: 1.5, borderColor: colors.line,
  },
  dialogModeItemSelected: {
    backgroundColor: colors.primarySoft, borderColor: colors.primary,
  },
  dialogModeLabel: { fontSize: 12, color: colors.ink2, fontWeight: '600' },
  dialogModeLabelSelected: { color: colors.primaryStrong },

  dialogRow: { flexDirection: 'row', gap: 10, marginTop: 18 },
  dialogBtn: { flex: 1, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  dialogCancel: { backgroundColor: colors.chip },
  dialogCancelText: { fontSize: 15, color: colors.ink2, fontWeight: '600' },
  dialogOk: { backgroundColor: colors.primary },
  dialogOkText: { fontSize: 15, color: '#fff', fontWeight: '700' },

  dialogFooterRow: {
    marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.line,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  dialogEndTrip: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  dialogEndTripText: { fontSize: 13, color: colors.primary, fontWeight: '600' },
  dialogDelete: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  dialogDeleteText: { fontSize: 13, color: colors.danger, fontWeight: '600' },

  timeOffsetRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
    marginTop: 2,
  },
  timeChip: {
    paddingVertical: 7,
    paddingHorizontal: 11,
    borderRadius: 10,
    backgroundColor: colors.chip,
    borderWidth: 1.5,
    borderColor: colors.line,
  },
  timeChipSelected: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
  },
  timeChipText: {
    fontSize: 12,
    color: colors.ink2,
    fontWeight: '600',
  },
  timeChipTextSelected: {
    color: colors.primaryStrong,
    fontWeight: '700',
  },
  quickPlaceWrap: {
    marginTop: 8,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  quickChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: colors.chip,
    borderWidth: 1,
    borderColor: colors.line,
  },
  quickChipActive: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
  },
  quickChipText: {
    fontSize: 12,
    color: colors.ink2,
    fontWeight: '500',
  },
  quickChipTextActive: {
    color: colors.primaryStrong,
    fontWeight: '700',
  },
});
