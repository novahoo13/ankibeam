# 内置模板功能规格文档

> **分支**: `feat/builtin-templates`
> **状态**: 草稿 v0.1 — 待完善
> **最后更新**: 2026-02-19

---

## 一、背景与目标

当前用户要开始使用 AnkiBeam，必须完成以下手动步骤：

1. 在 Anki 里手动创建 Note Type（含字段、卡片模板、CSS）
2. 在 AnkiBeam Options 里手动创建插件模板（填写 Deck 名、Model 名、字段映射）

**目标**：通过内置模板，让用户在安装好 Anki + AnkiConnect 后，无需任何手动配置即可开始使用。

---

## 二、两层架构

内置模板涉及两个不同层级的概念，需要同时处理：

```
┌─────────────────────────────────────────────────────┐
│ Layer 1: Anki Note Type Definition                  │
│ (AnkiConnect createModel 的参数)                    │
│ - modelName, inOrderFields, css, cardTemplates      │
│ 这是 Anki 软件内部的卡片格式定义                     │
└──────────────────────┬──────────────────────────────┘
                       │ 对应关系
┌──────────────────────▼──────────────────────────────┐
│ Layer 2: Plugin Template (template-store)            │
│ (chrome.storage.local 里的 templateLibrary)          │
│ - deckName, modelName, fields + parseInstruction     │
│ 这是插件侧的 AI 解析配置 + 字段映射                   │
└─────────────────────────────────────────────────────┘
```

**两层都需要初始化**，缺一不可。

---

## 三、需要新增/修改的文件

### 3.1 新增：`utils/builtin-templates.js`

存放所有内置模板的数据定义，包含两层的完整信息。

**数据结构设想（待定）**：

```js
export const BUILTIN_TEMPLATES = [
  {
    // ── Layer 1: Anki Note Type ──
    ankiModel: {
      modelName: "AnkiBeam - Vocabulary",
      inOrderFields: ["Word", "Reading", "Meaning", "Sentence", "Audio"],
      css: `/* TODO: 设计卡片样式 */`,
      cardTemplates: [
        {
          Name: "Recognition",
          Front: "{{Word}}",
          Back: "{{FrontSide}}<hr>{{Reading}}<br>{{Meaning}}<br>{{Sentence}}",
        }
      ],
    },
    // ── Layer 2: Plugin Template ──
    pluginTemplate: {
      name: "AnkiBeam - 词汇 (Vocabulary)",
      description: "适用于英语/日语词汇学习的内置模板",
      deckName: "AnkiBeam",
      modelName: "AnkiBeam - Vocabulary", // 必须与上面 ankiModel.modelName 一致
      fields: [
        { name: "Word",      label: "单词",   parseInstruction: "The target word or phrase" },
        { name: "Reading",   label: "读音",   parseInstruction: "Pronunciation or reading (kana for Japanese)" },
        { name: "Meaning",   label: "释义",   parseInstruction: "Definition in the target language and Chinese" },
        { name: "Sentence",  label: "例句",   parseInstruction: "An example sentence containing the word" },
        { name: "Audio",     label: "音频",   parseInstruction: "" },
      ],
    },
    // ── 元数据 ──
    id: "builtin_vocabulary",  // 固定 ID，不随时间变化
    locale: null,              // null = 所有语言通用；或 "ja-JP" 等
    version: 1,
  },
  // ... 其他内置模板
];
```

> **TODO**: 需要确认支持哪些语言，每种语言的模板字段和卡片样式。

---

### 3.2 修改：`utils/ankiconnect.js`

需要新增两个函数（目前均未实现）：

#### `createModel(modelProfile)`
```js
// modelProfile 直接对应 BUILTIN_TEMPLATES[n].ankiModel 的结构
export async function createModel(modelProfile) {
  try {
    const response = await invoke("createModel", modelProfile);
    return { result: response.result, error: null };
  } catch (e) {
    return { result: null, error: e.message };
  }
}
```

#### `createDeck(deckName)`
```js
// AnkiConnect 参数名是 deck（不是 deckName）
export async function createDeck(deckName) {
  try {
    const response = await invoke("createDeck", { deck: deckName });
    return { result: response.result, error: null };
  } catch (e) {
    return { result: null, error: e.message };
  }
}
```

> **注意**：`createDeck` 的 AnkiConnect 参数是 `deck`，不是 `deckName`。

---

### 3.3 新增（或修改）：`services/builtin-template-service.js`（待定，或并入 config-service）

负责"懒加载初始化"核心逻辑：

```
ensureBuiltinTemplate(templateId, config)
├── 检查 modelNames → 如果 Note Type 不存在 → createModel
├── 检查 deckNames  → 如果 Deck 不存在       → createDeck
└── 检查 templateLibrary → 如果 Plugin Template 不存在 → saveTemplate
```

> **TODO**: 确认是新建独立 service 还是并入现有 `config-service.js`。

---

### 3.4 修改：`services/anki-service.js`

当前 `writeToAnki()` 的逻辑起点是"假定 template、deck、model 都已存在"。

需要的变更：
- 当 `activeTemplate` 是内置模板时，在 `addNote` 前调用 `ensureBuiltinTemplate()`
- 这是"懒加载"策略：第一次写入时自动创建基础设施

---

### 3.5 修改：`options/options.js` + `options.html`

影响最大的部分，详见第四节。

---

## 四、各入口点用户流程影响分析

### 4.1 悬浮球（Floating Panel）

**当前流程**：
```
选中文字 → 悬浮按钮 → 点击 → AI 解析 → 字段填充 → [写入 Anki]
                                                          ↓
                                           依赖 activeTemplate 存在
                                           依赖 deckName/modelName 已在 Anki 中存在
```

