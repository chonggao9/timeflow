const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

const ROOT = path.resolve(__dirname, '..');
function tryRead(p) {
  try { return fs.readFileSync(p, 'utf8'); } catch (e) { return ''; }
}

const env = {
  ...dotenv.parse(tryRead(path.join(ROOT, '.env'))),
  ...dotenv.parse(tryRead(path.join(ROOT, '.env.local')))
};

const body = `TimeFlow v1.0.22 (Google Play Release Build)

### 📦 资产下载与说明
- **Google Play 上传专供 (AAB)**：[\`timeflow-v1.0.22.aab\`](https://github.com/chonggao9/timeflow/releases/download/v1.0.22/timeflow-v1.0.22.aab) (32.9 MB, versionCode: 2, 生产发布包，直接上传 Google Play Console)
- **真机安装测试包 (APK)**：[\`timeflow-v1.0.22.apk\`](https://github.com/chonggao9/timeflow/releases/download/v1.0.22/timeflow-v1.0.22.apk) (65.0 MB, versionCode: 1, 适用于直接在手机上侧载安装体验)
- **软件包名称 (Package Name)**：\`com.chonggao.timeflow\`

---

### 🚀 核心更新与优化内容
- **Google Play 国际化与商店资产**：
  * Android 包名统一升级为 \`com.chonggao.timeflow\`；
  * 新增 1080x1920 高清中英文宣传海报与 Google Play 商店全套元数据 (\`store_assets/\`)；
  * 全面更新隐私政策（明确仅前台定位、高德与 Android 双通道定位声明、合规注销数据删除通道及 18+ 用户群体声明）。
- **UI 全面焕新升级**：引入现代流体卡片设计、暖色双板质感、动态水波纹打卡主按钮与悬浮灵动定位胶囊状态条；
- **补记打卡（方向 A）**：支持离线/遗漏场景下的快捷补记打卡，具备时间偏移选取、常用地点快选与出行方式指定能力；
- **弱网与离线地点快选**：重命名与补卡模态框内自动提取历史高频地点 Chip，弱网环境下秒级一触即选；
- **桌面小组件规范对齐**：全面同步上下内嵌流体卡片视觉体系，增加出行方式 Emoji 动态映射与最新地点实时时间同步；
- **全方位代码审查与架构优化**：
  * 修复补卡未刷新行程活跃时间戳 (BUG-1)；
  * 消除切回前台双重 SQLite 查库，提速 App 唤醒渲染 (BUG-2)；
  * 补全轨迹查看按钮国际化词条 (BUG-3)；
  * 补卡保存增加原子防重锁与防抖冷却 (Q-4)；
  * 时间轴脉冲动画抽离并按需挂载，消除历史节点冗余动效循环 (Q-3)；
  * 统一小组件占位符规范为 {n}，强化模态框 Chip 键名唯一性 (Q-1, Q-2, Q-5)。`;

async function main() {
  const res = await fetch('https://api.github.com/repos/chonggao9/timeflow/releases/384107228', {
    method: 'PATCH',
    headers: {
      Authorization: 'Bearer ' + env.GH_TOKEN,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ body })
  });
  const data = await res.json();
  console.log('Updated release:', data.tag_name, data.html_url);
}

main().catch(console.error);
