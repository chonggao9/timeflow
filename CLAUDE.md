# TimeFlow Project Guidelines

## 1. 技术栈与版本锁定

- **框架**：React Native **0.79.6** · Expo SDK **~53.0.0** · React **19**
- **语言**：JavaScript（业务层）+ TypeScript（声明文件）
- **数据库**：Expo SQLite（仅 App 侧可用，widget 侧禁止直接调用）
- **列表**：FlashList（禁止用 FlatList 替代）
- **小组件**：`react-native-android-widget`

> **严禁**擅自升级任何依赖版本，升级前必须经用户确认。

---

## 2. 目录结构约定

```
App.js                    — 应用入口、导航与深链路由
src/
  screens/                — 页面组件（Screen 级别）
  components/             — 可复用 UI 组件
  i18n/
    translations.js       — 全量翻译表（zh/en 双语 key-value）
    LanguageContext.js    — 语言上下文 Provider
  pomodoro/               — 番茄钟引擎与状态机
  services/               — 后台服务（通知、定时任务）
  storage/                — 本地存储封装
  utils/                  — 工具函数
  theme.js                — App 侧主题 token
  config.js               — 全局配置常量

widget/                   — 桌面小组件基础设施
  widgets/
    PomodoroWidgets.js    — 番茄系列组件（4×2 / 2×2 / 4×1）
    TravelWidgets.js      — 行程系列组件（4×2 / 2×2 / 4×1）
  widgetNames.js          — 组件名称注册表
  widgetData.js           — 数据读取层（SharedPreferences）
  widgetTheme.js          — 小组件主题 token（独立，不依赖 src/theme.js）
  widgetStrings.js        — 小组件文案（双语）
  widgetTaskHandler.js    — 调度入口（点击 / 刷新 / 定时）
  pomodoroActions.js      — 番茄操作（开始/暂停/重置）
  svg.js                  — 内联 SVG 图标

android/                  — 原生 Android 壳（轻易不改，改前告知用户）
plugins/                  — Expo Config Plugin（轻易不改）
scripts/                  — 开发工具脚本
docs/design/              — UI 原型与设计规范（只读参考）
```

---

## 3. 常用命令速查

| 用途 | 命令 |
|------|------|
| 启动开发服务 | `npm run start` |
| Android 本地调试 | `npm run android` |
| **代码 + 多语言门禁审计** | `npm run audit` |
| 本地打 APK | `npm run build:local` |
| 本地打 AAB | `npm run build:aab` |
| 单独测试备份逻辑 | `npm run test:backup` |
| 单独测试番茄逻辑 | `npm run test:pomodoro` |
| 单独测试 widget 逻辑 | `npm run test:widget` |
| 多语言 key 检查 | `npm run check:i18n` |

**每次代码改动完毕必须执行 `npm run audit` 全量门禁，通过后才能 commit。**

---

## 4. 多语言规范 (i18n)

- 所有用户可见文案必须从 `src/i18n/translations.js` 读取，**禁止硬编码中文/英文字符串**。
- Key 命名格式：`模块_语义`，如 `widget_nextStop`、`pomodoro_start`。
- 新增 key 必须同时补齐 `zh` 和 `en` 两个语言的翻译，否则 `npm run check:i18n` 会报错。
- widget 侧文案统一使用 `widget/widgetStrings.js`，不依赖 `LanguageContext`。

---

## 5. 开发行为准则

### 必须做

- 代码改动后立即运行 `npm run audit` 检查。
- 读取文件时精准定位，只读当前任务相关的文件和行数。
- 新增小组件必须在 `widgetNames.js` 和 `app.json` 同步注册。
- 每次任务完成后提醒用户执行 `/clear` 释放上下文。

### 绝对禁止

- 擅自修改 `android/` 原生目录（改前必须与用户确认）。
- 擅自修改 `plugins/withApi36Fix.js`（Expo API 36 兼容补丁，牵一发动全身）。
- 在 widget 侧直接调用 Expo SQLite（SharedPreferences 是 widget 唯一数据通道）。
- 完整读取 `docs/design/` 下的 HTML 原型文件（文件过大，按需 grep 关键行）。
- 删除或修改 `scripts/` 下的审计脚本。
- 在 Git 工作区中留存任何临时调试文件。
- 擅自升级任何 npm 依赖版本。

---

## 6. 已知踩坑记录 (Gotchas)

| 问题 | 根因 | 解决方案 | 相关 commit |
|------|------|----------|-------------|
| ProGuard 规则不生效 | `extraProguardRules` 字符串中用字面量 `\n` 无法换行 | 改为真实换行（JS 模板字符串）| `7d69d3b` |
| Windows 跨盘符 Kotlin 增量编译失败 | Gradle `relativeTo` 路径 bug，D 盘项目 → C 盘 Gradle 缓存 | Gradle 缓存迁移到 D 盘，见 KI | — |
| widget 侧数据拿不到 | 直接引用了 `src/` 的 SQLite 工具 | 改用 `widgetData.js`（SharedPreferences 通道）| — |
| 深链 `timeflow://widgets` 不响应 | App.js linking 处理顺序问题 | 在 Linking 事件前先注册路由 | `28a62f9` |

---

## 7. 当前里程碑状态

> 最后更新：2026-10-16 · 最新发布包：`timeflow-v1.2.7.apk`

- [x] **Phase 1a** — 番茄引擎、共享打卡、组件主题 / SVG 基建
- [x] **Phase 1b** — 接线：番茄状态源切 engine、多组件路由、深链
- [x] **Phase 2** — 4×1 迷你条与下一站、深浅主题联动、说明页与深链
- [x] **Phase 3** — 扩展组件：番茄外观/深色大字/今日统计、足迹地图/本周连续/打卡热力
- [ ] **Phase 4** — 待规划

---

## 8. 工作区整洁规则

### 编译缓存清理（开发周期结束后）

```powershell
# 在项目根目录执行
Remove-Item -Recurse -Force android/app/build, android/.gradle, android/.kotlin, android/app/.cxx, .expo -ErrorAction SilentlyContinue
```

### APK / AAB 包体管理

- 根目录**仅保留最新一份** `timeflow-vX.Y.Z.apk`，历史版本立即删除。
- `.aab` 文件构建后立即删除，严禁冗余留存。

### Git 工作区要求

- 每次任务交付前确保 `git status` 输出 `working tree clean`。
- 临时调试脚本、抓包日志、数据 dump 文件在 commit 前必须彻底清除。

---

## 9. Token 效率准则

- **精准读文件**：优先 grep 定位行号，再按行范围读取，禁止无目的全量扫描。
- **大文件红线**：`docs/design/*.html` 单文件可达数千行，只 grep 关键词，按需读 ±20 行上下文。
- **极简输出**：只输出核心改动与结论，禁止机械复述已有代码或大段无意义解释。
- **上下文告警**：多轮工具调用超过 20 次后，主动提醒用户 `/clear` 重置上下文。
