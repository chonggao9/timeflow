'use no memo';
// 行程打卡组件 V2（设计稿「行程打卡」节，足迹模式——已决策取消计划站点）：
// 时间轴 = 今日已打卡记录，最新一条为「当前」，无「未到」站、无「4 站完成」态。
// 打卡走 src/services/quickCheckIn.js（与 App 首页「一键打卡」同一函数，headless 安全）。
import { FlexWidget, TextWidget, SvgWidget } from 'react-native-android-widget';
import { iconSvg, weekCirclesSvg, mapPolylineSvg, heatGridSvg } from '../svg';
import { RADIUS_WIDGET, tripPalette } from '../widgetTheme';

export const TRAVEL_DEEP_LINK = 'timeflow://checkin';

// 84dp 圆形打卡按钮（设计稿为渐变，组件端用纯色 #17805A：白字对比度 4.92:1 达标）
function CtaCircle({ strings, pal, size = 84 }) {
  return (
    <FlexWidget
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: pal.btn,
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <SvgWidget
        svg={iconSvg('pin', { size: 24, color: pal.btnText })}
        style={{ width: 24, height: 24 }}
      />
      <TextWidget
        text={strings.checkinWord}
        style={{ fontSize: 15, fontWeight: '700', color: pal.btnText, marginTop: 4 }}
      />
    </FlexWidget>
  );
}

