import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { formatTime, formatDuration, isPlaceholderName, UNNAMED } from '../utils/stats';
import { useTheme } from '../theme/ThemeContext';
import { useI18n } from '../i18n/LanguageContext';
import ModeIcon from './ModeIcon';

const LEGACY = 'legacy';

// 按行程分组（按时间降序：最新行程在最上方）
function groupByTrip(records) {
  const map = new Map();
  for (const r of records) {
    const key = r.tripId || LEGACY;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(r);
  }
  const groups = [...map.entries()].map(([tripId, recs]) => {
    const sorted = [...recs].sort((a, b) => a.timestamp - b.timestamp);
    return {
      tripId,
      records: sorted,
      firstT: sorted[0].timestamp,
      lastT: sorted[sorted.length - 1].timestamp,
    };
  });
  return groups.sort((a, b) => b.firstT - a.firstT);
}

// 检查有效坐标点数（≥2 才能连成地图轨迹）
const countCoords = (records) =>
  (records || []).filter(r => r.lat != null && r.lng != null).length;

export default function Timeline({
  records = [],
  estimate,
  onRename,
  onShowMap,
  onShowReceipt,
  onChangeSegmentMode,
  hasActiveTrip = false,
}) {
  const { t, lang } = useI18n();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  // 折叠状态记录：key 为 tripId，true 代表折叠，false 代表展开
  const [collapsedMap, setCollapsedMap] = useState({});

  if (!records.length) {
    return (
      <View style={styles.empty}>
        <View style={styles.emptyRing}>
          <Ionicons name="location" size={32} color="#D63B3B" />
        </View>
        <Text style={styles.emptyText}>{t('timeline.empty.title')}</Text>
        <Text style={styles.emptyHint}>{t('timeline.empty.hint')}</Text>
      </View>
    );
  }

  const groups = groupByTrip(records);

  const toggleTripCollapse = (tripId) => {
    setCollapsedMap(prev => ({
      ...prev,
      [tripId]: !prev[tripId],
    }));
  };

  const handleMapPress = (g) => {
    const validCount = countCoords(g.records);
    if (validCount < 2) {
      Alert.alert(t('timeline.mapBtn'), t('home.need2CoordsToast', '至少需要 2 个有效定位点才能查看轨迹'));
      return;
    }
    if (onShowMap) onShowMap(g);
  };

  const renderTrip = (g, gi) => {
    const rev = g.records.slice().reverse(); // 倒序：最新打卡点在前面
    const isFirstGroup = gi === 0;
    // 最新一组且 hasActiveTrip 为 true 时，处于进行中状态
    const isOngoing = isFirstGroup && hasActiveTrip;
    const isCollapsed = collapsedMap[g.tripId] ?? (!isOngoing && groups.length > 1);

    const tripDurationSec = Math.max(0, Math.round((g.lastT - g.firstT) / 1000));
    const tripNumber = groups.length - gi;

    // 起点与终点/当前点名称
    const startRecord = g.records[0];
    const latestRecord = g.records[g.records.length - 1];
    const startName = isPlaceholderName(startRecord?.locationName) ? t('common.unnamed') : startRecord.locationName;
    const latestName = isPlaceholderName(latestRecord?.locationName) ? t('common.unnamed') : latestRecord.locationName;

    const summaryRouteText = g.records.length > 1
      ? `${startName} → ${latestName}`
      : startName;

    const coordsCount = countCoords(g.records);

    return (
      <View key={g.tripId} style={styles.tripCard}>
        {/* 行程卡片顶部 Header */}
        <TouchableOpacity
          style={styles.tripHeader}
          onPress={() => toggleTripCollapse(g.tripId)}
          activeOpacity={0.7}
        >
          <View style={styles.tripHeaderLeft}>
            <View style={styles.tripBadgeRow}>
              <Text style={styles.tripTitleText}>
                {g.tripId === LEGACY ? t('timeline.legacy') : `${t('timeline.trip')} ${tripNumber}`}
              </Text>
              {isOngoing ? (
                <View style={styles.badgeOngoing}>
                  <View style={styles.badgeDotRed} />
                  <Text style={styles.badgeOngoingText}>{t('home.tripOngoing', '进行中')}</Text>
                </View>
              ) : (
                <View style={styles.badgeEnded}>
                  <Text style={styles.badgeEndedText}>{t('home.tripEnded', '已结束')}</Text>
                </View>
              )}
            </View>

            {/* 路线与历时摘要 */}
            {isCollapsed ? (
              <Text style={styles.tripSubCollapsed}>
                {t('home.tripCheckinsCount', { n: g.records.length })}
              </Text>
            ) : (
              <Text style={styles.tripSubExpanded} numberOfLines={1}>
                {summaryRouteText}{' '}
                <Text style={styles.tripSubDur}>
                  · {formatDuration(tripDurationSec, lang)}
                </Text>
              </Text>
            )}
          </View>

          {/* 右侧动作按钮区 */}
          {isCollapsed ? (
            <View style={styles.expandTrigger}>
              <Text style={styles.expandTriggerText}>{t('home.tripExpand', '展开')}</Text>
              <Ionicons name="chevron-down" size={15} color="#B3302C" />
            </View>
          ) : (
            <View style={styles.tripActionsRow}>
              {onShowReceipt && g.records.length > 0 && (
                <TouchableOpacity
                  style={styles.ghostBtn}
                  onPress={() => onShowReceipt(g)}
                  activeOpacity={0.7}
                  hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                >
                  <Ionicons name="receipt-outline" size={13} color="#B3302C" />
                  <Text style={styles.ghostBtnText}>{t('receipt.btn', '小票')}</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={[styles.ghostBtn, coordsCount < 2 && styles.ghostBtnDisabled]}
                onPress={() => handleMapPress(g)}
                activeOpacity={0.7}
                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
              >
                <Ionicons name="map-outline" size={13} color={coordsCount < 2 ? '#B9A99D' : '#B3302C'} />
                <Text style={[styles.ghostBtnText, coordsCount < 2 && styles.ghostBtnTextDisabled]}>
                  {t('timeline.mapBtn', '轨迹')}
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </TouchableOpacity>

        {/* 展开内容：打卡点轨道 */}
        {!isCollapsed && (
          <View style={styles.trackContainer}>
            {rev.map((r, j) => {
              const isHead = j === 0;
              const isTail = j === rev.length - 1;
              const isCurrent = isHead && isOngoing;
              const isStart = isTail && rev.length > 1;

              // 相邻点之间时间差
              const durBelow = j < rev.length - 1 ? Math.max(0, Math.round((r.timestamp - rev[j + 1].timestamp) / 1000)) : null;

              const displayName = isPlaceholderName(r.locationName)
                ? t('common.unnamed')
                : r.locationName;

              return (
                <View key={r.id}>
                  {/* 打卡点行 */}
                  <View style={styles.nodeRow}>
                    {/* 时间列 */}
                    <Text style={[styles.nodeTime, isCurrent && styles.nodeTimeCurrent]}>
                      {formatTime(r.timestamp)}
                    </Text>

                    {/* 轴线与节点图标 */}
                    <View style={styles.lineCol}>
                      {isCurrent ? (
                        <View style={styles.currentDotWrap}>
                          <View style={styles.currentDot} />
                        </View>
                      ) : isStart ? (
                        <View style={styles.startDot} />
                      ) : (
                        <View style={styles.normalDot} />
                      )}
                      {!isTail && <View style={styles.verticalLine} />}
                    </View>

                    {/* 右侧地名卡片 */}
                    <TouchableOpacity
                      style={[
                        styles.pointCard,
                        isCurrent && styles.pointCardCurrent,
                        isStart && styles.pointCardStart,
                      ]}
                      onPress={() => onRename && onRename(r)}
                      activeOpacity={0.7}
                    >
                      <Text
                        style={[
                          styles.pointName,
                          isCurrent && styles.pointNameCurrent,
                          isStart && styles.pointNameStart,
                        ]}
                        numberOfLines={1}
                      >
                        {displayName}
                      </Text>

                      {isCurrent && (
                        <View style={styles.pillCurrent}>
                          <Text style={styles.pillCurrentText}>{t('home.tripCurrent', '当前')}</Text>
                        </View>
                      )}

                      {isStart && (
                        <View style={styles.pillStart}>
                          <Text style={styles.pillStartText}>{t('home.tripStart', '起点')}</Text>
                        </View>
                      )}

                      <Ionicons
                        name="chevron-forward"
                        size={14}
                        color={isCurrent ? '#8E2420' : '#9A8A80'}
                      />
                    </TouchableOpacity>
                  </View>

                  {/* 路段耗时胶囊行（两点之间） */}
                  {durBelow != null && (
                    <View style={styles.segmentRow}>
                      <View style={{ width: 42 }} />
                      <View style={styles.segmentLineCol}>
                        <View style={styles.segmentVerticalLine} />
                      </View>
                      <View style={styles.segmentContent}>
                        <TouchableOpacity
                          style={styles.segmentPill}
                          onPress={() => onChangeSegmentMode && onChangeSegmentMode(r)}
                          activeOpacity={0.7}
                        >
                          <ModeIcon mode={r.mode || 'walk'} size={13} color="#B3302C" />
                          <Text style={styles.segmentPillText}>
                            {t('mode.' + (r.mode || 'walk'))} · {formatDuration(durBelow, lang)}
                          </Text>
                          <Ionicons name="chevron-down" size={11} color="#B3302C" />
                        </TouchableOpacity>
                      </View>
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        )}
      </View>
    );
  };

  return <View style={styles.container}>{groups.map(renderTrip)}</View>;
}

const makeStyles = (colors) =>
  StyleSheet.create({
    container: {
      width: '100%',
    },
    empty: {
      paddingVertical: 60,
      alignItems: 'center',
      justifyContent: 'center',
    },
    emptyRing: {
      width: 64,
      height: 64,
      borderRadius: 32,
      backgroundColor: '#FDE9E6',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 14,
    },
    emptyText: {
      fontSize: 16,
      fontWeight: '700',
      color: '#2B1F1A',
      marginBottom: 6,
    },
    emptyHint: {
      fontSize: 13,
      color: '#6F5F57',
    },
    tripCard: {
      backgroundColor: '#fff',
      borderWidth: 1,
      borderColor: '#EFE2D7',
      borderRadius: 20,
      overflow: 'hidden',
      marginBottom: 10,
    },
    tripHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: '#F3E9E0',
    },
    tripHeaderLeft: {
      flex: 1,
      minWidth: 0,
    },
    tripBadgeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    tripTitleText: {
      fontSize: 15,
      fontWeight: '800',
      color: '#2B1F1A',
    },
    badgeOngoing: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: '#FDE9E6',
      borderRadius: 8,
      paddingHorizontal: 7,
      paddingVertical: 2,
    },
    badgeDotRed: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: '#D63B3B',
    },
    badgeOngoingText: {
      fontSize: 11,
      fontWeight: '700',
      color: '#B3302C',
    },
    badgeEnded: {
      backgroundColor: '#F1E6DC',
      borderRadius: 8,
      paddingHorizontal: 7,
      paddingVertical: 2,
    },
    badgeEndedText: {
      fontSize: 11,
      fontWeight: '600',
      color: '#5C4B43',
    },
    tripSubCollapsed: {
      fontSize: 12,
      color: '#6F5F57',
      marginTop: 2,
    },
    tripSubExpanded: {
      fontSize: 13,
      fontWeight: '700',
      color: '#4A3F39',
      marginTop: 2,
    },
    tripSubDur: {
      fontWeight: '500',
      color: '#6F5F57',
    },
    expandTrigger: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    expandTriggerText: {
      fontSize: 13,
      fontWeight: '700',
      color: '#B3302C',
    },
    tripActionsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    ghostBtn: {
      height: 34,
      paddingHorizontal: 10,
      borderRadius: 10,
      backgroundColor: '#FDEEEC',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    ghostBtnDisabled: {
      opacity: 0.55,
      backgroundColor: '#F8F1EA',
    },
    ghostBtnText: {
      fontSize: 12,
      fontWeight: '700',
      color: '#B3302C',
    },
    ghostBtnTextDisabled: {
      color: '#9A8A80',
    },
    trackContainer: {
      paddingHorizontal: 12,
      paddingVertical: 12,
    },
    nodeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    nodeTime: {
      width: 42,
      textAlign: 'right',
      fontSize: 13,
      fontWeight: '600',
      color: '#4A3F39',
    },
    nodeTimeCurrent: {
      fontWeight: '800',
      color: '#B3302C',
    },
    lineCol: {
      width: 16,
      alignItems: 'center',
      justifyContent: 'center',
      position: 'relative',
    },
    currentDotWrap: {
      width: 16,
      height: 16,
      borderRadius: 8,
      backgroundColor: '#FBD9D6',
      alignItems: 'center',
      justifyContent: 'center',
    },
    currentDot: {
      width: 10,
      height: 10,
      borderRadius: 5,
      backgroundColor: '#D63B3B',
    },
    startDot: {
      width: 10,
      height: 10,
      borderRadius: 5,
      backgroundColor: '#fff',
      borderWidth: 2,
      borderColor: '#B9A99D',
    },
    normalDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: '#B9A99D',
    },
    verticalLine: {
      position: 'absolute',
      top: 16,
      bottom: -20,
      width: 2,
      backgroundColor: '#EBD9CF',
    },
    pointCard: {
      flex: 1,
      minWidth: 0,
      height: 46,
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 12,
      gap: 8,
      backgroundColor: '#fff',
      borderWidth: 1.5,
      borderColor: '#EFE2D7',
      borderRadius: 14,
    },
    pointCardCurrent: {
      backgroundColor: '#FDE7E5',
      borderColor: '#F0B3AF',
    },
    pointCardStart: {
      backgroundColor: '#F8F1EA',
      borderColor: '#EADDD2',
    },
    pointName: {
      flex: 1,
      fontSize: 15,
      fontWeight: '700',
      color: '#2B1F1A',
    },
    pointNameCurrent: {
      fontSize: 16,
      fontWeight: '800',
      color: '#8E2420',
    },
    pointNameStart: {
      color: '#2B1F1A',
    },
    pillCurrent: {
      backgroundColor: '#D63B3B',
      borderRadius: 8,
      paddingHorizontal: 8,
      paddingVertical: 3,
    },
    pillCurrentText: {
      fontSize: 11,
      fontWeight: '700',
      color: '#fff',
    },
    pillStart: {
      backgroundColor: '#EADDD2',
      borderRadius: 8,
      paddingHorizontal: 8,
      paddingVertical: 3,
    },
    pillStartText: {
      fontSize: 11,
      fontWeight: '700',
      color: '#5C4B43',
    },
    segmentRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      height: 38,
    },
    segmentLineCol: {
      width: 16,
      alignItems: 'center',
      height: '100%',
    },
    segmentVerticalLine: {
      flex: 1,
      width: 2,
      backgroundColor: '#EBD9CF',
    },
    segmentContent: {
      flex: 1,
      justifyContent: 'center',
    },
    segmentPill: {
      alignSelf: 'flex-start',
      height: 28,
      paddingHorizontal: 9,
      borderRadius: 10,
      backgroundColor: '#FDEEEC',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
    },
    segmentPillText: {
      fontSize: 12,
      fontWeight: '700',
      color: '#B3302C',
    },
  });
