const fs = require('fs');
const path = require('path');

const showcasePath = path.join(__dirname, '../designs/timeflow-redesign/live_app_showcase.html');
const showcaseHtml = fs.readFileSync(showcasePath, 'utf8');

// Extract CSS from live_app_showcase.html
const styleMatch = showcaseHtml.match(/<style>([\s\S]*?)<\/style>/);
const baseCss = styleMatch ? styleMatch[1] : '';

// Extract the 4 phone-frame HTML blocks
function extractPhoneFrames(html) {
  const parts = html.split('<div class="screen-card-col">');
  const frames = [];
  for (let i = 1; i < parts.length; i++) {
    const part = parts[i];
    const startIdx = part.indexOf('<div class="phone-frame"');
    if (startIdx !== -1) {
      let depth = 0;
      let endIdx = -1;
      for (let j = startIdx; j < part.length; j++) {
        if (part.startsWith('<div', j)) {
          depth++;
        } else if (part.startsWith('</div', j)) {
          depth--;
          if (depth === 0) {
            endIdx = j + 6;
            break;
          }
        }
      }
      if (endIdx !== -1) {
        frames.push(part.substring(startIdx, endIdx));
      }
    }
  }
  return frames;
}

const framesZh = extractPhoneFrames(showcaseHtml);
console.log(`Extracted ${framesZh.length} phone frames from showcase.`);

// Translate frames into English
function translateFrame1(html) {
  return html
    .replaceAll('今天', 'Today')
    .replaceAll('9月8日 · 周二', 'Tue, Sep 8')
    .replaceAll('3 次打卡', '3 check-ins')
    .replaceAll('正在同步位置… · 零抖动', 'Syncing GPS location… · Smooth')
    .replaceAll('行程 1', 'Trip 1')
    .replaceAll('50分钟', '50 min')
    .replaceAll('🗺 轨迹', '🗺 Trail')
    .replaceAll('万象天地咖啡馆', 'MixC World Cafe')
    .replaceAll('<span>🚇 地铁</span><span>·</span><span class="dur">16 分钟</span>', '<span>🚇 Subway</span><span>·</span><span class="dur">16 min</span>')
    .replaceAll('科技园前海湾站', 'Hi-Tech Park Bay')
    .replaceAll('<span>🚶 步行</span><span>·</span><span class="dur">12 分钟</span>', '<span>🚶 Walk</span><span>·</span><span class="dur">12 min</span>')
    .replaceAll('阳光棕榈园', 'Palm Garden')
    .replaceAll('<span>步行</span>', '<span>Walk</span>')
    .replaceAll('<span>骑行</span>', '<span>Bike</span>')
    .replaceAll('<span>自驾</span>', '<span>Drive</span>')
    .replaceAll('<span>打车</span>', '<span>Taxi</span>')
    .replaceAll('<span>地铁</span>', '<span>Subway</span>')
    .replaceAll('<span>打 卡</span>', '<span>CHECK IN</span>')
    .replaceAll('● 轻按记录途经点 · 长按蓄力结程', '● Tap to log waypoint · Hold to finish trip')
    .replaceAll('<span>打卡</span>', '<span>Timeline</span>')
    .replaceAll('<span>洞察</span>', '<span>Insights</span>')
    .replaceAll('<span>我的</span>', '<span>Profile</span>');
}

