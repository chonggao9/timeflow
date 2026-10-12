import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';
import { getTrips, getRecords, getFocusSessions, importRecords, clearAll } from '../storage/store';
import { encrypt, decrypt, parseHeader, BadPassphraseError } from './crypto';
import {
  collectPreferences,
  buildPlaintext,
  validatePlaintext,
  restorePreferences,
  computeContentHash,
  extractCounts,
  SCHEMA_RECORDS_V2,
} from './schema';
import LocalTarget, { LOCAL_BACKUP_DIR } from './targets/LocalTarget';
import { createWebDavTarget } from './webdav';
import { getBackupState, updateBackupState, getBackupPassphrase } from './state';

export { BadPassphraseError };

/**
 * 格式化时间为 YYYYMMDD-HHmm
 */
export function formatTimestampName(date = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  const y = date.getFullYear();
  const m = p(date.getMonth() + 1);
  const d = p(date.getDate());
  const hh = p(date.getHours());
  const mm = p(date.getMinutes());
  return `${y}${m}${d}-${hh}${mm}`;
}

export function makeBackupFilename(isSnap = false, date = new Date()) {
  const prefix = isSnap ? 'timeflow-snap' : 'timeflow';
  return `${prefix}-${formatTimestampName(date)}.tfb`;
}

/**
 * 统一备份流水线（同时导出 executeBackupPipeline 与 performBackup）
 */
export async function executeBackupPipeline({
  passphrase,
  isManual = false,
  isAuto = false,
  force = false,
  forceBypassConfirm = false,
} = {}) {
  const auto = isAuto || !isManual;

  // 1. 收集数据与偏好
  const [trips, records, focusSessions] = await Promise.all([
    getTrips(),
    getRecords(),
    getFocusSessions(),
  ]);
  const prefs = await collectPreferences();
  const counts = {
    records: records.length,
    focus: focusSessions.length,
    trips: trips.length,
  };

  // 2. 计算内容哈希（防冗余）
  const contentHash = computeContentHash({ trips, records, focusSessions, preferences: prefs });
  const state = await getBackupState();

  if (!force && state.lastHash && state.lastHash === contentHash) {
    return {
      success: true,
      skipped: true,
      skippedReason: 'content_hash_identical',
      reason: 'SAME_HASH',
      counts,
    };
  }

  const localTarget = new LocalTarget();
  const cloudTarget = await createWebDavTarget();

  // 3. 防覆盖保护检查（仅针对自动备份且已配置云端，且未强制绕过）
  if (auto && !forceBypassConfirm && cloudTarget) {
    try {
      const cloudList = await cloudTarget.list();
      let remoteLatestRecords = 0;
      for (const item of cloudList) {
        if (!item.isLegacy) {
          try {
            const raw = await cloudTarget.get(item.name);
            const header = parseHeader(raw);
            if (header && header.counts?.records != null) {
              remoteLatestRecords = header.counts.records;
              break;
            }
          } catch (e) {}
        }
      }

      // 判定规则：本机记录数 < 最新远端版本记录数 × 50% 且 远端 ≥ 10 条
      if (remoteLatestRecords >= 10 && records.length < remoteLatestRecords * 0.5) {
        await updateBackupState({
          status: 'needConfirm',
          needConfirmReason: {
            local: records.length,
            remote: remoteLatestRecords,
          },
        });
        return {
          success: false,
          needConfirm: true,
          skippedReason: 'needConfirm',
          local: records.length,
          remote: remoteLatestRecords,
        };
      }
    } catch (e) {}
  }

  // 4. 打包为结构化 JSON 格式
  const deviceName = Platform.OS === 'android' ? 'Android Device' : 'iOS Device';
  const plaintext = buildPlaintext({ trips, records, focusSessions }, prefs);
  const envelope = {
    v: 1,
    ...plaintext,
    device: deviceName,
    counts,
    hash: contentHash,
  };
  const envelopeStr = JSON.stringify(envelope, null, 2);
  const filename = makeBackupFilename(false);

  // 5. 写入本地目标
  await localTarget.put(filename, envelopeStr);
  await localTarget.prune();

  // 6. 写入 WebDAV 目标（若可用）
  let cloudUploaded = false;
  let cloudError = null;

  if (cloudTarget) {
    try {
      await cloudTarget.put(filename, envelopeStr);
      await cloudTarget.prune();
      cloudUploaded = true;
    } catch (err) {
      cloudError = {
        code: err.code || 'UNKNOWN',
        at: Date.now(),
        message: err.message || '上传云端失败',
      };
    }
  }

  // 7. 更新全局状态
  await updateBackupState((s) => ({
    ...s,
    lastSuccessAt: Date.now(),
    lastCounts: counts,
    lastHash: contentHash,
    status: cloudError ? 'failed' : 'ok',
    cloud: {
      enabled: !!cloudTarget,
      lastError: cloudError,
    },
    local: {
      enabled: true,
    },
  }));

  return {
    success: true,
    filename,
    uri: `${LOCAL_BACKUP_DIR}${filename}`,
    counts,
    cloudUploaded,
    cloudError,
  };
}

export const performBackup = executeBackupPipeline;

/**
 * 创建本地“恢复前快照”（标记 snap，免密）
 */
