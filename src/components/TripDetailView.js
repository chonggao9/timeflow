import React, { useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Rect, Path, Circle, Text as SvgText } from 'react-native-svg';
import { useTheme } from '../theme/ThemeContext';
import { useI18n } from '../i18n/LanguageContext';
import { formatTime, formatDuration, isPlaceholderName, placeKey } from '../utils/stats';
import { shadow, radius } from '../theme';

export default function TripDetailView({
  trip,
  allTrips = [],
  discoveredRoutes = [],
  onClose,
  onRenameStop,
  onShowMap,
  onShowReceipt,
}) {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const { t, lang, formatDate } = useI18n();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  if (!trip) return null;

  const records = trip.records || [];
  const fromRecord = records[0];
  const toRecord = records[records.length - 1];
  const fromKey = fromRecord ? placeKey(fromRecord) : null;
  const toKey = toRecord ? placeKey(toRecord) : null;

  const fromName = fromRecord
    ? (isPlaceholderName(fromRecord.locationName) ? t('common.unnamed') : fromRecord.locationName)
    : t('common.unnamed');
  const toName = toRecord
    ? (isPlaceholderName(toRecord.locationName) ? t('common.unnamed') : toRecord.locationName)
    : t('common.unnamed');

  const title = records.length > 1 ? `${fromName} → ${toName}` : fromName;
  const durationMins = Math.max(1, Math.round((trip.durationMs || 0) / 60000));
  const isDiscovered = discoveredRoutes.some(dr => dr.fromKey === fromKey && dr.toKey === toKey);

  // 同路线历史行程对比
  const sameRouteTrips = useMemo(() => {
    if (!fromKey || !toKey) return [trip];
    const matched = (allTrips || []).filter(tr => {
      if (!tr.records || tr.records.length < 2) return false;
      const f = placeKey(tr.records[0]);
      const l = placeKey(tr.records[tr.records.length - 1]);
      return f === fromKey && l === toKey;
    });
    return matched.length > 0 ? matched.slice(0, 5) : [trip];
  }, [allTrips, fromKey, toKey, trip]);

  const maxCompareMins = useMemo(() => {
    const list = sameRouteTrips || [trip];
    return Math.max(...list.map(tr => Math.round((tr.durationMs || 0) / 60000)), durationMins, 1);
  }, [sameRouteTrips, durationMins]);

  // 检查是否有未命名站点
  const unnamedStop = useMemo(() => {
    return records.find(r => isPlaceholderName(r.locationName));
  }, [records]);

  // 日期格式化：10月12日
  const formatMonthDay = (ts) => {
    const d = new Date(ts);
    if (lang === 'zh') return `${d.getMonth() + 1}月${d.getDate()}日`;
    const moEn = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${moEn[d.getMonth()]} ${d.getDate()}`;
  };

  return (
    <View style={styles.container}>
      {/* 顶部导航 */}
      <View style={[styles.topBar, { paddingTop: insets.top + 6 }]}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={onClose}
          activeOpacity={0.7}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityLabel={t('common.cancel')}
        >
          <Ionicons name="chevron-back" size={24} color={colors.ink} />
        </TouchableOpacity>
        <Text style={styles.topTitle}>{t('insights.tripDetail')}</Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* 1. 路线示意图卡片 */}
        <View style={styles.mapCard}>
          <Svg viewBox="0 0 358 168" width="100%" height={168}>
            <Rect width="358" height="168" fill={isDark ? '#2B241D' : '#F6EDE5'} />
            <Path
              d="M0 120 C60 110 90 150 160 130 S280 90 358 100"
              stroke={isDark ? '#3D332A' : '#EADBCF'}
              strokeWidth="14"
              fill="none"
            />
            <Path
              d="M120 0 C130 50 100 90 130 168"
              stroke={isDark ? '#3D332A' : '#EADBCF'}
              strokeWidth="10"
              fill="none"
            />
            <Path
              d="M44 128 C84 118 96 82 138 76 S210 100 244 70 S300 42 316 40"
              stroke="#EF5350"
              strokeWidth="4"
              strokeLinecap="round"
              fill="none"
            />
            <Circle cx="44" cy="128" r="8" fill="#10B981" stroke="#fff" strokeWidth="3" />
            {records.length > 2 && (
              <Circle cx="138" cy="76" r="6" fill="#fff" stroke="#EF5350" strokeWidth="3" />
            )}
            {records.length > 3 && (
              <Circle cx="244" cy="70" r="6" fill="#fff" stroke="#EF5350" strokeWidth="3" />
            )}
            <Circle cx="316" cy="40" r="8" fill="#EF4444" stroke="#fff" strokeWidth="3" />
            <SvgText x="44" y="152" fontSize="11" fill={colors.ink2} textAnchor="middle">
              {fromName}
            </SvgText>
            <SvgText x="316" y="58" fontSize="11" fill={colors.ink2} textAnchor="middle">
              {toName}
            </SvgText>
            <SvgText x="344" y="20" fontSize="10" fill={colors.ink3} textAnchor="end">
              {t('insights.schematicRoute')}
            </SvgText>
          </Svg>
        </View>

        {/* 2. 行程概括卡片 */}
        <View style={styles.card}>
          <View style={styles.rowTop}>
            <View style={styles.titleCol}>
              <Text style={styles.mainTitle}>{title}</Text>
              <Text style={styles.subtitle}>
                {formatDate(new Date(trip.startTs))} · {t('mode.' + (trip.mode || 'walk'), trip.mode)}
              </Text>
            </View>
            <View style={styles.durCol}>
              <Text style={styles.durLabel}>{t('insights.duration', '耗时')}</Text>
              <Text style={styles.durBig}>
                {durationMins}
                <Text style={styles.durUnit}> {t('insights.min')}</Text>
              </Text>
            </View>
          </View>

          <View style={styles.badgesRow}>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{t('history.stops', { n: records.length })}</Text>
            </View>
            {records.length > 2 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{t('history.via', { n: records.length - 2 })}</Text>
              </View>
            )}
            {isDiscovered && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{t('insights.discoveredRouteBadge')}</Text>
              </View>
            )}
          </View>

          <View style={styles.tipBox}>
            <Text style={styles.tipText}>
              {isDiscovered
                ? t('insights.comparePatternNormal', { p25: Math.round(durationMins * 0.85), p75: Math.round(durationMins * 1.2) })
                : t('insights.comparePatternNone')}
            </Text>
          </View>
        </View>

        {/* 3. 途经站点时间轴卡片 */}
        <View style={styles.card}>
          <Text style={styles.cardSectionTitle}>{t('insights.viaStops')}</Text>
          <View style={styles.timeline}>
            {records.map((r, idx) => {
              const isFirst = idx === 0;
              const isLast = idx === records.length - 1;
              const isUnnamed = isPlaceholderName(r.locationName);
              const stopName = isUnnamed
                ? (isFirst ? t('common.unnamed') : isLast ? t('common.unnamed') : `中转 ${idx} · 未命名`)
                : r.locationName;

              const nextRec = records[idx + 1];
              const segMins = nextRec ? Math.max(1, Math.round((nextRec.timestamp - r.timestamp) / 60000)) : 0;
              const segMode = r.mode || trip.mode || 'walk';

              return (
                <View key={`stop-${r.id || idx}`} style={styles.timelineItem}>
                  <View style={styles.rail}>
                    <View
                      style={[
                        styles.dot,
                        isFirst && styles.dotFirst,
                        isLast && styles.dotLast,
                        !isFirst && !isLast && styles.dotMid,
                      ]}
                    />
                    {!isLast && <View style={styles.railLine} />}
                  </View>

                  <View style={styles.stopContent}>
                    <View style={styles.stopHeaderRow}>
                      <Text style={styles.stopName} numberOfLines={1}>
                        {stopName}
                      </Text>
                      <Text style={styles.stopTime}>
                        {formatTime(r.timestamp)}{' '}
                        {isFirst ? t('insights.departureWord') : isLast ? t('insights.arrivalWord') : ''}
                      </Text>
                    </View>

                    {!isLast && (
                      <View style={styles.segmentRow}>
                        <Text style={styles.segmentText}>
                          {t('mode.' + segMode, segMode)} {segMins} {t('insights.min')}
                        </Text>
                        {isUnnamed && onRenameStop && (
                          <TouchableOpacity
                            style={styles.renameLinkBtn}
                            onPress={() => onRenameStop(r)}
                            activeOpacity={0.7}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          >
                            <Text style={styles.renameLinkText}>{t('insights.nameBtn')}</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    )}
                  </View>
                </View>
              );
            })}
          </View>
        </View>

        {/* 4. 同路线对比卡片 */}
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <Text style={styles.cardSectionTitle}>{t('insights.sameRouteCompare')}</Text>
            <Text style={styles.compareCountText}>
              {t('insights.sameRouteCount', { n: sameRouteTrips.length })}
            </Text>
          </View>

          <View style={styles.compareList}>
            {sameRouteTrips.map((tr, idx) => {
              const isCur = tr.tripId === trip.tripId;
              const durM = Math.round((tr.durationMs || 0) / 60000);
              const barPercent = Math.max(10, Math.min(100, Math.round((durM / maxCompareMins) * 100)));

              return (
                <View key={`cmp-${tr.tripId || idx}`} style={styles.compareRow}>
                  <Text style={[styles.compareDate, isCur && styles.compareDateCur]}>
                    {formatMonthDay(tr.startTs)}
                  </Text>
                  <View style={styles.compareBarTrack}>
                    <View
                      style={[
                        styles.compareBarFill,
                        {
                          width: `${barPercent}%`,
                          backgroundColor: isCur ? colors.primaryStrong : '#F2A39B',
                        },
                      ]}
                    />
                  </View>
                  <Text style={[styles.compareVal, isCur && styles.compareValCur]}>
                    {durM} {t('insights.min')}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>

        {/* 5. 底部操作按钮 */}
        <View style={styles.actionsRow}>
          {unnamedStop && onRenameStop ? (
            <>
              <TouchableOpacity
                style={[styles.actionBtn, styles.actionRenamePink]}
                onPress={() => onRenameStop(unnamedStop)}
                activeOpacity={0.8}
              >
                <Text style={styles.actionRenamePinkText}>{t('insights.nameTransferStop')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionBtn, styles.actionSecondary]}
                onPress={() => onShowMap && onShowMap(trip)}
                activeOpacity={0.8}
              >
                <Text style={styles.actionSecondaryText}>{t('insights.viewMap')}</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <TouchableOpacity
                style={[styles.actionBtn, styles.actionPrimary]}
                onPress={() => onShowMap && onShowMap(trip)}
                activeOpacity={0.8}
              >
                <Text style={styles.actionPrimaryText}>{t('insights.viewMap')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionBtn, styles.actionSecondary]}
                onPress={() => onShowReceipt && onShowReceipt(trip)}
                activeOpacity={0.8}
              >
                <Text style={styles.actionSecondaryText}>{t('insights.viewReceipt')}</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const makeStyles = (colors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 10,
    backgroundColor: colors.bg,
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.ink,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingTop: 4,
    paddingBottom: 40,
    gap: 14,
  },

  mapCard: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    overflow: 'hidden',
    ...shadow.card,
    borderWidth: 1,
    borderColor: colors.line,
  },

  card: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: 16,
    ...shadow.card,
    borderWidth: 1,
    borderColor: colors.line,
    gap: 12,
  },
  rowTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  titleCol: {
    flex: 1,
    paddingRight: 10,
  },
  mainTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.ink,
  },
  subtitle: {
    fontSize: 12,
    color: colors.ink2,
    marginTop: 4,
  },
  durCol: {
    alignItems: 'flex-end',
  },
  durLabel: {
    fontSize: 11,
    color: colors.ink2,
  },
  durBig: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.primaryStrong,
    lineHeight: 32,
    fontVariant: ['tabular-nums'],
  },
  durUnit: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.primaryStrong,
  },

  badgesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  badge: {
    backgroundColor: '#FDEDEA',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  badgeText: {
    fontSize: 12,
    color: colors.primaryStrong,
    fontWeight: '600',
  },

  tipBox: {
    backgroundColor: colors.chip,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  tipText: {
    fontSize: 13,
    color: colors.ink2,
    lineHeight: 18,
  },

  cardSectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.ink,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  compareCountText: {
    fontSize: 12,
    color: colors.ink2,
  },

  timeline: {
    paddingTop: 4,
  },
  timelineItem: {
    flexDirection: 'row',
    gap: 12,
  },
  rail: {
    width: 14,
    alignItems: 'center',
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginTop: 4,
  },
  dotFirst: {
    backgroundColor: colors.primaryStrong,
  },
  dotLast: {
    backgroundColor: colors.ink,
  },
  dotMid: {
    backgroundColor: '#fff',
    borderWidth: 2.5,
    borderColor: colors.primaryStrong,
  },
  railLine: {
    flex: 1,
    width: 2,
    backgroundColor: '#F2B8B2',
    marginVertical: 2,
  },
  stopContent: {
    flex: 1,
    paddingBottom: 16,
  },
  stopHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  stopName: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.ink,
    flex: 1,
    marginRight: 8,
  },
  stopTime: {
    fontSize: 13,
    color: colors.ink2,
  },
  segmentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 4,
  },
  segmentText: {
    fontSize: 12,
    color: colors.ink2,
  },
  renameLinkBtn: {
    minHeight: 32,
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  renameLinkText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.primaryStrong,
  },

  compareList: {
    gap: 10,
  },
  compareRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  compareDate: {
    width: 58,
    fontSize: 12,
    color: colors.ink2,
  },
  compareDateCur: {
    color: colors.ink,
    fontWeight: '700',
  },
  compareBarTrack: {
    flex: 1,
    height: 12,
    backgroundColor: colors.chip,
    borderRadius: 6,
    overflow: 'hidden',
  },
  compareBarFill: {
    height: 12,
    borderRadius: 6,
  },
  compareVal: {
    width: 48,
    textAlign: 'right',
    fontSize: 12,
    color: colors.ink2,
    fontVariant: ['tabular-nums'],
  },
  compareValCur: {
    color: colors.ink,
    fontWeight: '700',
  },

  actionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  actionBtn: {
    flex: 1,
    minHeight: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  actionPrimary: {
    backgroundColor: colors.primaryStrong,
  },
  actionPrimaryText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  actionRenamePink: {
    backgroundColor: '#FDE8E8',
  },
  actionRenamePinkText: {
    color: '#E02424',
    fontSize: 14,
    fontWeight: '700',
  },
  actionSecondary: {
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: '#EADFD7',
  },
  actionSecondaryText: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: '600',
  },
});
