import AsyncStorage from '@react-native-async-storage/async-storage';

const RECORDS_KEY = 'timeflow_records';
const TRIP_KEY = 'timeflow_current_trip';
const MODE_KEY = 'timeflow_mode';

// 旧数据无 tripId，统一归为该值（一条历史行程）
export const LEGACY_TRIP = 'legacy';

const makeTripId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

// 当前进行中的行程 ID（无则返回 null）
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

// 保存一条打卡记录
export async function saveRecord(record) {
  const records = await getRecords();
  records.push(record);
  await AsyncStorage.setItem(RECORDS_KEY, JSON.stringify(records));
}

// 获取所有打卡记录
export async function getRecords() {
  const raw = await AsyncStorage.getItem(RECORDS_KEY);
  return raw ? JSON.parse(raw) : [];
}

// 获取今日记录
export async function getTodayRecords() {
  const records = await getRecords();
  const today = new Date().toDateString();
  return records.filter(r => new Date(r.timestamp).toDateString() === today);
}

// 更新一条记录（如改地名）
export async function updateRecord(id, patch) {
  const records = await getRecords();
  const idx = records.findIndex(r => r.id === id);
  if (idx < 0) return;
  records[idx] = { ...records[idx], ...patch };
  await AsyncStorage.setItem(RECORDS_KEY, JSON.stringify(records));
}

// 删除一条记录
export async function deleteRecord(id) {
  const records = await getRecords();
  const updated = records.filter(r => r.id !== id);
  await AsyncStorage.setItem(RECORDS_KEY, JSON.stringify(updated));
}

// 清空所有数据
export async function clearAll() {
  await AsyncStorage.multiRemove([RECORDS_KEY, TRIP_KEY]);
}
