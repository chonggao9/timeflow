/**
 * TimeFlow 备份 V2 核心逻辑单元测试（node + assert，无 jest）
 * 只测纯函数模块（format / hash / plan），不触碰 RN/expo API。
 * 覆盖：
 * 1. 文件名生成与解析（kind/条数入名，免索引扫描的依据）
 * 2. 导入校验（有效包 / 损坏 JSON / 旧版加密包 / 未来版本 / 缺字段 / 坏行）
 * 3. 备份包构建（counts、结构、prefs 白名单语义）
 * 4. 内容哈希（无变化跳过备份的判定依据）
 * 5. 保留策略（auto 上限 7、star 永不清理、manual/safe 豁免、合计超限提示）
 * 6. 恢复预览（replace 被替换条数 / merge 补回条数与 id 去重）
 * 7. 云端轮转（保留最近 3 份，从最旧删起）
 * 8. CSV 导出（三段结构、字段转义、中英表头）
 */

const assert = require('assert');

const {
  makeBackupFilename,
  parseBackupFilename,
  buildPackage,
  validatePackage,
  extractCounts,
  PREF_KEYS,
} = require('../src/backup/format');

const { computeContentHash } = require('../src/backup/hash');

const { planPrune, planRestore, planCloudPrune, MAX_AUTO, MAX_MANUAL_SAFE, MAX_CLOUD } = require('../src/backup/plan');

const { buildCsv, csvEscape } = require('../src/backup/csv');

function test(name, fn) {
  try {
    fn();
    console.log(`  ✅ [PASS] ${name}`);
  } catch (err) {
    console.error(`  ❌ [FAIL] ${name}`);
    console.error(err);
    process.exit(1);
  }
}

console.log('--- 启动 TimeFlow 备份 V2 核心单元测试 ---');

const sampleData = {
  trips: [{ id: 't1', startTs: 1000, endTs: 2000, name: '家 → 公司', isActive: false, createdAt: 1000 }],
  records: [
    { id: 'r1', timestamp: 1000, locationName: '家', lat: 31.2, lng: 121.4, mode: 'walk', tripId: 't1' },
    { id: 'r2', timestamp: 2000, locationName: '公司', lat: 31.3, lng: 121.5, mode: 'subway', tripId: 't1' },
  ],
  focusSessions: [{ id: 'f1', timestamp: 3000, goalName: '编码', duration: 1500, category: 'work', note: null }],
};

// 1. 文件名生成与解析
test('文件名生成/解析往返一致，kind 与条数可从文件名还原', () => {
  const d = new Date(2026, 9, 14, 10, 15); // 2026-10-14 10:15 本地时间
  for (const kind of ['auto', 'manual', 'safe']) {
    const name = makeBackupFilename(kind, d, 1248);
    assert.strictEqual(name, `timeflow-20261014-1015-${kind}-1248.json`);
    const meta = parseBackupFilename(name);
    assert.ok(meta, '应能解析');
    assert.strictEqual(meta.kind, kind);
    assert.strictEqual(meta.records, 1248);
    assert.strictEqual(meta.at, d.getTime());
  }
});

test('非法/旧版/临时文件名一律解析为 null', () => {
  assert.strictEqual(parseBackupFilename('timeflow-backup-latest.json'), null); // 旧固定单文件
  assert.strictEqual(parseBackupFilename('timeflow-20261014-1015.tfb'), null);  // 旧 .tfb
  assert.strictEqual(parseBackupFilename('timeflow-20261014-1015-auto-12.json.tmp'), null);
  assert.strictEqual(parseBackupFilename('timeflow-20261014-1015-unknown-12.json'), null); // 未知 kind
  assert.strictEqual(parseBackupFilename('random.json'), null);
  assert.strictEqual(parseBackupFilename(''), null);
  assert.strictEqual(parseBackupFilename(null), null);
});

// 2. 导入校验
test('有效 V2 明文包通过校验', () => {
  const pkg = buildPackage(sampleData, { timeflow_lang: 'zh' }, { device: 'Pixel 7' });
  const res = validatePackage(pkg);
  assert.strictEqual(res.ok, true);
  assert.strictEqual(res.pkg.counts.records, 2);
  // 字符串形态（读文件后直接校验）同样通过
  assert.strictEqual(validatePackage(JSON.stringify(pkg)).ok, true);
});

