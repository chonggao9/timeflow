const fs = require('fs');
const path = require('path');

const fullHtml = fs.readFileSync(path.join(__dirname, '../store_assets/render_play_posters_pomodoro.html'), 'utf8');

function extractStage(id) {
  const startStr = `<div class="poster-stage" id="${id}">`;
  const startIdx = fullHtml.indexOf(startStr);
  if (startIdx === -1) return '';
  const part = fullHtml.substring(startIdx);
  let depth = 0;
  let end = 0;
  for (let i = 0; i < part.length; i++) {
    if (part.startsWith('<div', i)) depth++;
    else if (part.startsWith('</div', i)) {
      depth--;
      if (depth === 0) {
        end = i + 6;
        break;
      }
    }
  }
  return part.substring(0, end);
}

const styleMatch = fullHtml.match(/<style>([\s\S]*?)<\/style>/);
const baseStyle = styleMatch ? styleMatch[1] : '';

function buildStandalone(id, lang) {
  const stage = extractStage(id);
  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${id}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Noto+Sans+SC:wght@400;500;700;800&family=JetBrains+Mono:wght@500;700&display=swap" rel="stylesheet">
<style>
${baseStyle}
html, body {
  margin: 0 !important;
  padding: 0 !important;
  width: 1080px !important;
  height: 1920px !important;
  overflow: hidden !important;
  background: #0B0E14 !important;
}
.poster-stage {
  margin: 0 !important;
}
</style>
</head>
<body>
${stage}
</body>
</html>`;
}

fs.writeFileSync(path.join(__dirname, '../store_assets/poster_6_en_single.html'), buildStandalone('poster-6-en', 'en'), 'utf8');
fs.writeFileSync(path.join(__dirname, '../store_assets/poster_6_zh_single.html'), buildStandalone('poster-6-zh', 'zh-CN'), 'utf8');
console.log('✅ Generated poster_6_en_single.html and poster_6_zh_single.html');
