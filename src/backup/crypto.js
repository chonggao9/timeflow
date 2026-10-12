// 备份加密核心：PBKDF2-SHA256 派生密钥 + AES-256-CBC 加密 + HMAC-SHA256 认证。
//
// 新规范（v1，.tfb 格式）：
//   {
//     "v": 1,
//     "createdAt": "2026-10-12T18:15:00+08:00",
//     "device": "Pixel 7",
//     "counts": { "records": 1248, "focus": 36, "trips": 210 },
//     "hash": "<明文内容 SHA-256>",
//     "kdf": { "alg": "PBKDF2-SHA256", "iter": 200000, "salt": "<base64>" },
//     "iv": "<base64>",
//     "ciphertext": "<base64>",
//     "mac": "<base64>"
//   }
// 文件头（除 ciphertext 外）为明文，供版本列表免密直接预览；
// MAC 覆盖头部关键信息（v, kdf, iv, counts）与密文，防止头部篡改；
// 同时完全向下兼容旧版无头 JSON 备份（PBKDF2 15,000 次，Hex 格式）。

import CryptoJS from 'crypto-js';

export const TFB_VERSION = 1;
export const TFB_KDF_ITERATIONS = 200000;
export const LEGACY_KDF_ITERATIONS = 15000;
const SALT_BYTES = 16;
const IV_BYTES = 16;
const KEY_BYTES = 64; // 前 32B=AES 密钥，后 32B=HMAC 密钥

export class BadPassphraseError extends Error {
  constructor(message = '密码不正确或文件已损坏') {
    super(message);
    this.name = 'BadPassphraseError';
  }
}

// WordArray 随机数生成
export function randomBytesBase64(n) {
  return CryptoJS.lib.WordArray.random(n).toString(CryptoJS.enc.Base64);
}

export function randomBytesHex(n) {
  return CryptoJS.lib.WordArray.random(n).toString(CryptoJS.enc.Hex);
}

// PBKDF2 派生双密钥（支持 Base64 或 Hex 输入的 salt）
function deriveKeys(passphrase, saltInput, iterations) {
  let salt;
  if (typeof saltInput === 'string' && saltInput.length === 32 && /^[0-9a-fA-F]+$/.test(saltInput)) {
    salt = CryptoJS.enc.Hex.parse(saltInput);
  } else {
    try {
      salt = CryptoJS.enc.Base64.parse(saltInput);
    } catch (e) {
      salt = CryptoJS.enc.Utf8.parse(saltInput);
    }
  }

  const dk = CryptoJS.PBKDF2(passphrase, salt, {
    keySize: KEY_BYTES / 4,
    iterations: iterations || TFB_KDF_ITERATIONS,
    hasher: CryptoJS.algo.SHA256,
  });

  const encKey = CryptoJS.lib.WordArray.create(dk.words.slice(0, 8), 32);
  const macKey = CryptoJS.lib.WordArray.create(dk.words.slice(8, 16), 32);
  return { encKey, macKey };
}

// 常数时间字符串对比（防时序攻击）
function ctEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// 计算 .tfb 规范的 MAC：覆盖关键头部 + 密文
function computeTfbMac(macKey, { v, kdf, iv, counts, ciphertext }) {
  const normCounts = `${counts?.records || 0}:${counts?.focus || 0}:${counts?.trips || 0}`;
  const authPayload = `v${v}|${kdf?.alg}|${kdf?.iter}|${kdf?.salt}|${iv}|${normCounts}|${ciphertext}`;
  const data = CryptoJS.enc.Utf8.parse(authPayload);
  return CryptoJS.HmacSHA256(data, macKey).toString(CryptoJS.enc.Base64);
}

// 计算旧版 legacy MAC
function computeLegacyMac(macKey, ivHex, ciphertextB64) {
  const data = CryptoJS.enc.Utf8.parse(`${ivHex}:${ciphertextB64}`);
  return CryptoJS.HmacSHA256(data, macKey).toString(CryptoJS.enc.Base64);
}

/**
 * 加密打包为 .tfb 格式
 * @param {string} passphrase - 用户密码
 * @param {object} plaintextObj - 明文数据包
 * @param {object} meta - 外部元数据 { device, counts, hash, createdAt, iterations }
 */
export function encrypt(passphrase, plaintextObj, meta = {}) {
  const iterations = meta.iterations || TFB_KDF_ITERATIONS;
  const saltB64 = meta.saltB64 || randomBytesBase64(SALT_BYTES);
  const ivB64 = meta.ivB64 || randomBytesBase64(IV_BYTES);
  const createdAt = meta.createdAt || new Date().toISOString();
  const device = meta.device || 'Android';
  const counts = meta.counts || { records: 0, focus: 0, trips: 0 };
  const hash = meta.hash || '';

  const { encKey, macKey } = deriveKeys(passphrase, saltB64, iterations);
  const iv = CryptoJS.enc.Base64.parse(ivB64);
  const plainStr = typeof plaintextObj === 'string' ? plaintextObj : JSON.stringify(plaintextObj);

  const enc = CryptoJS.AES.encrypt(plainStr, encKey, {
    iv,
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7,
  });
  const ciphertextB64 = enc.ciphertext.toString(CryptoJS.enc.Base64);

  const kdfObj = {
    alg: 'PBKDF2-SHA256',
    iter: iterations,
    salt: saltB64,
  };

  const macB64 = computeTfbMac(macKey, {
    v: TFB_VERSION,
    kdf: kdfObj,
    iv: ivB64,
    counts,
    ciphertext: ciphertextB64,
  });

  return {
    v: TFB_VERSION,
    createdAt,
    device,
    counts,
    hash,
    kdf: kdfObj,
    iv: ivB64,
    ciphertext: ciphertextB64,
    mac: macB64,
  };
}

