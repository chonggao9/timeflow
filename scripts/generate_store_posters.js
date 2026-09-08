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
    const frameMatch = part.match(/(<div class="phone-frame"[\s\S]*?<\/div>\s*<\/div>\s*<\/div>)/);
    // Actually match from <div class="phone-frame" to the matching closing div
    const startIdx = part.indexOf('<div class="phone-frame"');
    if (startIdx !== -1) {
      // Find the closing of this phone-frame
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

const frames = extractPhoneFrames(showcaseHtml);
console.log(`Extracted ${frames.length} phone frames from showcase.`);

const posterData = [
  {
    id: 'poster-2',
    filename: 'screenshot_2_timeline.png',
    tag: 'SCREENSHOT 02 · 行程记录',
    title: '今日流体时间轴',
    sub: '途经点自动成链 · 耗时与位移智能追踪',
    frame: frames[0] // Screen 1: 首页打卡
  },
  {
    id: 'poster-3',
    filename: 'screenshot_3_route.png',
    tag: 'SCREENSHOT 03 · 探索美学',
    title: '探索拓扑与轨迹路线',
    sub: '方案A工业点阵蓝图 · 双层发光渐变动态轨迹',
    frame: frames[1] // Screen 2: 探索拓扑
  },
  {
    id: 'poster-4',
    filename: 'screenshot_4_insights.png',
    tag: 'SCREENSHOT 04 · 深度分析',
    title: '高频通勤与耗时洞察',
    sub: 'A→B定向路段耗时分析 · 24小时出行规律图谱',
    frame: frames[2] // Screen 3: 洞察分析
  },
  {
    id: 'poster-5',
    filename: 'screenshot_5_security.png',
    tag: 'SCREENSHOT 05 · 数据隐私',
    title: '个人中心与云端守护',
    sub: 'WebDAV强加密零知识备份 · 连续记录成就勋章',
    frame: frames[3] // Screen 4: 我的设置
  },
];

const postersHtml = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>TimeFlow · Google Play Screenshots Renderer (1080x1920)</title>
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
  <!-- ${p.tag} -->
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
console.log('✅ Generated store_assets/render_play_posters.html');
