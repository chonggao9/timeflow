// @ts-check
/** 一天的毫秒数：24 * 60 * 60 * 1000 */
export const DAY_MS = 86400000;

/**
 * 获取本地指定时刻的当日零点时间戳 (epoch ms)
 * @param {number | Date} [ts]
 * @returns {number}
 */
export function dayStart(ts = Date.now()) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/**
 * 增加或减少指定天数
 * @param {number | Date} ts
 * @param {number} days
 * @returns {number}
 */
export function addDays(ts, days) {
  const d = new Date(ts);
  d.setDate(d.getDate() + days);
  return d.getTime();
}
