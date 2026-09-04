// WebDAV 云同步：把最新加密备份 PUT 到用户自带的 WebDAV（坚果云 / Nextcloud 等）。
// 配置（url + username）存 AsyncStorage，应用专用密码存 expo-secure-store（Keystore 保护）。
// 远端固定名 `timeflow-backup-latest.json`（覆盖语义，只留最新）。
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system';
import * as SecureStore from 'expo-secure-store';
import CryptoJS from 'crypto-js';
import { withTimeout } from '../utils/withTimeout';

const CONFIG_KEY = 'timeflow_webdav';
const PASS_KEY = 'timeflow_webdav_password';
export const REMOTE_FILENAME = 'timeflow-backup-latest.json';

// 统一错误类型：code ∈ {auth, notFound, conflict, server, network, unknown}
export class WebDavError extends Error {
  constructor(code, message) {
    super(message || code);
    this.name = 'WebDavError';
    this.code = code;
  }
}

// ---------- 配置读写 ----------
export async function getWebDavConfig() {
  try {
    const raw = await AsyncStorage.getItem(CONFIG_KEY);
    return raw ? JSON.parse(raw) : null; // {url, username}
  } catch (e) { return null; }
}
export async function saveWebDavConfig({ url, username, appPassword }) {
  const config = { url: url.trim(), username: username.trim() };
  await AsyncStorage.setItem(CONFIG_KEY, JSON.stringify(config));
  if (appPassword) await SecureStore.setItemAsync(PASS_KEY, appPassword);
  return config;
}
export async function clearWebDavConfig() {
  await AsyncStorage.removeItem(CONFIG_KEY);
  await SecureStore.deleteItemAsync(PASS_KEY);
}
export async function getWebDavPassword() {
  try { return await SecureStore.getItemAsync(PASS_KEY); } catch (e) { return null; }
}

// url 规范化：去尾部斜杠，再拼固定远端文件名（用户给 base 目录，不带文件名）。
function resolveUrl(config) {
  const base = (config.url || '').replace(/\/+$/, '');
  return `${base}/${REMOTE_FILENAME}`;
}

// 底层请求：Basic Auth + JSON；按 HTTP 状态映射成 WebDavError.code。
// 成功（res.ok）返回 Response；401/403=auth，404=notFound，412=conflict，5xx=server，其它=unknown，网络异常=network。
async function fetchWebDav(method, url, body, config, pass, timeoutMs = 12000) {
  const authHeader = 'Basic ' + CryptoJS.enc.Base64.stringify(CryptoJS.enc.Utf8.parse(`${config.username}:${pass}`));
  let res;
  try {
    res = await withTimeout(
      fetch(url, {
        method,
        headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
        body: method === 'PUT' ? body : undefined,
      }),
      timeoutMs
    );
  } catch (e) {
    if (e && e.message === 'timeout') {
      throw new WebDavError('network', 'timeout');
    }
    throw new WebDavError('network', (e && e.message) || String(e));
  }
  if (res.ok) return res;
  if (res.status === 401 || res.status === 403) throw new WebDavError('auth', `HTTP ${res.status}`);
  if (res.status === 404) throw new WebDavError('notFound', `HTTP ${res.status}`);
  if (res.status === 412) throw new WebDavError('conflict', `HTTP ${res.status}`);
  if (res.status >= 500) throw new WebDavError('server', `HTTP ${res.status}`);
  throw new WebDavError('unknown', `HTTP ${res.status}`);
}

async function requireConfig() {
  const config = await getWebDavConfig();
  const pass = await getWebDavPassword();
  if (!config || !config.url || !config.username || !pass) {
    throw new WebDavError('auth', 'missing webdav config');
  }
  return { config, pass };
}

// 上传本地备份文件到远端（覆盖）。返回远程 uri。
export async function putBackup(localUri) {
  const { config, pass } = await requireConfig();
  const raw = await FileSystem.readAsStringAsync(localUri, { encoding: FileSystem.EncodingType.UTF8 });
  const url = resolveUrl(config);
  await fetchWebDav('PUT', url, raw, config, pass);
  return url;
}

// 测试连接：GET 远端文件。404（暂无备份文件）＝连上了只是没文件，视为成功；
// 401/网络错误则抛异常。返回 true 表示连接可用。
export async function testConnection() {
  const { config, pass } = await requireConfig();
  return doTest(config, pass);
}

// 用给定（尚未落库）配置直接测试，供 WebDAV 配置弹窗在保存前验证。
export async function testConnectionWith(url, username, appPassword) {
  return doTest({ url, username }, appPassword);
}

async function doTest(config, pass) {
  try {
    await fetchWebDav('GET', resolveUrl(config), undefined, config, pass);
    return true;
  } catch (e) {
    if (e instanceof WebDavError && e.code === 'notFound') return true;
    throw e;
  }
}

// 下载远端最新备份，返回原始 JSON 串（供 readAndRestoreFromRaw 恢复）。
export async function getLatestBackupRaw() {
  const { config, pass } = await requireConfig();
  const res = await fetchWebDav('GET', resolveUrl(config), undefined, config, pass);
  return await res.text();
}
