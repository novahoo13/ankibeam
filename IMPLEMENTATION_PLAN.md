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

**状态**: 进行中

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
- [ ] 实现 `loadTemplateList()` - 加载并渲染模板列表
- [ ] 实现 `renderTemplateCard(template)` - 渲染单个模板卡片
- [ ] 实现 `handleSetDefaultTemplate(templateId)` - 设置默认模板
- [ ] 实现 `handleEditTemplate(templateId)` - 编辑模板
- [ ] 实现 `handleDeleteTemplate(templateId)` - 删除模板

#### 2.2.3 模板表单功能 (复用现有代码)
- [ ] 实现 `handleTemplateTestAnki()` - 复用 `testAnkiConnection()`
- [ ] 实现 `loadTemplateAnkiData()` - 复用 `loadAnkiData()`
- [ ] 实现 `handleTemplateModelChange()` - 复用 `handleModelChange()`
- [ ] 实现 `renderTemplateFields(fields)` - 复用字段选择/配置逻辑
- [ ] 实现 `handleTemplateGeneratePrompt()` - 复用 `generatePrompt()`

#### 2.2.4 模板保存与验证
- [ ] 实现 `validateTemplateForm()` - 表单验证
- [ ] 实现 `collectTemplateFormData()` - 收集表单数据
- [ ] 实现 `handleTemplateSave()` - 保存模板

#### 2.2.5 事件绑定
- [ ] 绑定"新增模板"按钮事件
- [ ] 绑定表单取消按钮事件
- [ ] 绑定模板表单内的所有事件

#### 2.2.6 初始化集成
- [ ] 在页面加载时调用 `loadTemplateList()`
- [ ] 添加storage变更监听,同步模板列表

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

**状态**: 未开始

---

## 阶段 4: 内容脚本与悬浮球模板同步

**状态**: 未开始

---

## 阶段 5: 解析与写入管线全面切换

**状态**: 未开始

---

## 阶段 6: i18n、Tailwind 对齐与回归测试

**状态**: 未开始
