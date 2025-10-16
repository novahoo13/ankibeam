# 悬浮球功能技术实现方案（v1）

## 评估补充与风险提醒
- **权限与注入策略**：Manifest 将在 `content_scripts` 中使用 `<all_urls>`，并通过注入逻辑排除 `chrome://`、Chrome Web Store、PDF 等受限页面；需要同步校验 `permissions`/`host_permissions` 的一致性，并避免破坏现有权限集。
- **输入源范围**：本迭代暂不处理 `<input>`、`<textarea>`、`contenteditable` 的选区，需在文档和错误提示中说明限制，以减少误解。
- **并发与节流机制**：快速重复选中或移动会导致并发解析风险，需引入选区签名与任务取消策略，确保只对最新有效选区触发解析。
- **状态清理与滚动场景**：滚动、窗口尺寸变化或选区失效时必须即时清理悬浮球与面板，防止 UI 残留或遮挡内容。
- **UI 无障碍与键盘操作**：悬浮球与弹窗需要可聚焦、具备 ARIA 标签，并保持在浅/深背景下可读的颜色对比。
- **多语言复用策略**：内容脚本需懒加载 `i18n.js`，新增键值覆盖全部现有语言包；由本次更新提供初稿翻译，必要时再由你调整。
- **与现有业务层集成**：明确通过 `ai-service.js`、`field-handler.js`、`ankiconnect.js` 复用已有逻辑，并在配置缺失时给出与 popup 一致的友好提示。
- **设置页联动**：新增配置字段 `ui.enableFloatingAssistant` 默认开启，在选项页提供带说明文字的开关，并通过 `storage.js` 迁移保持兼容。
- **测试与验收路径**：单元测试覆盖核心逻辑，手工验收清单保留通用场景说明（具体站点由你补充），并在提交前验证多语言资源与脚本。

## 关键设计决策
- **内容脚本结构**：新增 `content/` 目录下的入口（`content-main.js`），按职责拆分为监听层、组件层、业务桥接层，全部使用 ES Module 并通过 Shadow DOM 生成两块挂载节点（悬浮球 + 弹窗）。
- **权限策略**：Manifest 使用 `<all_urls>` 注入，执行时主动过滤受限域并记录输入源限制提示，确保与现有权限集兼容。
- **定位方案**：统一采用 Floating UI 提供定位与避障能力，必要时二次封装以便节流和状态同步。
- **样式与资源**：共用现有 Tailwind 自定义类，必要时在 Shadow DOM 中内联基础样式；图标沿用 `icons/` 资源或使用内联 `data-uri`，避免额外打包。
- **数据流**：内容脚本直接调用 `ai-service.js` 执行解析，借助 `field-handler.js` 生成输出字段，再调用 `ankiconnect.js` 写入；异常由公用错误处理器包装，状态与 UI 通过事件分发。
- **配置与状态**：新增配置字段 `ui.enableFloatingAssistant` 默认开启，使用 `storage.js` 的迁移机制；内容脚本在启动时读取配置，并监听 `chrome.storage.onChanged` 以便动态启停。
- **交互与限制**：弹窗沿用 popup 的字段布局并设定最大高度+内部滚动，本版不支持 `<input>`/`<textarea>`/`contenteditable` 的选区，需要在 UI 和文档显式说明。
- **测试策略**：纯逻辑模块使用 `node --test` + `jsdom` 模拟 DOM；UI 行为通过手工脚本列出验收用例，并在文档中固化，翻译覆盖现有全部语言。

## 实现步骤计划

## Stage 1: 内容脚本基础与权限调整
**Goal**: 为悬浮功能搭建最小运行骨架，包括 Manifest 变更、配置读取、基础监听器。
**Success Criteria**:  
- Manifest 声明新的 `content_scripts`，匹配 `<all_urls>` 并在运行时排除受限域；权限调整后现有功能不受影响。  
- 内容脚本可读取 `storage.js` 的配置，并在开关关闭时不注入 UI。  
- 在任意测试页面选中文本后，控制台输出选区信息（尚未创建 UI），并记录输入源限制提示。
- 默认配置中 `ui.enableFloatingAssistant` 为开启状态，关闭后脚本立即停用。
**Tests**:  
- `npm test`（需新增针对选区解析辅助函数的单测 `tests/content-selection.test.js`）。  
- 手动：在示例网页、禁止域名（`chrome://`）验证内容脚本注入与否。
**Status**: Complete

