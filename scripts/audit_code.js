const fs = require('fs');
const path = require('path');
const babel = require('@babel/core');

const JS_EXTS = ['.js', '.jsx', '.ts', '.tsx'];
const IGNORED_DIRS = ['node_modules', '.git', '.expo', 'dist', 'android', 'ios'];

// 标准全局环境白名单
const GLOBALS = new Set([
  'console', 'Date', 'Math', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval',
  'Promise', 'Object', 'Array', 'Map', 'Set', 'JSON', 'Number', 'String', 'Boolean', 'RegExp',
  'Error', 'TypeError', 'RangeError', 'SyntaxError', 'ReferenceError',
  '__DEV__', 'global', 'window', 'requestAnimationFrame', 'cancelAnimationFrame',
  'parseFloat', 'parseInt', 'isNaN', 'isFinite', 'encodeURIComponent', 'decodeURIComponent',
  'undefined', 'NaN', 'Infinity', 'Symbol', 'Proxy', 'Reflect', 'Intl', 'fetch', 'Headers', 'Request', 'Response', 'FormData', 'Blob', 'URL', 'URLSearchParams', 'AbortController',
  'require', 'module', 'exports', 'process',
]);

function getAllFiles(dir, fileList = []) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      if (!IGNORED_DIRS.includes(file)) {
        getAllFiles(fullPath, fileList);
      }
    } else if (JS_EXTS.includes(path.extname(file))) {
      fileList.push(fullPath);
    }
  }
  return fileList;
}

const targetDirs = [
  path.resolve(__dirname, '../App.js'),
  path.resolve(__dirname, '../index.js'),
  path.resolve(__dirname, '../src'),
  path.resolve(__dirname, '../widget'),
];

const allFiles = [];
for (const t of targetDirs) {
  if (fs.existsSync(t)) {
    if (fs.statSync(t).isDirectory()) {
      getAllFiles(t, allFiles);
    } else {
      allFiles.push(t);
    }
  }
}

console.log(`Auditing ${allFiles.length} source files for syntax & undeclared variables...\n`);

let totalIssues = 0;

for (const file of allFiles) {
  const code = fs.readFileSync(file, 'utf8');
  let ast;
  try {
    ast = babel.parseSync(code, {
      filename: file,
      presets: ['babel-preset-expo'],
      configFile: path.resolve(__dirname, '../babel.config.js'),
    });
  } catch (err) {
    console.error(`❌ Syntax Error in ${path.relative(process.cwd(), file)}: ${err.message}`);
    totalIssues++;
    continue;
  }

  const undeclared = [];
  babel.traverse(ast, {
    Identifier(p) {
      // 仅检查引用（非声明、非对象 key、非属性访问器右侧）
      if (!p.isReferencedIdentifier()) return;
      const name = p.node.name;
      if (GLOBALS.has(name)) return;
      if (p.scope.hasBinding(name)) return;
      // 避免重复报告
      if (!undeclared.includes(name)) {
        undeclared.push({ name, line: p.node.loc?.start?.line });
      }
    },
  });

  if (undeclared.length > 0) {
    console.error(`❌ Undeclared variable in ${path.relative(process.cwd(), file)}:`);
    for (const u of undeclared) {
      console.error(`   - Line ${u.line}: ${u.name}`);
      totalIssues++;
    }
  }
}

if (totalIssues === 0) {
  console.log(`✅ All ${allFiles.length} files passed audit with 0 undeclared variables and valid syntax!`);
} else {
  console.log(`\n⚠️ Audit completed with ${totalIssues} issue(s).`);
  process.exit(1);
}
