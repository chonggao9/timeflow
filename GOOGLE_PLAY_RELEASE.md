# TimeFlow Google Play 发布文案与上架指南 (v1.1.0)

本文档整理了 Google Play 开发者后台（Google Play Console）上架审核所需的全部文案、权限合规说明以及数据安全（Data Safety）表单对照指南。所有字符数均已严格对齐 Google Play 限制。

---

## 一、版本更新日志 (What's New)

> Google Play Console 限制：每个语言不超过 **500 个字符 (Characters)**。在「正式版 → 准备版本 → 版本说明」中填入。

### 1. 英文版 (en-US) — [484 / 500 字符]
```text
v1.1.0 Update:
• Vintage Trip Receipts: Transform commutes and journeys into thermal receipts with stop paces, route stats, and unique barcodes.
• HD Receipt Export: One-tap save ultra-crisp PNG receipts directly to your photo album.
• Quick Text Share: Copy formatted trip details to your clipboard for instant sharing in chats.
• Modern Vector Icon: Crisp new high-res app icon with smooth curves.
• Engine & Privacy Boost: Full Android 16 & 16KB page support with zero unnecessary permissions.
```

### 2. 简体中文版 (zh-CN) — [247 / 500 字符]
```text
v1.1.0 更新说明：
• 行程纪念小票：将日常通勤与旅途轨迹一键生成复古拟物热敏纸小票，逐站耗时、出行流速与装饰条形码一目了然。
• 高清相册直存：支持一键保存超清 PNG 小票长图至系统相册，随时珍藏与分享。
• 便捷文本分享：一键将小票明细格式化写入剪贴板，轻松粘贴至即时聊天与社交网络。
• 全新矢量图标：纯矢量重绘莫比乌斯流动环与定位微标，视觉更细腻精致。
• 系统架构与隐私升级：全面适配 Android 16 与 16KB 内存页面机制，彻底移除冗余读取权限，运行更丝滑更安全。
```

---

## 二、简短说明 (Short Description)

> Google Play Console 限制：不超过 **80 个字符 (Characters)**。

### 1. 英文版 (en-US) — [77 / 80 字符]
```text
Fluid timeline & commute tracker with vintage trip receipts and 100% privacy.
```

### 2. 简体中文版 (zh-CN) — [35 / 80 字符]
```text
流体时间轴通勤记录器，复古拟物行程小票长图，零追踪纯本地隐私优先。
```

---

## 三、完整说明 (Full Description)

> Google Play Console 限制：不超过 **4000 个字符 (Characters)**。

### 1. 英文版 (en-US)
```text
TimeFlow is an elegant, privacy-first daily commute tracker and fluid timeline designed to help you effortlessly visualize how your time flows across places and journeys.

Whether it’s your daily transit to work, an intercity bullet train trip, or an evening stroll around the block, TimeFlow transforms your stops into a continuous, cinematic river of moments — capped off with delightfully styled vintage trip receipts.

━━━━━━━━━━━━━━━━━━━━━━━━━━
✨ KEY FEATURES
━━━━━━━━━━━━━━━━━━━━━━━━━━

🌊 FLUID DAILY TIMELINE
• One-tap check-in with tactile micro-animations and ripple feedback.
• Automatic trip grouping: seamless transitions between origin, transit legs, and destinations.
• 9 versatile transportation modes: Walk, Bike, Drive, Taxi, Subway, Transit, Train, Flight, and Boat.
• Full offline support with retroactive timestamps and manual location input.

🧾 VINTAGE TRIP RECEIPTS & HD EXPORT
• Transform any journey into an aesthetic, thermal-paper styled digital receipt.
• Rich voyage details: start/end times, total duration, stop-by-stop paces, and unique custom barcodes.
• One-tap HD PNG export directly into your photo gallery.
• Clean ASCII receipt formatting with instant clipboard copy for easy sharing in messaging apps.

📊 COMMUTE INSIGHTS & TIME ANALYSIS
• Dynamic route pace cards showing exactly how much time each leg of your commute took.
• A→B commute analysis: discover patterns, speed differences, and weekly commuting habits.
• Visual timeline history with intuitive monthly calendar navigation.

🔒 100% PRIVACY-FIRST & ZERO TRACKING
• Local-First SQLite Storage: All your logs, timestamps, and locations remain strictly on your physical device.
• Zero Central Servers: We run no centralized user database.
• Zero Ads & Zero Analytics SDKs: No Google Analytics, no Firebase tracking, no Facebook SDK.
• Foreground-Only Location: Coordinates are queried solely when you actively tap check-in. TimeFlow NEVER monitors your location silently in the background.

☁️ OPTIONAL WEBDAV PRIVATE CLOUD SYNC
• Full data ownership: sync seamlessly to your self-hosted Nextcloud, private NAS, or personal cloud.
• Military-Grade AES-256 Encryption: Backups are derived from your master passphrase via PBKDF2 and encrypted locally before leaving your device.
• Easy one-tap data export and restore.

🎨 REFINED AESTHETICS & DESKTOP WIDGET
• Warm, eye-friendly design palette tailored for both bright daylight and sleek dark mode.
• Android home-screen widget support for instantaneous, frictionless logging on the go.
• Multilingual support: seamlessly toggle between English and Simplified Chinese.

━━━━━━━━━━━━━━━━━━━━━━━━━━
🛡️ TRANSPARENT PERMISSIONS
━━━━━━━━━━━━━━━━━━━━━━━━━━
• Location (ACCESS_FINE_LOCATION / ACCESS_COARSE_LOCATION): Used solely in the foreground to resolve coordinates when you tap "Check In". You can deny this permission and still use manual place names.
• Photos & Media (READ_MEDIA_IMAGES / WRITE_EXTERNAL_STORAGE): Used exclusively when you tap "Save Locally" to write the generated receipt image into your photo gallery. We never read, scan, or upload your personal media.
• Clipboard: Used solely to write receipt text when you tap "Share". We never read your clipboard history.

Reclaim your daily rhythm. Download TimeFlow and watch your moments flow!
```

