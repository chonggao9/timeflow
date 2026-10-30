import React from 'react';
import Svg, { Ellipse, Path } from 'react-native-svg';

export default function TomatoVisual({
  fillColor = '#8DB255',
  showCheckmark = false,
}) {
  return (
    <Svg width="100%" height="100%" viewBox="0 0 240 240">
      {/* 底部微投影 */}
      <Ellipse cx={120} cy={226} rx={70} ry={8} fill="#2B211C" opacity={0.08} />
      {/* 番茄椭圆主体 */}
      <Ellipse cx={120} cy={138} rx={94} ry={86} fill={fillColor} />
      {/* 左上角半透明高光 */}
      <Ellipse
        cx={82}
        cy={108}
        rx={22}
        ry={12}
        fill="#FFFFFF"
        opacity={0.28}
        transform="rotate(-30 82 108)"
      />
      {/* 顶部叶片 */}
      <Path
        d="M120 62 C108 66 88 62 74 74 C92 76 104 82 120 84 C136 82 148 76 166 74 C152 62 132 66 120 62 Z"
        fill="#4E8F4A"
      />
      {/* 茎 */}
      <Path
        d="M120 64 C120 50 124 42 132 36"
        stroke="#3E7A3C"
        strokeWidth={7}
        strokeLinecap="round"
        fill="none"
      />
      {/* 收获态中心白色对勾 */}
      {showCheckmark && (
        <Path
          d="M86 140l24 24 44-50"
          stroke="#FFFFFF"
          strokeWidth={12}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      )}
    </Svg>
  );
}
