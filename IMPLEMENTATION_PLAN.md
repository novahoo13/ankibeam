# 解析模板功能实施计划

本文档记录解析模板功能的开发进度。

## 阶段 1: 模板数据结构与工具库

**目标**: 在不破坏现有存储的前提下,完成 `templateLibrary` 结构、访问 API 与迁移动作,供 UI 接入。

**状态**: ✅ 完成

### 已完成的任务

1. ✅ 新建 `utils/template-store.js`
   - 实现了所有核心CRUD函数:
     - `loadTemplateLibrary(config)` - 从config读取模板库
     - `getTemplateById(config, templateId)` - 按ID获取模板
     - `saveTemplate(config, template)` - 保存/更新模板
     - `deleteTemplate(config, templateId)` - 删除模板
     - `setDefaultTemplate(config, templateId)` - 设置默认模板
     - `setActiveTemplate(config, templateId, source)` - 设置活动模板
     - `listTemplates(config)` - 获取模板列表(按updatedAt排序)
     - `getActiveTemplate(config)` - 获取当前活动模板
     - `getDefaultTemplate(config)` - 获取默认模板
     - `normalizeTemplateFields(fields)` - 字段数组规范化
   - 所有函数都包含标准IT日语的JSDoc注释
   - 实现了模板验证和规范化逻辑
   - 支持自动设置首个模板为默认模板

2. ✅ 升级 `utils/storage.js`
   - 在 `buildDefaultConfig()` 中添加了:
     - `templateLibrary` 对象(version, defaultTemplateId, templates)
     - `ui.activeTemplateId` 字段
     - `ui.templateSelectionSource` 字段
   - 新增 `mergeTemplateLibrary()` 函数处理模板库合并
   - 更新 `mergeUiConfig()` 以支持新的UI字段
   - 在 `mergeConfigWithDefaults()` 中集成模板库合并逻辑

3. ✅ 调整 `utils/prompt-engine.js`
   - 新增 `buildPromptFromTemplate(template, userInput)` 函数
   - 标记以下函数为废弃(@deprecated),并添加console.warn警告:
     - `getPromptConfigForModel()`
     - `updatePromptConfigForModel()`
     - `loadPromptForModel()`
     - `savePromptForModel()`
   - 保持了向后兼容性,旧函数仍可使用但会显示警告

### 检查点验证

1. ✅ **空配置处理**: `loadTemplateLibrary()` 在完全没有 `templateLibrary` 数据时返回空的模板库结构:
   ```javascript
   {
     version: 1,
     defaultTemplateId: null,
     templates: {}
   }
   ```

2. ✅ **活动模板设置**: `setActiveTemplate()` 正确设置 `ui.activeTemplateId` 和 `ui.templateSelectionSource`

3. ✅ **模板驱动的Prompt构建**: `buildPromptFromTemplate()` 能够:
   - 从模板读取字段定义
   - 按照字段的order属性排序
   - 生成包含所有字段的prompt schema
   - 支持自定义prompt或使用默认模板

### 数据结构示例

```javascript
// 模板对象结构
{
  id: "tpl_001",
  name: "基础释义",
  description: "双字段释义模板",
  deckName: "Default",
  modelName: "Basic",
  modelId: 123456789,
  fields: [
    {
      name: "Front",
      label: "正面",
      parseInstruction: "输出单词+词性",
      order: 0,
      isRequired: false,
      aiStrategy: "auto"
    },
    {
      name: "Back",
      label: "背面",
      parseInstruction: "输出中文释义",
      order: 1,
      isRequired: false,
      aiStrategy: "auto"
    }
  ],
  prompt: "...完整 prompt...",
  createdAt: "2025-11-18T10:00:00Z",
  updatedAt: "2025-11-18T10:05:00Z"
}
```

### 交付文件

- [utils/template-store.js](utils/template-store.js) - 模板存储核心模块
- [utils/storage.js](utils/storage.js) - 更新后支持模板库
- [utils/prompt-engine.js](utils/prompt-engine.js) - 新增模板相关函数
- [utils/template-store.test.js](utils/template-store.test.js) - 验证脚本(可在浏览器控制台运行)

### 下一步

继续阶段2: Options 模板管理界面与交互

---

