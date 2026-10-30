// @ts-check
import { placeKey, median, UNNAMED, isPlaceholderName, TRIP_TIMEOUT_MS } from './stats.js';
import { normalizeCategory } from './focusCategories.js';

// 地点清单：placeKey → { key, name, count }（按次数降序），供 A→B 选择器用
// 只统计行程记录：专注目标的名称不是地点，混进来会污染地点选择器。
export function getPlaceOptions(records) {
  const map = new Map();
  for (const r of (records || [])) {
    const key = placeKey(r);
    if (!map.has(key)) map.set(key, { key, names: {}, count: 0 });
    const e = map.get(key);
    e.count++;
    const nm = isPlaceholderName(r.locationName) ? UNNAMED : r.locationName;
    e.names[nm] = (e.names[nm] || 0) + 1;
  }
  return [...map.values()]
    .map(e => {
      // 标签优先取真实地名（跳占位），与 computePathStats 的 pickLabel 一致
      const real = Object.entries(e.names)
        .filter(([nm]) => !isPlaceholderName(nm))
        .sort((a, b) => b[1] - a[1])[0];
      return { key: e.key, name: real ? real[0] : UNNAMED, count: e.count };
    })
    .sort((a, b) => b.count - a.count);
}

// 基于过去 90 天按当前时段（早/中/晚/夜间）与星期加权推荐常用地点
export function getTimeContextPlaceOptions(records, limit = 6, now = Date.now()) {
  const ninetyDaysAgo = now - 90 * 86400000;
  const curDate = new Date(now);
  const curHour = curDate.getHours();
  const curDay = curDate.getDay();
  const isCurWeekend = curDay === 0 || curDay === 6;

  // 时段区间：0: 夜间(22~6), 1: 早晨(6~11), 2: 下午(11~17), 3: 晚上(17~22)
  const getSlot = (h) => {
    if (h >= 6 && h < 11) return 1;
    if (h >= 11 && h < 17) return 2;
    if (h >= 17 && h < 22) return 3;
    return 0;
  };
  const curSlot = getSlot(curHour);

  const scores = new Map();

  for (const r of records || []) {
    if (!r.timestamp || r.timestamp < ninetyDaysAgo) continue;
    const nm = r.locationName;
    if (!nm || isPlaceholderName(nm)) continue;

    const rDate = new Date(r.timestamp);
    const rHour = rDate.getHours();
    const rDay = rDate.getDay();
    const isRWeekend = rDay === 0 || rDay === 6;

    let weight = 1.0;
    // 同一时段加权
    if (getSlot(rHour) === curSlot) weight += 1.5;
    // 工作日/周末类型匹配加权
    if (isCurWeekend === isRWeekend) weight += 1.0;

    scores.set(nm, (scores.get(nm) || 0) + weight);
  }

  return [...scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([nm]) => nm);
}

// 周起始（周一起始）epoch ms
function weekStart(ts) {
  const d = new Date(ts);
  const diff = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - diff);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

