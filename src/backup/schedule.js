// 自动备份调度：每天最多一次；App 回到前台或切后台时检查；数据有变化才备份。
// 变化判定复用 runBackup 内部的内容哈希比对（无变化返回 skipped），
// 调度层不再单独收集/哈希一遍，避免同一次检查做两遍全量扫描。
import { AppState } from 'react-native';
import { runBackup } from './backup';
import { getBackupState, updateBackupState } from './state';

const DEBOUNCE_MS = 60 * 1000; // 数据变化后 60 秒防抖

let debounceTimer = null;
let appStateSubscription = null;
let checking = false;

function sameDay(a, b) {
  if (!a || !b) return false;
  const d1 = new Date(a);
  const d2 = new Date(b);
  return d1.getFullYear() === d2.getFullYear() && d1.getMonth() === d2.getMonth() && d1.getDate() === d2.getDate();
}

/**
 * 自动备份检查：总开关开 && 今天还没跑过 auto → 交给 runBackup（内部哈希比对，无变化即跳过）。
 * 静默失败（只更新 backupState，由界面状态卡呈现，不弹窗）。
 */
export async function checkAutoBackup() {
  if (checking) return false;
  checking = true;
  try {
    const state = await getBackupState();
    if (!state.autoEnabled) return false;
    if (sameDay(state.lastAutoAt, Date.now())) return false;

    const res = await runBackup({ kind: 'auto' });
    if (res.status === 'skipped') {
      // 内容没变但已跨天：把 lastAutoAt 记为今天，避免当天反复全量收集
      await updateBackupState((s) => ({ ...s, lastAutoAt: Date.now() }));
      return false;
    }
    return res.status === 'done';
  } catch (e) {
    return false;
  } finally {
    checking = false;
  }
}

// 数据保存后调用（打卡/补记/专注）：防抖触发一次自动备份检查，不阻塞保存路径
export function notifyDataChanged() {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    checkAutoBackup().catch(() => {});
  }, DEBOUNCE_MS);
}

// App 启动时调用一次：注册前后台切换检查 + 立即检查一次
export function initBackupSchedule() {
  if (!appStateSubscription) {
    appStateSubscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active' || nextState === 'background' || nextState === 'inactive') {
        checkAutoBackup().catch(() => {});
      }
    });
  }
  checkAutoBackup().catch(() => {});
}
