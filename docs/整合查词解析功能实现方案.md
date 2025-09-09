# Anki 单词助手 - 整合查词解析功能实现方案

**文档版本：** v1.1  
**创建日期：** 2025年9月9日  
**更新日期：** 2025年9月9日  
**适用版本：** feature/stage-1-architecture 及后续版本  
**功能概述：** 整合查单词和分析流程，实现动态字段映射的一站式解决方案

---

## 1. 项目现状分析

### 1.1 当前项目架构
- **扩展类型**: Chrome Extension (Manifest V3)
- **核心模块**:
  - `popup/`: 主界面 (popup.html/popup.js)
  - `options/`: 设置页面 (options.html/options.js)
  - `utils/`: 核心服务 (ai-service.js, ankiconnect.js, storage.js)

### 1.2 当前工作流程限制
1. **用户输入** → 文本框输入查询结果（需要在外部软件完成查询）
2. **AI解析** → 调用AI服务解析为固定的`{front, back}`格式
3. **显示结果** → 固定的正面/背面两个字段
4. **写入Anki** → 映射到模板的前两个字段

### 1.3 技术债务分析

#### 1.3.1 UI 界面限制
**位置：** `popup/popup.html:41-56`
```html
<div class="result-section">
  <div class="form-group">
    <label for="front-input">正面:</label>
    <input type="text" id="front-input" />
  </div>
  <div class="form-group">
    <label for="back-input">背面:</label>
    <textarea id="back-input" rows="8"></textarea>
  </div>
</div>
```
**问题：** 界面固定只有两个输入框，无法适配不同模板的字段数量。

#### 1.3.2 数据处理限制
**位置：** `popup/popup.js:54-55, 107-109`
```javascript
// AI解析结果固定格式
document.getElementById('front-input').value = result.front || '';
document.getElementById('back-input').value = result.back || '';

// 写入时固定使用前两个字段
fields[fieldNames[0]] = frontHtml; // 第一个字段作为正面
fields[fieldNames[1]] = backHtml;  // 第二个字段作为背面
```
**问题：** 数据处理逻辑硬编码为两个字段，无法利用模板的其他字段。

#### 1.3.3 AI 解析输出限制
**位置：** `utils/ai-service.js:84-96`
```javascript
const defaultPromptTemplate = `
请将以下单词查询结果解析为结构化数据。
你的输出必须是一个纯粹的JSON对象，不要包含任何解释性文字或代码块标记。
JSON格式如下:
{
  "front": "单词",
  "back": "完整的单词查询结果（保留原始换行格式）"
}
```
**问题：** AI 输出格式固定为 `{front, back}` 结构，无法适配多字段需求。

### 1.4 现有优势和可扩展基础

#### 1.4.1 AnkiConnect 集成完善
- **字段获取功能：** `getModelFieldNames()` 已能动态获取任意模板字段
- **模板获取功能：** `getModelNames()` 已能获取所有模板列表
- **写入功能：** 支持任意字段数量的笔记创建
- **配置管理：** 完整的存储和加密系统

#### 1.4.2 AI 服务架构灵活
- 支持多AI供应商 (Google, OpenAI, Anthropic)
- 可配置的prompt模板系统
- 错误处理和降级机制完善

---

## 2. 用户需求分析

### 2.1 核心需求
1. **整合查询和解析流程**：
   - 在一个prompt中完成单词查询+结果解析
   - 替代现在的两步流程（外部查询→内部解析）

2. **动态字段映射**：
   - popup页面根据options中设定的Anki模板动态显示字段
   - AI解析结果能映射到任意数量的字段
   - 支持自定义字段配置

3. **增强的Prompt配置体验**：
   - 可视化的字段变量插入
   - 点击模板字段名插入到prompt中
   - 更直观的prompt编辑界面

### 2.2 用户使用场景
```
原有流程：
（1）在其他软件中进行单词查询和prompt定义
1-1、原有查单词prompt：查询日语单词的详细信息
1-2、出来单词查询结果：获得完整的单词解析

（2）在当前项目中，粘贴查询结果，再次根据prompt解析出json
2-1、解析prompt：将查询结果转换为结构化数据

（3）根据解析出的json，写入到anki模板字段中

