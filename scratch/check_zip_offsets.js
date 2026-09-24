const fs = require('fs');

function checkZipOffsets(zipPath) {
  const buf = fs.readFileSync(zipPath);
  console.log(`Checking ${zipPath}...`);
  let pos = 0;
  let unaligned16k = 0;
  let unaligned4k = 0;
  let totalSo = 0;

  while (pos < buf.length - 4) {
    const sig = buf.readUInt32LE(pos);
    if (sig === 0x04034b50) { // Local file header
      const compression = buf.readUInt16LE(pos + 8);
      const fnLen = buf.readUInt16LE(pos + 26);
      const extraLen = buf.readUInt16LE(pos + 28);
      const filename = buf.toString('utf8', pos + 30, pos + 30 + fnLen);
      const dataOffset = pos + 30 + fnLen + extraLen;

      if (filename.endsWith('.so')) {
        totalSo++;
        const mod16k = dataOffset % 16384;
        const mod4k = dataOffset % 4096;
        if (mod16k !== 0) unaligned16k++;
        if (mod4k !== 0) unaligned4k++;
        if (mod16k !== 0) {
          // console.log(`  ${filename}: offset=${dataOffset} (comp=${compression}, mod4k=${mod4k}, mod16k=${mod16k})`);
        }
      }
      const compSize = buf.readUInt32LE(pos + 18);
      pos = dataOffset + compSize;
    } else {
      pos++;
    }
  }
  console.log(`Total .so: ${totalSo}, unaligned to 4KB: ${unaligned4k}, unaligned to 16KB: ${unaligned16k}`);
}

checkZipOffsets('d:/work/timeflow/timeflow-v1.0.28.apk');
checkZipOffsets('d:/work/timeflow/timeflow-v1.0.28.aab');
