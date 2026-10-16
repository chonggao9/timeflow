/**
 * TimeFlow 桌面小组件纯函数单元测试（node + assert，无 jest，风格同 test_backup.js）
 * 只测不触碰 RN/expo API 的纯模块：widget/svg.js、widget/widgetNames.js、widget/widgetTheme.js。
 * 覆盖：
 * 1. SVG 生成器：圆环进度换算与钳制、番茄灌满 clip、图标路径表
 * 2. 组件名分组路由（taskHandler/refresh 共用常量表的完整性）
 * 3. 配色：三模式×深浅 palette 关键色、行程绿
 * 4. 对比度门禁（验收要求）：白字按钮底 ≥4.5:1、深浅主题主/次文字 ≥4.5:1、chip 文字 ≥4.5:1
 */

const assert = require('assert');

const {
  ringSvg,
  tomatoSvg,
  iconSvg,
  ICON_NAMES,
  progressBarSvg,
  focusWeekBarsSvg,
  mapPolylineSvg,
  weekCirclesSvg,
  heatGridSvg,
} = require('../widget/svg');
const {
  POMODORO_WIDGETS, TRAVEL_WIDGETS, LEGACY_WIDGETS, ALL_WIDGETS, widgetGroup,
} = require('../widget/widgetNames');
const { basePalette, modePalette, tripPalette, RADIUS_WIDGET } = require('../widget/widgetTheme');

const failures = [];
function test(name, fn) {
  try {
    fn();
    console.log(`  ✅ [PASS] ${name}`);
  } catch (err) {
    failures.push(name);
    console.error(`  ❌ [FAIL] ${name}`);
    console.error(err && err.message ? `     ${err.message}` : err);
  }
}

// --- WCAG 相对亮度与对比度 ---
function channelLinear(c8) {
  const c = c8 / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}
