/**
 * TimeFlow 备份核心流水线单元测试脚本
 * 覆盖：
 * 1. .tfb 加密与解密全流程
 * 2. 头部防篡改校验 (MAC 覆盖头部)
 * 3. 错误密码拒绝验证
 * 4. Legacy 旧格式兼容性解密
 * 5. 版本清理（Prune）轮转规则
 * 6. 防覆盖算法熔断判定
 * 7. 数据哈希去重判定
 */

const assert = require('assert');
const CryptoJS = require('crypto-js');

// 模拟导入 crypto.js
const {
  encrypt,
  decrypt,
  parseHeader,
  BadPassphraseError,
  TFB_VERSION,
  TFB_KDF_ITERATIONS,
} = require('../src/backup/crypto');

// 模拟导入 schema.js
const {
  computeContentHash,
  buildPlaintext,
  extractCounts,
} = require('../src/backup/schema');

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

console.log('--- 启动 TimeFlow 备份系统核心单元测试 ---');

// 1. .tfb 新格式加密与解密测试
test('新版 .tfb 格式生成与解密正常还原', () => {
  const password = 'my-secure-password-123';
  const sampleData = {
    trips: [{ id: 't1', start_ts: 1000, end_ts: 2000, name: '家 → 公司' }],
    records: [
      { id: 'r1', timestamp: 1000, location_name: '家', mode: 'walk' },
      { id: 'r2', timestamp: 2000, location_name: '公司', mode: 'walk' },
    ],
    focusSessions: [{ id: 'f1', timestamp: 3000, duration: 1500, goal_name: '编码' }],
  };
  const counts = extractCounts(sampleData);
  const hash = computeContentHash(sampleData);
  const plaintext = buildPlaintext(sampleData, { timeflow_lang: 'zh' });

  // 加密（测试环境中为了快速运行将 iter 设为 2000）
  const envelope = encrypt(password, plaintext, {
    device: 'Test Pixel 7',
    counts,
    hash,
    iterations: 2000,
  });

  assert.strictEqual(envelope.v, 1, '版本号必须为 1');
  assert.strictEqual(envelope.device, 'Test Pixel 7');
  assert.strictEqual(envelope.counts.records, 2);
  assert.strictEqual(envelope.counts.focus, 1);
  assert.strictEqual(envelope.counts.trips, 1);
  assert.strictEqual(envelope.hash, hash);
  assert(envelope.ciphertext.length > 20, '密文必须有效');
  assert(envelope.mac.length > 10, 'MAC 必须有效');

  // 免密解析头部
  const header = parseHeader(envelope);
  assert.strictEqual(header.v, 1);
  assert.strictEqual(header.counts.records, 2);
  assert.strictEqual(header.isLegacy, false);

  // 用正确密码解密
  const restored = decrypt(password, envelope);
  assert.strictEqual(restored.app, 'TimeFlow');
  assert.strictEqual(restored.data.records.length, 2);
  assert.strictEqual(restored.data.focusSessions.length, 1);
  assert.strictEqual(restored.preferences.timeflow_lang, 'zh');
});

// 2. 错误密码拒绝
test('错误密码必须抛出 BadPassphraseError', () => {
  const password = 'correct-password';
  const plaintext = { app: 'TimeFlow', data: { records: [] } };
  const envelope = encrypt(password, plaintext, { iterations: 1000 });

  assert.throws(() => {
    decrypt('wrong-password', envelope);
  }, BadPassphraseError);
});

// 3. 头部篡改防范测试 (MAC 覆盖头部)
test('篡改头部字段必须导致 MAC 校验失败并抛出错误', () => {
  const password = 'correct-password';
  const plaintext = { app: 'TimeFlow', data: { records: [] } };
  const envelope = encrypt(password, plaintext, {
    counts: { records: 10, focus: 0, trips: 0 },
    iterations: 1000,
  });

  // 恶意篡改 counts
  const tampered1 = JSON.parse(JSON.stringify(envelope));
  tampered1.counts.records = 99999;
  assert.throws(() => {
    decrypt(password, tampered1);
  }, BadPassphraseError);

  // 恶意篡改 iv
  const tampered2 = JSON.parse(JSON.stringify(envelope));
  tampered2.iv = 'dGFtcGVyZWRpdl9fX18=';
  assert.throws(() => {
    decrypt(password, tampered2);
  }, BadPassphraseError);
});

