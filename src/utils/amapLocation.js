// 高德定位封装：读 key → 初始化 → 一次性取坐标（同时返回 SDK 逆地理地名）。
// 成功返回 { loc: { coords, timestamp, address } }，失败返回 { error }（细分原因）。
// 原生模块缺失（Expo Go / 未链接）或未配置/禁用 key 时安全降级。
import AmapLocation from '../../modules/amap-location';
import { getAmapLocKey } from '../config';
import { withTimeout } from './withTimeout';

export async function amapGetPosition(timeoutMs = 30000) {
  if (!AmapLocation) { if (__DEV__) console.log('[amap] 原生模块未链接'); return { error: 'module-missing' }; }
  try {
    const key = await getAmapLocKey();
    if (!key) { if (__DEV__) console.log('[amap] 定位key未配置/已禁用'); return { error: 'key-disabled' }; }
    await AmapLocation.setApiKey(key);
    const res = await withTimeout(AmapLocation.getCurrentPosition(), timeoutMs);
    if (res && typeof res.latitude === 'number') {
      // 组装地名（与 amapReverseGeocode 同优先级：POI/AOI → 区+街道 → 完整地址）
      const name = res.poiName || res.aoiName
        || [res.district, res.street].filter(Boolean).join('')
        || res.address || '';
      return {
        loc: {
          coords: { latitude: res.latitude, longitude: res.longitude, accuracy: res.accuracy || 0 },
          timestamp: res.timestamp || Date.now(),
          address: name,
        },
      };
    }
    return { error: 'unknown' };
  } catch (e) {
    const msg = (e && e.message) || '';
    const code = (e && e.code) || '';
    let error;
    const m = /AMap error (\d+)/.exec(msg);
    if (m) {
      const c = Number(m[1]);
      error = (c === 7 || c === 32) ? 'key-error'
        : (c === 12 || c === 33) ? 'permission'
        : (c === 35) ? 'quota' : 'amap-error';
    } else if (msg === 'timeout' || code === 'TIMEOUT') {
      error = 'timeout';
    } else if (code === 'INIT_ERROR' || code === 'NO_CONTEXT') {
      error = 'init-error';
    } else {
      error = 'unknown';
    }
    if (__DEV__) console.log('[amap] 定位失败:', msg, '→', error);
    return { error, detail: msg };
  }
}
