// 番茄小组件到点刷新与跨天刷新调度器。
// 原则：纯 JS 定时器（无需原生新权限），在 App 进程存活/后台驻留时确保到点或跨天瞬间刷新桌面小组件。
// App 彻底被杀时由 AppState 回前台、小组件点击前置结算、30分钟系统心跳兜底。
import { settleAndPersist } from './settle';
import { refreshPomodoroWidgets, refreshAllWidgets } from '../utils/widgetRefresh';
import { syncWidgetSnapshot } from '../storage/store';

let endTimer = null;
let midnightTimer = null;

// 取消当前排期的到点刷新
export function cancelPomodoroEndRefresh() {
  if (endTimer) {
    clearTimeout(endTimer);
    endTimer = null;
  }
}

// 根据 state 排期 endAt 到点刷新
export function schedulePomodoroEndRefresh(state) {
  cancelPomodoroEndRefresh();
  if (!state || !state.running || !state.endAt) return;

  const now = Date.now();
  const delay = state.endAt - now;

  // 已经过期：立即推进结算并刷新
  if (delay <= 0) {
    settleAndPersist(now)
      .then(() => refreshPomodoroWidgets())
      .catch(() => {});
    return;
  }

  // 最大支持 24 小时内的定时，防止溢出
  if (delay > 24 * 3600 * 1000) return;

  endTimer = setTimeout(async () => {
    endTimer = null;
    try {
      await settleAndPersist(Date.now());
      await refreshPomodoroWidgets();
    } catch (e) {
      /* 静默 */
    }
  }, delay);
}

// 跨天调度（次日 00:00:02 触发）
export function initMidnightSchedule() {
  if (midnightTimer) {
    clearTimeout(midnightTimer);
    midnightTimer = null;
  }
  const now = new Date();
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 2);
  const msToMidnight = Math.max(1000, tomorrow.getTime() - now.getTime());

  midnightTimer = setTimeout(async () => {
    midnightTimer = null;
    try {
      await settleAndPersist(Date.now());
      await syncWidgetSnapshot(Date.now());
      await refreshAllWidgets();
    } catch (e) {}
    initMidnightSchedule(); // 排期下一天
  }, msToMidnight);
}