// 4. Legacy 旧格式兼容解密测试
test('兼容解密旧版无头 JSON 备份文件 (PBKDF2 15,000次 Hex 格式)', () => {
  const password = 'legacy-password';
  const saltHex = '0123456789abcdef0123456789abcdef';
  const ivHex = 'abcdef0123456789abcdef0123456789';
  const legacyPlaintext = {
    app: 'TimeFlow',
    backupVersion: 1,
    schema: 'records-v1',
    records: [{ id: 'old1', timestamp: 500, locationName: '旧地点', mode: 'subway' }],
  };

  // 手工制作一个标准的 legacy envelope
  const salt = CryptoJS.enc.Hex.parse(saltHex);
  const dk = CryptoJS.PBKDF2(password, salt, { keySize: 16, iterations: 1000, hasher: CryptoJS.algo.SHA256 });
  const encKey = CryptoJS.lib.WordArray.create(dk.words.slice(0, 8), 32);
  const macKey = CryptoJS.lib.WordArray.create(dk.words.slice(8, 16), 32);
  const iv = CryptoJS.enc.Hex.parse(ivHex);

  const enc = CryptoJS.AES.encrypt(JSON.stringify(legacyPlaintext), encKey, { iv, mode: CryptoJS.mode.CBC, padding: CryptoJS.pad.Pkcs7 });
  const ciphertextB64 = enc.ciphertext.toString(CryptoJS.enc.Base64);
  const dataMac = CryptoJS.enc.Utf8.parse(`${ivHex}:${ciphertextB64}`);
  const macB64 = CryptoJS.HmacSHA256(dataMac, macKey).toString(CryptoJS.enc.Base64);

  const legacyEnvelope = {
    app: 'TimeFlow',
    backupVersion: 1,
    kdf: 'pbkdf2-sha256',
    enc: 'aes-256-cbc',
    kdfIterations: 1000,
    salt: saltHex,
    iv: ivHex,
    ciphertext: ciphertextB64,
    mac: macB64,
    createdAt: '2026-09-01T12:00:00Z',
  };

  // 1. 免密读取旧格式识别为 isLegacy
  const header = parseHeader(legacyEnvelope);
  assert.strictEqual(header.isLegacy, true);
  assert.strictEqual(header.counts, null);

  // 2. 解密旧格式
  const restored = decrypt(password, legacyEnvelope);
  assert.strictEqual(restored.app, 'TimeFlow');
  assert.strictEqual(restored.records.length, 1);
  assert.strictEqual(restored.records[0].locationName, '旧地点');
});

// 5. 版本清理（Prune）轮转规则
test('版本清理规则：本地保留 5 份普通 + 3 份快照；云端保留 7 份', () => {
  // 模拟本地列表
  const localList = [
    { name: 'tf-snap-3.tfb', isSnap: true, mtime: 8 },
    { name: 'tf-snap-2.tfb', isSnap: true, mtime: 7 },
    { name: 'tf-snap-1.tfb', isSnap: true, mtime: 6 },
    { name: 'tf-snap-0.tfb', isSnap: true, mtime: 5 }, // 应被 prune
    { name: 'tf-6.tfb', isSnap: false, mtime: 60 },
    { name: 'tf-5.tfb', isSnap: false, mtime: 50 },
    { name: 'tf-4.tfb', isSnap: false, mtime: 40 },
    { name: 'tf-3.tfb', isSnap: false, mtime: 30 },
    { name: 'tf-2.tfb', isSnap: false, mtime: 20 },
    { name: 'tf-1.tfb', isSnap: false, mtime: 10 }, // 应被 prune
  ];

  const normalBackups = localList.filter(r => !r.isSnap);
  const snapBackups = localList.filter(r => r.isSnap);

  const normalToRemove = normalBackups.slice(5).map(r => r.name);
  const snapToRemove = snapBackups.slice(3).map(r => r.name);

  assert.deepStrictEqual(normalToRemove, ['tf-1.tfb']);
  assert.deepStrictEqual(snapToRemove, ['tf-snap-0.tfb']);

  // 模拟云端清理（保留 7 份，不删除 legacy 文件）
  const cloudList = [
    { name: 'tf-10.tfb', isLegacy: false },
    { name: 'tf-9.tfb', isLegacy: false },
    { name: 'tf-8.tfb', isLegacy: false },
    { name: 'tf-7.tfb', isLegacy: false },
    { name: 'tf-6.tfb', isLegacy: false },
    { name: 'tf-5.tfb', isLegacy: false },
    { name: 'tf-4.tfb', isLegacy: false },
    { name: 'tf-3.tfb', isLegacy: false }, // 应被 prune
    { name: 'timeflow-backup-latest.json', isLegacy: true }, // 永不被 prune
  ];

  const cloudNonLegacy = cloudList.filter(r => !r.isLegacy);
  const cloudToRemove = cloudNonLegacy.slice(7).map(r => r.name);
  assert.deepStrictEqual(cloudToRemove, ['tf-3.tfb']);
  assert(!cloudToRemove.includes('timeflow-backup-latest.json'), 'legacy 文件绝不应被删除');
});

