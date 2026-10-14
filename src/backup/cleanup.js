// 一次性迁移清理：新版首启时删除旧备份体系的全部痕迹。
// 只清「旧备份文件 + 旧配置键」，绝不触碰 SQLite 中的打卡/行程/专注数据与普通偏好。
// 云端 legacy 文件（WebDAV 上的 timeflow-backup-latest.json）不读取、不删除。
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import * as FileSystem from 'expo-file-system';

const CLEANED_KEY = 'timeflow_backup_v2_cleaned';
const OLD_BACKUP_DIR = `${FileSystem.documentDirectory}timeflow-backups/`;

// 旧体系遗留键：状态（旧结构，state.js 读到 sv 不符会自行重置，这里直接删更干净）、
// 自动开关（并入新 state.autoEnabled）、WebDAV 配置（云端副本需重新设置、默认关闭）、口令。
const OLD_ASYNC_KEYS = [
  'timeflow_backup_state',
  'timeflow_backup_auto',
  'timeflow_webdav',
];
const OLD_SECURE_KEYS = [
  'timeflow_webdav_password',
  'timeflow_backup_passphrase',
];

export async function runV2CleanupOnce() {
  try {
    const done = await AsyncStorage.getItem(CLEANED_KEY);
    if (done === '1') return false;
  } catch (e) { return false; }

  // 旧本地备份目录整体删除
  try {
    const info = await FileSystem.getInfoAsync(OLD_BACKUP_DIR);
    if (info.exists) await FileSystem.deleteAsync(OLD_BACKUP_DIR, { idempotent: true });
  } catch (e) { /* 目录不存在或删除失败不阻塞 */ }

  for (const key of OLD_ASYNC_KEYS) {
    try { await AsyncStorage.removeItem(key); } catch (e) {}
  }
  for (const key of OLD_SECURE_KEYS) {
    try { await SecureStore.deleteItemAsync(key); } catch (e) {}
  }

  try { await AsyncStorage.setItem(CLEANED_KEY, '1'); } catch (e) {}
  return true;
}
