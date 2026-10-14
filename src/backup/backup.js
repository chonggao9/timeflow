// 备份主流程：收集 → 哈希比对（无变化跳过）→ 原子写 → 清理 → 更新状态。
// 凭证（高德 Key、WebDAV 账号密码）永不入包：偏好仅收 PREF_KEYS 白名单。
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { getTrips, getRecords, getFocusSessions } from '../storage/store';
import { PREF_KEYS, buildPackage, makeBackupFilename, extractCounts } from './format';
import { computeContentHash } from './hash';
import { listVersions, writeBackupAtomic, removeBackup } from './files';
import { planPrune } from './plan';
import { getBackupState, updateBackupState } from './state';
import { uploadBackup } from './cloud';

let isRunning = false;
export function isBackupRunning() { return isRunning; }

async function collectPreferences() {
  const prefs = {};
  for (const key of PREF_KEYS) {
    try { prefs[key] = await AsyncStorage.getItem(key); } catch (e) { prefs[key] = null; }
  }
  return prefs;
}

export async function collectData() {
  const [trips, records, focusSessions, prefs] = await Promise.all([
    getTrips(), getRecords(), getFocusSessions(), collectPreferences(),
  ]);
  return { trips, records, focusSessions, prefs };
}

export async function getDeviceName() {
  try {
    return Constants.deviceName || (Constants.platform?.android ? 'Android Device' : 'iOS Device');
  } catch (e) {
    return 'Android Device';
  }
}

// 写失败错误分类：空间不足单独提示（诚实告知旧备份仍在），其余归 WRITE_FAIL。
// 只匹配明确的「空间不足」措辞，避免 namespace 等含 space 的无关报错被误判为 NO_SPACE。
function classifyWriteError(e) {
  const msg = String((e && e.message) || e || '');
  if (/no space|enospc|not enough space|out of space|storage quota|disk full/i.test(msg)) return 'NO_SPACE';
  return 'WRITE_FAIL';
}

/**
 * 执行一次备份。
 * kind: 'auto' | 'manual' | 'safe'（safe = 危险操作前强制生成，永远写入）
 * force: 跳过「内容无变化」判定（safe/重试场景）
 * 返回：{ status:'done', name, counts } | { status:'skipped' } | { status:'error', code }
 */
export async function runBackup({ kind = 'manual', force = false } = {}) {
  if (isRunning) return { status: 'busy' };
  isRunning = true;
  try {
    const state = await getBackupState();
    const data = await collectData();
    const hash = computeContentHash(data);

    // 数据没有变化：不生成新文件（failed 态下的「重试」与 safe 备份除外）
    if (!force && kind !== 'safe' && hash === state.lastHash && !state.lastError) {
      return { status: 'skipped' };
    }

    const counts = extractCounts(data);
    const device = await getDeviceName();
    const now = new Date();
    const pkg = buildPackage(data, data.prefs, { device, createdAt: now.toISOString() });
    const name = makeBackupFilename(kind, now, counts.records);

    let written;
    try {
      written = await writeBackupAtomic(name, JSON.stringify(pkg, null, 2));
    } catch (e) {
      const code = classifyWriteError(e);
      await updateBackupState((s) => ({ ...s, lastError: { code, at: Date.now() } }));
      return { status: 'error', code };
    }

    // 只有新备份写入并校验成功后，才执行清理
    try {
      const versions = await listVersions();
      const { toDelete } = planPrune(versions);
      for (const n of toDelete) await removeBackup(n);
    } catch (e) { /* 清理失败不影响本次备份成功 */ }

    await updateBackupState((s) => ({
      ...s,
      lastSuccessAt: Date.now(),
      lastCounts: counts,
      lastHash: hash,
      lastError: null,
      lastAutoAt: kind === 'auto' ? Date.now() : s.lastAutoAt,
    }));

    // 云端副本：开启时上传；失败记独立的 lastCloudError（不进 lastError，
    // 本机备份仍是成功——四态推导与「无变化跳过」判定都不受云端故障影响）
    let cloud = 'off';
    if (state.cloudEnabled) {
      try {
        await uploadBackup(written.name);
        cloud = 'ok';
        await updateBackupState((s) => ({ ...s, lastCloudError: null }));
      } catch (e) {
        cloud = 'fail';
        try {
          await updateBackupState((s) => ({ ...s, lastCloudError: { code: (e && e.code) || 'CLOUD_FAIL', at: Date.now() } }));
        } catch (e2) {}
      }
    }

    return { status: 'done', name: written.name, counts, size: written.size, cloud };
  } catch (e) {
    // 收集/写状态等意外错误：按 WRITE_FAIL 呈现，不抛出
    try {
      await updateBackupState((s) => ({ ...s, lastError: { code: 'WRITE_FAIL', at: Date.now() } }));
    } catch (e2) {}
    return { status: 'error', code: 'WRITE_FAIL' };
  } finally {
    isRunning = false;
  }
}

// 供 UI 显示「我的数据」三格：实时条数
export async function getCurrentCounts() {
  const [records, focusSessions, trips] = await Promise.all([getRecords(), getFocusSessions(), getTrips()]);
  return { records: records.length, focus: focusSessions.length, trips: trips.length };
}
