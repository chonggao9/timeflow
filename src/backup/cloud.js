// WebDAV 云端副本：精简客户端（手写 fetch，Basic Auth）。
// 原则：默认关闭；凭证只存本机（AsyncStorage 配置 + SecureStore 应用密码），绝不写入备份；
// 云端只保留最近 3 份当前格式文件；旧版 legacy 文件（timeflow-backup-latest.json）不读取、不删除；
// 上传失败不影响本机备份成功（由调用方记 CLOUD_FAIL）。
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import * as FileSystem from 'expo-file-system';
import CryptoJS from 'crypto-js';
import { withTimeout } from '../utils/withTimeout';
import { parseBackupFilename } from './format';
import { planCloudPrune } from './plan';
import { BACKUP_DIR } from './files';

export const CLOUD_CONFIG_KEY = 'timeflow_webdav';       // { url, username }
export const CLOUD_PASS_KEY = 'timeflow_webdav_password'; // SecureStore
export const REMOTE_FOLDER = 'timeflow';
const TIMEOUT_MS = 15000;         // 探测/小请求
const UPLOAD_TIMEOUT_MS = 60000;  // PUT 大文件（蜂窝网络下留足余量，避免假失败）

export async function getCloudConfig() {
  let url = '';
  let username = '';
  try {
    const raw = await AsyncStorage.getItem(CLOUD_CONFIG_KEY);
    const cfg = raw ? JSON.parse(raw) : null;
    if (cfg && typeof cfg === 'object') {
      url = typeof cfg.url === 'string' ? cfg.url : '';
      username = typeof cfg.username === 'string' ? cfg.username : '';
    }
  } catch (e) { /* 配置损坏视为未配置 */ }
  let password = '';
  try {
    password = (await SecureStore.getItemAsync(CLOUD_PASS_KEY)) || '';
  } catch (e) { /* SecureStore 不可用时视为未配置 */ }
  return { url, username, password };
}

export async function saveCloudConfig({ url, username, password }) {
  await AsyncStorage.setItem(CLOUD_CONFIG_KEY, JSON.stringify({
    url: (url || '').trim().replace(/\/+$/, ''),
    username: (username || '').trim(),
  }));
  await SecureStore.setItemAsync(CLOUD_PASS_KEY, password || '');
}

function authHeader(username, password) {
  const raw = `${username}:${password}`;
  return `Basic ${CryptoJS.enc.Base64.stringify(CryptoJS.enc.Utf8.parse(raw))}`;
}

function base(url) {
  return (url || '').trim().replace(/\/+$/, '');
}

async function request(targetUrl, cfg, method, body, extraHeaders = {}, timeoutMs = TIMEOUT_MS) {
  if (!cfg.url || !cfg.username || !cfg.password) {
    const err = new Error('webdav not configured');
    err.code = 'CONFIG';
    throw err;
  }
  const res = await withTimeout(fetch(targetUrl, {
    method,
    headers: { Authorization: authHeader(cfg.username, cfg.password), ...extraHeaders },
    body,
  }), timeoutMs);
  return res;
}

function classify(res) {
  if (res.status === 401 || res.status === 403) return 'AUTH';
  if (res.status === 507) return 'QUOTA';
  if (res.status === 404) return 'NOT_FOUND';
  return 'SERVER';
}

/**
 * 测试连接：PROPFIND Depth 0 探测根地址。
 * 返回 { ok:true } | { ok:false, reason:'AUTH'|'NET'|'NOT_FOUND'|'SERVER' }
 */
export async function testConnection(url, username, password) {
  const cfg = { url: base(url), username: (username || '').trim(), password: password || '' };
  try {
    const res = await request(cfg.url, cfg, 'PROPFIND', undefined, { Depth: '0' });
    if (res.ok) return { ok: true };
    return { ok: false, reason: classify(res) };
  } catch (e) {
    return { ok: false, reason: 'NET' };
  }
}