test('损坏 JSON / 非对象一律拒绝且不抛出', () => {
  assert.strictEqual(validatePackage('{ broken json !!!').ok, false);
  assert.strictEqual(validatePackage('').ok, false);
  assert.strictEqual(validatePackage(null).ok, false);
  assert.strictEqual(validatePackage(42).ok, false);
  assert.strictEqual(validatePackage([]).ok, false);
});

test('旧版加密包（含 ciphertext）按「不是 TimeFlow 备份文件」拒绝', () => {
  const legacyEncrypted = {
    app: 'TimeFlow', backupVersion: 1, kdfIterations: 15000,
    salt: 'ab'.repeat(16), iv: 'cd'.repeat(16),
    ciphertext: 'BASE64BASE64==', mac: 'EF==',
  };
  assert.strictEqual(validatePackage(legacyEncrypted).ok, false);
  // 新 .tfb 免密信封（大写 app + v:1 + ciphertext）同样拒绝
  const tfbEnvelope = { v: 1, app: 'TimeFlow', backupVersion: 2, ciphertext: 'xx', mac: 'yy', counts: { records: 3 } };
  assert.strictEqual(validatePackage(tfbEnvelope).ok, false);
});

test('未来版本（v=2）与字段缺失/坏行拒绝', () => {
  const pkg = buildPackage(sampleData, {});
  assert.strictEqual(validatePackage({ ...pkg, v: 2 }).ok, false);           // 更高版本
  assert.strictEqual(validatePackage({ ...pkg, app: 'other' }).ok, false);   // 非本应用
  const noData = { ...pkg }; delete noData.data;
  assert.strictEqual(validatePackage(noData).ok, false);
  const badRows = { ...pkg, data: { ...pkg.data, records: [{ timestamp: 1 }] } }; // 缺 id
  assert.strictEqual(validatePackage(badRows).ok, false);
  const badTrips = { ...pkg, data: { ...pkg.data, trips: [{ startTs: 1 }] } };     // trip 缺 id
  assert.strictEqual(validatePackage(badTrips).ok, false);
  const badPrefs = { ...pkg, data: { ...pkg.data, prefs: 'x' } };
  assert.strictEqual(validatePackage(badPrefs).ok, false);
});

// 3. 备份包构建
test('buildPackage 结构与 counts 正确；凭证键不在白名单内', () => {
  const pkg = buildPackage(sampleData, { timeflow_lang: 'zh', timeflow_theme: 'dark' }, { device: 'Pixel 7' });
  assert.strictEqual(pkg.app, 'timeflow');
  assert.strictEqual(pkg.v, 1);
  assert.strictEqual(pkg.device, 'Pixel 7');
  assert.deepStrictEqual(pkg.counts, { records: 2, focus: 1, trips: 1 });
  assert.deepStrictEqual(extractCounts(sampleData), { records: 2, focus: 1, trips: 1 });
  // 白名单只含偏好键，任何凭证键都不在其中
  assert.deepStrictEqual(PREF_KEYS, ['timeflow_profile', 'timeflow_lang', 'timeflow_theme', 'timeflow_skin', 'timeflow_mode']);
  assert.ok(!PREF_KEYS.some((k) => /amap|webdav|passphrase|password/i.test(k)));
  // prefs 原样进 data.prefs
  assert.strictEqual(pkg.data.prefs.timeflow_lang, 'zh');
  // 缺省容错：data 为 null 不崩溃
  const empty = buildPackage(null, null);
  assert.deepStrictEqual(empty.counts, { records: 0, focus: 0, trips: 0 });
});

// 4. 内容哈希（无变化跳过备份的依据）
test('相同内容哈希一致；任一表或偏好变化哈希改变', () => {
  const base = { ...sampleData, prefs: { timeflow_lang: 'zh' } };
  const same = JSON.parse(JSON.stringify(base));
  assert.strictEqual(computeContentHash(base), computeContentHash(same));

  // 记录字段变化（含异步补位后的 lat/lng/地名）
  const movedLoc = JSON.parse(JSON.stringify(base));
  movedLoc.records[0].locationName = '地铁口';
  assert.notStrictEqual(computeContentHash(base), computeContentHash(movedLoc));

  const addedFocus = JSON.parse(JSON.stringify(base));
  addedFocus.focusSessions.push({ id: 'f2', timestamp: 4000, duration: 600 });
  assert.notStrictEqual(computeContentHash(base), computeContentHash(addedFocus));

  const tripNamed = JSON.parse(JSON.stringify(base));
  tripNamed.trips[0].name = '晚归';
  assert.notStrictEqual(computeContentHash(base), computeContentHash(tripNamed));

  const prefChanged = { ...base, prefs: { timeflow_lang: 'en' } };
  assert.notStrictEqual(computeContentHash(base), computeContentHash(prefChanged));

  // 行序不同 → 哈希不同是可接受的（收集时恒定 ORDER BY，不会抖动）
});

