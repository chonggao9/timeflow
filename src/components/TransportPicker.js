import React, { useMemo, useRef, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Animated } from 'react-native';
import { radius, shadow } from '../theme';
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

const ITEM_WIDTH = 72;
const ITEM_GAP = 9;

function TransportItem({ modeKey, selected, onSelect, label }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const scaleAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (selected) {
      Animated.sequence([
        Animated.spring(scaleAnim, { toValue: 1.07, friction: 4, tension: 150, useNativeDriver: true }),
        Animated.spring(scaleAnim, { toValue: 1, friction: 6, tension: 120, useNativeDriver: true }),
      ]).start();
    }
  }, [selected, scaleAnim]);

  return (
    <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
      <TouchableOpacity
        style={[
          styles.item,
          selected && styles.itemSelected,
        ]}
        onPress={() => onSelect(modeKey)}
        activeOpacity={0.7}
      >
        <View style={[styles.iconWrap, selected && styles.iconWrapSelected]}>
          <ModeIcon
            mode={modeKey}
            size={18}
            color={selected ? colors.primaryStrong : colors.ink2}
          />
        </View>
        <Text
          style={[styles.label, selected && styles.labelSelected]}
          numberOfLines={1}
        >
          {label}
        </Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

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
        {MODE_KEYS.map((key) => (
          <TransportItem
            key={key}
            modeKey={key}
            selected={selected === key}
            onSelect={onSelect}
            label={t(`mode.${key}`)}
          />
        ))}
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
    paddingVertical: 3,
  },
  item: {
    width: ITEM_WIDTH,
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1.2,
    borderColor: colors.line,
    ...shadow.sm,
  },
  itemSelected: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
    ...shadow.card,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.chip,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  iconWrapSelected: {
    backgroundColor: colors.surface,
  },
  label: {
    fontSize: 11,
    color: colors.ink2,
    fontWeight: '600',
  },
  labelSelected: {
    color: colors.primaryStrong,
    fontWeight: '700',
  },
});
