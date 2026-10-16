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

// 圆环 + 中心内容（大数字/小标签/图标）合成为一张 SVG：
// 库的 FlexWidget 是 LinearLayout，无绝对定位，无法把 TextWidget 叠在 SvgWidget 上，
// 故中心文字用 androidsvg 的 <text>（原生渲染，设备字体）。
// big/small/icon 三段：big 必选；small 与 icon 二选一（第二行）。
export function ringCenterSvg({
  size = 120,
  progress = 0,
  track = '#F3E6DA',
  color = '#EE5A4F',
  width = 9,
  big = { text: '', size: 29, color: '#2A211B' },
  small = null, // {text,size,color}
  icon = null, // {name,size,color}
} = {}) {
  const cx = size / 2;
  const base = ringSvg({ size, progress, track, color, width });
  const inner = base.slice(0, base.lastIndexOf('</svg>')); // 去掉收尾，追加内容
  const bigY = small || icon ? cx + 2 : cx + big.size * 0.35;
  let content =
    `<text x="${cx}" y="${round(bigY)}" text-anchor="middle" font-size="${big.size}" ` +
    `font-weight="bold" fill="${big.color}">${escapeXml(big.text)}</text>`;
  if (small) {
    content +=
      `<text x="${cx}" y="${round(cx + 22)}" text-anchor="middle" font-size="${small.size || 12}" ` +
      `font-weight="bold" fill="${small.color || color}">${escapeXml(small.text)}</text>`;
  } else if (icon && ICON_PATHS[icon.name]) {
    const s = (icon.size || 16) / 24;
    content +=
      `<path d="${ICON_PATHS[icon.name]}" fill="${icon.color || color}" ` +
      `transform="translate(${round(cx - 12 * s)} ${round(cx + 8)}) scale(${round(s)})"/>`;
  }
  return `${inner}${content}</svg>`;
}