// 端到端 A→B 行程查询：A→A1→A2→B 算一次 A→B（含中间停靠，door-to-door）。
// 同行程多次往返 → 多次采样。没走过返回 null。
export function queryJourney(records, fromKey, toKey) {
  const travelRecords = records || []; // 专注记录已分离到 focus_sessions，此处只处理行程记录
  const nameMap = new Map(getPlaceOptions(travelRecords).map(o => [o.key, o.name]));

  // 按行程分组、按时间排序
  const byTrip = new Map();
  for (const r of travelRecords) {
    const t = r.tripId || 'legacy';
    if (!byTrip.has(t)) byTrip.set(t, []);
    byTrip.get(t).push(r);
  }

  const spans = []; // { duration, startTs, hour, mode, keys, segs }
  for (const trip of byTrip.values()) {
    const sorted = [...trip].sort((a, b) => a.timestamp - b.timestamp);
    let aIdx = sorted.findIndex(r => placeKey(r) === fromKey);
    while (aIdx >= 0) {
      const bIdx = sorted.findIndex((r, i) => i > aIdx && placeKey(r) === toKey);
      if (bIdx < 0) break;
      const A = sorted[aIdx], B = sorted[bIdx];
      const duration = B.timestamp - A.timestamp;
      if (duration > 0 && duration < 86400000) {
        const segs = [];
        const keys = [fromKey];
        for (let i = aIdx; i < bIdx; i++) {
          const s = sorted[i], e = sorted[i + 1];
          const fk = placeKey(s), tk = placeKey(e);
          keys.push(tk);
          segs.push({ fromKey: fk, toKey: tk, sec: (e.timestamp - s.timestamp) / 1000 });
        }
        spans.push({ duration, startTs: A.timestamp, hour: new Date(A.timestamp).getHours(), mode: A.mode, keys, segs });
      }
      aIdx = sorted.findIndex((r, i) => i > bIdx && placeKey(r) === fromKey);
    }
  }

  // 补充跨行程但时间连续（<=90分钟内直接相邻打卡）的样本，避免误触结束行程导致通勤样本断裂
  const allSorted = [...travelRecords].sort((a, b) => a.timestamp - b.timestamp);
  for (let i = 0; i < allSorted.length - 1; i++) {
    const s = allSorted[i], e = allSorted[i + 1];
    if (placeKey(s) === fromKey && placeKey(e) === toKey) {
      const duration = e.timestamp - s.timestamp;
      if (duration > 0 && duration <= TRIP_TIMEOUT_MS) {
        const already = spans.some(sp => sp.startTs === s.timestamp && Math.abs(sp.duration - duration) < 1000);
        if (!already) {
          spans.push({
            duration,
            startTs: s.timestamp,
            hour: new Date(s.timestamp).getHours(),
            mode: s.mode || e.mode || 'walk',
            keys: [fromKey, toKey],
            segs: [{ fromKey, toKey, sec: duration / 1000 }],
          });
        }
      }
    }
  }

  if (!spans.length) return null;

  const durations = spans.map(s => s.duration).sort((a, b) => a - b);
  const pct = (q) => durations[Math.min(durations.length - 1, Math.floor(durations.length * q))];

  // 最常见方式
  const modeCount = {};
  for (const s of spans) modeCount[s.mode || 'walk'] = (modeCount[s.mode || 'walk'] || 0) + 1;
  const mode = Object.entries(modeCount).sort((a, b) => b[1] - a[1])[0][0];

  // 出发小时分布（24 桶）
  const hourDist = new Array(24).fill(0);
  for (const s of spans) hourDist[s.hour]++;

  // 周趋势：按出发周分组，近 8 周（分钟，null=该周无样本）
  const weekMap = new Map();
  for (const s of spans) {
    const wk = weekStart(s.startTs);
    if (!weekMap.has(wk)) weekMap.set(wk, []);
    weekMap.get(wk).push(s.duration);
  }
  const nowWeek = weekStart(Date.now());
  const weeklyTrend = [];
  for (let i = 7; i >= 0; i--) {
    const wk = nowWeek - i * 7 * 86400000;
    const arr = weekMap.get(wk);
    weeklyTrend.push(arr && arr.length ? Math.round(median(arr) / 60000) : null);
  }

  // 中间路段拆分：取最常见中转序列（modal chain），每段聚合所有经过该段的样本
  const seqCount = new Map();
  for (const s of spans) {
    const seq = s.keys.join('|');
    seqCount.set(seq, (seqCount.get(seq) || 0) + 1);
  }
  const modalKeys = [...seqCount.entries()]
    .sort((a, b) => b[1] - a[1] || b[0].split('|').length - a[0].split('|').length)[0][0].split('|');
  const breakdown = [];
  for (let i = 0; i < modalKeys.length - 1; i++) {
    const fk = modalKeys[i], tk = modalKeys[i + 1];
    const secs = [];
    for (const s of spans) {
      for (const seg of s.segs) {
        if (seg.fromKey === fk && seg.toKey === tk) secs.push(seg.sec);
      }
    }
    if (secs.length) {
      breakdown.push({
        fromName: nameMap.get(fk) || UNNAMED,
        toName: nameMap.get(tk) || UNNAMED,
        medianSec: Math.round(median(secs)),
        count: secs.length,
      });
    }
  }

  // 内部 durations 是毫秒；对外 *Sec 统一为秒（与 computePathStats 约定一致）
  const toSec = (ms) => Math.round(ms / 1000);
  return {
    fromName: nameMap.get(fromKey) || UNNAMED,
    toName: nameMap.get(toKey) || UNNAMED,
    sampleCount: spans.length,
    medianSec: toSec(median(durations)),
    p25Sec: toSec(pct(0.25)),
    p75Sec: toSec(pct(0.75)),
    minSec: toSec(durations[0]),
    maxSec: toSec(durations[durations.length - 1]),
    mode,
    durations: durations.map(d => Math.round(d / 60000)), // 分钟（供分布图）
    hourDist,
    weeklyTrend, // 8 值（分钟），最新在末位（null=无样本）
    breakdown,
  };
}

// 耗时分布 → 5 分钟桶直方图 { labels, counts, highlight }
export function buildDurationHistogram(minutes) {
  if (!minutes.length) return null;
  const lo = Math.floor(Math.min(...minutes) / 5) * 5;
  const hi = Math.ceil(Math.max(...minutes) / 5) * 5;
  const buckets = [];
  for (let b = lo; b <= hi; b += 5) buckets.push(b);
  const counts = new Array(buckets.length).fill(0);
  for (const m of minutes) {
    const idx = Math.min(buckets.length - 1, Math.floor((m - lo) / 5));
    counts[idx]++;
  }
  const med = median(minutes);
  const highlight = Math.min(buckets.length - 1, Math.floor((med - lo) / 5));
  return { labels: buckets, counts, highlight };
}

