// ---- 基础统计 ----
export function median(arr) {
  if (!arr.length) return null;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function filterOutliers(arr) {
  if (arr.length < 4) return arr;
  const sorted = [...arr].sort((a, b) => a - b);
  const q1 = sorted[Math.floor(sorted.length * 0.25)];
  const q3 = sorted[Math.floor(sorted.length * 0.75)];
  const iqr = q3 - q1;
  return sorted.filter(v => v <= q3 + 1.5 * iqr);
}

// ---- 地名占位 ----
export const UNNAMED = '未命名';
// 引用 store 里的 legacy 常量，避免循环依赖：这里直接用字符串标记
const LEGACY_TRIP = 'legacy';
export function isPlaceholderName(name) {
  return !name || name === UNNAMED || name === '未知位置';
}

// ---- 地点聚类 ----
// 有真名优先按名字归并（改地名立即生效、一个点多个名字各自成条）；占位名（未命名）且
// 有坐标仍按坐标格点（约 0.005° ≈ 550m 一格）分开，避免一堆"未命名"坍缩成一团。
export function placeKey(r) {
  const name = r?.locationName;
  if (name && !isPlaceholderName(name)) return `n:${name}`;
  if (r && typeof r.lat === 'number' && typeof r.lng === 'number') {
    return `g:${Math.round(r.lat * 200)}:${Math.round(r.lng * 200)}`;
  }
  return `n:${name || UNNAMED}`;
}

// 从一堆记录里挑最有代表性的地名标签（非占位、出现最多）；全占位则用占位
function pickLabel(counter) {
  let best = null, bestC = 0;
  for (const name in counter) {
    if (isPlaceholderName(name)) continue;
    if (counter[name] > bestC) { bestC = counter[name]; best = name; }
  }
  return best || UNNAMED;
}

// ---- 路段统计 ----
// records: 所有打卡记录
// 返回: { fromName, toName, fromKey, toKey, mode, medianSec, minSec, maxSec, sampleCount }[]
export function computePathStats(allRecords) {
  const pathMap = {};
  const placeNames = {}; // placeKey -> { 地名: 次数 }

  const countPlace = (key, name) => {
    if (!placeNames[key]) placeNames[key] = {};
    const nm = name || UNNAMED;
    placeNames[key][nm] = (placeNames[key][nm] || 0) + 1;
  };

  // 按行程分组：同一条行程内相邻点才算路段，不同行程断开不串线
  const byTrip = {};
  for (const r of allRecords) {
    const trip = r.tripId || LEGACY_TRIP;
    if (!byTrip[trip]) byTrip[trip] = [];
    byTrip[trip].push(r);
  }

  for (const tripRecords of Object.values(byTrip)) {
    const sorted = [...tripRecords].sort((a, b) => a.timestamp - b.timestamp);
    for (let i = 0; i < sorted.length; i++) {
      countPlace(placeKey(sorted[i]), sorted[i].locationName);
    }
    for (let i = 0; i < sorted.length - 1; i++) {
      const from = sorted[i], to = sorted[i + 1];
      const fromKey = placeKey(from), toKey = placeKey(to);
      const key = `${fromKey}→${toKey}|${to.mode || 'unknown'}`;
      const sec = (to.timestamp - from.timestamp) / 1000;
      if (sec > 0 && sec < 86400) {
        if (!pathMap[key]) {
          pathMap[key] = { fromKey, toKey, mode: to.mode, durations: [] };
        }
        pathMap[key].durations.push(sec);
      }
    }
  }

  return Object.values(pathMap).map(p => {
    const clean = filterOutliers(p.durations);
    const sorted = [...clean].sort((a, b) => a - b);
    return {
      fromName: pickLabel(placeNames[p.fromKey]),
      toName: pickLabel(placeNames[p.toKey]),
      fromKey: p.fromKey,
      toKey: p.toKey,
      mode: p.mode,
      medianSec: Math.round(median(clean)),
      p25Sec: Math.round(sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.25))]),
      p75Sec: Math.round(sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.75))]),
      minSec: Math.round(sorted[0]),
      maxSec: Math.round(sorted[sorted.length - 1]),
      sampleCount: clean.length,
    };
  }).filter(p => p.sampleCount >= 2);
}

// ---- 格式化 ----
export function formatDuration(sec, lang = 'zh') {
  if (!sec) return '--';
  const m = Math.round(sec / 60);
  if (m < 1) return lang === 'en' ? '<1 min' : '不到1分钟';
  if (m < 60) return lang === 'en' ? `${m} min` : `${m}分钟`;
  const h = Math.floor(m / 60), r = m % 60;
  if (lang === 'en') return r ? `${h}h ${r}m` : `${h}h`;
  return r ? `${h}小时${r}分` : `${h}小时`;
}

export function formatTime(ts) {
  const d = new Date(ts);
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}
