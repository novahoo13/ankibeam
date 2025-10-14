# 国际化任务清单

## 阶段 1：文案梳理与资源基线
- [x] 收集 `popup/popup.html`、`options/options.html`、`popup/popup.js`、`options/options.js`、`utils/*.js` 中所有面向用户的字符串，整理统一键名并补全 `_locales/zh_CN/messages.json`（现状：仅 5 个键且缺少 description）。
- [x] 在 `_locales` 下新增 `en`、`ja`、`zh_TW` 目录及对应的 `messages.json`，同步阶段 1 的键表并写入翻译或占位文本，确保四种语言的键集合完全一致。
- [x] 为含占位符的键（如字段计数、错误详情）约定插值格式，完善各语言 `description` 并在 `docs` 中记录术语表/翻译注意事项。

## 阶段 2：基础设施调整
- [x] 将 `manifest.json` 的 `default_locale` 调整为 `en`，并把 `name`、`description` 等字段改为 `__MSG_*__`（现状：default_locale 为 `zh_CN`，文案直接写死）。
- [x] 扩展 `utils/i18n.js`，支持 `data-i18n`、`data-i18n-placeholder`、`data-i18n-title`、`data-i18n-value`、`data-i18n-aria`，并在 `DOMContentLoaded` 自动执行 `localizePage`（现状：仅处理 textContent/placeholder，且未自动触发）。
- [x] 在 `popup.html` 与 `options.html` 中通过 `<script type="module" src="../utils/i18n.js">`（或相对路径）引入本地化脚本，并确保在业务脚本之前加载（现状：页面尚未引用该模块）。

## 阶段 3：静态页面改造
- [x] `popup/popup.html`：移除所有中文文案，使用 `data-i18n*` 属性或 ARIA 文案承载标签、按钮、提示、占位符、空状态等内容（现状：除标题和按钮外仍为中文）。
- [x] `options/options.html`：同样处理所有文本节点，并按方案将“语言选择”区域改为说明文本 + 当前语言展示（现状：存在仅含简体中文的 `<select>`，易误导用户）。
- [x] 审查页面中的说明注释/展示性示例，确认是否需要迁移到 `messages.json` 或以多语言安全的方式呈现。

## 阶段 4：脚本国际化
- [x] `popup/popup.js`：用 `getMessage` 替换状态提示、按钮文案、错误消息、动态字段标签和日志提示，对运行期生成的 DOM 元素设置 `data-i18n*` 并在插入后触发本地化（现状：字符串全部为中文，且未调用 `localizePage`）。
- [x] `options/options.js`：抽取标签页标题、提示文字、API 测试反馈、配置操作状态、对话框文案、按钮文本等，统一走 `getMessage` 并处理插值（现状：中文硬编码遍布各函数）。
- [x] `utils/ai-service.js`、`utils/field-handler.js`、`utils/providers.config.js`、`utils/storage.js` 等公共模块：将会反馈给用户的消息改为 i18n，并确保抛出的错误文本可本地化（现状：仍含中文硬编码）。
- [x] `utils/prompt-engine.js`：把默认 Prompt 模板、字段智能提示、自动追加的说明改为 i18n，保证用户自定义内容保持原样；为 `generateFieldSchema`/`buildIntegratedPrompt` 引入键值映射（现状：模板和提示写死为中文）。
- [x] 清理 console 输出、日志或注释中需要呈现给用户的内容，避免与多语言要求冲突；确需保留的调试信息统一采用英文或本地化方案。

## 阶段 5：特性完善与回退策略
- [ ] 实现 `getLocale()` 工具基于 `chrome.i18n.getUILanguage()` 映射到 `en-US`/`ja-JP`/`zh-CN`/`zh-TW`，并在所有 `toLocaleString`/`toLocaleDateString` 等格式化调用中使用（现状：`options.js` 写死为 `zh-CN`）。
- [ ] 为系统设置页新增“语言跟随浏览器设置”的说明文本及当前语言展示逻辑，复用阶段 1 的键定义。
- [ ] 覆盖带 `{0}` 等占位符的键，确认多语言语序正确；必要时在 `messages.json` 中增加 `placeholders` 描述，以指导翻译。
- [ ] 审查 ErrorBoundary 等错误包装逻辑，确保在展示本地化提示的同时保留原始错误详情供排查。

## 阶段 6：验证与文档
- [ ] 新增或扩展单元测试，至少覆盖 `utils/i18n.js`、Prompt 默认模板生成、`getLocale()` 映射等关键路径，并为典型文案插值编写 smoke/快照测试。
- [ ] 在 Chrome 开发者模式下模拟 `en`、`ja`、`zh-CN`、`zh-TW` 环境手动回归，验证 popup、options、错误提示、Anki 写入、Prompt 编辑等界面显示正确语言且回退逻辑生效。
- [ ] 更新 `README.md` 与 `docs/internationalization-plan.md`（或新增附录），记录最终的键名约定、翻译流程和手动验证步骤，确保文档与实现一致。

