// 恢复：replace（回到这个时间点）/ merge（只补回缺少的记录），事务化执行，
// 恢复前自动生成 safe 备份，完成后可一键撤销。
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  getTrips, getRecords, getFocusSessions,
  importRecords, replaceAllData,
} from '../storage/store';
import { PREF_KEYS } from './format';
import { planRestore } from './plan';
import { readPackage, removeBackup } from './files';
import { runBackup, getCurrentCounts } from './backup';

// 偏好白名单回写：只写 PREF_KEYS，其余键一律忽略（防注入）
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

async function collectIds() {
  const [trips, records, focus] = await Promise.all([getTrips(), getRecords(), getFocusSessions()]);
  return [...trips, ...records, ...focus].map((r) => r.id);
}

function packageIds(pkg) {
  const d = pkg?.data || {};
  return [
    ...(Array.isArray(d.trips) ? d.trips : []),
    ...(Array.isArray(d.records) ? d.records : []),
    ...(Array.isArray(d.focusSessions) ? d.focusSessions : []),
  ].map((r) => r.id);
}

// 恢复预览：当前多出的条数（replace 会被替换）、可补回的条数（merge）
export async function previewRestore(pkg) {
  const [curIds, counts] = await Promise.all([collectIds(), getCurrentCounts()]);
  const plan = planRestore(curIds, packageIds(pkg));
  return { ...plan, currentCounts: counts };
}

/**
 * 执行恢复。pkg 为已通过 validatePackage 的备份对象；mode: 'replace' | 'merge'。
 * 流程：safe 备份（强制写入，失败则中止且数据原样）→ 事务写库 →（replace 时）回写偏好。
 * 返回 { ok:true, safeName, prevCounts, newCounts } 或 { ok:false, code }
 */
export async function restoreFromPackage(pkg, mode = 'replace') {
  // 1. 恢复前自动备份当前数据（safe 不参与自动清理）
  const safe = await runBackup({ kind: 'safe', force: true });
  if (safe.status !== 'done') {
    return { ok: false, code: safe.status === 'error' ? safe.code : 'SAFE_FAIL' };
  }

  const prevCounts = await getCurrentCounts();
  const data = {
    trips: pkg.data.trips,
    records: pkg.data.records,
    focusSessions: pkg.data.focusSessions,
  };

  // 2. 写库：replace = 单事务清空+全量写入；merge = INSERT OR IGNORE 按 id 补入
  try {
    if (mode === 'replace') {
      await replaceAllData(data);
      await restorePreferences(pkg.data.prefs);
    } else {
      await importRecords(data);
    }
  } catch (e) {
    // 事务失败：数据保持原样。safe 备份保留（用户数据未动，可手动删除）
    return { ok: false, code: 'RESTORE_FAIL' };
  }

  const newCounts = await getCurrentCounts();
  return { ok: true, safeName: safe.name, prevCounts, newCounts };
}

/**
 * 撤销恢复：用刚才的 safe 备份整体还原，并删除该 safe 文件。
 * 返回 { ok:true } 或 { ok:false, code }
 */
export async function undoRestore(safeName) {
  if (!safeName) return { ok: false, code: 'NO_SAFE' };
  const pkg = await readPackage(safeName);
  if (!pkg) return { ok: false, code: 'SAFE_GONE' };
  try {
    await replaceAllData({
      trips: pkg.data.trips,
      records: pkg.data.records,
      focusSessions: pkg.data.focusSessions,
    });
    await restorePreferences(pkg.data.prefs);
  } catch (e) {
    return { ok: false, code: 'RESTORE_FAIL' };
  }
  await removeBackup(safeName);
  return { ok: true };
}

// 从本机备份文件恢复（列表页入口）：读文件 → 校验 → 恢复
export async function restoreFromLocalFile(name, mode) {
  const pkg = await readPackage(name);
  if (!pkg) return { ok: false, code: 'INVALID' };
  return restoreFromPackage(pkg, mode);
}
