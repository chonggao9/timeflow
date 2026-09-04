// 打卡记录存储：expo-sqlite。历史数据可查询/聚合/事务原子写。
// 对外 API 表面与旧 AsyncStorage 实现完全一致，调用方无需改动。
// 偏好/会话键（trip/mode）仍留 AsyncStorage。
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SQLite from 'expo-sqlite';

const RECORDS_KEY = 'timeflow_records';
const TRIP_KEY = 'timeflow_current_trip';
const LAST_CHECKIN_TS_KEY = 'timeflow_last_checkin_ts';
const TRIP_TIMEOUT_MS = 3 * 60 * 60 * 1000; // 3小时无打卡自动断开行程
const MODE_KEY = 'timeflow_mode';

// 旧数据无 tripId，统一归为该值（一条历史行程）
export const LEGACY_TRIP = 'legacy';

const DB_NAME = 'timeflow.db';

// SQLite 单例：打开 + 建表 + 一次性迁移。所有读写先 await 它。
let dbPromise = null;
function getDb() {
  if (!dbPromise) {
    dbPromise = (async () => {
      const db = await SQLite.openDatabaseAsync(DB_NAME);
      await db.execAsync(`
        PRAGMA journal_mode = WAL;
        CREATE TABLE IF NOT EXISTS records (
          id TEXT PRIMARY KEY,
          timestamp INTEGER NOT NULL,
          location_name TEXT,
          lat REAL,
          lng REAL,
          mode TEXT,
          trip_id TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_records_ts ON records(timestamp);
        CREATE INDEX IF NOT EXISTS idx_records_trip ON records(trip_id);
      `);
      try { await migrateLegacy(db); } catch (e) { /* 迁移失败不阻塞，旧数据留待下次重试 */ }
      return db;
    })();
    // 打开/建表失败时重置，下次调用可重试，避免一次失败永久锁死存储
    dbPromise.catch(() => { dbPromise = null; });
  }
  return dbPromise;
}

// 一次性迁移：AsyncStorage 旧 JSON → SQLite，成功后删旧键；失败保留可重试（幂等）
async function migrateLegacy(db) {
  const raw = await AsyncStorage.getItem(RECORDS_KEY);
  if (raw == null) return;
  const records = JSON.parse(raw);
  if (!Array.isArray(records)) return;
  if (records.length === 0) { await AsyncStorage.removeItem(RECORDS_KEY); return; }
  await db.withTransactionAsync(async () => {
    for (const r of records) {
      await db.runAsync(
        'INSERT OR IGNORE INTO records (id, timestamp, location_name, lat, lng, mode, trip_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
        r.id, r.timestamp, r.locationName ?? null, r.lat ?? null, r.lng ?? null, r.mode ?? null, r.tripId ?? null
      );
    }
  });
  const row = await db.getFirstAsync('SELECT COUNT(*) AS c FROM records');
  if (row && row.c >= records.length) {
    await AsyncStorage.removeItem(RECORDS_KEY);
  }
}

const makeTripId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

// 本地当日零点（epoch ms）；China 无 DST，86400000 即一天
function dayStart(ts) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export async function getCurrentTripId() {
  try {
    const id = await AsyncStorage.getItem(TRIP_KEY);
    if (!id) return null;
    const raw = await AsyncStorage.getItem(LAST_CHECKIN_TS_KEY);
    if (!raw) return id; // 兼容无时间戳旧数据
    const lastTs = Number(raw);
    const now = Date.now();
    if (now - lastTs > TRIP_TIMEOUT_MS || dayStart(now) !== dayStart(lastTs)) {
      // 已超时（>3小时）或跨越自然日，自动关闭旧行程
      await AsyncStorage.multiRemove([TRIP_KEY, LAST_CHECKIN_TS_KEY]);
      return null;
    }
    return id;
  } catch (e) {
    return null;
  }
}

// 获取当前行程，超时（>3小时）或跨越自然日自动新建行程
export async function ensureTrip() {
  const now = Date.now();
  let id = await getCurrentTripId();
  if (!id) {
    id = makeTripId();
    await AsyncStorage.setItem(TRIP_KEY, id);
  }
  await AsyncStorage.setItem(LAST_CHECKIN_TS_KEY, String(now));
  return id;
}

// 结束当前行程：清空标识与时间戳，下次打卡自动新建行程
export async function endTrip() {
  await AsyncStorage.multiRemove([TRIP_KEY, LAST_CHECKIN_TS_KEY]);
}

// 记住/读取上次出行方式
export async function getLastMode() {
  try { return await AsyncStorage.getItem(MODE_KEY) || 'walk'; } catch (e) { return 'walk'; }
}
export async function setLastMode(mode) {
  try { await AsyncStorage.setItem(MODE_KEY, mode); } catch (e) {}
}

