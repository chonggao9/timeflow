// 双兼容定位：高德与系统(Google)并行竞速，谁先成功用谁；全程超时，杜绝卡死。
// 高德 SDK 定位同时返回逆地理地名（isNeedAddress=true），系统定位仅返回坐标。
// 系统胜出或高德无地址时再走 reverseGeocodeWithTimeout 补地名。首页打卡与「我的 → 定位排查」共用。
import * as Location from 'expo-location';
import { getAmapKey, getAmapLocKeyRaw } from '../config';
import { amapGetPosition } from './amapLocation';
import { withTimeout } from './withTimeout';

// 失败原因权重：越具体/可操作越高，双失败时返回最有信息量的那个。
const REASON_RANK = {
  'services-off': 3, 'key-error': 3, 'permission': 3, 'quota': 3,
  'key-disabled': 2, 'module-missing': 2, 'init-error': 2, 'amap-error': 2,
  'timeout': 1, 'error': 1, 'failed': 1, 'unknown': 1,
};

// 并行竞速：首个「成功拿到坐标」者立即胜出；某一边失败不提前判负，等另一边；
// 全部失败则按权重返回最有信息量的失败结果。
// 任一 promise reject 也当作失败处理，确保 pending 必递减、helper 必 settle（杜绝自身卡死）。
function firstSuccess(promises) {
  return new Promise((resolve) => {
    let pending = promises.length;
    let bestFailure = null;
    const settle = (r) => {
      if (r && r.loc) { resolve(r); return; }
      const candidate = r || { loc: null, reason: 'failed' };
      const cur = bestFailure ? (REASON_RANK[bestFailure.reason] || 0) : -1;
      const next = REASON_RANK[candidate.reason] || 0;
      if (next > cur) bestFailure = candidate;
      if (--pending === 0) resolve(bestFailure);
    };
    for (const p of promises) {
      Promise.resolve(p).then(settle, () => settle(null));
    }
  });
}

// 系统定位（expo-location）：服务开关 → 缓存(maxAge) → 实时低精度(timeoutMs)
// 每个原生调用都套超时：无 GMS / 国区 Google 不可达时也不会永久挂起。
async function systemGetPosition({ maxAge, timeoutMs }) {
  try {
    const on = await withTimeout(Location.hasServicesEnabledAsync(), 3000);
    if (!on) return { loc: null, reason: 'services-off' };
  } catch (e) { /* 继续 */ }

  try {
    const cached = await withTimeout(Location.getLastKnownPositionAsync({ maxAge }), 3000);
    if (cached) return { loc: cached, reason: 'ok' };
  } catch (e) { /* 继续 */ }

  try {
    const loc = await withTimeout(Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low }), timeoutMs);
    return loc ? { loc, reason: 'ok' } : { loc: null, reason: 'timeout' };
  } catch (e) {
    return { loc: null, reason: e && e.message === 'timeout' ? 'timeout' : 'error' };
  }
}

// 双后端定位：返回 { loc, reason, provider }。并行竞速，谁先成功用谁。
export async function getPositionFast({ maxAge = 5 * 60 * 1000, timeoutMs = 25000 } = {}) {
  const amapP = amapGetPosition(timeoutMs).then((r) =>
    r && r.loc
      ? { loc: r.loc, reason: 'ok', provider: 'amap' }
      : { loc: null, reason: (r && r.error) || 'timeout', provider: 'amap' }
  );
  const sysP = systemGetPosition({ maxAge, timeoutMs }).then((r) => ({ ...r, provider: 'system' }));

  const winner = await firstSuccess([amapP, sysP]);
  return winner && winner.loc
    ? winner
    : { loc: null, reason: winner?.reason || 'failed', provider: winner?.provider || null };
}

// 高德逆地理编码（坐标 → 附近地名），作为 SDK 未返回地址时的兜底；失败返回 null
async function amapReverseGeocode(lat, lng, timeout = 4000) {
  const key = await getAmapKey();
  if (!key) return null;
  try {
    const url = `https://restapi.amap.com/v3/geocode/regeo?key=${encodeURIComponent(key)}&location=${lng},${lat}&extensions=base&radius=1000`;
    const res = await withTimeout(fetch(url), timeout);
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
    const [addr] = await withTimeout(Location.reverseGeocodeAsync({ latitude: lat, longitude: lng }), 4000);
    if (addr) return [addr.street, addr.district, addr.city].filter(Boolean).join(' ') || addr.name || null;
  } catch (e) { /* 忽略 */ }
  return null;
}

// 「定位排查」逐项自检：并行竞速 + 各后端/反查实时结果
export async function diagnoseLocation() {
  const lines = [];
  const hhmm = (ts) => {
    const d = new Date(ts);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };
  const amapLocKey = await getAmapLocKeyRaw(); // null=默认, ''=禁用, 其他=自定义
  const amapWebKey = await getAmapKey();

  lines.push('• 定位策略：并行竞速（高德 + 系统，谁先成功用谁）');
  lines.push(`• 高德定位key：${amapLocKey === '' ? '❌ 已禁用' : amapLocKey ? '✅ 已自定义' : '默认值（需绑包名+SHA1）'}`);
  lines.push(`• 高德Web key：${amapWebKey ? '✅ 已配置' : '未配置（仅兜底反查需要）'}`);

  try {
    lines.push(`• 系统位置服务：${await withTimeout(Location.hasServicesEnabledAsync(), 3000) ? '✅ 开启' : '❌ 关闭'}`);
  } catch (e) { lines.push('• 系统位置服务：⚠️ 检测失败'); }

  try {
    const { status } = await withTimeout(Location.getForegroundPermissionsAsync(), 3000);
    lines.push(`• 应用定位权限：${status === 'granted' ? '✅ 已授予' : '❌ ' + status}`);
  } catch (e) { lines.push('• 应用定位权限：⚠️ 检测失败'); }

  try {
    const c = await withTimeout(Location.getLastKnownPositionAsync({ maxAge: 5 * 60 * 1000 }), 3000);
    lines.push(c
      ? `• 最近位置(5分钟内)：✅ ${hhmm(c.timestamp)} 的坐标`
      : '• 最近位置(5分钟内)：❌ 无缓存');
  } catch (e) { lines.push('• 最近位置：⚠️ 检测失败'); }

  // 实时定位：并行竞速（与打卡同路径）
  const reasonText = {
    'services-off': '系统位置服务关闭',
    'timeout': '超时/无信号',
    'key-error': '高德key鉴权失败（未绑包名+SHA1）',
    'permission': '高德定位权限缺失',
    'quota': '高德配额超限',
    'key-disabled': '高德定位key已禁用',
    'module-missing': '高德原生模块未链接',
    'init-error': '高德初始化失败',
    'amap-error': '高德定位失败',
  };
  let lat = null, lng = null;
  const { loc, reason, provider } = await getPositionFast();
  if (loc) {
    lat = loc.coords.latitude;
    lng = loc.coords.longitude;
    lines.push(`• 实时定位(${provider === 'amap' ? '高德' : '系统'})：✅ ${lat.toFixed(5)}, ${lng.toFixed(5)} · 精度 ${Math.round(loc.coords.accuracy || 0)}m`);
  } else {
    lines.push(`• 实时定位：❌ ${reasonText[reason] || '失败'}`);
  }

  if (lat != null && lng != null) {
    const addr = loc.address || await reverseGeocodeWithTimeout(lat, lng);
    lines.push(addr
      ? `• 地名反查：✅ ${addr}`
      : '• 地名反查：❌ 未识别（高德WebKey未配置或反查失败，可手动改地名）');
  }

  return lines.join('\n');
}