期望流程：
（1）在options中配置Anki模板和对应的prompt模板
（2）在popup中输入单词，系统使用预配置的prompt完成查询和解析
（3）popup页面根据预设模板动态显示字段并自动填充结果
（4）一键写入Anki
```

---

## 3. 技术实现方案

### 3.1 整体架构设计

#### 3.1.1 数据流重构
```
用户输入单词 → 加载预配置Prompt → AI统一处理 → 多字段解析 → 动态UI显示 → Anki写入
```

#### 3.1.2 核心模块改进
- **Prompt Engine**: 新增模块处理字段变量和模板生成
- **Dynamic UI Renderer**: 根据Anki模板动态生成表单
- **Field Mapper**: 处理AI输出到Anki字段的映射关系

---

## 4. 详细实现计划

### Phase 1: 基础字段动态化（优先级：高）

#### 1.1 配置结构扩展 - `utils/storage.js`
**工作内容：**
- 扩展`DEFAULT_CONFIG.ankiConfig`结构
  ```javascript
  ankiConfig: {
    defaultDeck: '',
    defaultModel: '',
    modelFields: [],           // 已有：当前模板的字段列表
    fieldTypes: {},            // 新增：字段类型 (text/textarea)
    fieldDisplayOrder: []      // 新增：字段显示顺序
  }
  ```
- 扩展`DEFAULT_CONFIG.promptTemplates`结构
  ```javascript
  promptTemplates: {
    custom: '',                        // 保持向后兼容
    templatesByModel: {},              // 按Anki模板存储prompt
    fieldVariables: ['{{front}}', '{{back}}', '{{meaning}}']  // 可用变量
  }
  ```
- 简化配置管理：移除复杂的fieldMappings配置，采用直接字段名匹配

#### 1.2 动态UI渲染 - `popup/popup.html` & `popup/popup.js`
**工作内容：**
- **popup.html**: 将固定的`.result-section`改为占位容器
  ```html
  <div id="dynamic-fields-container" class="result-section space-y-3">
    <!-- 动态生成的字段将插入这里 -->
  </div>
  ```
- **popup.js**: 添加UI生成函数
  - `renderDynamicFields(fieldNames)`: 根据字段数组生成表单
  - `updateFieldsFromConfig()`: 从配置中获取字段信息并渲染
  - 修改`initialize()`调用字段渲染
  - 适配`handleParse()`和`handleWriteToAnki()`处理动态字段

#### 1.3 AI解析输出适配 - `utils/ai-service.js`
**工作内容：**
- 修改默认prompt模板支持动态字段
  ```javascript
  const generateDynamicPrompt = (fieldNames, userInput) => {
    const fieldSchema = fieldNames.reduce((schema, field) => {
      schema[field] = "相应内容";
      return schema;
    }, {});
    return `解析以下文本为JSON格式：${JSON.stringify(fieldSchema)}...`;
  }
  ```
- 更新`parseText()`函数参数，接受字段配置
- 实现字段验证机制确保AI输出字段名正确性

#### 1.4 字段验证与映射机制 - `utils/field-validator.js`
**工作内容：**
- 创建字段验证模块：
  ```javascript
  // 字段验证：AI输出字段必须是模板字段的子集
  function validateAIOutput(aiOutput, templateFields) {
    const aiFields = Object.keys(aiOutput);
    const invalidFields = aiFields.filter(field => !templateFields.includes(field));
    
    return {
      isValid: invalidFields.length === 0,
      invalidFields,
      validFields: aiFields.filter(field => templateFields.includes(field)),
      missingFields: templateFields.filter(field => !aiFields.includes(field))
    };
  }
  ```
- **验证原则**：
  - AI输出的字段名必须是Anki模板字段的子集
  - 允许部分字段填充，不要求输出所有模板字段
  - 字段名必须与模板中的字段名完全一致（区分大小写）
  - 出现非法字段时自动重试一次

#### 1.5 写入逻辑重构 - `popup/popup.js`
**工作内容：**
- 重构`handleParse()`函数：
  ```javascript
  async function handleParse() {
    const userInput = document.getElementById('text-input').value;
    const templateFields = config.ankiConfig.modelFields;
    
    try {
      const aiResult = await parseText(userInput, templateFields);
      const validation = validateAIOutput(aiResult, templateFields);
      
      if (!validation.isValid) {
        // 重试机制
        const retryResult = await parseText(userInput, templateFields);
        const retryValidation = validateAIOutput(retryResult, templateFields);
        
        if (!retryValidation.isValid) {
          throw new Error(`AI输出包含非法字段: ${retryValidation.invalidFields.join(', ')}`);
        }
        fillDynamicFields(retryResult, templateFields);
      } else {
        fillDynamicFields(aiResult, templateFields);
      }
    } catch (error) {
      updateStatus(`解析失败: ${error.message}`, 'error');
    }
  }
  ```
- 重构`handleWriteToAnki()`函数：
  - 动态收集所有模板字段值（包括空字段）
  - 支持部分字段填充，验证至少有一个字段非空
  - 简化字段映射：直接1:1对应，无需复杂映射配置

### Phase 2: 增强Prompt配置（优先级：中）

#### 2.1 字段变量系统 - `utils/storage.js` & `utils/prompt-engine.js`
**工作内容：**
- 创建新模块`utils/prompt-engine.js`：
  - `replaceFieldVariables(template, fieldNames)`: 将`{{字段名}}`替换为实际字段
  - `validatePromptTemplate(template)`: 验证prompt模板语法
  - `generateFieldSchema(fieldNames)`: 生成动态JSON schema
  - `loadPromptForModel(modelName)`: 加载特定模板的prompt
  - `savePromptForModel(modelName, prompt)`: 保存模板专用prompt

#### 2.2 可视化Prompt编辑器 - `options/options.html` & `options/options.js`
**工作内容：**
- **options.html**: 增强prompt配置区域
  ```html
  <!-- Anki模板选择器 -->
  <div class="form-group">
    <label for="model-select">Anki 模板 (Note Type):</label>
    <select id="model-select" class="...">
      <!-- 动态填充模板列表 -->
    </select>
  </div>

  <!-- 字段标签容器 -->
  <div id="anki-field-tags-container" class="py-2 flex flex-wrap gap-2">
    <!-- 字段标签按钮将动态插入此处 -->
  </div>

  <!-- Prompt编辑器 -->
  <div class="form-group">
    <label for="custom-prompt-textarea">自定义Prompt:</label>
    <textarea id="custom-prompt-textarea" rows="10" class="..."></textarea>
  </div>

  <!-- 实时预览 -->
  <div class="prompt-preview">
    <h3>预览效果:</h3>
    <pre id="prompt-preview-content"></pre>
  </div>
  ```

- **options.js**: 添加编辑器功能
  - **初始化**: 调用 `getModelNames()` 填充模板下拉框
  - **模板选择监听**: 为 `#model-select` 添加 `change` 事件监听器
  - `renderAnkiFieldTags(fieldNames)`: 根据字段名数组动态创建可点击标签
  - `insertPlaceholder(fieldName)`: 在光标位置插入`{{fieldName}}`
  - `previewPrompt()`: 实时预览最终prompt效果
  - `handleSave()`: 保存时将prompt与模板关联存储

