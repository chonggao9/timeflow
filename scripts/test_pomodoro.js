/**
 * TimeFlow 番茄状态机单元测试（node + assert，无 jest，风格同 test_backup.js）
 * 只测纯函数模块（src/pomodoro/engine.js）与可注入假 storage 的 stateStore，
 * 不触碰 RN/expo API（settle.js/notifications.js 的编排依赖 expo，归真机验证）。
 * 覆盖：
 * 1. 出厂默认 / start 幂等 / 暂停恢复时间守恒 / 边界 / reset / switchMode
 * 2. deriveDisplay：运行派生、惰性结束不改 state、暂停、跨天归零
 * 3. 4 番茄长休循环、settle 双出口（focus 入队 harvested / 休息不落库）、防重复结算
 * 4. endAt 过期恢复（进程被杀）、focusMin 自定义、ackHarvest FIFO 与队列上限
 * 5. normalizeState：v2 容错 + v1(timeflow_active_focus) 迁移换算 + 坏数据兜底
 * 6. saveStateCAS 乐观锁、loadState 旧 key 迁移（复制不删除）
 */

const assert = require('assert');

const {
  createState, start, pause, resume, reset, switchMode, setFocusMin,
  isEnded, nextModeAfterEnd, settle, deriveDisplay, ackHarvest,
  normalizeState, todayKey, durationMs, fmtHHMM,
  SHORT_MS, LONG_MS, MAX_PENDING_HARVESTS, LEGACY_ACTIVE_KEY,
} = require('../src/pomodoro/engine');

const { __useStorage, loadState, saveState, saveStateCAS, STATE_KEY } = require('../src/pomodoro/stateStore');

const failures = [];
function test(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => console.log(`  ✅ [PASS] ${name}`))
    .catch((err) => {
      failures.push(name);
      console.error(`  ❌ [FAIL] ${name}`);
      console.error(err && err.message ? `     ${err.message}` : err);
    });
}

function makeFakeStorage(initial = {}) {
  const map = { ...initial };
  return {
    map,
    async getItem(k) { return Object.prototype.hasOwnProperty.call(map, k) ? map[k] : null; },
    async setItem(k, v) { map[k] = String(v); },
    async removeItem(k) { delete map[k]; },
  };
}

// 固定时钟：2026-10-15 10:00:00 本地
const T0 = new Date(2026, 9, 15, 10, 0, 0).getTime();
const MIN = 60 * 1000;

