// 数据存储层：trips + records + focus_sessions + sync_meta。
// AsyncStorage 仅保留纯本地偏好配置；业务数据全部进 SQLite。
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SQLite from 'expo-sqlite';

const RECORDS_KEY = 'timeflow_records';
const RECORDS_REV_KEY = 'timeflow_data_rev';
const MODE_KEY = 'timeflow_mode';

const DB_NAME = 'timeflow.db';
const DB_VERSION = 2;

// 内存修订版本号缓存：与 AsyncStorage 双写，保证每次修改产生不同指纹
let currentRev = null;
async function getRevision() {
  if (currentRev === null) {
    try {
      const v = await AsyncStorage.getItem(RECORDS_REV_KEY);
      currentRev = v ? Number(v) : 0;
    } catch (e) {
      currentRev = 0;
    }
  }
  return currentRev;
}

async function bumpRevision() {
  const next = (await getRevision()) + 1;
  currentRev = next;
  try {
    await AsyncStorage.setItem(RECORDS_REV_KEY, String(next));
  } catch (e) {}
  return next;
}

// 旧数据无 tripId，统一归为该值（一条历史行程）
export const LEGACY_TRIP = 'legacy';
export const TRIP_TIMEOUT_MS = 90 * 60 * 1000; // 90分钟无打卡自动断开行程

const makeTripId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
const makeId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

// 本地当日零点（epoch ms）；China 无 DST，86400000 即一天
function dayStart(ts) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

