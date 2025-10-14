## Stage 1: Locale Inventory & Key Schema
**Goal**: 梳理现有界面和脚本中的用户可见字符串，制定统一的 i18n 键名体系，并补全四种语言的 `messages.json`。
**Success Criteria**: `_locales` 下的四个语言目录存在且键集合完全一致；`messages.json` 包含描述信息和占位符定义；术语与占位规则记录在 docs。
**Tests**: 手动核对 `tmp_han_strings.json` 与新建键名映射；运行 `npm run lint`（若适用）确认静态检查无误。
**Status**: Complete

## Stage 2: Infrastructure Wiring
**Goal**: 配置 `manifest.json` 默认语言、补全 `utils/i18n.js`，并在各页面引入自动本地化脚本。
**Success Criteria**: 扩展在加载时自动执行 `localizePage`，支持多种 `data-i18n*` 属性；`manifest.json` 引用 `__MSG_*__`。
**Tests**: 手动打开 popup/options 页面确认静态文本按语言切换。
**Status**: Complete

## Stage 3: Static Layout Refactor
**Goal**: 将 HTML 模板中的硬编码文本替换为数据属性或动态注入，确保无直接写死的中文。
**Success Criteria**: `popup.html`、`options.html` 完全依赖 `data-i18n*`；占位符、ARIA 信息通过脚本填充。
**Tests**: 手动切换语言后检查页面静态区域文本。
**Status**: Complete

## Stage 4: Runtime Message Localization
**Goal**: 用 `chrome.i18n.getMessage` 接管脚本中的提示、状态、错误与 Prompt 模板生成逻辑。
**Success Criteria**: 运行时生成的 DOM/日志全部引用新键；占位符参数正确传递；移除中文硬编码。
**Tests**: 自动化/手动调用关键路径（解析、写入、Prompt 配置、API 测试）验证显示文本正确。
**Status**: Complete

## Stage 5: Validation & Documentation
**Goal**: 执行多语言烟雾测试，补充 README / docs，整理最终术语与流程。
**Success Criteria**: README&docs 更新至最终状态；Checklist 完整勾选；无未命名键或缺失翻译。
**Tests**: 手动在四种语言下巡检；执行可用的单元/集成测试。
**Status**: Not Started