// 解析 PROPFIND 多状态 XML：只认「当前命名规范」的文件（legacy 天然被过滤，永不触碰）。
// 命名空间前缀可有可无（部分服务器用默认 xmlns 返回无前缀标签）。
const NS = '(?:[A-Za-z0-9_.-]+:)?';
const RESPONSE_RE = new RegExp(`<${NS}response[\\s>][\\s\\S]*?</${NS}response\\s*>`, 'gi');
const HREF_RE = new RegExp(`<${NS}href[^>]*>([^<]+)</${NS}href\\s*>`, 'i');

function parsePropfind(xmlText) {
  const out = [];
  if (!xmlText) return out;
  const blocks = xmlText.match(RESPONSE_RE) || [];
  for (const block of blocks) {
    const hrefMatch = block.match(HREF_RE);
    if (!hrefMatch) continue;
    let cleanHref = hrefMatch[1].trim();
    try { cleanHref = decodeURIComponent(cleanHref); } catch (e) { /* 含裸 % 的 href：按原样用 */ }
    cleanHref = cleanHref.replace(/\/+$/, '');
    const name = cleanHref.split('/').pop();
    const meta = parseBackupFilename(name);
    if (!meta) continue; // 非当前格式（含 legacy/目录自身）：跳过
    out.push({ name, at: meta.at });
  }
  return out;
}

/**
 * 上传一份本机备份到 {base}/timeflow/，并把云端轮转到最近 3 份。
 * 失败抛出带 code 的 Error（CONFIG/AUTH/QUOTA/NET/SERVER），调用方记 CLOUD_FAIL。
 */
export async function uploadBackup(name) {
  const cfg = await getCloudConfig();
  const folderUrl = `${base(cfg.url)}/${REMOTE_FOLDER}`;

  // 读取本机文件内容（明文 JSON 直接 PUT）
  let content;
  try {
    content = await FileSystem.readAsStringAsync(BACKUP_DIR + name, { encoding: FileSystem.EncodingType.UTF8 });
  } catch (e) {
    const err = new Error('local file unreadable');
    err.code = 'NET';
    throw err;
  }

  let res;
  try {
    // 确保 timeflow/ 目录存在（已存在时 MKCOL 返回 405，视为成功）
    res = await request(folderUrl, cfg, 'PROPFIND', undefined, { Depth: '0' });
    if (!res.ok && res.status === 404) {
      const mk = await request(folderUrl, cfg, 'MKCOL');
      if (!mk.ok && mk.status !== 405) {
        const err = new Error('MKCOL failed');
        err.code = classify(mk);
        throw err;
      }
    } else if (!res.ok) {
      const err = new Error('folder probe failed');
      err.code = classify(res);
      throw err;
    }

    // 上传（大文件用更长超时；同名重传即覆盖，不会产生重复）
    res = await request(`${folderUrl}/${encodeURIComponent(name)}`, cfg, 'PUT', content, {
      'Content-Type': 'application/json; charset=utf-8',
    }, UPLOAD_TIMEOUT_MS);
    if (!res.ok && res.status !== 201 && res.status !== 204) {
      const err = new Error('PUT failed');
      err.code = classify(res);
      throw err;
    }

    // 云端轮转：只列当前格式文件，删超出 3 份的最旧者；单个删除失败不影响本次上传成功
    const listRes = await request(folderUrl, cfg, 'PROPFIND', undefined, { Depth: '1' });
    if (listRes.ok) {
      const entries = parsePropfind(await listRes.text());
      for (const stale of planCloudPrune(entries)) {
        try {
          await request(`${folderUrl}/${encodeURIComponent(stale)}`, cfg, 'DELETE');
        } catch (e) { /* 轮转失败容忍：下次备份再试 */ }
      }
    }
  } catch (e) {
    if (e && e.code) throw e;
    const err = new Error((e && e.message) || 'network error');
    err.code = e && e.message === 'timeout' ? 'NET' : 'SERVER';
    throw err;
  }
}