## 阶段 2: Options 模板管理界面与交互

**目标**: 将 options 页重构为"模板列表 + 模板编辑器",实现模板 CRUD、默认模板设置、Anki/Prompt 配置合并。

**状态**: ✅ 完成

### 已完成的任务 (2.1 - HTML结构)

1. ✅ 重构tab导航
   - 将5个tab改为4个: AI配置、解析模板、界面样式、系统
   - 移除了Anki配置和Prompt配置tab
   - 新增"解析模板"tab,使用文档图标

2. ✅ 添加模板列表视图HTML ([options.html](options/options.html):351-391)
   - 空态提示 (`template-empty-state`)
   - 模板列表容器 (`template-list-container`)
   - 新增模板按钮 (`add-template-btn`, `add-template-btn-empty`)
   - 模板卡片网格 (`template-cards-grid`)

3. ✅ 添加模板表单视图HTML ([options.html](options/options.html):393-552)
   - 基本信息区块: 名称、描述
   - Anki连接区块: 测试连接、牌组、模型、字段映射
   - 字段配置区块: 字段选择、字段解析指令
   - Prompt编辑区块: Prompt文本框、生成按钮
   - 表单操作: 保存、取消

4. ✅ 导入template-store模块 ([options.js](options/options.js):45-56)

### 待完成任务 (2.2 - JavaScript实现)

#### 2.2.1 基础设施
- [x] 添加模板编辑器状态对象 `templateEditorState` ([options.js](options/options.js):257-264)
- [x] 实现视图切换函数 `switchTemplateView(view)` ([options.js](options/options.js):2892-2908)
- [x] 添加模板表单重置函数 `resetTemplateForm()` ([options.js](options/options.js):2915-2958)

#### 2.2.2 模板列表功能
- [x] 实现 `loadTemplateList()` - 加载并渲染模板列表 ([options.js](options/options.js):2967-3002)
- [x] 实现 `renderTemplateCard(template)` - 渲染单个模板卡片 ([options.js](options/options.js):3011-3111)
- [x] 实现 `handleSetDefaultTemplate(templateId)` - 设置默认模板 ([options.js](options/options.js):3119-3139)
- [x] 实现 `handleEditTemplate(templateId)` - 编辑模板 ([options.js](options/options.js):3147-3196)
- [x] 实现 `handleDeleteTemplate(templateId)` - 删除模板 ([options.js](options/options.js):3204-3246)
- [x] 绑定"新增模板"按钮事件 ([options.js](options/options.js):951-965)
- [x] 绑定表单取消按钮事件 ([options.js](options/options.js):967-972)
- [x] 在页面加载时调用 `loadTemplateList()` ([options.js](options/options.js):975)

#### 2.2.3 模板表单功能 (复用现有代码)
- [x] 实现 `handleTemplateTestAnki()` - 复用 `testAnkiConnection()` ([options.js](options/options.js):2973-3024)
- [x] 实现 `loadTemplateAnkiData()` - 复用 `loadAnkiData()` ([options.js](options/options.js):3026-3094)
- [x] 实现 `handleTemplateModelChange()` - 复用 `handleModelChange()` ([options.js](options/options.js):3096-3156)
- [x] 实现 `renderTemplateFieldSelection()` - 渲染字段选择UI ([options.js](options/options.js):3158-3214)
- [x] 实现 `renderTemplateFieldConfig()` - 渲染字段配置UI ([options.js](options/options.js):3216-3270)
- [x] 实现 `handleTemplateGeneratePrompt()` - 生成Prompt ([options.js](options/options.js):3272-3296)
- [x] 实现 `synchronizeTemplatePrompt()` - 同步Prompt ([options.js](options/options.js):3298-3323)
- [x] 实现 `generateTemplatePrompt()` - 生成默认Prompt ([options.js](options/options.js):3325-3384)
- [x] 实现 `updateTemplateStatus()` - 更新状态消息 ([options.js](options/options.js):3386-3413)
- [x] 绑定测试连接按钮事件 ([options.js](options/options.js):984-987)
- [x] 绑定模型选择变更事件 ([options.js](options/options.js):989-992)
- [x] 绑定生成Prompt按钮事件 ([options.js](options/options.js):994-1001)
- [x] 绑定底部取消按钮事件 ([options.js](options/options.js):974-981)

