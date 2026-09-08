const fs = require('fs');
const path = require('path');
const { translations } = require('../src/i18n/translations.js');

const zhKeys = new Set(Object.keys(translations.zh));
const enKeys = new Set(Object.keys(translations.en));

console.log('--- 1. Dictionary Symmetry Check ---');
const missingInEn = [...zhKeys].filter(k => !enKeys.has(k));
const missingInZh = [...enKeys].filter(k => !zhKeys.has(k));
console.log(`ZH dictionary keys: ${zhKeys.size}`);
console.log(`EN dictionary keys: ${enKeys.size}`);
if (missingInEn.length === 0 && missingInZh.length === 0) {
  console.log('✅ ZH and EN dictionaries are 100% symmetric (0 missing).');
} else {
  console.log('❌ Missing in EN:', missingInEn);
  console.log('❌ Missing in ZH:', missingInZh);
}

console.log('\n--- 2. Codebase Reference Check ---');
function findFiles(dir, exts) {
  let files = [];
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, item.name);
    if (item.isDirectory()) {
      if (item.name !== 'node_modules' && item.name !== '.git') {
        files = files.concat(findFiles(full, exts));
      }
    } else if (exts.some(ext => item.name.endsWith(ext))) {
      files.push(full);
    }
  }
  return files;
}

const files = findFiles(path.join(__dirname, '../src'), ['.js', '.jsx']);
const usedKeys = new Map();

// 匹配 t('key') 或 t("key") 或 t(`key`)
const regex = /\bt\(\s*['"`]([^'"`$]+)['"`]/g;
// 匹配动态 t(variable) 或 t(`template_${var}`)
const dynamicRegex = /\bt\(\s*([a-zA-Z0-9_$.]+|`[^`]*\$\{)/g;

for (const file of files) {
  const content = fs.readFileSync(file, 'utf8');
  const lines = content.split('\n');

  lines.forEach((line, lineIdx) => {
    const trimmed = line.trim();
    if (trimmed.startsWith('//') || trimmed.startsWith('*')) return; // 跳过注释行

    let match;
    while ((match = regex.exec(line)) !== null) {
      const key = match[1];
      if (key.endsWith('.')) continue;
      if (!usedKeys.has(key)) usedKeys.set(key, []);
      usedKeys.get(key).push(`${path.relative(path.join(__dirname, '..'), file)}:${lineIdx + 1}`);
    }

    let dynMatch;
    while ((dynMatch = dynamicRegex.exec(line)) !== null) {
      const expr = dynMatch[1];
      if (expr !== 'key' && !expr.startsWith("'") && !expr.startsWith('"')) {
        // 记录动态调用
      }
    }
  });
}

console.log(`Found ${usedKeys.size} distinct static t(...) keys across ${files.length} files (excluding comments).`);

const missingInDict = [];
for (const [key, fileList] of usedKeys.entries()) {
  if (!zhKeys.has(key)) {
    missingInDict.push({ key, files: fileList });
  }
}

if (missingInDict.length === 0) {
  console.log('✅ All statically referenced t(...) keys are defined in the dictionary!');
} else {
  console.log(`❌ Found ${missingInDict.length} missing key(s):`);
  missingInDict.forEach(({ key, files }) => {
    console.log(`   - "${key}" in: ${files.join(', ')}`);
  });
}

// 检查可能存在的动态键，如 mode.*
console.log('\n--- 3. Dynamic Mode Keys Check ---');
const MODES = ['walk', 'bike', 'drive', 'taxi', 'subway', 'transit', 'train', 'flight', 'boat'];
const missingModes = MODES.filter(m => !zhKeys.has(`mode.${m}`) || !enKeys.has(`mode.${m}`));
if (missingModes.length === 0) {
  console.log('✅ All 9 transport modes (mode.*) are defined in both ZH and EN.');
} else {
  console.log('❌ Missing mode keys:', missingModes);
}
