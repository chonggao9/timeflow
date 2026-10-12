import CryptoJS from 'crypto-js';
import Target from './Target';
import { withTimeout } from '../../utils/withTimeout';

export const KEEP_CLOUD_COUNT = 7;
export const REMOTE_FOLDER = 'timeflow';
export const LEGACY_REMOTE_FILENAME = 'timeflow-backup-latest.json';

export class BackupError extends Error {
  constructor(code, message, originalError = null) {
    super(message || code);
    this.name = 'BackupError';
    this.code = code; // 'AUTH' | 'NETWORK' | 'QUOTA' | 'UNKNOWN'
    this.originalError = originalError;
  }
}

export default class WebDavTarget extends Target {
  constructor(config = {}) {
    super('cloud');
    this.url = (config.url || '').trim().replace(/\/+$/, '');
    this.username = (config.username || '').trim();
    this.password = config.password || '';
    this.timeoutMs = config.timeoutMs || 15000;
  }

  getFolderUrl() {
    return `${this.url}/${REMOTE_FOLDER}`;
  }

  getFileUrl(filename) {
    if (filename === LEGACY_REMOTE_FILENAME) {
      return `${this.url}/${filename}`;
    }
    return `${this.getFolderUrl()}/${filename}`;
  }

  getAuthHeader() {
    const raw = `${this.username}:${this.password}`;
    return 'Basic ' + CryptoJS.enc.Base64.stringify(CryptoJS.enc.Utf8.parse(raw));
  }

  async request(method, targetUrl, body = undefined, customHeaders = {}) {
    if (!this.url || !this.username || !this.password) {
      throw new BackupError('AUTH', 'WebDAV 未配置或缺少密码');
    }

    const headers = {
      Authorization: this.getAuthHeader(),
      ...customHeaders,
    };

    let res;
    try {
      res = await withTimeout(
        fetch(targetUrl, {
          method,
          headers,
          body,
        }),
        this.timeoutMs
      );
    } catch (e) {
      if (e && e.message === 'timeout') {
        throw new BackupError('NETWORK', '连接超时，请检查网络设置', e);
      }
      throw new BackupError('NETWORK', '网络连接异常，无法连接到云端', e);
    }

    if (res.ok || (method === 'MKCOL' && res.status === 405)) {
      return res;
    }

    if (res.status === 401 || res.status === 403) {
      throw new BackupError('AUTH', 'WebDAV 账号或应用密码错误 (HTTP ' + res.status + ')');
    }
    if (res.status === 507) {
      throw new BackupError('QUOTA', 'WebDAV 云盘存储空间不足 (HTTP 507)');
    }
    if (res.status === 404) {
      const err = new BackupError('UNKNOWN', '目标不存在 (HTTP 404)');
      err.status = 404;
      throw err;
    }

    throw new BackupError('UNKNOWN', '服务器返回异常 HTTP ' + res.status);
  }

  async ensureRemoteFolder() {
    const folderUrl = this.getFolderUrl();
    try {
      await this.request('PROPFIND', folderUrl, undefined, { Depth: '0' });
    } catch (e) {
      if (e && (e.status === 404 || (e.message && e.message.includes('404')))) {
        try {
          await this.request('MKCOL', folderUrl);
        } catch (mkErr) {
          // 部分服务端已存在时报 405，忽略
        }
      } else {
        throw e;
      }
    }
  }

  async put(filename, content) {
    await this.ensureRemoteFolder();
    const url = this.getFileUrl(filename);
    await this.request('PUT', url, content, {
      'Content-Type': 'application/json; charset=utf-8',
    });
  }

  async get(filename) {
    const url = this.getFileUrl(filename);
    const res = await this.request('GET', url);
    return await res.text();
  }

  async remove(filename) {
    const url = this.getFileUrl(filename);
    try {
      await this.request('DELETE', url);
    } catch (e) {
      // 忽略已删除或404
    }
  }