#### 2.2.4 模板保存与验证
- [x] 实现 `validateTemplateForm()` - 表单验证 ([options.js](options/options.js):3895-3965)
- [x] 实现 `collectTemplateFormData()` - 收集表单数据 ([options.js](options/options.js):4027-4081)
- [x] 实现 `handleTemplateSave()` - 保存模板 ([options.js](options/options.js):4088-4143)
- [x] 绑定保存按钮事件 ([options.js](options/options.js):1004-1007)
- [x] 增强 `handleEditTemplate()` - 完整加载模板数据到表单 ([options.js](options/options.js):3211-3289)
- [x] 新增 `getModelNamesAndIds()` API - 获取模型ID ([ankiconnect.js](utils/ankiconnect.js):97-104)
- [x] 增强 `loadTemplateAnkiData()` - 保存模型ID映射 ([options.js](options/options.js):3480-3490)
- [x] 增强 `handleTemplateModelChange()` - 保存选中模型ID ([options.js](options/options.js):3557-3559)
- [x] 扩展 `templateEditorState` - 添加 modelNamesAndIds 和 modelId 字段 ([options.js](options/options.js):264-265)

#### 2.2.5 事件绑定
- [x] 绑定"新增模板"按钮事件 ([options.js](options/options.js):951-965) - 已在 2.2.2 完成
- [x] 绑定表单取消按钮事件 ([options.js](options/options.js):967-981) - 已在 2.2.2 完成
- [x] 绑定模板表单内的所有事件 ([options.js](options/options.js):984-1007) - 已在 2.2.3 和 2.2.4 完成

#### 2.2.6 初始化集成
- [x] 在页面加载时调用 `loadTemplateList()` ([options.js](options/options.js):1012) - 已在 2.2.2 完成
- [x] 添加storage变更监听,同步模板列表 ([options.js](options/options.js):1027-1055)

### 阶段 2 完成总结

阶段 2 已全部完成，实现了完整的模板管理界面：

**核心功能**:
- ✅ 模板列表视图（空态、卡片展示、默认标记、编辑/删除操作）
- ✅ 模板编辑器（新增/编辑模式、表单验证、数据收集、保存）
- ✅ Anki 连接测试和数据加载（牌组、模型、字段、模型ID）
- ✅ 字段选择和配置（多选、解析指令编辑）
- ✅ Prompt 生成和编辑（自动生成、手动编辑、同步）
- ✅ Storage 变更监听（跨 tab 同步）

**数据流**:
1. 用户测试 Anki 连接 → 加载牌组/模型列表
2. 选择模型 → 加载字段并保存 modelId
3. 选择字段 → 配置解析指令
4. 生成 Prompt → 可手动编辑
5. 保存模板 → 验证 → 写入 storage → 刷新列表
6. 编辑模板 → 加载数据到表单 → 修改 → 保存更新

**技术亮点**:
- 完整的表单验证（必填字段、字段配置、Prompt）
- 编辑模式保留 createdAt 时间戳
- 模型 ID 支持（调用 AnkiConnect 的 modelNamesAndIds）
- Storage 监听器实现跨 tab 自动同步
- 状态管理（templateEditorState）
- 视图切换（列表/表单）

### 可复用的现有代码

从现有options.js中可以直接复用:
- `testAnkiConnection()` - Anki连接测试 (line ~2396)
- `loadAnkiData()` - 加载牌组和模型 (line ~2692)
- `handleModelChange()` - 模型变更处理 (获取字段)
- `showPromptConfig()` - Prompt配置显示
- `generatePrompt()` - Prompt生成逻辑
- 字段选择/配置的渲染逻辑

### 下一步

继续实现2.2.1基础设施部分

---

## 阶段 3: Popup 模板选择与解析流程

**目标**: 让 popup 端基于模板渲染字段、触发解析/写入、在无模板时给出空态提示。

**状态**: 🚧 进行中

---

## 阶段 4: 内容脚本与悬浮球模板同步

**状态**: 未开始

---

## 阶段 5: 解析与写入管线全面切换

**状态**: 未开始

---

## 阶段 6: i18n、Tailwind 对齐与回归测试

**状态**: 未开始
