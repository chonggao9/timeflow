// 小组件矢量图形生成器：输出 SVG 字符串，交给库的 SvgWidget（原生渲染）+ 纯函数、可 node 测试。
// 组件内不用 emoji（prompt 硬性要求），图标/圆环/番茄全矢量。
// 阶段 3 的足迹地图折线（mapPolylineSvg）与打卡热力格（heatGridSvg）届时在本文件追加。

const TAU = Math.PI * 2;
const round = (n) => Math.round(n * 100) / 100;

// 进度圆环：progress 0~1，从 12 点方向顺时针。透明底，叠在任何背景上。
export function ringSvg({ size = 96, progress = 0, track = '#F3E6DA', color = '#EE5A4F', width = 10 } = {}) {
  const p = Math.max(0, Math.min(1, progress));
  const r = (size - width) / 2;
  const c = round(TAU * r);
  const dash = round(c * p);
  const cx = size / 2;
  // progress=0 时不画进度弧：stroke-linecap="round" 的零长虚线在部分渲染器会留下圆点
  const arc =
    dash > 0
      ? `<circle cx="${cx}" cy="${cx}" r="${round(r)}" fill="none" stroke="${color}" stroke-width="${width}" ` +
        `stroke-linecap="round" stroke-dasharray="${dash} ${c}" transform="rotate(-90 ${cx} ${cx})"/>`
      : '';
  return (
    `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">` +
    `<circle cx="${cx}" cy="${cx}" r="${round(r)}" fill="none" stroke="${track}" stroke-width="${width}"/>` +
    arc +
    `</svg>`
  );
}

// 番茄图标（静态；设计稿的灌满动画不实现）。progress 可选：>0 时以 clip 矩形表现灌满程度。
export function tomatoSvg({ size = 24, color = '#EE5A4F', leaf = '#2DB37C', progress = null } = {}) {
  const body = `<circle cx="12" cy="13.5" r="8.5" fill="${color}"/>`;
  const leaves =
    `<path d="M12 5.2c-1.6-1.7-3.7-2.3-5.4-2 .3 1.9 1.6 3.6 3.5 4.3M12 5.2c1.6-1.7 3.7-2.3 5.4-2-.3 1.9-1.6 3.6-3.5 4.3" ` +
    `fill="none" stroke="${leaf}" stroke-width="1.6" stroke-linecap="round"/>` +
    `<rect x="11.3" y="2.6" width="1.4" height="3" rx=".7" fill="${leaf}"/>`;
  let inner = body;
  if (progress != null) {
    const p = Math.max(0, Math.min(1, progress));
    const y = round(22 - 19 * p); // 灌满高度：从底部 22 到顶部 3
    inner =
      `<circle cx="12" cy="13.5" r="8.5" fill="none" stroke="${color}" stroke-width="1.4" opacity=".45"/>` +
      `<clipPath id="tf-tomato-fill"><rect x="0" y="${y}" width="24" height="24"/></clipPath>` +
      `<circle cx="12" cy="13.5" r="8.5" fill="${color}" clip-path="url(#tf-tomato-fill)"/>`;
  }
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24">${inner}${leaves}</svg>`;
}

// 24×24 material 风格图标路径表
const ICON_PATHS = {
  play: 'M8 5v14l11-7z',
  pause: 'M6 5h4v14H6zM14 5h4v14h-4z',
  reset:
    'M17.65 6.35A7.95 7.95 0 0 0 12 4a8 8 0 1 0 8 8h-2a6 6 0 1 1-6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z',
  check: 'M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z',
  bolt: 'M7 2v11h3v9l7-12h-4l4-8z',
  pin: 'M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z',
  flag: 'M14.4 6L14 4H5v17h2v-7h5.6l.4 2h7V6z',
};

export function iconSvg(name, { size = 24, color = '#2A211B' } = {}) {
  const d = ICON_PATHS[name];
  if (!d) return '';
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24"><path d="${d}" fill="${color}"/></svg>`;
}

export const ICON_NAMES = Object.keys(ICON_PATHS);
