# TimeFlow · 时光流

[![GitHub Release](https://img.shields.io/github/v/release/chonggao9/timeflow?color=FF6B6B&style=flat-square)](https://github.com/chonggao9/timeflow/releases/latest)
[![Platform](https://img.shields.io/badge/Platform-Android-green?style=flat-square)](#平台支持)

> [📥 **点击直接下载最新 Android 安装包 (v1.0.20 APK)**](https://github.com/chonggao9/timeflow/releases/download/v1.0.20/timeflow-v1.0.20.apk)

极简时间打卡 App，基于 Expo (React Native) + SQLite，支持高德/系统（Google）双兼容定位，数据全本地存储。

## 功能特性

- **极简打卡**：秒级乐观落库，坐标 + 地名后台异步竞速补齐；轻按记录途经点，长按一步结程（无需二次确认），下次打卡自动开启新行程；支持 90 分钟无打卡自动断程兜底
- **9 大出行方式**：覆盖市内日常与跨城差旅全场景（步行 / 骑行 / 自驾 / 打车 / 地铁 / 公交 / 高铁 / 飞机 / 轮渡）；支持平滑水平滚动胶囊栏与智能记忆聚焦，时间轴连线上直观呈现出行方式与耗时
- **桌面小组件**：Android 桌面 Widget 支持在不打开 App 的情况下即时一键打卡，展示今日状态、打卡次数与最新地点，双端数据秒级联动
- **时间轴**：今日行程与路段位移一览，支持就地改名、纠正出行方式与误打卡删除
- **洞察统计**：A→B 路段耗时查询（典型耗时 / 分布 / 时段 / 周趋势）、高频常见路段与智能耗时预估
- **历史行程**：按日期分组回看、搜索 / 9 类出行方式筛选、展开查看每一站
- **线路轨迹地图**：某次行程的打卡点连成轨迹（起终点 / 站点 / 全程耗时一览），离线 SVG 拓扑图与 Google Maps 瓦片双模式
- **深色模式 / 多语言**：跟随系统 / 浅色 / 深色，中文 / English 双语
- **定位排查**：逐项自检高德与原生定位链路，显示具体失败原因与快速修复入口
- **数据备份 + 云同步**：全部打卡记录与设备偏好加密成备份文件，可本地保存 / 分享，或配置自带的 WebDAV（坚果云 / Nextcloud）自动上传，换机也能安全恢复

## 平台支持

- **Android**：完整支持。集成高德定位原生模块、Google Maps 瓦片地图、Android 桌面小组件（Widget）。
- **iOS**：暂不支持。项目依赖定制的 Kotlin 原生定位模块 `modules/amap-location`，目前尚未提供 iOS 原生桥接层，请勿直接在 iOS 环境下构建运行。

## 技术栈

- Expo SDK 51 / React Native 0.74
- expo-sqlite（本地存储，无服务器、无账号）
- 高德开放平台定位 SDK（自定义 Expo 原生模块 `modules/amap-location`）
- 高德 + 系统(Google) 并行竞速定位，全程超时兜底
- react-native-maps（线路轨迹地图，Google Maps 瓦片，依赖 GMS 机型）

## 快速开始

> ⚠️ 本应用含自定义原生模块（高德定位 SDK），**不能运行在 Expo Go 里**，需用开发构建（development build）。

### 1. 安装依赖

```bash
npm install
```

### 2. 运行 Android 开发构建

```bash
npm run android        # 等价 npx expo run:android
```

首次运行会 prebuild 生成 `android/` 并编译原生模块，需本地已配置 Android SDK。

### 3. 打包

```bash
# 测试包（preview profile，internal 分发 APK）
eas build --platform android --profile preview

# 一键发版（升版本 → EAS 构建 → 下载 → GitHub Release + 上传 APK）
# 需环境变量 EXPO_TOKEN、GH_TOKEN
npm run release -- --commit --push
```

## 高德 Key 配置

在「我的 → 位置调试」里配置（均仅存本机，不上传）：

| Key | 用途 | 说明 |
|---|---|---|
| 高德定位 Key | 定位 SDK 获取坐标 + 逆地理 | 需在高德开放平台绑定当前构建的**包名 + 签名 SHA1** |
| 高德地图 Key（Web 服务） | 反查地名兜底 | SDK 已自带逆地理，此 Key 仅作兜底 |

## 定位说明

- 高德与系统(Google) 定位**并行竞速**，谁先成功用谁，全程超时，杜绝「永久卡在获取位置」
- 无 GMS 的国区机型回退高德；高德 SDK 自带逆地理返回地名
- 权限先只读查、未授权才请求，绕开部分 Android 的权限请求挂起问题

## 线路轨迹地图（Google Maps）

- 用 `react-native-maps` 把某次行程的打卡点连成轨迹（连点成线，不做路径规划，不调 Directions API）
- 需要 Google Maps Android key：在 `app.json` 的 `android.config.googleMaps.apiKey` 配置（**构建前替换为真实 key**）
- Google Maps key 受「应用包名 + 签名 SHA1」双校验，请在 Google Cloud Console 按此配置限制
- 依赖 GMS（Google Play Services）；无 GMS 机型不渲染瓦片，App 内给友好空态提示不崩溃

## 项目结构

```
├── App.js                        # 底部三 Tab（打卡 / 洞察 / 我的）
├── index.js                      # App 入口 + 注册桌面小组件 task handler
├── modules/amap-location/        # 高德定位 Expo 原生模块（Kotlin）
├── privacy.html                  # 隐私政策公开页（托管 GitHub Pages）
├── widget/                       # 桌面小组件（react-native-android-widget）
│   ├── Widget.js                 # widget 视图（FlexWidget/TextWidget 渲染）
│   ├── widgetData.js             # widget 展示数据构建（headless 与 App 共用）
│   ├── widgetStrings.js          # widget 最小语言字典 + 主题解析
│   └── widgetTaskHandler.js      # widget 事件处理：添加/更新/点击打卡
├── src/
│   ├── screens/
│   │   ├── HomeScreen.js         # 主界面：时间轴 + 一键打卡
│   │   ├── InsightsScreen.js     # 洞察：统计 / 历史 切换
│   │   ├── ProfileScreen.js      # 我的：设置 / 数据管理 / 位置调试 / 小组件说明
│   │   └── PrivacyAgreement.js   # 隐私协议
│   ├── components/
│   │   ├── Timeline.js           # 时间轴（线段化位移呈现 + 终点形态区分）
│   │   ├── HistoryView.js        # 历史行程视图（搜索 / 9 类方式筛选 / 展开）
│   │   ├── CheckInButton.js      # 打卡大按钮（全宽居中，轻按打卡 · 长按一步结程）
│   │   ├── TransportPicker.js    # 出行方式选择（平滑水平滚动胶囊栏，9 种方式 + 自动居中聚焦）
│   │   ├── ModeIcon.js           # 出行方式图标（9 种方式矢量映射）
│   │   └── charts/BarChart.js    # 手绘 SVG 柱状图
│   ├── storage/
│   │   ├── store.js              # 打卡记录 SQLite 读写
│   │   └── profile.js            # 昵称等偏好
│   ├── backup/
│   │   ├── crypto.js             # 加密：PBKDF2 + AES-256-CBC + HMAC-SHA256
│   │   ├── schema.js             # 备份明文结构与收集/校验
│   │   ├── backup.js             # 本地备份生成 / 分享 / 恢复
│   │   ├── webdav.js             # WebDAV 云同步（上传 / 下载 / 测试）
│   │   └── schedule.js           # 自动备份节流（开关 / 口令 / 上次时间）
│   ├── utils/
│   │   ├── location.js           # 双兼容定位 + 地名反查 + 定位排查
│   │   ├── amapLocation.js       # 高德定位封装
│   │   ├── withTimeout.js        # 带超时的 Promise 竞速
│   │   ├── analytics.js          # A→B 查询 / 历史行程分组
│   │   ├── stats.js              # 中位数 / 地点聚类 / 格式化
│   │   ├── widgetRefresh.js      # App 内主动刷新桌面小组件
│   │   └── updater.js            # 版本检查
│   ├── config.js                 # 高德 Key 管理（读写 AsyncStorage）
│   ├── i18n/                     # 多语言（zh / en）
│   ├── theme.js                  # 设计令牌：浅/深色配色、圆角、阴影
│   └── theme/ThemeContext.js     # 主题上下文（system/light/dark）
└── scripts/release.js            # 一键发版脚本
```

## 数据说明

- 打卡记录存储于本地 **SQLite**（`timeflow.db`），无需服务器、无需账号
- 偏好（当前行程 / 上次出行方式）存于 AsyncStorage
- 位置数据仅通过高德 SDK 采集 / 反查，不落任何第三方服务器
- 备份：记录与偏好加密成备份文件（口令派生密钥，AES-256-CBC + HMAC-SHA256），本地保存 / 分享；配 WebDAV 后上传的也是加密文件，云端看不到明文

## 隐私政策

- 公开页：https://chonggao9.github.io/timeflow/privacy.html
- 源码：`privacy.html`（与 app 内 `PrivacyAgreement.js` 内容一致）

## 版本记录

### v1.0.20 (2026-09-04)
- **打卡交互重构**：打卡按钮全宽居中，轻按记录途经点，长按（>500ms）一步记录终点并完结行程；智能超时断程调整至 90 分钟。
- **扩展 9 大出行方式**：新增打车、轮渡、地铁、飞机等，支持平滑水平滚动胶囊栏与自动居中聚焦记忆。
- **时间轴与视觉优化**：线段化呈现位移与耗时标签，终点状态与活跃行程区分更清晰。
- **合规升级**：同步更新《隐私政策》（包括内置协议与公开网页版），全面披露出行方式与 WebDAV 自主云同步。


