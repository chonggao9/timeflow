// @ts-check
// 数据存储层：trips + records + focus_sessions + sync_meta。
// 存储边界说明：
// 1. Expo SQLite 仅限 App 进程使用，桌面小组件进程唯一数据通道为 AsyncStorage/SharedPreferences 快照。
// 2. 业务数据必须走已封装的 store 函数，禁止在业务与 UI 组件层拼接执行裸 SQL。
// 3. 任何修改业务表的写操作（插入/更新/删除/结程）必须调用 bumpRevision() 推进指纹，确保备份感知。
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
          note TEXT,
          partial INTEGER DEFAULT 0
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
      try {
        await db.execAsync('ALTER TABLE focus_sessions ADD COLUMN partial INTEGER DEFAULT 0;');
      } catch (e) {
        // 列已存在时静默跳过
      }
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

/**
 * @returns {Promise<import('../types').Trip[]>}
 */
export async function getTrips() {
  const db = await getDb();
  const rows = await db.getAllAsync('SELECT id, start_ts AS startTs, end_ts AS endTs, name, is_active AS isActive, created_at AS createdAt FROM trips ORDER BY start_ts ASC');
  return rows.map(r => ({ ...r, isActive: !!r.isActive }));
}

export async function getTripById(id) {
  if (!id) return null;
  const db = await getDb();
  const row = await db.getFirstAsync(
    'SELECT id, start_ts AS startTs, end_ts AS endTs, name, is_active AS isActive, created_at AS createdAt FROM trips WHERE id = ?',
    id
  );
  if (!row) return null;
  return { ...row, isActive: !!row.isActive };
}

export async function updateTripName(id, name) {
  if (!id) return;
  const db = await getDb();
  const val = name ? name.trim() : null;
  await db.runAsync('UPDATE trips SET name = ? WHERE id = ?', val, id);
  await bumpRevision();
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
  const db = await getDb();
  const lastRecord = await db.getFirstAsync(
    'SELECT timestamp FROM records WHERE trip_id = ? ORDER BY timestamp DESC LIMIT 1',
    trip.id
  );
  const lastActiveTs = lastRecord?.timestamp || trip.startTs || 0;
  const now = Date.now();
  if (now - lastActiveTs > TRIP_TIMEOUT_MS || dayStart(now) !== dayStart(lastActiveTs)) {
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
  try {
    await db.runAsync(
      'INSERT INTO trips (id, start_ts, end_ts, name, is_active, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      id, now, null, null, 1, now
    );
    return id;
  } catch (e) {
    // 捕获并发打卡时可能触发的 idx_trips_one_active 唯一约束冲突，重新读取胜出的 active trip
    const activeId = await getCurrentTripId();
    if (activeId) return activeId;
    throw e;
  }
}

export async function endTrip() {
  const db = await getDb();
  const active = await db.getFirstAsync('SELECT id FROM trips WHERE is_active = 1 LIMIT 1');
  if (!active) return;
  // end_ts 设为该行程最后一条记录时间戳
  const lastRecord = await db.getFirstAsync('SELECT timestamp FROM records WHERE trip_id = ? ORDER BY timestamp DESC LIMIT 1', active.id);
  const endTs = lastRecord ? lastRecord.timestamp : Date.now();
  await db.runAsync('UPDATE trips SET is_active = 0, end_ts = ? WHERE id = ?', endTs, active.id);
  await bumpRevision();
}

export async function setCurrentTripId(id) {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync('UPDATE trips SET is_active = 0');
    if (id) {
      await db.runAsync('UPDATE trips SET is_active = 1 WHERE id = ?', id);
    }
  });
  await bumpRevision();
}

// 根据 timestamp 查找所属 trip（用于补记/导入）。
// 策略：找同一天内时间相近（<= TRIP_TIMEOUT_MS）的现有 trip 进行聚合并扩展边界；否则新建已完结 trip。
async function findOrCreateTripForTimestamp(ts, db) {
  const targetDay = dayStart(ts);
  const nextDay = targetDay + 86400000;
  // 查找同一天的现有 trips
  const sameDayTrips = await db.getAllAsync(
    'SELECT id, start_ts, end_ts, is_active FROM trips WHERE start_ts >= ? AND start_ts < ?',
    targetDay, nextDay
  );

  if (sameDayTrips && sameDayTrips.length) {
    // 1. 优先找时间落在 start_ts 和 end_ts 之间的现有 trip
    const containing = sameDayTrips.find(t => ts >= t.start_ts && (t.end_ts === null || ts <= t.end_ts));
    if (containing) return containing.id;

    // 2. 找与该点距离最近且 <= TRIP_TIMEOUT_MS 的同天 trip
    let bestTrip = null;
    let minDiff = Infinity;
    for (const t of sameDayTrips) {
      const start = t.start_ts;
      const end = t.end_ts !== null ? t.end_ts : t.start_ts;
      let diff = 0;
      if (ts < start) {
        diff = start - ts;
      } else if (ts > end) {
        diff = ts - end;
      }
      if (diff <= TRIP_TIMEOUT_MS && diff < minDiff) {
        minDiff = diff;
        bestTrip = t;
      }
    }

    if (bestTrip) {
      // 扩展该 trip 的起止边界（若需要）
      if (ts < bestTrip.start_ts) {
        await db.runAsync('UPDATE trips SET start_ts = ? WHERE id = ?', ts, bestTrip.id);
      } else if (bestTrip.end_ts !== null && ts > bestTrip.end_ts && bestTrip.is_active === 0) {
        await db.runAsync('UPDATE trips SET end_ts = ? WHERE id = ?', ts, bestTrip.id);
      }
      return bestTrip.id;
    }
  }

  // 没有同一天在超时范围内的行程，新建非活跃行程
  const id = makeTripId();
  await db.runAsync(
    'INSERT INTO trips (id, start_ts, end_ts, name, is_active, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    id, ts, ts, null, 0, ts
  );
  return id;
}