// ---- 历史行程 ----
// 按 tripId 分组 → 行程摘要列表（按开始时间倒序）。
// 每项：records(升序)、startTs、endTs、durationMs、route(去重相邻地名序列)、mode(主方式)、count。
// 只统计行程记录：专注记录没有真实地点，混进来会渲染成空标题、时长为 — 的假行程。
export function groupTrips(records) {
  const byTrip = new Map();
  for (const r of (records || [])) {
    // 无 tripId 的旧数据按自然日归组，避免坍缩成一个跨月的巨型行程
    const d = new Date(r.timestamp);
    d.setHours(0, 0, 0, 0);
    const t = r.tripId || `legacy:${d.getTime()}`;
    if (!byTrip.has(t)) byTrip.set(t, []);
    byTrip.get(t).push(r);
  }
  const trips = [];
  for (const [tripKey, recs] of byTrip.entries()) {
    const sorted = [...recs].sort((a, b) => a.timestamp - b.timestamp);
    const first = sorted[0], last = sorted[sorted.length - 1];
    // 主方式：出现最多的 mode
    const modeCount = {};
    for (const r of sorted) modeCount[r.mode || 'walk'] = (modeCount[r.mode || 'walk'] || 0) + 1;
    const mode = Object.entries(modeCount).sort((a, b) => b[1] - a[1])[0][0];
    // 路线：去重相邻同名点（如「家→家→公司」压成「家→公司」）
    const route = [];
    for (const r of sorted) {
      const nm = isPlaceholderName(r.locationName) ? UNNAMED : r.locationName;
      if (route[route.length - 1] !== nm) route.push(nm);
    }
    trips.push({
      tripId: tripKey,
      records: sorted,
      startTs: first.timestamp,
      endTs: last.timestamp,
      durationMs: last.timestamp - first.timestamp,
      route,
      mode,
      count: sorted.length,
    });
  }
  return trips.sort((a, b) => b.startTs - a.startTs);
}

// 按开始日期（本地自然日）分组，日期倒序：[{ ts, list }]
export function groupTripsByDate(trips) {
  const map = new Map();
  for (const t of trips) {
    const d = new Date(t.startTs);
    d.setHours(0, 0, 0, 0);
    const key = d.getTime();
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(t);
  }
  return [...map.entries()].map(([ts, list]) => ({ ts, list })).sort((a, b) => b.ts - a.ts);
}

// 交通方式标准调色盘（图例与占比条）
export const MODE_COLORS = {
  drive: '#B3262C',
  bike: '#EF6B63',
  walk: '#F7B9B2',
  subway: '#8A7D76',
  transit: '#5C93C4',
  taxi: '#E67E22',
  train: '#4CAE7F',
  flight: '#9B59B6',
  boat: '#3498DB',
  other: '#B6A99E',
};

// 计算近 7 天每日出行耗时与出行方式占比
export function computeWeekTravelStats(records, lang = 'zh') {
  const travelRecords = records || [];
  const trips = groupTrips(travelRecords);
  const now = new Date();
  const todayZero = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

  const days = [];
  const weekStartTs = todayZero - 6 * 86400000;
  let totalMins = 0;

  for (let i = 0; i < 7; i++) {
    const dayStart = weekStartTs + i * 86400000;
    const dayEnd = dayStart + 86400000;
    const d = new Date(dayStart);
    const dayOfWeek = d.getDay(); // 0 is Sun, 1 is Mon...
    const dayMapZh = ['日', '一', '二', '三', '四', '五', '六'];
    const dayMapEn = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const isToday = i === 6;

    let dayMs = 0;
    for (const t of trips) {
      if (t.startTs >= dayStart && t.startTs < dayEnd) {
        dayMs += t.durationMs > 0 ? t.durationMs : 0;
      }
    }
    const mins = Math.round(dayMs / 60000);
    totalMins += mins;
    days.push({
      label: isToday ? (lang === 'zh' ? '今天' : 'Today') : (lang === 'zh' ? dayMapZh[dayOfWeek] : dayMapEn[dayOfWeek]),
      mins,
      isToday,
      dayStart,
    });
  }

  // 方式占比计算：优先取近 7 天出行，无数据则退回全部行程
  let targetTrips = trips.filter(t => t.startTs >= weekStartTs);
  if (!targetTrips.length) targetTrips = trips;

  const modeDurMap = {};
  let shareTotalMs = 0;
  for (const t of targetTrips) {
    const m = t.mode || 'walk';
    const dur = t.durationMs > 0 ? t.durationMs : 60000; // 最低计 1 分钟权重
    modeDurMap[m] = (modeDurMap[m] || 0) + dur;
    shareTotalMs += dur;
  }

  const shares = [];
  if (shareTotalMs > 0) {
    for (const [m, ms] of Object.entries(modeDurMap)) {
      const p = Math.round((ms / shareTotalMs) * 100);
      if (p > 0) {
        shares.push({
          mode: m,
          pct: p,
          color: MODE_COLORS[m] || MODE_COLORS.other,
        });
      }
    }
    shares.sort((a, b) => b.pct - a.pct);
  }

  return { days, totalMins, shares };
}

