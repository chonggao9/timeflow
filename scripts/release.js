#!/usr/bin/env node
/**
 * TimeFlow 一键发版脚本
 *
 * 流程：升版本号 → EAS 构建 Android APK → 下载 → 发布 GitHub Release + 上传 APK
 *
 * 用法：
 *   npm run release                   # 自动 patch+1（1.0.11 → 1.0.12）
 *   npm run release -- --version 1.1.0    # 指定版本号
 *   npm run release -- --commit --push    # 同时提交并推送 app.json 版本改动
 *
 * 需要环境变量：
 *   EXPO_TOKEN  EAS 访问令牌（构建用；expo.dev/settings/access-tokens）
 *   GH_TOKEN    GitHub classic token（repo 权限；github.com/settings/tokens）
 *
 * 前置要求：本地已登录/可调 EAS（eas CLI 在 PATH）；构建走 eas.json 的 preview profile（APK）。
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const APP_JSON = path.join(ROOT, 'app.json');
const REPO = 'chonggao9/timeflow';

const args = process.argv.slice(2);
const val = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const versionArg = val('--version');
const doCommit = args.includes('--commit');
const doPush = args.includes('--push');

// 从本机 .env.local（git-ignored）加载令牌：避免把密钥明文贴进聊天/会话记录。
// 必须在读取 EXPO_TOKEN/GH_TOKEN 之前执行；已存在的环境变量优先，文件值仅作兜底。
const envLocal = path.join(ROOT, '.env.local');
if (fs.existsSync(envLocal)) {
  for (const line of fs.readFileSync(envLocal, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    const [, key, raw] = m;
    const val = raw.replace(/^(['"])(.*)\1$/, '$2'); // 去首尾引号
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

const EXPO_TOKEN = process.env.EXPO_TOKEN;
const GH_TOKEN = process.env.GH_TOKEN;

function fail(msg) { console.error('\n[release] ✗ ' + msg); process.exit(1); }
function step(msg) { console.log('\n[release] ▶ ' + msg); }

// ---- 1. 前置检查 ----
if (!EXPO_TOKEN) fail('缺少 EXPO_TOKEN 环境变量');
if (!GH_TOKEN) fail('缺少 GH_TOKEN 环境变量');

// ---- 2. 版本号（app.json 里在 expo.version 下）----
const app = JSON.parse(fs.readFileSync(APP_JSON, 'utf8'));
const cur = app.expo.version;
let next;
if (versionArg) {
  if (!/^\d+\.\d+\.\d+$/.test(versionArg)) fail(`非法版本号: ${versionArg}`);
  next = versionArg;
} else {
  const [maj, min, pat] = cur.split('.').map(Number);
  next = `${maj}.${min}.${pat + 1}`;
}
step(`版本 ${cur} → ${next}`);
app.expo.version = next;
fs.writeFileSync(APP_JSON, JSON.stringify(app, null, 2) + '\n');

// ---- 3. 可选：提交/推送 app.json ----
if (doCommit) {
  step('提交 app.json');
  execSync('git add app.json', { cwd: ROOT, stdio: 'inherit' });
  execSync(`git commit -m "release v${next}"`, { cwd: ROOT, stdio: 'inherit' });
  if (doPush) { step('推送 origin'); execSync('git push', { cwd: ROOT, stdio: 'inherit' }); }
}

// ---- 4. EAS 构建（走 shell，Windows 下能正确找到 eas.cmd）----
step('EAS 构建 Android APK（preview profile），约 15-30 分钟');
try {
  execSync('eas build --platform android --profile preview --non-interactive', {
    cwd: ROOT, env: { ...process.env, EXPO_TOKEN }, stdio: 'inherit',
  });
} catch (e) {
  fail('EAS 构建失败（检查额度/登录）');
}

// ---- 5. 取最新构建并下载 APK ----
let builds;
try {
  builds = JSON.parse(execSync(
    'eas build:list --platform android --limit 1 --json --non-interactive',
    { cwd: ROOT, env: { ...process.env, EXPO_TOKEN }, encoding: 'utf8' }
  ));
} catch (e) {
  fail('查询构建列表失败');
}
const b = builds && builds[0];
if (!b) fail('未找到构建记录');
if (b.status !== 'FINISHED') fail(`最新构建状态为 ${b.status}，不是 FINISHED`);
step(`构建完成 ${b.id}（appVersion ${b.appVersion || '-'}）`);

let dlOut;
try {
  dlOut = execSync(`eas build:download --build-id ${b.id} --non-interactive`, {
    cwd: ROOT, env: { ...process.env, EXPO_TOKEN }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
  });
} catch (e) {
  fail('APK 下载失败');
}
const dl = dlOut.match(/downloaded to (.+\.apk)/i);
if (!dl) fail('未能定位下载的 APK 路径');
const apkName = `timeflow-v${next}.apk`;
const apkPath = path.join(ROOT, apkName);
fs.copyFileSync(dl[1].trim(), apkPath);
step(`APK → ${apkName}（${(fs.statSync(apkPath).size / 1024 / 1024).toFixed(1)} MB）`);

// ---- 6. 发布 GitHub Release + 上传 APK ----
async function gh(url, opts = {}) {
  const res = await fetch(url, {
    ...opts,
    headers: {
      ...(opts.headers || {}),
      Authorization: `Bearer ${GH_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`HTTP ${res.status} ${j.message || ''}`);
  return j;
}

(async () => {
  try {
    step(`创建 GitHub Release v${next}`);
    const release = await gh(`https://api.github.com/repos/${REPO}/releases`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tag_name: `v${next}`,
        name: `v${next}`,
        body: `TimeFlow v${next}\n\n安装：下载下方 APK。`,
        draft: false,
        prerelease: false,
      }),
    });
    const uploadBase = release.upload_url.split('{')[0];
    step(`上传 APK 资产（${(fs.statSync(apkPath).size / 1024 / 1024).toFixed(1)} MB）`);
    const asset = await gh(`${uploadBase}?name=${encodeURIComponent(apkName)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/vnd.android.package-archive' },
      body: fs.readFileSync(apkPath),
    });
    console.log('\n[release] ✔ 完成');
    console.log('   Release:', release.html_url);
    console.log('   APK:    ', asset.browser_download_url);
  } catch (e) {
    fail(`GitHub 发布失败：${e.message}`);
  }
})();
