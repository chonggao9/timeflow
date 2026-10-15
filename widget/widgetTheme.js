// 桌面小组件 V2 专用配色（docs/design/timeflow-widgets-v2-ui.html §5）。
// 与 App 的 src/theme.js token 刻意分离：设计稿组件配色与 App 内不一致（如浅色背景
// #FFFDFA vs #FBF5EF），组件以设计稿为准，不动 App token。
// 纯数据模块：不碰 AsyncStorage/Appearance（深浅判定由 widgetStrings.getWidgetTheme 提供 isDark）。

export const RADIUS_WIDGET = 28; // 组件圆角 28dp；按钮/chip 为胶囊形（999）
export const RADIUS_PILL = 999;

const BASE = {
  light: {
    bg: '#FFFDFA',
    textPrimary: '#2A211B',
    textSecondary: '#6B5B50',
    track: '#F3E6DA',
    btnSecondary: '#F6EEE6',
    white: '#FFFFFF',
  },
  dark: {
    bg: '#241D19',
    textPrimary: '#FBEFE4',
    textSecondary: '#D9C9BA',
    track: '#3A302A',
    btnSecondary: '#3A302A',
    white: '#FFFFFF',
  },
};

// 模式状态色（prompt §5 表）：primary 主色 / btn 按钮深色 / text 文字色 / soft 浅底 / darkAccent 深色主题用色
// 对比度微调（验收要求 ≥4.5:1，scripts/test_widget_pure.js 有门禁）：
// - 长休按钮 #B06A0C 对白字仅 4.27:1 → #A5620B（4.83:1，视觉几乎一致）；
// - 短休浅色 chip 文字 #17805A 对 #DCF3E8 仅 4.22:1 → textLight #147A52（4.58:1）；
//   按钮底仍用设计稿原色 #17805A（对白字 4.92:1 达标）。
const MODE_COLORS = {
  focus: { primary: '#EE5A4F', btn: '#D63B32', text: '#C23128', soft: '#FDE6E1', darkAccent: '#FF7A6E' },
  short: { primary: '#2DB37C', btn: '#17805A', text: '#17805A', textLight: '#147A52', soft: '#DCF3E8', darkAccent: '#4FD6A0' },
  long: { primary: '#F0A030', btn: '#A5620B', text: '#8F5608', soft: '#FBEACB', darkAccent: '#F5B85A' },
};

// 行程打卡统一绿色
const TRIP_COLORS = { primary: '#2DB37C', btn: '#17805A', soft: '#DCF3E8', darkAccent: '#4FD6A0' };

export function basePalette(isDark) {
  return isDark ? BASE.dark : BASE.light;
}

// 组件语义配色统一出口：pal = basePalette + accent（当前模式/行程主色）+ btn/btnText/chipBg/chipText
export function modePalette(mode, isDark) {
  const base = basePalette(isDark);
  const m = MODE_COLORS[mode] || MODE_COLORS.focus;
  const accent = isDark ? m.darkAccent : m.primary;
  return {
    ...base,
    accent,
    btn: isDark ? m.darkAccent : m.btn, // 深色主题按钮用亮色，文字用深色底
    btnText: isDark ? '#241D19' : base.white, // 白字按钮底色 #D63B32/#17805A/#B06A0C 均 ≥4.5:1
    chipBg: isDark ? base.track : m.soft,
    chipText: isDark ? m.darkAccent : (m.textLight || m.text),
    track: base.track,
  };
}

export function tripPalette(isDark) {
  const base = basePalette(isDark);
  return {
    ...base,
    accent: isDark ? TRIP_COLORS.darkAccent : TRIP_COLORS.primary,
    btn: isDark ? TRIP_COLORS.darkAccent : TRIP_COLORS.btn,
    btnText: isDark ? '#241D19' : base.white,
    chipBg: isDark ? base.track : TRIP_COLORS.soft,
    chipText: isDark ? TRIP_COLORS.darkAccent : '#17805A',
  };
}
