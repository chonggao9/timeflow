import AsyncStorage from '@react-native-async-storage/async-storage';
import { getTodayRecords, getRecentRecordsForWidget, WIDGET_FOCUS_WEEK_KEY } from '../src/storage/store';
import { isPlaceholderName } from '../src/utils/stats';
import { loadState } from '../src/pomodoro/stateStore';
import { settleAndPersist } from '../src/pomodoro/settle';
import { deriveDisplay } from '../src/pomodoro/engine';
import { getWidgetLang, getWidgetTheme, makeStrings, fmtTime, fmtWeekday } from './widgetStrings';
import { modePalette, tripPalette, basePalette } from './widgetTheme';

export const TIMELINE_MAX_ROWS = 4; // 4×2 时间轴最多 4 行（行高 26 × 4 ≈ 设计稿 tl 高 104）

// 计算连续打卡天数（纯函数，同 ProfileScreen 算法）
export function calculateStreak(records, now = Date.now()) {
  const list = Array.isArray(records) ? records : [];
  if (list.length === 0) return 0;
  const dateSet = new Set();
  for (const r of list) {
    if (r && r.timestamp) {
      const d = new Date(r.timestamp);
      dateSet.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
    }
  }
  if (dateSet.size === 0) return 0;

  const formatDay = (d) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  const current = new Date(now);
  current.setHours(0, 0, 0, 0);

  if (!dateSet.has(formatDay(current))) {
    current.setDate(current.getDate() - 1);
    if (!dateSet.has(formatDay(current))) return 0;
  }

  let streak = 0;
  while (dateSet.has(formatDay(current))) {
    streak++;
    current.setDate(current.getDate() - 1);
  }
  return streak;
}

// 计算本周（周一至周日）的打卡状态与今日索引
export function deriveWeekStatus(records, now = Date.now()) {
  const d = new Date(now);
  const day = d.getDay(); // 0(周日) ~ 6(周六)
  const todayIdx = day === 0 ? 6 : day - 1; // 转换为 0(周一) ~ 6(周日)

  // 找本周一的 0 点时间戳
  const monday = new Date(now);
  monday.setDate(monday.getDate() - todayIdx);
  monday.setHours(0, 0, 0, 0);
  const mondayTs = monday.getTime();

  const active = Array(7).fill(false);
  const list = Array.isArray(records) ? records : [];
  for (const r of list) {
    if (r && r.timestamp) {
      const diff = r.timestamp - mondayTs;
      if (diff >= 0 && diff < 7 * 86400000) {
        const slot = Math.floor(diff / 86400000);
        if (slot >= 0 && slot < 7) active[slot] = true;
      }
    }
  }
  return { active, todayIdx };
}

// 计算近 4 周（28 天）的打卡热力等级（0/1/2）
export function deriveHeatGrid(records, now = Date.now()) {
  const list = Array.isArray(records) ? records : [];
  const startDay = new Date(now);
  startDay.setDate(startDay.getDate() - 27);
  startDay.setHours(0, 0, 0, 0);
  const startTs = startDay.getTime();

  const counts = Array(28).fill(0);
  for (const r of list) {
    if (r && r.timestamp) {
      const diff = r.timestamp - startTs;
      if (diff >= 0 && diff < 28 * 86400000) {
        const slot = Math.floor(diff / 86400000);
        if (slot >= 0 && slot < 28) counts[slot]++;
      }
    }
  }
  return counts.map((c) => (c >= 3 ? 2 : c >= 1 ? 1 : 0));
}

// 纯函数：今日记录（升序或乱序皆可）→ 足迹模式时间轴数据。
export function deriveTimeline(records, strings, now = Date.now()) {
  const list = (Array.isArray(records) ? records : []).slice().sort((a, b) => a.timestamp - b.timestamp);
  const count = list.length;
  const nameOf = (r) => {
    const n = r && r.locationName;
    return isPlaceholderName(n) ? strings.unnamed : n;
  };
  const recent = list.slice(-TIMELINE_MAX_ROWS);
  const rows = recent.map((r, i) => ({
    name: nameOf(r),
    time: fmtTime(r.timestamp),
    cur: i === recent.length - 1,
  }));
  const latest = count ? list[count - 1] : null;
  return {
    count,
    rows,
    empty: count === 0,
    latestName: latest ? nameOf(latest) : null,
    latestTime: latest ? fmtTime(latest.timestamp) : null,
    weekday: fmtWeekday(strings, now),
    countText: strings.timesCount.replace('{n}', String(count)),
  };
}

