# TimeFlow · 时光流

极简时间打卡 App，基于 Expo (React Native)。

## 快速开始

### 1. 安装依赖

```bash
cd D:\work\timeflow
npm install
```

### 2. 启动开发服务

```bash
npx expo start
```

### 3. 在手机上运行

1. 手机安装 **Expo Go**（App Store / Google Play 搜索）
2. 与电脑连同一个 WiFi
3. 用 Expo Go 扫描终端里的二维码

---

## 项目结构

```
src/
├── screens/
│   ├── HomeScreen.js       # 主界面：时间轴 + 一键打卡
│   └── InsightsScreen.js   # 洞察：路段统计
├── components/
│   ├── Timeline.js         # 时间轴组件
│   ├── CheckInButton.js    # 一键打卡大按钮
│   └── TransportPicker.js  # 出行方式常驻选择
├── storage/
│   └── store.js            # 本地数据读写
├── utils/
│   └── stats.js            # 中位数、IQR 统计
└── theme.js                # 设计令牌（暖色珊瑚橙）
```

## 数据说明

所有数据存储在手机本地（AsyncStorage），无需服务器，无需账号。