#### 2.3 统一查询+解析Prompt - `utils/ai-service.js`
**工作内容：**
- 设计综合prompt模板结构：
  ```javascript
  const INTEGRATED_PROMPT_TEMPLATE = `
  # Role: 专业单词查询助手
  
  请完成以下任务：
  1. 查询单词: {{input}}
  2. 生成详细解析
  3. 按以下JSON格式输出：
  {{dynamicSchema}}
  
  用户自定义要求：
  {{customInstructions}}
  `;
  ```
- 实现prompt合成逻辑：
  - `buildIntegratedPrompt(userInput, fieldNames, customTemplate)`
  - 整合查询逻辑和解析逻辑到一个AI调用
- 修改`parseText()`函数：
  - 自动从配置中加载对应模板的prompt
  - 使用字段变量替换生成最终prompt

#### 2.4 数据流整合 - 跨模块协作
**工作内容：**
- **popup初始化时**：
  - 从配置加载当前选定的Anki模板
  - 获取该模板的字段列表和对应prompt模板
  - 动态渲染UI字段
- **解析处理时**：
  - 使用模板专用prompt进行AI调用
  - 解析结果直接映射到对应字段
- **写入Anki时**：
  - 收集动态字段值
  - 按照fieldMappings写入Anki

### 4.5 Prompt样例设计

