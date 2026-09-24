const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// We can extract an arm64-v8a so file and check ELF headers
// Or use node to parse ELF headers directly
function checkElf(buf) {
  // Check magic \x7fELF
  if (buf[0] !== 0x7f || buf[1] !== 0x45 || buf[2] !== 0x4c || buf[3] !== 0x46) {
    return { error: 'Not ELF' };
  }
  const is64 = buf[4] === 2; // ELFCLASS64
  let phoff = 0;
  let phentsize = 0;
  let phnum = 0;

  if (is64) {
    phoff = Number(buf.readBigInt64LE(32));
    phentsize = buf.readUInt16LE(54);
    phnum = buf.readUInt16LE(56);
  } else {
    phoff = buf.readUInt32LE(28);
    phentsize = buf.readUInt16LE(42);
    phnum = buf.readUInt16LE(44);
  }

  let minLoadAlign = Infinity;
  let hasPtLoad = false;

  for (let i = 0; i < phnum; i++) {
    const offset = phoff + i * phentsize;
    if (offset + phentsize > buf.length) break;
    const p_type = buf.readUInt32LE(offset);
    if (p_type === 1) { // PT_LOAD
      hasPtLoad = true;
      let p_align = 0;
      if (is64) {
        p_align = Number(buf.readBigUInt64LE(offset + 48));
      } else {
        p_align = buf.readUInt32LE(offset + 28);
      }
      if (p_align < minLoadAlign) {
        minLoadAlign = p_align;
      }
    }
  }

  return { is64, minLoadAlign, ok16k: minLoadAlign >= 16384 };
}

// Let's test on unzipped libs
const tempDir = path.join(__dirname, 'temp_check_lib');
if (fs.existsSync(tempDir)) fs.rmSync(tempDir, { recursive: true, force: true });
fs.mkdirSync(tempDir);

// Extract APK
console.log('Extracting APK arm64-v8a so files...');
const apkPath = path.resolve(__dirname, '../timeflow-v1.0.28.apk');
execSync(`tar -xf "${apkPath}" -C "${tempDir}" lib/arm64-v8a`);

const files = fs.readdirSync(path.join(tempDir, 'lib/arm64-v8a'));
const nonCompliant = [];
const compliant = [];

for (const file of files) {
  if (!file.endsWith('.so')) continue;
  const filePath = path.join(tempDir, 'lib/arm64-v8a', file);
  const buf = fs.readFileSync(filePath);
  const res = checkElf(buf);
  if (!res.ok16k) {
    nonCompliant.push({ file, align: res.minLoadAlign });
  } else {
    compliant.push({ file, align: res.minLoadAlign });
  }
}

console.log(`\n--- 检查结果 (共 ${files.length} 个 arm64-v8a .so 文件) ---`);
console.log(`不兼容 16KB (对齐 < 16384) 数量: ${nonCompliant.length}`);
nonCompliant.forEach(x => console.log(`  ❌ ${x.file}: align = ${x.align}`));
console.log(`\n兼容 16KB 数量: ${compliant.length}`);
compliant.forEach(x => console.log(`  ✅ ${x.file}: align = ${x.align}`));

fs.rmSync(tempDir, { recursive: true, force: true });
