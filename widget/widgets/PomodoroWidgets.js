'use no memo';
// 番茄专注组件 V2（设计稿 docs/design/timeflow-widgets-v2-ui.html「番茄专注」节）。
// 退化显示决策：运行中只显示静态「hh:mm 结束」，不显示会变旧的剩余分钟；
// 重绘时机 = 用户点击 / 模式切换 / 30min 系统心跳（updatePeriodMillis），无秒级刷新。
// 图标全矢量（widget/svg.js），无 emoji；可点区域 ≥44dp；配色来自 widgetTheme（对比度已门禁）。
import { FlexWidget, TextWidget, SvgWidget } from 'react-native-android-widget';
import { ringCenterSvg, cycleDotsSvg, iconSvg, progressBarSvg, tomatoSvg, focusWeekBarsSvg } from '../svg';
import { RADIUS_WIDGET, modePalette } from '../widgetTheme';

export const FOCUS_DEEP_LINK = 'timeflow://focus';

// 圆环占比：运行中保持稳定激活满环（不画过时静态假进度，由 hh:mm 明确告知结束时刻）；
// 暂停时显示当前真实静止进度；待开始态为准备满环。
const remainFrac = (d) => {
  if (d.running) return 1;
  if (d.status === 'paused' && d.totalMs > 0) return Math.max(0, Math.min(1, d.remainingMs / d.totalMs));
  return 1;
};

function playLabel(d, strings) {
  if (d.running) return strings.play.pause;
  return d.status === 'paused' ? strings.play.resume : strings.play.start;
}

function bigText(d, strings) {
  if (d.running) return d.endsAtHHMM || '';
  return `${d.remainingCeilMin}${strings.minUnit}`;
}

// 中央圆环（时间 + 小标签/图标 合成一张 SVG，FlexWidget 无绝对定位无法叠加）
function Ring({ d, strings, pal, size, bigSize, second }) {
  return (
    <SvgWidget
      svg={ringCenterSvg({
        size,
        progress: remainFrac(d),
        track: pal.track,
        color: pal.accent,
        width: size >= 120 ? 9 : 8,
        big: { text: bigText(d, strings), size: bigSize, color: pal.textPrimary },
        ...(second === 'icon'
          ? { icon: { name: d.running ? 'pause' : 'play', size: 16, color: pal.btn } }
          : {
              small: {
                text: d.running ? strings.endWord : strings.mode[d.mode],
                size: 12,
                color: d.running ? pal.accent : pal.textSecondary,
              },
            }),
      })}
      style={{ width: size, height: size }}
    />
  );
}

// 4 番茄循环点 + 副文案
function SubRow({ d, strings, pal }) {
  const base = d.completedToday % 4;
  const sub =
    d.mode === 'focus'
      ? d.running
        ? strings.nthWithEnd.replace('{n}', String(d.completedToday + 1)).replace('{t}', d.endsAtHHMM || '')
        : strings.nthTomato.replace('{n}', String(d.completedToday + 1))
      : strings.restDone.replace('{n}', String(d.completedToday));
  return (
    <FlexWidget style={{ flexDirection: 'row', alignItems: 'center' }}>
      <SvgWidget
        svg={cycleDotsSvg({ done: base, cur: d.mode === 'focus', accent: pal.accent, track: pal.track })}
        style={{ width: 44, height: 8 }}
      />
      <TextWidget
        text={sub}
        maxLines={1}
        truncate="END"
        style={{ fontSize: 12, color: pal.textSecondary, marginLeft: 5 }}
      />
    </FlexWidget>
  );
}

function ModeChips({ d, strings, pal }) {
  const modes = ['focus', 'short', 'long'];
  return (
    <FlexWidget style={{ flexDirection: 'row', width: 'match_parent' }}>
      {modes.map((m, i) => {
        const on = d.mode === m;
        return (
          <FlexWidget
            key={m}
            clickAction={`mode.${m}`}
            style={{
              flex: 1,
              height: 24,
              borderRadius: 12,
              backgroundColor: on ? pal.chipBg : pal.btnSecondary,
              borderWidth: on ? 1.5 : 0,
              borderColor: pal.accent,
              alignItems: 'center',
              justifyContent: 'center',
              marginLeft: i === 0 ? 0 : 4,
            }}
          >
            <TextWidget
              text={strings.mode[m]}
              style={{ fontSize: 11, fontWeight: '700', color: on ? pal.chipText : pal.textSecondary }}
            />
          </FlexWidget>
        );
      })}
    </FlexWidget>
  );
}

function PlayButton({ d, strings, pal }) {
  return (
    <FlexWidget
      clickAction="pomo.toggle"
      style={{
        height: 32,
        borderRadius: 16,
        backgroundColor: pal.btn,
        flexDirection: 'row',
        alignItems: 'center',
        paddingLeft: 10,
        paddingRight: 14,
      }}
    >
      <SvgWidget
        svg={iconSvg(d.running ? 'pause' : 'play', { size: 14, color: pal.btnText })}
        style={{ width: 14, height: 14 }}
      />
      <TextWidget
        text={playLabel(d, strings)}
        style={{ fontSize: 12, fontWeight: '700', color: pal.btnText, marginLeft: 4 }}
      />
    </FlexWidget>
  );
}