#### 4.5.1 设计原则
- **字段变量系统**: 使用`{{fieldName}}`占位符，系统自动替换为字段描述
- **JSON格式强制**: 通过明确指令和验证机制确保AI输出有效JSON
- **模板专用配置**: 每个Anki模板都有独立的prompt配置
- **向后兼容**: 支持简单的两字段模式

#### 4.5.2 典型Prompt样例

##### 样例1: 基础日语单词模板（3字段）

**模拟Anki字段：**
- `Word` (单词)
- `Reading` (读音) 
- `Meaning` (释义)

**用户在options页面配置的prompt样例：**
```
# Role: 专业日语单词查询助手

请查询日语单词"{{input}}"并按以下JSON格式输出：

{
  "Word": "{{Word}}",
  "Reading": "{{Reading}}",
  "Meaning": "{{Meaning}}"
}

要求：
1. Word字段：输出原始日语单词
2. Reading字段：提供准确的假名读音（不含汉字）
3. Meaning字段：提供详细的中文释义和解释

输出必须是纯JSON格式，不要包含任何解释文字。
```

**系统处理后的最终prompt（用户输入"罫線"）：**
```
# Role: 专业日语单词查询助手

请查询日语单词"罫線"并按以下JSON格式输出：

{
  "Word": "日语单词",
  "Reading": "假名读音", 
  "Meaning": "中文释义和解释"
}

要求：
1. Word字段：输出原始日语单词
2. Reading字段：提供准确的假名读音（不含汉字）
3. Meaning字段：提供详细的中文释义和解释

输出必须是纯JSON格式，不要包含任何解释文字。
```

**AI预期输出：**
```json
{
  "Word": "罫線", 
  "Reading": "けいせん",
  "Meaning": "罫线；格线；指印刷品或书写纸上的横线或竖线，通常用于表格、笔记本、乐谱等，以方便书写或划分区域。"
}
```

##### 样例2: 高级语言学习模板（5字段）

**模拟Anki字段：**
- `Vocabulary` (词汇)
- `Pronunciation` (发音)
- `Definition` (定义)
- `Example` (例句)
- `Etymology` (词源)

**用户配置的prompt样例：**
```
# Role: 语言学习专家

请查询单词"{{input}}"，提供全面的语言学习信息：

输出JSON格式：
{
  "Vocabulary": "{{Vocabulary}}",
  "Pronunciation": "{{Pronunciation}}",
  "Definition": "{{Definition}}",
  "Example": "{{Example}}",
  "Etymology": "{{Etymology}}"
}

具体要求：
- Vocabulary: 标准单词形式
- Pronunciation: IPA音标或假名读音
- Definition: 详细定义和用法说明
- Example: 2-3个实际使用例句，包含中文翻译
- Etymology: 词源信息（如果有的话，没有则填"暂无"）

必须输出有效JSON格式。
```

##### 样例3: 简化双字段模板（向后兼容）

**模拟Anki字段：**
- `Front` (正面)
- `Back` (背面)

**用户配置的prompt样例：**
```
# Role: 单词助手

查询"{{input}}"并输出：

{
  "Front": "{{Front}}",
  "Back": "{{Back}}"
}

Front字段放单词本身，Back字段放完整的释义、读音、例句等所有信息。
输出纯JSON格式。
```

#### 4.5.3 JSON格式保证机制

**技术实现要点：**

```javascript
// 在utils/prompt-engine.js中实现
function generateFieldSchema(fieldNames) {
  const schema = {};
  fieldNames.forEach(field => {
    schema[field] = `${field}对应的内容`;
  });
  return JSON.stringify(schema, null, 2);
}

// JSON强制输出指令（修正版）
function buildIntegratedPrompt(userInput, templateFields, customTemplate) {
  const availableFields = templateFields.map(field => `"${field}"`).join(', ');
  
  return `${customTemplate.replace('{{input}}', userInput)}

