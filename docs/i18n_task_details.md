## 多语言修复任务详情

### 背景

在日语界面下测试时，发现选项页与部分提示信息仍显示为简体中文。进一步排查确认存在以下问题，需要在正式开发中依次处理。

### 待处理问题

- **缺失的多语言键值**
  - `popup_status_input_required` 未在任何语种的 `messages.json` 中定义，`popup/popup.js#L460` 会退回到中文 fallback。
  - 选项页字段映射模块及 Prompt 提示存在硬编码文案：  
    `options/options.js#L1983-L2007`, `#L2250-L2278`, `#L1294-L1299`。需要为以下文本建立 i18n 键，并在 `en/zh_CN/zh_TW/ja` 等全部语言包中补充译文：
    1. “模型字段 ({0}个):”
    2. “传统模式”标题与说明（正面/背面模式描述）
    3. “✨ 动态字段模式”标题与说明（自动填充、根据字段生成输入区域等描述）
    4. “当前模板：{0}” 显示文本（Prompt 页签顶部状态标签）
- **i18n 初始化时序问题**
  - `utils/i18n.js` 在 `DOMContentLoaded` 事件中异步执行 `setPageLanguage()`。但 `options/options.js#L672-L720` 和 `popup/popup.js#L418-L427` 同样在 `DOMContentLoaded` 时初始化 UI，并在渲染过程中调用 `getText`。当 `setPageLanguage()` 尚未完成时，`getText` 会使用 fallback，导致界面仍显示中文。需要在 UI 初始化前等待 i18n 完成加载（可通过新增 Promise 或在入口显式 `await setPageLanguage()`）。

### 任务拆解建议

1. **新增并补全 i18n 文案**
   - 在 `scripts/generate_i18n_messages.py` 注册上述缺失键，生成描述与占位符信息。
   - 同步更新 `_locales/en/messages.json`、`_locales/zh_CN/messages.json`、`_locales/zh_TW/messages.json`、`_locales/ja/messages.json`，确保四种语言均有译文。
   - 为 `popup_status_input_required` 等新键补充英文/简中/繁中/日文翻译，校验字符编码保持 ASCII。
2. **替换选项页硬编码文本**
   - 将 `options/options.js` 中直接拼接的中文字符串替换为对应的 `getText` 调用，并传入必要的 `substitutions`，保持 UI 逻辑不变。
   - 注意重复代码片段（如字段映射在 `handleModelChange` 与 `displaySavedModelInfo` 均需替换）。
3. **修复 i18n 初始化竞态**
   - 评估最优方案：
     - 在 `utils/i18n.js` 提供 `await setPageLanguage()` 的初始化 Promise。
     - 或将在 `options/options.js`、`popup/popup.js` 中监听自定义 “i18n-ready” 事件后再执行初始化。
   - 实现后验证 `getText` 调用是否仍有 fallback 运行（可通过手工将默认语言切换为日语进行回归）。

### 验证建议

- 手动切换语言到 `ja-JP`、`en-US`、`zh-CN`、`zh-TW`，重新加载 popup 与 options 页面，确认所有新增文本正确显示。
- 运行现有的 i18n 测试（`npm test -- i18n` 如有）或自定义脚本，确保未引入缺失键。
- 检查控制台是否仍出现 `console.warn`（来自 `getText` fallback）以确认竞态问题已解决。

### 参考前文：

#### 评估结果

1. popup/popup.js:460 调用 getText("popup_status_input_required", "请输入要解析的文本")，但日文包缺少 popup_status_input_required 键（\_locales/ja/messages.json 中不存在，scripts/generate_i18n_messages.py 也未生成）。因此即便语言切到日语，这条提示始终回退到中文，需要新增多语言键值。
2. 选项页在 DOMContentLoaded 里立即执行 initProviderUI() 等渲染逻辑（options/options.js:672），而 i18n 模块的 setPageLanguage() 是异步的（utils/i18n.js:328）。在自定义消息尚未加载完毕时调用 getText 会落回扩展默认语言（简体中文），导致诸如 “测试 XXX 连线”“获取 API Key”“常用模型”“目前的 URL”“API 位址”等按钮/标签都显示中文，即使 \_locales/ja/messages.json 已提供正确译文。需要在构建 UI 前等待 i18n 初始化完成，或在 i18n 侧提供 ready promise。
3. Anki 连接页的字段说明完全写死在模板字符串里（options/options.js:1983, 2000, 2006, 2254, 2271, 2277），包括“模型字段 (3 个): …”“✨ 动态字段模式”“该模型支持多字段…” 等句子。必须改成 getText + 占位符模式，并在各语言包补充新键，否则永远显示中文。
4. Prompt 设定区直接拼接 “当前模板：${modelName}”（options/options.js:1295），与 options_prompt_current_model 的 i18n 机制脱节。应该统一改用 getText 并传入模型名作为占位参数，这样 prompt tab 的标题才会按语言切换。
