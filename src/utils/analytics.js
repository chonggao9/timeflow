// 历史数据分析：端到端 A→B 行程查询（含中间停靠）、地点清单、耗时直方图。
import { placeKey, median, UNNAMED, isPlaceholderName } from './stats';

// 地点清单：placeKey → { key, name, count }（按次数降序），供 A→B 选择器用
export function getPlaceOptions(records) {
  const map = new Map();
  for (const r of records) {
    const key = placeKey(r);
    if (!map.has(key)) map.set(key, { key, names: {}, count: 0 });
    const e = map.get(key);
    e.count++;
    const nm = isPlaceholderName(r.locationName) ? UNNAMED : r.locationName;
    e.names[nm] = (e.names[nm] || 0) + 1;
  }
  return [...map.values()]
    .map(e => {
      const best = Object.entries(e.names).sort((a, b) => b[1] - a[1])[0][0];
      return { key: e.key, name: best === UNNAMED ? UNNAMED : best, count: e.count };
    })
    .sort((a, b) => b.count - a.count);
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
  const nameMap = new Map(getPlaceOptions(records).map(o => [o.key, o.name]));

  // 按行程分组、按时间排序
  const byTrip = new Map();
  for (const r of records) {
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
          segs.push({ fromKey: fk, toKey: tk, sec: e.timestamp - s.timestamp });
        }
        spans.push({ duration, startTs: A.timestamp, hour: new Date(A.timestamp).getHours(), mode: A.mode, keys, segs });
      }
      aIdx = sorted.findIndex((r, i) => i > bIdx && placeKey(r) === fromKey);
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

  return {
    fromName: nameMap.get(fromKey) || UNNAMED,
    toName: nameMap.get(toKey) || UNNAMED,
    sampleCount: spans.length,
    medianSec: Math.round(median(durations)),
    p25Sec: Math.round(pct(0.25)),
    p75Sec: Math.round(pct(0.75)),
    minSec: Math.round(durations[0]),
    maxSec: Math.round(durations[durations.length - 1]),
    mode,
    durations: durations.map(d => Math.round(d / 60000)), // 分钟（供分布图）
    hourDist,
    weeklyTrend, // 8 值，最新在末位（null=无样本）
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