// 查找指定路线（fromKey -> toKey）最近一次出行行程
export function findLatestTripForRoute(records, fromKey, toKey) {
  if (!fromKey || !toKey) return null;
  const trips = groupTrips(records);
  for (const trip of trips) {
    const keys = trip.records.map(r => placeKey(r));
    const fIdx = keys.indexOf(fromKey);
    const tIdx = keys.lastIndexOf(toKey);
    if (fIdx >= 0 && tIdx > fIdx) {
      return trip;
    }
  }
  return trips[0] || null;
}

// ---------------- 洞察与统计优化核心纯函数 (无 RN 依赖) ----------------

/**
 * 本地日历工具：获取某天零点（杜绝直接加减 86400000ms 导致的夏令时漂移）
 */
export function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * 本地日历工具：获取周一零点
 */
export function startOfWeek(date) {
  const d = startOfDay(date);
  const day = d.getDay() || 7; // 1(一) .. 7(日)
  d.setDate(d.getDate() - (day - 1));
  return d;
}

/**
 * 本地日历工具：获取月首零点
 */
export function startOfMonth(date) {
  const d = startOfDay(date);
  d.setDate(1);
  return d;
}

/**
 * S3 同进度公平环比对比：
 * - today: 昨天 00:00 到 昨天同一时刻
 * - week: 上周一 00:00 到 上周同一星期几同一时刻
 * - month: 上月1日 00:00 到 上月同日同一时刻
 * - all: 不对比 (growthRate: null)
 * - 上期为 0: growthRate: null (显示 —, 绝不编造 +100%)
 */
export function computeLikeForLikeProgress(records = [], range = 'week', nowInput = new Date()) {
  const now = new Date(nowInput);
  const nowTs = now.getTime();

  let curStart, curEnd, prevStart, prevEnd, daysCount;

  if (range === 'today') {
    const curStartD = startOfDay(now);
    curStart = curStartD.getTime();
    curEnd = nowTs;

    const prevStartD = new Date(curStartD);
    prevStartD.setDate(prevStartD.getDate() - 1);
    prevStart = prevStartD.getTime();

    const prevEndD = new Date(now);
    prevEndD.setDate(prevEndD.getDate() - 1);
    prevEnd = prevEndD.getTime();
    daysCount = 1;
  } else if (range === 'week') {
    const curStartD = startOfWeek(now);
    curStart = curStartD.getTime();
    curEnd = nowTs;

    const prevStartD = new Date(curStartD);
    prevStartD.setDate(prevStartD.getDate() - 7);
    prevStart = prevStartD.getTime();

    const prevEndD = new Date(now);
    prevEndD.setDate(prevEndD.getDate() - 7);
    prevEnd = prevEndD.getTime();
    daysCount = now.getDay() || 7;
  } else if (range === 'month') {
    const curStartD = startOfMonth(now);
    curStart = curStartD.getTime();
    curEnd = nowTs;

    const prevStartD = new Date(curStartD.getFullYear(), curStartD.getMonth() - 1, 1);
    prevStart = prevStartD.getTime();

    // 上月同日同一时刻（若上月天数少于当前日期，取上月最后一天同时刻）
    const targetDay = now.getDate();
    const daysInPrevMonth = new Date(curStartD.getFullYear(), curStartD.getMonth(), 0).getDate();
    const safeDay = Math.min(targetDay, daysInPrevMonth);
    const prevEndD = new Date(curStartD.getFullYear(), curStartD.getMonth() - 1, safeDay, now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds());
    prevEnd = prevEndD.getTime();
    daysCount = now.getDate();
  } else {
    // 'all'
    const sorted = (records || []).slice().sort((a, b) => a.timestamp - b.timestamp);
    const firstTs = sorted.length > 0 ? sorted[0].timestamp : startOfDay(now).getTime();
    curStart = firstTs;
    curEnd = nowTs;
    prevStart = 0;
    prevEnd = 0;
    const diffDays = Math.max(1, Math.ceil((nowTs - firstTs) / (24 * 3600 * 1000)));
    daysCount = diffDays;
  }

  const curRecords = (records || []).filter(r => r.timestamp >= curStart && r.timestamp <= curEnd);
  const prevRecords = prevStart > 0 ? (records || []).filter(r => r.timestamp >= prevStart && r.timestamp < prevEnd) : [];

  const curTotalSec = curRecords.reduce((sum, r) => sum + (Number(r.duration) || 0), 0);
  const prevTotalSec = prevRecords.reduce((sum, r) => sum + (Number(r.duration) || 0), 0);

  let growthRate = null;
  let canCompare = false;

  if (range !== 'all' && prevTotalSec > 0) {
    growthRate = Math.round(((curTotalSec - prevTotalSec) / prevTotalSec) * 100);
    canCompare = true;
  }

  return {
    curStart,
    curEnd,
    prevStart,
    prevEnd,
    curRecords,
    prevRecords,
    curTotalSec,
    prevTotalSec,
    growthRate,
    canCompare,
    daysCount,
  };
}