  /**
   * 解析 WebDAV PROPFIND 返回的 XML / 文本
   */
  parsePropfindResponse(xmlText, baseFolderUrl) {
    const results = [];
    if (!xmlText) return results;

    // 简单正则匹配 <D:response> 或 <d:response>
    const responseBlocks = xmlText.match(/<[^:]*:response[\s\S]*?<\/[^:]*:response>/gi) || [];

    for (const block of responseBlocks) {
      const hrefMatch = block.match(/<[^:]*:href[^>]*>([^<]+)<\/[^:]*:href>/i);
      if (!hrefMatch) continue;
      const rawHref = decodeURIComponent(hrefMatch[1].trim());

      // 提取文件名
      const cleanHref = rawHref.replace(/\/+$/, '');
      const parts = cleanHref.split('/');
      const name = parts[parts.length - 1];
      if (!name || name === REMOTE_FOLDER) continue;

      if (!name.endsWith('.tfb') && !name.endsWith('.json')) continue;

      // 文件大小
      let size = 0;
      const sizeMatch = block.match(/<[^:]*:getcontentlength[^>]*>([^<]+)<\/[^:]*:getcontentlength>/i);
      if (sizeMatch) {
        size = parseInt(sizeMatch[1], 10) || 0;
      }

      // 修改时间
      let modifiedAt = 0;
      const dateMatch = block.match(/<[^:]*:getlastmodified[^>]*>([^<]+)<\/[^:]*:getlastmodified>/i);
      if (dateMatch) {
        modifiedAt = new Date(dateMatch[1]).getTime() || 0;
      }

      const isLegacy = name === LEGACY_REMOTE_FILENAME || name.endsWith('.json');

      results.push({
        name,
        size,
        modifiedAt: modifiedAt || Date.now(),
        isLegacy,
      });
    }

    return results;
  }

  async list() {
    await this.ensureRemoteFolder();
    const rows = [];

    // 1. 获取 timeflow/ 目录列表
    try {
      const folderUrl = this.getFolderUrl();
      const res = await this.request('PROPFIND', folderUrl, undefined, { Depth: '1' });
      const xml = await res.text();
      const folderRows = this.parsePropfindResponse(xml, folderUrl);
      rows.push(...folderRows);
    } catch (e) {
      if (e instanceof BackupError && (e.code === 'AUTH' || e.code === 'NETWORK' || e.code === 'QUOTA')) {
        throw e;
      }
    }

    // 2. 检查根目录是否有 legacy 的 timeflow-backup-latest.json
    try {
      const legacyUrl = `${this.url}/${LEGACY_REMOTE_FILENAME}`;
      const legRes = await this.request('HEAD', legacyUrl).catch(() => null);
      if (legRes && legRes.ok) {
        const lastMod = legRes.headers?.get('last-modified');
        const size = parseInt(legRes.headers?.get('content-length') || '0', 10);
        rows.push({
          name: LEGACY_REMOTE_FILENAME,
          size,
          modifiedAt: lastMod ? new Date(lastMod).getTime() : 0,
          isLegacy: true,
        });
      }
    } catch (e) {
      // 忽略根目录 legacy 探测失败
    }

    // 过滤去重并按时间倒序排
    const map = new Map();
    for (const r of rows) {
      if (!map.has(r.name) || (r.modifiedAt > map.get(r.name).modifiedAt)) {
        map.set(r.name, r);
      }
    }

    const uniqueList = Array.from(map.values());
    uniqueList.sort((a, b) => b.modifiedAt - a.modifiedAt);
    return uniqueList;
  }

  /**
   * 清理云端旧版本（保留最近 max 份，默认 7 份；绝不清理 legacy 文件）
   */
  async prune(max = KEEP_CLOUD_COUNT) {
    const list = await this.list();
    const nonLegacyTfb = list.filter(r => !r.isLegacy && r.name.endsWith('.tfb'));
    for (let i = max; i < nonLegacyTfb.length; i++) {
      await this.remove(nonLegacyTfb[i].name);
    }
  }

  /**
   * 测试连接有效性
   */
  async testConnection() {
    await this.ensureRemoteFolder();
    return true;
  }
}
