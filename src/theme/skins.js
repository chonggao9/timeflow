// TimeFlow 皮肤配置文件：单一配置源。
// 3 套精选皮肤：coral (珊瑚, 默认)、lagoon (海盐)、lavender (薰衣草)。
// 顺序保证统一语义 Token：primary, primary2, primaryStrong, primaryTint, background, card, textPrimary, textSecondary, divider, accent, onPrimary。

export const DEFAULT_SKIN = 'coral';

export const SKINS = {
  coral: {
    id: 'coral',
    nameKey: 'theme.skinCoral',
    colorPreview: '#E5484D',
    light: {
      primary: '#E5484D',
      primary2: '#EE6350',
      primaryStrong: '#CE3439',
      primaryTint: '#FFE4DC',
      background: '#FFF5EC',
      card: '#FFFCF8',
      textPrimary: '#2B1D1A',
      textSecondary: '#7D6A62',
      divider: '#F3DFD2',
      accent: '#FFA63D',
      onPrimary: '#FFFFFF',
    },
    dark: {
      primary: '#FF7A6E',
      primary2: '#FF9A6B',
      primaryStrong: '#FF7A6E',
      primaryTint: '#3D2420',
      background: '#1A1210',
      card: '#271B18',
      textPrimary: '#FBEFE8',
      textSecondary: '#CDB8AD',
      divider: '#3A2924',
      accent: '#FFC15E',
      onPrimary: '#2A1210',
    },
  },
  lagoon: {
    id: 'lagoon',
    nameKey: 'theme.skinLagoon',
    colorPreview: '#0B8A87',
    light: {
      primary: '#0B8A87',
      primary2: '#1FA394',
      primaryStrong: '#08706E',
      primaryTint: '#D9F2EE',
      background: '#EEF9F6',
      card: '#FBFFFE',
      textPrimary: '#12302F',
      textSecondary: '#587371',
      divider: '#D3EAE5',
      accent: '#FF8A5B',
      onPrimary: '#FFFFFF',
    },
    dark: {
      primary: '#3FD0C6',
      primary2: '#62E0A8',
      primaryStrong: '#3FD0C6',
      primaryTint: '#12342F',
      background: '#0B1819',
      card: '#12262A',
      textPrimary: '#E6F7F4',
      textSecondary: '#9BBDBA',
      divider: '#1E3A3C',
      accent: '#FF9D78',
      onPrimary: '#06201F',
    },
  },
  lavender: {
    id: 'lavender',
    nameKey: 'theme.skinLavender',
    colorPreview: '#7A5BD0',
    light: {
      primary: '#7A5BD0',
      primary2: '#9A6BDF',
      primaryStrong: '#6E4EC2',
      primaryTint: '#ECE5FC',
      background: '#F7F3FF',
      card: '#FFFFFF',
      textPrimary: '#251F38',
      textSecondary: '#6E6788',
      divider: '#E6DEF7',
      accent: '#FF7FA8',
      onPrimary: '#FFFFFF',
    },
    dark: {
      primary: '#B49CFF',
      primary2: '#D0A4FF',
      primaryStrong: '#B49CFF',
      primaryTint: '#2E2650',
      background: '#130F20',
      card: '#1E1A2E',
      textPrimary: '#EEEAFA',
      textSecondary: '#A9A1C4',
      divider: '#322B4A',
      accent: '#FF9BBE',
      onPrimary: '#1B1233',
    },
  },
};

export const SKIN_LIST = Object.values(SKINS);

/**
 * 根据皮肤 ID 与深浅色获取统一的核心语义 Token
 */
export function getSkinTokens(skinId, isDark) {
  const conf = SKINS[skinId] || SKINS[DEFAULT_SKIN];
  return isDark ? conf.dark : conf.light;
}
