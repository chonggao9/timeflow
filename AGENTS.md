# TimeFlow Project Guidelines

## 1. 技术栈与架构红线
- **核心版本**：React Native `0.79.6` · Expo SDK `~53.0.0` · React `19`（**严禁擅自升级任何依赖**）
- **语言与组件**：JS（业务）+ TS（声明）+ JSDoc 强约束；列表强制使用 `FlashList`（禁用 `FlatList`）
- **双端隔离（App vs Widget）**：
  - **数据层**：Expo SQLite 仅限 App 侧使用；Widget 侧唯一数据通道为 `widget/widgetData.js` (SharedPreferences)。
  - **UI 与主题**：Widget 侧仅限使用 `react-native-android-widget` 原语（如 `FlexWidget`/`TextWidget`）及独立的 `widget/widgetTheme.js`，严禁引用 `src/theme.js` 或标准 RN 组件。
  - **多语言**：App 侧走 `src/i18n/translations.js`；Widget 侧走 `widget/widgetStrings.js`（独立不依赖 `LanguageContext`）。

## 2. 目录结构
- `App.js` — 入口、导航与深链路由（注意：Linking 事件前须先注册路由）
- `src/` — App 主体：`screens/` | `components/` | `i18n/` (`translations.js`, `LanguageContext.js`) | `pomodoro/` | `services/` | `storage/` | `utils/` | `theme.js` | `config.js` | `types.d.ts`
- `widget/` — 桌面小组件：`widgets/` (`PomodoroWidgets.js`, `TravelWidgets.js` 等) | `widgetNames.js` | `widgetData.js` | `widgetTheme.js` | `widgetStrings.js` | `widgetTaskHandler.js` | `pomodoroActions.js` | `svg.js`
- `android/` & `plugins/` — 原生壳与 Config Plugins（含 `withApi36Fix.js`），**修改前必须获用户确认**
- `scripts/` — 审计与工具脚本（**严禁删改**）
- `docs/design/` — UI 原型参考（只读，单文件极大，仅按需 grep 关键行）

## 3. 常用命令与门禁
- **开发调试**：`npm run start` | `npm run android`
- **质量门禁**：`npm run audit`（代码 + i18n + 单测 + 类型全量审计，**改动后必跑**）| `npm run typecheck` | `npm run check:i18n`
- **专项测试**：`npm run test:backup` | `npm run test:pomodoro` | `npm run test:widget` | `npm run test:analytics`
- **本地构建**：`npm run build:local` (APK) | `npm run build:aab` (AAB)

## 4. 开发准则与工作流
1. **i18n 规范**：严禁硬编码中英文。Key 格式为 `模块_语义`（如 `widget_nextStop`），新增 Key 必须同步补齐 `zh` 和 `en`。
2. **小组件注册**：新增小组件必须同步在 `widget/widgetNames.js` 和 `app.json`（`expo.plugins` 对应配置项）中注册。
3. **审计必跑**：任何代码改动完成后，必须立即执行 `npm run audit`，全部通过后方可交付。
4. **类型检查规范**：核心业务数据结构统一在 `src/types.d.ts` 声明；关键 `.js` 模块顶部开启 `// @ts-check` 并编写 JSDoc 标注，禁止绕过 `npm run typecheck`。
5. **Git 与工作区维护**：
   - 交付前清除所有临时调试脚本、日志、dump 文件（**除非用户要求，否则不要自动 git commit**）。
   - 根目录仅保留最新一份 `timeflow-vX.Y.Z.apk`，旧版 APK 及用完的 `.aab` 及时清理。
   - 周期性清理编译缓存：`Remove-Item -Recurse -Force android/app/build, android/.gradle, android/.kotlin, android/app/.cxx, .expo -ErrorAction SilentlyContinue`

## 5. 已知踩坑记录 (Gotchas)
- **ProGuard 规则失效**：`extraProguardRules` 中字面量 `\n` 无法换行，必须使用 JS 模板字符串真实换行 (`7d69d3b`)。
- **Windows 跨盘符编译失败**：D 盘项目引用 C 盘 Gradle 缓存触发 Kotlin `relativeTo` bug，需将 Gradle 缓存迁移至同盘符。
- **Widget 数据无法读取**：直接调用 App 侧 SQLite 工具报错，必须通过 `widgetData.js` 读取 SharedPreferences。
- **深链 `timeflow://widgets` 不响应**：App.js Linking 处理顺序问题，必须在 Linking 事件前先注册路由 (`28a62f9`)。

## 6. Token 效率与上下文管理
- **按需精准读取**：优先使用 `grep` 定位行号，再按行区间读取文件，禁止无目的全量读取。
- **大文件红线**：严禁全量读取 `docs/design/*.html`，仅允许 `grep` 关键词并读取上下 ±20 行。
- **极简输出**：只汇报核心改动与结论，不复述已有代码。
- **上下文重置**：单次任务完成或工具调用超 20 次时，主动提醒用户执行 `/clear`。

## 7. 里程碑状态 (Latest: v1.2.7 / 2026-10-16)
- [x] Phase 1a/1b/2/3（番茄引擎、多尺寸组件、深浅主题、深链、统计/足迹/连续打卡/热力图组件）
- [ ] Phase 4 — 待规划
