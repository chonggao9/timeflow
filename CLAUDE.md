# TimeFlow Project Guidelines & Agent Orchestration

## 1. 智能体自动协同工作流 (Agent Workflow)
当用户提出任何需求或修改时，按以下流水线全自动推进，无需用户手动逐个艾特角色：

1. **功能开发 (Development)**:
   - 自动启用 `@engineering-mobile-app-builder`（或 `@engineering-frontend-developer`）执行代码编写。
   - 严格遵循 React Native 0.79 + Expo SDK 53 + React 19 开发规范，保持组件高内聚与样式简洁。
2. **测试与质量验证 (Testing & QA)**:
   - 代码编写完毕后，自动由 `@testing-test-automation-engineer` / `@testing-api-tester` 进行边界逻辑验证，编写/补齐必要用例。
3. **代码审查与门禁 (Code Review)**:
   - 由 `@engineering-code-reviewer` 审查本次改动的 `git diff`，排查内存泄漏、异常处理漏洞与平台兼容性问题。
   - 修改完成后执行项目审计命令：`npm run audit`。

---

## 2. 项目技术栈与常用命令 (Tech Stack & Commands)
- **技术栈**：React Native 0.79.6, Expo ~53.0.0, React 19, TypeScript, Expo SQLite, FlashList
- **常用脚本**：
  - 启动开发服务：`npm run start`
  - 代码与多语言审计：`npm run audit`
  - Android 本地运行：`npm run android`

---

## 3. Token 极简与上下文控制准则 (Token Optimization)
- **精准读取**：仅读取当前任务直接相关的特定文件或行数，严禁全量扫描不相关的业务组件目录。
- **大文件避让**：禁止完整读取 `designs/` 下的 HTML 原型文件，只按需求抓取关键样式或状态值。
- **极简输出**：只输出必要的核心改动与结果说明，严禁输出大段废话或机械复述。
- **及时提示清理**：单任务完成后或多轮工具调用过长时，主动提醒用户执行 `/clear` 或 `/compact` 释放上下文。