// 时间轴单行：左（站点圆点 + 连接线段）+ 地名 + 时刻。last 行不画连接线。
function TimelineRow({ row, strings, pal, last }) {
  return (
    <FlexWidget style={{ height: 22, flexDirection: 'row', alignItems: 'center', width: 'match_parent' }}>
      <FlexWidget style={{ width: 14, height: 22, flexDirection: 'column', alignItems: 'center' }}>
        {row.cur ? (
          <FlexWidget
            style={{
              width: 14,
              height: 14,
              borderRadius: 7,
              backgroundColor: pal.bg,
              borderWidth: 2,
              borderColor: pal.accent,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <FlexWidget style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: pal.accent }} />
          </FlexWidget>
        ) : (
          <FlexWidget
            style={{
              width: 14,
              height: 14,
              borderRadius: 7,
              backgroundColor: pal.accent,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <SvgWidget
              svg={iconSvg('check', { size: 8, color: pal.bg })}
              style={{ width: 8, height: 8 }}
            />
          </FlexWidget>
        )}
        {!last && <FlexWidget style={{ width: 2, flex: 1, backgroundColor: pal.accent }} />}
      </FlexWidget>
      <FlexWidget style={{ flex: 1, flexDirection: 'row', alignItems: 'center', marginLeft: 8 }}>
        <TextWidget
          text={row.name}
          maxLines={1}
          truncate="END"
          style={{
            fontSize: 12,
            fontWeight: row.cur ? '700' : '500',
            color: row.cur ? pal.textPrimary : pal.textSecondary,
          }}
        />
      </FlexWidget>
      <TextWidget
        text={row.time}
        style={{ fontSize: 11, fontWeight: '700', color: pal.chipText }}
      />
    </FlexWidget>
  );
}

// 4×2 今日行程：左（打卡独立区）+ 右（时间轴独立打开 App 区），杜绝点击嵌套；高度核算 <= 110dp
export function TravelWidget4x2({ timeline, strings, pal }) {
  const capMain = timeline.empty ? strings.todayTrip : timeline.latestName;
  const capSub = timeline.empty
    ? strings.emptyCtaSub
    : strings.justChecked.replace('{t}', timeline.latestTime);
  const rows = (timeline.rows || []).slice(-3); // 最多保留 3 行足迹，确保 110dp 纵向不裁切

  return (
    <FlexWidget
      style={{
        height: 'match_parent',
        width: 'match_parent',
        backgroundColor: pal.bg,
        borderRadius: RADIUS_WIDGET,
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 10,
        paddingHorizontal: 12,
      }}
    >
      {/* 左列：独立打卡动作区（checkIn，与右列完全隔离） */}
      <FlexWidget
        clickAction="checkIn"
        style={{ width: 88, flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}
      >
        <CtaCircle strings={strings} pal={pal} size={58} />
        <FlexWidget style={{ width: 88, flexDirection: 'column', alignItems: 'center', marginTop: 4 }}>
          <TextWidget
            text={capMain}
            maxLines={1}
            truncate="END"
            style={{ fontSize: 12, fontWeight: '700', color: pal.textPrimary, width: 88, textAlign: 'center' }}
          />
          <TextWidget
            text={capSub}
            maxLines={1}
            truncate="END"
            style={{ fontSize: 10, color: pal.textSecondary, marginTop: 1, width: 88, textAlign: 'center' }}
          />
        </FlexWidget>
      </FlexWidget>

      {/* 右列：独立打开 App 详情区（OPEN_URI，不与打卡重叠） */}
      <FlexWidget
        clickAction="OPEN_URI"
        clickActionData={{ uri: TRAVEL_DEEP_LINK }}
        style={{ flex: 1, flexDirection: 'column', marginLeft: 12, justifyContent: 'center' }}
      >
        <FlexWidget
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: 'match_parent' }}
        >
          <TextWidget text={strings.todayTrip} style={{ fontSize: 13, fontWeight: '700', color: pal.textPrimary }} />
          <TextWidget
            text={timeline.empty ? timeline.weekday : `${timeline.countText} · ${timeline.weekday}`}
            style={{ fontSize: 11, color: pal.textSecondary }}
          />
        </FlexWidget>
        {timeline.empty ? (
          <FlexWidget
            style={{ height: 66, width: 'match_parent', alignItems: 'center', justifyContent: 'center' }}
          >
            <TextWidget
              text={strings.emptyTimeline}
              style={{ fontSize: 12, fontWeight: '500', color: pal.textSecondary }}
            />
          </FlexWidget>
        ) : (
          <FlexWidget style={{ flexDirection: 'column', marginTop: 4 }}>
            {rows.map((row, i) => (
              <TimelineRow
                key={`${row.time}-${i}`}
                row={row}
                strings={strings}
                pal={pal}
                last={i === rows.length - 1}
              />
            ))}
          </FlexWidget>
        )}
      </FlexWidget>
    </FlexWidget>
  );
}

// 2×2 一键打卡：整卡可点（盲操友好），紧凑布局 <= 110dp
export function TravelWidget2x2({ timeline, strings, pal }) {
  const main = timeline.empty ? strings.emptyTimeline : timeline.latestName;
  const sub = timeline.empty
    ? strings.emptyCtaSub
    : strings.justChecked.replace('{t}', timeline.latestTime);
  return (
    <FlexWidget
      clickAction="checkIn"
      style={{
        height: 'match_parent',
        width: 'match_parent',
        backgroundColor: pal.bg,
        borderRadius: RADIUS_WIDGET,
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 12,
        paddingHorizontal: 8,
      }}
    >
      <CtaCircle strings={strings} pal={pal} size={54} />
      <FlexWidget style={{ flexDirection: 'column', alignItems: 'center', marginTop: 6, width: 'match_parent' }}>
        <TextWidget
          text={main}
          maxLines={1}
          truncate="END"
          style={{ fontSize: 13, fontWeight: '700', color: pal.textPrimary, textAlign: 'center' }}
        />
        <TextWidget
          text={sub}
          maxLines={1}
          truncate="END"
          style={{ fontSize: 11, color: pal.textSecondary, marginTop: 2, textAlign: 'center' }}
        />
      </FlexWidget>
    </FlexWidget>
  );
}

// 旧 TimeFlowWidget 过渡卡（保留一个版本）：提示重新添加新组件，点击跳 App 说明入口。
// 下下版本删除 app.json 条目后，桌面旧组件显示系统占位，不崩溃。
export function LegacyUpgradeCard({ strings, pal }) {
  return (
    <FlexWidget
      clickAction="OPEN_URI"
      clickActionData={{ uri: 'timeflow://widgets' }}
      style={{
        height: 'match_parent',
        width: 'match_parent',
        backgroundColor: pal.bg,
        borderRadius: RADIUS_WIDGET,
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 18,
      }}
    >
      <TextWidget text={strings.title} style={{ fontSize: 13, fontWeight: '800', color: pal.textSecondary }} />
      <TextWidget
        text={strings.upgradedTitle}
        style={{ fontSize: 15, fontWeight: '700', color: pal.textPrimary, marginTop: 8 }}
      />
      <TextWidget
        text={strings.upgradedBody}
        maxLines={2}
        truncate="END"
        style={{ fontSize: 12, color: pal.textSecondary, marginTop: 4, textAlign: 'center' }}
      />
      <FlexWidget
        style={{
          height: 44,
          borderRadius: 22,
          backgroundColor: pal.textPrimary,
          paddingHorizontal: 18,
          alignItems: 'center',
          justifyContent: 'center',
          marginTop: 12,
        }}
      >
        <TextWidget
          text={strings.upgradedBtn}
          style={{ fontSize: 14, fontWeight: '700', color: pal.bg }}
        />
      </FlexWidget>
    </FlexWidget>
  );
}

// 4×1 下一站/快捷打卡：左（44dp 图标圈）+ 中（地名/状态文字）+ 右（44dp 胶囊打卡按钮）
export function TravelWidget4x1({ timeline, strings, pal }) {
  const main = timeline.empty ? strings.todayTrip : timeline.latestName;
  const sub = timeline.empty
    ? strings.emptyCtaSub
    : strings.justChecked.replace('{t}', timeline.latestTime);
  return (
    <FlexWidget
      clickAction="OPEN_URI"
      clickActionData={{ uri: TRAVEL_DEEP_LINK }}
      style={{
        height: 'match_parent',
        width: 'match_parent',
        backgroundColor: pal.bg,
        borderRadius: RADIUS_WIDGET,
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 18,
      }}
    >
      {/* 左侧：44dp 图标圈 */}
      <FlexWidget
        style={{
          width: 44,
          height: 44,
          borderRadius: 22,
          backgroundColor: pal.chipBg,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <SvgWidget
          svg={iconSvg('pin', { size: 22, color: pal.accent })}
          style={{ width: 22, height: 22 }}
        />
      </FlexWidget>

      {/* 中间：地名主标题 + 状态副标题 */}
      <FlexWidget
        style={{
          flex: 1,
          flexDirection: 'column',
          marginHorizontal: 12,
          justifyContent: 'center',
        }}
      >
        <TextWidget
          text={main}
          maxLines={1}
          truncate="END"
          style={{ fontSize: 15, fontWeight: '700', color: pal.textPrimary }}
        />
        <TextWidget
          text={sub}
          maxLines={1}
          truncate="END"
          style={{ fontSize: 12, color: pal.textSecondary, marginTop: 2 }}
        />
      </FlexWidget>

      {/* 右侧：44dp 胶囊打卡按钮 */}
      <FlexWidget
        clickAction="checkIn"
        style={{
          height: 44,
          minWidth: 70,
          paddingHorizontal: 18,
          borderRadius: 22,
          backgroundColor: pal.btn,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <TextWidget
          text={strings.checkinWord}
          style={{ fontSize: 14, fontWeight: '700', color: pal.btnText }}
        />
      </FlexWidget>
    </FlexWidget>
  );
}

// 4×1 本周连续打卡卡片：深色卡片，左（连续天数）+ 右（周一至周日状态点）
export function TravelWidgetWeek4x1({ streakDays = 0, weekDays = { days: [], active: [], todayIdx: 0 }, strings, darkPal }) {
  const pal = darkPal || tripPalette(true);
  return (
    <FlexWidget
      clickAction="OPEN_URI"
      clickActionData={{ uri: TRAVEL_DEEP_LINK }}
      style={{
        height: 'match_parent',
        width: 'match_parent',
        backgroundColor: pal.bg,
        borderRadius: RADIUS_WIDGET,
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 18,
      }}
    >
      {/* 左侧：连续天数 */}
      <FlexWidget style={{ width: 72, flexDirection: 'column', justifyContent: 'center' }}>
        <FlexWidget style={{ flexDirection: 'row', alignItems: 'baseline' }}>
          <TextWidget
            text={String(streakDays)}
            style={{ fontSize: 28, fontWeight: '700', color: pal.textPrimary }}
          />
          <TextWidget
            text={strings.dayUnit}
            style={{ fontSize: 12, fontWeight: '500', color: pal.textSecondary, marginLeft: 3 }}
          />
        </FlexWidget>
        <TextWidget
          text={strings.continuousCheckin}
          maxLines={1}
          style={{ fontSize: 11, color: pal.textSecondary, marginTop: 1 }}
        />
      </FlexWidget>

      {/* 右侧：7 天状态点 */}
      <FlexWidget style={{ flex: 1, alignItems: 'center', justifyContent: 'center', marginLeft: 8 }}>
        <SvgWidget
          svg={weekCirclesSvg({
            width: 210,
            height: 48,
            days: weekDays.days,
            active: weekDays.active,
            todayIdx: weekDays.todayIdx,
            todayWord: strings?.todayWord || '',
            accent: pal.accent,
            track: pal.track,
            textSecondary: pal.textSecondary,
          })}
          style={{ width: 210, height: 48 }}
        />
      </FlexWidget>
    </FlexWidget>
  );
}

// 2×2 足迹地图卡片：上（微缩地图路线）+ 下（打卡次数与今日足迹）
export function TravelWidgetMap2x2({ timeline, strings, pal, isDark }) {
  return (
    <FlexWidget
      clickAction="OPEN_URI"
      clickActionData={{ uri: TRAVEL_DEEP_LINK }}
      style={{
        height: 'match_parent',
        width: 'match_parent',
        backgroundColor: pal.bg,
        borderRadius: RADIUS_WIDGET,
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: 8,
      }}
    >
      {/* 上部微缩地图 */}
      <SvgWidget
        svg={mapPolylineSvg({
          width: 154,
          height: 108,
          count: timeline.count || 0,
          isDark,
        })}
        style={{ width: 154, height: 108 }}
      />

      {/* 底部信息 */}
      <FlexWidget
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 8,
          paddingBottom: 4,
          width: 'match_parent',
        }}
      >
        <TextWidget
          text={strings.checkedCount.replace('{n}', timeline.countText || strings.timesCount.replace('{n}', String(timeline.count || 0)))}
          style={{ fontSize: 12, fontWeight: '700', color: pal.textPrimary }}
        />
        <TextWidget
          text={strings.todayFootprint}
          style={{ fontSize: 11, color: pal.textSecondary }}
        />
      </FlexWidget>
    </FlexWidget>
  );
}

// 2×2 深色打卡热力卡片：连续天数大字 + 近四周 28 格热力图
export function TravelWidgetHeat2x2({ streakDays = 0, heatGrid = [], strings, darkPal }) {
  const pal = darkPal || tripPalette(true);
  return (
    <FlexWidget
      clickAction="OPEN_URI"
      clickActionData={{ uri: TRAVEL_DEEP_LINK }}
      style={{
        height: 'match_parent',
        width: 'match_parent',
        backgroundColor: pal.bg,
        borderRadius: RADIUS_WIDGET,
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: 16,
      }}
    >
      <FlexWidget style={{ flexDirection: 'column' }}>
        <TextWidget
          text={strings.continuousCheckin}
          style={{ fontSize: 12, fontWeight: '700', color: pal.textSecondary }}
        />
        <FlexWidget style={{ flexDirection: 'row', alignItems: 'baseline', marginTop: 2 }}>
          <TextWidget
            text={String(streakDays)}
            style={{ fontSize: 44, fontWeight: '700', color: pal.textPrimary }}
          />
          <TextWidget
            text={strings.dayUnit}
            style={{ fontSize: 13, fontWeight: '500', color: pal.textSecondary, marginLeft: 4 }}
          />
        </FlexWidget>
      </FlexWidget>

      {/* 近四周热力格 */}
      <SvgWidget
        svg={heatGridSvg({
          width: 138,
          height: 48,
          grid: heatGrid,
          isDark: true,
        })}
        style={{ width: 138, height: 48 }}
      />
    </FlexWidget>
  );
}

