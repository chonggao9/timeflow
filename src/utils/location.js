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

// 通用并行竞速：取第一个解析出「有效值(truthy)」的 Promise；全部无效/失败则解析 null。
// 与上面的 firstSuccess 不同——这里候选的 resolve 值本身即"成功"，无需 loc/权重，反查地名用。
function firstSuccessValue(promises) {
  return new Promise((resolve) => {
    let pending = promises.length;
    let done = false;
    for (const p of promises) {
      Promise.resolve(p).then((v) => {
        if (v && !done) { done = true; resolve(v); }
        else if (--pending === 0 && !done) resolve(null);
      }, () => {
        if (--pending === 0 && !done) resolve(null);
      });
    }
  });
}

// 坐标系转换：WGS-84 (GPS标准) -> GCJ-02 (火星坐标/高德地图)，消除国内几百米偏移
const PI = Math.PI;
const A = 6378245.0;
const EE = 0.00669342162296594323;

function outOfChina(lat, lng) {
  if (lng < 72.004 || lng > 137.8347) return true;
  if (lat < 0.8293 || lat > 55.8271) return true;
  return false;
}

function transformLat(x, y) {
  let ret = -100.0 + 2.0 * x + 3.0 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
  ret += ((20.0 * Math.sin(6.0 * x * PI) + 20.0 * Math.sin(2.0 * x * PI)) * 2.0) / 3.0;
  ret += ((20.0 * Math.sin(y * PI) + 40.0 * Math.sin((y / 3.0) * PI)) * 2.0) / 3.0;
  ret += ((160.0 * Math.sin((y / 12.0) * PI) + 320 * Math.sin((y * PI) / 30.0)) * 2.0) / 3.0;
  return ret;
}

function transformLng(x, y) {
  let ret = 300.0 + x + 2.0 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
  ret += ((20.0 * Math.sin(6.0 * x * PI) + 20.0 * Math.sin(2.0 * x * PI)) * 2.0) / 3.0;
  ret += ((20.0 * Math.sin(x * PI) + 40.0 * Math.sin((x / 3.0) * PI)) * 2.0) / 3.0;
  ret += ((150.0 * Math.sin((x / 12.0) * PI) + 300.0 * Math.sin((x / 30.0) * PI)) * 2.0) / 3.0;
  return ret;
}

export function wgs84ToGcj02(lat, lng) {
  if (outOfChina(lat, lng)) {
    return { lat, lng };
  }
  let dLat = transformLat(lng - 105.0, lat - 35.0);
  let dLng = transformLng(lng - 105.0, lat - 35.0);
  const radLat = (lat / 180.0) * PI;
  let magic = Math.sin(radLat);
  magic = 1 - EE * magic * magic;
  const sqrtMagic = Math.sqrt(magic);
  dLat = (dLat * 180.0) / (((A * (1 - EE)) / (magic * sqrtMagic)) * PI);
  dLng = (dLng * 180.0) / ((A / sqrtMagic) * Math.cos(radLat) * PI);
  return { lat: lat + dLat, lng: lng + dLng };
}

function normalizeSystemLocation(loc) {
  if (!loc || !loc.coords) return loc;
  const { latitude, longitude } = loc.coords;
  if (latitude != null && longitude != null && !outOfChina(latitude, longitude)) {
    const { lat, lng } = wgs84ToGcj02(latitude, longitude);
    return {
      ...loc,
      coords: {
        ...loc.coords,
        latitude: lat,
        longitude: lng,
        isConvertedGcj02: true,
      },
    };
  }
  return loc;
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
    if (cached) return { loc: normalizeSystemLocation(cached), reason: 'ok' };
  } catch (e) { /* 继续 */ }

  try {
    const loc = await withTimeout(Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low }), timeoutMs);
    return loc ? { loc: normalizeSystemLocation(loc), reason: 'ok' } : { loc: null, reason: 'timeout' };
  } catch (e) {
    return { loc: null, reason: e && e.message === 'timeout' ? 'timeout' : 'error' };
  }
}

