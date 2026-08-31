// widget 展示数据的单一构建来源：headless task handler 与 App 内主动刷新（requestWidgetUpdate）共用。
// 避免两处各自实现「读今日记录 + 语言/主题 → 参数包」导致漂移。
import { getTodayRecords } from '../src/storage/store';
import { getWidgetLang, getWidgetTheme, makeStrings, fmtTime } from './widgetStrings';

// 读 widget 展示所需的数据与文案/配色，统一打包给 Widget 组件。
export async function buildRenderData() {
  const [today, lang] = await Promise.all([getTodayRecords(), getWidgetLang()]);
  const { isDark, colors } = await getWidgetTheme();
  const strings = makeStrings(lang);
  return { data: { today, fmt: fmtTime }, colors, strings };
}
