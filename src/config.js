import AsyncStorage from '@react-native-async-storage/async-storage';

// 高德地图 Web服务 Key：由用户在「我的 → 位置服务」自行配置，仅存储于本地，不上传。
// 未配置时返回空字符串，地名反查回退系统能力。
const AMAP_KEY_STORAGE = 'timeflow_amap_key';

export async function getAmapKey() {
  try { return (await AsyncStorage.getItem(AMAP_KEY_STORAGE)) || ''; } catch (e) { return ''; }
}

// 保存高德 Key；传空字符串表示清除。成功返回 true，存储失败返回 false
export async function setAmapKey(key) {
  const k = String(key || '').trim();
  try {
    if (k) await AsyncStorage.setItem(AMAP_KEY_STORAGE, k);
    else await AsyncStorage.removeItem(AMAP_KEY_STORAGE);
    return true;
  } catch (e) {
    return false;
  }
}

// 高德「定位」Key（Android 平台 SDK key）：App 内置默认值，可在「我的 → 位置服务」覆盖或清空禁用。
// 未设置(null) → 用默认；显式清空('') → 禁用高德定位，回退系统定位。
const AMAP_LOC_KEY_STORAGE = 'timeflow_amap_loc_key';
const AMAP_LOC_KEY_DEFAULT = 'a8d615eeac26ff100615d2168fa631ff';

export async function getAmapLocKey() {
  try {
    const v = await AsyncStorage.getItem(AMAP_LOC_KEY_STORAGE);
    if (v === null) return AMAP_LOC_KEY_DEFAULT;
    return v;
  } catch (e) { return AMAP_LOC_KEY_DEFAULT; }
}

// 传空字符串表示禁用（写入空串，与"未设置用默认"区分）
export async function setAmapLocKey(key) {
  const k = String(key || '').trim();
  try {
    if (k) await AsyncStorage.setItem(AMAP_LOC_KEY_STORAGE, k);
    else await AsyncStorage.setItem(AMAP_LOC_KEY_STORAGE, '');
    return true;
  } catch (e) {
    return false;
  }
}

// 原始值：null=未设置(用默认)，''=已禁用，其他=自定义 key
export async function getAmapLocKeyRaw() {
  try { return await AsyncStorage.getItem(AMAP_LOC_KEY_STORAGE); } catch (e) { return null; }
}
