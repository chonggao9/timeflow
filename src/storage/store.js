// 打卡记录存储：expo-sqlite。历史数据可查询/聚合/事务原子写。
// 对外 API 表面与旧 AsyncStorage 实现完全一致，调用方无需改动。
// 偏好/会话键（trip/mode）仍留 AsyncStorage。
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SQLite from 'expo-sqlite';

const RECORDS_KEY = 'timeflow_records';
const TRIP_KEY = 'timeflow_current_trip';
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
  try { return await AsyncStorage.getItem(TRIP_KEY) || null; } catch (e) { return null; }
}

// 获取当前行程，没有则新建一个
export async function ensureTrip() {
  let id = await getCurrentTripId();
  if (!id) {
    id = makeTripId();
    await AsyncStorage.setItem(TRIP_KEY, id);
  }
  return id;
}

// 结束当前行程：清空标识，下次打卡自动新建行程
export async function endTrip() {
  await AsyncStorage.removeItem(TRIP_KEY);
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
  return db.getAllAsync(
    `SELECT ${COLS} FROM records WHERE timestamp >= ? AND timestamp < ? ORDER BY timestamp ASC`,
    start, start + 86400000
  );
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

// 清空所有打卡数据
export async function clearAll() {
  const db = await getDb();
  await db.runAsync('DELETE FROM records');
  await AsyncStorage.removeItem(TRIP_KEY);
}
