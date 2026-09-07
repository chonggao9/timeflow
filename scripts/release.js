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

// 从本机 .env / .env.local（git-ignored）加载令牌：避免把密钥明文贴进聊天/会话记录。
// 用 dotenv.parse 解析：正确处理 inline `#` 注释、export 前缀、引号、空值（普通正则做不到）。
// 覆盖 .env（优先）+ .env.local（优先于 .env）；优先级：已有环境变量(非空) > .env.local > .env。
// 必须在读取 EXPO_TOKEN/GH_TOKEN 之前执行。
const dotenv = require('dotenv');

function loadEnvFile(file) {
  try { return dotenv.parse(fs.readFileSync(file, 'utf8')); }
  catch (e) { return {}; } // 文件不存在/不可读 → 视为无，避免未捕获错误栈
}
const fileEnv = { ...loadEnvFile(path.join(ROOT, '.env')), ...loadEnvFile(path.join(ROOT, '.env.local')) };

function resolveEnv(key) {
  const v = process.env[key];
  if (v !== undefined && v !== '') return v; // 已有有效值(空串视为未设) → 优先，文件仅兜底
  return fileEnv[key];
}
const EXPO_TOKEN = resolveEnv('EXPO_TOKEN');
const GH_TOKEN = resolveEnv('GH_TOKEN');

function fail(msg) { console.error('\n[release] ✗ ' + msg); process.exit(1); }
function step(msg) { console.log('\n[release] ▶ ' + msg); }

// ---- 1. 前置检查 ----
if (!EXPO_TOKEN) fail('缺少 EXPO_TOKEN 环境变量');
if (!GH_TOKEN) fail('缺少 GH_TOKEN 环境变量');

// ---- 1.5 静态代码审查与未声明变量门禁 ----
step('执行代码静态审查与未声明变量扫描');
try {
  execSync(`node "${path.join(__dirname, 'audit_code.js')}"`, { stdio: 'inherit' });
} catch (e) {
  fail('代码静态审查未通过，已终止发版！请修复上述代码问题后重试。');
}

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
        body: `TimeFlow v${next}\n\n### 🚀 更新与优化内容\n- **UI 全面焕新升级**：引入现代流体卡片设计、暖色双板质感、动态水波纹打卡主按钮与悬浮灵动定位胶囊状态条；\n- **补记打卡（方向 A）**：支持离线/遗漏场景下的快捷补记打卡，具备时间偏移选取、常用地点快选与出行方式指定能力；\n- **弱网与离线地点快选**：重命名与补卡模态框内自动提取历史高频地点 Chip，弱网环境下秒级一触即选；\n- **桌面小组件规范对齐**：全面同步上下内嵌流体卡片视觉体系，增加出行方式 Emoji 动态映射与最新地点实时时间同步；\n- **全方位代码审查与架构优化**：\n  * 修复补卡未刷新行程活跃时间戳 (BUG-1)；\n  * 消除切回前台双重 SQLite 查库，提速 App 唤醒渲染 (BUG-2)；\n  * 补全轨迹查看按钮国际化词条 (BUG-3)；\n  * 补卡保存增加原子防重锁与防抖冷却 (Q-4)；\n  * 时间轴脉冲动画抽离并按需挂载，消除历史节点冗余动效循环 (Q-3)；\n  * 统一小组件占位符规范为 {n}，强化模态框 Chip 键名唯一性 (Q-1, Q-2, Q-5)。\n\n安装：下载下方 APK 即可直接安装。`,
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
