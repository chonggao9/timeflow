const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const enHtml = path.resolve(__dirname, '../store_assets/poster_6_en_single.html').replace(/\\/g, '/');
const zhHtml = path.resolve(__dirname, '../store_assets/poster_6_zh_single.html').replace(/\\/g, '/');

const enPng = path.resolve(__dirname, '../store_assets/screenshot_6_pomodoro_en.png');
const zhPng = path.resolve(__dirname, '../store_assets/screenshot_6_pomodoro.png');

console.log('Rendering EN poster...');
execSync(`"${chromePath}" --headless=new --disable-gpu --hide-scrollbars --window-size=1080,1920 --screenshot="${enPng}" "file:///${enHtml}"`);

console.log('Rendering ZH poster...');
execSync(`"${chromePath}" --headless=new --disable-gpu --hide-scrollbars --window-size=1080,1920 --screenshot="${zhPng}" "file:///${zhHtml}"`);

if (fs.existsSync(enPng) && fs.existsSync(zhPng)) {
  const enStat = fs.statSync(enPng);
  const zhStat = fs.statSync(zhPng);
  console.log(`✅ EN Poster generated: ${enPng} (${(enStat.size / 1024).toFixed(1)} KB)`);
  console.log(`✅ ZH Poster generated: ${zhPng} (${(zhStat.size / 1024).toFixed(1)} KB)`);
} else {
  console.error('❌ Failed to generate posters');
}
