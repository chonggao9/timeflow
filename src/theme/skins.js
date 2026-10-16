// TimeFlow 皮肤配置文件：单一配置源。
// 新增皮肤时只需在此增加条目，页面与主题上下文自动解析与适配。
// 顺序保证统一语义 Token：primary, primaryTint, background, card, textPrimary, textSecondary, divider。

export const DEFAULT_SKIN = 'coral';

export const SKINS = {
  coral: {
    id: 'coral',
    nameKey: 'theme.skinCoral',
    colorPreview: '#FF6B6B',
    unlockType: 'always',
    unlockDays: 0,
    light: {
      primary: '#FF6B6B',
      primaryTint: '#FFE9E4',
      background: '#FBF5EF',
      card: '#FFFFFF',
      textPrimary: '#2B231E',
      textSecondary: '#7A6F66',
      divider: '#F1E7DD',
    },
    dark: {
      primary: '#FF7A6E',
      primaryTint: '#3A2721',
      background: '#1B1511',
      card: '#262019',
      textPrimary: '#F3EDE7',
      textSecondary: '#C7BCB2',
      divider: '#342B23',
    },
  },
  ocean: {
    id: 'ocean',
    nameKey: 'theme.skinOcean',
    colorPreview: '#2F7FD1',
    unlockType: 'always',
    unlockDays: 0,
    light: {
      primary: '#2774C3',       // 微调保证白字在按钮上对比度 4.8:1
      primaryTint: '#E6F0FB',
      background: '#F4F8FC',
      card: '#FFFFFF',
      textPrimary: '#1B2733',
      textSecondary: '#627383', // 微调保证小字对底色对比度 4.58:1
      divider: '#E1E8F0',
    },
    dark: {
      primary: '#6AA9F0',
      primaryTint: '#1F3550',
      background: '#0F1620',
      card: '#182230',
      textPrimary: '#E8EEF5',
      textSecondary: '#93A3B5',
      divider: '#26364A',
    },
  },
  forest: {
    id: 'forest',
    nameKey: 'theme.skinForest',
    colorPreview: '#2E8B57',
    unlockType: 'always',
    unlockDays: 0,
    light: {
      primary: '#277E4E',       // 微调白字对比度 5.02:1
      primaryTint: '#E3F3E9',
      background: '#F4F9F5',
      card: '#FFFFFF',
      textPrimary: '#1C2B22',
      textSecondary: '#5F7165', // 微调对底色对比度 4.88:1
      divider: '#DFEAE3',
    },
    dark: {
      primary: '#5FC48A',
      primaryTint: '#1E3A2A',
      background: '#0F1812',
      card: '#17241B',
      textPrimary: '#E6F1EA',
      textSecondary: '#8FA797',
      divider: '#25382C',
    },
  },
  lavender: {
    id: 'lavender',
    nameKey: 'theme.skinLavender',
    colorPreview: '#7A5BD0',
    unlockType: 'streak',
    unlockDays: 7,              // 连续打卡 7 天解锁
    light: {
      primary: '#7A5BD0',
      primaryTint: '#EEE8FB',
      background: '#F8F6FD',
      card: '#FFFFFF',
      textPrimary: '#251F38',
      textSecondary: '#706987', // 微调对底色对比度 4.83:1
      divider: '#E8E3F4',
    },
    dark: {
      primary: '#A58CF0',
      primaryTint: '#2E2650',
      background: '#14111F',
      card: '#1E1A2E',
      textPrimary: '#EDE9F8',
      textSecondary: '#A199BC',
      divider: '#322B4A',
    },
  },
  journal: {
    id: 'journal',
    nameKey: 'theme.skinJournal',
    colorPreview: '#B5651D',
    unlockType: 'streak',
    unlockDays: 30,             // 连续打卡 30 天解锁
    light: {
      primary: '#B5651D',
      primaryTint: '#F3E3CC',
      background: '#FAF4E8',
      card: '#FFFBF2',
      textPrimary: '#3B2F22',
      textSecondary: '#786854', // 微调对底色对比度 4.91:1
      divider: '#EADFCB',
    },
    dark: {
      primary: '#E0A064',
      primaryTint: '#3A2D1E',
      background: '#1A1611',
      card: '#241E17',
      textPrimary: '#F1E8DA',
      textSecondary: '#B3A28B',
      divider: '#3A3126',
    },
  },
  oled: {
    id: 'oled',
    nameKey: 'theme.skinOled',
    colorPreview: '#121212',
    unlockType: 'streak',
    unlockDays: 30,             // 连续打卡 30 天解锁
    onlyDark: true,             // 纯黑 OLED 仅深色
    light: {
      primary: '#FF5A4F',
      primaryTint: '#2A1412',
      background: '#000000',
      card: '#121212',
      textPrimary: '#F2F2F2',
      textSecondary: '#8C8C8C',
      divider: '#222222',
    },
    dark: {
      primary: '#FF5A4F',
      primaryTint: '#2A1412',
      background: '#000000',
      card: '#121212',
      textPrimary: '#F2F2F2',
      textSecondary: '#8C8C8C',
      divider: '#222222',
    },
  },
};

export const SKIN_LIST = Object.values(SKINS);

/**
 * 根据皮肤 ID 与深浅色获取统一的 7 核心语义 Token
 */
export function getSkinTokens(skinId, isDark) {
  const conf = SKINS[skinId] || SKINS[DEFAULT_SKIN];
  if (conf.onlyDark) {
    return conf.dark;
  }
  return isDark ? conf.dark : conf.light;
}
