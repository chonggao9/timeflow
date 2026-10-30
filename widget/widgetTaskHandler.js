// 桌面小组件 V2 的 task handler：Android 在添加/更新/缩放/删除/点击 widget 时回调。
// 运行在 headless JS（可脱离 App UI），允许执行任意异步——读写 SQLite/AsyncStorage、
// 补定位、排期通知，然后 renderWidget 渲染。与 App 靠 timeflow.db + pomodoroState 共享数据，
// 组件不保存自己的数据。按 props.widgetInfo.widgetName 路由到三组组件（widget/widgetNames.js）。
import AsyncStorage from '@react-native-async-storage/async-storage';
import { FlexWidget, TextWidget } from 'react-native-android-widget';

import { widgetGroup, POMODORO_WIDGETS, TRAVEL_WIDGETS } from './widgetNames';
import { buildFocusData, buildTravelData, buildLegacyData, loadWidgetSnapshot } from './widgetData';
import { WIDGET_SNAPSHOT_KEY, getLastMode, syncWidgetSnapshot } from '../src/storage/store';
import { widgetJsx, refreshWidgets } from '../src/utils/widgetRefresh';
import { handlePomodoroAction } from './pomodoroActions';
import { checkInHeadless } from '../src/services/quickCheckIn';
import { basePalette, RADIUS_WIDGET } from './widgetTheme';
import { getWidgetLang, makeStrings } from './widgetStrings';

export const WIDGET_LAST_ERROR_KEY = 'widget_last_error';

function extractErrorCode(e) {
  if (!e) return 'ERR_UNKNOWN';
  if (e.code) return String(e.code).slice(0, 16);
  if (e.name) return String(e.name).slice(0, 16);
  return 'ERR_RENDER';
}

async function recordLastError(widgetName, error) {
  try {
    const code = extractErrorCode(error);
    const payload = {
      widgetName: widgetName || 'unknown',
      name: error?.name || 'Error',
      message: error?.message ? String(error.message).slice(0, 150) : 'Render failed',
      code,
      ts: Date.now(),
    };
    await AsyncStorage.setItem(WIDGET_LAST_ERROR_KEY, JSON.stringify(payload));
    return code;
  } catch (e) {
    return 'ERR_LOG';
  }
}

