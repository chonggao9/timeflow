// 备份文件 V2 格式：构建 / 文件名校验解析 / 导入校验。
// 纯函数模块（不依赖 RN/expo），可在 node 测试脚本中直接 require。
//
// 文件为可直接阅读的明文 JSON：
// { app:'timeflow', v:1, createdAt, device, counts:{records,focus,trips},
//   data:{ records:[], trips:[], focusSessions:[], prefs:{} } }
//
// 文件名：timeflow-YYYYMMDD-HHmm-{kind}-{records}.json
// kind ∈ auto | manual | safe，条数直接写在文件名里 —— 列表页扫描目录即可渲染，无需索引文件。

export const BACKUP_APP = 'timeflow';
export const BACKUP_V = 1;
export const KINDS = ['auto', 'manual', 'safe'];

// 需快照的偏好键白名单（原始 AsyncStorage 键名）。凭证（高德 Key、WebDAV 配置/密码）永不入包。
export const PREF_KEYS = [
  'timeflow_profile',
  'timeflow_lang',
  'timeflow_theme',
  'timeflow_mode',
];

const pad = (n) => String(n).padStart(2, '0');

// 由 Date 生成本地时间文件名，如 timeflow-20261014-1015-auto-1248.json
export function makeBackupFilename(kind, date, recordCount) {
  const d = date instanceof Date ? date : new Date(date);
  const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
  return `timeflow-${stamp}-${kind}-${Math.max(0, recordCount | 0)}.json`;
}

const NAME_RE = /^timeflow-(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})-(auto|manual|safe)-(\d+)\.json$/;

// 解析文件名 → { at(ms), kind, records }；不匹配返回 null
export function parseBackupFilename(name) {
  const m = NAME_RE.exec(name || '');
  if (!m) return null;
  const [, y, mo, d, h, mi, kind, records] = m;
  const at = new Date(+y, +mo - 1, +d, +h, +mi).getTime();
  if (Number.isNaN(at)) return null;
  return { name, at, kind, records: +records };
}

export function extractCounts(data) {
  return {
    records: (data?.records || []).length,
    focus: (data?.focusSessions || []).length,
    trips: (data?.trips || []).length,
  };
}

// 组装完整备份包（明文对象，调用方负责序列化）
export function buildPackage(data, prefs, meta = {}) {
  const payload = {
    records: Array.isArray(data?.records) ? data.records : [],
    trips: Array.isArray(data?.trips) ? data.trips : [],
    focusSessions: Array.isArray(data?.focusSessions) ? data.focusSessions : [],
  };
  return {
    app: BACKUP_APP,
    v: BACKUP_V,
    createdAt: meta.createdAt || new Date().toISOString(),
    device: meta.device || '',
    counts: extractCounts(payload),
    data: { ...payload, prefs: prefs && typeof prefs === 'object' ? prefs : {} },
  };
}

// 行级形状校验：至少 id 为非空字符串、timestamp 为数字，其余字段宽松
function isRowArray(arr) {
  return Array.isArray(arr) && arr.every(
    (r) => r && typeof r === 'object' && typeof r.id === 'string' && r.id && typeof r.timestamp === 'number'
  );
}

/**
 * 导入校验。返回 { ok:true, pkg } 或 { ok:false }。
 * 统一失败语义（UI 提示「这不是 TimeFlow 备份文件，请重新选择」）：
 * - 损坏 JSON / 非对象
 * - 旧版加密包（含 ciphertext，app:'TimeFlow' 大写也一并拒掉）
 * - 未来版本（v !== 1）
 * - data 字段类型不符
 */
export function validatePackage(raw) {
  let obj = raw;
  if (typeof raw === 'string') {
    try { obj = JSON.parse(raw); } catch (e) { return { ok: false }; }
  }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return { ok: false };
  if (obj.app !== BACKUP_APP || obj.v !== BACKUP_V) return { ok: false };
  const d = obj.data;
  if (!d || typeof d !== 'object') return { ok: false };
  if (!isRowArray(d.records) || !isRowArray(d.focusSessions)) return { ok: false };
  // trips 行主键为 id + startTs（无 timestamp 字段），单独校验
  if (!Array.isArray(d.trips) || !d.trips.every((t) => t && typeof t === 'object' && typeof t.id === 'string' && t.id)) {
    return { ok: false };
  }
  if (d.prefs != null && (typeof d.prefs !== 'object' || Array.isArray(d.prefs))) return { ok: false };
  return { ok: true, pkg: obj };
}