## Stage 2: 悬浮球组件与事件管理
**Goal**: 实现悬浮球的渲染、定位、显示/隐藏逻辑，以及节流与清理机制。
**Success Criteria**:  
- 选区出现后 150ms 内悬浮球呈现于视窗内，并在滚动/点击空白处即时消失。  
- 重复选择同一文本不会重复创建按钮，快速切换选区不会残留旧按钮。  
- 通过键盘（Tab/Enter）可触发悬浮球按钮。  
- 自研定位计算函数在常见视窗尺寸下保持正确，出现碰撞时自动调整。
**Tests**:  
- `npm test` 新增 `tests/floating-button.test.js`，覆盖定位计算、节流与状态机。  
- 手动：在含滚动容器与固定定位页面测试显示/隐藏。
**Status**: Complete

## Stage 3: 解析面板 UI 与字段渲染
**Goal**: 构建 Shadow DOM 弹窗，复用现有字段渲染逻辑，完成界面布局与状态提示。
**Success Criteria**:  
- 点击悬浮球后弹窗在附近出现，布局遵循 popup 的字段展示方式，可编辑字段。  
- 弹窗设置最大高度，超出部分可在内部滚动；滚动条样式与主题一致。  
- 弹窗包含解析中、解析完成、错误提示三种状态，支持 Loading 与重试。  
- 多语言文本通过 `i18n.js` 提供，缺失翻译有回退。
**Tests**:  
- `npm test` 新增 `tests/floating-panel.test.js` 检查字段渲染与状态切换。  
- 手动：中文/英文界面验证文案，深色背景网页验证对比度，并检查超长内容时弹窗内部出现滚动条。
**Status**: Not Started

## Stage 4: AI 解析与 Anki 写入集成
**Goal**: 将面板操作串联现有业务模块，确保解析、字段校验、写入流程可用。
**Success Criteria**:  
- 解析调用复用 `ai-service.js`，支持 Legacy/Dynamic 双模式，错误提示与 popup 保持一致。  
- 写入按钮调用 `ankiconnect.js`，成功/失败有明确反馈并具备幂等处理。  
- 在配置缺失（无 API Key、无字段映射）时给出引导链接至设置页。
**Tests**:  
- `npm test` 运行所有测试；为接口桥接添加模拟测试（可在 `tests/content-integration.test.js` 中使用 `mock`）。  
- 手动：通过本地 AnkiConnect 写入一次真实卡片，验证字段正确落库。
**Status**: Not Started

## Stage 5: 设置页联动、国际化与全面验收
**Goal**: 在选项页提供悬浮球开关，补齐多语言、文档与验收流程。
**Success Criteria**:  
- `options.html/js` 存在新的开关控件，实时更新配置并驱动内容脚本启停。  
- 开关旁展示说明文案（例如“若遇到兼容问题可关闭”），对应语言的翻译全部就绪。  
- 所有新增文案在各语言包（含脚本生成）中就绪，`generate_i18n_messages.py` 通过。  
- 验收清单覆盖主要浏览器页面的通用场景说明，并记录输入源限制。
**Tests**:  
- `npm test` 全量；执行 `python scripts/generate_i18n_messages.py --check`（若已有检查模式）。  
- 手动：按验收清单逐项验证含禁用开关、长文本、连续解析等场景（具体站点由你后续补充），并在选项页与弹窗内切换所有受支持语言核对翻译。
**Status**: Not Started

---

**依赖与前置条件**  
- 完成 API Key 与 AnkiConnect 的本地配置，以便 Stage 4 手工验收。  
- 若需引入第三方定位库（Floating UI），需在 Stage 1 确认许可证、打包方式与缓存策略；若最终选择纯手写定位，Stage 2 要同步更新成功标准。  
- 实施过程中如需新增资源文件（图标/CSS），请在提交前更新 `manifest.json`、`README.md` 中的引用。
