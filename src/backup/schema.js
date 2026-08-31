// 备份明文包的结构与收集/校验。
// 不含高德 Key（明文凭证）——备份快照只覆盖「数据 + 设备偏好」，凭证永不入包。
import AsyncStorage from '@react-native-async-storage/async-storage';

export const BACKUP_VERSION = 1;
export const SCHEMA_RECORDS_V1 = 'records-v1';

// 需快照的偏好键（原始 AsyncStorage 键名，恢复时直接 setItem 回写，无映射可漂移）：
// profile(JSON 串) + lang/theme/mode/currentTrip(串)。不含 amap 任一键。
export const PREF_KEYS = [
  'timeflow_profile',
  'timeflow_lang',
  'timeflow_theme',
  'timeflow_mode',
  'timeflow_current_trip',
];

// 收集全部偏好为 { rawKey: rawValue }，供 buildPlaintext 打进明文包。
export async function collectPreferences() {
  const prefs = {};
  for (const key of PREF_KEYS) {
    try { prefs[key] = await AsyncStorage.getItem(key); } catch (e) { prefs[key] = null; }
  }
  return prefs;
}

// 明文包。records 为 getRecords() 结果；preferences 为 collectPreferences() 结果。
export function buildPlaintext(records, preferences) {
  return {
    app: 'TimeFlow',
    backupVersion: BACKUP_VERSION,
    schema: SCHEMA_RECORDS_V1,
    createdAt: new Date().toISOString(),
    records: Array.isArray(records) ? records : [],
    preferences: preferences || {},
  };
}

// 解密后校验明文形状；不符说明文件损坏或非本应用备份。
export function validatePlaintext(obj) {
  if (!obj || typeof obj !== 'object') return false;
  if (obj.app !== 'TimeFlow') return false;
  if (obj.backupVersion !== BACKUP_VERSION) return false;
  if (obj.schema !== SCHEMA_RECORDS_V1) return false;
  if (!Array.isArray(obj.records)) return false;
  return true;
}

// 恢复偏好：只写回已知 PREF_KEYS，值 null 则清除；其余键一律忽略，防注入任意键。
export async function restorePreferences(prefs) {
  if (!prefs || typeof prefs !== 'object') return;
  for (const key of PREF_KEYS) {
    const val = prefs[key];
    try {
      if (val == null) await AsyncStorage.removeItem(key);
      else await AsyncStorage.setItem(key, val);
    } catch (e) { /* 单键失败不阻塞整体恢复 */ }
  }
}
