// 桌面小组件的最小语言字典 + 主题解析。
// widget 运行在 headless JS（可能脱离 React context），不能直接用 useI18n()/useTheme()，
// 故在这里从 AsyncStorage 读 timeflow_lang / timeflow_theme，自行选出文案与配色。
// 这是刻意精简的重复：不为一个小组件把整个 translations.js / theme 体系拖进 headless bundle。
import AsyncStorage from '@react-native-async-storage/async-storage';
import { lightColors, darkColors } from '../src/theme';

export const LANG_KEY = 'timeflow_lang';
export const THEME_KEY = 'timeflow_theme';

// 最小字典：widget 用到的文案。system-infer 逻辑与 LanguageContext.systemLang() 一致。
const STRINGS = {
  zh: {
    title: 'TimeFlow',
    checkedIn: '已打卡',
    notYet: '尚未打卡',
    latest: '最新',
    at: '${t}',
    placeEmpty: '未知地点',
    unnamed: '未命名地点',
    checkinBtn: '一 键 打 卡',
    count: '今日 ${n} 次',
    emptyPrompt: '今日旅程尚未开启',
    emptySub: '轻触下方按钮，记录今日首次打卡',
    recentPlace: '最近地点',
  },
  en: {
    title: 'TimeFlow',
    checkedIn: 'Checked in',
    notYet: 'Not started',
    latest: 'Latest',
    at: '${t}',
    placeEmpty: 'Unknown place',
    unnamed: 'Unnamed place',
    checkinBtn: 'Quick Check-In',
    count: '${n} today',
    emptyPrompt: 'Journey not started yet',
    emptySub: 'Tap below to record your first stop',
    recentPlace: 'Recent place',
  },
};

function inferLang() {
  // 与 i18n 的 systemLang() 保持同一回退逻辑：主要支持 zh/en，其它回退 en；
  // widget 场景无偏好时按用户语言显示，用 expo-localization 读系统语言（headless 可用）。
  try {
    const Localization = require('expo-localization');
    const code = Localization.getLocales?.()?.[0]?.languageCode;
    return code && code.toLowerCase().startsWith('zh') ? 'zh' : 'en';
  } catch (e) {
    return 'zh';
  }
}

// 读用户语言偏好：timeflow_lang 存了 zh/en 就照用，否则按系统语言推断
export async function getWidgetLang() {
  try {
    const saved = await AsyncStorage.getItem(LANG_KEY);
    return saved === 'zh' || saved === 'en' ? saved : inferLang();
  } catch (e) {
    return inferLang();
  }
}

function isDarkMode(mode, systemScheme) {
  if (mode === 'dark') return true;
  if (mode === 'light') return false;
  return systemScheme === 'dark';
}

// 主题：timeflow_theme（system/light/dark）→ 实际应是的深色布尔 + 配色板。
// 注意 widget 无 useColorScheme()，无法实时跟随系统切换，只能取当前系统深浅色。
// 这里用 RN 的 Appearance（headless 下可用）读取系统色。
export async function getWidgetTheme() {
  let mode = 'system';
  try {
    const saved = await AsyncStorage.getItem(THEME_KEY);
    if (saved === 'light' || saved === 'dark') mode = saved;
  } catch (e) {
    /* 默认 system */
  }
  let systemScheme = 'light';
  try {
    const { Appearance } = require('react-native');
    systemScheme = Appearance?.getColorScheme?.() ?? 'light';
  } catch (e) {
    /* 默认 light */
  }
  const isDark = isDarkMode(mode, systemScheme);
  return { isDark, colors: isDark ? darkColors : lightColors };
}

export function fmtTime(ts) {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

export function makeStrings(lang) {
  return STRINGS[lang] || STRINGS.zh;
}
