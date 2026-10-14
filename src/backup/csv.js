// 真 CSV 导出（可用 Excel 打开）：纯字符串构建，不依赖 RN/expo，可 node 测试。
// 写入文件时由调用方在最前面加 UTF-8 BOM（﻿），保证 Excel 中文不乱码。

function esc(v) {
  if (v == null) return '';
  let s = String(v);
  // 防公式注入：以 = + - @ 开头的文本在 Excel 里会被当公式执行，加前导单引号变为纯文本。
  // 数值（如负数经纬度）原样输出，不受影响。
  if (typeof v !== 'number' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function ts(v) {
  if (!v) return '';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function row(cells) {
  return cells.map(esc).join(',');
}

/**
 * data: { trips, records, focusSessions }（collectData() 的输出子集）。
 * opts: { lang: 'zh'|'en', now: Date }
 * 三段结构：打卡 / 专注 / 行程，段间空行分隔。
 */
export function buildCsv(data, opts = {}) {
  const zh = (opts.lang || 'zh') !== 'en';
  const now = ts(opts.now ? opts.now.getTime() : Date.now());
  const records = Array.isArray(data?.records) ? data.records : [];
  const focus = Array.isArray(data?.focusSessions) ? data.focusSessions : [];
  const trips = Array.isArray(data?.trips) ? data.trips : [];

  const L = [];
  L.push(row([zh ? 'TimeFlow 数据导出' : 'TimeFlow data export']));
  L.push(row([zh ? '生成时间' : 'Generated at', now]));
  L.push('');

  L.push(row([zh ? '【打卡】' : '[Check-ins]']));
  L.push(row(zh
    ? ['ID', '时间', '地点名称', '纬度', '经度', '出行方式', '行程ID']
    : ['ID', 'Time', 'Location', 'Latitude', 'Longitude', 'Mode', 'Trip ID']));
  for (const r of records) {
    L.push(row([r.id, ts(r.timestamp), r.locationName, r.lat, r.lng, r.mode, r.tripId]));
  }
  L.push('');

  L.push(row([zh ? '【专注】' : '[Focus sessions]']));
  L.push(row(zh
    ? ['ID', '时间', '目标', '时长（秒）', '分类', '备注']
    : ['ID', 'Time', 'Goal', 'Duration (s)', 'Category', 'Note']));
  for (const f of focus) {
    L.push(row([f.id, ts(f.timestamp), f.goalName, f.duration, f.category, f.note]));
  }
  L.push('');

  L.push(row([zh ? '【行程】' : '[Trips]']));
  L.push(row(zh
    ? ['ID', '开始时间', '结束时间', '名称']
    : ['ID', 'Start', 'End', 'Name']));
  for (const t of trips) {
    L.push(row([t.id, ts(t.startTs), t.endTs ? ts(t.endTs) : '', t.name]));
  }
  L.push('');

  return L.join('\r\n');
}

export { esc as csvEscape };
