import React, { useMemo, useRef, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { useI18n } from '../i18n/LanguageContext';
import ModeIcon from './ModeIcon';

export const MODE_KEYS = [
  'walk',    // 步行
  'bike',    // 骑行
  'drive',   // 自驾
  'taxi',    // 打车
  'subway',  // 地铁
  'transit', // 公交
  'train',   // 高铁
  'flight',  // 飞机
  'boat',    // 轮渡
];

const ITEM_WIDTH = 70;
const ITEM_GAP = 8;

export default function TransportPicker({ selected, onSelect }) {
  const { t } = useI18n();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const scrollRef = useRef(null);

  // 记住并自动滚动聚焦到选中的出行方式
  useEffect(() => {
    if (!selected || !scrollRef.current) return;
    const index = MODE_KEYS.indexOf(selected);
    if (index >= 0) {
      // 简单平滑滚动：使其尽量居中可见
      const targetX = Math.max(0, index * (ITEM_WIDTH + ITEM_GAP) - (ITEM_WIDTH + ITEM_GAP));
      scrollRef.current.scrollTo({ x: targetX, animated: true });
    }
  }, [selected]);

  return (
    <View style={styles.container}>
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {MODE_KEYS.map((key) => {
          const on = selected === key;
          return (
            <TouchableOpacity
              key={key}
              style={[styles.item, on && styles.itemSelected]}
              onPress={() => onSelect(key)}
              activeOpacity={0.7}
            >
              <View style={styles.iconWrap}>
                <ModeIcon mode={key} size={20} color={on ? colors.primaryStrong : colors.ink2} />
              </View>
              <Text style={[styles.label, on && styles.labelSelected]} numberOfLines={1}>
                {t(`mode.${key}`)}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const makeStyles = (colors) => StyleSheet.create({
  container: {
    marginHorizontal: -16, // 让横向滑动边缘贴近屏幕两端，视野更开阔
  },
  scrollContent: {
    flexDirection: 'row',
    gap: ITEM_GAP,
    paddingHorizontal: 16,
    paddingVertical: 2,
  },
  item: {
    width: ITEM_WIDTH,
    alignItems: 'center',
    paddingVertical: 9,
    paddingHorizontal: 4,
    borderRadius: 14,
    backgroundColor: colors.chip,
    borderWidth: 1.5,
    borderColor: colors.line,
  },
  itemSelected: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
  },
  iconWrap: { height: 24, justifyContent: 'center' },
  label: { fontSize: 11, color: colors.ink2, fontWeight: '600', marginTop: 3 },
  labelSelected: { color: colors.primaryStrong },
});
