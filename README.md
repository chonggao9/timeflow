# TimeFlow · 时光流

极简时间打卡 App，基于 Expo (React Native) + SQLite，支持高德/系统双兼容定位，数据全本地存储。

## 功能特性

- **一键打卡**：秒级落库，坐标 + 地名后台异步补齐
- **时间轴**：今日打卡记录，可改名 / 删除
- **洞察统计**：A→B 路段耗时查询（典型耗时 / 分布 / 时段 / 周趋势）、常见路段
- **历史行程**：按日期分组回看、搜索 / 方式筛选、展开每一站
- **深色模式 / 多语言**：跟随系统 / 浅色 / 深色，中文 / English
- **定位排查**：逐项自检定位链路，显示具体失败原因

## 技术栈

- Expo SDK 51 / React Native 0.74
- expo-sqlite（本地存储，无服务器、无账号）
- 高德开放平台定位 SDK（自定义 Expo 原生模块 `modules/amap-location`）
- 高德 + 系统(Google) 并行竞速定位，全程超时兜底

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

## 项目结构

```
├── App.js                        # 底部三 Tab（打卡 / 洞察 / 我的）
├── modules/amap-location/        # 高德定位 Expo 原生模块（Kotlin）
├── privacy.html                  # 隐私政策公开页（托管 GitHub Pages）
├── src/
│   ├── screens/
│   │   ├── HomeScreen.js         # 主界面：时间轴 + 一键打卡
│   │   ├── InsightsScreen.js     # 洞察：统计 / 历史 切换
│   │   ├── ProfileScreen.js      # 我的：设置 / 数据管理 / 位置调试
│   │   └── PrivacyAgreement.js   # 隐私协议
│   ├── components/
│   │   ├── Timeline.js           # 时间轴
│   │   ├── HistoryView.js        # 历史行程视图（搜索 / 筛选 / 展开）
│   │   ├── CheckInButton.js      # 打卡大按钮
│   │   ├── TransportPicker.js    # 出行方式选择
│   │   ├── ModeIcon.js           # 出行方式图标
│   │   └── charts/BarChart.js    # 手绘 SVG 柱状图
│   ├── storage/
│   │   ├── store.js              # 打卡记录 SQLite 读写
│   │   └── profile.js            # 昵称等偏好
│   ├── utils/
│   │   ├── location.js           # 双兼容定位 + 地名反查 + 定位排查
│   │   ├── amapLocation.js       # 高德定位封装
│   │   ├── withTimeout.js        # 带超时的 Promise 竞速
│   │   ├── analytics.js          # A→B 查询 / 历史行程分组
│   │   ├── stats.js              # 中位数 / 地点聚类 / 格式化
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

## 隐私政策

- 公开页：https://chonggao9.github.io/timeflow/privacy.html
- 源码：`privacy.html`（与 app 内 `PrivacyAgreement.js` 内容一致）