// 深度解析系统 (Google) Geocoder 返回的地址对象
// 兼顾国内与海外多层级结构：区县/道路/标志地名/formattedAddress 兜底，避免有效地址被误丢弃
function formatSystemAddress(addr) {
  if (!addr) return null;

  // 1. 尝试精细组合：区/县/子行政区 + 道路 + 标志地名/门牌
  const dist = addr.district || addr.subregion;
  const road = addr.street;
  const poi = (addr.name && addr.name !== addr.streetNumber && addr.name !== addr.postalCode) ? addr.name : null;
  const num = addr.streetNumber;

  const parts = [];
  if (dist) parts.push(dist);
  if (road) parts.push(road);
  if (poi) parts.push(poi);
  else if (num) parts.push(num);

  const uniqueParts = parts.filter((p, i) => parts.indexOf(p) === i);
  if (uniqueParts.length >= 2) {
    return uniqueParts.join(' ');
  }

  // 2. 完整格式化地址兜底（如 Android Geocoder 的 getAddressLine(0)）
  if (addr.formattedAddress && typeof addr.formattedAddress === 'string') {
    const cleaned = addr.formattedAddress
      .replace(/^(中国|China)[,，\s]*/i, '')
      .trim();
    if (cleaned) return cleaned;
  }

  // 3. 次级组合：城市 + 区/路/地名
  if (uniqueParts.length === 1) {
    if (addr.city && !uniqueParts.includes(addr.city)) {
      return `${addr.city} ${uniqueParts[0]}`;
    }
    return uniqueParts[0];
  }

  // 4. 最终兜底
  const fallback = [addr.city, addr.region, addr.country].filter(Boolean).join(' ');
  return fallback || addr.name || null;
}

// 系统反查地名详细诊断版：坐标 → { name, error, detail }
async function systemReverseGeocodeDetailed(lat, lng, timeout = 8000) {
  try {
    const list = await withTimeout(Location.reverseGeocodeAsync({ latitude: lat, longitude: lng }), timeout);
    if (!list || list.length === 0) {
      return { name: null, error: 'empty', detail: 'Geocoder returned 0 results' };
    }
    const name = formatSystemAddress(list[0]);
    if (name) {
      return { name, error: null, detail: null };
    }
    return { name: null, error: 'empty-fields', detail: 'All address fields were empty' };
  } catch (e) {
    const msg = (e && e.message) || String(e || '');
    let error = 'failed';
    let detail = msg;
    if (msg === 'timeout') {
      error = 'timeout';
      detail = 'Request timed out (8s)';
    } else if (/NoGeocode|not available|unavailable/i.test(msg)) {
      error = 'no-service';
      detail = 'No Geocoder service on device (Missing GMS)';
    } else if (/IOException|grpc|Service not Available|network/i.test(msg)) {
      error = 'network';
      detail = 'Network unreachable (Google servers blocked)';
    } else if (/Unauthorized|permission/i.test(msg)) {
      error = 'permission';
      detail = 'Location permission missing';
    }
    return { name: null, error, detail };
  }
}

// 系统反查地名（Google Geocoder）：坐标 → 地名，失败/无数据返回 null。
// 独立封装，可与高德反查并行竞速；超时放宽至 8000ms（适应 IPC 与网络代理延迟）。
async function systemReverseGeocode(lat, lng, timeout = 8000) {
  const res = await systemReverseGeocodeDetailed(lat, lng, timeout);
  return res.name;
}

// 双后端定位：返回 { loc, reason, provider }。并行竞速，谁先成功用谁。
export async function getPositionFast({ maxAge = 5 * 60 * 1000, timeoutMs = 25000 } = {}) {
  const amapP = amapGetPosition(timeoutMs).then((r) =>
    r && r.loc
      ? { loc: r.loc, reason: 'ok', provider: 'amap' }
      : { loc: null, reason: (r && r.error) || 'timeout', detail: (r && r.detail) || '', provider: 'amap' }
  );
  const sysP = systemGetPosition({ maxAge, timeoutMs }).then((r) => ({ ...r, provider: 'system' }));

  const winner = await firstSuccess([amapP, sysP]);
  return winner && winner.loc
    ? winner
    : { loc: null, reason: winner?.reason || 'failed', detail: winner?.detail || '', provider: winner?.provider || null };
}

// 高德逆地理编码（坐标 → 附近地名），带诊断信息
async function amapReverseGeocodeDetailed(lat, lng, timeout = 4000) {
  const key = await getAmapKey();
  if (!key) return { name: null, error: 'not-configured', detail: 'Web key not configured' };
  try {
    const url = `https://restapi.amap.com/v3/geocode/regeo?key=${encodeURIComponent(key)}&location=${lng},${lat}&extensions=base&radius=1000`;
    const res = await withTimeout(fetch(url), timeout);
    const data = await res.json();
    if (data.status === '1' && data.regeocode) {
      const r = data.regeocode;
      const c = r.addressComponent || {};
      // 1) 商业区/著名地点（如「王府井」）—— 最像附近地名
      const biz = (c.businessAreas || []).find(b => b && b.name)?.name;
      if (biz) return { name: biz, error: null, detail: null };
      // 2) 区 + 街道
      const street = c.streetNumber?.street;
      if (c.district && street) return { name: `${c.district}${street}`, error: null, detail: null };
      // 3) 区 + 乡镇/街道
      if (c.district && (c.township || c.roadName)) return { name: `${c.district}${c.township || c.roadName}`, error: null, detail: null };
      // 4) 完整地址兜底
      if (r.formatted_address) return { name: r.formatted_address, error: null, detail: null };
      const part = [c.district, c.roadName, c.neighbourhood].filter(Boolean);
      if (part.length) return { name: part.join(''), error: null, detail: null };
      return { name: null, error: 'empty', detail: 'No recognizable address in response' };
    }
    const info = data.info || data.infocode || 'status 0';
    return { name: null, error: 'amap-api-error', detail: info };
  } catch (e) {
    const msg = (e && e.message) || String(e || '');
    return { name: null, error: msg === 'timeout' ? 'timeout' : 'network', detail: msg };
  }
}

