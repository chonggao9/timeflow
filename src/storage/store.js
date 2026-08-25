import AsyncStorage from '@react-native-async-storage/async-storage';

const RECORDS_KEY = 'timeflow_records';

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

// 删除一条记录
export async function deleteRecord(id) {
  const records = await getRecords();
  const updated = records.filter(r => r.id !== id);
  await AsyncStorage.setItem(RECORDS_KEY, JSON.stringify(updated));
}

// 清空所有数据（调试用）
export async function clearAll() {
  await AsyncStorage.removeItem(RECORDS_KEY);
}
