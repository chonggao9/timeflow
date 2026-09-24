import React, { useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  Share,
  Pressable,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Rect, Line } from 'react-native-svg';
import { captureRef } from 'react-native-view-shot';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as MediaLibrary from 'expo-media-library';
import * as Clipboard from 'expo-clipboard';
import { useTheme } from '../theme/ThemeContext';
import { useI18n } from '../i18n/LanguageContext';
import { formatTime, formatDuration, isPlaceholderName, UNNAMED } from '../utils/stats';
import ModeIcon from './ModeIcon';
import { radius, shadow } from '../theme';

const MODE_EMOJIS = {
  walk: '🚶',
  bike: '🚲',
  drive: '🚗',
  taxi: '🚕',
  subway: '🚇',
  transit: '🚌',
  train: '🚄',
  flight: '✈️',
  boat: '🚢',
};

// 格式化纯文本小票（用于系统分享至微信/备忘录等）
function buildShareText(trip, t, lang, formatDate) {
  const recs = trip.records || [];
  if (!recs.length) return '';
  const startTs = trip.startTs || trip.firstT || recs[0].timestamp;
  const endTs = trip.endTs || trip.lastT || recs[recs.length - 1].timestamp;
  const durationSec = Math.max(0, Math.round((endTs - startTs) / 1000));
  const dateStr = formatDate(new Date(startTs));

  const firstName = isPlaceholderName(recs[0].locationName) ? t('common.unnamed') : recs[0].locationName;
  const lastName = isPlaceholderName(recs[recs.length - 1].locationName) ? t('common.unnamed') : recs[recs.length - 1].locationName;
  const title = recs.length > 1 ? `${firstName} → ${lastName}` : firstName;

  const lines = [];
  lines.push('┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓');
  lines.push(`  ✦ TIMEFLOW · ${t('receipt.title')} ✦`);
  lines.push(`  ${dateStr}`);
  lines.push('┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛');
  lines.push('');
  lines.push(`${t('receipt.departure')} / ${t('receipt.arrival')}: ${title}`);
  lines.push(`${t('receipt.duration')}: ${formatDuration(durationSec, lang)} · ${t('receipt.stops', { n: recs.length })}`);
  lines.push('');
  lines.push('────────── [途经明细] ──────────');

  for (let i = 0; i < recs.length; i++) {
    const r = recs[i];
    const name = isPlaceholderName(r.locationName) ? t('common.unnamed') : r.locationName;
    lines.push(`${formatTime(r.timestamp)}  ${name}`);
    if (i < recs.length - 1) {
      const nextR = recs[i + 1];
      const legSec = Math.max(0, Math.round((nextR.timestamp - r.timestamp) / 1000));
      const m = r.mode || 'walk';
      const mLabel = t(`mode.${m}`);
      const emoji = MODE_EMOJIS[m] || '•';
      lines.push(`   ↓   ${formatDuration(legSec, lang)} · ${mLabel} ${emoji}`);
    }
  }

  const shortCode = String(trip.tripId || '').replace(/[^a-zA-Z0-9]/g, '').slice(-6).toUpperCase() || 'TRIP';
  const d = new Date(startTs);
  const serialNo = `TF-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-${shortCode}`;

  lines.push('───────────────────────────────');
  lines.push(`${t('receipt.serial')}: ${serialNo}`);
  lines.push(`★ ${t('receipt.footer')} ★`);

  return lines.join('\n');
}

// 模拟条形码组件
function Barcode({ color }) {
  // 生成固定美观的一维条形码线条宽度序列
  const bars = [2, 1, 3, 1, 2, 4, 1, 2, 1, 3, 2, 1, 4, 2, 1, 2, 3, 1, 1, 3, 2, 4, 1, 2, 1, 3, 1, 2, 4, 1];
  return (
    <Svg width="100%" height={34} style={{ overflow: 'hidden' }}>
      {bars.map((w, idx) => {
        let x = 8;
        for (let j = 0; j < idx; j++) x += bars[j] + 4;
        return (
          <Rect
            key={idx}
            x={x}
            y={0}
            width={w}
            height={34}
            fill={color}
            opacity={idx % 7 === 0 ? 0.4 : 0.85}
          />
        );
      })}
    </Svg>
  );
}

// 虚线撕裂分隔线
function DottedDivider({ color }) {
  return (
    <View style={stylesStatic.dividerWrap}>
      <Svg height="2" width="100%">
        <Line
          x1="0"
          y1="1"
          x2="100%"
          y2="1"
          stroke={color}
          strokeWidth="1.5"
          strokeDasharray="4, 4"
        />
      </Svg>
    </View>
  );
}

