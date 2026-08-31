// 桌面小组件的 JSX 视图（用 react-native-android-widget 的 RN 组件）。
// 纯展示，不含任何副作用；数据与配色由调用方（widgetTaskHandler）提前算好传入。
// 布局：上=今日状态（是否已打卡 + 最新一次时间 + 上次地点），下=打卡按钮。
import { FlexWidget, TextWidget } from 'react-native-android-widget';

// 打卡按钮在 widget 里的样式：主色圆角块。点击走 clickAction='checkIn' → 回调到 task handler。
export function TimeFlowWidget({ data, colors, strings }) {
  const bg = colors.bg;
  const ink = colors.ink;
  const ink2 = colors.ink2;
  const primary = colors.primary;

  // 是否已打卡：取最新一条，无则 today=0
  const maybeLatest = data.today && data.today.length ? data.today[data.today.length - 1] : null;
  const count = data.today ? data.today.length : 0;
  const place = maybeLatest
    ? (maybeLatest.locationName && maybeLatest.locationName !== strings.unnamed
        ? maybeLatest.locationName
        : strings.placeEmpty)
    : strings.placeEmpty;
  const latestTime = maybeLatest ? data.fmt(maybeLatest.timestamp) : null;

  return (
    <FlexWidget
      style={{
        height: 'match_parent',
        width: 'match_parent',
        backgroundColor: bg,
        borderRadius: 24,
        flexDirection: 'column',
        padding: 18,
        justifyContent: 'space-between',
      }}
    >
      {/* 上：品牌标题 + 今日状态 */}
      <FlexWidget style={{ flexDirection: 'column', flex: 1 }}>
        <TextWidget text={strings.title} style={{ fontSize: 13, fontWeight: '700', color: primary }} />
        <FlexWidget style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8 }}>
          <TextWidget
            text={count > 0 ? strings.checkedIn : strings.notYet}
            style={{ fontSize: 16, fontWeight: '700', color: ink }}
          />
          <TextWidget
            text={strings.count.replace('${n}', String(count))}
            style={{ fontSize: 12, color: ink2, marginLeft: 8 }}
          />
        </FlexWidget>
        <FlexWidget style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
          <TextWidget
            text={strings.latest + (latestTime ? ' ' + strings.at.replace('${t}', latestTime) : '')}
            style={{ fontSize: 12, color: ink2 }}
          />
        </FlexWidget>
        <TextWidget
          text={place}
          style={{ fontSize: 12, color: ink2, marginTop: 2 }}
          maxLines={1}
          truncate="END"
        />
      </FlexWidget>

      {/* 下：打卡按钮 */}
      <FlexWidget
        clickAction="checkIn"
        style={{
          height: 44,
          backgroundColor: primary,
          borderRadius: 22,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <TextWidget text={strings.checkinBtn} style={{ fontSize: 15, fontWeight: '800', color: '#FFFFFF' }} />
      </FlexWidget>
    </FlexWidget>
  );
}
