// 「一键打卡」共享数据层：App 首页与桌面小组件 headless 调同一函数（验收硬性要求）。
// 只负责数据写入与位置补位，不含任何 UI（振动/提示/刷新由调用方处理）。
// 流程与现网一致：立即乐观落库（地名占位）→ 后台用最近已知坐标补位 + 反查地名。
// headless 安全：仅依赖 store（SQLite）/expo-location/utils，均有生产先例。
import * as Location from 'expo-location';

import { ensureTrip, saveRecord, updateRecord, getRecordById } from '../storage/store';
import { UNNAMED, isPlaceholderName } from '../utils/stats';
import { reverseGeocodeWithTimeout } from '../utils/location';

// 与 HomeScreen 相同格式的 id
export const makeRecordId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

const MAX_AGE_MS = 5 * 60 * 1000; // 缓存坐标时效 5 分钟，避免绑定数天前跨城陈旧坐标

// 核心写入：新建/复用今日行程 + 落一条占位记录。失败抛错，由调用方决定 UI 反馈。
export async function quickCheckIn({ mode = 'walk', timestamp = Date.now() } = {}) {
  const tripId = await ensureTrip();
  const id = makeRecordId();
  const record = { id, timestamp, locationName: UNNAMED, lat: null, lng: null, mode, tripId };
  await saveRecord(record);
  return { id, tripId, record };
}

// 后台补位：最近已知坐标（无需权限弹窗、秒级）+ 逆地理编码。静默失败——
// 记录已落库，坐标地名留待 App 下次打开时补。
export async function backfillFromLastKnown(id) {
  try {
    const cached = await Location.getLastKnownPositionAsync({ maxAge: MAX_AGE_MS });
    if (!cached || !cached.coords) return false;
    const isFresh = !cached.timestamp || Date.now() - cached.timestamp < MAX_AGE_MS;
    if (!isFresh) return false;

    const lat = cached.coords.latitude;
    const lng = cached.coords.longitude;
    let addr = cached.address;
    if (!addr) addr = await reverseGeocodeWithTimeout(lat, lng);

    const current = await getRecordById(id);
    if (!current || current.tripId == null) return false; // 记录已被删/无行程：不写坐标
    const patch = { lat, lng };
    if (addr && isPlaceholderName(current.locationName)) patch.locationName = addr;
    await updateRecord(id, patch);
    return true;
  } catch (e) {
    return false;
  }
}

// headless 一站式入口（widget 打卡）：落库 + 补位，返回记录 id（失败 null）。
export async function checkInHeadless({ mode = 'walk' } = {}) {
  try {
    const { id } = await quickCheckIn({ mode });
    await backfillFromLastKnown(id);
    return id;
  } catch (e) {
    return null;
  }
}