function escapeXml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// 4 番茄循环点（设计稿 .dots）：done=实心主色，cur=主色描边+中心点，其余=轨道色。
// width = 4*size + 3*gap。
export function cycleDotsSvg({ done = 0, cur = false, size = 8, gap = 4, accent = '#EE5A4F', track = '#F3E6DA' } = {}) {
  const d = Math.max(0, Math.min(4, done));
  const w = size * 4 + gap * 3;
  const r = size / 2;
  let circles = '';
  for (let i = 0; i < 4; i++) {
    const cx = r + i * (size + gap);
    if (i < d) {
      circles += `<circle cx="${cx}" cy="${r}" r="${r}" fill="${accent}"/>`;
    } else if (i === d && cur) {
      circles +=
        `<circle cx="${cx}" cy="${r}" r="${round(r - 1)}" fill="none" stroke="${accent}" stroke-width="1.6"/>` +
        `<circle cx="${cx}" cy="${r}" r="1.6" fill="${accent}"/>`;
    } else {
      circles += `<circle cx="${cx}" cy="${r}" r="${r}" fill="${track}"/>`;
    }
  }
  return `<svg width="${w}" height="${size}" viewBox="0 0 ${w} ${size}">${circles}</svg>`;
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

// 水平胶囊进度条 SVG：width/height 自适应，两端圆角，无布局拉伸失真
export function progressBarSvg({
  width = 160,
  height = 8,
  progress = 0,
  track = '#F3E6DA',
  color = '#EE5A4F',
} = {}) {
  const p = Math.max(0, Math.min(1, progress));
  const r = height / 2;
  const barW = Math.max(0, Math.min(width, width * p));
  const fill =
    barW > 0
      ? `<rect x="0" y="0" width="${round(barW)}" height="${height}" rx="${round(r)}" fill="${color}"/>`
      : '';
  return (
    `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
    `<rect x="0" y="0" width="${width}" height="${height}" rx="${round(r)}" fill="${track}"/>` +
    fill +
    `</svg>`
  );
}

// 7天专注统计柱状图 SVG（宽约 136，高约 54）
export function focusWeekBarsSvg({
  width = 136,
  height = 54,
  days = ['四', '五', '六', '日', '一', '二', '今'],
  values = [0, 0, 0, 0, 0, 0, 0], // 分钟数
  accent = '#EE5A4F',
  track = '#EBD9C9',
  activeText = '#C23128',
  subText = '#6B5B50',
} = {}) {
  const maxVal = Math.max(150, ...values);
  const count = 7;
  const colW = 14;
  const gap = round((width - colW * count) / (count - 1));
  let bars = '';
  for (let i = 0; i < count; i++) {
    const x = i * (colW + gap);
    const val = values[i] || 0;
    const barH = Math.max(4, Math.min(34, Math.round((val / maxVal) * 34)));
    const y = 34 - barH;
    const isToday = i === count - 1;
    const barColor = isToday ? accent : track;
    const txtColor = isToday ? activeText : subText;
    const fw = isToday ? 'bold' : 'normal';
    bars +=
      `<rect x="${x}" y="${y}" width="${colW}" height="${barH}" rx="3" fill="${barColor}"/>` +
      `<text x="${x + colW / 2}" y="48" text-anchor="middle" font-size="10" font-weight="${fw}" fill="${txtColor}">${days[i] || ''}</text>`;
  }
  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${bars}</svg>`;
}

// 今日足迹地图矢量 SVG（宽 154，高 108）
export function mapPolylineSvg({ width = 154, height = 108, count = 0, isDark = false } = {}) {
  const roadColor = isDark ? '#3A302A' : '#FFFDFA';
  const greenFill = isDark ? '#2B4A37' : '#D3E9D8';
  const accent = isDark ? '#4FD6A0' : '#2DB37C';
  const bg = isDark ? '#241D19' : '#F6EEE6';

  const baseSvg =
    `<rect x="0" y="0" width="${width}" height="${height}" rx="12" fill="${bg}"/>` +
    `<rect x="98" y="8" width="44" height="26" rx="10" fill="${greenFill}"/>` +
    `<path d="M-4 92L52 72L98 100L160 80" fill="none" stroke="${roadColor}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>` +
    `<path d="M44 -4L58 44L36 112" fill="none" stroke="${roadColor}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>` +
    `<path d="M-4 30L70 20L160 52" fill="none" stroke="${roadColor}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>`;

  // 4 个站点参考坐标
  const XY = [{ x: 26, y: 78 }, { x: 62, y: 36 }, { x: 104, y: 66 }, { x: 130, y: 26 }];
  let lineSegments = '';
  for (let i = 0; i < Math.min(3, Math.max(0, count - 1)); i++) {
    const a = XY[i];
    const b = XY[i + 1];
    lineSegments += `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="${accent}" stroke-width="3" stroke-linecap="round"/>`;
  }

  let pins = '';
  for (let i = 0; i < 4; i++) {
    const q = XY[i];
    const done = i < count;
    const cur = i === count - 1 && count > 0;
    if (done) {
      pins +=
        `<circle cx="${q.x}" cy="${q.y}" r="9" fill="${accent}"/>` +
        `<path d="M${q.x - 4} ${q.y}l2.5 2.5 5.5-5" fill="none" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`;
    } else {
      pins +=
        `<circle cx="${q.x}" cy="${q.y}" r="8" fill="${bg}" stroke="#D8C9BB" stroke-width="2"/>` +
        (cur ? `<circle cx="${q.x}" cy="${q.y}" r="3" fill="${accent}"/>` : '');
    }
  }

  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${baseSvg}${lineSegments}${pins}</svg>`;
}

// 4×1 本周连续打卡 7 天状态 SVG（宽 210，高 48）
export function weekCirclesSvg({
  width = 210,
  height = 48,
  days = ['一', '二', '三', '四', '五', '六', '日'],
  active = [false, false, false, false, false, false, false],
  todayIdx = 2,
  accent = '#4FD6A0',
  track = '#3A302A',
  textSecondary = '#D9C9BA',
} = {}) {
  const count = 7;
  const dSize = 24;
  const gap = round((width - dSize * count) / (count - 1));
  let circles = '';
  for (let i = 0; i < count; i++) {
    const cx = round(dSize / 2 + i * (dSize + gap));
    const cy = 14;
    const isToday = i === todayIdx;
    const isOn = active[i];
    if (isOn) {
      circles +=
        `<circle cx="${cx}" cy="${cy}" r="11" fill="${accent}"/>` +
        `<path d="M${cx - 4} ${cy}l2.5 2.5 5.5-5" fill="none" stroke="#1B1512" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`;
    } else {
      circles +=
        `<circle cx="${cx}" cy="${cy}" r="11" fill="none" stroke="${isToday ? accent : track}" stroke-width="2"/>`;
    }
    const label = isToday ? '今' : (days[i] || '');
    const txtColor = isToday ? accent : textSecondary;
    const fw = isToday ? 'bold' : 'normal';
    circles += `<text x="${cx}" y="42" text-anchor="middle" font-size="11" font-weight="${fw}" fill="${txtColor}">${label}</text>`;
  }
  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${circles}</svg>`;
}

// 2×2 深色打卡热力图格 SVG（宽 134，高 48，4周×7天 = 28格）
export function heatGridSvg({
  width = 134,
  height = 48,
  grid = [], // 28 个数值（0 / 1 / 2）
  activeColor = '#4FD6A0',
  midColor = '#1F7A57',
  emptyColor = '#3A302A',
} = {}) {
  const cols = 7;
  const rows = 4;
  const cellW = 15;
  const cellH = 8;
  const gapX = 4;
  const gapY = 4;
  let cells = '';
  const data = Array.isArray(grid) && grid.length === 28 ? grid : Array(28).fill(0);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const idx = r * cols + c;
      const x = c * (cellW + gapX);
      const y = r * (cellH + gapY);
      const val = data[idx] || 0;
      const isToday = idx === 27;
      let fill = emptyColor;
      if (val === 1) fill = midColor;
      if (val >= 2) fill = activeColor;
      cells += `<rect x="${x}" y="${y}" width="${cellW}" height="${cellH}" rx="2" fill="${fill}"/>`;
      if (isToday) {
        cells += `<rect x="${x - 1}" y="${y - 1}" width="${cellW + 2}" height="${cellH + 2}" rx="3" fill="none" stroke="#FBEFE4" stroke-width="1.2"/>`;
      }
    }
  }
  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${cells}</svg>`;
}

