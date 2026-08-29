import React, { useState, useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useI18n } from '../i18n/LanguageContext';
import { useTheme } from '../theme/ThemeContext';
import { groupTrips, groupTripsByDate } from '../utils/analytics';
import { formatDuration, formatTime, isPlaceholderName } from '../utils/stats';
import { radius, shadow } from '../theme';
import ModeIcon from './ModeIcon';

const MODES = ['walk', 'bike', 'drive', 'transit'];
// 未知方式（旧数据可能存了 walk/bike/drive/transit 之外的值）→ 兜底文案
const modeLabelKey = (mode) => (MODES.includes(mode) ? 'mode.' + mode : 'history.otherMode');

// 历史行程视图：搜索 + 方式筛选 + 按日期分组的行程列表 + 卡片内展开每一站
export default function HistoryView({ records }) {
  const { t, lang, formatDate } = useI18n();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [query, setQuery] = useState('');
  const [modeFilter, setModeFilter] = useState(null);
  const [expandedId, setExpandedId] = useState(null);

  const groups = useMemo(() => {
    let trips = groupTrips(records);
    const q = query.trim().toLowerCase();
    if (q) trips = trips.filter(t => t.records.some(r => (r.locationName || '').toLowerCase().includes(q)));
    if (modeFilter) trips = trips.filter(t => t.records.some(r => (r.mode || 'walk') === modeFilter));
    return groupTripsByDate(trips);
  }, [records, query, modeFilter]);

  return (
    <View>
      {/* 搜索框 */}
      <View style={styles.searchBox}>
        <Ionicons name="search" size={16} color={colors.ink3} />
        <TextInput
          style={styles.searchInput}
          value={query}
          onChangeText={setQuery}
          placeholder={t('history.searchPlaceholder')}
          placeholderTextColor={colors.ink3}
          returnKeyType="search"
        />
        {query ? (
          <TouchableOpacity onPress={() => setQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close-circle" size={16} color={colors.ink3} />
          </TouchableOpacity>
        ) : null}
      </View>

      {/* 方式筛选 */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
        <Chip label={t('history.all')} active={modeFilter === null} onPress={() => setModeFilter(null)} />
        {MODES.map(m => (
          <Chip key={m} label={t('mode.' + m)} active={modeFilter === m} onPress={() => setModeFilter(modeFilter === m ? null : m)} />
        ))}
      </ScrollView>

      {/* 行程列表（按日期分组，倒序） */}
      {groups.length === 0 ? (
        <Text style={styles.empty}>{records.length === 0 ? t('history.empty') : t('history.noMatch')}</Text>
      ) : (
        groups.map(({ ts, list }) => (
          <View key={ts} style={styles.dayGroup}>
            <Text style={styles.dateHeader}>{formatDate(new Date(ts))}</Text>
            {list.map(trip => {
              const expanded = expandedId === trip.tripId;
              const from = trip.route[0];
              const to = trip.route[trip.route.length - 1];
              const title = trip.route.length > 1 ? `${from} → ${to}` : from;
              const dur = trip.durationMs > 0 ? formatDuration(Math.round(trip.durationMs / 1000), lang) : '—';
              return (
                <TouchableOpacity key={trip.tripId} style={styles.tripCard} onPress={() => setExpandedId(expanded ? null : trip.tripId)} activeOpacity={0.7}>
                  <View style={styles.tripHead}>
                    <ModeIcon mode={trip.mode} size={16} color={colors.primaryStrong} />
                    <Text style={styles.tripTitle} numberOfLines={1}>{title}</Text>
                    <Text style={styles.tripDur}>{dur}</Text>
                  </View>
                  <View style={styles.tripMeta}>
                    <Text style={styles.tripMetaText}>{formatTime(trip.startTs)} · {t('history.stops', { n: trip.route.length })}</Text>
                    {trip.route.length > 2 ? (
                      <Text style={styles.tripMetaText}>{t('history.via', { n: trip.route.length - 2 })}</Text>
                    ) : null}
                  </View>
                  {expanded ? (
                    <View style={styles.detail}>
                      {trip.records.map((r, i) => (
                        <View key={r.id || i} style={styles.stopRow}>
                          <Text style={styles.stopTime}>{formatTime(r.timestamp)}</Text>
                          <View style={[styles.stopDot, i === 0 && styles.stopDotFirst]} />
                          <Text style={styles.stopPlace} numberOfLines={1}>
                            {isPlaceholderName(r.locationName) ? t('common.unnamed') : r.locationName}
                          </Text>
                          <Text style={styles.stopMode}>{t(modeLabelKey(r.mode || 'walk'))}</Text>
                        </View>
                      ))}
                    </View>
                  ) : null}
                </TouchableOpacity>
              );
            })}
          </View>
        ))
      )}
    </View>
  );
}

function Chip({ label, active, onPress }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <TouchableOpacity style={[styles.chip, active && styles.chipActive]} onPress={onPress} activeOpacity={0.7}>
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

const makeStyles = (colors) => StyleSheet.create({
  searchBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: colors.surface, borderRadius: radius.md, paddingHorizontal: 12,
    height: 44, marginBottom: 12, ...shadow.sm,
  },
  searchInput: { flex: 1, fontSize: 15, color: colors.ink },
  chipsRow: { flexDirection: 'row', gap: 8, paddingBottom: 14 },
  chip: {
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20,
    backgroundColor: colors.chip, borderWidth: 1, borderColor: colors.line,
  },
  chipActive: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
  chipText: { fontSize: 13, color: colors.ink2, fontWeight: '600' },
  chipTextActive: { color: colors.primaryStrong },
  empty: { textAlign: 'center', color: colors.ink3, fontSize: 13, paddingVertical: 40 },
  dayGroup: { marginBottom: 18 },
  dateHeader: { fontSize: 13, color: colors.ink2, fontWeight: '700', marginBottom: 8, marginLeft: 4 },
  tripCard: {
    backgroundColor: colors.surface, borderRadius: radius.lg, padding: 14, marginBottom: 10, ...shadow.sm,
  },
  tripHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  tripTitle: { flex: 1, fontSize: 15, color: colors.ink, fontWeight: '700' },
  tripDur: { fontSize: 15, color: colors.primaryStrong, fontWeight: '800' },
  tripMeta: { flexDirection: 'row', justifyContent: 'space-between', paddingLeft: 24 },
  tripMetaText: { fontSize: 12, color: colors.ink3 },
  detail: { marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.line },
  stopRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 5, gap: 8 },
  stopTime: { fontSize: 12, color: colors.ink3, width: 40, fontVariant: ['tabular-nums'] },
  stopDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.line, marginHorizontal: 4 },
  stopDotFirst: { backgroundColor: colors.primary },
  stopPlace: { flex: 1, fontSize: 14, color: colors.ink },
  stopMode: { fontSize: 12, color: colors.ink2 },
});