### 2. 简体中文版 (zh-CN)
```text
TimeFlow（时光流）是一款精致、优雅且绝对尊重隐私的每日通勤与生活轨迹记录器。它通过独具匠心的流体时间轴，将你穿梭于城市与生活间的每一次驻足与出发，串联成一条清晰可见的时光之河。

从早高峰地铁到晚霞中的惬意漫步，从跨城高铁到出差旅途，TimeFlow 不仅帮你沉淀每一段行程的耗时洞察，还能一键生成极具复古质感的拟物行程纪念小票。

━━━━━━━━━━━━━━━━━━━━━━━━━━
✨ 核心功能亮点
━━━━━━━━━━━━━━━━━━━━━━━━━━

🌊 流体时间轴与极速打卡
• 触感级水波微动效，一键即时打卡，极速记录当前停靠点与出发时刻。
• 智能行程归拢：自动将连续打卡聚合成完整行程，清晰呈现起止路段。
• 9 种出行方式随心切换：步行、骑行、自驾、打车、地铁、公交、高铁、飞机、轮渡。
• 完善的离线脱网与补记支持：断网下照常打卡，支持自由选择历史时间与地点别名。

🧾 复古拟物行程纪念小票与高清长图
• 将单日或单次旅途一键转换成充满情怀的复古热敏纸小票。
• 详尽看板：起止时刻、总耗时、逐站流速、换乘明细及专属装饰条形码。
• 超清 PNG 长图相册直存：一键保存至手机「TimeFlow」相册，质感满分。
• 极简小票文本分享：轻点分享即刻将格式化明细写入剪贴板，轻松粘贴至微信、即时聊天与社交动态。

📊 通勤耗时深度洞察与图谱
• A→B 专项通勤分析：精准掌握每日通勤平均用时与波动趋势，发现最高效的出发时刻。
• 逐段流速卡片：直观呈现每两站之间的耗时与出行效率。
• 时间轴历史日历：按日快速回溯打卡脚印，重温精彩生活轨迹。

🔒 纯本地化架构与绝对隐私守护
• 100% Local-First 本地优先：所有打卡数据、时间戳与坐标仅保存在您手机沙盒中的 SQLite 数据库中，数据完全归您所有。
• 无自建中央业务服务器：不托管任何用户个人隐私数据。
• 零广告、零第三方行为分析 SDK：无广告弹窗骚扰，无 Google Analytics/Firebase 埋点追踪。
• 仅限前台瞬时定位：仅在您主动按下打卡按钮的一瞬读取坐标，绝不在后台静默追踪位置，绿色省电无后台守护。

☁️ WebDAV 私有云同步与军工级加密
• 掌控数据自主权：自由绑定坚果云、Nextcloud、个人 NAS 或任何标准 WebDAV 网盘。
• AES-256 强加密防线：备份文件在离开手机前均基于您的私密主口令完成 PBKDF2 密钥派生与 AES-256 本地加密，即使云盘泄漏他人也无法破解。
• 支持一键完整备份与无缝换机迁移。

🎨 优雅视效与桌面小组件
• 细腻温暖的纸墨质感调色，完美自适应深色与浅色外观。
• 便捷桌面 Widget 支持：无需打开 App 即可在手机主屏一触即达完成打卡。
• 中英双语全覆盖：国际化丝滑切换。

━━━━━━━━━━━━━━━━━━━━━━━━━━
🛡️ 权限使用说明
━━━━━━━━━━━━━━━━━━━━━━━━━━
• 位置权限（前台精确/大致位置）：仅在主动点击打卡时解析经纬度与地名。即使关闭该权限，仍可手动填写地名正常使用。
• 照片与媒体存储权限：仅在点击「保存小票到本地」时用于将生成的小票长图存入相册。应用绝不读取、扫描或上传您相册中的任何私人照片。
• 剪贴板权限：仅在点击「分享小票」时将格式化小票文字写入剪贴板，绝不读取剪贴板历史记录。

记录生活节奏，留住流动时光。立即下载体验 TimeFlow！
```

