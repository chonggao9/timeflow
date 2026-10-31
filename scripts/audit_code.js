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

console.log(`Auditing ${allFiles.length} source files for syntax, undeclared variables & named imports...\n`);

let totalIssues = 0;

const moduleExportsCache = new Map();

function resolveLocalModule(sourcePath, currentFile) {
  if (!sourcePath.startsWith('.')) return null;
  const base = path.resolve(path.dirname(currentFile), sourcePath);
  const candidates = [
    base,
    base + '.js',
    base + '.jsx',
    base + '.ts',
    base + '.tsx',
    path.join(base, 'index.js'),
    path.join(base, 'index.ts'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c) && fs.statSync(c).isFile()) return c;
  }
  return null;
}

function getModuleExports(filePath) {
  if (moduleExportsCache.has(filePath)) return moduleExportsCache.get(filePath);
  const info = { namedExports: new Set(), hasStarExport: false, isDynamic: false };
  moduleExportsCache.set(filePath, info);

  if (!fs.existsSync(filePath) || filePath.endsWith('.d.ts') || filePath.endsWith('.json')) {
    info.isDynamic = true;
    return info;
  }

  const code = fs.readFileSync(filePath, 'utf8');
  let ast;
  try {
    ast = babel.parseSync(code, {
      filename: filePath,
      presets: ['babel-preset-expo'],
      configFile: path.resolve(__dirname, '../babel.config.js'),
    });
  } catch (e) {
    info.isDynamic = true;
    return info;
  }

  babel.traverse(ast, {
    ExportNamedDeclaration(p) {
      if (p.node.declaration) {
        const decl = p.node.declaration;
        if (decl.id && decl.id.name) {
          info.namedExports.add(decl.id.name);
        } else if (decl.declarations) {
          for (const d of decl.declarations) {
            if (d.id.name) {
              info.namedExports.add(d.id.name);
            } else if (d.id.properties) {
              for (const prop of d.id.properties) {
                if (prop.key && prop.key.name) info.namedExports.add(prop.key.name);
              }
            }
          }
        }
      }
      if (p.node.specifiers) {
        for (const spec of p.node.specifiers) {
          const name = spec.exported ? (spec.exported.name || spec.exported.value) : null;
          if (name) info.namedExports.add(name);
        }
      }
    },
    ExportAllDeclaration() {
      info.hasStarExport = true;
    },
    AssignmentExpression(p) {
      const left = p.node.left;
      if (left.type === 'MemberExpression') {
        if (left.object && left.object.name === 'module' && left.property && left.property.name === 'exports') {
          info.isDynamic = true;
        }
        if (left.object && left.object.name === 'exports') {
          info.isDynamic = true;
        }
      }
    },
  });

  return info;
}

for (const file of allFiles) {
  if (file.endsWith('.d.ts')) {
    continue;
  }
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
  const missingImports = [];

  babel.traverse(ast, {
    ImportDeclaration(p) {
      const source = p.node.source.value;
      const targetPath = resolveLocalModule(source, file);
      if (!targetPath || targetPath.endsWith('.json')) return;

      const exportsInfo = getModuleExports(targetPath);
      if (exportsInfo.isDynamic || exportsInfo.hasStarExport) return;

      for (const spec of p.node.specifiers) {
        if (spec.type === 'ImportSpecifier') {
          const importedName = spec.imported ? (spec.imported.name || spec.imported.value) : null;
          if (importedName && !exportsInfo.namedExports.has(importedName)) {
            missingImports.push({
              importedName,
              target: path.relative(process.cwd(), targetPath),
              line: spec.loc?.start?.line,
            });
          }
        }
      }
    },
    Identifier(p) {
      // 仅检查引用（非声明、非对象 key、非属性访问器右侧）
      if (!p.isReferencedIdentifier()) return;
      const name = p.node.name;
      if (GLOBALS.has(name)) return;
      if (p.scope.hasBinding(name)) return;
      // 避免重复报告
      if (!undeclared.some(u => u.name === name)) {
        undeclared.push({ name, line: p.node.loc?.start?.line });
      }
    },
  });

  if (missingImports.length > 0) {
    console.error(`❌ Missing named export imported in ${path.relative(process.cwd(), file)}:`);
    for (const m of missingImports) {
      console.error(`   - Line ${m.line}: "${m.importedName}" is not exported by ${m.target}`);
      totalIssues++;
    }
  }

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
