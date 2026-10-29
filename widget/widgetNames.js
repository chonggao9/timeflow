// 桌面小组件名常量表：app.json plugin 条目、taskHandler 路由、refreshWidgets 三处共用，防漂移。
// name 即 prebuild 生成的 provider 类名（headless 回调里 widgetInfo.widgetName 与之相等）。
// 阶段 2/3 新增尺寸时在此登记（refreshWidgets 对未添加到桌面的名字静默，安全）。

// 番茄专注组（保留 2 款核心尺寸）
export const POMODORO_WIDGETS = [
  'PomodoroWidget4x2',
  'PomodoroWidget2x2',
];

// 行程打卡组（保留 2 款核心尺寸）
export const TRAVEL_WIDGETS = [
  'TravelWidget4x2',
  'TravelWidget2x2',
];

// 被合并/废弃的旧组件（过渡期保留 provider 声明，渲染「已合并」卡片，下个版本彻底移除）
export const LEGACY_WIDGETS = [
  'TimeFlowWidget',
  'PomodoroWidgetTomato2x2',
  'PomodoroWidgetDark2x2',
  'PomodoroWidget4x1',
  'PomodoroWidgetStats2x2',
  'TravelWidget4x1',
  'TravelWidgetWeek4x1',
  'TravelWidgetMap2x2',
  'TravelWidgetHeat2x2',
];

export const ALL_WIDGETS = [...POMODORO_WIDGETS, ...TRAVEL_WIDGETS, ...LEGACY_WIDGETS];

export function widgetGroup(name) {
  if (POMODORO_WIDGETS.includes(name)) return 'pomodoro';
  if (TRAVEL_WIDGETS.includes(name)) return 'travel';
  if (LEGACY_WIDGETS.includes(name)) return 'legacy';
  return null;
}