// 4×2 完整版：左圆环 + 右（模式 chips / 标题 / 循环点 / 开始·重置），紧凑布局 <= 110dp
export function PomodoroWidget4x2({ d, strings, pal }) {
  return (
    <FlexWidget
      clickAction="OPEN_URI"
      clickActionData={{ uri: FOCUS_DEEP_LINK }}
      style={{
        height: 'match_parent',
        width: 'match_parent',
        backgroundColor: pal.bg,
        borderRadius: RADIUS_WIDGET,
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 8,
        paddingHorizontal: 12,
      }}
    >
      <Ring d={d} strings={strings} pal={pal} size={90} bigSize={22} second="label" />
      <FlexWidget style={{ flex: 1, flexDirection: 'column', marginLeft: 12, justifyContent: 'center' }}>
        <ModeChips d={d} strings={strings} pal={pal} />
        <TextWidget
          text={strings.pomoTitle[d.mode]}
          maxLines={1}
          truncate="END"
          style={{ fontSize: 13, fontWeight: '700', color: pal.textPrimary, marginTop: 4 }}
        />
        <FlexWidget style={{ marginTop: 2 }}>
          <SubRow d={d} strings={strings} pal={pal} />
        </FlexWidget>
        <FlexWidget style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
          <PlayButton d={d} strings={strings} pal={pal} />
          <FlexWidget
            clickAction="pomo.reset"
            style={{
              width: 32,
              height: 32,
              borderRadius: 16,
              backgroundColor: pal.btnSecondary,
              alignItems: 'center',
              justifyContent: 'center',
              marginLeft: 6,
            }}
          >
            <SvgWidget
              svg={iconSvg('reset', { size: 16, color: pal.textSecondary })}
              style={{ width: 16, height: 16 }}
            />
          </FlexWidget>
        </FlexWidget>
      </FlexWidget>
    </FlexWidget>
  );
}

// 2×2 圆环版：整卡点击 = 开始/暂停（盲操友好），紧凑布局 <= 110dp
export function PomodoroWidget2x2({ d, strings, pal }) {
  return (
    <FlexWidget
      clickAction="pomo.toggle"
      style={{
        height: 'match_parent',
        width: 'match_parent',
        backgroundColor: pal.bg,
        borderRadius: RADIUS_WIDGET,
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 8,
        paddingHorizontal: 8,
      }}
    >
      <Ring d={d} strings={strings} pal={pal} size={70} bigSize={18} second="icon" />
      <FlexWidget
        style={{
          backgroundColor: pal.chipBg,
          borderRadius: 10,
          paddingHorizontal: 8,
          paddingVertical: 2,
          marginTop: 6,
        }}
      >
        <TextWidget
          text={
            d.running && d.endsAtHHMM
              ? `${strings.mode[d.mode]} · ${strings.endsAt.replace('{t}', d.endsAtHHMM)}`
              : `${strings.mode[d.mode]} · ${strings.status[d.status]}`
          }
          maxLines={1}
          style={{ fontSize: 11, fontWeight: '700', color: pal.chipText }}
        />
      </FlexWidget>
    </FlexWidget>
  );
}