// ---------------- records (travel) ----------------

const RECORD_COLS = 'id, timestamp, location_name AS locationName, lat, lng, mode, trip_id AS tripId';

/**
 * @returns {Promise<import('../types').TravelRecord[]>}
 */
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

/**
 * @param {import('../types').TravelRecord} record
 * @returns {Promise<void>}
 */
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
  await syncWidgetSnapshot().catch(() => {});
}

export async function updateRecord(id, patch) {
  const db = await getDb();
  const colMap = { locationName: 'location_name', lat: 'lat', lng: 'lng', mode: 'mode', tripId: 'trip_id' };
  const validKeys = Object.keys(patch || {}).filter(k => k in colMap);
  if (!validKeys.length) return;
  const sets = validKeys.map(k => `${colMap[k]} = ?`).join(', ');
  const values = validKeys.map(k => patch[k] ?? null);
  await db.runAsync(`UPDATE records SET ${sets} WHERE id = ?`, ...values, id);
  await bumpRevision();
  await syncWidgetSnapshot().catch(() => {});
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
  await syncWidgetSnapshot().catch(() => {});
}

export async function countRecords() {
  const db = await getDb();
  const row = await db.getFirstAsync('SELECT COUNT(*) AS c FROM records');
  return row ? row.c : 0;
}

export async function getRecentRecordsForWidget(days = 60, now = Date.now()) {
  const db = await getDb();
  const start = dayStart(now) - days * 86400000;
  return db.getAllAsync('SELECT timestamp FROM records WHERE timestamp >= ? ORDER BY timestamp ASC', start);
}

// ---------------- focus_sessions ----------------

const FOCUS_COLS = 'id, timestamp, goal_name AS goalName, duration, category, note, COALESCE(partial, 0) AS partial';

/**
 * @returns {Promise<import('../types').FocusSession[]>}
 */
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

export const WIDGET_FOCUS_WEEK_KEY = 'timeflow_widget_focus_week';
export const WIDGET_SNAPSHOT_KEY = 'timeflow_widget_snapshot_v1';

// 方案 B：小组件只读快照同步器（版本化派生数据，App 写入时落盘，组件只读快照，绝不直接碰 SQLite）
export async function syncWidgetSnapshot(now = Date.now()) {
  try {
    const db = await getDb();
    const today0 = dayStart(now);
    const todayEnd = today0 + 86400000;
    const sixtyDaysAgo = today0 - 60 * 86400000;
    const sixDaysAgo = today0 - 6 * 86400000;

    // 1. 查询今日行程打卡
    const todayRecords = await db.getAllAsync(
      `SELECT ${RECORD_COLS} FROM records WHERE timestamp >= ? AND timestamp < ? ORDER BY timestamp ASC`,
      today0,
      todayEnd
    );

    // 2. 查询近 60 天时间戳（用于连续天数、周状态与热力图）
    const recentRows = await db.getAllAsync(
      'SELECT timestamp FROM records WHERE timestamp >= ? ORDER BY timestamp ASC',
      sixtyDaysAgo
    );

    // 3. 查询过去 7 天专注时长（用于柱状图与今日已完成专注时长）
    const focusRows = await db.getAllAsync(
      'SELECT timestamp, duration FROM focus_sessions WHERE timestamp >= ? ORDER BY timestamp ASC',
      sixDaysAgo
    );
    const focusMinutes = Array(7).fill(0);
    for (const r of focusRows || []) {
      if (!r || !r.timestamp) continue;
      const diff = r.timestamp - sixDaysAgo;
      if (diff >= 0 && diff < 7 * 86400000) {
        const slot = Math.floor(diff / 86400000);
        if (slot >= 0 && slot < 7) {
          focusMinutes[slot] += Math.round((Number(r.duration) || 0) / 60);
        }
      }
    }

    const snapshot = {
      v: 1,
      updatedAt: now,
      travel: {
        todayRecords: todayRecords || [],
        recentTimestamps: (recentRows || []).map((r) => r.timestamp).filter(Boolean),
        count: (todayRecords || []).length,
      },
      focus: {
        todayCompletedMinutes: focusMinutes[6] || 0,
        past6DaysMinutes: focusMinutes.slice(0, 6),
      },
    };

    await AsyncStorage.setItem(WIDGET_SNAPSHOT_KEY, JSON.stringify(snapshot));
    // 兼容原有的 WIDGET_FOCUS_WEEK_KEY
    await AsyncStorage.setItem(
      WIDGET_FOCUS_WEEK_KEY,
      JSON.stringify({ date: today0, values: focusMinutes })
    );

    return snapshot;
  } catch (e) {
    return null;
  }
}

