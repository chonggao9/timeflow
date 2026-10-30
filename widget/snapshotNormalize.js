// @ts-check
// 纯函数：校正跨天快照数据（避免次日展示昨日打卡与分钟数）。
// 零外部依赖，可在 Node 测试脚本直接 require。

/**
 * @param {import('../src/types').WidgetSnapshot | null} snapshot
 * @param {number} [now]
 * @returns {import('../src/types').WidgetSnapshot | null}
 */
export function normalizeSnapshotForDay(snapshot, now = Date.now()) {
  if (!snapshot) return null;
  const snapshotDate = new Date(snapshot.updatedAt || 0).toDateString();
  const currentDate = new Date(now).toDateString();
  if (snapshotDate === currentDate) {
    return snapshot;
  }
  const startOfCurrent = new Date(now).setHours(0, 0, 0, 0);
  const startOfSnapshot = new Date(snapshot.updatedAt || 0).setHours(0, 0, 0, 0);
  const diffDays = Math.max(1, Math.round((startOfCurrent - startOfSnapshot) / 86400000));

  const validTodayRecords = (snapshot.travel?.todayRecords || []).filter(
    (r) => r.timestamp >= startOfCurrent && r.timestamp < startOfCurrent + 86400000
  );

  let past6 = (snapshot.focus?.past6DaysMinutes || [0, 0, 0, 0, 0, 0]).slice(0, 6);
  if (diffDays === 1) {
    past6 = [...past6.slice(1), snapshot.focus?.todayCompletedMinutes || 0];
  } else if (diffDays < 7) {
    const shift = diffDays - 1;
    past6 = [...past6.slice(diffDays), snapshot.focus?.todayCompletedMinutes || 0, ...Array(shift).fill(0)].slice(-6);
  } else {
    past6 = [0, 0, 0, 0, 0, 0];
  }

  return {
    ...snapshot,
    travel: {
      ...snapshot.travel,
      todayRecords: validTodayRecords,
      count: validTodayRecords.length,
    },
    focus: {
      todayCompletedMinutes: 0,
      past6DaysMinutes: past6,
    },
  };
}