---

## 四、Google Play 隐私政策与数据安全 (Data Safety) 填报对照表

在 Google Play 管理中心提交审核时，若需要完善「数据安全」与「应用内容」问卷，请对照以下答案如实填写：

### 1. 隐私政策网址 (Privacy Policy URL)
- 填入：`https://chonggao9.github.io/timeflow/privacy.html`
- *说明：该隐私政策页面支持中英双语切换，已包含针对小票相册存储权限与剪贴板说明的最新条款。*

### 2. 数据收集与共享 (Data Collection & Sharing)
- **您的应用是否会收集或共享任何必需的用户数据类型？**
  - 选择：`是 (Yes)`
- **应用收集的所有用户数据是否都在传输过程中经过加密？**
  - 选择：`是 (Yes)`（网络请求均走 HTTPS 加密通道）
- **您是否为用户提供申请删除其数据的途径？**
  - 选择：`是 (Yes)`（应用内设置提供一键清空全部数据，卸载应用物理擦除，并在隐私政策末尾提供了删除指引与联系邮箱）

### 3. 数据类型具体选择 (Data Types)
- **位置信息 (Location)**：
  - 勾选：`大致位置 (Approximate location)` 和 `精确位置 (Precise location)`
  - 数据用途：勾选 `应用功能 (App functionality)`
  - 是否由用户处理（暂存）：勾选 `是`
  - 是否关联用户身份：选择 `否 (No)`
  - 是否用于用户跟踪：选择 `否 (No)`
  - 是否与第三方共享：选择 `否 (No)`
- **照片和视频 (Photos and Videos)**：
  - *重要说明*：根据 Google Play 官方政策，仅将应用内部渲染生成的文件保存到用户本地相册（不读取、不上传用户已有照片），**不需要**勾选为“收集照片”。若审核人员询问权限用途，说明为“通过 expo-media-library 将行程小票图片保存到本地相册，无数据收集与上传行为”。
- **财务信息、健康运动、通讯录、短信等**：
  - 均选择：`否 (No)`

---

## 五、打包文件对照 (Release Artifacts)

| 文件类型 | 适用渠道 | 版本代码 (versionCode) | 目标 SDK | 输出文件路径 |
| :--- | :--- | :--- | :--- | :--- |
| **Android App Bundle (.aab)** | **Google Play Console 生产发布轨道（必须格式）** | **`19`** | **`36` (Android 16)** | `android/app/build/outputs/bundle/release/app-release.aab`（脚本已自动复制至工程根目录：`timeflow-v1.1.0.aab`，39.90 MB） |
| **Android APK (.apk)** | 开发者真机本地验证 / GitHub Release / 国内分发 | **`19`** | **`36` (Android 16)** | `android/app/build/outputs/apk/release/app-release.apk`（脚本已自动复制至工程根目录：`timeflow-v1.1.0.apk`，56.40 MB） |
