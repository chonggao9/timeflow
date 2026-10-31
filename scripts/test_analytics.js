#!/usr/bin/env node
/**
 * TimeFlow 统计与洞察纯函数单元测试
 * 覆盖：
 * 1. 同进度公平环比对比 (周一、月初、上期为0、闰年2月)
 * 2. 夏令时边界测试 (跨 2026-03-08 美东夏令时切换)
 * 3. 专注番茄数只统计完整番茄 (partial === 0) 与时长累计
 * 4. 月度日历热力图生成 (7列对齐、等级分配、下钻区间)
 * 5. 趋势图动态分桶
 */

const assert = require('assert');
const {
  startOfDay,
  startOfWeek,
  startOfMonth,
  computeLikeForLikeProgress,
  computeFocusMetrics,
  computeMonthHeatmap,
  computeTrendBars,
  computeTravelTrendBars,
  formatShortDuration,
} = require('../src/utils/analytics');

function runTest(name, fn) {
  try {
    fn();
    console.log(`  ✅ [PASS] ${name}`);
  } catch (e) {
    console.error(`  ❌ [FAIL] ${name}`);
    console.error(e);
    process.exit(1);
  }
}

console.log('--- 启动 TimeFlow 统计与洞察算法单元测试 ---');

// 1. 周一早晨同进度对比 (本周只过了几小时，只对比上周一对应同时刻之前)
runTest('周一早晨同进度环比：仅对比上周一对应时刻之前，上期为0返回null', () => {
  // 设为 2026-10-19 10:00:00 (周一)
  const mondayMorning = new Date(2026, 9, 19, 10, 0, 0);

  // 本周一 09:00 有一次 25 分钟专注
  const thisMonRecord = {
    id: 'f1',
    timestamp: new Date(2026, 9, 19, 9, 0, 0).getTime(),
    duration: 1500,
    partial: 0,
  };

  // 上期为 0 测试
  const resEmpty = computeLikeForLikeProgress([thisMonRecord], 'week', mondayMorning);
  assert.strictEqual(resEmpty.canCompare, false, '上期为0时不可比');
  assert.strictEqual(resEmpty.growthRate, null, '上期为0时增长率必须为null，严禁显示假+100%');
  assert.strictEqual(resEmpty.curTotalSec, 1500);
  assert.strictEqual(resEmpty.prevTotalSec, 0);

  // 上周一 08:30 有一次 25 分钟专注，上周二有专注 (但上周二在同进度之外，不应被计入)
  const lastMonRecord = {
    id: 'f_last_mon',
    timestamp: new Date(2026, 9, 12, 8, 30, 0).getTime(),
    duration: 1500,
    partial: 0,
  };
  const lastTueRecord = {
    id: 'f_last_tue',
    timestamp: new Date(2026, 9, 13, 15, 0, 0).getTime(),
    duration: 3000,
    partial: 0,
  };

  const resWeek = computeLikeForLikeProgress([thisMonRecord, lastMonRecord, lastTueRecord], 'week', mondayMorning);
  assert.strictEqual(resWeek.canCompare, true);
  assert.strictEqual(resWeek.prevTotalSec, 1500, '只统计上周一同时刻之前的专注，不包含上周二');
  assert.strictEqual(resWeek.growthRate, 0, '相同时长增长率为0%');
});

// 2. 月初同进度对比与闰年 2 月边界
runTest('月初同进度环比与闰年 2 月 (2028-02-29) 边界安全', () => {
  // 2028 年为闰年，测试 2028-03-01 12:00 对比 2028-02-01 12:00
  const marchFirstLeap = new Date(2028, 2, 1, 12, 0, 0);
  const curRec = {
    id: 'f_cur',
    timestamp: new Date(2028, 2, 1, 10, 0, 0).getTime(),
    duration: 3000,
  };
  const prevRec = {
    id: 'f_prev',
    timestamp: new Date(2028, 1, 1, 10, 0, 0).getTime(),
    duration: 1500,
  };

  const resMonth = computeLikeForLikeProgress([curRec, prevRec], 'month', marchFirstLeap);
  assert.strictEqual(resMonth.canCompare, true);
  assert.strictEqual(resMonth.curTotalSec, 3000);
  assert.strictEqual(resMonth.prevTotalSec, 1500);
  assert.strictEqual(resMonth.growthRate, 100, '3000 对比 1500 为 +100%');

  // 跨闰年 2 月末日测试：2028-02-29
  const leapDay = new Date(2028, 1, 29, 18, 0, 0);
  const leapRec = {
    id: 'f_leap',
    timestamp: leapDay.getTime() - 3600000,
    duration: 1200,
  };
  const resLeap = computeLikeForLikeProgress([leapRec], 'month', leapDay);
  assert.strictEqual(resLeap.curTotalSec, 1200);
});

