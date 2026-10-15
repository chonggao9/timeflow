// 番茄专注组件 V2（设计稿 docs/design/timeflow-widgets-v2-ui.html「番茄专注」节）。
// 退化显示决策：运行中只显示静态「hh:mm 结束」，不显示会变旧的剩余分钟；
// 重绘时机 = 用户点击 / 模式切换 / 30min 系统心跳（updatePeriodMillis），无秒级刷新。
// 图标全矢量（widget/svg.js），无 emoji；可点区域 ≥44dp；配色来自 widgetTheme（对比度已门禁）。
import { FlexWidget, TextWidget, SvgWidget } from 'react-native-android-widget';
import { ringCenterSvg, cycleDotsSvg, iconSvg } from '../svg';
import { RADIUS_WIDGET } from '../widgetTheme';

export const FOCUS_DEEP_LINK = 'timeflow://focus';

// 剩余占比（设计稿圆环随剩余时间收缩）
const remainFrac = (d) => (d.totalMs > 0 ? Math.max(0, Math.min(1, d.remainingMs / d.totalMs)) : 0);

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
              height: 32,
              borderRadius: 16,
              backgroundColor: on ? pal.chipBg : pal.btnSecondary,
              borderWidth: on ? 1.5 : 0,
              borderColor: pal.accent,
              alignItems: 'center',
              justifyContent: 'center',
              marginLeft: i === 0 ? 0 : 6,
            }}
          >
            <TextWidget
              text={strings.mode[m]}
              style={{ fontSize: 12, fontWeight: '700', color: on ? pal.chipText : pal.textSecondary }}
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
        height: 44,
        borderRadius: 22,
        backgroundColor: pal.btn,
        flexDirection: 'row',
        alignItems: 'center',
        paddingLeft: 14,
        paddingRight: 18,
      }}
    >
      <SvgWidget
        svg={iconSvg(d.running ? 'pause' : 'play', { size: 18, color: pal.btnText })}
        style={{ width: 18, height: 18 }}
      />
      <TextWidget
        text={playLabel(d, strings)}
        style={{ fontSize: 14, fontWeight: '700', color: pal.btnText, marginLeft: 6 }}
      />
    </FlexWidget>
  );
}

// 4×2 完整版：左圆环 + 右（模式 chips / 标题 / 循环点 / 开始·重置）
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
        padding: 18,
      }}
    >
      <Ring d={d} strings={strings} pal={pal} size={120} bigSize={29} second="label" />
      <FlexWidget style={{ flex: 1, flexDirection: 'column', marginLeft: 16 }}>
        <ModeChips d={d} strings={strings} pal={pal} />
        <TextWidget
          text={strings.pomoTitle[d.mode]}
          maxLines={1}
          truncate="END"
          style={{ fontSize: 15, fontWeight: '700', color: pal.textPrimary, marginTop: 7 }}
        />
        <FlexWidget style={{ marginTop: 3 }}>
          <SubRow d={d} strings={strings} pal={pal} />
        </FlexWidget>
        <FlexWidget style={{ flexDirection: 'row', alignItems: 'center', marginTop: 7 }}>
          <PlayButton d={d} strings={strings} pal={pal} />
          <FlexWidget
            clickAction="pomo.reset"
            style={{
              width: 44,
              height: 44,
              borderRadius: 22,
              backgroundColor: pal.btnSecondary,
              alignItems: 'center',
              justifyContent: 'center',
              marginLeft: 8,
            }}
          >
            <SvgWidget
              svg={iconSvg('reset', { size: 20, color: pal.textSecondary })}
              style={{ width: 20, height: 20 }}
            />
          </FlexWidget>
        </FlexWidget>
      </FlexWidget>
    </FlexWidget>
  );
}

// 2×2 圆环版：整卡点击 = 开始/暂停（盲操友好）
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
        paddingVertical: 14,
      }}
    >
      <Ring d={d} strings={strings} pal={pal} size={112} bigSize={26} second="icon" />
      <FlexWidget
        style={{
          backgroundColor: pal.chipBg,
          borderRadius: 12,
          paddingHorizontal: 12,
          paddingVertical: 4,
          marginTop: 10,
        }}
      >
        <TextWidget
          text={`${strings.mode[d.mode]} · ${strings.status[d.status]}`}
          maxLines={1}
          style={{ fontSize: 12, fontWeight: '700', color: pal.chipText }}
        />
      </FlexWidget>
    </FlexWidget>
  );
}
