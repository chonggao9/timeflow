import { useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

export const STATE_STORAGE_KEY = 'timeflow_backup_state';
export const PASS_KEY = 'timeflow_backup_passphrase';
export const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;

const DEFAULT_STATE = {
  status: 'notConfigured',
  lastSuccessAt: null,
  lastCounts: null,
  cloud: { enabled: false, lastError: null }, // lastError: { code: 'AUTH'|'NETWORK'|'QUOTA'|'UNKNOWN', at: number, message: string }
  local: { enabled: true },
  lastHash: null,
};

let cachedState = null;
const listeners = new Set();

function notifyListeners() {
  for (const fn of listeners) {
    try { fn(cachedState); } catch (e) {}
  }
}

/**
 * 计算动态衍生状态（如 3 天未备份变为 stale，未设密码变为 notConfigured）
 */
export function deriveStatus(rawState, hasPassphrase) {
  if (!hasPassphrase) {
    return 'notConfigured';
  }
  if (rawState.status === 'needConfirm') {
    return 'needConfirm';
  }
  if (rawState.cloud?.lastError) {
    return 'failed';
  }
  if (!rawState.lastSuccessAt) {
    return 'stale';
  }
  if (Date.now() - rawState.lastSuccessAt > THREE_DAYS_MS) {
    return 'stale';
  }
  return 'ok';
}

/**
 * 读取完整的 backupState（含动态计算字段）
 */
export async function getBackupState() {
  if (cachedState) {
    const hasPass = !!(await getBackupPassphrase());
    return {
      ...cachedState,
      status: deriveStatus(cachedState, hasPass),
    };
  }

  try {
    const raw = await AsyncStorage.getItem(STATE_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : DEFAULT_STATE;
    const hasPass = !!(await getBackupPassphrase());
    cachedState = {
      ...DEFAULT_STATE,
      ...parsed,
      cloud: { ...DEFAULT_STATE.cloud, ...(parsed.cloud || {}) },
      local: { ...DEFAULT_STATE.local, ...(parsed.local || {}) },
    };
    return {
      ...cachedState,
      status: deriveStatus(cachedState, hasPass),
    };
  } catch (e) {
    return { ...DEFAULT_STATE, status: 'notConfigured' };
  }
}

/**
 * 更新并持久化 backupState
 */
export async function updateBackupState(updater) {
  const current = await getBackupState();
  const nextRaw = typeof updater === 'function' ? updater(current) : { ...current, ...updater };
  const hasPass = !!(await getBackupPassphrase());

  cachedState = {
    ...nextRaw,
    status: deriveStatus(nextRaw, hasPass),
  };

  try {
    await AsyncStorage.setItem(STATE_STORAGE_KEY, JSON.stringify(cachedState));
  } catch (e) {}

  notifyListeners();
  return cachedState;
}

/**
 * 备份口令存取
 */
export async function setBackupPassphrase(passphrase) {
  if (passphrase) {
    await SecureStore.setItemAsync(PASS_KEY, passphrase);
  } else {
    await SecureStore.deleteItemAsync(PASS_KEY);
  }
  await updateBackupState(s => ({ ...s }));
}

export async function getBackupPassphrase() {
  try {
    return await SecureStore.getItemAsync(PASS_KEY);
  } catch (e) {
    return null;
  }
}

/**
 * 供组件使用的响应式 Hook
 */
export function useBackupState() {
  const [state, setState] = useState(cachedState || DEFAULT_STATE);

  useEffect(() => {
    let mounted = true;
    getBackupState().then(s => {
      if (mounted) setState(s);
    });

    const handler = (s) => {
      if (mounted) setState(s);
    };
    listeners.add(handler);
    return () => {
      mounted = false;
      listeners.delete(handler);
    };
  }, []);

  return state;
}
