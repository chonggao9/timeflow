// 桌面小组件 V2 的 task handler：Android 在添加/更新/缩放/删除/点击 widget 时回调。
// 运行在 headless JS（可脱离 App UI），允许执行任意异步——读写 SQLite/AsyncStorage、
// 补定位、排期通知，然后 renderWidget 渲染。与 App 靠 timeflow.db + pomodoroState 共享数据，
// 组件不保存自己的数据。按 props.widgetInfo.widgetName 路由到三组组件（widget/widgetNames.js）。
import { FlexWidget, TextWidget } from 'react-native-android-widget';

import { widgetGroup, POMODORO_WIDGETS, TRAVEL_WIDGETS } from './widgetNames';
import { buildFocusData, buildTravelData, buildLegacyData } from './widgetData';
import { widgetJsx, refreshWidgets } from '../src/utils/widgetRefresh';
import { handlePomodoroAction } from './pomodoroActions';
import { checkInHeadless } from '../src/services/quickCheckIn';
import { basePalette, RADIUS_WIDGET } from './widgetTheme';
import { getWidgetLang, makeStrings } from './widgetStrings';

// 数据读取失败时的兜底卡：保留提示 + 点击重试（不弹通知、不静默空白）。
// 若连兜底都构建失败则不调 renderWidget——库保留上次渲染树。
async function errorCard() {
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
    </FlexWidget>
  );
}

function buildBundle(name) {
  const group = widgetGroup(name);
  if (group === 'pomodoro') return buildFocusData();
  if (group === 'travel') return buildTravelData();
  if (group === 'legacy') return buildLegacyData();
  return null;
}

// 渲染自身：正常数据 → 对应组件；读取失败 → 错误卡（点击重试）。
async function renderSelf(props) {
  const name = props.widgetInfo && props.widgetInfo.widgetName;
  if (!name) return;
  try {
    const bundle = await buildBundle(name);
    const jsx = bundle ? widgetJsx(name, bundle) : null;
    if (jsx) {
      props.renderWidget(jsx);
      return;
    }
  } catch (e) {
    /* 落入错误卡 */
  }
  try {
    props.renderWidget(await errorCard());
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
        await checkInHeadless({ mode: 'walk' }); // 乐观落库 + 后台补位，失败返回 null 不抛
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