/**
 * 决策 1 (收窄范围)：专注指标纯函数计算
 * - 番茄数只统计完整番茄 (partial === 0)
 * - 时长统计全部
 * - 暴露 partialCount (提前结束次数)
 * - 暴露 maxSessionSec (最长单次)
 * @param {Array<import('../types').FocusSession & { startTime?: number, taskName?: string }>} [focusRecords]
 * @param {number | string} [daysCountOrRange]
 * @param {Date} [nowInput]
 */
export function computeFocusMetrics(focusRecords = [], daysCountOrRange = 1, nowInput = new Date()) {
  const allList = Array.isArray(focusRecords) ? focusRecords : [];
  let filteredRecords = allList;
  let daysCount = typeof daysCountOrRange === 'number' ? Math.max(1, daysCountOrRange) : 1;
  let growthRate = null;
  let canCompare = false;

  // 如果第二个参数是时间范围字符串 ('today' | 'week' | 'month' | 'all')
  if (typeof daysCountOrRange === 'string') {
    const progress = computeLikeForLikeProgress(allList, daysCountOrRange, nowInput);
    filteredRecords = progress.curRecords || [];
    growthRate = progress.growthRate;
    canCompare = progress.canCompare;
    daysCount = progress.daysCount;
  }

  let totalDurationSec = 0;
  let completedPomodoros = 0;
  let partialCount = 0;
  let maxSessionSec = 0;

  for (const r of filteredRecords) {
    const sec = Number(r.duration) || 0;
    totalDurationSec += sec;
    if (r.partial) {
      partialCount++;
    } else {
      completedPomodoros++;
    }
    if (sec > maxSessionSec) {
      maxSessionSec = sec;
    }
  }

  const dailyAvgSec = Math.round(totalDurationSec / Math.max(1, daysCount));
  const avgPomodoroMin = completedPomodoros > 0
    ? Math.round(
        (filteredRecords.filter(r => !r.partial).reduce((s, r) => s + (Number(r.duration) || 0), 0) / completedPomodoros) / 60
      )
    : 0;

  // 黄金时段分布 (上午 6-12, 下午 12-18, 晚上 18-24, 深夜 0-6)
  const periods = [
    { key: 'morning', label: '上午', span: '6–12 点', sec: 0 },
    { key: 'afternoon', label: '下午', span: '12–18 点', sec: 0 },
    { key: 'evening', label: '晚上', span: '18–24 点', sec: 0 },
    { key: 'lateNight', label: '深夜', span: '0–6 点', sec: 0 },
  ];
  for (const r of filteredRecords) {
    const ts = r.timestamp || r.startTime || 0;
    if (!ts) continue;
    const h = new Date(ts).getHours();
    const sec = Number(r.duration) || 0;
    if (h >= 6 && h < 12) periods[0].sec += sec;
    else if (h >= 12 && h < 18) periods[1].sec += sec;
    else if (h >= 18 && h < 24) periods[2].sec += sec;
    else periods[3].sec += sec;
  }
  const peakPeriod = [...periods].sort((a, b) => b.sec - a.sec)[0];

  // 分类分布与 Top 5 任务
  const catMap = new Map();
  catMap.set('uncategorized', {
    key: 'uncategorized',
    name: '未分类',
    color: '#B8AFA8',
    sec: 0,
    count: 0,
    tasks: new Map(),
  });
  const STANDARD_CATS = [
    { key: 'work', name: '工作', color: '#3A62D8' },
    { key: 'study', name: '学习', color: '#D33A3A' },
    { key: 'create', name: '创作', color: '#E8891B' },
    { key: 'wellbeing', name: '身心', color: '#2E9A6B' },
    { key: 'life', name: '生活', color: '#1F90B0' },
    { key: 'review', name: '规划', color: '#7B55C4' },
  ];
  for (const c of STANDARD_CATS) {
    catMap.set(c.key, {
      key: c.key,
      name: c.name,
      color: c.color,
      sec: 0,
      count: 0,
      tasks: new Map(),
    });
  }

  for (const r of filteredRecords) {
    const normKey = normalizeCategory(r.category) || 'uncategorized';
    if (!catMap.has(normKey)) {
      catMap.set(normKey, {
        key: normKey,
        name: r.category || '未分类',
        color: '#B8AFA8',
        sec: 0,
        count: 0,
        tasks: new Map(),
      });
    }
    const target = catMap.get(normKey);
    const sec = Number(r.duration) || 0;
    target.sec += sec;
    target.count += 1;
    const taskName = (r.goalName || r.taskName || '未命名专注').trim();
    target.tasks.set(taskName, (target.tasks.get(taskName) || 0) + sec);
  }

  const categories = [];
  for (const [key, item] of catMap.entries()) {
    if (item.count > 0) {
      const topTasks = [...item.tasks.entries()]
        .map(([name, sec]) => ({ name, sec }))
        .sort((a, b) => b.sec - a.sec)
        .slice(0, 5);
      const percent = totalDurationSec > 0 ? Math.round((item.sec / totalDurationSec) * 100) : 0;
      categories.push({
        key,
        name: item.name,
        color: item.color,
        sec: item.sec,
        count: item.count,
        percent,
        topTasks,
      });
    }
  }
  categories.sort((a, b) => b.sec - a.sec);

  return {
    filteredRecords,
    totalDurationSec,
    completedPomodoros,
    partialCount,
    maxSessionSec,
    dailyAvgSec,
    avgPomodoroMin,
    daysCount,
    growthRate,
    canCompare,
    periods,
    peakPeriod,
    categories,
    // 兼容别名
    totalSec: totalDurationSec,
    pomodoroCount: completedPomodoros,
    longestSec: maxSessionSec,
    avgSec: dailyAvgSec,
  };
}

