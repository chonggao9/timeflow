// 现代流体柱状图：渐变填充、圆角胶囊柱体、自适应高亮徽标。
import React, { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Rect, Line, Text as SvgText, Defs, LinearGradient, Stop } from 'react-native-svg';
import { useTheme } from '../../theme/ThemeContext';

export default function BarChart({
  data,           // number[]
  height = 125,
  highlightIndex, // 高亮柱下标（可空）
  color,          // 高亮色，默认 colors.primary
  xLabels = [],   // [{ index, text }] 稀疏刻度
  valueLabel,     // 高亮柱顶部标注（可空）
  bottomPad = 24, // 底部留白给刻度
}) {
  const { colors } = useTheme();
  const [width, setWidth] = useState(0);
  const c = color || colors.primary;

  const max = Math.max(...data, 1);
  const n = data.length;
  const padX = 8;
  const chartH = height - bottomPad;
  const slot = n ? (width - padX * 2) / n : 0;
  const barW = Math.max(3, Math.min(12, slot * 0.65));
  const barRadius = barW / 2;

  const defs = (
    <Defs key="defs">
      <LinearGradient id="barGradHot" x1="0" y1="0" x2="0" y2="1">
        <Stop offset="0" stopColor={colors.primaryStrong} stopOpacity="1" />
        <Stop offset="1" stopColor={c} stopOpacity="0.85" />
      </LinearGradient>
      <LinearGradient id="barGradMuted" x1="0" y1="0" x2="0" y2="1">
        <Stop offset="0" stopColor={colors.ink3} stopOpacity="0.38" />
        <Stop offset="1" stopColor={colors.ink3} stopOpacity="0.15" />
      </LinearGradient>
    </Defs>
  );

  const bars = [];
  const texts = [];
  if (width > 0 && n) {
    for (let i = 0; i < n; i++) {
      const x = padX + i * slot + (slot - barW) / 2;
      const val = data[i] || 0;
      const bh = Math.max((val / max) * (chartH - 18), 3); // 留出顶部徽标空间
      const y = chartH - bh;
      const isHot = i === highlightIndex;
      bars.push(
        <Rect
          key={`bar-${i}`}
          x={x}
          y={y}
          width={barW}
          height={bh}
          rx={barRadius}
          ry={barRadius}
          fill={isHot ? 'url(#barGradHot)' : 'url(#barGradMuted)'}
        />
      );
    }

    // 基准底线
    texts.push(
      <Line
        key="base"
        x1={padX}
        y1={chartH}
        x2={width - padX}
        y2={chartH}
        stroke={colors.line}
        strokeWidth={1}
      />
    );

    // X轴文字
    for (const { index, text } of xLabels) {
      if (index < 0 || index >= n) continue;
      texts.push(
        <SvgText
          key={`l${index}`}
          x={padX + index * slot + slot / 2}
          y={height - 6}
          fontSize={10}
          fontWeight="500"
          fill={colors.ink2}
          textAnchor="middle"
        >
          {text}
        </SvgText>
      );
    }

    // 高亮数值徽标胶囊
    if (valueLabel != null && highlightIndex != null && highlightIndex >= 0 && highlightIndex < n) {
      const val = data[highlightIndex] || 0;
      const bh = Math.max((val / max) * (chartH - 18), 3);
      const topY = chartH - bh;
      const badgeY = Math.max(12, topY - 14);
      const centerX = padX + highlightIndex * slot + slot / 2;
      const labelStr = String(valueLabel);
      const pillW = Math.max(34, labelStr.length * 8 + 12);
      const pillH = 17;

      texts.push(
        <Rect
          key="val-pill"
          x={centerX - pillW / 2}
          y={badgeY - pillH + 4}
          width={pillW}
          height={pillH}
          rx={pillH / 2}
          fill={colors.primarySoft}
        />
      );
      texts.push(
        <SvgText
          key="val-text"
          x={centerX}
          y={badgeY}
          fontSize={10}
          fontWeight="700"
          fill={colors.primaryStrong}
          textAnchor="middle"
        >
          {labelStr}
        </SvgText>
      );
    }
  }

  return (
    <View style={styles.wrap} onLayout={e => setWidth(e.nativeEvent.layout.width)}>
      {width > 0 && (
        <Svg width={width} height={height}>
          {defs}
          {bars}
          {texts}
        </Svg>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%', alignSelf: 'stretch' },
});