async function main() {
  console.log('--- 启动 TimeFlow 番茄状态机单元测试 ---');

  await test('createState 出厂默认：focus/25min/停止/completedToday=0', () => {
    const s = createState({ now: T0 });
    assert.strictEqual(s.v, 2);
    assert.strictEqual(s.mode, 'focus');
    assert.strictEqual(s.running, false);
    assert.strictEqual(s.endAt, null);
    assert.strictEqual(s.remainingMs, 25 * MIN);
    assert.strictEqual(s.completedToday, 0);
    assert.strictEqual(s.completedDate, todayKey(T0));
    assert.deepStrictEqual(s.pendingHarvests, []);
  });

  await test('start：endAt=now+remaining、sessionId=focus-startTs；running 中再 start 幂等', () => {
    const s0 = createState({ now: T0 });
    const s1 = start(s0, T0);
    assert.strictEqual(s1.running, true);
    assert.strictEqual(s1.startTs, T0);
    assert.strictEqual(s1.endAt, T0 + 25 * MIN);
    assert.strictEqual(s1.sessionId, `focus-${T0}`);
    assert.strictEqual(start(s1, T0 + 1000), s1); // 幂等：原对象返回
  });

  await test('pause/resume 时间守恒：多次暂停总时长不变', () => {
    let s = start(createState({ now: T0 }), T0);
    s = pause(s, T0 + 5 * MIN);
    assert.strictEqual(s.remainingMs, 20 * MIN);
    assert.strictEqual(s.running, false);
    assert.strictEqual(s.endAt, null);
    s = resume(s, T0 + 10 * MIN);
    assert.strictEqual(s.endAt, T0 + 10 * MIN + 20 * MIN); // 暂停的 5 分钟被"退还"
    s = pause(s, T0 + 20 * MIN);
    assert.strictEqual(s.remainingMs, 10 * MIN);
    s = resume(s, T0 + 60 * MIN);
    assert.strictEqual(s.endAt, T0 + 70 * MIN);
  });

  await test('pause 边界：now 超过 endAt 时 remainingMs=0 不为负', () => {
    const s = start(createState({ now: T0 }), T0);
    const p = pause(s, s.endAt + 1000);
    assert.strictEqual(p.remainingMs, 0);
  });

  await test('reset：回当前模式满时长并停止；不影响 completedToday', () => {
    let s = start(createState({ now: T0 }), T0);
    s = { ...s, completedToday: 2 };
    const r = reset(s, T0 + 3 * MIN);
    assert.strictEqual(r.running, false);
    assert.strictEqual(r.remainingMs, 25 * MIN);
    assert.strictEqual(r.sessionId, null);
    assert.strictEqual(r.completedToday, 2);
    const rl = reset(switchMode(s, 'long', T0), T0);
    assert.strictEqual(rl.remainingMs, LONG_MS);
  });

  await test('switchMode：running 中切换 → 停止且新模式满时长', () => {
    const s = start(createState({ now: T0 }), T0);
    const l = switchMode(s, 'long', T0 + MIN);
    assert.strictEqual(l.mode, 'long');
    assert.strictEqual(l.running, false);
    assert.strictEqual(l.remainingMs, LONG_MS);
    assert.strictEqual(switchMode(s, 'bogus', T0), s); // 非法模式原样返回
  });

  await test('deriveDisplay 运行中：remaining 递减、progress 0→1、状态枚举正确', () => {
    const s = start(createState({ now: T0 }), T0);
    const d1 = deriveDisplay(s, T0 + 5 * MIN);
    assert.strictEqual(d1.remainingMs, 20 * MIN);
    assert.ok(Math.abs(d1.progress - 0.2) < 1e-9);
    assert.strictEqual(d1.status, 'focusing');
    assert.strictEqual(d1.endsAtHHMM, fmtHHMM(T0 + 25 * MIN));
    const rest = start(switchMode(s, 'short', T0), T0);
    assert.strictEqual(deriveDisplay(rest, T0 + MIN).status, 'resting');
  });

  await test('deriveDisplay 惰性结束：ended 显示待开始，且原 state 逐字段不变', () => {
    const s = start(createState({ now: T0 }), T0);
    const snapshot = JSON.stringify(s);
    const d = deriveDisplay(s, s.endAt + 1);
    assert.strictEqual(d.ended, true);
    assert.strictEqual(d.running, false);
    assert.strictEqual(d.remainingMs, 0);
    assert.strictEqual(d.progress, 1);
    assert.strictEqual(d.status, 'idle');
    assert.strictEqual(d.endsAtHHMM, null);
    assert.strictEqual(JSON.stringify(s), snapshot); // 迁移只属于 settle
  });

  await test('deriveDisplay 暂停 / 跨天：paused 状态；completedDate 过期显示 0', () => {
    const s = pause(start(createState({ now: T0 }), T0), T0 + 5 * MIN);
    assert.strictEqual(deriveDisplay(s, T0 + 6 * MIN).status, 'paused');
    const stale = { ...createState({ now: T0 }), completedToday: 3, completedDate: '2026-10-14' };
    assert.strictEqual(deriveDisplay(stale, T0).completedToday, 0);
  });

  await test('nextModeAfterEnd：第 1/2/3 个番茄→short，第 4/8 个→long；休息→focus', () => {
    const base = createState({ now: T0 });
    assert.strictEqual(nextModeAfterEnd({ ...base, completedToday: 0 }), 'short');
    assert.strictEqual(nextModeAfterEnd({ ...base, completedToday: 2 }), 'short');
    assert.strictEqual(nextModeAfterEnd({ ...base, completedToday: 3 }), 'long');
    assert.strictEqual(nextModeAfterEnd({ ...base, completedToday: 7 }), 'long');
    assert.strictEqual(nextModeAfterEnd({ ...base, mode: 'short' }), 'focus');
    assert.strictEqual(nextModeAfterEnd({ ...base, mode: 'long' }), 'focus');
  });

  await test('settle 专注结束：completedToday+1、入队 harvested、切休息待开始', () => {
    const s = start({ ...createState({ now: T0 }), category: 'work', goalName: '写周报' }, T0);
    const { state, harvested } = settle(s, s.endAt);
    assert.ok(harvested);
    assert.strictEqual(harvested.sessionId, s.sessionId);
    assert.strictEqual(harvested.durationSec, 1500);
    assert.strictEqual(harvested.category, 'work');
    assert.strictEqual(harvested.goalName, '写周报');
    assert.strictEqual(state.completedToday, 1);
    assert.strictEqual(state.mode, 'short');
    assert.strictEqual(state.remainingMs, SHORT_MS);
    assert.strictEqual(state.running, false);
    assert.strictEqual(state.settledEndAt, s.endAt);
    assert.strictEqual(state.pendingHarvests.length, 1);
    assert.strictEqual(state.pendingHarvests[0].sessionId, s.sessionId);
  });

  await test('settle 休息结束：回 focus 满时长待开始，harvested=null 不入队', () => {
    let s = start(createState({ now: T0 }), T0);
    s = settle(s, s.endAt).state; // → short 待开始
    s = start(s, T0 + 30 * MIN);
    const { state, harvested } = settle(s, s.endAt);
    assert.strictEqual(harvested, null);
    assert.strictEqual(state.mode, 'focus');
    assert.strictEqual(state.remainingMs, 25 * MIN);
    assert.strictEqual(state.pendingHarvests.length, 1); // 只有 focus 那条
  });

  await test('防重复结算：二次 settle no-op；未结束 no-op；新轮不受旧水位线误伤', () => {
    const s = start(createState({ now: T0 }), T0);
    const first = settle(s, s.endAt);
    const second = settle(first.state, s.endAt + 5000);
    assert.strictEqual(second.harvested, null);
    assert.deepStrictEqual(second.state, first.state);
    const noop = settle(first.state, T0);
    assert.strictEqual(noop.harvested, null);
    // 新一轮（休息后开始专注再结束）正常结算
    let n = start(first.state, T0 + 40 * MIN);
    n = settle(n, T0 + 45 * MIN).state; // short 结束 → focus
    let f = start(n, T0 + 50 * MIN);
    const r = settle(f, f.endAt);
    assert.ok(r.harvested);
    assert.strictEqual(r.state.completedToday, 2);
    assert.notStrictEqual(r.harvested.sessionId, first.harvested.sessionId);
  });

  await test('endAt 过期恢复（进程被杀）：isEnded→settle，durationSec 仍为满时长', () => {
    const s = start(createState({ now: T0 }), T0);
    const muchLater = s.endAt + 10 * MIN;
    assert.strictEqual(isEnded(s, muchLater), true);
    const { state, harvested } = settle(s, muchLater);
    assert.strictEqual(harvested.durationSec, 1500); // 非墙钟差值 2100
    assert.strictEqual(state.completedDate, todayKey(s.endAt)); // 归属日按结束时刻
  });

  await test('focusMin 自定义：setFocusMin(45) 后 start/settle 全链路', () => {
    let s = setFocusMin(createState({ now: T0 }), 45, T0);
    assert.strictEqual(s.remainingMs, 45 * MIN);
    s = start(s, T0);
    assert.strictEqual(s.endAt, T0 + 45 * MIN);
    const { harvested } = settle(s, s.endAt);
    assert.strictEqual(harvested.durationSec, 2700);
    // 运行中改 focusMin 不影响本轮
    const running = start(createState({ now: T0 }), T0);
    assert.strictEqual(setFocusMin(running, 60, T0).endAt, running.endAt);
    assert.strictEqual(durationMs(setFocusMin(createState({ now: T0 }), 60, T0)), 60 * MIN);
  });

  await test('ackHarvest：FIFO 出队 / 按 sessionId 出队；队列上限 10', () => {
    let s = createState({ now: T0 });
    for (let i = 0; i < 12; i++) {
      s = start({ ...s, mode: 'focus', remainingMs: 25 * MIN, running: false }, T0 + i * 30 * MIN);
      s = settle(s, s.endAt).state;
      s = { ...s, mode: 'focus', remainingMs: 25 * MIN }; // 模拟跳过休息直接下一轮
    }
    assert.strictEqual(s.pendingHarvests.length, MAX_PENDING_HARVESTS);
    const oldest = s.pendingHarvests[0];
    const afterFifo = ackHarvest(s);
    assert.strictEqual(afterFifo.pendingHarvests.length, MAX_PENDING_HARVESTS - 1);
    assert.strictEqual(afterFifo.pendingHarvests.includes(oldest), false);
    const target = s.pendingHarvests[3];
    const afterId = ackHarvest(s, target.sessionId);
    assert.strictEqual(afterId.pendingHarvests.find((h) => h.sessionId === target.sessionId), undefined);
    const empty = createState({ now: T0 });
    assert.strictEqual(ackHarvest(empty), empty); // 空队列原样返回
    assert.strictEqual(ackHarvest(s, 'no-such-id'), s); // 未命中原样返回
  });

  await test('normalizeState v2 容错：缺字段修正、running 无 endAt 视为停止', () => {
    const fixed = normalizeState({ v: 2, mode: 'short', running: true }, T0);
    assert.strictEqual(fixed.running, false); // running 但无 endAt → 修正
    assert.strictEqual(fixed.mode, 'short');
    assert.strictEqual(fixed.remainingMs, SHORT_MS); // 缺 remainingMs → 按当前模式满时长修正
    const bad = normalizeState(null, T0);
    assert.strictEqual(bad.mode, 'focus');
    assert.strictEqual(normalizeState('corrupt', T0).v, 2);
    assert.strictEqual(normalizeState({ v: 2, mode: 'bogus' }, T0).mode, 'focus');
  });

  await test('normalizeState v1 迁移：running 按 pausedTotalSec 换算 endAt（过期保留 running）', () => {
    const v1 = {
      sessionId: 'focus-legacy', phase: 'running', startTs: T0,
      totalDurationSec: 1500, pausedTotalSec: 120, durationMin: 25,
      category: 'work', goalName: 'g', ambient: 'rain',
    };
    const now = T0 + 10 * MIN;
    const s = normalizeState(v1, now);
    assert.strictEqual(s.v, 2);
    assert.strictEqual(s.running, true);
    assert.strictEqual(s.endAt, T0 + 1500 * 1000 + 120 * 1000);
    assert.strictEqual(s.remainingMs, s.endAt - now);
    assert.strictEqual(s.focusMin, 25);
    assert.strictEqual(s.category, 'work');
    assert.strictEqual(s.sessionId, 'focus-legacy');
    // endAt 已过期：保留 running，让首次 settle 正常结算这一轮
    const late = normalizeState(v1, T0 + 60 * MIN);
    assert.strictEqual(late.running, true);
    assert.strictEqual(isEnded(late, T0 + 60 * MIN), true);
    assert.ok(settle(late, T0 + 60 * MIN).harvested);
  });

  await test('normalizeState v1 迁移：paused 扣 lastPauseTs 未结算段；done/坏数据兜底', () => {
    const now = T0 + 10 * MIN;
    const paused = normalizeState({
      phase: 'paused', startTs: T0, totalDurationSec: 1500,
      pausedTotalSec: 60, lastPauseTs: T0 + 8 * MIN, durationMin: 25,
    }, now);
    // elapsed=10min，已记暂停 1min，本次暂停段 2min → 有效耗时 7min → 剩 18min
    assert.strictEqual(paused.running, false);
    assert.strictEqual(paused.remainingMs, 18 * MIN);
    for (const bad of [{ phase: 'done', startTs: T0 }, { phase: 'idle' }, { phase: 'running' }]) {
      const s = normalizeState(bad, now);
      assert.strictEqual(s.running, false);
      assert.strictEqual(s.remainingMs, 25 * MIN);
    }
  });

  await test('saveStateCAS：updatedAt 不匹配 → ok:false 且不写；匹配 → 写入且版本号刷新', async () => {
    const fake = makeFakeStorage();
    __useStorage(fake);
    const saved = await saveState(createState({ now: T0 }));
    const raw = JSON.parse(fake.map[STATE_KEY]);
    assert.strictEqual(raw.updatedAt, saved.updatedAt);

    const bad = await saveStateCAS(saved.updatedAt + 999, (s) => ({ ...s, completedToday: 99 }));
    assert.strictEqual(bad.ok, false);
    assert.strictEqual(JSON.parse(fake.map[STATE_KEY]).completedToday, 0); // 未写入

    const good = await saveStateCAS(saved.updatedAt, (s) => ({ ...s, completedToday: 3 }));
    assert.strictEqual(good.ok, true);
    assert.strictEqual(good.state.completedToday, 3);
    assert.ok(typeof good.state.updatedAt === 'number' && good.state.updatedAt >= saved.updatedAt);
    assert.strictEqual(JSON.parse(fake.map[STATE_KEY]).completedToday, 3);
  });

  await test('loadState：无 key 兜底 createState；旧 key 一次性迁移且复制不删除', async () => {
    __useStorage(makeFakeStorage());
    const fresh = await loadState(T0);
    assert.strictEqual(fresh.v, 2);
    assert.strictEqual(fresh.mode, 'focus');

    const legacy = JSON.stringify({
      sessionId: 'focus-x', phase: 'running', startTs: T0,
      totalDurationSec: 1500, pausedTotalSec: 0, durationMin: 30,
    });
    const fake = makeFakeStorage({ [LEGACY_ACTIVE_KEY]: legacy });
    __useStorage(fake);
    // store.js 在 node 下 require 失败被吞（completedToday 回退 0），迁移照常
    const migrated = await loadState(T0 + 5 * MIN);
    assert.strictEqual(migrated.v, 2);
    assert.strictEqual(migrated.focusMin, 30);
    assert.strictEqual(migrated.running, true);
    assert.ok(fake.map[STATE_KEY]); // 迁移结果已落盘
    assert.strictEqual(fake.map[LEGACY_ACTIVE_KEY], legacy); // 旧 key 保留（回滚保险）
  });

  await test('runMs 临时轮次时长：5分钟轮、结算300秒、reset清空回默认时长', () => {
    // 1. 设置 runMs 为 5 分钟
    let s = createState({ now: T0, focusMin: 25 });
    s.runMs = 5 * MIN;
    assert.strictEqual(durationMs(s), 5 * MIN);
    s.extraMs = 2 * MIN;
    assert.strictEqual(durationMs(s), 7 * MIN); // extraMs 叠加在 runMs 上

    // 2. 启动并结算
    s.extraMs = 0;
    s.remainingMs = 5 * MIN;
    s = start(s, T0);
    assert.strictEqual(s.endAt, T0 + 5 * MIN);
    const { state: next, harvested } = settle(s, T0 + 5 * MIN);
    assert.ok(harvested);
    assert.strictEqual(harvested.durationSec, 300); // 结算为 300 秒
    assert.strictEqual(next.runMs, null); // settle 后自动清空 runMs

    // 3. reset 同样清空 runMs 回归默认 focusMin
    s.runMs = 5 * MIN;
    const resetState = reset(s, T0);
    assert.strictEqual(resetState.runMs, null);
    assert.strictEqual(resetState.remainingMs, 25 * MIN);
  });

  await test('待收获队列满 10 条守卫：start 拦截打上 blocked，settle 保持 running+过期 endAt', () => {
    let s = createState({ now: T0 });
    // 塞满 10 条
    s.pendingHarvests = Array(MAX_PENDING_HARVESTS).fill(0).map((_, i) => ({
      sessionId: `focus-${i}`,
      startTs: T0,
      endAt: T0 + 25 * MIN,
      durationSec: 1500,
      category: 'work',
      goalName: '',
      ambient: 'none',
      completedToday: i + 1,
    }));

    // 1. 尝试 start 开启新番茄：被守卫拦截，保持停止并标 blocked: true
    const blockedStart = start(s, T0);
    assert.strictEqual(blockedStart.running, false);
    assert.strictEqual(blockedStart.blocked, true);

    // 2. 模拟已有番茄运行中到点 settle：拒绝入队丢弃旧记录，标 blocked: true，保持 running 与过期 endAt
    const runningExpired = { ...s, running: true, endAt: T0 + 25 * MIN };
    const { state: settledBlocked, harvested } = settle(runningExpired, T0 + 30 * MIN);
    assert.strictEqual(harvested, null);
    assert.strictEqual(settledBlocked.running, true);
    assert.strictEqual(settledBlocked.blocked, true);
    assert.strictEqual(settledBlocked.endAt, T0 + 25 * MIN);
    assert.strictEqual(settledBlocked.pendingHarvests.length, MAX_PENDING_HARVESTS);
  });

  __useStorage(null);

  console.log('');
  if (failures.length) {
    console.error(`❌ ${failures.length} 个用例失败：${failures.join('、')}`);
    process.exit(1);
  }
  console.log('✅ 番茄状态机全部用例通过');
}

main().catch((e) => { console.error(e); process.exit(1); });