// 5. 保留策略
const v = (name, kind, records, at) => ({ name, kind, records, at });
test('auto 超过 7 份从最旧删起，star（记录最多）永不删', () => {
  // 8 份 auto：a1 最旧但记录最多（star），a8 最新
  const versions = [];
  for (let i = 1; i <= 8; i++) {
    versions.push(v(`a${i}`, 'auto', i === 1 ? 9999 : i * 10, 1000 + i));
  }
  const { toDelete, starName } = planPrune(versions);
  assert.strictEqual(starName, 'a1');
  assert.deepStrictEqual(toDelete, ['a2']); // 最旧的非 star auto
  assert.ok(!toDelete.includes('a1'));
});

test('manual/safe 永不自动清理；auto 恰 7 份不删', () => {
  const versions = [
    ...Array.from({ length: 7 }, (_, i) => v(`a${i}`, 'auto', 100 + i, 2000 + i)),
    v('m1', 'manual', 50, 1000),
    v('s1', 'safe', 5000, 999), // star 是 safe
  ];
  const { toDelete, starName } = planPrune(versions);
  assert.strictEqual(starName, 's1');
  assert.deepStrictEqual(toDelete, []);
});

test('manual+safe 合计超过 10 份仅提示，不自动删', () => {
  const versions = [
    ...Array.from({ length: 11 }, (_, i) => v(`m${i}`, 'manual', i, 3000 + i)),
    v('a0', 'auto', 100, 1),
  ];
  const { toDelete, overManualSafe } = planPrune(versions);
  assert.strictEqual(overManualSafe, true);
  assert.deepStrictEqual(toDelete, []); // auto 只有 1 份，不超限
  assert.strictEqual(MAX_AUTO, 7);
  assert.strictEqual(MAX_MANUAL_SAFE, 10);
});

test('star 平手取最新；空列表安全返回', () => {
  const tie = planPrune([v('old', 'auto', 100, 1), v('new', 'auto', 100, 2)]);
  assert.strictEqual(tie.starName, 'new');
  const empty = planPrune([]);
  assert.deepStrictEqual(empty, { toDelete: [], overManualSafe: false, starName: null });
});

// 6. 恢复预览（merge 按 id 去重的计算核心）
test('planRestore：replace 被替换条数 / merge 补回条数与 id 正确', () => {
  const current = ['r1', 'r2', 'r3', 'f1'];        // r3 是备份后新增的
  const backup = ['r1', 'r2', 'r9', 'f1', 'f5'];   // r9/f5 是备份里有而现在缺的
  const plan = planRestore(current, backup);
  assert.strictEqual(plan.replaceOverwritten, 1);  // r3 会被替换
  assert.strictEqual(plan.mergeAdded, 2);          // r9 + f5
  assert.deepStrictEqual(plan.mergeIds.sort(), ['f5', 'r9']);

  // 完全一致：两个方向都是 0
  const same = planRestore(['a', 'b'], ['a', 'b']);
  assert.strictEqual(same.replaceOverwritten, 0);
  assert.strictEqual(same.mergeAdded, 0);

  // 空库恢复：全部补回
  const fromEmpty = planRestore([], ['a', 'b']);
  assert.strictEqual(fromEmpty.mergeAdded, 2);
  assert.strictEqual(fromEmpty.replaceOverwritten, 0);

  // merge 语义 = INSERT OR IGNORE by id：id 重合部分不会重复（由数据库主键保证，这里验证计数不重复统计）
  const dup = planRestore(['a', 'a'], ['a']);
  assert.strictEqual(dup.mergeAdded, 0);
});