CRITICAL JSON要求：
- 输出有效的JSON对象
- 只能使用以下字段名（区分大小写）: ${availableFields}
- 可以只输出部分字段，不需要全部输出
- 不能使用模板中不存在的字段名
- 确保JSON语法正确

示例格式：{"字段名1": "内容1", "字段名2": "内容2"}`;
}

// 输出验证和错误处理
function validateJsonOutput(output, expectedFields) {
  try {
    const parsed = JSON.parse(output);
    const missingFields = expectedFields.filter(field => !parsed.hasOwnProperty(field));
    if (missingFields.length > 0) {
      throw new Error(`缺少字段: ${missingFields.join(', ')}`);
    }
    return { success: true, data: parsed };
  } catch (error) {
    return { success: false, error: error.message };
  }
}
```

#### 4.5.4 实际使用流程示例

**Step 1: Options页面配置**
1. 用户选择"日语学习"模板
2. 系统调用`getModelFieldNames("日语学习")`获取字段：`["Word", "Reading", "Meaning"]`
3. 系统显示可点击的字段标签按钮
4. 用户点击标签，在光标位置插入`{{Word}}`等变量
5. 用户完善prompt内容并保存

**Step 2: Popup页面使用（修正版）**
1. 用户输入"罫線"
2. 系统从配置加载"日语学习"模板的专用prompt
3. `prompt-engine.js`处理变量替换并添加字段约束：
   - `{{input}}` → "罫線"  
   - 添加可用字段列表：`["Word", "Reading", "Meaning"]`
   - 强调可以部分输出，但字段名必须准确
4. 调用AI服务获得结果，例如：`{"Word": "罫線", "Reading": "けいせん"}`
5. `field-validator.js`验证字段名合法性
6. 动态填充到对应字段（Meaning字段保持空白）
7. 显示状态：已填充 2/3 个字段
8. 用户确认后写入Anki

**Step 3: 错误处理流程（修正版）**
- 字段名不匹配 → 自动重试一次，失败则提示可用字段名
- JSON解析失败 → 显示错误提示，允许手动重试  
- 所有字段都为空 → 提示至少需要填充一个字段
- AI服务失败 → 提示检查网络或AI配置

### Phase 3: 用户体验优化（优先级：低）

#### 3.1 响应式布局优化 - CSS & HTML
**工作内容：**
- **popup.html**: 优化容器结构适配多字段
  ```html
  <div class="dynamic-fields-grid" data-field-count="{{fieldCount}}">
    <!-- 根据字段数量自动调整网格布局 -->
  </div>
  ```
- **CSS**: 添加响应式样式
  - 2-4字段：双列布局
  - 5+字段：滚动区域 + 固定高度
  - 长文本字段：自适应高度textarea
- **popup.js**: 添加布局智能调整
  - `adjustLayoutForFieldCount(count)`: 根据字段数量调整UI布局
  - `optimizeFieldDisplay()`: 字段显示优化（折叠/展开长内容）

#### 3.2 字段类型智能识别 - `utils/field-analyzer.js`
**工作内容：**
- 创建字段分析模块：
  ```javascript
  const FIELD_TYPE_RULES = {
    'example': { type: 'textarea', rows: 3 },
    'meaning': { type: 'textarea', rows: 2 },  
    'pronunciation': { type: 'text' },
    'word': { type: 'text' }
  };
  ```
- 实现智能识别函数：
  - `analyzeFieldType(fieldName, content)`: 基于字段名和内容判断类型
  - `suggestFieldLayout(fields)`: 建议最佳字段布局方案
- 添加用户自定义字段类型配置界面

#### 3.3 配置导入导出功能 - `options/options.js`
**工作内容：**
- 实现配置管理功能：
  - `exportConfiguration()`: 导出完整配置为JSON文件
  - `importConfiguration(fileContent)`: 从JSON文件导入配置
  - `validateConfigurationFormat(config)`: 验证配置格式正确性
- **options.html**: 添加导入导出UI
  ```html
  <div class="config-management">
    <button id="export-config">导出配置</button>
    <input type="file" id="import-config" accept=".json">
    <button id="reset-config">重置为默认</button>
  </div>
  ```