// SQLite 单例：打开 + 建表 + 一次性迁移。所有读写先 await 它。
let dbPromise = null;
function getDb() {
  if (!dbPromise) {
    dbPromise = (async () => {
      const db = await SQLite.openDatabaseAsync(DB_NAME);
      // WAL 与 foreign keys 必须在事务外执行
      await db.execAsync('PRAGMA journal_mode = WAL;');
      await db.execAsync('PRAGMA foreign_keys = ON;');
      const versionRow = await db.getFirstAsync('PRAGMA user_version');
      const version = versionRow?.user_version || 0;
      if (version < DB_VERSION) {
        await migrateV1ToV2(db);
      }
      // 建表（幂等）
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS trips (
          id TEXT PRIMARY KEY,
          start_ts INTEGER NOT NULL,
          end_ts INTEGER,
          name TEXT,
          is_active INTEGER NOT NULL DEFAULT 0,
          created_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_trips_start ON trips(start_ts);
        CREATE UNIQUE INDEX IF NOT EXISTS idx_trips_one_active ON trips(is_active) WHERE is_active = 1;

        CREATE TABLE IF NOT EXISTS records (
          id TEXT PRIMARY KEY,
          timestamp INTEGER NOT NULL,
          location_name TEXT,
          lat REAL,
          lng REAL,
          mode TEXT NOT NULL,
          trip_id TEXT NOT NULL,
          FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_records_ts ON records(timestamp);
        CREATE INDEX IF NOT EXISTS idx_records_trip ON records(trip_id);

        CREATE TABLE IF NOT EXISTS focus_sessions (
          id TEXT PRIMARY KEY,
          timestamp INTEGER NOT NULL,
          goal_name TEXT,
          duration INTEGER NOT NULL,
          category TEXT,
          note TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_focus_ts ON focus_sessions(timestamp);
        CREATE INDEX IF NOT EXISTS idx_focus_cat ON focus_sessions(category);

        CREATE TABLE IF NOT EXISTS sync_meta (
          user_id TEXT PRIMARY KEY,
          device_id TEXT NOT NULL,
          last_sync_at INTEGER,
          sync_token TEXT,
          schema_version INTEGER NOT NULL DEFAULT 2
        );
      `);
      await initSyncMeta(db);
      return db;
    })();
    dbPromise.catch(() => { dbPromise = null; });
  }
  return dbPromise;
}

// 初始化 sync_meta：仅当不存在 'local' 行时插入 device_id。
async function initSyncMeta(db) {
  const existing = await db.getFirstAsync('SELECT user_id FROM sync_meta WHERE user_id = ?', 'local');
  if (!existing) {
    const deviceId = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    await db.runAsync(
      'INSERT OR IGNORE INTO sync_meta (user_id, device_id, schema_version) VALUES (?, ?, ?)',
      'local', deviceId, DB_VERSION
    );
  }
}

// 从旧表/旧 AsyncStorage 一次性迁移到 v2 结构
async function migrateV1ToV2(db) {
  // 1. 收集旧记录：优先从 legacy 表读取，否则从旧 records 表
  let legacyRecords = [];
  const hasLegacyTable = await db.getFirstAsync(
    "SELECT 1 FROM sqlite_master WHERE type='table' AND name='records_legacy'"
  );
  if (hasLegacyTable) {
    legacyRecords = await db.getAllAsync('SELECT * FROM records_legacy ORDER BY timestamp ASC');
  } else {
    const hasOldTable = await db.getFirstAsync(
      "SELECT 1 FROM sqlite_master WHERE type='table' AND name='records'"
    );
    if (hasOldTable) {
      // 先把旧 records 表重命名到 legacy，避免新 schema 创建后冲突
      await db.execAsync('DROP INDEX IF EXISTS idx_records_ts;');
      await db.execAsync('DROP INDEX IF EXISTS idx_records_trip;');
      await db.execAsync('ALTER TABLE records RENAME TO records_legacy;');
      legacyRecords = await db.getAllAsync('SELECT * FROM records_legacy ORDER BY timestamp ASC');
    }
  }

  // 2. 创建新表（包含 trips/records/focus_sessions/sync_meta）
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS trips (
      id TEXT PRIMARY KEY,
      start_ts INTEGER NOT NULL,
      end_ts INTEGER,
      name TEXT,
      is_active INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_trips_start ON trips(start_ts);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_trips_one_active ON trips(is_active) WHERE is_active = 1;

    CREATE TABLE IF NOT EXISTS records (
      id TEXT PRIMARY KEY,
      timestamp INTEGER NOT NULL,
      location_name TEXT,
      lat REAL,
      lng REAL,
      mode TEXT NOT NULL,
      trip_id TEXT NOT NULL,
      FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_records_ts ON records(timestamp);
    CREATE INDEX IF NOT EXISTS idx_records_trip ON records(trip_id);

    CREATE TABLE IF NOT EXISTS focus_sessions (
      id TEXT PRIMARY KEY,
      timestamp INTEGER NOT NULL,
      goal_name TEXT,
      duration INTEGER NOT NULL,
      category TEXT,
      note TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_focus_ts ON focus_sessions(timestamp);
    CREATE INDEX IF NOT EXISTS idx_focus_cat ON focus_sessions(category);

    CREATE TABLE IF NOT EXISTS sync_meta (
      user_id TEXT PRIMARY KEY,
      device_id TEXT NOT NULL,
      last_sync_at INTEGER,
      sync_token TEXT,
      schema_version INTEGER NOT NULL DEFAULT 2
    );
  `);

  await initSyncMeta(db);

  if (!legacyRecords.length) {
    await db.execAsync(`PRAGMA user_version = ${DB_VERSION};`);
    return;
  }

  // 3. 拆分记录
  const focusSessions = [];
  const travelRecords = [];
  for (const r of legacyRecords) {
    if (r.mode === 'focus') {
      focusSessions.push(r);
    } else {
      travelRecords.push(r);
    }
  }

  // 4. 聚合 trips
  const now = Date.now();
  const tripsMap = new Map();
  const tripGroups = {};
  for (const r of travelRecords) {
    const tripId = r.trip_id || r.tripId;
    if (tripId) {
      if (!tripGroups[tripId]) tripGroups[tripId] = [];
      tripGroups[tripId].push(r);
    }
  }

  // 无 tripId 的 orphan 记录按同一自然日 + 相邻间隔 ≤ 90 分钟聚合
  const orphanRecords = travelRecords.filter(r => !(r.trip_id || r.tripId));
  orphanRecords.sort((a, b) => a.timestamp - b.timestamp);
  const orphanGroups = [];
  let currentGroup = null;
  for (const r of orphanRecords) {
    if (!currentGroup || r.timestamp - currentGroup.last.timestamp > TRIP_TIMEOUT_MS || dayStart(r.timestamp) !== dayStart(currentGroup.last.timestamp)) {
      currentGroup = { id: makeTripId(), first: r, last: r, records: [r] };
      orphanGroups.push(currentGroup);
    } else {
      currentGroup.records.push(r);
      currentGroup.last = r;
    }
  }


  // 有 tripId 的分组
  for (const [tid, recs] of Object.entries(tripGroups)) {
    recs.sort((a, b) => a.timestamp - b.timestamp);
    const start = recs[0].timestamp;
    const end = recs[recs.length - 1].timestamp;
    tripsMap.set(tid, { id: tid, start, end, records: recs });
  }
  for (const g of orphanGroups) {
    tripsMap.set(g.id, { id: g.id, start: g.first.timestamp, end: g.last.timestamp, records: g.records });
  }

  // 确定 active trip：最近一条记录所在 trip，且未超时/未跨日
  const allTravelSorted = [...travelRecords].sort((a, b) => a.timestamp - b.timestamp);
  let activeTripId = null;
  if (allTravelSorted.length) {
    const last = allTravelSorted[allTravelSorted.length - 1];
    const lastTripId = last.trip_id || last.tripId;
    if (lastTripId && tripsMap.has(lastTripId)) {
      const lastTs = last.timestamp;
      if (now - lastTs <= TRIP_TIMEOUT_MS && dayStart(now) === dayStart(lastTs)) {
        activeTripId = lastTripId;
      }
    } else {
      // 在 orphan 分组中找最后一条
      for (let i = orphanGroups.length - 1; i >= 0; i--) {
        const g = orphanGroups[i];
        if (now - g.last.timestamp <= TRIP_TIMEOUT_MS && dayStart(now) === dayStart(g.last.timestamp)) {
          activeTripId = g.id;
          break;
        }
      }
    }
  }

  // 5. 写入新表（整体事务）
  await db.withTransactionAsync(async () => {
    for (const trip of tripsMap.values()) {
      const isActive = trip.id === activeTripId ? 1 : 0;
      await db.runAsync(
        'INSERT OR IGNORE INTO trips (id, start_ts, end_ts, name, is_active, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        trip.id, trip.start, trip.end, null, isActive, trip.start
      );
    }

    for (const r of travelRecords) {
      const tripId = r.trip_id || r.tripId;
      let finalTripId = tripId;
      if (!finalTripId || !tripsMap.has(finalTripId)) {
        // 找一个时间覆盖的 orphan trip
        const group = orphanGroups.find(g => g.records.includes(r));
        finalTripId = group ? group.id : makeTripId();
        if (!tripsMap.has(finalTripId)) {
          await db.runAsync(
            'INSERT OR IGNORE INTO trips (id, start_ts, end_ts, name, is_active, created_at) VALUES (?, ?, ?, ?, ?, ?)',
            finalTripId, r.timestamp, r.timestamp, null, 0, r.timestamp
          );
          tripsMap.set(finalTripId, { id: finalTripId });
        }
      }
      await db.runAsync(
        'INSERT OR IGNORE INTO records (id, timestamp, location_name, lat, lng, mode, trip_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
        r.id, r.timestamp, r.location_name ?? r.locationName ?? null, r.lat ?? null, r.lng ?? null, r.mode ?? 'walk', finalTripId
      );
    }

    for (const r of focusSessions) {
      // 旧表把专注任务名存在 location_name 列（旧代码写入的是 locationName），
      // 这里同时兼容 snake_case / camelCase，否则迁移后任务名全部丢失。
      const goalName = r.goal_name ?? r.goalName ?? r.location_name ?? r.locationName ?? null;
      await db.runAsync(
        'INSERT OR IGNORE INTO focus_sessions (id, timestamp, goal_name, duration, category, note) VALUES (?, ?, ?, ?, ?, ?)',
        r.id, r.timestamp, goalName, r.duration ?? 0, r.category ?? null, r.note ?? null
      );
    }
  });

  // 6. 清理 legacy 表并标记版本
  await db.execAsync('DROP TABLE IF EXISTS records_legacy;');
  await db.execAsync(`PRAGMA user_version = ${DB_VERSION};`);
  await bumpRevision();
}

// 记住/读取上次出行方式
export async function getLastMode() {
  try { return await AsyncStorage.getItem(MODE_KEY) || 'walk'; } catch (e) { return 'walk'; }
}
export async function setLastMode(mode) {
  try { await AsyncStorage.setItem(MODE_KEY, mode); } catch (e) {}
}

// ---------------- trips ----------------

export async function getTrips() {
  const db = await getDb();
  const rows = await db.getAllAsync('SELECT id, start_ts AS startTs, end_ts AS endTs, name, is_active AS isActive, created_at AS createdAt FROM trips ORDER BY start_ts ASC');
  return rows.map(r => ({ ...r, isActive: !!r.isActive }));
}

export async function getActiveTrip() {
  const db = await getDb();
  const row = await db.getFirstAsync('SELECT id, start_ts AS startTs, end_ts AS endTs, name, is_active AS isActive, created_at AS createdAt FROM trips WHERE is_active = 1 LIMIT 1');
  if (!row) return null;
  return { ...row, isActive: !!row.isActive };
}

export async function getCurrentTripId() {
  const trip = await getActiveTrip();
  if (!trip) return null;
  const now = Date.now();
  if (now - (trip.startTs || 0) > TRIP_TIMEOUT_MS || dayStart(now) !== dayStart(trip.startTs || 0)) {
    await endTrip();
    return null;
  }
  return trip.id;
}

export async function ensureTrip() {
  const db = await getDb();
  let id = await getCurrentTripId();
  if (id) return id;
  id = makeTripId();
  const now = Date.now();
  await db.runAsync(
    'INSERT INTO trips (id, start_ts, end_ts, name, is_active, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    id, now, null, null, 1, now
  );
  return id;
}

export async function endTrip() {
  const db = await getDb();
  const active = await db.getFirstAsync('SELECT id FROM trips WHERE is_active = 1 LIMIT 1');
  if (!active) return;
  // end_ts 设为该行程最后一条记录时间戳
  const lastRecord = await db.getFirstAsync('SELECT timestamp FROM records WHERE trip_id = ? ORDER BY timestamp DESC LIMIT 1', active.id);
  const endTs = lastRecord ? lastRecord.timestamp : Date.now();
  await db.runAsync('UPDATE trips SET is_active = 0, end_ts = ? WHERE id = ?', endTs, active.id);
}

export async function setCurrentTripId(id) {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync('UPDATE trips SET is_active = 0');
    if (id) {
      await db.runAsync('UPDATE trips SET is_active = 1 WHERE id = ?', id);
    }
  });
}

// 根据 timestamp 查找所属 trip（用于补记/导入）。
// 策略：找时间覆盖且未跨日/未超时的 trip；否则按相近时间创建/聚合。
async function findOrCreateTripForTimestamp(ts, db) {
  const now = Date.now();
  // 找同一天的现有 trip
  const trips = await db.getAllAsync('SELECT id, start_ts, end_ts, is_active FROM trips WHERE start_ts <= ? AND (end_ts IS NULL OR end_ts >= ?)', ts, ts);
  if (trips.length) {
    const candidates = trips
      .filter(t => now - (t.end_ts || t.start_ts) <= TRIP_TIMEOUT_MS && dayStart(now) === dayStart(t.start_ts))
      .sort((a, b) => (b.end_ts || b.start_ts) - (a.end_ts || a.start_ts));
    if (candidates.length) return candidates[0].id;
  }
  // 新建 trip
  const id = makeTripId();
  await db.runAsync(
    'INSERT INTO trips (id, start_ts, end_ts, name, is_active, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    id, ts, ts, null, 0, ts
  );
  return id;
}

// ---------------- records (travel) ----------------

const RECORD_COLS = 'id, timestamp, location_name AS locationName, lat, lng, mode, trip_id AS tripId';

export async function getRecords() {
  const db = await getDb();
  return db.getAllAsync(`SELECT ${RECORD_COLS} FROM records ORDER BY timestamp ASC`);
}

export async function getTodayRecords() {
  const db = await getDb();
  const start = dayStart(Date.now());
  const end = start + 86400000;
  return db.getAllAsync(
    `SELECT ${RECORD_COLS} FROM records WHERE timestamp >= ? AND timestamp < ? ORDER BY timestamp ASC`,
    start, end
  );
}

export async function getRecordById(id) {
  if (!id) return null;
  const db = await getDb();
  return db.getFirstAsync(`SELECT ${RECORD_COLS} FROM records WHERE id = ?`, id);
}

export async function saveRecord(record) {
  const db = await getDb();
  let tripId = record.tripId;
  // 当前时间附近且未显式传 tripId 时，自动关联/创建当前行程
  const now = Date.now();
  const isRecent = record.timestamp && (now - record.timestamp <= TRIP_TIMEOUT_MS) && dayStart(now) === dayStart(record.timestamp);
  if (!tripId) {
    if (isRecent) {
      tripId = await ensureTrip();
    } else {
      tripId = await findOrCreateTripForTimestamp(record.timestamp, db);
    }
  }
  await db.runAsync(
    'INSERT INTO records (id, timestamp, location_name, lat, lng, mode, trip_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
    record.id, record.timestamp, record.locationName ?? null, record.lat ?? null, record.lng ?? null, record.mode ?? 'walk', tripId
  );
  await bumpRevision();
}

export async function updateRecord(id, patch) {
  const db = await getDb();
  const colMap = { locationName: 'location_name', lat: 'lat', lng: 'lng', mode: 'mode', tripId: 'trip_id' };
  const keys = Object.keys(patch);
  if (!keys.length) return;
  const sets = keys.map(k => `${colMap[k] || k} = ?`).join(', ');
  const values = keys.map(k => patch[k] ?? null);
  await db.runAsync(`UPDATE records SET ${sets} WHERE id = ?`, ...values, id);
  await bumpRevision();
}

export async function deleteRecord(id) {
  const db = await getDb();
  const record = await db.getFirstAsync('SELECT trip_id FROM records WHERE id = ?', id);
  await db.runAsync('DELETE FROM records WHERE id = ?', id);
  if (record) {
    // 如果 trip 下已无记录，删除空 trip
    const countRow = await db.getFirstAsync('SELECT COUNT(*) AS c FROM records WHERE trip_id = ?', record.trip_id);
    if (countRow && countRow.c === 0) {
      await db.runAsync('DELETE FROM trips WHERE id = ?', record.trip_id);
    }
  }
  await bumpRevision();
}

export async function countRecords() {
  const db = await getDb();
  const row = await db.getFirstAsync('SELECT COUNT(*) AS c FROM records');
  return row ? row.c : 0;
}

// ---------------- focus_sessions ----------------

const FOCUS_COLS = 'id, timestamp, goal_name AS goalName, duration, category, note';

export async function getFocusSessions() {
  const db = await getDb();
  return db.getAllAsync(`SELECT ${FOCUS_COLS} FROM focus_sessions ORDER BY timestamp ASC`);
}

export async function getTodayFocusSessions() {
  const db = await getDb();
  const start = dayStart(Date.now());
  const end = start + 86400000;
  return db.getAllAsync(
    `SELECT ${FOCUS_COLS} FROM focus_sessions WHERE timestamp >= ? AND timestamp < ? ORDER BY timestamp ASC`,
    start, end
  );
}

export async function getFocusSessionById(id) {
  if (!id) return null;
  const db = await getDb();
  return db.getFirstAsync(`SELECT ${FOCUS_COLS} FROM focus_sessions WHERE id = ?`, id);
}

export async function saveFocusSession(record) {
  const db = await getDb();
  await db.runAsync(
    'INSERT INTO focus_sessions (id, timestamp, goal_name, duration, category, note) VALUES (?, ?, ?, ?, ?, ?)',
    record.id, record.timestamp, record.goalName ?? record.locationName ?? null, record.duration ?? 0, record.category ?? null, record.note ?? null
  );
  await bumpRevision();
}

export async function updateFocusSession(id, patch) {
  const db = await getDb();
  const normalized = { ...patch };
  if ('locationName' in normalized) {
    normalized.goalName = normalized.locationName;
    delete normalized.locationName;
  }
  const colMap = { goalName: 'goal_name', duration: 'duration', category: 'category', note: 'note' };
  const keys = Object.keys(normalized).filter(k => colMap[k]);
  if (!keys.length) return;
  const sets = keys.map(k => `${colMap[k]} = ?`).join(', ');
  const values = keys.map(k => normalized[k] ?? null);
  await db.runAsync(`UPDATE focus_sessions SET ${sets} WHERE id = ?`, ...values, id);
  await bumpRevision();
}

export async function deleteFocusSession(id) {
  const db = await getDb();
  await db.runAsync('DELETE FROM focus_sessions WHERE id = ?', id);
  await bumpRevision();
}

export async function countFocusSessions() {
  const db = await getDb();
  const row = await db.getFirstAsync('SELECT COUNT(*) AS c FROM focus_sessions');
  return row ? row.c : 0;
}

// ---------------- sync_meta ----------------

export async function getSyncMeta() {
  const db = await getDb();
  const row = await db.getFirstAsync('SELECT user_id AS userId, device_id AS deviceId, last_sync_at AS lastSyncAt, sync_token AS syncToken, schema_version AS schemaVersion FROM sync_meta WHERE user_id = ?', 'local');
  if (!row) return null;
  return { ...row, schemaVersion: row.schemaVersion || DB_VERSION };
}

export async function setSyncMeta(patch) {
  const db = await getDb();
  const existing = await getSyncMeta();
  if (!existing) return;
  const updates = [];
  const values = [];
  if ('lastSyncAt' in patch) { updates.push('last_sync_at = ?'); values.push(patch.lastSyncAt); }
  if ('syncToken' in patch) { updates.push('sync_token = ?'); values.push(patch.syncToken); }
  if ('schemaVersion' in patch) { updates.push('schema_version = ?'); values.push(patch.schemaVersion); }
  if (!updates.length) return;
  await db.runAsync(`UPDATE sync_meta SET ${updates.join(', ')} WHERE user_id = 'local'`, ...values);
}

// ---------------- 兼容层 ----------------

export async function getUnifiedRecords() {
  const [records, focusSessions] = await Promise.all([getRecords(), getFocusSessions()]);
  const unified = [
    ...records.map(r => ({ ...r, duration: null, category: null, note: null })),
    ...focusSessions.map(f => ({
      id: f.id,
      timestamp: f.timestamp,
      locationName: f.goalName,
      lat: null,
      lng: null,
      mode: 'focus',
      tripId: null,
      duration: f.duration,
      category: f.category,
      note: f.note,
    })),
  ];
  return unified.sort((a, b) => a.timestamp - b.timestamp);
}

// ---------------- 全局工具 ----------------

export async function getRecordsFingerprint() {
  const db = await getDb();
  const [recordsRow, focusRow, tripsRow, rev] = await Promise.all([
    db.getFirstAsync('SELECT COUNT(*) AS count, COALESCE(MAX(timestamp), 0) AS maxTs FROM records'),
    db.getFirstAsync('SELECT COUNT(*) AS count, COALESCE(MAX(timestamp), 0) AS maxTs FROM focus_sessions'),
    db.getFirstAsync('SELECT COUNT(*) AS count, COALESCE(MAX(start_ts), 0) AS maxTs FROM trips'),
    getRevision(),
  ]);
  const totalCount = (recordsRow?.count || 0) + (focusRow?.count || 0);
  const maxTs = Math.max(recordsRow?.maxTs || 0, focusRow?.maxTs || 0, tripsRow?.maxTs || 0);
  return `${totalCount}:${maxTs}:${rev}`;
}

export async function clearAll() {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM trips');
    await db.runAsync('DELETE FROM records');
    await db.runAsync('DELETE FROM focus_sessions');
  });
  // 保留 sync_meta 中的 device_id，清空其余字段
  const meta = await getSyncMeta();
  if (meta) {
    await db.runAsync(
      'UPDATE sync_meta SET user_id = ?, last_sync_at = NULL, sync_token = NULL WHERE user_id = ?',
      'local', 'local'
    );
  }
  await AsyncStorage.multiRemove([RECORDS_KEY, RECORDS_REV_KEY]);
  await bumpRevision();
}

// 共享插入逻辑（须在事务内调用）：replaceAllData 与 importRecords 复用，
// 列清单与 camel/snake 兜底只维护这一份，避免两处漂移导致恢复丢字段。
async function insertPayloadRows(db, payload) {
  const { trips = [], records = [], focusSessions = [] } = payload || {};
  for (const trip of trips) {
    await db.runAsync(
      'INSERT OR IGNORE INTO trips (id, start_ts, end_ts, name, is_active, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      trip.id, trip.startTs || trip.start_ts || 0, trip.endTs || trip.end_ts || null, trip.name || null, trip.isActive ? 1 : 0, trip.createdAt || trip.created_at || Date.now()
    );
  }
  for (const r of records) {
    let tripId = r.tripId || r.trip_id;
    if (!tripId) {
      tripId = await findOrCreateTripForTimestamp(r.timestamp, db);
    }
    await db.runAsync(
      'INSERT OR IGNORE INTO records (id, timestamp, location_name, lat, lng, mode, trip_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
      r.id, r.timestamp, r.locationName ?? r.location_name ?? null, r.lat ?? null, r.lng ?? null, r.mode ?? 'walk', tripId
    );
  }
  for (const f of focusSessions) {
    await db.runAsync(
      'INSERT OR IGNORE INTO focus_sessions (id, timestamp, goal_name, duration, category, note) VALUES (?, ?, ?, ?, ?, ?)',
      f.id, f.timestamp, f.goalName ?? f.goal_name ?? f.locationName ?? null, f.duration ?? 0, f.category ?? null, f.note ?? null
    );
  }
}

// 原子替换全部业务数据（备份「回到这个时间点」恢复与撤销恢复用）：
// 清空 + 插入在同一事务内完成，中途失败时当前数据保持原样。
export async function replaceAllData(payload) {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM records');
    await db.runAsync('DELETE FROM focus_sessions');
    await db.runAsync('DELETE FROM trips');
    await insertPayloadRows(db, payload);
  });
  await AsyncStorage.removeItem(RECORDS_KEY);
  await bumpRevision();
}

