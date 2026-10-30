// @ts-check
// 数据内容哈希：用于「数据没有变化就不生成新备份」的跳过判定。
// 纯函数模块（仅依赖 crypto-js），可在 node 测试脚本中直接 require。
// 沿用旧版规范化思路：只取参与一致性对比的稳定字段，忽略易变外部量。
import CryptoJS from 'crypto-js';

/**
 * @param {{ records?: any[], trips?: any[], focusSessions?: any[], prefs?: any }} [data]
 * @returns {string}
 */
export function computeContentHash(data) {
  const normTrips = (data?.trips || []).map((t) => ({
    id: t.id, start: t.startTs ?? t.start_ts, end: t.endTs ?? t.end_ts, name: t.name ?? null,
  }));
  const normRecords = (data?.records || []).map((r) => ({
    id: r.id, ts: r.timestamp, loc: (r.locationName ?? r.location_name) || null,
    lat: r.lat ?? null, lng: r.lng ?? null, mode: r.mode, trip: r.tripId ?? r.trip_id,
  }));
  const normFocus = (data?.focusSessions || []).map((f) => ({
    id: f.id, ts: f.timestamp, goal: (f.goalName ?? f.goal_name) || null,
    dur: f.duration, cat: f.category ?? null, note: f.note ?? null,
  }));
  const raw = JSON.stringify({
    trips: normTrips, records: normRecords, focus: normFocus, prefs: data?.prefs || {},
  });
  return CryptoJS.SHA256(raw).toString(CryptoJS.enc.Hex);
}
