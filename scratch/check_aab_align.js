const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function checkElf(buf) {
  if (buf[0] !== 0x7f || buf[1] !== 0x45 || buf[2] !== 0x4c || buf[3] !== 0x46) {
    return { error: 'Not ELF' };
  }
  const is64 = buf[4] === 2;
  let phoff = is64 ? Number(buf.readBigInt64LE(32)) : buf.readUInt32LE(28);
  let phentsize = is64 ? buf.readUInt16LE(54) : buf.readUInt16LE(42);
  let phnum = is64 ? buf.readUInt16LE(56) : buf.readUInt16LE(44);

  let minLoadAlign = Infinity;
  for (let i = 0; i < phnum; i++) {
    const offset = phoff + i * phentsize;
    if (offset + phentsize > buf.length) break;
    const p_type = buf.readUInt32LE(offset);
    if (p_type === 1) { // PT_LOAD
      let p_align = is64 ? Number(buf.readBigUInt64LE(offset + 48)) : buf.readUInt32LE(offset + 28);
      if (p_align < minLoadAlign) minLoadAlign = p_align;
    }
  }
  return { is64, minLoadAlign, ok16k: minLoadAlign >= 16384 };
}

const tempDir = path.join(__dirname, 'temp_check_aab');
if (fs.existsSync(tempDir)) fs.rmSync(tempDir, { recursive: true, force: true });
fs.mkdirSync(tempDir);

const aabPath = path.resolve(__dirname, '../timeflow-v1.0.28.aab');
execSync(`tar -xf "${aabPath}" -C "${tempDir}" base/lib/arm64-v8a`);

const files = fs.readdirSync(path.join(tempDir, 'base/lib/arm64-v8a'));
const nonCompliant = [];
const compliant = [];

for (const file of files) {
  if (!file.endsWith('.so')) continue;
  const filePath = path.join(tempDir, 'base/lib/arm64-v8a', file);
  const buf = fs.readFileSync(filePath);
  const res = checkElf(buf);
  if (!res.ok16k) nonCompliant.push({ file, align: res.minLoadAlign });
  else compliant.push({ file, align: res.minLoadAlign });
}

console.log(`\n--- AAB 检查结果 (共 ${files.length} 个 arm64-v8a .so 文件) ---`);
console.log(`不兼容 16KB: ${nonCompliant.length}`);
console.log(`兼容 16KB: ${compliant.length}`);

fs.rmSync(tempDir, { recursive: true, force: true });
