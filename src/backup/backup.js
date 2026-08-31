// 备份编排：本地加密备份生成 / 分享 / 从文件或原始串恢复。
// 载体是 getRecords() 的 JSON 明文 → 加密成 envelope → 写 documentDirectory/timeflow-backups/。
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { getRecords, importRecords } from '../storage/store';
import { encrypt, decrypt, BadPassphraseError } from './crypto';
import { collectPreferences, buildPlaintext, validatePlaintext, restorePreferences } from './schema';

const BACKUP_DIR = `${FileSystem.documentDirectory}timeflow-backups/`;
const KEEP_LOCAL = 5; // 本地目录只保留最近 N 份，避免无限堆积

// 备份文件名：timeflow-backup-YYYYMMDD-HHMMSS.json（本地时间）
export function makeBackupFilename(date = new Date()) {
  const p = n => String(n).padStart(2, '0');
  return `timeflow-backup-${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}`
    + `-${p(date.getHours())}${p(date.getMinutes())}${p(date.getSeconds())}.json`;
}

// 生成加密备份文件，返回本地 uri（含写入前建目录 + 写入后清理旧档）。
export async function makeLocalBackup({ passphrase }) {
  const records = await getRecords();
  const prefs = await collectPreferences();
  const plaintext = buildPlaintext(records, prefs);
  const envelope = encrypt(passphrase, plaintext);
  try {
    await FileSystem.makeDirectoryAsync(BACKUP_DIR, { intermediates: true });
  } catch (e) { /* 已存在则忽略 */ }
  const uri = `${BACKUP_DIR}${makeBackupFilename()}`;
  await FileSystem.writeAsStringAsync(uri, JSON.stringify(envelope), { encoding: FileSystem.EncodingType.UTF8 });
  await pruneOldBackups(KEEP_LOCAL);
  return uri;
}

// 分享本地备份文件（复用 expo-sharing）。返回是否成功。
export async function shareBackup(uri, dialogTitle) {
  if (!(await Sharing.isAvailableAsync())) return false;
  await Sharing.shareAsync(uri, { mimeType: 'application/json', dialogTitle: dialogTitle || 'TimeFlow backup' });
  return true;
}

// 读文件（content:// 先拷贝到 cache 再读）→ 原始串 →
export async function readAndRestore(fileUri, passphrase) {
  const localUri = await ensureReadable(fileUri);
  const raw = await FileSystem.readAsStringAsync(localUri, { encoding: FileSystem.EncodingType.UTF8 });
  return readAndRestoreFromRaw(raw, passphrase);
}

// 从原始串恢复（文件路径与云端下载共用此入口）。返回 { imported, skipped }。
export async function readAndRestoreFromRaw(raw, passphrase) {
  let envelope;
  try { envelope = JSON.parse(raw); } catch (e) { throw new BadPassphraseError('not a TimeFlow backup'); }

  const plaintext = decrypt(passphrase, envelope); // 先验 HMAC，错口令抛 BadPassphraseError
  if (!validatePlaintext(plaintext)) throw new BadPassphraseError('invalid backup format');

  const { imported, skipped } = await importRecords(plaintext.records);
  await restorePreferences(plaintext.preferences);
  return { imported, skipped };
}

// content://（document-picker）不能直读，拷贝到 cache 后返回本地 uri。
async function ensureReadable(fileUri) {
  if (!fileUri || !fileUri.startsWith('content://')) return fileUri;
  const dest = `${FileSystem.cacheDirectory}timeflow-restore-${Date.now()}.json`;
  await FileSystem.copyAsync({ from: fileUri, to: dest });
  return dest;
}

// 列出本地备份（按 mtime 降序：最新在前）。
async function listBackups() {
  try {
    const names = await FileSystem.readDirectoryAsync(BACKUP_DIR);
    const rows = [];
    for (const name of names) {
      const uri = BACKUP_DIR + name;
      const info = await FileSystem.getInfoAsync(uri, { md5: false });
      if (info.exists) rows.push({ name, uri, mtime: info.modificationTime || 0 });
    }
    rows.sort((a, b) => b.mtime - a.mtime);
    return rows;
  } catch (e) {
    return [];
  }
}

// 只留最近 max 份，其余删掉。
export async function pruneOldBackups(max = KEEP_LOCAL) {
  const rows = await listBackups();
  for (let i = max; i < rows.length; i++) {
    try { await FileSystem.deleteAsync(rows[i].uri, { idempotent: true }); } catch (e) { /* 忽略 */ }
  }
}
