## Stage 1: 数据结构与默认配置扩展

**Goal**: 支持为每个模板保存字段勾选状态、字段内容与样例等元数据，并在内存配置与持久化存储中统一管理
**Scope**:

- 扩展 `promptTemplates.promptTemplatesByModel[modelName]` 的结构为：
  ```jsonc
  {
    "selectedFields": ["正面", "背面", "例句"],
    "fieldConfigs": {
      "正面": {
        "content": "字段用途说明或默认文本",
        "example": "样例（可选）"
      },
      "背面": {
        "content": "...",
        "example": "..."
      }
    },
    "customPrompt": "用户最终编辑的完整 prompt 文本"
  }
  ```
- 对于未配置的新模板，初始化 `selectedFields` 为空数组、`fieldConfigs` 为空对象、`customPrompt` 置空。
- 扩展 `promptEditorState`，在内存中缓存以上结构，便于 UI 同步。
- `loadConfig` / `saveConfig`：保持“无迁移”假设，仅在读取旧格式时回落到默认空结构；保存时写入新结构。
- 辅助方法：
  - `getPromptConfigForModel(modelName, config)`：封装读取逻辑并返回深拷贝，以免引用污染。
  - `updatePromptConfigForModel(modelName, partialConfig)`：更新当前配置对象中的指定模板数据。
    **Success Criteria**:
- 切换模板后能正确读取并填充字段勾选状态、字段内容与样例。
- 保存配置后，重新打开 options 页面可恢复相同的数据结构。
- `saveConfig` 与 `loadConfig` 在现有生命周期内调用不报错，无 JSON 结构缺失警告。
  **Tests**:
- 手动：选择两个不同模板，各自勾选不同字段并填写内容，保存后重新打开页面确认数据恢复。
- 手动：删除某字段内容只保留样例，确认保存值符合 `fieldConfigs[field].example` 空/非空逻辑。
  **Status**: Complete

## Stage 2: Prompt 配置 UI 重构

**Goal**: 提供字段选择、字段配置表单与 Prompt 预览的交互式界面，确保数据实时同步
**Scope**:

- HTML 结构调整（`options/options.html`）：
  - 字段选择区：
    - 顶部展示模板字段列表，使用按钮或 Checkbox 样式表示选中/未选中。
    - 已选字段需突出显示（Tailwind 类：`bg-slate-600 text-white` 等）。
  - 字段配置区域：
    - 动态渲染选中字段对应的表单行，每行包含：
      - 字段名标签（只读）
      - 字段内容（多行文本，必填）
      - 样例（多行文本，可空）
      - 必填项需增加红色星号与校验提示
    - 未选字段应从 DOM 中移除或隐藏，避免提交无效内容。
- JS 逻辑（`options/options.js`）：
  - 新增 `renderFieldSelection(fields, selectedFields)`、`renderFieldForm(selectedFields, configs)`、`bindFieldEvents()`。
  - 提供状态同步：
    - 勾选字段时更新 `selectedFields` 并重新渲染表单。
    - 表单输入时更新 `fieldConfigs[field]` 内的 `content` 与 `example`。
    - 禁止在无选中字段时保存（按钮置灰或提示）。
  - 表单校验：
    - 保存前校验所有选中字段的 `content` 非空。
    - 失败时在对应输入框下方显示错误消息并阻止保存。
  - 与 Stage 1 数据结构的读写衔接：
    - 模型切换 → 调用 Stage 1 的 `getPromptConfigForModel` 并渲染。
    - 保存 → 使用 `updatePromptConfigForModel` 写回内存配置。
- 预览区：
  - 每次字段配置变化后调用 Stage 3 的拼装函数生成临时预览文本。
  - 若用户已手动修改 `customPrompt`，在保存前用专门的 dirty 标记决定是否覆盖预览。
    **Success Criteria**:
- 选择模型后，字段选择区与字段配置表单按预期显示。
- 勾选/取消字段可实时刷新表单并保留其他字段输入。
- 保存时若存在未填字段内容，会给出明确提示且阻止保存。
- 刷新页面后，UI 恢复至保存时状态。
  **Tests**:
- 手动：多次勾选/取消并输入不同内容，确认预览文本与表单同步。
- 手动：尝试仅填写样例不填内容，确认无法保存并给出提示。
- 手动：切换到第二个模板输入内容，返回第一个模板确认之前数据未丢失。
  **Status**: Complete

## Stage 3: Prompt 组装与重置逻辑

**Goal**: 基于字段配置自动拼装默认 Prompt，分为“字段返回内容定义”和“输出格式定义”，并支持重置按钮
**Scope**:

- 新增 `generateDefaultPrompt(selectedFields, fieldConfigs)` 工具函数（位于 `options/options.js` 或独立 util 文件）：
  - 遵循模板字段顺序遍历 `selectedFields`。
  - 对每个字段生成如下段落：
    - 第一行：`${字段名}：${字段配置.content}`
    - 若存在样例：换行追加 `样例：${字段配置.example}`。
  - 汇总“字段返回内容定义”部分时，保持缩进与层级结构参考需求文档示例。
  - “输出格式定义”部分按选中字段生成 JSON 样板：
    ```json
    {
      "字段A": "请填入字段A内容",
      "字段B": "请填入字段B内容"
    }
    ```
    - 仅使用选中字段名，无需额外字段。
  - 末尾追加提示文案：要求仅输出 JSON 等。
