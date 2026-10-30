// TimeFlow 设计令牌 —— 统一语义 Token + 多皮肤适配
import { getSkinTokens, DEFAULT_SKIN } from './theme/skins';

function hexToRgb(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map(x => {
    const h = Math.round(Math.max(0, Math.min(255, x))).toString(16);
    return h.length === 1 ? '0' + h : h;
  }).join('').toUpperCase();
}

function mix(hexA, hexB, weight = 0.5) {
  try {
    const [r1, g1, b1] = hexToRgb(hexA);
    const [r2, g2, b2] = hexToRgb(hexB);
    return rgbToHex(
      r1 * weight + r2 * (1 - weight),
      g1 * weight + g2 * (1 - weight),
      b1 * weight + b2 * (1 - weight)
    );
  } catch (e) {
    return hexA;
  }
}

export function makeShadows(colors, isDark = false) {
  const baseColor = isDark ? '#000000' : (colors?.textPrimary || '#121212');
  const priColor = colors?.primary || '#E5484D';
  return {
    sm: {
      shadowColor: baseColor,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: isDark ? 0.28 : 0.05,
      shadowRadius: 4,
      elevation: 2,
    },
    md: {
      shadowColor: baseColor,
      shadowOffset: { width: 0, height: 3 },
      shadowOpacity: isDark ? 0.32 : 0.06,
      shadowRadius: 6,
      elevation: 3,
    },
    card: {
      shadowColor: baseColor,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: isDark ? 0.35 : 0.06,
      shadowRadius: 10,
      elevation: 3,
    },
    lg: {
      shadowColor: baseColor,
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: isDark ? 0.4 : 0.08,
      shadowRadius: 12,
      elevation: 5,
    },
    float: {
      shadowColor: baseColor,
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: isDark ? 0.45 : 0.12,
      shadowRadius: 16,
      elevation: 8,
    },
    primary: {
      shadowColor: priColor,
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: isDark ? 0.45 : 0.32,
      shadowRadius: 14,
      elevation: 6,
    },
  };
}

/**
 * 构造完整语义颜色字典（10个标准核心 Token + 派生别名）
 */
export function createThemeColors(skinId = DEFAULT_SKIN, isDark = false) {
  const t = getSkinTokens(skinId, isDark);

  // 基于当前皮肤派生次级/背景辅助色，彻底消除不同皮肤下的暖棕残留
  const derivedInk3 = mix(t.textSecondary, t.card, 0.45);
  const derivedPast = mix(t.divider, t.textSecondary, 0.7);
  const derivedChip = mix(t.primaryTint, t.card, 0.4);
  const derivedIdleBg = mix(t.divider, t.card, 0.6);

  const colors = {
    // 1. 标准统一核心语义 Token
    primary: t.primary,
    primary2: t.primary2,
    primaryStrong: t.primaryStrong,
    primaryTint: t.primaryTint,
    background: t.background,
    card: t.card,
    textPrimary: t.textPrimary,
    textSecondary: t.textSecondary,
    divider: t.divider,
    accent: t.accent,
    onPrimary: t.onPrimary,

    // 2. 向后兼容现有页面的语义别名（完全由皮肤 Token 派生）
    bg: t.background,
    surface: t.card,
    primarySoft: t.primaryTint,
    primarySofter: t.primaryTint,
    ink: t.textPrimary,
    ink2: t.textSecondary,
    ink3: derivedInk3,
    line: t.divider,
    line2: t.divider,
    past: derivedPast,
    chip: derivedChip,
    scrim: isDark ? 'rgba(0,0,0,0.7)' : 'rgba(15,20,25,0.36)',

    // 3. 业务状态语义色（保持固定，不随皮肤漂移）
    success: isDark ? '#5CC08F' : '#4CAE7F',
    danger: isDark ? '#F08A7A' : '#E08A7A',
    ok: isDark ? '#5CC08F' : '#25915F',
    okBg: isDark ? '#1E3227' : '#E5F4EA',
    warn: isDark ? '#E0A94E' : '#A96A0B',
    warnBg: isDark ? '#33291A' : '#FCF1D9',
    err: isDark ? '#F27D72' : '#CF3B3B',
    errBg: isDark ? '#3A2320' : '#FDE7E4',
    idle: t.textSecondary,
    idleBg: derivedIdleBg,
    ico: t.primary,
    icoBg: t.primaryTint,
    info: isDark ? '#7FA8DC' : '#3B6DB5',
    infoBg: isDark ? '#22303F' : '#E7EFFB',
  };

  colors.shadow = makeShadows(colors, isDark);
  return colors;
}

// 默认浅色/深色色板导出（保证静态引用不中断）
export const lightColors = createThemeColors(DEFAULT_SKIN, false);
export const darkColors = createThemeColors(DEFAULT_SKIN, true);

export const radius = {
  xl: 28,
  lg: 22,
  md: 16,
  sm: 12,
  xs: 8,
};

export const shadow = makeShadows(lightColors, false);
