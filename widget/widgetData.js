// widget 展示数据的单一构建来源：headless task handler 与 App 内主动刷新（widgetRefresh）共用，
// 避免两处各自实现「读数据 → 参数包」导致漂移。V2 拆为 focus / travel / legacy 三域。
// 数据同源原则：番茄读 pomodoroState（与 App 同一 AsyncStorage key），行程读 SQLite 今日记录；
// 组件不保存自己的数据。
import { getTodayRecords } from '../src/storage/store';
import { isPlaceholderName } from '../src/utils/stats';
import { loadState } from '../src/pomodoro/stateStore';
import { settleAndPersist } from '../src/pomodoro/settle';
import { deriveDisplay } from '../src/pomodoro/engine';
import { getWidgetLang, getWidgetTheme, makeStrings, fmtTime, fmtWeekday } from './widgetStrings';
import { modePalette, tripPalette, basePalette } from './widgetTheme';

export const TIMELINE_MAX_ROWS = 4; // 4×2 时间轴最多 4 行（行高 26 × 4 ≈ 设计稿 tl 高 104）

// 纯函数：今日记录（升序或乱序皆可）→ 足迹模式时间轴数据。可 node 测试。
// 足迹模式（已决策取消计划站点）：全部行都是已发生的打卡，最新一条为「当前」，无「未到」站。
export function deriveTimeline(records, strings, now = Date.now()) {
  const list = (Array.isArray(records) ? records : []).slice().sort((a, b) => a.timestamp - b.timestamp);
  const count = list.length;
  const nameOf = (r) => {
    const n = r && r.locationName;
    return isPlaceholderName(n) ? strings.unnamed : n;
  };
  const recent = list.slice(-TIMELINE_MAX_ROWS); // 超过 4 条取最近 4 条（时间升序展示）
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

// 番茄域：先惰性结算（心跳/点击触点先到先得，与 App 共用 settleAndPersist），再派生显示。
// 结算只推进状态机，不写 focus_sessions（手动保存决策）。
export async function buildFocusData(now = Date.now()) {
  const [{ state }, { strings, isDark }] = await Promise.all([settleAndPersist(now), langTheme()]);
  const d = deriveDisplay(state, Date.now());
  return { d, state, strings, pal: modePalette(d.mode, isDark), isDark };
}

// 行程域：今日 SQLite 记录 → 足迹时间轴。
export async function buildTravelData(now = Date.now()) {
  const [records, { strings, isDark }] = await Promise.all([getTodayRecords(), langTheme()]);
  const timeline = deriveTimeline(records, strings, now);
  return { timeline, strings, pal: tripPalette(isDark), isDark };
}

// 旧 TimeFlowWidget 过渡卡：静态文案，无数据读取。
export async function buildLegacyData() {
  const [{ strings, isDark }] = await Promise.all([langTheme()]);
  return { strings, pal: basePalette(isDark), isDark };
}