- 重置按钮行为：
  - 点击时调用 `generateDefaultPrompt`，将结果写入 `customPrompt` 文本域，并同步预览。
  - 记录 `promptEditorState.lastGeneratedPrompt` 以便判断用户后续修改。
- Prompt 预览：
  - 若自定义 prompt 未被手动编辑，则实时展示 `generateDefaultPrompt` 输出；
  - 手动编辑后，预览改为显示用户输入，不再自动覆盖。
- 保存逻辑：
  - 将最终 `customPrompt` 与字段配置一同写入 Stage 1 结构。
  - 若用户在保存前点击重置，保存应写入最新生成的 prompt。
    **Success Criteria**:
- 无字段配置时重置按钮禁用或提示先选择字段。
- 有字段配置时，重置生成的 prompt 包含所有选中字段的定义与 JSON 输出结构。
- 用户手动修改 prompt 后，预览显示用户内容，再次重置可恢复机械生成版本。
  **Tests**:
- 手动：选择 3 个字段填写内容/样例，点击重置并检查 prompt 文案与 JSON 字段顺序与模板一致。
- 手动：修改 prompt 文本并保存，刷新页面确认保存的是自定义版本；再次点击重置获取新版本。
- 手动：取消某字段勾选后重置，确认 prompt 中移除对应字段文本。
  **Status**: Complete

## Stage 4: Popup 解析与写入联调

**Goal**: 使用新的 prompt 结构驱动 popup 的 AI 解析流程，确保字段填充与错误处理保持一致
**Scope**:

- `utils/prompt-engine.js` / `utils/ai-service.js`：
  - `buildIntegratedPrompt` 接口保持不变，但内部改为：
    - 当传入的自定义 prompt 已经是完整文本（非占位符模式）时，直接返回该文本并追加现有 JSON 输出约束语句（若需求允许，可考虑是否仍需附加）。
    - 当选中字段为空时，及时返回错误提示，阻止解析。
  - `validateAIOutput`：保持逻辑，确保按照 `selectedFields` 验证。
- `popup/popup.js`：
  - 调用解析前需加载新的模板配置：
    - 通过 `loadConfig` 获取 `promptTemplates.promptTemplatesByModel[modelName]`。
    - 将 `customPrompt` 直接传入 `parseTextWithDynamicFields`。
    - 将 `selectedFields` 作为字段名顺序传给 `collectFieldsForWrite` 等函数。
  - 当解析结果缺失字段时的提示文案需结合新配置检查（已有逻辑通常可复用）。
  - 确保写入 Anki 前，对字段顺序与 UI 欄位匹配无误。
- 状态同步：
  - 若用户重新保存 prompt，需在 popup 端刷新配置缓存（扩展中通常在每次打开 popup 时重新读取）。
    **Success Criteria**:
- popup 端解析时使用新生成的 prompt 文本，无 `{{FIELD_SCHEMA}}` 等旧占位符残留。
- AI 返回的 JSON 只包含选中字段，能够通过验证并填充页面。
- 错误提示与重试逻辑与旧版本一致，无新增异常。
  **Tests**:
- 手动：配置 3 个字段后在 popup 中实际调用 AI（可使用 Mock 或手动粘贴 JSON），确认字段填充、空字段提示、错误重试流程。
- 手动：更改选中字段后重新解析，确认新字段顺序与内容写入正确。
- 手动：在 popup 控制台确认 `buildIntegratedPrompt` 输出文本符合机械生成结果。
  **Status**: Complete

## Stage 5: 遗留逻辑清理与样式构建

**Goal**: 移除不再使用的 Prompt 配置资产，整理样式与脚本，使代码库与新实现保持一致
**Scope**:

- 代码清理：
  - 删除旧的字段标签插入逻辑（如 `handleFieldTagInsert` 等不再被调用的方法）及其引用。
  - 移除 HTML 模板中废弃的 DOM 元素（例如 `field-tags-list`、`prompt-field-tags` 等若已不再需要的容器）。
  - 清理 `prompt-engine.js`、`ai-service.js` 中仅支持旧逻辑的辅助函数或常量。
  - 搜索项目内是否仍引用 `{{FIELD_SCHEMA}}`、`{{AVAILABLE_FIELDS}}` 等占位符，全部移除或替换。
- 样式与构建：
  - 移除 Tailwind 或自定义 CSS 中不再使用的类（如针对旧字段标签的样式）。
  - 运行 `npm run css:build` 生成最新的 `styles/tailwind.min.css`，确保 options 页面样式与新组件一致。
- 验证清理后 Options/Popup 页面均可正常加载、无控制台错误。
  **Success Criteria**:
- 项目中不再存在未使用的旧 Prompt 相关函数、DOM 元素或占位符。
- `options/options.html`、`options/options.js`、`utils/prompt-engine.js` 中的逻辑与 UI 均仅包含新实现内容。
- `npm run css:build` 成功且生成的样式文件在 Options 页面展示无破坏。
  **Tests**:
- 手动：启动扩展后访问 Options 与 Popup，检查控制台无报错，功能流程正常。
- 手动：搜索代码库确认旧逻辑符号已被移除（例如 `rg "FIELD_SCHEMA"` 返回空）。
- 手动：在重新构建样式后浏览页面，检查新旧样式切换无视觉回 regress。
  **Status**: Complete
