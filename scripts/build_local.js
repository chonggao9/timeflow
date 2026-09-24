#!/usr/bin/env node
/**
 * TimeFlow 本地一键打包脚本
 * 
 * 用法:
 *   npm run build:local            # 打包 APK
 *   npm run build:local -- --aab   # 打包 Google Play AAB
 *   npm run build:aab              # 打包 AAB
 *   npm run build:local -- --skip-audit
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const ANDROID_DIR = path.join(ROOT, 'android');
const APP_JSON = path.join(ROOT, 'app.json');

const args = process.argv.slice(2);
const isAab = args.includes('--aab');
const skipAudit = args.includes('--skip-audit');

function step(msg) { console.log('\n[build:local] ▶ ' + msg); }
function fail(msg) { console.error('\n[build:local] ✗ ' + msg); process.exit(1); }

// 1. 确保环境变量
const javaHome = process.env.JAVA_HOME || 'D:\\Java\\jdk-17';
const androidHome = process.env.ANDROID_HOME || 'D:\\Android\\Sdk';
const gradleUserHome = process.env.GRADLE_USER_HOME || 'D:\\gradle_home';

const env = {
  ...process.env,
  JAVA_HOME: javaHome,
  ANDROID_HOME: androidHome,
  GRADLE_USER_HOME: gradleUserHome,
  Path: `${javaHome}\\bin;${androidHome}\\platform-tools;${process.env.Path || ''}`,
};

// 2. 检查 android 原生目录
if (!fs.existsSync(ANDROID_DIR)) {
  step('未检测到 android 目录，正在执行 expo prebuild...');
  try {
    execSync('npx expo prebuild --platform android --no-install', { cwd: ROOT, env, stdio: 'inherit' });
  } catch (e) {
    fail('expo prebuild 失败，请检查配置！');
  }
}

// 3. 代码门禁校验
if (!skipAudit) {
  step('执行代码静态审查与国际化校验');
  try {
    execSync(`node "${path.join(__dirname, 'audit_code.js')}"`, { stdio: 'inherit' });
    execSync(`node "${path.join(__dirname, 'check_i18n.js')}"`, { stdio: 'inherit' });
  } catch (e) {
    fail('代码检查未通过，请修复后重试或使用 --skip-audit 跳过！');
  }
}

// 4. 读取版本号
const appConfig = JSON.parse(fs.readFileSync(APP_JSON, 'utf8'));
const version = appConfig.expo?.version || '1.0.0';

// 5. 执行 Gradle 编译
const buildType = isAab ? 'AAB (bundleRelease)' : 'APK (assembleRelease)';
step(`开始本地 Gradle 编译 [${buildType}]...`);
const gradlewCmd = process.platform === 'win32' ? '.\\gradlew.bat' : './gradlew';
const gradleTask = isAab ? 'bundleRelease' : 'assembleRelease';

try {
  execSync(`${gradlewCmd} ${gradleTask}`, {
    cwd: ANDROID_DIR,
    env,
    stdio: 'inherit',
  });
} catch (e) {
  fail('Gradle 编译失败，请查看上方错误输出！');
}

// 6. 查找并拷贝生成的产物
const sourcePath = isAab
  ? path.join(ANDROID_DIR, 'app', 'build', 'outputs', 'bundle', 'release', 'app-release.aab')
  : path.join(ANDROID_DIR, 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk');

if (!fs.existsSync(sourcePath)) {
  fail(`未找到生成的构建文件: ${sourcePath}`);
}

const targetName = isAab ? `timeflow-v${version}.aab` : `timeflow-v${version}.apk`;
const targetPath = path.join(ROOT, targetName);

fs.copyFileSync(sourcePath, targetPath);
const sizeMb = (fs.statSync(targetPath).size / 1024 / 1024).toFixed(2);

console.log('\n========================================');
console.log(`✔ 本地打包成功！[${isAab ? 'Google Play AAB' : 'Android APK'}]`);
console.log(`  产物版本: v${version}`);
console.log(`  产物名称: ${targetName}`);
console.log(`  产物大小: ${sizeMb} MB`);
console.log(`  存放路径: ${targetPath}`);
console.log('========================================\n');
