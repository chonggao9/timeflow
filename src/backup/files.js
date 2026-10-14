// 本机备份文件存取：目录扫描即列表（无索引文件），原子写保证失败不伤及已有备份。
// expo-file-system 沿用项目 legacy API 惯例。
import * as FileSystem from 'expo-file-system';
import { parseBackupFilename, validatePackage } from './format';

export const BACKUP_DIR = `${FileSystem.documentDirectory}backups/`;

export async function ensureBackupDir() {
  const info = await FileSystem.getInfoAsync(BACKUP_DIR);
  if (!info.exists) await FileSystem.makeDirectoryAsync(BACKUP_DIR, { intermediates: true });
}

/**
 * 扫描目录生成备份列表（时间/kind/条数来自文件名，大小来自 getInfoAsync）。
 * 返回按时间倒序：[{ name, at, kind, records, size }]；无法解析的文件名忽略（含 .tmp）。
 */
export async function listVersions() {
  await ensureBackupDir();
  const names = await FileSystem.readDirectoryAsync(BACKUP_DIR);
  const out = [];
  for (const name of names) {
    const meta = parseBackupFilename(name);
    if (!meta) continue;
    let size = 0;
    try {
      const info = await FileSystem.getInfoAsync(BACKUP_DIR + name);
      size = info.size || 0;
    } catch (e) { /* 单个文件信息失败不影响列表 */ }
    out.push({ ...meta, size });
  }
  out.sort((a, b) => b.at - a.at);
  return out;
}

// 写临时文件 → 读回校验 JSON+格式 → 改名落位。任何一步失败都清掉 tmp，不触碰已有备份。
export async function writeBackupAtomic(name, jsonString) {
  await ensureBackupDir();
  const tmp = `${BACKUP_DIR}${name}.tmp`;
  const final = BACKUP_DIR + name;
  try {
    await FileSystem.writeAsStringAsync(tmp, jsonString, { encoding: FileSystem.EncodingType.UTF8 });
    const readBack = await FileSystem.readAsStringAsync(tmp, { encoding: FileSystem.EncodingType.UTF8 });
    const check = validatePackage(readBack);
    if (!check.ok) throw new Error('backup verify failed');
    // 同名旧文件（同分钟重复备份）先删再改名，moveAsync 不覆盖
    const existing = await FileSystem.getInfoAsync(final);
    if (existing.exists) await FileSystem.deleteAsync(final, { idempotent: true });
    await FileSystem.moveAsync({ from: tmp, to: final });
    const info = await FileSystem.getInfoAsync(final);
    return { name, size: info.size || 0 };
  } catch (e) {
    try { await FileSystem.deleteAsync(tmp, { idempotent: true }); } catch (e2) {}
    throw e;
  }
}

// 读取并校验一份备份；无效（损坏/旧格式/非本应用）返回 null
export async function readPackage(name) {
  try {
    const raw = await FileSystem.readAsStringAsync(BACKUP_DIR + name, { encoding: FileSystem.EncodingType.UTF8 });
    const check = validatePackage(raw);
    return check.ok ? check.pkg : null;
  } catch (e) {
    return null;
  }
}

// 读取任意 uri 的文件并校验（供「从文件导入」使用）
export async function readPackageFromUri(uri) {
  try {
    const raw = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.UTF8 });
    const check = validatePackage(raw);
    return check.ok ? check.pkg : null;
  } catch (e) {
    return null;
  }
}

// 写临时导出文件（CSV 等）到 cacheDirectory，返回 uri 供分享；失败抛出
export async function writeCacheFile(name, content) {
  const uri = `${FileSystem.cacheDirectory}${name}`;
  await FileSystem.writeAsStringAsync(uri, content, { encoding: FileSystem.EncodingType.UTF8 });
  return uri;
}

export async function removeBackup(name) {
  try {
    await FileSystem.deleteAsync(BACKUP_DIR + name, { idempotent: true });
  } catch (e) { /* 已不存在视为成功 */ }
}