// 兼容别名
export const syncWidgetFocusStats = syncWidgetSnapshot;

/**
 * @param {import('../types').FocusSession & { locationName?: string | null }} record
 * @returns {Promise<void>}
 */
export async function saveFocusSession(record) {
  const db = await getDb();
  await db.runAsync(
    'INSERT INTO focus_sessions (id, timestamp, goal_name, duration, category, note, partial) VALUES (?, ?, ?, ?, ?, ?, ?)',
    record.id, record.timestamp, record.goalName ?? record.locationName ?? null, record.duration ?? 0, record.category ?? null, record.note ?? null, record.partial ? 1 : 0
  );
  await bumpRevision();
  await syncWidgetSnapshot(Date.now()).catch(() => {});
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
  await syncWidgetSnapshot().catch(() => {});
}

export async function deleteFocusSession(id) {
  const db = await getDb();
  await db.runAsync('DELETE FROM focus_sessions WHERE id = ?', id);
  await bumpRevision();
  await syncWidgetSnapshot().catch(() => {});
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
  await syncWidgetSnapshot().catch(() => {});
  try {
    const { refreshAllWidgets } = require('../utils/widgetRefresh');
    refreshAllWidgets?.();
  } catch (e) {}
}

// 共享插入逻辑（须在事务内调用）：replaceAllData 与 importRecords 复用，
// 列清单与 camel/snake 兜底只维护这一份，避免两处漂移导致恢复丢字段。
async function insertPayloadRows(db, payload) {
  const { trips = [], records = [], focusSessions = [] } = payload || {};

  // 检查当前库中是否已有 active trip
  const activeRow = await db.getFirstAsync('SELECT id FROM trips WHERE is_active = 1 LIMIT 1');
  let hasActiveTrip = !!activeRow;

  // 预先建立属于各个 trip 的记录最大时间戳映射，用于归档未结束行程时兜底 end_ts
  const tripMaxTs = new Map();
  for (const r of records) {
    const tid = r.tripId || r.trip_id;
    if (tid && r.timestamp) {
      const prev = tripMaxTs.get(tid) || 0;
      if (r.timestamp > prev) tripMaxTs.set(tid, r.timestamp);
    }
  }

  for (const trip of trips) {
    const startTs = trip.startTs || trip.start_ts || 0;
    let endTs = trip.endTs || trip.end_ts || null;
    let isActive = trip.isActive ?? trip.is_active ?? false;
    isActive = (isActive === 1 || isActive === true);

    // 若当前已存在活跃行程，导入的进行中行程须降级为已结束，避免 idx_trips_one_active 冲突
    if (isActive) {
      if (hasActiveTrip) {
        if (!activeRow || activeRow.id !== trip.id) {
          isActive = false;
          if (!endTs) {
            endTs = tripMaxTs.get(trip.id) || startTs || Date.now();
          }
        }
      } else {
        hasActiveTrip = true;
      }
    }

    await db.runAsync(
      'INSERT OR IGNORE INTO trips (id, start_ts, end_ts, name, is_active, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      trip.id, startTs, endTs, trip.name || null, isActive ? 1 : 0, trip.createdAt || trip.created_at || Date.now()
    );
  }

  // 收集当前库中已存在的所有合法 trip id，避免孤立 record 触发外键异常
  const existingTrips = await db.getAllAsync('SELECT id FROM trips');
  const validTripIds = new Set((existingTrips || []).map((t) => t.id));

  for (const r of records) {
    let tripId = r.tripId || r.trip_id;
    if (!tripId || !validTripIds.has(tripId)) {
      tripId = await findOrCreateTripForTimestamp(r.timestamp, db);
      validTripIds.add(tripId);
    }
    await db.runAsync(
      'INSERT OR IGNORE INTO records (id, timestamp, location_name, lat, lng, mode, trip_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
      r.id, r.timestamp, r.locationName ?? r.location_name ?? null, r.lat ?? null, r.lng ?? null, r.mode ?? 'walk', tripId
    );
  }
  for (const f of focusSessions) {
    await db.runAsync(
      'INSERT OR IGNORE INTO focus_sessions (id, timestamp, goal_name, duration, category, note, partial) VALUES (?, ?, ?, ?, ?, ?, ?)',
      f.id, f.timestamp, f.goalName ?? f.goal_name ?? f.locationName ?? null, f.duration ?? 0, f.category ?? null, f.note ?? null, f.partial ? 1 : 0
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
  await syncWidgetSnapshot().catch(() => {});
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
  await syncWidgetFocusStats().catch(() => {});
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
  if (imported > 0) {
    await bumpRevision();
    await syncWidgetSnapshot().catch(() => {});
  }
  return { imported, skipped: list.length - imported + skippedInvalid };
}