// 3. 夏令时跨越边界 (跨 2026-03-08 美东时间夏令时切换)
runTest('夏令时边界安全：跨 2026-03-08 周保持日期对齐无错位', () => {
  // 2026-03-08 是美国夏令时切换日 (23 小时天)
  // 基准点设在 2026-03-09 周一
  const postDstMon = new Date(2026, 2, 9, 12, 0, 0);
  const monStart = startOfWeek(postDstMon);
  assert.strictEqual(monStart.getFullYear(), 2026);
  assert.strictEqual(monStart.getMonth(), 2);
  assert.strictEqual(monStart.getDate(), 9);
  assert.strictEqual(monStart.getHours(), 0);

  // 上周一应该准确落于 2026-03-02 00:00:00
  const lastMon = new Date(monStart);
  lastMon.setDate(lastMon.getDate() - 7);
  assert.strictEqual(lastMon.getDate(), 2);
  assert.strictEqual(lastMon.getHours(), 0, '夏令时日历跨越不能引起小时偏移');
});

// 4. 决策 1：番茄数只统计完整番茄，时长累计全部，副标显示提前结束次数
runTest('决策 1 指标口径：番茄数只计入完整记录，时长包含提前结束', () => {
  const records = [
    { id: '1', duration: 1500, partial: 0 }, // 完整 25min 番茄
    { id: '2', duration: 1500, partial: 0 }, // 完整 25min 番茄
    { id: '3', duration: 420, partial: 1 },  // 提前结束 7min
  ];

  const metrics = computeFocusMetrics(records, 1);
  assert.strictEqual(metrics.completedPomodoros, 2, '番茄数严格只统计完整番茄');
  assert.strictEqual(metrics.partialCount, 1, '准确统计提前结束次数');
  assert.strictEqual(metrics.totalDurationSec, 3420, '总时长真实包含提前结束记录');
  assert.strictEqual(metrics.maxSessionSec, 1500, '最长单次为1500秒');
  assert.strictEqual(metrics.avgPomodoroMin, 25, '平均完整番茄时长不被提前结束拉低');
});

// 5. 决策 2：月度日历热力图生成 (7列对齐，首尾补齐，等级划分)
runTest('决策 2 月度日历热力图：7 列对齐无手势冲突，颜色等级正确', () => {
  const now = new Date(2026, 9, 15); // 2026 年 10 月 (31 天，1号是周四)
  const testRecs = [
    { timestamp: new Date(2026, 9, 5, 10, 0).getTime(), duration: 1800 },
    { timestamp: new Date(2026, 9, 15, 14, 0).getTime(), duration: 7200 },
  ];

  const heatmap = computeMonthHeatmap(testRecs, now, (recs) => recs.reduce((s, r) => s + r.duration, 0) / 60);
  assert.strictEqual(heatmap.year, 2026);
  assert.strictEqual(heatmap.month, 10);
  assert.ok(heatmap.rows.length >= 5 && heatmap.rows.length <= 6, '一个月应为 5 到 6 行');
  assert.ok(heatmap.rows.every(r => r.length === 7), '每行必须严格为 7 列');

  // 15 号有 120 分钟 (最大值)，level 必须为 4
  const day15Cell = heatmap.rows.flat().find(c => c.isCurrentMonth && c.dayOfMonth === 15);
  assert.ok(day15Cell);
  assert.strictEqual(day15Cell.value, 120);
  assert.strictEqual(day15Cell.level, 4);

  // 无记录的日期 level 为 0
  const day1Cell = heatmap.rows.flat().find(c => c.isCurrentMonth && c.dayOfMonth === 1);
  assert.strictEqual(day1Cell.level, 0);
});

// 6. 趋势图动态分桶 (all 模式：<=12 周按周，>12 周按月)
runTest('趋势图分桶算法：all 模式跨度短按周、跨度长按月', () => {
  const now = new Date(2026, 9, 30);

  // 场景 A: 仅 3 周前数据 -> 按周聚合
  const recsShort = [
    { timestamp: now.getTime() - 21 * 24 * 3600 * 1000, duration: 1500 },
  ];
  const barsWeek = computeTrendBars(recsShort, 'all', now, 'zh');
  assert.ok(barsWeek.length <= 12);
  assert.ok(barsWeek[barsWeek.length - 1].label === '本周');

  // 场景 B: 6 个月前数据 -> 按月聚合
  const recsLong = [
    { timestamp: now.getTime() - 180 * 24 * 3600 * 1000, duration: 1500 },
  ];
  const barsMonth = computeTrendBars(recsLong, 'all', now, 'zh');
  assert.strictEqual(barsMonth.length, 8);
  assert.ok(barsMonth[barsMonth.length - 1].label.includes('月'));
});

// 7. formatShortDuration 格式化测试
runTest('formatShortDuration：正确格式化秒数 (0m, <1m, Xm, Xh, Xh Ym 及非法防御)', () => {
  assert.strictEqual(formatShortDuration(0), '0m');
  assert.strictEqual(formatShortDuration(-10), '0m');
  assert.strictEqual(formatShortDuration(45), '<1m');
  assert.strictEqual(formatShortDuration(60), '1m');
  assert.strictEqual(formatShortDuration(1500), '25m');
  assert.strictEqual(formatShortDuration(3600), '1h');
  assert.strictEqual(formatShortDuration(3660), '1h 1m');
  assert.strictEqual(formatShortDuration(7325), '2h 2m');
  assert.strictEqual(formatShortDuration(null), '0m');
  assert.strictEqual(formatShortDuration(undefined), '0m');
  assert.strictEqual(formatShortDuration('invalid'), '0m');
});

console.log('\n🎉 TimeFlow 统计与洞察全部核心单元测试通过！\n');