export async function createPreRestoreSnapshot() {
  const [trips, records, focusSessions] = await Promise.all([
    getTrips(),
    getRecords(),
    getFocusSessions(),
  ]);
  const prefs = await collectPreferences();
  const counts = {
    records: records.length,
    focus: focusSessions.length,
    trips: trips.length,
  };
  const hash = computeContentHash({ trips, records, focusSessions, preferences: prefs });

  const plaintext = buildPlaintext({ trips, records, focusSessions }, prefs);
  const envelope = {
    v: 1,
    ...plaintext,
    device: '本机快照',
    counts,
    hash,
  };

  const localTarget = new LocalTarget();
  const filename = makeBackupFilename(true);
  await localTarget.put(filename, JSON.stringify(envelope, null, 2));
  await localTarget.prune();
  return filename;
}

/**
 * 从原始 JSON 字符串执行恢复（免密直接秒级恢复）
 * @param {string} raw - 备份包字符串
 * @param {'merge'|'overwrite'} mode - 恢复模式
 * @param {string} [passphrase] - 可选密码（仅在遇到历史加密备份时）
 */
export async function restoreFromRaw(raw, mode = 'merge', passphrase = '') {
  let envelope;
  try {
    envelope = JSON.parse(raw);
  } catch (e) {
    throw new BadPassphraseError('无效的备份文件');
  }

  // 1. 如果包含 ciphertext 且是旧版加密包
  let plaintext;
  if (envelope.ciphertext) {
    if (!passphrase) {
      throw new BadPassphraseError('该备份文件来自历史加密版本，需要输入原密码解密');
    }
    plaintext = decrypt(passphrase, envelope);
  } else {
    // 免密新版本
    plaintext = envelope;
  }

  if (!validatePlaintext(plaintext)) {
    throw new BadPassphraseError('备份数据格式不符合规范');
  }

  // 2. 若是完全覆盖模式，先清空现有数据
  if (mode === 'overwrite') {
    await clearAll();
  }

  // 3. 导入数据
  let result;
  if (plaintext.schema === SCHEMA_RECORDS_V2) {
    result = await importRecords(
      plaintext.data || { trips: [], records: plaintext.data?.records || [], focusSessions: [] }
    );
  } else {
    result = await importRecords(plaintext.records);
  }

  // 4. 恢复偏好
  await restorePreferences(plaintext.preferences);

  // 5. 更新状态
  const counts = extractCounts(plaintext.data || plaintext);
  await updateBackupState((s) => ({
    ...s,
    lastCounts: counts,
  }));

  return {
    imported: result.imported,
    skipped: result.skipped,
    mode,
    counts,
  };
}

/**
 * 分享备份文件（调用系统分享）
 */
export async function shareBackup(filename) {
  if (!(await Sharing.isAvailableAsync())) return false;
  const uri = `${LOCAL_BACKUP_DIR}${filename}`;
  await Sharing.shareAsync(uri, {
    mimeType: 'application/json',
    dialogTitle: 'TimeFlow 备份导出',
  });
  return true;
}

/**
 * 列出所有历史版本（本地与云端合并去重，免密解析头部）
 */
export async function listUnifiedVersions() {
  const localTarget = new LocalTarget();
  const cloudTarget = await createWebDavTarget();

  const [localRows, cloudRows] = await Promise.all([
    localTarget.list().catch(() => []),
    cloudTarget ? cloudTarget.list().catch(() => []) : Promise.resolve([]),
  ]);

  const map = new Map();

  // 处理本地项
  for (const row of localRows) {
    const raw = await localTarget.get(row.name).catch(() => null);
    const header = raw ? parseHeader(raw) : null;
    map.set(row.name, {
      name: row.name,
      modifiedAt: row.modifiedAt,
      size: row.size,
      isSnap: row.isSnap,
      isLegacy: row.isLegacy,
      device: header?.device || 'Android',
      counts: header?.counts || { records: 0, focus: 0, trips: 0 },
      createdAt: header?.createdAt || new Date(row.modifiedAt).toISOString(),
      sources: ['local'],
    });
  }

  // 合并云端项
  for (const row of cloudRows) {
    if (map.has(row.name)) {
      const existing = map.get(row.name);
      if (!existing.sources.includes('cloud')) {
        existing.sources.push('cloud');
      }
    } else {
      let header = null;
      if (!row.isLegacy) {
        try {
          const raw = await cloudTarget.get(row.name);
          header = parseHeader(raw);
        } catch (e) {}
      }
      map.set(row.name, {
        name: row.name,
        modifiedAt: row.modifiedAt,
        size: row.size,
        isSnap: false,
        isLegacy: row.isLegacy,
        device: header?.device || (row.isLegacy ? 'Legacy Cloud' : 'Cloud Device'),
        counts: header?.counts || (row.isLegacy ? null : { records: 0, focus: 0, trips: 0 }),
        createdAt: header?.createdAt || new Date(row.modifiedAt).toISOString(),
        sources: ['cloud'],
      });
    }
  }

  const result = Array.from(map.values());
  result.sort((a, b) => b.modifiedAt - a.modifiedAt);
  return result;
}

/**
 * 读取某个版本的原始密文字符串（优先本地，若无从云端拉取）
 */
export async function getVersionRawContent(versionItem) {
  const localTarget = new LocalTarget();
  if (versionItem.sources.includes('local')) {
    try {
      return await localTarget.get(versionItem.name);
    } catch (e) {}
  }
  const cloudTarget = await createWebDavTarget();
  if (cloudTarget && versionItem.sources.includes('cloud')) {
    return await cloudTarget.get(versionItem.name);
  }
  throw new Error('无法读取该版本的备份文件');
}