function luminance(hex) {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return 0.2126 * channelLinear(r) + 0.7152 * channelLinear(g) + 0.0722 * channelLinear(b);
}
function contrast(a, b) {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

console.log('--- 启动 TimeFlow 小组件纯函数单元测试 ---');

// 1. SVG 生成器
test('ringSvg：progress 0→dash 0、1→整圆、越界钳制；参数正确出现', () => {
  const size = 96;
  const width = 10;
  const r = (size - width) / 2;
  const c = Math.round(2 * Math.PI * r * 100) / 100;
  const zero = ringSvg({ size, progress: 0, width });
  assert.ok(!zero.includes('stroke-dasharray')); // 零进度不画弧（避免 round linecap 圆点）
  const full = ringSvg({ size, progress: 1, width });
  assert.ok(full.includes(`stroke-dasharray="${c} ${c}"`));
  const over = ringSvg({ size, progress: 2.5, width });
  assert.ok(over.includes(`stroke-dasharray="${c} ${c}"`)); // 钳制到 1
  const half = ringSvg({ size, progress: 0.5, width, track: '#F3E6DA', color: '#EE5A4F' });
  assert.ok(half.includes(`stroke-dasharray="${Math.round((c / 2) * 100) / 100} ${c}"`));
  assert.ok(half.includes('#F3E6DA') && half.includes('#EE5A4F'));
  assert.ok(half.includes('rotate(-90') && half.startsWith('<svg') && half.endsWith('</svg>'));
});

test('tomatoSvg：静态无 clip；带 progress 出现灌满 clip 且 y 随进度上移', () => {
  const plain = tomatoSvg({});
  assert.ok(!plain.includes('clipPath'));
  assert.ok(plain.includes('fill="#EE5A4F"'));
  const empty = tomatoSvg({ progress: 0 });
  const full = tomatoSvg({ progress: 1 });
  assert.ok(empty.includes('clipPath') && full.includes('clipPath'));
  const yOf = (s) => Number(s.match(/<rect x="0" y="([\d.]+)"/)[1]);
  assert.ok(yOf(empty) > yOf(full)); // progress 越大，clip 矩形越靠上（灌得越满）
  assert.strictEqual(yOf(full), 3);
  assert.strictEqual(yOf(empty), 22);
});

test('iconSvg：全部注册图标非空且含 path；未注册名返回空串', () => {
  for (const name of ICON_NAMES) {
    const svg = iconSvg(name, { size: 20, color: '#17805A' });
    assert.ok(svg.includes('<path') && svg.includes('width="20"') && svg.includes('#17805A'), name);
  }
  assert.strictEqual(iconSvg('no-such-icon'), '');
  assert.ok(ICON_NAMES.includes('play') && ICON_NAMES.includes('pause') && ICON_NAMES.includes('check'));
});

// 2. 组件名分组
test('widgetNames：分组路由正确、ALL 完整、无重名', () => {
  assert.strictEqual(widgetGroup('PomodoroWidget4x2'), 'pomodoro');
  assert.strictEqual(widgetGroup('TravelWidget2x2'), 'travel');
  assert.strictEqual(widgetGroup('TimeFlowWidget'), 'legacy');
  assert.strictEqual(widgetGroup('UnknownWidget'), null);
  const all = [...POMODORO_WIDGETS, ...TRAVEL_WIDGETS, ...LEGACY_WIDGETS];
  assert.deepStrictEqual(ALL_WIDGETS, all);
  assert.strictEqual(new Set(ALL_WIDGETS).size, ALL_WIDGETS.length);
});

// 3. 配色关键值
test('widgetTheme：设计稿 §5 关键色与圆角', () => {
  const light = basePalette(false);
  const dark = basePalette(true);
  assert.strictEqual(light.bg, '#FFFDFA');
  assert.strictEqual(light.textPrimary, '#2A211B');
  assert.strictEqual(light.textSecondary, '#6B5B50');
  assert.strictEqual(light.track, '#F3E6DA');
  assert.strictEqual(light.btnSecondary, '#F6EEE6');
  assert.strictEqual(dark.bg, '#241D19');
  assert.strictEqual(dark.textPrimary, '#FBEFE4');
  assert.strictEqual(dark.textSecondary, '#D9C9BA');
  assert.strictEqual(dark.track, '#3A302A');
  assert.strictEqual(RADIUS_WIDGET, 28);

  const f = modePalette('focus', false);
  assert.strictEqual(f.accent, '#EE5A4F');
  assert.strictEqual(f.btn, '#D63B32');
  const s = modePalette('short', false);
  assert.strictEqual(s.btn, '#17805A');
  const l = modePalette('long', true);
  assert.strictEqual(l.accent, '#F5B85A'); // 深色主题用色
  const t = tripPalette(false);
  assert.strictEqual(t.accent, '#2DB37C');
  assert.strictEqual(t.btn, '#17805A');
  assert.strictEqual(modePalette('bogus', false).accent, '#EE5A4F'); // 未知模式回退 focus
});

// 4. 对比度门禁（验收：白字按钮底色 ≥4.5:1；文字对比度达标）
test('对比度：三模式+行程的按钮底对白字（浅色主题）≥4.5:1', () => {
  const cases = [
    ['focus btn', modePalette('focus', false)],
    ['short btn', modePalette('short', false)],
    ['long btn', modePalette('long', false)],
    ['trip btn', tripPalette(false)],
  ];
  for (const [name, pal] of cases) {
    const ratio = contrast(pal.btnText, pal.btn);
    assert.ok(ratio >= 4.5, `${name}: ${pal.btnText} on ${pal.btn} = ${ratio.toFixed(2)}`);
  }
});

test('对比度：深色主题按钮（亮底深字）与 chip ≥4.5:1', () => {
  for (const mode of ['focus', 'short', 'long']) {
    const pal = modePalette(mode, true);
    const btnRatio = contrast(pal.btnText, pal.btn);
    assert.ok(btnRatio >= 4.5, `dark ${mode} btn = ${btnRatio.toFixed(2)}`);
    const chipRatio = contrast(pal.chipText, pal.chipBg);
    assert.ok(chipRatio >= 4.5, `dark ${mode} chip = ${chipRatio.toFixed(2)}`);
  }
  const trip = tripPalette(true);
  assert.ok(contrast(trip.btnText, trip.btn) >= 4.5);
});

test('对比度：主/次文字对背景（双主题）≥4.5:1；浅色 chip ≥4.5:1', () => {
  for (const isDark of [false, true]) {
    const pal = basePalette(isDark);
    const primary = contrast(pal.textPrimary, pal.bg);
    const secondary = contrast(pal.textSecondary, pal.bg);
    assert.ok(primary >= 4.5, `textPrimary dark=${isDark}: ${primary.toFixed(2)}`);
    assert.ok(secondary >= 4.5, `textSecondary dark=${isDark}: ${secondary.toFixed(2)}`);
  }
  for (const mode of ['focus', 'short', 'long']) {
    const pal = modePalette(mode, false);
    const ratio = contrast(pal.chipText, pal.chipBg);
    assert.ok(ratio >= 4.5, `light ${mode} chip = ${ratio.toFixed(2)}`);
  }
});

// 5. Phase 2 扩展测试：进度条 SVG、4x1 尺寸
test('progressBarSvg：0 进度无填充、半程宽度对应、越界钳制', () => {
  const zero = progressBarSvg({ width: 140, height: 8, progress: 0, color: '#EE5A4F' });
  assert.ok(!zero.includes('fill="#EE5A4F"')); // 0 进度不画前景色 fill
  const half = progressBarSvg({ width: 140, height: 8, progress: 0.5, color: '#EE5A4F' });
  assert.ok(half.includes('width="70"') && half.includes('fill="#EE5A4F"'));
  const full = progressBarSvg({ width: 140, height: 8, progress: 1 });
  assert.ok(full.includes('width="140"'));
  const over = progressBarSvg({ width: 140, height: 8, progress: 1.5 });
  assert.ok(over.includes('width="140"')); // 钳制到 100%
});

test('widgetNames Phase 2：4x1 尺寸已注册且分组归属正确', () => {
  assert.ok(POMODORO_WIDGETS.includes('PomodoroWidget4x1'));
  assert.ok(TRAVEL_WIDGETS.includes('TravelWidget4x1'));
  assert.strictEqual(widgetGroup('PomodoroWidget4x1'), 'pomodoro');
  assert.strictEqual(widgetGroup('TravelWidget4x1'), 'travel');
});

// 6. Phase 3 扩展测试：全部 6 个扩展组件注册与 4 种新矢量图生成器
test('widgetNames Phase 3：全部扩展组件已注册且分组路由无漏项', () => {
  const pomoP3 = ['PomodoroWidgetTomato2x2', 'PomodoroWidgetDark2x2', 'PomodoroWidgetStats2x2'];
  const travelP3 = ['TravelWidgetWeek4x1', 'TravelWidgetMap2x2', 'TravelWidgetHeat2x2'];

  for (const name of pomoP3) {
    assert.ok(POMODORO_WIDGETS.includes(name), `${name} 应在 POMODORO_WIDGETS 中`);
    assert.strictEqual(widgetGroup(name), 'pomodoro');
  }
  for (const name of travelP3) {
    assert.ok(TRAVEL_WIDGETS.includes(name), `${name} 应在 TRAVEL_WIDGETS 中`);
    assert.strictEqual(widgetGroup(name), 'travel');
  }
  assert.strictEqual(POMODORO_WIDGETS.length, 6);
  assert.strictEqual(TRAVEL_WIDGETS.length, 6);
  assert.strictEqual(ALL_WIDGETS.length, 13); // 6 + 6 + 1(Legacy)
});

test('focusWeekBarsSvg：生成 7 根柱子与对应周标签', () => {
  const svg = focusWeekBarsSvg({
    width: 136,
    height: 54,
    days: ['四', '五', '六', '日', '一', '二', '今'],
    values: [30, 45, 60, 20, 80, 100, 150],
  });
  assert.ok(svg.startsWith('<svg') && svg.endsWith('</svg>'));
  assert.ok(svg.includes('>今</text>'));
  assert.ok(svg.includes('>四</text>'));
  // 包含 7 根立柱矩形
  const rectMatches = svg.match(/<rect x="/g);
  assert.strictEqual(rectMatches.length, 7);
});

test('mapPolylineSvg：生成微缩地图底图、路线与足迹圆点', () => {
  const svg0 = mapPolylineSvg({ width: 154, height: 108, count: 0 });
  assert.ok(svg0.includes('width="154"') && svg0.includes('height="108"'));
  assert.ok(!svg0.includes('<line x1=')); // 0 打卡无路段

  const svg4 = mapPolylineSvg({ width: 154, height: 108, count: 4 });
  const lines = svg4.match(/<line x1=/g);
  assert.strictEqual(lines.length, 3); // 4 站有 3 段连接线
});

test('weekCirclesSvg：生成 7 个周打卡圆圈与状态', () => {
  const svg = weekCirclesSvg({
    width: 210,
    height: 48,
    days: ['一', '二', '三', '四', '五', '六', '日'],
    active: [true, true, false, false, false, false, false],
    todayIdx: 1,
  });
  assert.ok(svg.includes('>今</text>'));
  assert.ok(svg.includes('>一</text>'));
  // 两个已打卡站点有勾选 path
  const checkPaths = svg.match(/<path d=/g);
  assert.strictEqual(checkPaths.length, 2);
});

test('heatGridSvg：生成 28 个热力色块与今日高亮边框', () => {
  const grid = Array(28).fill(0);
  grid[27] = 2; // 今日
  grid[10] = 1;
  const svg = heatGridSvg({ width: 134, height: 48, grid });
  assert.ok(svg.includes('stroke="#FBEFE4"')); // 今日光晕边框
  const rects = svg.match(/<rect x="/g);
  assert.strictEqual(rects.length, 29); // 28 个格子 + 1 个今日外边框
});

console.log('');
if (failures.length) {
  console.error(`❌ ${failures.length} 个用例失败：${failures.join('、')}`);
  process.exit(1);
}
console.log('✅ 小组件纯函数全部用例通过');
