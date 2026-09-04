// 桌面小组件的 task handler：Android 在添加/更新/缩放/删除/点击 widget 时回调。
// 运行在 headless JS（可脱离 App UI），允许执行任意异步——写 SQLite、读定位、反查地名，
// 然后 renderWidget 渲染。与 App 靠 timeflow.db + AsyncStorage 共享数据。
import * as Location from 'expo-location';

import { TimeFlowWidget } from './Widget';
import { buildRenderData } from './widgetData';
import { saveRecord, ensureTrip, updateRecord } from '../src/storage/store';
import { reverseGeocodeWithTimeout } from '../src/utils/location';
import { UNNAMED } from '../src/utils/stats';

// React Native 的 makeId（与 HomeScreen 相同）：${Date.now()}-${random}
const makeId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

// 从 widget 一键打卡：与 App 首页 handleCheckIn 同心智——立即落库（坐标/地名留空），
// 再后台用「最近已知坐标」（秒级，不等实时 GPS）+ 并行反查补充地名。
async function checkInFromWidget() {
  try {
    const tripId = await ensureTrip();          // 复用现有行程（无则新建）
    const id = makeId();
    await saveRecord({
      id,
      timestamp: Date.now(),
      locationName: UNNAMED,
      lat: null,
      lng: null,
      mode: 'walk',                              // widget 无出行方式选择，默认步行
      tripId,
    });

    // 后台补位：先取最近已知坐标（限定 5 分钟内时效，避免绑定数天前跨城陈旧坐标）
    try {
      const MAX_AGE_MS = 5 * 60 * 1000;
      const cached = await Location.getLastKnownPositionAsync({ maxAge: MAX_AGE_MS });
      if (cached && cached.coords) {
        const isFresh = !cached.timestamp || (Date.now() - cached.timestamp < MAX_AGE_MS);
        if (isFresh) {
          const lat = cached.coords.latitude;
          const lng = cached.coords.longitude;
          let addr = cached.address;
          if (!addr) addr = await reverseGeocodeWithTimeout(lat, lng);
          await updateRecord(id, { lat, lng, ...(addr ? { locationName: addr } : {}) });
        }
      }
    } catch (e) {
      /* 补位失败不阻塞：记录照常在，坐标地名留待 App 下次打开时补 */
    }
  } catch (e) {
    /* 打卡失败：静默，仅不渲染新状态；数据层已有 try-catch，这里不再抛出 */
  }
}

// 统一渲染：读数据 + 文案配色 → 渲染 TimeFlowWidget
async function renderWidget(props) {
  const { data, colors, strings } = await buildRenderData();
  props.renderWidget(<TimeFlowWidget data={data} colors={colors} strings={strings} />);
}

let lastWidgetCheckInTime = 0;

export const widgetTaskHandler = async (props) => {
  const { widgetAction, clickAction } = props;
  switch (widgetAction) {
    case 'WIDGET_ADDED':
    case 'WIDGET_UPDATE':
    case 'WIDGET_RESIZED':
      await renderWidget(props);
      break;
    case 'WIDGET_CLICK':
      // 只认「打卡」这个自定义 clickAction；其余（OPEN_APP/OPEN_URI）由原生处理，不进这里
      if (clickAction === 'checkIn') {
        const now = Date.now();
        if (now - lastWidgetCheckInTime < 2000) return; // 2 秒防抖，避免重复打卡
        lastWidgetCheckInTime = now;
        await checkInFromWidget();
        await renderWidget(props); // 打卡后刷新，反映最新次数/时间
      }
      break;
    case 'WIDGET_DELETED':
      // 当前无持久化的 widget 状态（数据都来自 App 的 SQLite），无需清理
      break;
    default:
      break;
  }
};