**引入内置模板后**：
```
选中文字 → 悬浮按钮 → 点击 → AI 解析 → 字段填充 → [写入 Anki]
                                                          ↓
                                           (新) 如果是内置模板且首次使用
                                                → ensureBuiltinTemplate()
                                                → createDeck + createModel (按需)
                                                → addNote
```

**需要处理的 UX 问题**：
1. **无模板时的默认行为**：如果用户从未配置过模板，当前会报错"未选择解析模板"。引入内置模板后，应该自动使用默认内置模板。
2. **首次写入的加载延迟**：createModel 可能需要 1-2 秒，需要在 Panel 的 `loading` 状态中体现。
3. **模板选择器**（panel 顶部有模板切换吗？）→ 需要确认当前 floating-panel 是否有模板选择 UI。

> **TODO**: 确认悬浮面板是否有模板切换器 UI，若无则内置模板对悬浮流程的影响较小。

---

### 4.2 Popup

**当前流程**：
```
打开 Popup → 显示模板选择器 → 粘贴/输入文字 → AI 解析 → 写入 Anki
```

**引入内置模板后**：

**模板选择器的变化**：
- 内置模板应该出现在模板列表中
- 需要视觉上区分"内置"vs"用户自建"（例如加 badge 或图标）
- 内置模板不应该出现"删除"按钮（或至少给出警告）

**写入流程的变化**：
- 与悬浮球相同：首次写入触发 `ensureBuiltinTemplate()`

> **TODO**: 检查 popup.js 中的模板列表渲染逻辑，确认需要哪些 UI 改动。

---

### 4.3 Options 页面 — 模板管理

Options 页面受影响最大，主要体现在以下几个方面：

#### A. 模板列表展示
- 内置模板需要在列表中显示，并有"内置"标识
- 内置模板的操作按钮应限制（禁用编辑/删除，或改为"恢复默认"）

#### B. 新增"内置模板"入口

**方案 A：放在"Anki 连接"设置区域**
- 连接测试通过后，显示"安装内置模板"按钮
- 适合"一次性初始化"的操作心智

**方案 B：放在模板管理列表顶部**
- 一个单独的"内置模板库"卡片/区块
- 每个内置模板有独立的"安装"按钮和状态（已安装/未安装）
- 更直观，用户可以按需选择安装哪些

**当前倾向**: 方案 B，因为未来内置模板可能会有多个。

> **TODO**: 与用户确认 UI 方案偏好。

#### C. Anki 侧 vs 插件侧的状态同步

当用户点击"安装"时，实际上有两个操作：
1. 在 Anki 里创建 Note Type（需要 AnkiConnect 在线）
2. 在插件的 template-store 里注册 Plugin Template

Options 页面需要：
- 在操作前检查 AnkiConnect 是否可用
- 区分"已安装在 Anki 中"和"已在插件中配置"这两个状态
- 显示清晰的操作结果反馈

---

## 五、存储方案（待定）

**问题**：内置的 Plugin Template 是存在 `chrome.storage.local` 里，还是每次从代码中动态生成？

| 方案 | 优点 | 缺点 |
|------|------|------|
| **纯代码** - 不存 storage，每次用时从 `BUILTIN_TEMPLATES` 读取 | 升级版本后自动生效 | 无法在用户端自定义 |
| **存入 storage** - 像普通模板一样保存 | 可被用户修改 | 升级后不会自动更新 |
| **混合** - 定义在代码，安装后复制到 storage，标记 `isBuiltin: true` | 可修改，可识别，可"恢复默认" | 实现复杂 |

**当前倾向**: 混合方案。`isBuiltin: true` 标记用于 UI 识别（显示 badge、禁用删除等）。

> **TODO**: 确认方案。

---

## 六、技术依赖与注意事项

1. **AnkiConnect `createModel` 的 `css` 是可选参数**（不传则使用 Anki 默认样式）
2. **`createDeck` 的 AnkiConnect 参数名是 `deck`**（不是 `deckName`！）
3. **`createDeck` 不会覆盖同名 Deck**，重复调用安全
4. **`createModel` 对同名 Model 的行为待验证**：是报错还是更新？（需要实际测试）

> **TODO**: 测试 `createModel` 对同名 Model 的行为。

---

## 七、实施顺序建议

```
Phase 1: 基础 API 层
  └── utils/ankiconnect.js: 添加 createModel, createDeck

Phase 2: 内置模板定义
  └── utils/builtin-templates.js: 定义 BUILTIN_TEMPLATES 常量

Phase 3: 懒加载服务
  └── services/builtin-template-service.js (或并入 config-service)

Phase 4: Options UI
  └── options.js + options.html: 添加内置模板展示和安装入口

Phase 5: 写入流程集成
  └── services/anki-service.js: 集成懒加载逻辑
  └── popup.js: 模板列表区分内置/用户自建
  └── content-main.js: 无模板时默认使用内置模板
```

---

## 八、开放问题清单（TODO）

- [ ] 支持哪些语言的内置模板？每种语言的字段和卡片样式如何设计？
- [ ] 内置模板的存储方案确认（纯代码 / 存 storage / 混合）
- [ ] Options 页面的 UI 方案确认（方案 A 还是方案 B）
- [ ] `createModel` 对同名 Model 的行为测试
- [ ] 悬浮面板是否有模板切换器 UI？
- [ ] 内置 Deck 名称定为 `AnkiBeam`？还是按语言区分？
- [ ] 内置模板的 CSS 和卡片 HTML 设计（需要 UI 设计决策）

---

*文档由 Claude Code 生成，仍不完整，待与开发者共同完善。*