function translateFrame2(html) {
  return html
    .replaceAll('探索拓扑', 'Topology')
    .replaceAll('高精底图', 'Satellite')
    .replaceAll('阳光棕榈园 (起点)', 'Palm Garden (Start)')
    .replaceAll('11:12 · 出发', '11:12 · Depart')
    .replaceAll('<span>🚶 步行</span><span>+12m</span>', '<span>🚶 Walk</span><span>+12m</span>')
    .replaceAll('科技园前海湾站', 'Hi-Tech Park Bay')
    .replaceAll('11:24 · 换乘', '11:24 · Transfer')
    .replaceAll('<span>🚇 地铁</span><span>+16m</span>', '<span>🚇 Subway</span><span>+16m</span>')
    .replaceAll('万象天地 (终点)', 'MixC World (Dest)')
    .replaceAll('11:40 · 到达', '11:40 · Arrive')
    .replaceAll('28 <small style="font-size: 9.5px;">分钟</small>', '28 <small style="font-size: 9.5px;">min</small>')
    .replaceAll('总耗时', 'Total Time')
    .replaceAll('预估路程', 'Estimated')
    .replaceAll('3 <small style="font-size: 9.5px;">站</small>', '3 <small style="font-size: 9.5px;">stops</small>')
    .replaceAll('途径站数', 'Waypoints')
    .replaceAll('阳光棕榈园', 'Palm Garden')
    .replaceAll('科技园前海湾站', 'Hi-Tech Park Bay')
    .replaceAll('万象天地咖啡馆', 'MixC World Cafe');
}

function translateFrame3(html) {
  return html
    .replaceAll('<div class="insights-title">洞察</div>', '<div class="insights-title">Insights</div>')
    .replaceAll('你的出行路线与耗时规律', 'Travel routes & duration patterns')
    .replaceAll('>统计<', '>Stats<')
    .replaceAll('>历史<', '>History<')
    .replaceAll('打卡总数', 'Total Check-ins')
    .replaceAll('常去地点', 'Frequent Places')
    .replaceAll('发现路线', 'Discovered Paths')
    .replaceAll('⚡ 高频通勤快捷查看', '⚡ Frequent Commutes')
    .replaceAll('家 → 公司 <b>38分</b>', 'Home → Office <b>38m</b>')
    .replaceAll('公司 → 咖啡店 <b>12分</b>', 'Office → Cafe <b>12m</b>')
    .replaceAll('公司 → 家 <b>30分</b>', 'Office → Home <b>30m</b>')
    .replaceAll('A→B 路线定向分析', 'A→B Directional Route Analysis')
    .replaceAll('<div class="place-box">家</div>', '<div class="place-box">Home</div>')
    .replaceAll('<div class="place-box">公司</div>', '<div class="place-box">Office</div>')
    .replaceAll('典型耗时', 'Typical Time')
    .replaceAll('38 <small style="font-size: 12px; font-weight: 700;">分钟</small>', '38 <small style="font-size: 12px; font-weight: 700;">min</small>')
    .replaceAll('波动 30 – 45 分钟', 'Range 30 – 45 min')
    .replaceAll('样本 28 次 · 含停留', '28 trips recorded')
    .replaceAll('耗时分布 (渐变胶囊柱)', 'Duration Distribution (Pill Bars)')
    .replaceAll('通常 38分', 'Usual 38m')
    .replaceAll('<span>30分</span>', '<span>30m</span>')
    .replaceAll('<span>38分 (高频)</span>', '<span>38m (peak)</span>')
    .replaceAll('<span>45分</span>', '<span>45m</span>')
    .replaceAll('<span>打卡</span>', '<span>Timeline</span>')
    .replaceAll('<span>洞察</span>', '<span>Insights</span>')
    .replaceAll('<span>我的</span>', '<span>Profile</span>');
}

