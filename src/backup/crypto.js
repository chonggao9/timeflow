// 备份加密核心：PBKDF2-SHA256 派生密钥 + AES-256-CBC 加密 + HMAC-SHA256 认证。
//
// 为什么不用 AES-GCM：crypto-js 官方核心包从未捆绑 GCM 模式（4.1.1 实测只有
// CBC/CFB/CTR/OFB/ECB，无 mode-gcm.js）。改用 CBC+HMAC（Encrypt-then-MAC）——两类
// 原语 crypto-js 都有，且 tag 由我们在 decrypt 里显式校验，比依赖 GCM 内部不透明的
// tag 处理更可控：错口令 → HMAC 不匹配 → 确定性抛 BadPassphraseError，绝不往下走 AES。
//
// 用 crypto-js（CJS、纯 JS、Hermes 可直接跑），而非 @noble/*（后者纯 ESM，Metro/Hermes
// 打包有风险）。crypto-js 自带 UTF8/Hex/Base64 编解码，规避 Hermes 缺 TextEncoder/btoa。
//
// 备份包外壳（envelope，JSON）：
//   { app:'TimeFlow', backupVersion:1, kdf:'pbkdf2-sha256', enc:'aes-256-cbc',
//     kdfIterations:150000, salt:'<hex 16B>', iv:'<hex 16B>',
//     ciphertext:'<base64 AES-CBC 密文>', mac:'<base64 HMAC-SHA256>',
//     createdAt:'ISO' }
// mac = HMAC-SHA256(macKey, `${ivHex}:${ciphertextB64}`)，把字面串纳入认证，避免规范化攻击。
import CryptoJS from 'crypto-js';

export const KDF_ITERATIONS = 150000;
const SALT_BYTES = 16;
const IV_BYTES = 16;   // AES 块大小
const KEY_BYTES = 64;  // PBKDF2 派生 64B，前 32B=AES 密钥，后 32B=HMAC 密钥

// 口令错误 / 文件损坏 / 篡改统一抛此错，调用方据此提示「口令错误或文件已损坏」。
export class BadPassphraseError extends Error {
  constructor(message = 'wrong passphrase or corrupted file') {
    super(message);
    this.name = 'BadPassphraseError';
  }
}

// 生成 n 字节随机，hex 编码。Hermes 下依赖 global.crypto（由 react-native-get-random-values 注入）。
export function randomBytesHex(n) {
  return CryptoJS.lib.WordArray.random(n).toString(CryptoJS.enc.Hex);
}

// PBKDF2 一次派生双密钥：encKey(AES-256) + macKey(HMAC)。
function deriveKeys(passphrase, saltHex, iterations) {
  const salt = CryptoJS.enc.Hex.parse(saltHex);
  const dk = CryptoJS.PBKDF2(passphrase, salt, {
    keySize: KEY_BYTES / 4, // 32-bit words = 64B
    iterations,
    hasher: CryptoJS.algo.SHA256,
  });
  const encKey = CryptoJS.lib.WordArray.create(dk.words.slice(0, 8), 32);
  const macKey = CryptoJS.lib.WordArray.create(dk.words.slice(8, 16), 32);
  return { encKey, macKey };
}

// HMAC-SHA256 over `${ivHex}:${ciphertextB64}`（认证字面串，双方一致即可复验）。
function computeMac(macKey, ivHex, ciphertextB64) {
  const data = CryptoJS.enc.Utf8.parse(`${ivHex}:${ciphertextB64}`);
  return CryptoJS.HmacSHA256(data, macKey).toString(CryptoJS.enc.Base64);
}

// 常数时间字符串比较（长度断定为两段，减少时序泄漏）。
function ctEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// 加密明文对象 → 加密外壳。opts 可注入固定 salt/iv/iterations（仅测试用）。
export function encrypt(passphrase, plaintextObj, opts = {}) {
  const saltHex = opts.saltHex || randomBytesHex(SALT_BYTES);
  const ivHex = opts.ivHex || randomBytesHex(IV_BYTES);
  const iterations = opts.iterations || KDF_ITERATIONS;
  const { encKey, macKey } = deriveKeys(passphrase, saltHex, iterations);
  const iv = CryptoJS.enc.Hex.parse(ivHex);

  const plainStr = typeof plaintextObj === 'string' ? plaintextObj : JSON.stringify(plaintextObj);
  const enc = CryptoJS.AES.encrypt(plainStr, encKey, {
    iv,
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7,
  });
  const ciphertextB64 = enc.ciphertext.toString(CryptoJS.enc.Base64);

  return {
    app: 'TimeFlow',
    backupVersion: 1,
    kdf: 'pbkdf2-sha256',
    enc: 'aes-256-cbc',
    kdfIterations: iterations,
    salt: saltHex,
    iv: ivHex,
    ciphertext: ciphertextB64,
    mac: computeMac(macKey, ivHex, ciphertextB64),
    createdAt: new Date().toISOString(),
  };
}

// 解密外壳 → 明文对象。先验 HMAC：错口令 / 篡改 → 不匹配 → BadPassphraseError。
export function decrypt(passphrase, envelope) {
  try {
    const iterations = envelope?.kdfIterations || KDF_ITERATIONS;
    const { encKey, macKey } = deriveKeys(passphrase, envelope.salt, iterations);

    const expectedMac = computeMac(macKey, envelope.iv, envelope.ciphertext);
    if (!ctEqual(expectedMac, envelope.mac || '')) throw new Error('mac mismatch');

    const iv = CryptoJS.enc.Hex.parse(envelope.iv);
    const ct = CryptoJS.enc.Base64.parse(envelope.ciphertext);
    const decrypted = CryptoJS.AES.decrypt(
      CryptoJS.lib.CipherParams.create({ ciphertext: ct }),
      encKey,
      { iv, mode: CryptoJS.mode.CBC, padding: CryptoJS.pad.Pkcs7 },
    );

    const plainStr = decrypted.toString(CryptoJS.enc.Utf8);
    if (!plainStr) throw new Error('empty plaintext');
    return JSON.parse(plainStr);
  } catch (e) {
    if (e instanceof BadPassphraseError) throw e;
    throw new BadPassphraseError(e && e.message);
  }
}
