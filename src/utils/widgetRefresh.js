// App 内主动刷新桌面小组件：数据变化（打卡/改名/删除/保存专注/番茄操作）后立即让
// widget 反映最新状态，否则要等 updatePeriodMillis（30 分钟）心跳才更新。
// V2 多组件：refreshWidgets(names) 为唯一底座；按域提供 refreshPomodoroWidgets /
// refreshTravelWidgets / refreshAllWidgets；refreshWidget() 保留兼容旧调用点（= 全部刷新）。
// 渲染 JSX 与 headless taskHandler 共用 widgetData 的同一份构建（避免漂移）；无 widget 时静默。
import { requestWidgetUpdate } from 'react-native-android-widget';
import { POMODORO_WIDGETS, TRAVEL_WIDGETS, LEGACY_WIDGETS, widgetGroup } from '../../widget/widgetNames';
import { buildFocusData, buildTravelData, buildLegacyData } from '../../widget/widgetData';
import {
  PomodoroWidget4x2,
  PomodoroWidget4x1,
  PomodoroWidget2x2,
  PomodoroWidgetTomato2x2,
  PomodoroWidgetDark2x2,
  PomodoroWidgetStats2x2,
} from '../../widget/widgets/PomodoroWidgets';
import {
  TravelWidget4x2,
  TravelWidget4x1,
  TravelWidget2x2,
  TravelWidgetWeek4x1,
  TravelWidgetMap2x2,
  TravelWidgetHeat2x2,
  LegacyUpgradeCard,
} from '../../widget/widgets/TravelWidgets';

// 组件名 → JSX。bundle 可传入已构建的数据（taskHandler 复用，避免二次读库）。
export function widgetJsx(name, bundle) {
  switch (name) {
    case 'PomodoroWidget4x2':
      return <PomodoroWidget4x2 {...bundle} />;
    case 'PomodoroWidget4x1':
      return <PomodoroWidget4x1 {...bundle} />;
    case 'PomodoroWidget2x2':
      return <PomodoroWidget2x2 {...bundle} />;
    case 'PomodoroWidgetTomato2x2':
      return <PomodoroWidgetTomato2x2 {...bundle} />;
    case 'PomodoroWidgetDark2x2':
      return <PomodoroWidgetDark2x2 {...bundle} />;
    case 'PomodoroWidgetStats2x2':
      return <PomodoroWidgetStats2x2 {...bundle} />;
    case 'TravelWidget4x2':
      return <TravelWidget4x2 {...bundle} />;
    case 'TravelWidget4x1':
      return <TravelWidget4x1 {...bundle} />;
    case 'TravelWidget2x2':
      return <TravelWidget2x2 {...bundle} />;
    case 'TravelWidgetWeek4x1':
      return <TravelWidgetWeek4x1 {...bundle} />;
    case 'TravelWidgetMap2x2':
      return <TravelWidgetMap2x2 {...bundle} />;
    case 'TravelWidgetHeat2x2':
      return <TravelWidgetHeat2x2 {...bundle} />;
    case 'TimeFlowWidget':
      return <LegacyUpgradeCard {...bundle} />;
    default:
      return null;
  }
}

async function buildBundleFor(name) {
  const group = widgetGroup(name);
  if (group === 'pomodoro') return buildFocusData();
  if (group === 'travel') return buildTravelData();
  return buildLegacyData();
}

// 刷新指定组件（顺序执行；桌面未添加的组件 widgetNotFound 静默跳过）。
export async function refreshWidgets(names) {
  for (const name of names || []) {
    try {
      await requestWidgetUpdate({
        widgetName: name,
        renderWidget: async () => widgetJsx(name, await buildBundleFor(name)),
        widgetNotFound: () => {
          /* 桌面没加该 widget 时静默 */
        },
      });
    } catch (e) {
      /* 单个失败不阻塞其余组件与主流程 */
    }
  }
}

export const refreshPomodoroWidgets = () => refreshWidgets(POMODORO_WIDGETS);
export const refreshTravelWidgets = () => refreshWidgets(TRAVEL_WIDGETS);
export const refreshAllWidgets = () => refreshWidgets([...POMODORO_WIDGETS, ...TRAVEL_WIDGETS, ...LEGACY_WIDGETS]);

// 兼容旧调用点（HomeScreen/ProfileScreen 现存的 refreshWidget()）：全部刷新。
// 旧 TimeFlowWidget 过渡卡虽是静态文案，但语言/主题变化后也需要重渲染，故包含在内。
export const refreshWidget = refreshAllWidgets;
