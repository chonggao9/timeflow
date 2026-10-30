import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, TextInput, BackHandler, ScrollView } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../theme/ThemeContext';
import { useI18n } from '../../i18n/LanguageContext';
import { groupTrips, groupTripsByDate } from '../../utils/analytics';
import { formatDuration, formatTime, isPlaceholderName } from '../../utils/stats';
import { radius, shadow } from '../../theme';
import ModeIcon from '../ModeIcon';
import TripDetailView from '../TripDetailView';

const MODES = ['walk', 'bike', 'drive', 'taxi', 'subway', 'transit', 'train', 'flight', 'boat'];
const hasCoords = (records) => (records || []).filter(r => r.lat != null && r.lng != null).length >= 2;

export default function TravelHistoryModal({
  visible,
  onClose,
  records = [],
  allTrips = [],
  discoveredRoutes = [],
  onShowMap,
  onShowReceipt,
  onRenameStop,
}) {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const { t, lang, formatDate } = useI18n();

  const [query, setQuery] = useState('');
  const [modeFilter, setModeFilter] = useState(null);
  const [selectedTrip, setSelectedTrip] = useState(null);

  // 物理返回键处理：详情页先返回列表，列表页关闭弹层
  useEffect(() => {
    if (!visible) return;
    const onBackPress = () => {
      if (selectedTrip) {
        setSelectedTrip(null);
        return true;
      }
      onClose && onClose();
      return true;
    };
    const sub = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => sub.remove();
  }, [visible, selectedTrip, onClose]);

  // 行程分组与过滤
  const flatItems = useMemo(() => {
    let trips = groupTrips(records);
    const q = query.trim().toLowerCase();
    if (q) {
      trips = trips.filter(tr =>
        tr.records.some(r => (r.locationName || '').toLowerCase().includes(q))
      );
    }
    if (modeFilter) {
      trips = trips.filter(tr =>
        tr.records.some(r => (r.mode || 'walk') === modeFilter)
      );
    }
    const grouped = groupTripsByDate(trips);

    // 扁平化为 header 与 trip 混合数组供 FlashList 使用
    const items = [];
    grouped.forEach(g => {
      items.push({ type: 'header', key: `hdr-${g.ts}`, ts: g.ts, count: g.list.length });
      g.list.forEach(tr => {
        items.push({ type: 'trip', key: `tr-${tr.tripId}`, trip: tr });
      });
    });
    return items;
  }, [records, query, modeFilter]);

  const renderItem = useCallback(({ item }) => {
    if (item.type === 'header') {
      return (
        <View style={styles.dateHeader}>
          <Text style={[styles.dateHeaderText, { color: colors.ink3 }]}>
            {formatDate(new Date(item.ts))}
          </Text>
          <Text style={[styles.dateHeaderCount, { color: colors.ink3 }]}>
            {item.count}
          </Text>
        </View>
      );
    }

    const { trip } = item;
    const from = trip.route[0] || t('common.unnamed');
    const to = trip.route[trip.route.length - 1] || t('common.unnamed');
    const title = trip.route.length > 1 ? `${from} → ${to}` : from;
    const dur = trip.durationMs > 0 ? formatDuration(Math.round(trip.durationMs / 1000), lang) : '—';
    const canShowMap = onShowMap && hasCoords(trip.records);

    return (
      <TouchableOpacity
        style={[styles.tripCard, { backgroundColor: colors.card, borderColor: colors.border }]}
        onPress={() => setSelectedTrip(trip)}
        activeOpacity={0.7}
      >
        <View style={styles.tripHead}>
          <View style={[styles.modeWrap, { backgroundColor: colors.canvas }]}>
            <ModeIcon mode={trip.mode} size={16} color={colors.primary} />
          </View>
          <Text style={[styles.tripTitle, { color: colors.ink }]} numberOfLines={1}>
            {title}
          </Text>
          <Text style={[styles.tripDur, { color: colors.ink }]}>{dur}</Text>
        </View>

        <View style={styles.tripMeta}>
          <Text style={[styles.tripMetaText, { color: colors.ink3 }]}>
            {formatTime(trip.startTs)} · {t('history.stops', { n: trip.route.length })}
          </Text>
          <View style={styles.metaActions}>
            {onShowReceipt && (
              <TouchableOpacity
                style={styles.actionIconBtn}
                onPress={() => onShowReceipt(trip)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="receipt-outline" size={15} color={colors.ink2} />
              </TouchableOpacity>
            )}
            {canShowMap && (
              <TouchableOpacity
                style={styles.actionIconBtn}
                onPress={() => onShowMap(trip)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="map-outline" size={15} color={colors.primary} />
              </TouchableOpacity>
            )}
            <Ionicons name="chevron-forward" size={14} color={colors.ink3} />
          </View>
        </View>
      </TouchableOpacity>
    );
  }, [colors, t, lang, formatDate, onShowMap, onShowReceipt]);

  if (!visible) return null;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.modalRoot, { backgroundColor: colors.canvas, paddingTop: insets.top }]}>
        {selectedTrip ? (
          // 详情视图：内联切换，不新建 Modal
          <TripDetailView
            trip={selectedTrip}
            allTrips={allTrips}
            discoveredRoutes={discoveredRoutes}
            onClose={() => setSelectedTrip(null)}
            onRenameStop={onRenameStop}
            onShowMap={onShowMap}
            onShowReceipt={onShowReceipt}
          />
        ) : (
          // 列表视图
          <View style={styles.listContainer}>
            {/* 顶栏 */}
            <View style={[styles.topBar, { borderBottomColor: colors.border }]}>
              <TouchableOpacity
                style={styles.closeBtn}
                onPress={onClose}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <Ionicons name="chevron-down" size={24} color={colors.ink} />
              </TouchableOpacity>
              <Text style={[styles.topBarTitle, { color: colors.ink }]}>
                {t('insights.tripHistoryTitle')}
              </Text>
              <View style={styles.closeBtnPlaceholder} />
            </View>

            {/* 搜索框 */}
            <View style={styles.searchSection}>
              <View style={[styles.searchBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Ionicons name="search" size={16} color={colors.ink3} />
                <TextInput
                  style={[styles.searchInput, { color: colors.ink }]}
                  value={query}
                  onChangeText={setQuery}
                  placeholder={t('insights.tripHistorySearchPlaceholder')}
                  placeholderTextColor={colors.ink3}
                  returnKeyType="search"
                />
                {query ? (
                  <TouchableOpacity onPress={() => setQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Ionicons name="close-circle" size={16} color={colors.ink3} />
                  </TouchableOpacity>
                ) : null}
              </View>

              {/* 方式胶囊筛选 */}
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.chipsRow}
              >
                <TouchableOpacity
                  style={[
                    styles.chip,
                    {
                      backgroundColor: modeFilter === null ? colors.primary : colors.card,
                      borderColor: modeFilter === null ? colors.primary : colors.border,
                    },
                  ]}
                  onPress={() => setModeFilter(null)}
                >
                  <Text
                    style={[
                      styles.chipText,
                      { color: modeFilter === null ? colors.card : colors.ink2, fontWeight: modeFilter === null ? '700' : '500' },
                    ]}
                  >
                    {t('insights.tripHistoryAllModes')}
                  </Text>
                </TouchableOpacity>
                {MODES.map((m) => {
                  const active = modeFilter === m;
                  return (
                    <TouchableOpacity
                      key={m}
                      style={[
                        styles.chip,
                        {
                          backgroundColor: active ? colors.primary : colors.card,
                          borderColor: active ? colors.primary : colors.border,
                        },
                      ]}
                      onPress={() => setModeFilter(active ? null : m)}
                    >
                      <Text
                        style={[
                          styles.chipText,
                          { color: active ? colors.card : colors.ink2, fontWeight: active ? '700' : '500' },
                        ]}
                      >
                        {t('mode.' + m)}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>

            {/* FlashList 渲染 */}
            <View style={styles.listWrap}>
              {flatItems.length === 0 ? (
                <View style={styles.emptyWrap}>
                  <Ionicons name="trail-sign-outline" size={48} color={colors.ink3} />
                  <Text style={[styles.emptyText, { color: colors.ink3 }]}>
                    {records.length === 0 ? t('insights.tripHistoryEmpty') : t('history.noMatch')}
                  </Text>
                </View>
              ) : (
                <FlashList
                  data={flatItems}
                  renderItem={renderItem}
                  estimatedItemSize={72}
                  contentContainerStyle={styles.listContent}
                  keyExtractor={(item) => item.key}
                />
              )}
            </View>
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalRoot: {
    flex: 1,
  },
  listContainer: {
    flex: 1,
  },
  topBar: {
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  topBarTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  closeBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnPlaceholder: {
    width: 32,
  },
  searchSection: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    gap: 10,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: 10,
    height: 38,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    padding: 0,
  },
  chipsRow: {
    gap: 8,
    paddingVertical: 2,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  chipText: {
    fontSize: 12,
  },
  listWrap: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  dateHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 16,
    paddingBottom: 6,
  },
  dateHeaderText: {
    fontSize: 12,
    fontWeight: '600',
  },
  dateHeaderCount: {
    fontSize: 11,
  },
  tripCard: {
    borderRadius: radius.md,
    borderWidth: 1,
    padding: 12,
    marginBottom: 8,
    gap: 8,
  },
  tripHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  modeWrap: {
    width: 26,
    height: 26,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tripTitle: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
  },
  tripDur: {
    fontSize: 13,
    fontWeight: '600',
  },
  tripMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: 34,
  },
  tripMetaText: {
    fontSize: 12,
  },
  metaActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  actionIconBtn: {
    padding: 2,
  },
  emptyWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    gap: 12,
  },
  emptyText: {
    fontSize: 13,
  },
});
