// 桌面小组件 V2 的最小语言字典 + 主题解析。
// widget 运行在 headless JS（可能脱离 React context），不能直接用 useI18n()/useTheme()，
// 故在这里从 AsyncStorage 读 timeflow_lang / timeflow_theme，自行选出文案与深浅色。
// 这是刻意精简的重复：不为小组件把整个 translations.js / theme 体系拖进 headless bundle。
// V2：组件内不用 emoji（图标全矢量，widget/svg.js）；配色改由 widget/widgetTheme.js 提供，
// 本模块只负责判定 isDark。
import AsyncStorage from '@react-native-async-storage/async-storage';

export const LANG_KEY = 'timeflow_lang';
export const THEME_KEY = 'timeflow_theme';

// 最小字典：widget 用到的文案（与 src/i18n/translations.js 的 widget.* 保持语义对齐）。
// 占位符统一 {n}/{t}，由组件侧 replace 填充。
const STRINGS = {
  zh: {
    title: 'TimeFlow',
    minUnit: '分',
    // 番茄专注
    mode: { focus: '专注', short: '短休', long: '长休' },
    status: { idle: '待开始', focusing: '专注中', resting: '休息中', paused: '已暂停' },
    play: { start: '开始', pause: '暂停', resume: '继续' },
    pomoTitle: { focus: '深度工作', short: '小憩一下', long: '好好休息' },
    endWord: '结束',
    endsAt: '{t} 结束',
    nthTomato: '第 {n} 个番茄',
    nthWithEnd: '第 {n} 个 · {t} 结束',
    restDone: '已完成 {n} 个',
    // 行程打卡
    todayTrip: '今日行程',
    timesCount: '{n} 次',
    checkinWord: '打卡',
    justChecked: '已打卡 {t}',
    emptyTimeline: '今天还没有打卡记录',
    emptyCtaSub: '轻触记录今日行程',
    unnamed: '未命名地点',
    openAppHint: '打开 App 完善位置',
    needLocationPerm: '需要位置权限',
    openApp: '打开 App',
    // 旧组件过渡卡
    upgradedTitle: '小组件已升级',
    upgradedBody: '请移除本卡片，重新添加新版「番茄专注 / 行程打卡」小组件',
    upgradedBtn: '查看说明',
    // 错误态
    refresh: '点击刷新',
    // 结束通知（headless 排期用，与 notifications.js 默认文案一致）
    notif: {
      focusTitle: '收获一颗番茄',
      focusBody: '番茄钟时间到了，快来查看你的收获吧',
      restTitle: '休息结束',
      restBody: '休息好了，开始下一个番茄吧',
    },
    weekdays: ['日', '一', '二', '三', '四', '五', '六'],
    weekdayPrefix: '周',
  },
  en: {
    title: 'TimeFlow',
    minUnit: 'm',
    mode: { focus: 'Focus', short: 'Short', long: 'Long' },
    status: { idle: 'Ready', focusing: 'Focusing', resting: 'Resting', paused: 'Paused' },
    play: { start: 'Start', pause: 'Pause', resume: 'Resume' },
    pomoTitle: { focus: 'Deep Work', short: 'Short Break', long: 'Long Break' },
    endWord: 'end',
    endsAt: 'Ends {t}',
    nthTomato: 'Pomodoro #{n}',
    nthWithEnd: '#{n} · ends {t}',
    restDone: '{n} done',
    todayTrip: "Today's Trip",
    timesCount: '{n} stops',
    checkinWord: 'Check In',
    justChecked: 'Checked {t}',
    emptyTimeline: 'No check-ins yet today',
    emptyCtaSub: 'Tap to record your trip',
    unnamed: 'Unnamed place',
    openAppHint: 'Open app to refine location',
    needLocationPerm: 'Location permission needed',
    openApp: 'Open App',
    upgradedTitle: 'Widget upgraded',
    upgradedBody: 'Remove this card and add the new Pomodoro / Trip widgets',
    upgradedBtn: 'Learn how',
    refresh: 'Tap to refresh',
    notif: {
      focusTitle: 'Pomodoro complete',
      focusBody: 'Time is up — open TimeFlow to harvest your focus session',
      restTitle: 'Break is over',
      restBody: 'Ready? Start your next pomodoro',
    },
    weekdays: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
    weekdayPrefix: '',
  },
};

// 结束通知文案（按模式取），供 headless 排期通知使用
export function makeNotifTexts(strings, mode) {
  const n = (strings && strings.notif) || {};
  return mode === 'focus'
    ? { title: n.focusTitle, body: n.focusBody }
    : { title: n.restTitle, body: n.restBody };
}

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

// 主题：timeflow_theme（system/light/dark）→ 深色布尔。
// widget 无法实时跟随系统切换，取渲染时刻的系统深浅色（Appearance，headless 可用）。
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
  return { isDark: isDarkMode(mode, systemScheme) };
}

export function fmtTime(ts) {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

// 周几短标签：zh → 周三；en → Wed
export function fmtWeekday(strings, ts) {
  const d = new Date(ts).getDay();
  const w = (strings.weekdays || [])[d] || '';
  return `${strings.weekdayPrefix || ''}${w}`;
}

export function makeStrings(lang) {
  return STRINGS[lang] || STRINGS.zh;
}
