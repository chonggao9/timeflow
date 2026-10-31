import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useTheme } from '../../theme/ThemeContext';
import { useI18n } from '../../i18n/LanguageContext';
import { radius, shadow } from '../../theme';

export default function CalendarHeatmap({
  data,               // { days: [ [ { dateStr, dayOfMonth, isCurrentMonth, isToday, level, value, records } ] ], maxVal }
  selectedDateStr,    // string 'YYYY-MM-DD' | null
  onSelectDay,        // (dayObj) => void
  type = 'focus',     // 'focus' (分钟) | 'travel' (打卡数)
}) {
  const { colors, isDark } = useTheme();
  const { t, lang } = useI18n();

  const daysGrid = data?.days || data?.rows || [];
  if (daysGrid.length === 0) {
    return null;
  }

  const weekHeaders = lang === 'en'
    ? ['M', 'T', 'W', 'T', 'F', 'S', 'S']
    : ['一', '二', '三', '四', '五', '六', '日'];

  // 根据 level 和主题色计算格子背景
  const getCellBg = (level, isCurrentMonth) => {
    if (!isCurrentMonth) {
      return isDark ? 'rgba(255, 255, 255, 0.03)' : 'rgba(0, 0, 0, 0.03)';
    }
    if (level === 0) {
      return isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.05)';
    }
    if (level === 1) return isDark ? 'rgba(52, 199, 89, 0.28)' : 'rgba(52, 199, 89, 0.24)';
    if (level === 2) return isDark ? 'rgba(52, 199, 89, 0.50)' : 'rgba(52, 199, 89, 0.45)';
    if (level === 3) return isDark ? 'rgba(52, 199, 89, 0.75)' : 'rgba(52, 199, 89, 0.70)';
    return colors.primary; // level 4
  };

  const getCellTextColor = (level, isCurrentMonth, isSelected) => {
    if (isSelected) return colors.card;
    if (!isCurrentMonth) return colors.ink3;
    if (level >= 3) return '#FFFFFF';
    return colors.ink;
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.surface, borderColor: colors.line }]}>
      {/* 星期表头 */}
      <View style={styles.headerRow}>
        {weekHeaders.map((header, idx) => (
          <View key={`header-${idx}`} style={styles.headerCell}>
            <Text style={[styles.headerText, { color: colors.ink3 }]}>{header}</Text>
          </View>
        ))}
      </View>

      {/* 日历格子矩阵 */}
      <View style={styles.grid}>
        {daysGrid.map((week, wIdx) => (
          <View key={`week-${wIdx}`} style={styles.weekRow}>
            {week.map((day) => {
              const isSelected = selectedDateStr === day.dateStr;
              const bg = isSelected ? colors.primaryStrong : getCellBg(day.level, day.isCurrentMonth);
              const txtColor = getCellTextColor(day.level, day.isCurrentMonth, isSelected);

              return (
                <TouchableOpacity
                  key={day.dateStr}
                  style={[
                    styles.dayCell,
                    { backgroundColor: bg },
                    day.isToday && !isSelected && {
                      borderWidth: 1.5,
                      borderColor: colors.primary,
                    },
                    isSelected && {
                      borderWidth: 2,
                      borderColor: colors.card,
                      elevation: 4,
                      shadowColor: colors.primaryStrong,
                      shadowOffset: { width: 0, height: 2 },
                      shadowOpacity: 0.35,
                      shadowRadius: 4,
                    },
                  ]}
                  activeOpacity={0.7}
                  onPress={() => onSelectDay && onSelectDay(day)}
                >
                  <Text style={[styles.dayText, { color: txtColor, fontWeight: day.isToday || isSelected ? '700' : '500' }]}>
                    {day.dayOfMonth}
                  </Text>
                  {day.value > 0 && day.isCurrentMonth && (
                    <View
                      style={[
                        styles.dot,
                        {
                          backgroundColor: isSelected
                            ? colors.card
                            : day.level >= 3
                            ? '#FFFFFF'
                            : colors.primary,
                        },
                      ]}
                    />
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        ))}
      </View>

      {/* 底部图例 */}
      <View style={styles.legendRow}>
        <Text style={[styles.legendLabel, { color: colors.ink3 }]}>
          {type === 'focus' ? t('insights.heatmapMin') : t('insights.heatmapTripsMin')}
        </Text>
        <View style={styles.legendBoxes}>
          {[0, 1, 2, 3, 4].map((lvl) => (
            <View
              key={`legend-${lvl}`}
              style={[
                styles.legendBox,
                { backgroundColor: getCellBg(lvl, true) },
              ]}
            />
          ))}
        </View>
        <Text style={[styles.legendLabel, { color: colors.ink3 }]}>
          {type === 'focus' ? t('insights.heatmapMax') : t('insights.heatmapTripsMax')}
        </Text>
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
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  headerCell: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: {
    fontSize: 12,
    fontWeight: '600',
  },
  grid: {
    gap: 6,
  },
  weekRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 6,
  },
  dayCell: {
    flex: 1,
    aspectRatio: 1,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  dayText: {
    fontSize: 12,
  },
  dot: {
    width: 3.5,
    height: 3.5,
    borderRadius: 2,
    position: 'absolute',
    bottom: 3,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginTop: 12,
    paddingTop: 8,
    gap: 8,
  },
  legendBoxes: {
    flexDirection: 'row',
    gap: 4,
  },
  legendBox: {
    width: 11,
    height: 11,
    borderRadius: 2.5,
  },
  legendLabel: {
    fontSize: 10,
  },
});