function translateFrame4(html) {
  return html
    .replaceAll('<div class="profile-title">我的</div>', '<div class="profile-title">Profile</div>')
    .replaceAll('偏好与数据设置', 'Preferences & data management')
    .replaceAll('时空旅行者', 'Time Traveler')
    .replaceAll('🔥 已连续记录 18 天', '🔥 18-day tracking streak')
    .replaceAll('编辑 ✎', 'Edit ✎')
    .replaceAll('WebDAV 云端加密守护中', 'WebDAV Cloud Encrypted')
    .replaceAll('>安全<', '>Secure<')
    .replaceAll('上次自动备份：今日 18:30 · 零泄露风险', 'Last auto backup: Today 18:30 · Zero leak risk')
    .replaceAll('数据管理与备份', 'Data & Cloud Backup')
    .replaceAll('立即同步备份', 'Sync & Backup Now')
    .replaceAll('云端 + 本地 ›', 'Cloud + Local ›')
    .replaceAll('从备份恢复', 'Restore from Backup')
    .replaceAll('加密口令与云设置', 'Passphrase & Cloud Settings')
    .replaceAll('PBKDF2 加密 ›', 'PBKDF2 Encrypted ›')
    .replaceAll('偏好与关于', 'Preferences & About')
    .replaceAll('语言设置', 'Language')
    .replaceAll('简体中文 ›', 'English ›')
    .replaceAll('外观色彩', 'Appearance')
    .replaceAll('跟随系统 ›', 'Follow System ›')
    .replaceAll('位置排查与调试', 'Location Diagnosis')
    .replaceAll('双定位正常 ›', 'Dual Fix OK ›')
    .replaceAll('检查更新', 'Check for Updates')
    .replaceAll('v1.0.22 (最新) ›', 'v1.0.22 (Latest) ›')
    .replaceAll('<span>打卡</span>', '<span>Timeline</span>')
    .replaceAll('<span>洞察</span>', '<span>Insights</span>')
    .replaceAll('<span>我的</span>', '<span>Profile</span>');
}

const framesEn = [
  translateFrame1(framesZh[0]),
  translateFrame2(framesZh[1]),
  translateFrame3(framesZh[2]),
  translateFrame4(framesZh[3]),
];

const posterData = [
  // --- 中文版 (ZH) ---
  {
    id: 'poster-2-zh',
    filename: 'screenshot_2_timeline.png',
    tag: 'SCREENSHOT 02 · 行程记录',
    title: '今日流体时间轴',
    sub: '途经点自动成链 · 耗时与位移智能追踪',
    frame: framesZh[0]
  },
  {
    id: 'poster-3-zh',
    filename: 'screenshot_3_route.png',
    tag: 'SCREENSHOT 03 · 探索美学',
    title: '探索拓扑与轨迹路线',
    sub: '方案A工业点阵蓝图 · 双层发光渐变动态轨迹',
    frame: framesZh[1]
  },
  {
    id: 'poster-4-zh',
    filename: 'screenshot_4_insights.png',
    tag: 'SCREENSHOT 04 · 深度分析',
    title: '高频通勤与耗时洞察',
    sub: 'A→B定向路段耗时分析 · 24小时出行规律图谱',
    frame: framesZh[2]
  },
  {
    id: 'poster-5-zh',
    filename: 'screenshot_5_security.png',
    tag: 'SCREENSHOT 05 · 数据隐私',
    title: '个人中心与云端守护',
    sub: 'WebDAV强加密零知识备份 · 连续记录成就勋章',
    frame: framesZh[3]
  },

  // --- 英文版 (EN) ---
  {
    id: 'poster-2-en',
    filename: 'screenshot_2_timeline_en.png',
    tag: 'SCREENSHOT 02 · TIMELINE',
    title: 'Daily Fluid Timeline',
    sub: 'Auto-linked milestones · Smart duration & distance tracking',
    frame: framesEn[0]
  },
  {
    id: 'poster-3-en',
    filename: 'screenshot_3_route_en.png',
    tag: 'SCREENSHOT 03 · TOPOLOGY',
    title: 'Route Topology & Trail',
    sub: 'Industrial blueprint grid · Dual-layer luminous trajectory',
    frame: framesEn[1]
  },
  {
    id: 'poster-4-en',
    filename: 'screenshot_4_insights_en.png',
    tag: 'SCREENSHOT 04 · INSIGHTS',
    title: 'Commute Trends & Insights',
    sub: 'Point A → B route duration analysis · 24h travel patterns',
    frame: framesEn[2]
  },
  {
    id: 'poster-5-en',
    filename: 'screenshot_5_security_en.png',
    tag: 'SCREENSHOT 05 · PRIVACY & SYNC',
    title: 'Privacy & WebDAV Cloud Sync',
    sub: 'Zero-knowledge encryption · Streak achievements & local ownership',
    frame: framesEn[3]
  },
];

