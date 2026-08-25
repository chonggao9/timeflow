import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme';

// 出行方式 → 矢量图标
const ICONS = {
  walk: 'walk',
  bike: 'bicycle',
  drive: 'car',
  transit: 'bus',
  unknown: 'ellipse',
};

export default function ModeIcon({ mode, size = 20, color = colors.primaryStrong }) {
  return <Ionicons name={ICONS[mode] || ICONS.unknown} size={size} color={color} />;
}

export const MODE_ICON_NAME = ICONS;
