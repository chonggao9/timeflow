// 计算中位数
export function median(arr) {
  if (!arr.length) return null;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

// IQR 异常值过滤
export function filterOutliers(arr) {
  if (arr.length < 4) return arr;
  const sorted = [...arr].sort((a, b) => a - b);
  const q1 = sorted[Math.floor(sorted.length * 0.25)];
  const q3 = sorted[Math.floor(sorted.length * 0.75)];
  const iqr = q3 - q1;
  return sorted.filter(v => v <= q3 + 1.5 * iqr);
}

// 从打卡记录中计算路段统计
// records: 按时间排序的今日记录数组
// 返回: { fromName, toName, medianSec, sampleCount }[]
export function computePathStats(allRecords) {
  // 按相邻打卡点对分组
  const pathMap = {};

  // 按天分组，每天内按时间排序
  const byDay = {};
  for (const r of allRecords) {
    const day = new Date(r.timestamp).toDateString();
    if (!byDay[day]) byDay[day] = [];
    byDay[day].push(r);
  }

  for (const day of Object.values(byDay)) {
    const sorted = [...day].sort((a, b) => a.timestamp - b.timestamp);
    for (let i = 0; i < sorted.length - 1; i++) {
      const from = sorted[i];
      const to = sorted[i + 1];
      const key = `${from.locationName}→${to.locationName}|${to.mode || 'unknown'}`;
      const sec = (to.timestamp - from.timestamp) / 1000;
      if (sec > 0 && sec < 86400) { // 忽略超过24小时的异常
        if (!pathMap[key]) pathMap[key] = { fromName: from.locationName, toName: to.locationName, mode: to.mode, durations: [] };
        pathMap[key].durations.push(sec);
      }
    }
  }

  return Object.values(pathMap).map(p => {
    const clean = filterOutliers(p.durations);
    const sorted = [...clean].sort((a, b) => a - b);
    return {
      fromName: p.fromName,
      toName: p.toName,
      mode: p.mode,
      medianSec: Math.round(median(clean)),
      minSec: Math.round(sorted[0]),
      maxSec: Math.round(sorted[sorted.length - 1]),
      sampleCount: clean.length,
    };
  }).filter(p => p.sampleCount >= 2); // 至少2次才展示
}

// 秒数格式化为"X分钟"
export function formatDuration(sec) {
  if (!sec) return '--';
  const m = Math.round(sec / 60);
  if (m < 1) return '不到1分钟';
  return `${m}分钟`;
}

// 时间戳格式化为 HH:MM
export function formatTime(ts) {
  const d = new Date(ts);
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}