const postersHtml = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>TimeFlow · Google Play Screenshots Renderer (ZH & EN)</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Noto+Sans+SC:wght@400;500;700;800&family=JetBrains+Mono:wght@500;700&display=swap" rel="stylesheet">
<style>
${baseCss}

/* Poster Reset & High-Res 1080x1920 Layout */
body {
  margin: 0;
  padding: 0;
  background: #06080B;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 60px;
}

.poster-stage {
  width: 1080px;
  height: 1920px;
  background: #0B0E14;
  position: relative;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  align-items: center;
  box-sizing: border-box;
  padding: 90px 60px 0;
}

/* Subtle modern mesh & glow background */
.poster-stage::before {
  content: '';
  position: absolute;
  top: -200px;
  left: 50%;
  transform: translateX(-50%);
  width: 900px;
  height: 900px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(255, 107, 107, 0.14) 0%, rgba(255, 107, 107, 0.03) 45%, transparent 70%);
  pointer-events: none;
  z-index: 1;
}

.poster-header {
  position: relative;
  z-index: 2;
  text-align: center;
  margin-bottom: 48px;
}

.poster-tag {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  background: rgba(255, 107, 107, 0.16);
  color: #FF6B6B;
  border: 1.5px solid rgba(255, 107, 107, 0.32);
  padding: 8px 20px;
  border-radius: 999px;
  font-size: 20px;
  font-weight: 800;
  letter-spacing: 1.2px;
  margin-bottom: 16px;
}

.poster-title {
  font-size: 56px;
  font-weight: 800;
  color: #FFFFFF;
  letter-spacing: -1px;
  line-height: 1.15;
  margin-bottom: 12px;
  text-shadow: 0 4px 24px rgba(0,0,0,0.4);
}

.poster-sub {
  font-size: 25px;
  font-weight: 600;
  color: #94A3B8;
  letter-spacing: -0.2px;
}

/* 巨幅拟真旗舰机身容器 */
.phone-chassis-outer {
  position: relative;
  z-index: 2;
  width: 760px;
  height: 1540px;
  background: #14171E;
  border-radius: 68px;
  padding: 18px;
  box-sizing: border-box;
  box-shadow: 
    0 40px 100px rgba(0, 0, 0, 0.8),
    0 0 0 10px #1E232D,
    0 0 0 14px #2E3644,
    inset 0 0 0 3px rgba(255, 255, 255, 0.08);
  display: flex;
  flex-direction: column;
}

/* 机身屏幕内槽 */
.phone-screen-viewport {
  width: 724px;
  height: 1504px;
  border-radius: 54px;
  overflow: hidden;
  background: var(--tf-bg);
  position: relative;
}

/* 2.19x 等比高清矢量放大 */
.scaled-content-wrapper {
  width: 330px;
  height: 686px;
  transform: scale(2.194);
  transform-origin: top left;
}

/* 去除原 330px 模拟框的外框与阴影，由 .phone-chassis-outer 统一承载 */
.scaled-content-wrapper .phone-frame {
  width: 330px !important;
  height: 686px !important;
  box-shadow: none !important;
  border-radius: 0 !important;
}
</style>
</head>
<body>

${posterData.map(p => `
  <!-- ${p.id} : ${p.tag} -->
  <div class="poster-stage" id="${p.id}">
    <div class="poster-header">
      <div class="poster-tag">${p.tag}</div>
      <div class="poster-title">${p.title}</div>
      <div class="poster-sub">${p.sub}</div>
    </div>
    
    <div class="phone-chassis-outer">
      <div class="phone-screen-viewport">
        <div class="scaled-content-wrapper">
          ${p.frame}
        </div>
      </div>
    </div>
  </div>
`).join('\n')}

</body>
</html>`;

const outPath = path.join(__dirname, '../store_assets/render_play_posters.html');
fs.writeFileSync(outPath, postersHtml, 'utf8');
console.log('✅ Generated store_assets/render_play_posters.html with both ZH and EN posters!');