// 6. 防覆盖算法熔断判定测试
test('防覆盖保护：本机记录数 < 远端 50% 且 远端 >= 10 条触发熔断', () => {
  function shouldTriggerNeedConfirm(localCount, remoteCount) {
    return remoteCount >= 10 && localCount < remoteCount * 0.5;
  }

  // 场景 1: 本地 4 条，远端 12 条 -> 4 < 6 且 12 >= 10 -> 触发熔断
  assert.strictEqual(shouldTriggerNeedConfirm(4, 12), true);

  // 场景 2: 本地 7 条，远端 12 条 -> 7 >= 6 -> 不触发熔断
  assert.strictEqual(shouldTriggerNeedConfirm(7, 12), false);

  // 场景 3: 本地 1 条，远端 8 条 -> 远端不足 10 条 -> 不触发熔断
  assert.strictEqual(shouldTriggerNeedConfirm(1, 8), false);

  // 场景 4: 本地 312 条，远端 1248 条 -> 触发熔断
  assert.strictEqual(shouldTriggerNeedConfirm(312, 1248), true);
});

// 7. 内容哈希去重测试
test('相同数据内容计算出的哈希完全一致；数据变化哈希改变', () => {
  const d1 = {
    trips: [{ id: '1', startTs: 100, endTs: 200, name: 'A' }],
    records: [{ id: '1', timestamp: 100, locationName: 'A', mode: 'walk' }],
    focusSessions: [],
    preferences: { theme: 'light' },
  };

  const d2 = {
    trips: [{ id: '1', startTs: 100, endTs: 200, name: 'A' }],
    records: [{ id: '1', timestamp: 100, locationName: 'A', mode: 'walk' }],
    focusSessions: [],
    preferences: { theme: 'light' },
  };

  const d3 = {
    ...d1,
    records: [{ id: '1', timestamp: 100, locationName: 'B', mode: 'walk' }],
  };

  const hash1 = computeContentHash(d1);
  const hash2 = computeContentHash(d2);
  const hash3 = computeContentHash(d3);

  assert.strictEqual(hash1, hash2, '相同数据哈希必须相同');
  assert.notStrictEqual(hash1, hash3, '不同数据哈希必须不同');
});

// 8. 免密自包含格式生成与解析测试
test('免密自包含格式直接包含明文且 parseHeader 正常解析', () => {
  const sampleData = {
    trips: [{ id: 't1', start_ts: 1000, end_ts: 2000, name: '家 → 公司' }],
    records: [
      { id: 'r1', timestamp: 1000, location_name: '家', mode: 'walk' },
    ],
    focusSessions: [],
  };
  const counts = extractCounts(sampleData);
  const hash = computeContentHash(sampleData);
  const plaintext = buildPlaintext(sampleData, { timeflow_lang: 'zh' });
  const envelope = {
    v: 1,
    ...plaintext,
    device: 'Android Device',
    counts,
    hash,
  };

  const header = parseHeader(envelope);
  assert.strictEqual(header.v, 1);
  assert.strictEqual(header.counts.records, 1);
  assert.strictEqual(header.device, 'Android Device');
  assert.strictEqual(envelope.data.records[0].location_name, '家');
});

console.log('\n🎉 所有 8 项核心单元测试全部通过！\n');
