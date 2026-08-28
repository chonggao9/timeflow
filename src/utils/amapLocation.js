// 高德定位封装：读 key → 初始化 → 一次性取坐标。
// 返回与 expo-location 同构的 { coords, timestamp } | null。
// 原生模块缺失（Expo Go / 未链接）或未配置/禁用 key 时返回 null，安全降级。
import AmapLocation from '../../modules/amap-location';
import { getAmapLocKey } from '../config';

export async function amapGetPosition(timeoutMs = 30000) {
  if (!AmapLocation) return null; // 原生模块不存在
  let timer;
  try {
    const key = await getAmapLocKey();
    if (!key) return null; // 已禁用
    await AmapLocation.setApiKey(key);
    const res = await Promise.race([
      AmapLocation.getCurrentPosition(),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('timeout')), timeoutMs); }),
    ]);
    if (timer) clearTimeout(timer);
    if (res && typeof res.latitude === 'number') {
      return {
        coords: { latitude: res.latitude, longitude: res.longitude, accuracy: res.accuracy || 0 },
        timestamp: res.timestamp || Date.now(),
      };
    }
    return null;
  } catch (e) {
    if (timer) clearTimeout(timer);
    return null;
  }
}
