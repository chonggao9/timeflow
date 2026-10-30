// @ts-check
// 番茄状态持久化层：AsyncStorage IO + 旧 key 一次性迁移 + CAS 乐观锁。
// App（PomodoroTimer）与 widget headless 任务共用；engine.js 的纯函数不碰 IO。
// AsyncStorage 惰性 require：让 scripts/test_pomodoro.js 能在纯 node 下注入假 storage
// （与 src/backup「纯函数 core + node assert 测试」约定一致）。
import { createState, normalizeState, LEGACY_ACTIVE_KEY } from './engine.js';

export const STATE_KEY = 'timeflow_pomodoro_state';

let storageImpl = null;
function storage() {
  if (!storageImpl) {
    storageImpl = require('@react-native-async-storage/async-storage').default;
  }
  return storageImpl;
}
// 仅测试用：注入假 AsyncStorage（{getItem,setItem,removeItem}）
export function __useStorage(mock) {
  storageImpl = mock;
}

async function readJson(key) {
  try {
    const raw = await storage().getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

// v1(timeflow_active_focus) → v2 一次性迁移。completedToday 用今日 focus_sessions 条数初始化
// （只影响长休节奏展示，历史统计始终以 DB 为准）；查询失败回退 0。
// 旧 key 复制不删除（保阶段回滚：旧版代码仍能读到原结构恢复会话），阶段 2 再清理。
async function migrateLegacy(now) {
  const legacy = await readJson(LEGACY_ACTIVE_KEY);
  if (!legacy) return null;
  let completedToday = 0;
  try {
    const { getTodayFocusSessions } = require('../storage/store');
    const sessions = await getTodayFocusSessions();
    completedToday = Array.isArray(sessions) ? sessions.length : 0;
  } catch (e) {
    /* 回退 0 */
  }
  return normalizeState(legacy, now, { completedToday });
}

/**
 * 读状态。永不 throw：STATE_KEY miss → 尝试旧 key 迁移（成功即落盘）→ 兜底 createState。
 * @param {number} [now]
 * @returns {Promise<import('../types').PomodoroState>}
 */
export async function loadState(now = Date.now()) {
  const saved = await readJson(STATE_KEY);
  if (saved) return normalizeState(saved, now);
  const migrated = await migrateLegacy(now);
  if (migrated) {
    await saveState(migrated);
    return migrated;
  }
  return createState({ now });
}

/**
 * 写状态：自动刷新 updatedAt（乐观锁版本号）。
 * @param {import('../types').PomodoroState} state
 * @returns {Promise<import('../types').PomodoroState>}
 */
export async function saveState(state) {
  const next = { ...state, updatedAt: Date.now() };
  try {
    await storage().setItem(STATE_KEY, JSON.stringify(next));
  } catch (e) {
    /* 写失败不抛：调用方按现状继续（下次触点自愈） */
  }
  return next;
}

/**
 * CAS 保存：重读 → updatedAt 与期望一致才应用变换并写入。
 * 不一致（App 与 headless 并发操作）返回 ok:false，调用方须重读重推导。
 * @param {number} expectedUpdatedAt
 * @param {(cur: import('../types').PomodoroState) => import('../types').PomodoroState} fn
 * @returns {Promise<{ ok: true, state: import('../types').PomodoroState } | { ok: false, state: import('../types').PomodoroState }>}
 */
export async function saveStateCAS(expectedUpdatedAt, fn) {
  const current = await loadState();
  if (current.updatedAt !== expectedUpdatedAt) {
    return { ok: false, state: current };
  }
  const next = await saveState(fn(current));
  return { ok: true, state: next };
}
