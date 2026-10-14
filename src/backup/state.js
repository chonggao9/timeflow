// backupState：唯一持久化状态对象 + useBackupState Hook + 界面四态推导。
// 界面状态（ok/stale/empty/failed）由本对象派生，不落盘。
import { useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const STATE_STORAGE_KEY = 'timeflow_backup_state';
export const STALE_MS = 7 * 24 * 60 * 60 * 1000; // 超过 7 天未成功 → stale

// sv 为状态结构版本：旧版（口令/needConfirm 时代）无此字段或结构不符 → 直接重置
const STATE_SV = 2;

export const DEFAULT_STATE = {
  sv: STATE_SV,
  lastSuccessAt: null,       // 最近一次本机备份成功时间
  lastCounts: null,          // { records, focus, trips }
  lastError: null,           // null | { code: 'NO_SPACE'|'WRITE_FAIL', at }（仅本机备份失败）
  lastCloudError: null,      // null | { code, at }（云端上传失败；本机备份仍是成功，不进四态推导）
  autoEnabled: true,         // 自动备份总开关，默认开
  cloudEnabled: false,       // 云端副本，默认关
  savedToFileAt: null,       // 最近一次「保存备份文件」成功时间
  // 内部运行字段（非 UI 语义）：
  lastHash: null,            // 上一份备份的内容哈希，用于跳过无变化备份
  lastAutoAt: null,          // 最近一次 auto 备份成功日，用于「每天最多一次」
};

let cachedState = null;
const listeners = new Set();

function notifyListeners() {
  for (const fn of listeners) {
    try { fn(cachedState); } catch (e) {}
  }
}

// 界面状态推导：failed > empty > stale > ok
export function deriveUiStatus(state) {
  if (state?.lastError) return 'failed';
  if (!state?.lastSuccessAt) return 'empty';
  if (Date.now() - state.lastSuccessAt > STALE_MS) return 'stale';
  return 'ok';
}

function withDerived(raw) {
  return { ...raw, uiStatus: deriveUiStatus(raw) };
}

export async function getBackupState() {
  if (cachedState) return withDerived(cachedState);
  try {
    const rawStr = await AsyncStorage.getItem(STATE_STORAGE_KEY);
    const parsed = rawStr ? JSON.parse(rawStr) : null;
    // 旧格式（无 sv 或 sv 不符）一律重置为默认：旧状态语义（needConfirm/cloud 嵌套）不再兼容
    cachedState = parsed && parsed.sv === STATE_SV ? { ...DEFAULT_STATE, ...parsed } : { ...DEFAULT_STATE };
  } catch (e) {
    cachedState = { ...DEFAULT_STATE };
  }
  return withDerived(cachedState);
}

export async function updateBackupState(updater) {
  const current = await getBackupState();
  const next = typeof updater === 'function' ? updater(current) : { ...current, ...updater };
  // uiStatus 为派生展示字段，不属于持久化契约：落盘前剥离，避免陈旧值写入 AsyncStorage
  const { uiStatus, ...persisted } = next;
  cachedState = { ...DEFAULT_STATE, ...persisted, sv: STATE_SV };
  try {
    await AsyncStorage.setItem(STATE_STORAGE_KEY, JSON.stringify(cachedState));
  } catch (e) {}
  notifyListeners();
  return withDerived(cachedState);
}

// 供组件使用的响应式 Hook
export function useBackupState() {
  const [state, setState] = useState(() => (cachedState ? withDerived(cachedState) : withDerived(DEFAULT_STATE)));

  useEffect(() => {
    let mounted = true;
    getBackupState().then((s) => { if (mounted) setState(s); });
    const handler = (s) => { if (mounted) setState(withDerived(s)); };
    listeners.add(handler);
    return () => { mounted = false; listeners.delete(handler); };
  }, []);

  return state;
}
