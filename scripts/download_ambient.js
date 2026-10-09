const https = require('https');
const fs = require('fs');
const path = require('path');

const SOUNDS = [
  { name: 'rain.mp3', url: 'https://bigsoundbank.com/UPLOAD/mp3/1019.mp3' }, // Summer rain
  { name: 'forest.mp3', url: 'https://bigsoundbank.com/UPLOAD/mp3/0164.mp3' }, // Wind in trees
  { name: 'ocean.mp3', url: 'https://bigsoundbank.com/UPLOAD/mp3/0919.mp3' }, // Waves on the beach
  { name: 'fire.mp3', url: 'https://bigsoundbank.com/UPLOAD/mp3/0124.mp3' }, // Fireplace
  { name: 'cafe.mp3', url: 'https://bigsoundbank.com/UPLOAD/mp3/3376.mp3' }, // Restaurant/Cafe
  { name: 'train.mp3', url: 'https://bigsoundbank.com/UPLOAD/mp3/0072.mp3' }, // Train
  { name: 'stream.mp3', url: 'https://bigsoundbank.com/UPLOAD/mp3/0100.mp3' }, // Stream/Creek
];

const targetDir = path.join(__dirname, '..', 'assets', 'sounds');

if (!fs.existsSync(targetDir)) {
  fs.mkdirSync(targetDir, { recursive: true });
}

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`Failed to get '${url}' (${response.statusCode})`));
        return;
      }
      response.pipe(file);
      file.on('finish', () => {
        file.close(resolve);
      });
    }).on('error', (err) => {
      fs.unlink(dest, () => reject(err));
    });
  });
}

async function main() {
  console.log('开始下载免版权高质量原生白噪音 (CC0)...');
  for (const sound of SOUNDS) {
    const dest = path.join(targetDir, sound.name);
    console.log(`Downloading ${sound.name}...`);
    try {
      await download(sound.url, dest);
      console.log(`✓ ${sound.name} 下载成功！`);
    } catch (e) {
      console.error(`✗ 下载失败: ${sound.name}`, e.message);
    }
  }
  console.log('所有音频下载完成！已存放于 assets/sounds 目录。');
}

main();
