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
export function isPlaceholderName(name) {
  return !name || name === UNNAMED || name === '未知位置';
}

// ---- 地点聚类 ----
// 优先按坐标格点归并（约 0.005° ≈ 550m 一格），无坐标则退回地名。
// 这样即使国内反查地址失败（地名全是占位），统计也能按实际位置分开，不坍缩成一团。
export function placeKey(r) {
  if (r && typeof r.lat === 'number' && typeof r.lng === 'number') {
    return `g:${Math.round(r.lat * 200)}:${Math.round(r.lng * 200)}`;
  }
  return `n:${r?.locationName || UNNAMED}`;
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

  // 按天分组，天内按时间排序
  const byDay = {};
  for (const r of allRecords) {
    const day = new Date(r.timestamp).toDateString();
    if (!byDay[day]) byDay[day] = [];
    byDay[day].push(r);
  }

  for (const day of Object.values(byDay)) {
    const sorted = [...day].sort((a, b) => a.timestamp - b.timestamp);
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
