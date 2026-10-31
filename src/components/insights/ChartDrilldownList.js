import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeContext';
import { useI18n } from '../../i18n/LanguageContext';
import { formatDuration, formatTime, isPlaceholderName } from '../../utils/stats';
import { getCategoryMeta } from '../../utils/focusCategories';
import ModeIcon from '../ModeIcon';
import { radius, shadow } from '../../theme';

export default function ChartDrilldownList({
  title,              // e.g. "10月30日 明细"
  items = [],         // 记录列表
  type = 'focus',     // 'focus' | 'travel'
  onClose,
  onPressItem,
}) {
  const { colors, isDark } = useTheme();
  const { t, lang } = useI18n();

  if (!items || items.length === 0) {
    return (
      <View style={[styles.container, { backgroundColor: colors.surface, borderColor: colors.line }]}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.ink }]}>{title || t('insights.drilldownTitle')}</Text>
          {onClose && (
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close" size={18} color={colors.ink3} />
            </TouchableOpacity>
          )}
        </View>
        <Text style={[styles.emptyText, { color: colors.ink3 }]}>{t('insights.drilldownEmpty')}</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.surface, borderColor: colors.line }]}>
      <View style={styles.header}>
        <View style={styles.titleArea}>
          <Text style={[styles.title, { color: colors.ink }]}>{title || t('insights.drilldownTitle')}</Text>
          <Text style={[styles.countBadge, { color: colors.primary, backgroundColor: isDark ? 'rgba(52, 199, 89, 0.15)' : 'rgba(52, 199, 89, 0.10)' }]}>
            {items.length}
          </Text>
        </View>
        {onClose && (
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close-circle" size={20} color={colors.ink3} />
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.list}>
        {items.map((item, idx) => {
          if (type === 'focus') {
            const cat = getCategoryMeta(item.category);
            const timeStr = item.startTime ? formatTime(item.startTime) : '';
            const durationMin = Math.round((item.duration || 0) / 60);
            const isPartial = Boolean(item.partial);

            return (
              <View
                key={item.id ? `focus-${item.id}` : `focus-idx-${idx}`}
                style={[
                  styles.itemRow,
                  idx < items.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.line },
                ]}
              >
                <View style={styles.itemLeft}>
                  <View style={[styles.catIconWrap, { backgroundColor: cat.color ? `${cat.color}20` : 'rgba(52, 199, 89, 0.15)' }]}>
                    <Text style={styles.catEmoji}>{cat.icon || '🍅'}</Text>
                  </View>
                  <View style={styles.itemMeta}>
                    <View style={styles.itemHeaderLine}>
                      <Text style={[styles.itemTitle, { color: colors.ink }]} numberOfLines={1}>
                        {item.taskName || t(cat.labelKey) || t('home.unnamedFocus')}
                      </Text>
                      {isPartial && (
                        <View style={[styles.partialTag, { backgroundColor: isDark ? 'rgba(255, 159, 10, 0.22)' : 'rgba(255, 149, 0, 0.15)' }]}>
                          <Text style={[styles.partialTagText, { color: isDark ? '#FF9F0A' : '#D97706' }]}>
                            {lang === 'en' ? 'Partial' : '提前结束'}
                          </Text>
                        </View>
                      )}
                    </View>
                    <Text style={[styles.itemSub, { color: colors.ink3 }]}>
                      {timeStr} · {t(cat.labelKey)}
                    </Text>
                  </View>
                </View>
                <Text style={[styles.durationText, { color: colors.ink }]}>
                  {durationMin} {t('common.minutes')}
                </Text>
              </View>
            );
          }

          // travel
          const isTrip = Array.isArray(item.records);
          const timeStr = item.timestamp
            ? formatTime(item.timestamp)
            : isTrip && item.startTime
            ? formatTime(item.startTime)
            : '';
          const name = isTrip
            ? `${item.fromName || t('common.unnamed')} → ${item.toName || t('common.unnamed')}`
            : item.locationName && !isPlaceholderName(item.locationName)
            ? item.locationName
            : t('common.unnamed');

          return (
            <TouchableOpacity
              key={item.id ? `trv-${item.id}` : `trv-idx-${idx}`}
              style={[
                styles.itemRow,
                idx < items.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.line },
              ]}
              disabled={!onPressItem}
              onPress={() => onPressItem && onPressItem(item)}
              activeOpacity={0.7}
            >
              <View style={styles.itemLeft}>
                <View style={[styles.modeWrap, { backgroundColor: colors.chip }]}>
                  <ModeIcon mode={item.mode || 'walk'} size={18} color={colors.primary} />
                </View>
                <View style={styles.itemMeta}>
                  <Text style={[styles.itemTitle, { color: colors.ink }]} numberOfLines={1}>
                    {name}
                  </Text>
                  <Text style={[styles.itemSub, { color: colors.ink3 }]}>
                    {timeStr}
                    {isTrip && item.duration ? ` · ${formatDuration(item.duration)}` : ''}
                  </Text>
                </View>
              </View>
              {onPressItem && (
                <Ionicons name="chevron-forward" size={16} color={colors.ink3} />
              )}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 16,
    marginVertical: 10,
    ...shadow.card,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  titleArea: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontSize: 14,
    fontWeight: '700',
  },
  countBadge: {
    fontSize: 11,
    fontWeight: '600',
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 10,
  },
  emptyText: {
    fontSize: 13,
    paddingVertical: 12,
    textAlign: 'center',
  },
  list: {
    gap: 2,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 9,
  },
  itemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 12,
    gap: 10,
  },
  catIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modeWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  catEmoji: {
    fontSize: 16,
  },
  itemMeta: {
    flex: 1,
    gap: 2,
  },
  itemHeaderLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  itemTitle: {
    fontSize: 13,
    fontWeight: '600',
    flexShrink: 1,
  },
  partialTag: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  partialTagText: {
    fontSize: 10,
    fontWeight: '600',
  },
  itemSub: {
    fontSize: 11,
  },
  durationText: {
    fontSize: 13,
    fontWeight: '600',
  },
});
