// 番茄组件 headless 点击流水线：
// load → settle（若已结束先惰性结算）→ engine 纯函数变换 → 通知对账 → saveStateCAS 一次落盘。
// CAS 失败 = App 抢先改了状态 → 放弃本次变换，用重读态渲染（组件显示以 App 内为准）。
// 结算/变换都不写 focus_sessions（手动保存决策）；不弹收获页（App 前台经 pendingHarvests 补显）。
import { start, pause, reset, switchMode } from '../src/pomodoro/engine';
import { saveStateCAS } from '../src/pomodoro/stateStore';
import { settleAndPersist } from '../src/pomodoro/settle';
import { syncNotifications, cancelEndNotification } from '../src/pomodoro/notifications';
import { getWidgetLang, makeStrings, makeNotifTexts } from './widgetStrings';

const DEBOUNCE_MS = 2000; // 与行程打卡同款防抖，避免连点重复动作
let lastActionTime = 0;

const MODE_ACTIONS = { 'mode.focus': 'focus', 'mode.short': 'short', 'mode.long': 'long' };

// action ∈ pomo.toggle | pomo.reset | mode.focus | mode.short | mode.long
// 返回最新 state（渲染用）；防抖吞掉或未识别 action 返回 null。
export async function handlePomodoroAction(action) {
  const now = Date.now();
  if (now - lastActionTime < DEBOUNCE_MS) return null;
  lastActionTime = now;

  // 1) 惰性结算：点击即触点，已结束先迁移状态（completedToday++/模式循环/入队 harvest）
  const { state: base } = await settleAndPersist(now);

  // 2) 纯函数变换
  const t = Date.now();
  let next;
  if (action === 'pomo.toggle') next = base.running ? pause(base, t) : start(base, t);
  else if (action === 'pomo.reset') next = reset(base, t);
  else if (MODE_ACTIONS[action]) next = switchMode(base, MODE_ACTIONS[action], t);
  else return null;
  if (!next || next === base) return base; // 幂等（running 中重复 start 等）

  // 3) 通知对账：开始 → 按 endAt 排期结束通知；暂停/重置/切模式 → 用旧 state 的
  //    notifId 取消残留排期（engine 变换会清 notifId）。失败静默，状态正确性不依赖通知。
  const strings = makeStrings(await getWidgetLang());
  next = await syncNotifications(next, makeNotifTexts(strings, next.mode), base);

  // 4) CAS 一次落盘；失败说明 App 并发改写 → 撤销刚排的孤儿通知，返回重读态（App 为准）
  const result = await saveStateCAS(base.updatedAt, () => next);
  if (!result.ok) {
    if (next.notifId && next.notifId !== base.notifId) await cancelEndNotification(next);
    return result.state;
  }
  return result.state || next;
}