async function langTheme() {
  const [lang, theme] = await Promise.all([getWidgetLang(), getWidgetTheme()]);
  return { lang, strings: makeStrings(lang), isDark: theme.isDark };
}

// 番茄域：包含 Phase 3 的今日专注分钟与周柱状图
export async function buildFocusData(now = Date.now()) {
  const [{ state }, { strings, isDark }] = await Promise.all([settleAndPersist(now), langTheme()]);
  const d = deriveDisplay(state, Date.now());

  // 今日已专注分钟数（已结番茄 + 当前正在专注消耗的分钟数，考虑自定义时长）
  const inProgressMin =
    d.mode === 'focus' && d.totalMs > d.remainingMs ? Math.floor((d.totalMs - d.remainingMs) / 60000) : 0;
  const focusMin = (state && state.focusMin) || 25;
  const todayMin = (d.completedToday || 0) * focusMin + inProgressMin;

  // 过去 7 天标签：前 6 天按日期推断，第 7 天固定为「今」/「Today」
  const weekLabels = [];
  for (let i = 6; i >= 1; i--) {
    const past = new Date(now - i * 86400000);
    const dayNum = past.getDay();
    weekLabels.push((strings.weekdays || [])[dayNum] || '');
  }
  weekLabels.push(strings.todayWord || '今');

  // 周统计基准（前 6 天从缓存读取真实历史，第 7 天使用今日实时值）
  let past6Days = [0, 0, 0, 0, 0, 0];
  try {
    const raw = await AsyncStorage.getItem(WIDGET_FOCUS_WEEK_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed?.values) && parsed.values.length === 7) {
        past6Days = parsed.values.slice(0, 6);
      }
    }
  } catch (e) {}

  const weekValues = [...past6Days, todayMin];

  return {
    d,
    state,
    strings,
    pal: modePalette(d.mode, isDark),
    darkPal: modePalette(d.mode, true), // 供强制深色组件使用
    todayMin,
    weekBars: { days: weekLabels, values: weekValues },
    isDark,
  };
}

// 行程域：包含 Phase 3 的连续打卡天数、周状态与热力格
export async function buildTravelData(now = Date.now()) {
  const [[todayRecords, recentRecords], { strings, isDark }] = await Promise.all([
    Promise.all([
      getTodayRecords().catch(() => []),
      getRecentRecordsForWidget(60, now).catch(() => []),
    ]),
    langTheme(),
  ]);

  const timeline = deriveTimeline(todayRecords, strings, now);
  const streakDays = calculateStreak(recentRecords, now);
  const weekStatus = deriveWeekStatus(recentRecords, now);
  const heatGrid = deriveHeatGrid(recentRecords, now);

  const weekLabels = strings.weekdays
    ? [strings.weekdays[1], strings.weekdays[2], strings.weekdays[3], strings.weekdays[4], strings.weekdays[5], strings.weekdays[6], strings.weekdays[0]]
    : ['一', '二', '三', '四', '五', '六', '日'];

  return {
    timeline,
    streakDays,
    weekDays: {
      days: weekLabels,
      active: weekStatus.active,
      todayIdx: weekStatus.todayIdx,
    },
    heatGrid,
    strings,
    pal: tripPalette(isDark),
    darkPal: tripPalette(true), // 供强制深色组件使用
    isDark,
  };
}

// 旧 TimeFlowWidget 过渡卡：静态文案，无数据读取。
export async function buildLegacyData() {
  const [{ strings, isDark }] = await Promise.all([langTheme()]);
  return { strings, pal: basePalette(isDark), isDark };
}