// 高德逆地理编码（坐标 → 附近地名），作为 SDK 未返回地址时的兜底；失败返回 null
async function amapReverseGeocode(lat, lng, timeout = 4000) {
  const res = await amapReverseGeocodeDetailed(lat, lng, timeout);
  return res.name;
}

// 并行反查地名：高德(国内) + 系统(Google/国外) 同时跑，谁先拿到地名用谁 —— 无需区分地域，自动适配。
// 返回 { name, provider } | null，供打卡与定位排查共用，便于区分是哪一路出的结果。
async function reverseGeocode(lat, lng) {
  return firstSuccessValue([
    amapReverseGeocode(lat, lng).then((name) => (name ? { name, provider: 'amap' } : null)),
    systemReverseGeocode(lat, lng).then((name) => (name ? { name, provider: 'system' } : null)),
  ]);
}

// 对外：只取地名（打卡用）。返回 string | null。签名不变，调用方无需改动。
export async function reverseGeocodeWithTimeout(lat, lng) {
  const r = await reverseGeocode(lat, lng);
  return r ? r.name : null;
}

// 「定位排查」逐项自检：并行竞速 + 各后端/反查实时结果
export async function diagnoseLocation(lang = 'zh') {
  const isEn = lang === 'en';
  const lines = [];
  const hhmm = (ts) => {
    const d = new Date(ts);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };
  const amapLocKey = await getAmapLocKeyRaw(); // null=默认, ''=禁用, 其他=自定义
  const amapWebKey = await getAmapKey();

  lines.push(isEn ? '• Strategy: Parallel race (Amap + System, first wins)' : '• 定位策略：并行竞速（高德 + 系统，谁先成功用谁）');
  lines.push(isEn
    ? `• Amap Loc Key: ${amapLocKey === '' ? '❌ Disabled' : amapLocKey ? '✅ Custom' : 'Default'}`
    : `• 高德定位key：${amapLocKey === '' ? '❌ 已禁用' : amapLocKey ? '✅ 已自定义' : '默认值（需绑包名+SHA1）'}`);
  lines.push(isEn
    ? `• Amap Web Key: ${amapWebKey ? '✅ Configured' : 'Not configured'}`
    : `• 高德Web key：${amapWebKey ? '✅ 已配置' : '未配置（仅兜底反查需要）'}`);

  try {
    const enabled = await withTimeout(Location.hasServicesEnabledAsync(), 3000);
    lines.push(isEn
      ? `• Location Services: ${enabled ? '✅ On' : '❌ Off'}`
      : `• 系统位置服务：${enabled ? '✅ 开启' : '❌ 关闭'}`);
  } catch (e) {
    lines.push(isEn ? '• Location Services: ⚠️ Check failed' : '• 系统位置服务：⚠️ 检测失败');
  }

  try {
    const { status } = await withTimeout(Location.getForegroundPermissionsAsync(), 3000);
    lines.push(isEn
      ? `• App Permission: ${status === 'granted' ? '✅ Granted' : '❌ ' + status}`
      : `• 应用定位权限：${status === 'granted' ? '✅ 已授予' : '❌ ' + status}`);
  } catch (e) {
    lines.push(isEn ? '• App Permission: ⚠️ Check failed' : '• 应用定位权限：⚠️ 检测失败');
  }

  try {
    const c = await withTimeout(Location.getLastKnownPositionAsync({ maxAge: 5 * 60 * 1000 }), 3000);
    if (isEn) {
      lines.push(c ? `• Recent (within 5m): ✅ ${hhmm(c.timestamp)} cached` : '• Recent (within 5m): ❌ No cache');
    } else {
      lines.push(c ? `• 最近位置(5分钟内)：✅ ${hhmm(c.timestamp)} 的坐标` : '• 最近位置(5分钟内)：❌ 无缓存');
    }
  } catch (e) {
    lines.push(isEn ? '• Recent Cache: ⚠️ Check failed' : '• 最近位置：⚠️ 检测失败');
  }

  // 实时定位：并行竞速（与打卡同路径）
  const reasonTextZh = {
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
  const reasonTextEn = {
    'services-off': 'Location services off',
    'timeout': 'Timeout / No signal',
    'key-error': 'Amap key auth failed',
    'permission': 'Amap permission missing',
    'quota': 'Amap quota exceeded',
    'key-disabled': 'Amap loc key disabled',
    'module-missing': 'Amap native module missing',
    'init-error': 'Amap init error',
    'amap-error': 'Amap locate error',
  };
  const reasonText = isEn ? reasonTextEn : reasonTextZh;

  let lat = null, lng = null;
  const { loc, reason, provider, detail } = await getPositionFast();
  if (loc) {
    lat = loc.coords.latitude;
    lng = loc.coords.longitude;
    const provName = provider === 'amap' ? (isEn ? 'Amap' : '高德') : (isEn ? 'System' : '系统');
    lines.push(isEn
      ? `• Live Fix (${provName}): ✅ ${lat.toFixed(5)}, ${lng.toFixed(5)} · Accuracy ${Math.round(loc.coords.accuracy || 0)}m`
      : `• 实时定位(${provName})：✅ ${lat.toFixed(5)}, ${lng.toFixed(5)} · 精度 ${Math.round(loc.coords.accuracy || 0)}m`);
  } else {
    lines.push(isEn
      ? `• Live Fix: ❌ ${reasonText[reason] || 'Failed'}${detail ? ` (${detail})` : ''}`
      : `• 实时定位：❌ ${reasonText[reason] || '失败'}${detail ? `（${detail}）` : ''}`);
  }

  if (lat != null && lng != null) {
    const [amapRes, sysRes] = await Promise.all([
      amapReverseGeocodeDetailed(lat, lng),
      systemReverseGeocodeDetailed(lat, lng),
    ]);

    const finalAddr = loc.address || amapRes.name || sysRes.name;
    const finalFrom = loc.address
      ? (isEn ? 'Amap SDK built-in' : '高德SDK原生自带')
      : (amapRes.name
        ? (isEn ? 'Amap Web API' : '高德Web接口')
        : (sysRes.name ? (isEn ? 'System/Google' : '系统/Google Geocoder') : null));

    if (finalAddr) {
      lines.push(isEn ? `• Final Address: ✅ ${finalAddr} (${finalFrom})` : `• 打卡综合地名：✅ ${finalAddr}（${finalFrom}）`);
    } else {
      lines.push(isEn ? '• Final Address: ❌ Failed to resolve' : '• 打卡综合地名：❌ 未能反查到地名（可手动改）');
    }

    // 分项诊断 1：高德 Web
    if (amapRes.name) {
      lines.push(isEn ? `  - Amap Web: ✅ ${amapRes.name}` : `  - 高德Web反查：✅ ${amapRes.name}`);
    } else {
      const amapErrText = {
        'not-configured': isEn ? 'Not configured (Optional)' : '未配置WebKey（仅兜底反查需要）',
        'timeout': isEn ? 'Request timeout' : '请求超时',
        'network': isEn ? 'Network error' : '网络连接失败',
        'amap-api-error': isEn ? `API error (${amapRes.detail})` : `接口报错（${amapRes.detail}）`,
      }[amapRes.error] || (amapRes.detail || (isEn ? 'Failed' : '失败'));
      lines.push(isEn ? `  - Amap Web: ⚪ ${amapErrText}` : `  - 高德Web反查：⚪ ${amapErrText}`);
    }

    // 分项诊断 2：系统 (Google)
    if (sysRes.name) {
      lines.push(isEn ? `  - Google Geocoder: ✅ ${sysRes.name}` : `  - 系统(Google)反查：✅ ${sysRes.name}`);
    } else {
      const sysErrText = {
        'timeout': isEn ? 'Request timeout (8s)' : '请求超时（8s未响应）',
        'network': isEn ? 'Network blocked (Google unreachable, need proxy)' : '网络不可达（Google服务器连接受阻/被墙，需代理系统服务）',
        'no-service': isEn ? 'No Google Play Geocoder on device' : '设备无 Google Play 服务（缺少 Geocoder 组件）',
        'permission': isEn ? 'Permission denied' : '定位权限未授予',
        'empty': isEn ? 'No address for coordinates' : '该坐标无对应地址记录',
        'empty-fields': isEn ? 'Returned empty address fields' : '返回地址字段全为空',
      }[sysRes.error] || (sysRes.detail ? `${sysRes.detail}` : (isEn ? 'Failed' : '失败'));
      lines.push(isEn ? `  - Google Geocoder: ❌ ${sysErrText}` : `  - 系统(Google)反查：❌ ${sysErrText}`);
    }
  }

  return lines.join('\n');
}
