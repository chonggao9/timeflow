// 极简柱状图（手画 react-native-svg）：细柱、无网格、无 Y 轴。
// 单色系透明度分级：高亮柱 100%，其余 25%。深浅主题自适应。
import React, { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Rect, Line, Text as SvgText } from 'react-native-svg';
import { useTheme } from '../../theme/ThemeContext';

export default function BarChart({
  data,           // number[]
  height = 120,
  highlightIndex, // 高亮柱下标（可空）
  color,          // 高亮色，默认 colors.primary
  xLabels = [],   // [{ index, text }] 稀疏刻度
  valueLabel,     // 高亮柱顶部标注（可空）
  bottomPad = 22, // 底部留白给刻度
}) {
  const { colors } = useTheme();
  const [width, setWidth] = useState(0);
  const c = color || colors.primary;

  const max = Math.max(...data, 1);
  const n = data.length;
  const padX = 6;
  const chartH = height - bottomPad;
  const slot = n ? (width - padX * 2) / n : 0;
  const barW = Math.max(2, Math.min(10, slot * 0.62));

  const bars = [];
  const texts = [];
  if (width > 0 && n) {
    for (let i = 0; i < n; i++) {
      const x = padX + i * slot + (slot - barW) / 2;
      const bh = (data[i] / max) * chartH;
      const y = chartH - bh;
      bars.push(
        <Rect key={i} x={x} y={y} width={barW} height={Math.max(bh, 1)} rx={2} fill={c} opacity={i === highlightIndex ? 1 : 0.25} />
      );
    }
    texts.push(<Line key="base" x1={padX} y1={chartH} x2={width - padX} y2={chartH} stroke={colors.line} strokeWidth={1} />);
    for (const { index, text } of xLabels) {
      if (index < 0 || index >= n) continue;
      texts.push(
        <SvgText key={`l${index}`} x={padX + index * slot + slot / 2} y={height - 6} fontSize={10} fill={colors.ink3} textAnchor="middle">{text}</SvgText>
      );
    }
    if (valueLabel != null && highlightIndex != null && highlightIndex >= 0 && highlightIndex < n) {
      const topY = chartH - (data[highlightIndex] / max) * chartH;
      const ly = Math.max(12, topY - 9);
      texts.push(
        <SvgText key="v" x={padX + highlightIndex * slot + slot / 2} y={ly} fontSize={11} fontWeight="700" fill={colors.primaryStrong} textAnchor="middle">{valueLabel}</SvgText>
      );
    }
  }

  return (
    <View style={styles.wrap} onLayout={e => setWidth(e.nativeEvent.layout.width)}>
      {width > 0 && <Svg width={width} height={height}>{bars}{texts}</Svg>}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%', alignSelf: 'stretch' },
});