export default function TripReceiptModal({ visible, trip, onClose }) {
  const { colors, isDark } = useTheme();
  const { t, lang, formatDate } = useI18n();
  const styles = useMemo(() => makeStyles(colors, isDark), [colors, isDark]);
  const cardRef = useRef(null);
  const [saving, setSaving] = useState(false);

  if (!visible || !trip) return null;

  const recs = trip.records || [];
  const startTs = trip.startTs || trip.firstT || (recs[0] ? recs[0].timestamp : Date.now());
  const endTs = trip.endTs || trip.lastT || (recs[recs.length - 1] ? recs[recs.length - 1].timestamp : startTs);
  const durationSec = Math.max(0, Math.round((endTs - startTs) / 1000));
  const dateStr = formatDate(new Date(startTs));

  const firstName = recs.length > 0
    ? (isPlaceholderName(recs[0].locationName) ? t('common.unnamed') : recs[0].locationName)
    : t('common.unnamed');
  const lastName = recs.length > 0
    ? (isPlaceholderName(recs[recs.length - 1].locationName) ? t('common.unnamed') : recs[recs.length - 1].locationName)
    : t('common.unnamed');

  const shortCode = String(trip.tripId || '').replace(/[^a-zA-Z0-9]/g, '').slice(-6).toUpperCase() || 'TRIP';
  const d = new Date(startTs);
  const serialNo = `TF-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-${shortCode}`;

  // 保存小票长图到本地（优先直接存入系统相册）
  const handleSaveLocal = async () => {
    if (!cardRef.current || saving) return;
    setSaving(true);
    try {
      // 1. 抓取高保真 1:1 小票卡片渲染快照
      const uri = await captureRef(cardRef, {
        format: 'png',
        quality: 1,
        result: 'tmpfile',
      });

      // 2. 构造持久化文件路径并拷贝
      const targetFilename = `TimeFlow-Receipt-${serialNo}.png`;
      const targetUri = `${FileSystem.documentDirectory}${targetFilename}`;
      await FileSystem.copyAsync({ from: uri, to: targetUri });

      // 3. 优先直接保存到手机系统相册
      let savedToAlbum = false;
      try {
        const perm = await MediaLibrary.requestPermissionsAsync();
        if (perm.status === 'granted' || perm.granted) {
          const asset = await MediaLibrary.createAssetAsync(targetUri);
          try {
            await MediaLibrary.createAlbumAsync('TimeFlow', asset, false);
          } catch (albumErr) {
            /* 忽略部分系统无法建独立相册的异常 */
          }
          savedToAlbum = true;
          Alert.alert(t('receipt.saveSuccessTitle'), t('receipt.saveSuccessMsg'));
          return;
        }
      } catch (libErr) {
        console.warn('MediaLibrary save warning:', libErr);
      }

      // 4. 若未开启相册权限或不支持，兜底唤起系统面板（安全捕获异常）
      if (!savedToAlbum) {
        if (await Sharing.isAvailableAsync()) {
          try {
            await Sharing.shareAsync(targetUri, {
              mimeType: 'image/png',
              dialogTitle: t('receipt.saveLocal'),
              UTI: 'public.png',
            });
          } catch (shareErr) {
            // 安全捕获“没有应用可执行此操作”或 Intent 解析异常
            Alert.alert(t('receipt.saveSuccessTitle'), t('receipt.saved') + `\n${targetFilename}`);
          }
        } else {
          Alert.alert(t('receipt.saveSuccessTitle'), t('receipt.saved') + `\n${targetFilename}`);
        }
      }
    } catch (e) {
      console.warn('Failed to capture and save receipt image:', e);
      Alert.alert(t('receipt.saveFail'));
    } finally {
      setSaving(false);
    }
  };

  // 分享小票：自动复制文本至剪贴板，并尝试呼出系统面板
  const handleShare = async () => {
    const text = buildShareText(trip, t, lang, formatDate);
    try {
      // 1. 优先自动将小票完整 ASCII 艺术文本写入系统剪贴板（100% 成功保证，无需外部 App）
      await Clipboard.setStringAsync(text);

      // 2. 尝试唤起系统级分享面板（供已安装微信/其他应用的用户选用）
      try {
        await Share.share({
          message: text,
          title: t('receipt.shareTitle'),
        });
      } catch (shareErr) {
        // 捕获无可用外部 App 的 Intent 异常
      }

      // 3. 弹出明确的正向反馈提示：小票已复制到剪贴板，随时可长按粘贴发送！
      Alert.alert(t('receipt.copiedTitle'), t('receipt.copiedMsg'));
    } catch (e) {
      console.warn('Share/copy error:', e);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />

        <View style={styles.cardContainer}>
          {/* 小票主体 (collapsable=false 确保 Android 下顺利截图) */}
          <View ref={cardRef} collapsable={false} style={styles.receiptCard}>
            {/* 顶栏品牌信息 */}
            <View style={styles.header}>
              <View style={styles.logoRow}>
                <Ionicons name="time" size={16} color={colors.primary} />
                <Text style={styles.brandTitle}>TIMEFLOW</Text>
              </View>
              <Text style={styles.receiptSub}>{t('receipt.subtitle')}</Text>
              <Text style={styles.dateText}>{dateStr}</Text>
            </View>

            <DottedDivider color={colors.line2} />

            {/* 起止总览 */}
            <View style={styles.overviewSection}>
              <View style={styles.routeHeader}>
                <Text style={styles.routeName} numberOfLines={1}>{firstName}</Text>
                <Ionicons name="arrow-forward" size={16} color={colors.primaryStrong} style={styles.arrow} />
                <Text style={styles.routeName} numberOfLines={1}>{lastName}</Text>
              </View>

              <View style={styles.metricRow}>
                <View style={styles.metricItem}>
                  <Text style={styles.metricLabel}>{t('receipt.duration')}</Text>
                  <Text style={styles.metricValue}>{formatDuration(durationSec, lang)}</Text>
                </View>
                <View style={styles.metricDivider} />
                <View style={styles.metricItem}>
                  <Text style={styles.metricLabel}>{t('receipt.stops', { n: '' }).trim()}</Text>
                  <Text style={styles.metricValue}>{t('receipt.stops', { n: recs.length })}</Text>
                </View>
                <View style={styles.metricDivider} />
                <View style={styles.metricItem}>
                  <Text style={styles.metricLabel}>{t('home.editMode')}</Text>
                  <View style={styles.modeIconRow}>
                    <ModeIcon mode={trip.mode || recs[0]?.mode || 'walk'} size={14} color={colors.primaryStrong} />
                    <Text style={styles.metricValueSmall}>
                      {t(`mode.${trip.mode || recs[0]?.mode || 'walk'}`)}
                    </Text>
                  </View>
                </View>
              </View>
            </View>

            <DottedDivider color={colors.line2} />

            {/* 途经站点流水 (可滚动以防长途站点过多) */}
            <ScrollView style={styles.stopsScroll} showsVerticalScrollIndicator={false}>
              <View style={styles.stopsContainer}>
                {recs.map((r, i) => {
                  const placeName = isPlaceholderName(r.locationName) ? t('common.unnamed') : r.locationName;
                  const isFirst = i === 0;
                  const isLast = i === recs.length - 1;
                  const legSec = i < recs.length - 1
                    ? Math.max(0, Math.round((recs[i + 1].timestamp - r.timestamp) / 1000))
                    : null;
                  const m = r.mode || 'walk';

                  return (
                    <View key={r.id || i} style={styles.stopBlock}>
                      <View style={styles.stopRow}>
                        <View style={[styles.stopDot, (isFirst || isLast) && styles.stopDotAccent]} />
                        <Text style={styles.stopTime}>{formatTime(r.timestamp)}</Text>
                        <Text style={[styles.stopName, (isFirst || isLast) && styles.stopNameAccent]} numberOfLines={1}>
                          {placeName}
                        </Text>
                      </View>

                      {legSec != null && (
                        <View style={styles.legRow}>
                          <View style={styles.legLine} />
                          <View style={styles.legPill}>
                            <ModeIcon mode={m} size={11} color={colors.ink2} />
                            <Text style={styles.legText}>
                              {formatDuration(legSec, lang)} · {t(`mode.${m}`)}
                            </Text>
                          </View>
                        </View>
                      )}
                    </View>
                  );
                })}
              </View>
            </ScrollView>

            <DottedDivider color={colors.line2} />

            {/* 条形码与凭条编号 */}
            <View style={styles.footerSection}>
              <View style={styles.barcodeWrapper}>
                <Barcode color={isDark ? colors.ink2 : colors.ink} />
              </View>
              <Text style={styles.serialText}>{serialNo}</Text>
              <Text style={styles.sloganText}>{t('receipt.footer')}</Text>
            </View>
          </View>

          {/* 底部操作按钮栏 */}
          <View style={styles.actionRow}>
            <TouchableOpacity style={styles.closeBtn} onPress={onClose} activeOpacity={0.7}>
              <Text style={styles.closeBtnText}>{t('receipt.close')}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.saveBtn, saving && styles.btnDisabled]}
              onPress={handleSaveLocal}
              activeOpacity={0.8}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <>
                  <Ionicons name="download-outline" size={16} color={colors.primary} />
                  <Text style={styles.saveBtnText}>{t('receipt.saveLocal')}</Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity style={styles.shareBtn} onPress={handleShare} activeOpacity={0.8}>
              <Ionicons name="share-social-outline" size={16} color="#FFFFFF" />
              <Text style={styles.shareBtnText}>{t('receipt.share')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const stylesStatic = StyleSheet.create({
  dividerWrap: {
    marginVertical: 10,
    width: '100%',
    overflow: 'hidden',
  },
});

const makeStyles = (colors, isDark) =>
  StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: colors.scrim,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 20,
    },
    cardContainer: {
      width: '100%',
      maxWidth: 360,
      alignItems: 'center',
    },
    receiptCard: {
      width: '100%',
      backgroundColor: isDark ? '#231B15' : '#FCFAF7',
      borderRadius: radius.lg,
      paddingHorizontal: 20,
      paddingVertical: 20,
      borderWidth: 1,
      borderColor: colors.line,
      maxHeight: 520,
      ...shadow.float,
    },
    header: {
      alignItems: 'center',
      paddingBottom: 4,
    },
    logoRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginBottom: 3,
    },
    brandTitle: {
      fontSize: 14,
      fontWeight: '900',
      letterSpacing: 2.2,
      color: colors.ink,
    },
    receiptSub: {
      fontSize: 10,
      fontWeight: '600',
      letterSpacing: 1.2,
      color: colors.ink3,
      marginBottom: 4,
    },
    dateText: {
      fontSize: 12,
      color: colors.ink2,
      fontVariant: ['tabular-nums'],
    },
    overviewSection: {
      paddingVertical: 2,
    },
    routeHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      marginBottom: 12,
    },
    routeName: {
      fontSize: 15,
      fontWeight: '800',
      color: colors.ink,
      maxWidth: '42%',
    },
    arrow: {
      marginHorizontal: 2,
    },
    metricRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-around',
      backgroundColor: colors.chip,
      borderRadius: radius.sm,
      paddingVertical: 8,
      paddingHorizontal: 6,
    },
    metricItem: {
      alignItems: 'center',
      flex: 1,
    },
    metricDivider: {
      width: 1,
      height: 18,
      backgroundColor: colors.line2,
    },
    metricLabel: {
      fontSize: 10,
      color: colors.ink3,
      marginBottom: 2,
    },
    metricValue: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.ink,
      fontVariant: ['tabular-nums'],
    },
    modeIconRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
    },
    metricValueSmall: {
      fontSize: 11,
      fontWeight: '700',
      color: colors.ink,
    },
    stopsScroll: {
      maxHeight: 180,
    },
    stopsContainer: {
      paddingVertical: 4,
    },
    stopBlock: {
      position: 'relative',
    },
    stopRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingVertical: 3,
    },
    stopDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: colors.ink3,
    },
    stopDotAccent: {
      backgroundColor: colors.primaryStrong,
      width: 8,
      height: 8,
      borderRadius: 4,
    },
    stopTime: {
      fontSize: 11,
      fontVariant: ['tabular-nums'],
      color: colors.ink2,
      width: 40,
    },
    stopName: {
      fontSize: 12.5,
      color: colors.ink2,
      flex: 1,
      fontWeight: '500',
    },
    stopNameAccent: {
      color: colors.ink,
      fontWeight: '700',
    },
    legRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginLeft: 2.5,
      paddingVertical: 2,
    },
    legLine: {
      width: 1,
      height: 16,
      backgroundColor: colors.line2,
      marginRight: 10,
    },
    legPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: colors.chip,
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 6,
    },
    legText: {
      fontSize: 9.5,
      color: colors.ink3,
    },
    footerSection: {
      alignItems: 'center',
      paddingTop: 4,
    },
    barcodeWrapper: {
      width: '85%',
      height: 34,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 6,
    },
    serialText: {
      fontSize: 10.5,
      fontWeight: '700',
      letterSpacing: 1.5,
      color: colors.ink2,
      fontVariant: ['tabular-nums'],
      marginBottom: 3,
    },
    sloganText: {
      fontSize: 9.5,
      color: colors.ink3,
      letterSpacing: 0.5,
    },
    actionRow: {
      flexDirection: 'row',
      gap: 8,
      marginTop: 16,
      width: '100%',
    },
    closeBtn: {
      flex: 1,
      height: 42,
      borderRadius: 14,
      backgroundColor: colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: colors.line,
      ...shadow.sm,
    },
    closeBtnText: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.ink2,
    },
    saveBtn: {
      flex: 1.4,
      height: 42,
      borderRadius: 14,
      backgroundColor: colors.surface,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 5,
      borderWidth: 1.5,
      borderColor: colors.primarySoft,
      ...shadow.sm,
    },
    saveBtnText: {
      fontSize: 12.5,
      fontWeight: '700',
      color: colors.primary,
    },
    shareBtn: {
      flex: 1.4,
      height: 42,
      borderRadius: 14,
      backgroundColor: colors.primary,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 5,
      ...shadow.sm,
    },
    shareBtnText: {
      fontSize: 12.5,
      fontWeight: '700',
      color: '#FFFFFF',
    },
    btnDisabled: {
      opacity: 0.5,
    },
  });