/**
 * 解密包（自动识别并兼容 .tfb 新版与 legacy 旧版）
 */
export function decrypt(passphrase, envelope) {
  if (!envelope || typeof envelope !== 'object') {
    throw new BadPassphraseError('无效的备份文件格式');
  }

  // 1. 新版 .tfb (带有 v: 1)
  if (envelope.v === 1) {
    try {
      const kdf = envelope.kdf || {};
      const iterations = kdf.iter || TFB_KDF_ITERATIONS;
      const saltB64 = kdf.salt;
      const ivB64 = envelope.iv;
      const ciphertextB64 = envelope.ciphertext;

      if (!saltB64 || !ivB64 || !ciphertextB64) {
        throw new BadPassphraseError('备份文件关键字段缺失');
      }

      const { encKey, macKey } = deriveKeys(passphrase, saltB64, iterations);
      const expectedMac = computeTfbMac(macKey, {
        v: envelope.v,
        kdf,
        iv: ivB64,
        counts: envelope.counts,
        ciphertext: ciphertextB64,
      });

      if (!ctEqual(expectedMac, envelope.mac || '')) {
        throw new BadPassphraseError('密码不正确或文件已损坏');
      }

      const iv = CryptoJS.enc.Base64.parse(ivB64);
      const ct = CryptoJS.enc.Base64.parse(ciphertextB64);
      const decrypted = CryptoJS.AES.decrypt(
        CryptoJS.lib.CipherParams.create({ ciphertext: ct }),
        encKey,
        { iv, mode: CryptoJS.mode.CBC, padding: CryptoJS.pad.Pkcs7 }
      );

      const plainStr = decrypted.toString(CryptoJS.enc.Utf8);
      if (!plainStr) throw new BadPassphraseError('密码不正确或文件已损坏');
      return JSON.parse(plainStr);
    } catch (e) {
      if (e instanceof BadPassphraseError) throw e;
      throw new BadPassphraseError('密码不正确或文件已损坏');
    }
  }

  // 2. Legacy 旧版（无 v 字段，带有 backupVersion 或 app: TimeFlow）
  try {
    const iterations = envelope.kdfIterations || LEGACY_KDF_ITERATIONS;
    const salt = envelope.salt;
    const ivHex = envelope.iv;
    const ciphertextB64 = envelope.ciphertext;

    const { encKey, macKey } = deriveKeys(passphrase, salt, iterations);
    const expectedMac = computeLegacyMac(macKey, ivHex, ciphertextB64);

    if (!ctEqual(expectedMac, envelope.mac || '')) {
      throw new BadPassphraseError('密码不正确或文件已损坏');
    }

    const iv = CryptoJS.enc.Hex.parse(ivHex);
    const ct = CryptoJS.enc.Base64.parse(ciphertextB64);
    const decrypted = CryptoJS.AES.decrypt(
      CryptoJS.lib.CipherParams.create({ ciphertext: ct }),
      encKey,
      { iv, mode: CryptoJS.mode.CBC, padding: CryptoJS.pad.Pkcs7 }
    );

    const plainStr = decrypted.toString(CryptoJS.enc.Utf8);
    if (!plainStr) throw new BadPassphraseError('密码不正确或文件已损坏');
    return JSON.parse(plainStr);
  } catch (e) {
    if (e instanceof BadPassphraseError) throw e;
    throw new BadPassphraseError('密码不正确或文件已损坏');
  }
}

/**
 * 免密解析文件头信息（用于历史版本列表和恢复预览）
 */
export function parseHeader(rawOrObj) {
  let envelope = rawOrObj;
  if (typeof rawOrObj === 'string') {
    try {
      envelope = JSON.parse(rawOrObj);
    } catch (e) {
      return null;
    }
  }
  if (!envelope || typeof envelope !== 'object') return null;

  if (envelope.v === 1) {
    return {
      v: envelope.v,
      createdAt: envelope.createdAt,
      device: envelope.device || 'Android',
      counts: envelope.counts || { records: 0, focus: 0, trips: 0 },
      hash: envelope.hash || '',
      isLegacy: false,
    };
  }

  // Legacy 旧版
  if (envelope.app === 'TimeFlow' || envelope.backupVersion === 1) {
    return {
      v: 0,
      createdAt: envelope.createdAt,
      device: 'Legacy',
      counts: null, // 旧版头部无明文统计
      hash: '',
      isLegacy: true,
    };
  }

  return null;
}
