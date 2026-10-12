import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { performBackup } from './backup';
import { getBackupState, getBackupPassphrase } from './state';

export const AUTO_KEY = 'timeflow_backup_auto';
export const THROTTLE_MS = 30 * 60 * 1000; // 30 分钟最小间隔
export const DEBOUNCE_MS = 60 * 1000;      // 60 秒数据变化防抖

let isRunning = false;
let debounceTimer = null;
let hasPendingChange = false;
let appStateSubscription = null;

export async function setAutoBackup(enabled) {
  await AsyncStorage.setItem(AUTO_KEY, enabled ? '1' : '0');
}

export async function isAutoBackupEnabled() {
  try {
    return (await AsyncStorage.getItem(AUTO_KEY)) === '1';
  } catch (e) {
    return false;
  }
}

/**
 * 手动立即备份（忽略节流，force=true 时忽略哈希比对）
 */
export async function backupNow({ force = false } = {}) {
  if (isRunning) return { busy: true };
  isRunning = true;
  try {
    const res = await performBackup({ isAuto: false, force });
    hasPendingChange = false;
    return res;
  } finally {
    isRunning = false;
  }
}

/**
 * 自动备份核心执行函数
 */
async function runAutoBackupInternal() {
  if (isRunning) return false;
  const [autoEnabled, state] = await Promise.all([
    isAutoBackupEnabled(),
    getBackupState(),
  ]);

  if (!autoEnabled) return false;

  // 节流检查：距上次备份是否已满 30 分钟
  const lastAt = state.lastSuccessAt || 0;
  if (Date.now() - lastAt < THROTTLE_MS) {
    return false;
  }

  isRunning = true;
  try {
    const res = await performBackup({ isAuto: true, force: false });
    hasPendingChange = false;
    return !!res.success;
  } catch (e) {
    return false;
  } finally {
    isRunning = false;
  }
}

/**
 * 数据变更触发入口（打卡、修改、删除后调用）：
 * 防抖 60 秒，并在满足 ≥ 30 分钟节流时触发
 */
export function notifyDataChanged() {
  hasPendingChange = true;
  if (debounceTimer) {
    clearTimeout(debounceTimer);
  }
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    runAutoBackupInternal().catch(() => {});
  }, DEBOUNCE_MS);
}

/**
 * 兼容旧调用的 runBackupIfDue（App 启动时执行一次）
 */
export async function runBackupIfDue({ force = false } = {}) {
  const [autoEnabled, state] = await Promise.all([
    isAutoBackupEnabled(),
    getBackupState(),
  ]);

  if (!autoEnabled) return false;

  const lastAt = state.lastSuccessAt || 0;
  if (!force && Date.now() - lastAt < THROTTLE_MS) {
    return false;
  }

  if (isRunning) return false;
  isRunning = true;
  try {
    const res = await performBackup({ isAuto: true, force });
    hasPendingChange = false;
    return !!res.success;
  } catch (e) {
    return false;
  } finally {
    isRunning = false;
  }
}

/**
 * 监听 App 切后台时自动补一次备份
 */
export function initAppStateBackupListener() {
  if (appStateSubscription) return;

  appStateSubscription = AppState.addEventListener('change', (nextState) => {
    if (nextState === 'background' || nextState === 'inactive') {
      if (hasPendingChange) {
        if (debounceTimer) {
          clearTimeout(debounceTimer);
          debounceTimer = null;
        }
        runBackupIfDue().catch(() => {});
      }
    }
  });
}
