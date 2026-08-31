// App 内主动刷新桌面小组件：App 打卡/改名/删除后，立即让 widget 反映最新数据，
// 否则 widget 要等到 updatePeriodMillis（至少 30 分钟）自动刷新才更新。
// 复用 widget/widgetData.buildRenderData 这一份数据构建，避免与 headless 漂移；无 widget 时静默。
import { requestWidgetUpdate } from 'react-native-android-widget';
import { TimeFlowWidget } from '../../widget/Widget';
import { buildRenderData } from '../../widget/widgetData';

const WIDGET_NAME = 'TimeFlowWidget';

export async function refreshWidget() {
  try {
    await requestWidgetUpdate({
      widgetName: WIDGET_NAME,
      renderWidget: async () => {
        const { data, colors, strings } = await buildRenderData();
        return <TimeFlowWidget data={data} colors={colors} strings={strings} />;
      },
      widgetNotFound: () => {
        /* 桌面没加 widget 时静默：无需后台任务可清 */
      },
    });
  } catch (e) {
    /* 兼容性不明时静默，不阻塞打卡主流程 */
  }
}
