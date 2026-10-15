// 番茄专注状态机（纯函数，零 import）。
// App（PomodoroTimer）与桌面小组件 headless 任务共用同一份状态：
// 持久化于 AsyncStorage（见 stateStore.js），以 endAt 时间戳为准，杀进程可恢复。
// 结算（settle）只推进状态机，不写 focus_sessions——落库仍由 App 收获页手动保存
// （pendingHarvests 队列保留未保存会话，App 打开后补显收获页）。

export const FOCUS_DEFAULT_MIN = 25;
export const FOCUS_MIN_LIMIT = 5;
export const FOCUS_MAX_LIMIT = 120;
export const SHORT_MS = 5 * 60 * 1000;
export const LONG_MS = 15 * 60 * 1000;
export const LONG_REST_EVERY = 4;
export const MAX_PENDING_HARVESTS = 10;

export const LEGACY_ACTIVE_KEY = 'timeflow_active_focus';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export function durationMs(state) {
  if (state.mode === 'short') return SHORT_MS;
  if (state.mode === 'long') return LONG_MS;
  return (state.focusMin || FOCUS_DEFAULT_MIN) * 60 * 1000;
}

export function todayKey(now) {
  const d = new Date(now);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function createState(opts = {}) {
  const now = opts.now || 0;
  const focusMin = clamp(opts.focusMin || FOCUS_DEFAULT_MIN, FOCUS_MIN_LIMIT, FOCUS_MAX_LIMIT);
  return {
    v: 2,
    mode: 'focus',
    running: false,
    endAt: null,
    remainingMs: focusMin * 60 * 1000,
    completedToday: 0,
    updatedAt: now,
    focusMin,
    completedDate: now ? todayKey(now) : null,
    settledEndAt: null,
    sessionId: null,
    startTs: null,
    category: opts.category || 'study',
    goalName: opts.goalName || '',
    ambient: opts.ambient || 'none',
    notifId: null,
    pendingHarvests: [],
  };
}

function withDay(state, now) {
  // completedToday 跨天惰性归零（不落盘也可，显示层同样补正）
  const key = todayKey(now);
  if (state.completedDate !== key) {
    return { ...state, completedToday: 0, completedDate: key };
  }
  return state;
}

export function start(state, now) {
  if (state.running) return state; // 幂等
  let s = withDay(state, now);
  const remaining = s.remainingMs > 0 ? s.remainingMs : durationMs(s);
  return {
    ...s,
    running: true,
    startTs: s.startTs || now,
    sessionId: s.sessionId || `focus-${s.startTs || now}`,
    endAt: now + remaining,
    remainingMs: remaining,
  };
}

export const resume = start; // 语义别名：用 remainingMs 重新起算 endAt

export function pause(state, now) {
  if (!state.running) return state;
  const remaining = Math.max(0, (state.endAt || now) - now);
  return { ...state, running: false, endAt: null, remainingMs: remaining };
}

export function reset(state, now) {
  // 回当前模式满时长并停止；completedToday / pendingHarvests 不动
  const s = withDay(state, now);
  return {
    ...s,
    running: false,
    endAt: null,
    remainingMs: durationMs(s),
    sessionId: null,
    startTs: null,
    notifId: null,
  };
}

export function switchMode(state, mode, now) {
  if (mode !== 'focus' && mode !== 'short' && mode !== 'long') return state;
  const s = withDay(state, now);
  const next = { ...s, mode, running: false, endAt: null, sessionId: null, startTs: null, notifId: null };
  next.remainingMs = durationMs(next);
  return next;
}

export function setFocusMin(state, min, now) {
  const focusMin = clamp(Math.round(min), FOCUS_MIN_LIMIT, FOCUS_MAX_LIMIT);
  const s = { ...state, focusMin };
  if (!s.running && s.mode === 'focus') s.remainingMs = focusMin * 60 * 1000;
  return s;
}

export function isEnded(state, now) {
  return !!state.running && state.endAt != null && now >= state.endAt;
}

export function nextModeAfterEnd(state) {
  if (state.mode === 'focus') {
    return (state.completedToday + 1) % LONG_REST_EVERY === 0 ? 'long' : 'short';
  }
  return 'focus';
}

export function settle(state, now) {
  // 唯一的状态迁移出口。未结束→原样返回（幂等）；已结束→推进模式循环。
  // harvested 非空 = App 侧应补显收获页（手动保存才写 focus_sessions）。
  if (!isEnded(state, now)) return { state, harvested: null };
  const endedAt = state.endAt;
  const s = withDay({ ...state }, endedAt); // 归属日按结束时刻算
  const base = {
    ...s,
    running: false,
    endAt: null,
    settledEndAt: endedAt,
    notifId: null,
    sessionId: null,
    startTs: null,
  };

  if (state.mode === 'focus') {
    const harvested = {
      sessionId: state.sessionId || `focus-${state.startTs || endedAt}`,
      startTs: state.startTs || endedAt - durationMs(state),
      endAt: endedAt,
      durationSec: Math.round(durationMs(state) / 1000), // 满时长，非墙钟差值
      category: state.category,
      goalName: state.goalName,
      ambient: state.ambient,
      completedToday: s.completedToday + 1,
    };
    const nextMode = nextModeAfterEnd(s);
    const queue = [...(s.pendingHarvests || []), harvested].slice(-MAX_PENDING_HARVESTS);
    const nextState = {
      ...base,
      mode: nextMode,
      completedToday: s.completedToday + 1,
      completedDate: todayKey(endedAt),
      remainingMs: nextMode === 'focus' ? s.focusMin * 60 * 1000 : nextMode === 'short' ? SHORT_MS : LONG_MS,
      pendingHarvests: queue,
    };
    return { state: nextState, harvested };
  }

  // 休息结束：回专注待开始，不落库不排队
  return {
    state: { ...base, mode: 'focus', remainingMs: s.focusMin * 60 * 1000 },
    harvested: null,
  };
}

// 收获确认出队：App 收获页保存/放弃后调用（纯函数）。sessionId 缺省时按 FIFO 弹出最早一条。
export function ackHarvest(state, sessionId) {
  const queue = state.pendingHarvests || [];
  if (!queue.length) return state;
  const idx = sessionId ? queue.findIndex((h) => h.sessionId === sessionId) : 0;
  if (idx < 0) return state;
  return { ...state, pendingHarvests: [...queue.slice(0, idx), ...queue.slice(idx + 1)] };
}

export function deriveDisplay(state, now) {
  // 纯派生，绝不改 state。ended 惰性显示为「待开始」，迁移只属于 settle。
  const s = withDay(state, now);
  const total = durationMs(s);
  const ended = isEnded(s, now);
  const running = !!s.running && !ended;
  const remainingMs = ended ? 0 : running ? Math.max(0, (s.endAt || now) - now) : Math.max(0, s.remainingMs);
  const progress = total > 0 ? clamp(1 - remainingMs / total, 0, 1) : 0;
  let status; // 枚举，文案由 App/widget 两侧各自映射（engine 无 i18n）
  if (ended) status = 'idle';
  else if (!running && remainingMs < total) status = 'paused';
  else if (!running) status = 'idle';
  else status = s.mode === 'focus' ? 'focusing' : 'resting';
  return {
    running,
    ended,
    remainingMs,
    remainingSec: Math.ceil(remainingMs / 1000),
    remainingCeilMin: Math.ceil(remainingMs / 60000),
    totalMs: total,
    progress,
    mode: s.mode,
    status,
    endsAtHHMM: running && s.endAt ? fmtHHMM(s.endAt) : null,
    endAt: running ? s.endAt : null,
    completedToday: s.completedToday,
    focusMin: s.focusMin,
    pendingHarvests: s.pendingHarvests || [],
  };
}

export function fmtHHMM(ts) {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// v1（timeflow_active_focus）→ v2 迁移映射；也兜底一切坏数据。
// now 必传；opts.completedToday 供迁移时以今日 focus_sessions 条数初始化。
export function normalizeState(raw, now, opts = {}) {
  const fallback = () => createState({ now, ...opts });
  if (!raw || typeof raw !== 'object') return fallback();

  if (raw.v === 2) {
    // 同版本容错：字段缺失/类型不对时逐项修正
    const base = { ...createState({ now, ...opts }), ...raw };
    base.focusMin = clamp(Number(base.focusMin) || FOCUS_DEFAULT_MIN, FOCUS_MIN_LIMIT, FOCUS_MAX_LIMIT);
    base.remainingMs = Number.isFinite(Number(raw.remainingMs))
      ? Math.max(0, Number(raw.remainingMs))
      : durationMs(base); // 缺字段时按当前模式满时长修正
    base.completedToday = Math.max(0, Number(base.completedToday) || 0);
    if (!Array.isArray(base.pendingHarvests)) base.pendingHarvests = [];
    if (!['focus', 'short', 'long'].includes(base.mode)) base.mode = 'focus';
    base.running = !!base.running && base.endAt != null;
    if (!base.running) base.endAt = null;
    return base;
  }

  // v1 旧结构：{sessionId, phase, startTs, totalDurationSec, durationSec, pausedTotalSec, lastPauseTs, category, goalName, durationMin, ambient}
  const ctx = {
    category: raw.category || 'study',
    goalName: raw.goalName || '',
    ambient: raw.ambient || 'none',
    focusMin: clamp(Number(raw.durationMin) || FOCUS_DEFAULT_MIN, FOCUS_MIN_LIMIT, FOCUS_MAX_LIMIT),
    now,
    completedToday: opts.completedToday || 0,
  };
  if (!raw.startTs || (raw.phase !== 'running' && raw.phase !== 'paused')) return createState(ctx);

  const total = (Number(raw.totalDurationSec) || ctx.focusMin * 60) * 1000;
  const pausedTotal = (Number(raw.pausedTotalSec) || 0) * 1000;
  const s = createState(ctx);
  s.sessionId = raw.sessionId || `focus-${raw.startTs}`;
  s.startTs = raw.startTs;
  s.completedDate = todayKey(now);

  if (raw.phase === 'running') {
    const endAt = raw.startTs + total + pausedTotal;
    s.running = true;
    s.endAt = endAt;
    s.remainingMs = Math.max(0, endAt - now);
    return s; // endAt 已过期也保留 running，让首次 settle 正常结算这一轮
  }
  // paused：pausedTotalSec 不含本次暂停段（resume 时才并入），lastPauseTs 至今需额外扣除
  // ——与旧版 recoverActiveSession 的 extraPause 逻辑一致。
  const extra = raw.lastPauseTs ? Math.max(0, now - raw.lastPauseTs) : 0;
  s.running = false;
  s.remainingMs = Math.max(0, total - ((now - raw.startTs) - pausedTotal - extra));
  return s;
}