/**
 * 决策 2：月度日历热力图生成函数 (7 列 × 5~6 行)
 * @param {Array} records 待聚合的记录
 * @param {Date|number} nowInput 基准日期
 * @param {Function|string} valueExtractorOrType 从当天记录数组提取聚合值的函数或类型 ('focus' | 'travel')
 */
export function computeMonthHeatmap(records = [], nowInput = new Date(), valueExtractorOrType) {
  let valueExtractor;
  if (valueExtractorOrType === 'travel') {
    valueExtractor = (recs) => recs.length;
  } else if (typeof valueExtractorOrType === 'function') {
    valueExtractor = valueExtractorOrType;
  } else {
    // 默认 focus 模式：累计分钟数
    valueExtractor = (recs) => recs.reduce((s, r) => s + (Number(r.duration) || 0), 0) / 60;
  }

  const base = new Date(nowInput);
  const year = base.getFullYear();
  const month = base.getMonth(); // 0-based
  const todayStart = startOfDay(base).getTime();

  // 当月 1 号与最后一天
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const totalDays = lastDay.getDate();

  // 周对齐：1 号对应的星期几 1(一) .. 7(日)
  const firstDayOfWeek = firstDay.getDay() || 7;
  // 前置补齐天数
  const prevPads = firstDayOfWeek - 1;

  // 按日期归档记录: YYYY-M-D -> records[]
  const dayRecordsMap = new Map();
  for (const r of (records || [])) {
    const ts = r.timestamp || r.startTime;
    if (!ts) continue;
    const d = new Date(ts);
    const key = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
    if (!dayRecordsMap.has(key)) dayRecordsMap.set(key, []);
    dayRecordsMap.get(key).push(r);
  }

  /** @type {Array<{ date: Date, dateStr: string, dayOfMonth: number, isCurrentMonth: boolean, isToday: boolean, isFuture: boolean, value: number, records: any[], startTs: number, endTs: number, level?: number }>} */
  const cells = [];
  let maxVal = 0;

  const toDateStr = (dateObj) => {
    const y = dateObj.getFullYear();
    const m = String(dateObj.getMonth() + 1).padStart(2, '0');
    const day = String(dateObj.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  // 1. 前置上月填充单元格
  for (let i = prevPads; i > 0; i--) {
    const padDate = new Date(year, month, 1 - i);
    const padStart = startOfDay(padDate).getTime();
    const padEnd = padStart + 24 * 3600 * 1000;
    const key = `${padDate.getFullYear()}-${padDate.getMonth() + 1}-${padDate.getDate()}`;
    const dayRecs = dayRecordsMap.get(key) || [];
    const val = Math.round(valueExtractor(dayRecs) || 0);
    if (val > maxVal) maxVal = val;
    cells.push({
      date: padDate,
      dateStr: toDateStr(padDate),
      dayOfMonth: padDate.getDate(),
      isCurrentMonth: false,
      isToday: padStart === todayStart,
      isFuture: padStart > todayStart,
      value: val,
      records: dayRecs,
      startTs: padStart,
      endTs: padEnd,
    });
  }

  // 2. 当月真实单元格
  for (let d = 1; d <= totalDays; d++) {
    const curDate = new Date(year, month, d);
    const curStart = startOfDay(curDate).getTime();
    const curEnd = curStart + 24 * 3600 * 1000;
    const key = `${year}-${month + 1}-${d}`;
    const dayRecs = dayRecordsMap.get(key) || [];
    const val = Math.round(valueExtractor(dayRecs) || 0);
    if (val > maxVal) maxVal = val;
    cells.push({
      date: curDate,
      dateStr: toDateStr(curDate),
      dayOfMonth: d,
      isCurrentMonth: true,
      isToday: curStart === todayStart,
      isFuture: curStart > todayStart,
      value: val,
      records: dayRecs,
      startTs: curStart,
      endTs: curEnd,
    });
  }

  // 3. 后置下月填充单元格，补齐至 7 的整数倍
  const tailPads = (7 - (cells.length % 7)) % 7;
  for (let i = 1; i <= tailPads; i++) {
    const padDate = new Date(year, month + 1, i);
    const padStart = startOfDay(padDate).getTime();
    const padEnd = padStart + 24 * 3600 * 1000;
    const key = `${padDate.getFullYear()}-${padDate.getMonth() + 1}-${padDate.getDate()}`;
    const dayRecs = dayRecordsMap.get(key) || [];
    const val = Math.round(valueExtractor(dayRecs) || 0);
    if (val > maxVal) maxVal = val;
    cells.push({
      date: padDate,
      dateStr: toDateStr(padDate),
      dayOfMonth: padDate.getDate(),
      isCurrentMonth: false,
      isToday: padStart === todayStart,
      isFuture: padStart > todayStart,
      value: val,
      records: dayRecs,
      startTs: padStart,
      endTs: padEnd,
    });
  }

  // 4. 赋予颜色等级 level (0: 无, 1: 1~25%, 2: 25~50%, 3: 50~75%, 4: 75~100%)
  for (const cell of cells) {
    if (cell.value <= 0 || cell.isFuture) {
      cell.level = 0;
    } else if (maxVal <= 0) {
      cell.level = 1;
    } else {
      const ratio = cell.value / maxVal;
      if (ratio <= 0.25) cell.level = 1;
      else if (ratio <= 0.5) cell.level = 2;
      else if (ratio <= 0.75) cell.level = 3;
      else cell.level = 4;
    }
  }

  // 按 7 列分行 (共 4~6 行)
  const rows = [];
  for (let i = 0; i < cells.length; i += 7) {
    rows.push(cells.slice(i, i + 7));
  }

  return {
    year,
    month: month + 1,
    rows,
    days: rows, // 兼容 days 与 rows 访问
    maxVal,
    totalRecords: (records || []).length,
  };
}

/**
 * 趋势图动态分桶函数 (柱状图)
 * - today: 8 根柱 (每 3 小时一段)
 * - week: 7 根柱 (周一至周日)
 * - all: 跨度 <= 12 周按周，> 12 周按自然月聚合
 */
export function computeTrendBars(records = [], range = 'week', nowInput = new Date(), lang = 'zh') {
  const list = Array.isArray(records) ? records : [];
  const getTs = (r) => (r ? Number(r.timestamp || r.startTime) || 0 : 0);
  const now = new Date(nowInput);
  const todayZero = startOfDay(now).getTime();

  if (range === 'today') {
    const currentHour = now.getHours();
    const bars = [];
    for (let h = 0; h < 24; h += 3) {
      const slotStart = new Date(now);
      slotStart.setHours(h, 0, 0, 0);
      const start = slotStart.getTime();

      const slotEnd = new Date(now);
      slotEnd.setHours(h + 3, 0, 0, 0);
      const end = slotEnd.getTime();

      const slotRecords = list.filter(r => {
        const t = getTs(r);
        return t >= start && t < end;
      });
      const sec = slotRecords.reduce((s, r) => s + (Number(r.duration) || 0), 0);
      bars.push({
        label: `${h}h`,
        mins: Math.round(sec / 60),
        isToday: currentHour >= h && currentHour < h + 3,
        isPast: currentHour >= h,
        startTs: start,
        endTs: end,
        records: slotRecords,
      });
    }
    return bars;
  }

  if (range === 'week') {
    const curWeekMon = startOfWeek(now);
    const dayMapZh = ['', '周一', '周二', '周三', '周四', '周五', '周六', '周日'];
    const dayMapEn = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const curDayOfWeek = now.getDay() || 7;

    const bars = [];
    for (let d = 0; d < 7; d++) {
      const targetDate = new Date(curWeekMon);
      targetDate.setDate(targetDate.getDate() + d);
      const start = targetDate.getTime();

      const nextDate = new Date(targetDate);
      nextDate.setDate(nextDate.getDate() + 1);
      const end = nextDate.getTime();

      const dayIndex = d + 1; // 1 .. 7
      const dayRecs = list.filter(r => {
        const t = getTs(r);
        return t >= start && t < end;
      });
      const sec = dayRecs.reduce((s, r) => s + (Number(r.duration) || 0), 0);
      const isToday = dayIndex === curDayOfWeek;
      const isPast = dayIndex <= curDayOfWeek;

      bars.push({
        label: isToday ? (lang === 'zh' ? '今天' : 'Today') : (lang === 'zh' ? dayMapZh[dayIndex] : dayMapEn[dayIndex]),
        mins: Math.round(sec / 60),
        isToday,
        isPast,
        startTs: start,
        endTs: end,
        records: dayRecs,
      });
    }
    return bars;
  }

  // 'all' 分支：按周或按月聚合
  const sorted = list.slice().sort((a, b) => getTs(a) - getTs(b));
  const firstTs = sorted.length > 0 ? getTs(sorted[0]) : todayZero;
  const totalWeeks = Math.max(1, Math.ceil((now.getTime() - firstTs) / (7 * 24 * 3600 * 1000)));

  if (totalWeeks <= 12) {
    // 按周聚合 (最多 12 根柱)
    const curWeekMon = startOfWeek(now);
    const bars = [];
    const numWeeks = Math.min(12, Math.max(4, totalWeeks));
    for (let w = numWeeks - 1; w >= 0; w--) {
      const wStart = new Date(curWeekMon);
      wStart.setDate(wStart.getDate() - w * 7);
      const start = wStart.getTime();

      const wEnd = new Date(wStart);
      wEnd.setDate(wEnd.getDate() + 7);
      const end = wEnd.getTime();

      const weekRecs = list.filter(r => {
        const t = getTs(r);
        return t >= start && t < end;
      });
      const sec = weekRecs.reduce((s, r) => s + (Number(r.duration) || 0), 0);
      const isThisWeek = w === 0;

      bars.push({
        label: isThisWeek ? (lang === 'zh' ? '本周' : 'This week') : (lang === 'zh' ? `${w}周前` : `${w}w ago`),
        mins: Math.round(sec / 60),
        isToday: isThisWeek,
        isPast: true,
        startTs: start,
        endTs: end,
        records: weekRecs,
      });
    }
    return bars;
  } else {
    // 跨度超过 12 周：按自然月聚合 (显示最近 8 个月)
    const bars = [];
    for (let m = 7; m >= 0; m--) {
      const mStart = new Date(now.getFullYear(), now.getMonth() - m, 1);
      const mEnd = new Date(now.getFullYear(), now.getMonth() - m + 1, 1);
      const start = mStart.getTime();
      const end = mEnd.getTime();

      const monthRecs = list.filter(r => {
        const t = getTs(r);
        return t >= start && t < end;
      });
      const sec = monthRecs.reduce((s, r) => s + (Number(r.duration) || 0), 0);
      const isCurrentMonth = m === 0;

      const monthNum = mStart.getMonth() + 1;
      const monthLabel = lang === 'zh' ? `${monthNum}月` : mStart.toLocaleString('en', { month: 'short' });

      bars.push({
        label: monthLabel,
        mins: Math.round(sec / 60),
        isToday: isCurrentMonth,
        isPast: true,
        startTs: start,
        endTs: end,
        records: monthRecs,
      });
    }
    return bars;
  }
}

/**
 * 泛化行程趋势图分桶：使行程页趋势能够响应 today/week/month/all 变化
 */
export function computeTravelTrendBars(records = [], range = 'week', nowInput = new Date(), lang = 'zh') {
  const list = Array.isArray(records) ? records : [];
  const getTs = (r) => (r ? Number(r.timestamp || r.startTime) || 0 : 0);
  const now = new Date(nowInput);

  if (range === 'today') {
    const currentHour = now.getHours();
    const bars = [];
    for (let h = 0; h < 24; h += 3) {
      const slotStart = new Date(now);
      slotStart.setHours(h, 0, 0, 0);
      const start = slotStart.getTime();

      const slotEnd = new Date(now);
      slotEnd.setHours(h + 3, 0, 0, 0);
      const end = slotEnd.getTime();

      const slotRecords = list.filter(r => {
        const t = getTs(r);
        return t >= start && t < end;
      });
      bars.push({
        label: `${h}h`,
        count: slotRecords.length,
        mins: slotRecords.length,
        isToday: currentHour >= h && currentHour < h + 3,
        isPast: currentHour >= h,
        startTs: start,
        endTs: end,
        records: slotRecords,
      });
    }
    return bars;
  }

  if (range === 'week') {
    const curWeekMon = startOfWeek(now);
    const dayMapZh = ['', '周一', '周二', '周三', '周四', '周五', '周六', '周日'];
    const dayMapEn = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const curDayOfWeek = now.getDay() || 7;

    const bars = [];
    for (let d = 0; d < 7; d++) {
      const targetDate = new Date(curWeekMon);
      targetDate.setDate(targetDate.getDate() + d);
      const start = targetDate.getTime();

      const nextDate = new Date(targetDate);
      nextDate.setDate(nextDate.getDate() + 1);
      const end = nextDate.getTime();

      const dayIndex = d + 1;
      const dayRecs = list.filter(r => {
        const t = getTs(r);
        return t >= start && t < end;
      });
      const isToday = dayIndex === curDayOfWeek;

      bars.push({
        label: isToday ? (lang === 'zh' ? '今天' : 'Today') : (lang === 'zh' ? dayMapZh[dayIndex] : dayMapEn[dayIndex]),
        count: dayRecs.length,
        mins: dayRecs.length,
        isToday,
        isPast: dayIndex <= curDayOfWeek,
        startTs: start,
        endTs: end,
        records: dayRecs,
      });
    }
    return bars;
  }

  // 'all' 分支：按月聚合 (最近 8 个月)
  const bars = [];
  for (let m = 7; m >= 0; m--) {
    const mStart = new Date(now.getFullYear(), now.getMonth() - m, 1);
    const mEnd = new Date(now.getFullYear(), now.getMonth() - m + 1, 1);
    const start = mStart.getTime();
    const end = mEnd.getTime();

    const monthRecs = list.filter(r => {
      const t = getTs(r);
      return t >= start && t < end;
    });
    const isCurrentMonth = m === 0;
    const monthNum = mStart.getMonth() + 1;
    const monthLabel = lang === 'zh' ? `${monthNum}月` : mStart.toLocaleString('en', { month: 'short' });

    bars.push({
      label: monthLabel,
      count: monthRecs.length,
      mins: monthRecs.length,
      isToday: isCurrentMonth,
      isPast: true,
      startTs: start,
      endTs: end,
      records: monthRecs,
    });
  }
  return bars;
}