// 数据读取失败时的兜底卡：保留提示 + 点击重试（不弹通知、不静默空白）。
// 若连兜底都构建失败则不调 renderWidget——库保留上次渲染树。
async function errorCard(errCode = null) {
  let strings = null;
  let isDark = false;
  try {
    strings = makeStrings(await getWidgetLang());
  } catch (e) {
    /* 用内置兜底文案 */
  }
  try {
    const { getWidgetTheme } = require('./widgetStrings');
    isDark = (await getWidgetTheme()).isDark;
  } catch (e) {
    /* 默认浅色 */
  }
  const pal = basePalette(isDark);
  return (
    <FlexWidget
      clickAction="refresh"
      style={{
        height: 'match_parent',
        width: 'match_parent',
        backgroundColor: pal.bg,
        borderRadius: RADIUS_WIDGET,
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
    >
      <TextWidget
        text={(strings && strings.title) || 'TimeFlow'}
        style={{ fontSize: 13, fontWeight: '800', color: pal.textSecondary }}
      />
      <TextWidget
        text={(strings && strings.refresh) || '点击刷新'}
        style={{ fontSize: 12, fontWeight: '500', color: pal.textSecondary, marginTop: 6 }}
      />
      {errCode ? (
        <TextWidget
          text={`[${errCode}]`}
          style={{ fontSize: 10, fontWeight: '500', color: pal.textSecondary, marginTop: 4 }}
        />
      ) : null}
    </FlexWidget>
  );
}

function buildBundle(name) {
  if (name === 'PomodoroWidget4x2' || name === 'PomodoroWidget2x2') return buildFocusData();
  if (name === 'TravelWidget4x2' || name === 'TravelWidget2x2') return buildTravelData();
  return buildLegacyData();
}

// 渲染自身：正常数据 → 对应组件；读取失败 → 记录错误码并渲染错误卡（点击重试）。
async function renderSelf(props) {
  const name = props.widgetInfo && props.widgetInfo.widgetName;
  if (!name) return;
  let capturedErrCode = null;
  try {
    const bundle = await buildBundle(name);
    const jsx = bundle ? widgetJsx(name, bundle) : null;
    if (jsx) {
      props.renderWidget(jsx);
      return;
    }
    capturedErrCode = await recordLastError(name, new Error('Empty bundle or unknown widget'));
  } catch (e) {
    capturedErrCode = await recordLastError(name, e);
  }
  try {
    props.renderWidget(await errorCard(capturedErrCode));
  } catch (e) {
    /* 保留上次渲染 */
  }
}

// 兄弟尺寸刷新（不含自身——自身走 props.renderWidget 即时反馈）
async function refreshSiblings(names, selfName) {
  await refreshWidgets((names || []).filter((n) => n !== selfName));
}

let lastCheckInTime = 0; // 2s 防抖：避免连点重复打卡（headless 进程若被回收则天然重置）

export const widgetTaskHandler = async (props) => {
  const { widgetAction, clickAction } = props;
  const name = props.widgetInfo && props.widgetInfo.widgetName;
  const group = widgetGroup(name);

  switch (widgetAction) {
    case 'WIDGET_ADDED':
    case 'WIDGET_UPDATE':
    case 'WIDGET_RESIZED':
      await renderSelf(props);
      break;

    case 'WIDGET_CLICK': {
      // OPEN_APP / OPEN_URI 由原生处理不进这里；自定义 action 按域路由
      if (typeof clickAction === 'string' && (clickAction.startsWith('pomo.') || clickAction.startsWith('mode.'))) {
        const state = await handlePomodoroAction(clickAction);
        if (!state) return; // 防抖吞掉：不重绘
        await renderSelf(props); // 先反馈自身（点击先反馈原则）
        await refreshSiblings(POMODORO_WIDGETS, name);
      } else if (clickAction === 'checkIn' && group === 'travel') {
        const now = Date.now();
        if (now - lastCheckInTime < 2000) return; // 2s 防抖，避免重复打卡
        lastCheckInTime = now;

        // 1) 点击即时反馈：乐观预更新快照并立即重绘自身（<50ms 响应，不卡顿）
        const mode = await getLastMode();
        try {
          const snap = await loadWidgetSnapshot();
          if (snap && snap.travel) {
            const optList = [
              ...(snap.travel.todayRecords || []),
              { id: `opt-${now}`, timestamp: now, locationName: null, mode },
            ];
            const nextSnap = {
              ...snap,
              updatedAt: now,
              travel: {
                ...snap.travel,
                todayRecords: optList,
                count: optList.length,
              },
            };
            await AsyncStorage.setItem(WIDGET_SNAPSHOT_KEY, JSON.stringify(nextSnap));
            await renderSelf(props);
          }
        } catch (e) {
          /* 乐观反馈失败不阻塞后续落库 */
        }

        // 2) 真实后台落库与补位（复用 App 内部的 quickCheckIn）
        const checkInId = await checkInHeadless({ mode, timestamp: now });
        if (!checkInId) {
          // N9: 真实打卡失败，重新同步快照以回滚虚假的 opt- 记录
          await recordLastError(name, new Error('CheckIn failed'));
          await syncWidgetSnapshot().catch(() => {});
        } else {
          // 真实打卡成功，刷新快照将 opt- 占位替换为真实入库记录
          await syncWidgetSnapshot().catch(() => {});
        }
        await renderSelf(props);
        await refreshSiblings(TRAVEL_WIDGETS, name);
      } else if (clickAction === 'refresh') {
        await renderSelf(props); // 错误卡重试
      } else {
        await renderSelf(props); // 旧渲染树残留的未知 action：兜底重渲染
      }
      break;
    }

    case 'WIDGET_DELETED':
      // 组件无私有存储（数据都在 App 的 SQLite/AsyncStorage），无需清理
      break;
    default:
      break;
  }
};