// 4×1 迷你条：左（时间 + 模式·状态）+ 中（水平胶囊进度条）+ 右（44dp 播放/暂停圆形按钮）
export function PomodoroWidget4x1({ d, strings, pal }) {
  return (
    <FlexWidget
      clickAction="OPEN_URI"
      clickActionData={{ uri: FOCUS_DEEP_LINK }}
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
      {/* 左侧：时间与状态 */}
      <FlexWidget style={{ width: 80, flexDirection: 'column', justifyContent: 'center' }}>
        <TextWidget
          text={bigText(d, strings)}
          maxLines={1}
          style={{ fontSize: 22, fontWeight: '700', color: pal.textPrimary }}
        />
        <TextWidget
          text={`${strings.mode[d.mode]} · ${strings.status[d.status]}`}
          maxLines={1}
          truncate="END"
          style={{ fontSize: 11, fontWeight: '700', color: pal.chipText, marginTop: 2 }}
        />
      </FlexWidget>

      {/* 中间：水平进度条 */}
      <FlexWidget
        style={{
          flex: 1,
          marginHorizontal: 12,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <SvgWidget
          svg={progressBarSvg({
            width: 140,
            height: 8,
            progress: remainFrac(d),
            track: pal.track,
            color: pal.accent,
          })}
          style={{ width: 140, height: 8 }}
        />
      </FlexWidget>

      {/* 右侧：44dp 圆形按钮，开始/暂停 */}
      <FlexWidget
        clickAction="pomo.toggle"
        style={{
          width: 44,
          height: 44,
          borderRadius: 22,
          backgroundColor: pal.btn,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <SvgWidget
          svg={iconSvg(d.running ? 'pause' : 'play', { size: 20, color: pal.btnText })}
          style={{ width: 20, height: 20 }}
        />
      </FlexWidget>
    </FlexWidget>
  );
}

// 2×2 番茄外观卡：上（第 N 个番茄 / 休息）+ 中（番茄图形）+ 下（大字剩余时间）
export function PomodoroWidgetTomato2x2({ d, strings, pal }) {
  const topText =
    d.mode === 'focus'
      ? strings.nthTomato.replace('{n}', String((d.completedToday || 0) + 1))
      : strings.restTime;
  return (
    <FlexWidget
      clickAction="pomo.toggle"
      style={{
        height: 'match_parent',
        width: 'match_parent',
        backgroundColor: pal.bg,
        borderRadius: RADIUS_WIDGET,
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 14,
        paddingHorizontal: 8,
      }}
    >
      <TextWidget
        text={topText}
        maxLines={1}
        style={{ fontSize: 12, fontWeight: '700', color: pal.textSecondary }}
      />
      <SvgWidget
        svg={tomatoSvg({
          size: 76,
          color: pal.accent,
          progress: remainFrac(d),
        })}
        style={{ width: 76, height: 76 }}
      />
      <TextWidget
        text={bigText(d, strings)}
        maxLines={1}
        style={{ fontSize: 26, fontWeight: '700', color: pal.textPrimary }}
      />
    </FlexWidget>
  );
}

// 2×2 深色大数字卡：高对比 OLED 深色，上（模式与状态）+ 中（超大数字）+ 下（4番茄循环点 + 44dp按钮）
export function PomodoroWidgetDark2x2({ d, strings, darkPal }) {
  const pal = darkPal || modePalette(d.mode, true);
  return (
    <FlexWidget
      clickAction="OPEN_URI"
      clickActionData={{ uri: FOCUS_DEEP_LINK }}
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
      {/* 顶部标签 */}
      <FlexWidget style={{ flexDirection: 'row', alignItems: 'center' }}>
        <FlexWidget style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: pal.accent }} />
        <TextWidget
          text={`${strings.mode[d.mode]} · ${strings.status[d.status]}`}
          maxLines={1}
          style={{ fontSize: 12, fontWeight: '700', color: pal.textSecondary, marginLeft: 6 }}
        />
      </FlexWidget>

      {/* 中部超大数字 */}
      <TextWidget
        text={bigText(d, strings)}
        maxLines={1}
        style={{ fontSize: 40, fontWeight: '700', color: pal.textPrimary, alignSelf: 'center' }}
      />

      {/* 底部：循环点 + 启停按钮 */}
      <FlexWidget style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: 'match_parent' }}>
        <SvgWidget
          svg={cycleDotsSvg({
            done: (d.completedToday || 0) % 4,
            cur: d.mode === 'focus',
            accent: pal.accent,
            track: pal.track,
          })}
          style={{ width: 44, height: 8 }}
        />
        <FlexWidget
          clickAction="pomo.toggle"
          style={{
            width: 44,
            height: 44,
            borderRadius: 22,
            backgroundColor: pal.btn,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <SvgWidget
            svg={iconSvg(d.running ? 'pause' : 'play', { size: 18, color: pal.btnText })}
            style={{ width: 18, height: 18 }}
          />
        </FlexWidget>
      </FlexWidget>
    </FlexWidget>
  );
}

// 2×2 今日专注统计卡：今日专注分钟数 + 7 天柱状图
export function PomodoroWidgetStats2x2({ strings, pal, todayMin = 0, weekBars = { days: [], values: [] } }) {
  return (
    <FlexWidget
      clickAction="OPEN_URI"
      clickActionData={{ uri: FOCUS_DEEP_LINK }}
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
          text={strings.todayFocus}
          style={{ fontSize: 12, fontWeight: '700', color: pal.textSecondary }}
        />
        <FlexWidget style={{ flexDirection: 'row', alignItems: 'flex-end', marginTop: 2 }}>
          <TextWidget
            text={String(todayMin)}
            style={{ fontSize: 34, fontWeight: '700', color: pal.textPrimary }}
          />
          <TextWidget
            text={strings.minuteUnit}
            style={{ fontSize: 12, fontWeight: '500', color: pal.textSecondary, marginLeft: 4, marginBottom: 4 }}
          />
        </FlexWidget>
      </FlexWidget>

      {/* 7 天柱状图 */}
      <SvgWidget
        svg={focusWeekBarsSvg({
          days: weekBars.days,
          values: weekBars.values,
          accent: pal.accent,
          track: pal.track,
          activeText: pal.chipText,
          subText: pal.textSecondary,
        })}
        style={{ width: 136, height: 54 }}
      />
    </FlexWidget>
  );
}

