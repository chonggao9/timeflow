// 桌面小组件的 JSX 视图（用 react-native-android-widget 的 RN 组件）。
// 方案 2：上下内嵌卡片式（In-Card Flow，规整严密、层次清晰、单手盲操更佳）
import { FlexWidget, TextWidget } from 'react-native-android-widget';

export function TimeFlowWidget({ data, colors, strings }) {
  const bg = colors.bg;
  const surface = colors.surface || '#FFFFFF';
  const ink = colors.ink;
  const ink2 = colors.ink2;
  const ink3 = colors.ink3 || '#B6A99E';
  const primary = colors.primary;
  const success = colors.success || '#4CAE7F';

  // 读取今日数据
  const todayList = data.today || [];
  const count = todayList.length;
  const maybeLatest = count > 0 ? todayList[count - 1] : null;

  const place = maybeLatest
    ? (maybeLatest.locationName && maybeLatest.locationName !== strings.unnamed
        ? maybeLatest.locationName
        : strings.placeEmpty)
    : null;
  const latestTime = maybeLatest ? data.fmt(maybeLatest.timestamp) : null;

  return (
    <FlexWidget
      style={{
        height: 'match_parent',
        width: 'match_parent',
        backgroundColor: bg,
        borderRadius: 22,
        flexDirection: 'column',
        padding: 14,
        justifyContent: 'space-between',
      }}
    >
      {/* 1. 顶部 Header：品牌 + 状态与次数徽标胶囊 */}
      <FlexWidget
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          width: 'match_parent',
          justifyContent: 'space-between',
        }}
      >
        {/* 左侧：品牌微徽标 */}
        <FlexWidget style={{ flexDirection: 'row', alignItems: 'center' }}>
          <TextWidget
            text="✦ "
            style={{ fontSize: 13, fontWeight: '700', color: primary }}
          />
          <TextWidget
            text={strings.title}
            style={{ fontSize: 14, fontWeight: '700', color: ink }}
          />
        </FlexWidget>

        {/* 右侧：状态指示器胶囊（白色/深色底小卡片包裹） */}
        <FlexWidget
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: surface,
            borderRadius: 12,
            paddingHorizontal: 8,
            paddingVertical: 3,
          }}
        >
          <TextWidget
            text={count > 0 ? '● ' : '○ '}
            style={{ fontSize: 10, color: count > 0 ? success : ink3 }}
          />
          <TextWidget
            text={count > 0 ? strings.checkedIn : strings.notYet}
            style={{ fontSize: 12, fontWeight: '700', color: ink }}
          />
          {count > 0 ? (
            <TextWidget
              text={` · ${strings.count.replace('${n}', String(count))}`}
              style={{ fontSize: 11, color: ink2 }}
            />
          ) : null}
        </FlexWidget>
      </FlexWidget>

      {/* 2. 中部：内嵌信息卡片（消除空间空洞的核心） */}
      <FlexWidget
        style={{
          width: 'match_parent',
          backgroundColor: surface,
          borderRadius: 14,
          paddingHorizontal: 12,
          paddingVertical: 8,
          flexDirection: 'column',
          justifyContent: 'center',
          marginVertical: 6,
          flex: 1,
        }}
      >
        {count > 0 ? (
          <FlexWidget style={{ flexDirection: 'column', width: 'match_parent' }}>
            {/* 卡片内首行：最近地点标签 + 最新时间 */}
            <FlexWidget
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                width: 'match_parent',
                marginBottom: 2,
              }}
            >
              <TextWidget
                text={`📍 ${strings.recentPlace}`}
                style={{ fontSize: 11, color: ink3, fontWeight: '600' }}
              />
              <TextWidget
                text={latestTime || ''}
                style={{ fontSize: 11, color: primary, fontWeight: '700' }}
              />
            </FlexWidget>

            {/* 卡片内次行：具体地点名称 */}
            <TextWidget
              text={place || strings.placeEmpty}
              style={{ fontSize: 13, fontWeight: '700', color: ink }}
              maxLines={1}
              truncate="END"
            />
          </FlexWidget>
        ) : (
          <FlexWidget style={{ flexDirection: 'column', width: 'match_parent', alignItems: 'center' }}>
            <TextWidget
              text={strings.emptyPrompt}
              style={{ fontSize: 12, fontWeight: '600', color: ink2 }}
            />
            <TextWidget
              text={strings.emptySub}
              style={{ fontSize: 10, color: ink3, marginTop: 2 }}
            />
          </FlexWidget>
        )}
      </FlexWidget>

      {/* 3. 底部：全宽横向舒展一键打卡按钮（盲操友好） */}
      <FlexWidget
        clickAction="checkIn"
        style={{
          width: 'match_parent',
          height: 42,
          backgroundColor: primary,
          borderRadius: 21,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <TextWidget
          text={strings.checkinBtn}
          style={{
            fontSize: 14,
            fontWeight: '800',
            color: '#FFFFFF',
          }}
        />
      </FlexWidget>
    </FlexWidget>
  );
}
