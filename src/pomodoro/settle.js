// 番茄结算编排：App 前台与 widget headless 共用。
// 已决策「保持手动保存」：结算只推进状态机（completedToday++、模式循环、pendingHarvests 入队），
// 永不写 focus_sessions——落库仍由 App 收获页手动保存这一条路径（store.js 零改动）。
import { isEnded, settle, deriveDisplay } from './engine.js';
import { loadState, saveState, saveStateCAS } from './stateStore.js';
import { syncNotifications, cancelEndNotification } from './notifications.js';

// 惰性结算：已结束则迁移状态并落盘（CAS 防 App/headless 并发双结算）。
// 返回 {state, harvested}；harvested 非空 = 本次调用完成了 focus 结算，
// App 侧据此补显收获页（headless 侧忽略，仅状态推进）。
// CAS 失败说明另一进程抢先结算——重读后原样返回（harvested:null），
// 未保存会话仍在 pendingHarvests 队列里，App 前台补显逻辑会消费。
export async function settleAndPersist(now = Date.now()) {
  const state = await loadState(now);
  if (!isEnded(state, now)) return { state, harvested: null };

  const { state: next, harvested } = settle(state, now);
  const result = await saveStateCAS(state.updatedAt, () => next);
  if (!result.ok) {
    return { state: result.state, harvested: null };
  }
  // 已排期的结束通知：到点 OS 自会弹出；结算后取消残留排期（如心跳兜底结算晚于 endAt）
  await cancelEndNotification(state);
  return { state: result.state, harvested };
}

// 通知对账并落盘（running 缺排期则补排；停止则取消）。返回最新 state。
export async function syncAndPersist(state, texts) {
  const synced = await syncNotifications(state, texts);
  if (synced.notifId !== state.notifId) {
    return await saveState(synced);
  }
  return synced;
}

// App 侧统一入口（首次挂载 / AppState 回前台）：
// 读状态 → 补结算 → 通知对账 → 派生显示。
export async function syncFromStorage(now = Date.now(), texts) {
  const { state, harvested } = await settleAndPersist(now);
  const synced = await syncAndPersist(state, texts);
  return { state: synced, harvested, display: deriveDisplay(synced, Date.now()) };
}
