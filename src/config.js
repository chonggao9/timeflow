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
