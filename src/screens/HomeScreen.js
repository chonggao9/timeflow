import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View, Text, ScrollView, StyleSheet, Alert, Modal, TextInput, TouchableOpacity, Linking, ActivityIndicator, Vibration,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  saveRecord, getRecords, getTodayRecords, updateRecord, deleteRecord, ensureTrip, endTrip,
  getCurrentTripId, getLastMode, setLastMode,
} from '../storage/store';
import { computePathStats, placeKey, UNNAMED } from '../utils/stats';
import { useTheme } from '../theme/ThemeContext';
import { useI18n } from '../i18n/LanguageContext';
import { getPositionFast, reverseGeocodeWithTimeout } from '../utils/location';
import { refreshWidget } from '../utils/widgetRefresh';
import { runBackupIfDue } from '../backup/schedule';
import Timeline from '../components/Timeline';
import CheckInButton from '../components/CheckInButton';
import TransportPicker from '../components/TransportPicker';
import RouteMapScreen from './RouteMapScreen';

const makeId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

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
  const locTargetRef = useRef(null);
  const fillSeqRef = useRef(0); // 补位序号：状态条只反映最新一次补位

  const [renameTarget, setRenameTarget] = useState(null);
  const [draftName, setDraftName] = useState('');

  const [mapTrip, setMapTrip] = useState(null); // 当前查看地图的行程

  const loadToday = useCallback(async () => {
    const today = await getTodayRecords();
    const sorted = today.sort((a, b) => a.timestamp - b.timestamp);
    setRecords(sorted);
    const trip = await getCurrentTripId();
    setHasActiveTrip(!!trip);
  }, []);

  // 初始化：记住上次出行方式
  useEffect(() => {
    (async () => setMode(await getLastMode()))();
  }, []);

  useFocusEffect(useCallback(() => { loadToday(); }, [loadToday]));

  // 计算预估：从最后一个点出发的最常见路段（按坐标格点匹配）
  useEffect(() => {
    if (records.length < 1) { setEstimate(null); return; }
    (async () => {
      const all = await getRecords();
      const stats = computePathStats(all);
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

  // 一键打卡：加入当前行程。立即落库（秒完成），坐标 + 地名后台异步补。
  const handleCheckIn = async () => {
    setLoading(true);
    const tnow = Date.now();
    try {
      const tripId = await ensureTrip();
      const id = makeId();
      await saveRecord({ id, timestamp: tnow, locationName: UNNAMED, lat: null, lng: null, mode, tripId });
      await setLastMode(mode);

      setLoading(false);
      setSuccess(true);
      Vibration.vibrate(15); // 轻触感：确认打卡（秒级，紧贴点击）
      await loadToday();
      refreshWidget(); // 桌面 widget 即时同步最新次数/时间（无 widget 时静默）
      runBackupIfDue().catch(() => {}); // 打卡触发自动备份（fire-and-forget，节流/未开则跳过）
      setTimeout(() => setSuccess(false), 1200);

      fillLocation(id); // 后台定位 + 反查，不阻塞打卡
    } catch (e) {
      setLoading(false);
      Vibration.vibrate([0, 40, 30, 40]); // 双震：保存失败
      Alert.alert(t('home.failTitle'), t('home.failBody'));
    }
  };

  // 后台补坐标 + 地名：状态条呈现 补位中/被拒/服务关闭/超时，成功则静默消失。
  // 序号守卫：连打两次时，旧补位照常落库/刷新，但只有最新一次能更新状态条。
  const fillLocation = async (id) => {
    const seq = ++fillSeqRef.current;
    locTargetRef.current = id;
    setLocStatus('pending');
    const isStale = () => seq !== fillSeqRef.current;
    const log = (...a) => { if (__DEV__) console.log(`[fillLocation:${seq}]`, ...a); };
    try {
      // 先只读查权限（绕开 requestForegroundPermissionsAsync 在部分 Android 上挂起的问题），未授权才真正请求
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

      let addr = loc.address; // 高德 SDK 可能已带回地名
      if (!addr) {
        log('step3 反查地名（SDK 无地址）');
        addr = await reverseGeocodeWithTimeout(lat, lng);
      }
      log('step3b 地名 =', addr);

      const patch = { lat, lng };
      if (addr) patch.locationName = addr;
      await updateRecord(id, patch);
      log('step4 写库完成');
      await loadToday(); // 旧补位也刷新，把已解析的地名补上
      refreshWidget(); // 补位完成，同步 widget 上的地名
      log('step5 完成，清状态条');
      if (!isStale()) setLocStatus(null);
    } catch (e) {
      log('ERROR', e && e.message);
      if (!isStale()) setLocStatus('failed');
    }
  };

  // 定位状态条点击：被拒→已授权则重试否则去设置；服务关闭→去设置；超时→服务没开则去设置否则重试
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

  // 结束当前行程
  const handleEndTrip = async () => {
    await endTrip();
    await loadToday();
    Alert.alert(t('trip.endedTitle'), t('trip.ended'));
  };

  // ---- 地名编辑 ----
  const openRename = (record) => {
    setRenameTarget(record);
    setDraftName(record.locationName && record.locationName !== UNNAMED ? record.locationName : '');
  };
  const closeRename = () => { setRenameTarget(null); setDraftName(''); };
  const confirmRename = async () => {
    if (!renameTarget) return;
    const name = draftName.trim();
    if (!name) { Alert.alert(t('home.renameEmpty')); return; }
    await updateRecord(renameTarget.id, { locationName: name });
    closeRename();
    await loadToday();
    refreshWidget(); // 改名后同步 widget 地名
  };

  // 误打卡：确认后删除这条记录
  const confirmDelete = () => {
    if (!renameTarget) return;
    Alert.alert(t('home.deleteTitle'), t('home.deleteBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.delete'), style: 'destructive', onPress: async () => {
        await deleteRecord(renameTarget.id);
        setLocStatus(null); // 这条的后台补位不再有意义
        closeRename();
        await loadToday();
        refreshWidget(); // 删除后同步 widget
      } },
    ]);
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

      {/* 定位状态条：补位中 / 权限被拒 / 定位失败 */}
      {locStatus && (
        <TouchableOpacity
          style={[styles.locBar, locStatus === 'pending' && styles.locBarPending]}
          onPress={handleLocBarPress}
          activeOpacity={locStatus === 'pending' ? 1 : 0.7}
          disabled={locStatus === 'pending'}
        >
          {locStatus === 'pending' ? (
            <View style={styles.locBarRow}>
              <ActivityIndicator size="small" color={colors.ink3} />
              <Text style={styles.locBarTextPending}>{t('home.locPending')}</Text>
            </View>
          ) : (
            <Text style={styles.locBarText}>
              {locStatus === 'denied' ? t('home.locDenied')
                : locStatus === 'services' ? t('home.locServices')
                : t('home.locFailed')}
            </Text>
          )}
        </TouchableOpacity>
      )}

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Timeline records={records} estimate={estimate} onRename={openRename} onShowMap={setMapTrip} />
      </ScrollView>

      {/* 底部操作区 */}
      <View style={styles.composer}>
        <TransportPicker selected={mode} onSelect={setMode} />
        <View style={styles.gap} />
        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.endBtn, !hasActiveTrip && styles.endBtnDisabled]}
            onPress={handleEndTrip}
            disabled={!hasActiveTrip}
            activeOpacity={0.7}
          >
            <Text style={[styles.endBtnText, !hasActiveTrip && styles.endBtnTextDisabled]}>{t('trip.end')}</Text>
          </TouchableOpacity>
          <View style={styles.checkinWrap}>
            <CheckInButton onPress={handleCheckIn} loading={loading} success={success} />
          </View>
        </View>
      </View>

      {/* 地名编辑弹窗 */}
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
              autoFocus
              returnKeyType="done"
              onSubmitEditing={confirmRename}
            />
            <View style={styles.dialogRow}>
              <TouchableOpacity style={[styles.dialogBtn, styles.dialogCancel]} onPress={closeRename}>
                <Text style={styles.dialogCancelText}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.dialogBtn, styles.dialogOk]} onPress={confirmRename}>
                <Text style={styles.dialogOkText}>{t('common.save')}</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity style={styles.dialogDelete} onPress={confirmDelete} activeOpacity={0.6}>
              <Ionicons name="trash-outline" size={15} color={colors.danger} />
              <Text style={styles.dialogDeleteText}>{t('home.deleteBtn')}</Text>
            </TouchableOpacity>
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
    paddingHorizontal: 20, paddingBottom: 8,
  },
  titleBlock: { flex: 1 },
  title: { fontSize: 26, fontWeight: '800', color: colors.ink, letterSpacing: -0.5, lineHeight: 30 },
  date: { fontSize: 13, color: colors.ink2, marginTop: 3 },
  badge: {
    backgroundColor: colors.primarySoft, borderRadius: 999,
    paddingHorizontal: 12, paddingVertical: 7,
  },
  badgeText: { fontSize: 12, color: colors.primaryStrong, fontWeight: '700' },

  locBar: {
    marginHorizontal: 16, marginBottom: 6,
    paddingVertical: 9, paddingHorizontal: 14,
    borderRadius: 12, alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.primarySofter,
  },
  locBarPending: { backgroundColor: colors.chip },
  locBarRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  locBarTextPending: { fontSize: 12, color: colors.ink3 },
  locBarText: { fontSize: 12, color: colors.danger, fontWeight: '600' },

  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingBottom: 12 },

  composer: {
    paddingHorizontal: 16, paddingTop: 12, paddingBottom: 14,
    backgroundColor: colors.bg,
  },
  gap: { height: 12 },
  actions: { flexDirection: 'row', gap: 10 },
  checkinWrap: { flex: 1 },
  endBtn: {
    width: 92, borderRadius: 18, alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.chip, borderWidth: 1.5, borderColor: colors.line,
  },
  endBtnDisabled: { opacity: 0.4 },
  endBtnText: { fontSize: 14, color: colors.ink2, fontWeight: '700', letterSpacing: 1 },
  endBtnTextDisabled: { color: colors.ink3 },

  overlay: {
    flex: 1, backgroundColor: colors.scrim,
    alignItems: 'center', justifyContent: 'center', padding: 28,
  },
  dialog: { width: '100%', backgroundColor: colors.surface, borderRadius: 20, padding: 20 },
  dialogTitle: { fontSize: 18, fontWeight: '700', color: colors.ink },
  dialogSub: { fontSize: 13, color: colors.ink3, marginTop: 4 },
  input: {
    marginTop: 16, borderWidth: 1.5, borderColor: colors.line2, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, color: colors.ink,
    backgroundColor: colors.chip,
  },
  dialogRow: { flexDirection: 'row', gap: 10, marginTop: 18 },
  dialogBtn: { flex: 1, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  dialogCancel: { backgroundColor: colors.chip },
  dialogCancelText: { fontSize: 15, color: colors.ink2, fontWeight: '600' },
  dialogOk: { backgroundColor: colors.primary },
  dialogOkText: { fontSize: 15, color: '#fff', fontWeight: '700' },
  dialogDelete: {
    marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.line,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
  },
  dialogDeleteText: { fontSize: 14, color: colors.danger, fontWeight: '600' },
});
