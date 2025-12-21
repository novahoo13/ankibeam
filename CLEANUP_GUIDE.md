# 代码清理与弃用指南 (Phase 5.2 - Refactoring Guide)

本文档旨在指导后续通过 Agent 进行遗留代码清理工作。随着模板系统 (Template System) 的全面上线，原有的基于 `config.ankiConfig.modelFields` 和 `config.promptTemplates` 的旧解析逻辑已不再需要作为核心功能维护。

## 目标

安全地移除已废弃的旧版 Prompt 配置函数及相关调用，简化代码库，同时确保系统稳定性。

## 核心原则

1. **最小破坏**: 优先移除明确标记为 `@deprecated` 且确信未被新逻辑依赖的代码。
2. **保留兜底**: 虽然不再积极支持 Legacy 配置，但 `ai-service.js` 中的部分基础验证逻辑如果通用，应予以保留。
3. **逐步执行**: 建议按文件模块分批次进行，每修改一个模块都应进行简单验证。

---

## 1. 待清理模块: `utils/prompt-engine.js`

该文件是清理的重点。以前用于管理 "Legacy Prompt Config" 的函数应被移除。

### 需要移除的导出函数:

- `getPromptConfigForModel(modelName, config)`
- `updatePromptConfigForModel(modelName, partialConfig, config)`
- `loadPromptForModel(modelName, config)`
- `savePromptForModel(modelName, prompt, config)`

### 需要保留的函数 (可能仍被模板引擎内部使用或作为通用工具):

- `buildIntegratedPrompt(...)`: **核心函数**，新版模板引擎 `buildPromptFromTemplate` 仍依赖它来组装最终 Prompt。
- `validateAIOutput(...)`: **核心函数**，用于 AI 结果验证，必须保留。
- `normalizePromptTemplateConfig(...)` / `createEmptyPromptTemplateConfig(...)`: 检查是否被 `buildIntegratedPrompt` 间接依赖。如果仅被上述废弃函数使用，则可一并移除。

---

## 2. 待更新引用 (Refactoring Imports)

移除上述函数定义后，必须同步清理引入了这些函数的文件。

### `popup/popup.js`

- **操作**: 删除对废弃函数的 `import`。
- **检查**: 搜索 `handleAIParsing` 或初始化逻辑，确认是否还有回退到 `getPromptConfigForModel` 的代码。如果有，将其简化为仅处理 Template 模式，或仅保留最基本的空值处理。

### `content/content-main.js`

- **操作**: 删除对废弃函数的 `import`。
- **检查**: 确认 `bootstrap()` 过程中不再尝试加载旧版 Prompt 配置。

### `options/options.js`

- **操作**: 删除对废弃函数的 `import`。
- **检查**: Options 页面原本有 "Anki 配置" 和 "Prompt 配置" 两个旧 tab。
  - 如果这两个 Tab 的 HTML 元素已经被移除或隐藏，那么 `options.js` 中对应的事件绑定（如 `handleModelChange` 老逻辑、`handleSavePrompt` 老逻辑）也应该被删除。
  - **重点**: 请仔细区分 "Template 编辑器" 中的逻辑和 "旧版全局配置" 的逻辑。Template 编辑器复用了部分 Anki 连接测试代码，但 Prompt 管理应该是独立的。

---

## 3. 执行步骤建议

1.  **备份**: 确保当前分支代码已提交。
2.  **修改 `utils/prompt-engine.js`**: 删除废弃函数。
3.  **运行静态检查/构建**: 如果有 ESLint 或 TypeScript 检查，此时会报错提示找不到导出。
4.  **修复引用**: 根据报错或全文搜索，逐个修复 `popup.js`, `content-main.js`, `options.js` 中的引用。
5.  **验证**:
    - Build 扩展。
    - 打开 Options 页，确保 Template 功能正常（新建/编辑/保存）。
    - 打开 Popup 和 Floating Panel，确保解析功能正常。

## 4. 注意事项

- **不要删除 `utils/prompt-engine.js` 文件本身**。它仍然承担着 Prompt 组装与结果校验的核心职责。
- **小心 `buildPromptFromTemplate`**: 这是新版的核心，千万不要误删。