#### 3.4 性能优化 & 错误处理
**工作内容：**
- **性能优化**：
  - `popup/popup.js`: 添加字段内容缓存，避免重复渲染
  - `utils/ai-service.js`: 实现请求防抖，避免频繁API调用
  - 添加loading状态优化，分阶段显示解析进度
- **错误处理增强**：
  - 添加字段验证规则（必填、格式校验）
  - AI解析失败时的降级处理
  - 网络错误时的重试机制
- **用户引导**：
  - 首次使用向导
  - 字段配置帮助提示
  - 常见问题快速解决方案

---

## 5. 开发优先级与时间规划

### 5.1 开发优先级建议
**立即开始：** Phase 1.1-1.2 (配置结构 + 动态UI)  
**紧随其后：** Phase 1.3-1.4 (AI适配 + 写入逻辑)  
**功能完善：** Phase 2.1-2.2 (字段变量 + 编辑器)  
**体验提升：** Phase 2.3-2.4 + Phase 3 全部

### 5.2 关键文件修改清单
- `popup/popup.html`: 动态字段UI生成
- `popup/popup.js:39-69`: 解析逻辑适配多字段
- `popup/popup.js:88-109`: 写入逻辑支持动态字段映射
- `options/options.html`: 增强prompt配置UI，添加模板选择器和字段标签
- `options/options.js`: 字段变量插入功能，模板选择监听
- `utils/storage.js`: 扩展配置结构支持字段映射和模板关联prompt
- `utils/prompt-engine.js`: 新增模块处理prompt模板和字段变量
- `utils/field-analyzer.js`: 新增模块处理字段分析

### 5.3 核心数据流设计
```
Options页面配置流程：
1. 用户选择Anki模板 → getModelNames()
2. 系统获取字段列表 → getModelFieldNames(modelName)  
3. 渲染字段标签按钮 → renderAnkiFieldTags()
4. 用户编辑prompt并插入变量 → insertPlaceholder()
5. 保存模板专用配置 → savePromptForModel()

Popup页面使用流程：
1. 初始化时加载配置 → 获取defaultModel和对应prompt
2. 动态渲染字段UI → renderDynamicFields()
3. 用户输入单词 → 使用模板prompt调用AI
4. 解析结果映射字段 → 动态填充表单
5. 写入Anki → 收集动态字段值
```

### 5.4 测试验证要点
1. **字段动态性测试**：不同Anki模板的字段数量和类型适配
2. **AI解析准确性测试**：多字段输出的准确性和完整性
3. **配置持久性测试**：字段映射和prompt配置的保存加载
4. **模板关联测试**：prompt与Anki模板的正确关联
5. **用户体验测试**：界面响应性和操作流畅度
6. **错误处理测试**：各种异常情况的处理能力

---

## 6. 风险评估与缓解措施

### 6.1 技术风险
- **AI解析复杂度增加**: 缓解措施 - 提供降级到简单两字段模式
- **UI渲染性能**: 缓解措施 - 虚拟滚动和懒加载
- **配置兼容性**: 缓解措施 - 版本迁移机制
- **多模板管理复杂性**: 缓解措施 - 提供默认配置和配置复制功能

### 6.2 用户体验风险
- **学习成本增加**: 缓解措施 - 渐进式功能引导
- **配置复杂化**: 缓解措施 - 智能默认配置和模板
- **模板切换混乱**: 缓解措施 - 明确的当前模板指示和快速切换功能

---

## 7. 结论

本方案通过三个渐进式的开发阶段，将现有的静态两字段系统升级为支持任意字段数量的动态系统，同时整合查询和解析流程。关键改进包括：

1. **配置层面**: 在options页面实现模板专用prompt配置
2. **交互层面**: popup页面根据预设模板动态显示字段
3. **处理层面**: AI解析直接输出到对应字段，无需二次转换

**预期收益：**
- 用户操作步骤从3步减少到1步
- 支持复杂Anki模板（3-10个字段）
- 提供可视化的prompt配置体验
- 模板专用prompt配置，提高解析准确性
- 保持向后兼容性

**下一步行动：**
建议立即开始Phase 1的开发工作，优先实现配置结构扩展和动态UI渲染功能。同时可以并行开始Phase 2.1的prompt-engine模块开发。