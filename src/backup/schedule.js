// 备份调度：`backupNow`（人工立即备份）/ `runBackupIfDue`（自动备份入口）。
// 口令存 secure-store（@key timeflow_backup_passphrase），供自动备份静默重加密；
// 换机离线恢复时仍手输口令（不读这里）。
// `running` 模块级防重入；成功才写 last-success（Back up 标签）；任何失败静默，不抛错。
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { makeLocalBackup } from './backup';
import { putBackup, getWebDavConfig } from './webdav';

const AUTO_KEY = 'timeflow_backup_auto';
const PASS_KEY = 'timeflow_backup_passphrase';
const LAST_SUCCESS_KEY = 'timeflow_backup_last_success';
const THROTTLE_MS = 30 * 60 * 1000;

// 模块级防重入标志：一次只允许一个备份流程在跑。
let running = false;

// ---- 备份口令（secure-store）。设置/清除；读取用于备份时取当前口令。 ----
export async function setBackupPassphrase(passphrase) {
  if (passphrase) await SecureStore.setItemAsync(PASS_KEY, passphrase);
  else await SecureStore.deleteItemAsync(PASS_KEY);
}
export async function getBackupPassphrase() {
  try { return await SecureStore.getItemAsync(PASS_KEY); } catch (e) { return null; }
}

// ---- 自动备份开关 ----
export async function setAutoBackup(enabled) {
  await AsyncStorage.setItem(AUTO_KEY, enabled ? '1' : '0');
}
export async function isAutoBackupEnabled() {
  try { return (await AsyncStorage.getItem(AUTO_KEY)) === '1'; } catch (e) { return false; }
}

// 上次成功备份的时间戳（epoch ms），用于「上次备份」标签；无则 0。
export async function getLastBackupTime() {
  try { const v = await AsyncStorage.getItem(LAST_SUCCESS_KEY); return v ? Number(v) : 0; } catch (e) { return 0; }
}

// 立即备份：本地加密备份 +（已配 WebDAV 则上传）。返回 { uri, uploaded }，失败返回 null。
export async function backupNow({ passphrase } = {}) {
  if (running) return null;
  running = true;
  try {
    const p = passphrase || await getBackupPassphrase();
    if (!p) return null;
    const uri = await makeLocalBackup({ passphrase: p });
    const dav = await getWebDavConfig();
    let uploaded = false;
    if (dav && dav.url) { await putBackup(uri); uploaded = true; }
    await AsyncStorage.setItem(LAST_SUCCESS_KEY, String(Date.now()));
    return { uri, uploaded };
  } catch (e) {
    if (__DEV__) console.warn('[backup] failed:', (e && e.message) || e);
    return null;
  } finally {
    running = false;
  }
}

// 自动备份入口（App 打开 / 打卡后调）：未启用 / 无口令 / 未到期 → 跳过；否则 backupNow。
export async function runBackupIfDue({ force = false } = {}) {
  if (!(await isAutoBackupEnabled())) return false;
  if (!(await getBackupPassphrase())) return false;
  const last = await getLastBackupTime();
  if (!force && Date.now() - last < THROTTLE_MS) return false;
  const result = await backupNow({});
  return !!result;
}