const COLS = 'id, timestamp, location_name AS locationName, lat, lng, mode, trip_id AS tripId';

// 保存一条打卡记录（SQLite 单条 INSERT 天然原子）
export function saveRecord(record) {
  return (async () => {
    const db = await getDb();
    await db.runAsync(
      'INSERT INTO records (id, timestamp, location_name, lat, lng, mode, trip_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
      record.id, record.timestamp, record.locationName ?? null, record.lat ?? null, record.lng ?? null, record.mode ?? null, record.tripId ?? null
    );
  })();
}

// 获取所有打卡记录（按时间升序）
export async function getRecords() {
  const db = await getDb();
  return db.getAllAsync(`SELECT ${COLS} FROM records ORDER BY timestamp ASC`);
}

// 获取今日记录（本地时区当天，按时间升序）
export async function getTodayRecords() {
  const db = await getDb();
  const start = dayStart(Date.now());
  const end = new Date(start);
  end.setDate(end.getDate() + 1); // 次日本地零点，避免 DST 时区一天不等于 86400000ms
  return db.getAllAsync(
    `SELECT ${COLS} FROM records WHERE timestamp >= ? AND timestamp < ? ORDER BY timestamp ASC`,
    start, end.getTime()
  );
}

// 根据 ID 获取单条打卡记录（用于补位前校验状态或删除防护）
export async function getRecordById(id) {
  if (!id) return null;
  const db = await getDb();
  return db.getFirstAsync(`SELECT ${COLS} FROM records WHERE id = ?`, id);
}

// 获取数据指纹（总数 + 最新时间戳），极速用于缓存对比（<1ms）
export async function getRecordsFingerprint() {
  const db = await getDb();
  const row = await db.getFirstAsync('SELECT COUNT(*) AS count, COALESCE(MAX(timestamp), 0) AS maxTs FROM records');
  return `${row?.count || 0}:${row?.maxTs || 0}`;
}

// patch 驼峰键 → 表列名
const COL_MAP = { locationName: 'location_name', tripId: 'trip_id', mode: 'mode', lat: 'lat', lng: 'lng' };

// 更新一条记录（如改地名 / 补坐标）
export function updateRecord(id, patch) {
  return (async () => {
    const keys = Object.keys(patch);
    if (!keys.length) return;
    const sets = keys.map(k => `${COL_MAP[k] || k} = ?`).join(', ');
    const db = await getDb();
    await db.runAsync(
      `UPDATE records SET ${sets} WHERE id = ?`,
      ...keys.map(k => patch[k] ?? null), id
    );
  })();
}

// 删除一条记录
export function deleteRecord(id) {
  return (async () => {
    const db = await getDb();
    await db.runAsync('DELETE FROM records WHERE id = ?', id);
  })();
}

// 清空所有打卡数据（含未完成的迁移源，避免下次启动重新导入）
export async function clearAll() {
  const db = await getDb();
  await db.runAsync('DELETE FROM records');
  await AsyncStorage.multiRemove([TRIP_KEY, RECORDS_KEY]);
}

// 记录总数（用于导入结果 / 数据量展示）
export async function countRecords() {
  const db = await getDb();
  const row = await db.getFirstAsync('SELECT COUNT(*) AS c FROM records');
  return row ? row.c : 0;
}

// 恢复偏好时写回当前行程标识；id 空则清除（结束行程语义）
export async function setCurrentTripId(id) {
  if (id) await AsyncStorage.setItem(TRIP_KEY, id);
  else await AsyncStorage.removeItem(TRIP_KEY);
}

// 幂等批量导入备份记录：INSERT OR IGNORE，同 id 已存在则跳过。
// 复用 migrateLegacy 的 withTransactionAsync 模板，保证整体原子。
// 返回 { imported, skipped }：imported=实际新增数，skipped=已存在/无效跳过数。
// 用 countRecords 前后差统计 imported，不依赖 runAsync 的 changes 字段（各版本可能不一致）。
export async function importRecords(records) {
  const input = Array.isArray(records) ? records : [];
  const list = input.filter(r => r && typeof r.id === 'string' && r.id);
  const skippedInvalid = input.length - list.length;
  if (!list.length) return { imported: 0, skipped: skippedInvalid || input.length };
  const db = await getDb();
  const before = await countRecords();
  await db.withTransactionAsync(async () => {
    for (const r of list) {
      await db.runAsync(
        'INSERT OR IGNORE INTO records (id, timestamp, location_name, lat, lng, mode, trip_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
        r.id, r.timestamp ?? null, r.locationName ?? null, r.lat ?? null, r.lng ?? null, r.mode ?? null, r.tripId ?? null
      );
    }
  });
  const after = await countRecords();
  const imported = after - before;
  return { imported, skipped: list.length - imported + skippedInvalid };
}