export async function importRecords(payload) {
  // 兼容 v1 数组
  if (Array.isArray(payload)) {
    return importV1Records(payload);
  }
  const { trips = [], records = [], focusSessions = [] } = payload || {};
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await insertPayloadRows(db, payload);
  });
  await bumpRevision();
  const totalImported = (records?.length || 0) + (focusSessions?.length || 0) + (trips?.length || 0);
  return { imported: totalImported, skipped: 0 };
}

async function importV1Records(records) {
  const input = Array.isArray(records) ? records : [];
  const list = input.filter(r => r && typeof r.id === 'string' && r.id);
  const skippedInvalid = input.length - list.length;
  if (!list.length) return { imported: 0, skipped: skippedInvalid || input.length };

  const db = await getDb();
  const before = (await countRecords()) + (await countFocusSessions());
  await db.withTransactionAsync(async () => {
    for (const r of list) {
      if (r.mode === 'focus') {
        await db.runAsync(
          'INSERT OR IGNORE INTO focus_sessions (id, timestamp, goal_name, duration, category, note) VALUES (?, ?, ?, ?, ?, ?)',
          r.id, r.timestamp, r.goalName ?? r.locationName ?? null, r.duration ?? 0, r.category ?? null, r.note ?? null
        );
      } else {
        let tripId = r.tripId || r.trip_id;
        if (!tripId) {
          tripId = await findOrCreateTripForTimestamp(r.timestamp, db);
        }
        await db.runAsync(
          'INSERT OR IGNORE INTO records (id, timestamp, location_name, lat, lng, mode, trip_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
          r.id, r.timestamp, r.locationName ?? r.location_name ?? null, r.lat ?? null, r.lng ?? null, r.mode ?? 'walk', tripId
        );
      }
    }
  });
  const after = (await countRecords()) + (await countFocusSessions());
  const imported = after - before;
  if (imported > 0) await bumpRevision();
  return { imported, skipped: list.length - imported + skippedInvalid };
}
