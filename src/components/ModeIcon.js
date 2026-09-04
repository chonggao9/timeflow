import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeContext';

// 出行方式 → 矢量图标（共 9 类覆盖城市日常与城际差旅）
const ICONS = {
  walk: 'walk',
  bike: 'bicycle',
  drive: 'car',
  taxi: 'car-sport',
  subway: 'subway',
  transit: 'bus',
  train: 'train',
  flight: 'airplane',
  boat: 'boat',
  unknown: 'ellipse',
};

export default function ModeIcon({ mode, size = 20, color }) {
  const { colors } = useTheme();
  return <Ionicons name={ICONS[mode] || ICONS.unknown} size={size} color={color || colors.primaryStrong} />;
}

export const MODE_ICON_NAME = ICONS;
