// 定位相关工具：快速取坐标、地名反查、定位排查。
// 首页打卡与「我的 → 定位排查」共用，保证行为一致。
import * as Location from 'expo-location';
import { getAmapKey } from '../config';

// 快速定位：服务开关 → 缓存(限 maxAge) → 实时低精度(限 timeoutMs)。
// 返回 { loc, reason }：loc 为坐标对象或 null，reason 说明失败原因。
// 打卡是「立即落库 + 后台补位」，不阻塞，所以超时可放宽到 25s、缓存可放宽到 30 分钟。
export async function getPositionFast({ maxAge = 30 * 60 * 1000, timeoutMs = 25000 } = {}) {
  try {
    const on = await Location.hasServicesEnabledAsync();
    if (!on) return { loc: null, reason: 'services-off' };
  } catch (e) { /* 继续 */ }

  try {
    const cached = await Location.getLastKnownPositionAsync({ maxAge });
    if (cached) return { loc: cached, reason: 'ok' };
  } catch (e) { /* 继续 */ }

  try {
    const loc = await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), timeoutMs)),
    ]);
    return loc ? { loc, reason: 'ok' } : { loc: null, reason: 'timeout' };
  } catch (e) {
    return { loc: null, reason: e && e.message === 'timeout' ? 'timeout' : 'error' };
  }
}

// 高德逆地理编码（坐标 → 附近地名），优先用于国内；失败返回 null
async function amapReverseGeocode(lat, lng, timeout = 4000) {
  const key = await getAmapKey();
  if (!key) return null;
  try {
    const url = `https://restapi.amap.com/v3/geocode/regeo?key=${encodeURIComponent(key)}&location=${lng},${lat}&extensions=base&radius=1000`;
    const res = await Promise.race([
      fetch(url),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), timeout)),
    ]);
    const data = await res.json();
    if (data.status === '1' && data.regeocode) {
      const r = data.regeocode;
      const c = r.addressComponent || {};
      // 1) 商业区/著名地点（如「王府井」）—— 最像附近地名
      const biz = (c.businessAreas || []).find(b => b && b.name)?.name;
      if (biz) return biz;
      // 2) 区 + 街道
      const street = c.streetNumber?.street;
      if (c.district && street) return `${c.district}${street}`;
      // 3) 区 + 乡镇/街道
      if (c.district && (c.township || c.roadName)) return `${c.district}${c.township || c.roadName}`;
      // 4) 完整地址兜底
      if (r.formatted_address) return r.formatted_address;
      const part = [c.district, c.roadName, c.neighbourhood].filter(Boolean);
      if (part.length) return part.join('');
    }
    return null;
  } catch (e) {
    return null;
  }
}

// 反查地名：高德优先，失败回退系统反查；都失败返回 null
export async function reverseGeocodeWithTimeout(lat, lng) {
  const amap = await amapReverseGeocode(lat, lng);
  if (amap) return amap;
  try {
    const [addr] = await Promise.race([
      Location.reverseGeocodeAsync({ latitude: lat, longitude: lng }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 4000)),
    ]);
    if (addr) return [addr.street, addr.district, addr.city].filter(Boolean).join(' ') || addr.name || null;
  } catch (e) { /* 忽略 */ }
  return null;
}

// 「定位排查」逐项自检，返回多行报告（给「我的 → 定位排查」用）
export async function diagnoseLocation() {
  const lines = [];
  const hhmm = (ts) => {
    const d = new Date(ts);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  try {
    lines.push(`• 系统位置服务：${await Location.hasServicesEnabledAsync() ? '✅ 开启' : '❌ 关闭'}`);
  } catch (e) { lines.push('• 系统位置服务：⚠️ 检测失败'); }

  try {
    const { status } = await Location.getForegroundPermissionsAsync();
    lines.push(`• 应用定位权限：${status === 'granted' ? '✅ 已授予' : '❌ ' + status}`);
  } catch (e) { lines.push('• 应用定位权限：⚠️ 检测失败'); }

  try {
    const c = await Location.getLastKnownPositionAsync({ maxAge: 30 * 60 * 1000 });
    lines.push(c
      ? `• 最近位置(30分钟内)：✅ ${hhmm(c.timestamp)} 的坐标`
      : '• 最近位置(30分钟内)：❌ 无缓存');
  } catch (e) { lines.push('• 最近位置：⚠️ 检测失败'); }

  let lat = null, lng = null;
  try {
    const loc = await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 25000)),
    ]);
    if (loc) {
      lat = loc.coords.latitude;
      lng = loc.coords.longitude;
      lines.push(`• 实时定位(25秒)：✅ ${lat.toFixed(5)}, ${lng.toFixed(5)} · 精度 ${Math.round(loc.coords.accuracy || 0)}m`);
    } else {
      lines.push('• 实时定位(25秒)：❌ 未拿到');
    }
  } catch (e) { lines.push('• 实时定位(25秒)：❌ 超时或失败'); }

  if (lat != null && lng != null) {
    const addr = await reverseGeocodeWithTimeout(lat, lng);
    lines.push(addr
      ? `• 地名反查：✅ ${addr}`
      : '• 地名反查：❌ 未识别（高德Key未配置或反查失败，可手动改地名）');
  }

  return lines.join('\n');
}
