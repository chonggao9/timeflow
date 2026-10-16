// TimeFlow 设计令牌 —— 统一语义 Token + 多皮肤适配
import { getSkinTokens, DEFAULT_SKIN } from './theme/skins';

/**
 * 构造完整语义颜色字典（7个标准核心 Token + 向后兼容别名）
 */
export function createThemeColors(skinId = DEFAULT_SKIN, isDark = false) {
  const t = getSkinTokens(skinId, isDark);

  return {
    // 1. 标准统一 7 核心语义 Token
    primary: t.primary,
    primaryTint: t.primaryTint,
    background: t.background,
    card: t.card,
    textPrimary: t.textPrimary,
    textSecondary: t.textSecondary,
    divider: t.divider,

    // 2. 向后兼容现有页面的语义别名（完全映射到 7 Token）
    bg: t.background,
    surface: t.card,
    primarySoft: t.primaryTint,
    primarySofter: t.primaryTint,
    primaryStrong: isDark ? t.primary : t.primary,
    ink: t.textPrimary,
    ink2: t.textSecondary,
    ink3: isDark ? '#8F8276' : '#B6A99E',
    line: t.divider,
    line2: t.divider,
    past: isDark ? '#3A2F26' : '#E8D9CB',
    success: isDark ? '#5CC08F' : '#4CAE7F',
    danger: isDark ? '#F08A7A' : '#E08A7A',
    chip: isDark ? '#2B241D' : '#FAF6F1',
    scrim: isDark ? 'rgba(10,6,4,0.55)' : 'rgba(43,35,30,0.35)',

    // 3. 业务状态语义色（备份 V2 / 标签等）
    ok: isDark ? '#5CC08F' : '#25915F',
    okBg: isDark ? '#1E3227' : '#E5F4EA',
    warn: isDark ? '#E0A94E' : '#A96A0B',
    warnBg: isDark ? '#33291A' : '#FCF1D9',
    err: isDark ? '#F27D72' : '#CF3B3B',
    errBg: isDark ? '#3A2320' : '#FDE7E4',
    idle: isDark ? '#8F8276' : '#6F645C',
    idleBg: isDark ? '#2B241D' : '#EEE9E3',
    ico: isDark ? '#D3A87E' : '#9A6B4B',
    icoBg: isDark ? '#312821' : '#F6ECE2',
    info: isDark ? '#7FA8DC' : '#3B6DB5',
    infoBg: isDark ? '#22303F' : '#E7EFFB',
  };
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

export const shadow = {
  sm: {
    shadowColor: '#2B231E',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  card: {
    shadowColor: '#2B231E',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 3,
  },
  float: {
    shadowColor: '#2B231E',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 8,
  },
  primary: {
    shadowColor: '#FF6B6B',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 6,
  },
};