// 7. 云端轮转（只保留最近 3 份当前格式文件）
test('planCloudPrune：超过 3 份从最旧删起；不足不删；空/null 安全', () => {
  assert.strictEqual(MAX_CLOUD, 3);
  const entries = [
    { name: 'c3', at: 3 }, { name: 'c1', at: 1 }, { name: 'c5', at: 5 }, { name: 'c2', at: 2 }, { name: 'c4', at: 4 },
  ];
  assert.deepStrictEqual(planCloudPrune(entries), ['c1', 'c2']); // 乱序输入也按 at 排序
  assert.deepStrictEqual(planCloudPrune(entries.slice(0, 3)), []);
  assert.deepStrictEqual(planCloudPrune([]), []);
  assert.deepStrictEqual(planCloudPrune(null), []);
  assert.deepStrictEqual(planCloudPrune([{ at: 9 }, null]), []); // 无名条目忽略
});

// 8. CSV 导出（真 CSV：三段结构 + Excel 兼容转义）
test('csvEscape：逗号/引号/换行加引号包裹，内嵌引号翻倍', () => {
  assert.strictEqual(csvEscape('plain'), 'plain');
  assert.strictEqual(csvEscape('a,b'), '"a,b"');
  assert.strictEqual(csvEscape('say "hi"'), '"say ""hi"""');
  assert.strictEqual(csvEscape('line1\nline2'), '"line1\nline2"');
  assert.strictEqual(csvEscape(null), '');
  assert.strictEqual(csvEscape(0), '0');
});

test('csvEscape：公式注入防护（= + - @ 开头的文本加前导单引号；数值不受影响）', () => {
  // 注入 + 内嵌引号：加单引号后仍按标准 CSV 包裹并翻倍引号
  assert.strictEqual(csvEscape('=HYPERLINK("http://evil")'), '"\'=HYPERLINK(""http://evil"")"');
  assert.strictEqual(csvEscape('+1234'), "'+1234");
  assert.strictEqual(csvEscape('@SUM(A1)'), "'@SUM(A1)");
  assert.strictEqual(csvEscape('-cmd'), "'-cmd");
  // 数值型负数（经纬度）原样输出，不加引号
  assert.strictEqual(csvEscape(-121.4), '-121.4');
  assert.strictEqual(csvEscape(31.2), '31.2');
  // 注入 + 逗号：既加单引号又整体包裹
  assert.strictEqual(csvEscape('=1,2'), '"\'=1,2"');
});

test('buildCsv：三段结构、中英表头、行数与转义正确、CRLF 行分隔', () => {
  const tricky = JSON.parse(JSON.stringify(sampleData));
  tricky.records[0].locationName = '星巴克, "国贸" 店';
  const zh = buildCsv(tricky, { lang: 'zh', now: new Date(2026, 9, 14, 10, 15) });
  assert.ok(zh.includes('【打卡】') && zh.includes('【专注】') && zh.includes('【行程】'));
  assert.ok(zh.includes('"星巴克, ""国贸"" 店"'), '含逗号/引号的地名必须正确转义');
  assert.ok(zh.includes('生成时间,2026-10-14 10:15:00'));
  assert.ok(!zh.includes('\n') || zh.split('\n').every((l) => l.endsWith('\r') || l === ''), 'LF 必须都属于 CRLF 或引号内字段');
  // 数据行核对：三段各含对应记录
  const zhLines = zh.split('\r\n');
  assert.ok(zhLines.some((l) => l.startsWith('r1,') && l.includes('walk')));
  assert.ok(zhLines.some((l) => l.startsWith('f1,') && l.includes('编码')));
  assert.ok(zhLines.some((l) => l.startsWith('t1,') && l.includes('家 → 公司')));

  const en = buildCsv(sampleData, { lang: 'en', now: new Date(2026, 9, 14, 10, 15) });
  assert.ok(en.includes('[Check-ins]') && en.includes('[Focus sessions]') && en.includes('[Trips]'));
  assert.ok(en.includes('ID,Time,Location,Latitude,Longitude,Mode,Trip ID'));
  assert.ok(!en.includes('【'));

  // 空库/坏输入不崩溃：仍产出完整表头
  const emptyCsv = buildCsv(null, { lang: 'zh' });
  assert.ok(emptyCsv.includes('【打卡】') && emptyCsv.includes('【行程】'));
});

console.log('\n🎉 备份 V2 全部核心单元测试通过！\n');
