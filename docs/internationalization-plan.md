# Anki Word Assistant 国际化改造技术方案 (修订版)

## 1. 概述

本文档为 "Anki Word Assistant" Chrome 扩展项目提供一套完整、可执行的国际化（i18n）技术方案。

### 1.1. 目标

- 支持四种语言:简体中文 (zh_CN), 繁体中文 (zh_TW), 日语 (ja), 和英语 (en)。
- 根据用户浏览器语言自动选择显示语言。
- 当浏览器语言不属于上述四种时,默认显示英语。
- 改造现有代码,使其支持未来新增其他语言的扩展。

### 1.2. 技术选型

我们将采用 Chrome 扩展官方推荐的 `chrome.i18n` API。此方案具备以下优点:
- **原生支持**: 无需引入任何第三方库,性能好,兼容性强。
- **自动切换**: Chrome 会根据 `chrome.i18n.getUILanguage()` 自动加载对应的 `messages.json` 文件。
- **默认回退**: 当找不到匹配的语言时,会自动回退到在 `manifest.json` 中定义的 `default_locale`,完全符合我们的需求。
- **结构成熟**: 项目中已存在 `_locales/zh_CN` 目录,我们只需在此基础上扩展即可。

## 2. 核心技术方案

### 2.1. `_locales` 目录结构

我们将扩展现有的 `_locales` 目录,最终形成如下结构:

```
_locales/
├── en/
│   └── messages.json  (默认语言)
├── ja/
│   └── messages.json
├── zh_CN/
│   └── messages.json  (已存在,需补充)
└── zh_TW/
    └── messages.json
```

### 2.2. `messages.json` 文件格式

所有 `messages.json` 文件都将包含相同的键(key),但值(message)为对应语言的翻译。格式如下:

```json
{
  "keyName": {
    "message": "对应的翻译文本",
    "description": "关于这个键的描述,方便翻译人员理解上下文。"
  }
}
```

### 2.3. 改造方案

1.  **HTML 文件 (`.html`)**:
    - 对于需要翻译的HTML元素,我们不直接写入文本,而是添加一个 `data-i18n` 属性。
    - **示例**: `<h1 data-i18n="appName"></h1>`
    - 后续将通过一个通用的JS脚本来填充这些元素的文本。

2.  **JavaScript 文件 (`.js`)**:
    - 对于在JS中动态生成或使用的字符串(如 `alert`, `console.log`, 状态提示等),我们将使用 `chrome.i18n.getMessage('keyName')` 方法来获取翻译后的文本。
    - **示例**: `const errorMsg = chrome.i18n.getMessage('errorMessage');`

3.  **`manifest.json` 文件**:
    - 对于 `name`, `description` 等字段,我们将使用 `__MSG_keyName__` 的语法。
    - **示例**: `"name": "__MSG_appName__"`

## 3. 具体实施步骤

### 步骤 1: 创建并完善 `messages.json` 文件

1.  **创建目录**: 在 `_locales` 文件夹下创建 `en`, `ja`, `zh_TW` 三个新目录。
2.  **创建文件**: 在每个新目录中创建 `messages.json` 文件。
3.  **定义键值对**:
    - 以现有的 `_locales/zh_CN/messages.json` 为基础,梳理出所有需要翻译的文本,并为它们定义统一的、有意义的键。
    - 将所有键复制到 `en`, `ja`, `zh_TW` 的 `messages.json` 文件中。
4.  **翻译**: 填充所有 `messages.json` 文件中各个键对应的 `message` 值。

### 步骤 2: 改造 `manifest.json`

1.  **设置默认语言**: 在 `manifest.json` 的顶层修改 `"default_locale": "en"`(当前是"zh_CN",需要改为"en")。
2.  **替换文本**: 将 `name` 和 `description` 字段替换为 `__MSG_key__` 格式。

    **修改前**:
    ```json
    {
      "name": "Anki Word Assistant",
      "description": "An AI-powered assistant to help create Anki cards from dictionary lookup results.",
      "default_locale": "zh_CN",
      ...
    }
    ```

    **修改后**:
    ```json
    {
      "name": "__MSG_appName__",
      "description": "__MSG_appDesc__",
      "default_locale": "en",
      ...
    }
    ```

### 步骤 3: 改造 HTML 文件 (`popup.html`, `options.html`)

1.  **梳理硬编码文本**: 找出 `popup.html` 和 `options.html` 中所有写死的面向用户的文本,包括标题、标签、按钮文字、占位符等。
2.  **替换为 `data-i18n`**:
    - **示例 (`popup.html`)**:
      - `<h1 class="text-lg font-semibold" data-i18n="appName">Anki 单词助手</h1>` -> `<h1 class="text-lg font-semibold" data-i18n="appName"></h1>`
      - `<button id="parse-btn" data-i18n="parseBtn">解析</button>` -> `<button id="parse-btn" data-i18n="parseBtn"></button>`
    - **对于 `placeholder` 或 `title` 属性**: 我们也通过JS进行设置,HTML中仅保留 `data-i18n-placeholder` 或 `data-i18n-title` 属性。
      - `<textarea id="text-input" placeholder="粘贴或输入文本...">` -> `<textarea id="text-input" data-i18n-placeholder="textInputPlaceholder">`

### 步骤 4: 完善 `utils/i18n.js`

我们将在这个文件中创建一个通用函数,用于自动本地化所有HTML页面。

**更新 `utils/i18n.js` 为以下内容:**

```javascript
/**
 * 自动本地化页面上所有带有 data-i18n* 属性的元素。
 * 支持 textContent, value, placeholder, 和 title 属性。
 */
export function localizePage() {
  // 替换元素的 textContent
  document.querySelectorAll('[data-i18n]').forEach(elem => {
    const key = elem.getAttribute('data-i18n');
    const message = chrome.i18n.getMessage(key);
    if (message) {
      elem.textContent = message;
    }
  });

  // 替换 placeholder
  document.querySelectorAll('[data-i18n-placeholder]').forEach(elem => {
    const key = elem.getAttribute('data-i18n-placeholder');
    const message = chrome.i18n.getMessage(key);
    if (message) {
      elem.placeholder = message;
    }
  });

  // 替换 title (tooltip)
  document.querySelectorAll('[data-i18n-title]').forEach(elem => {
    const key = elem.getAttribute('data-i18n-title');
    const message = chrome.i18n.getMessage(key);
    if (message) {
      elem.title = message;
    }
  });

  // 替换 value (用于特定input)
  document.querySelectorAll('[data-i18n-value]').forEach(elem => {
    const key = elem.getAttribute('data-i18n-value');
    const message = chrome.i18n.getMessage(key);
    if (message) {
      elem.value = message;
    }
  });

  // 替换 aria-label (用于可访问性)
  document.querySelectorAll('[data-i18n-aria]').forEach(elem => {
    const key = elem.getAttribute('data-i18n-aria');
    const message = chrome.i18n.getMessage(key);
    if (message) {
      elem.setAttribute('aria-label', message);
    }
  });
}

/**
 * 获取翻译字符串
 * @param {string} key - 语言包中的 key
 * @param {string|string[]} [substitutions] - 替换占位符
 * @returns {string}
 */
export function getMessage(key, substitutions) {
  return chrome.i18n.getMessage(key, substitutions);
}

// 在 DOMContentLoaded 时自动执行本地化
if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', localizePage);
}
```

**在 `popup.html` 和 `options.html` 的 `<head>` 中引入此脚本**:
确保在其他操作脚本之前引入(以module方式引入):
```html
<script type="module" src="../utils/i18n.js"></script>
```

### 步骤 5: 改造 JavaScript 文件

检查 `popup.js`, `options.js`, `ai-service.js`, `field-handler.js`, `ankiconnect.js`, `storage.js`, `prompt-engine.js` 等文件,查找所有硬编码的字符串。

#### 5.1 popup.js 需要国际化的内容

**状态消息:**
- ✅ 已标识: "准备就绪", "请输入要解析的文本", "正在进行AI解析...", "解析完成"
- ✅ 已标识: "正在写入 Anki...", "写入成功"
- ✅ 已标识: 各种错误提示和警告消息

**字段相关:**
- ✅ 已标识: "输入文本", "正面:", "背面:", "AI将自动填充此字段..."
- ✅ 已标识: "已填充", "待填充", 动态字段填充状态消息

**ErrorBoundary 类的用户消息:**
- ✅ 已标识: 所有 getUserFriendlyMessage 方法中的错误消息
- ✅ 已标识: 重试提示消息

#### 5.2 options.js 需要国际化的内容

**标签页标题和导航:**
- ✅ 已标识: "设置中心", "AI 配置", "Anki 连接", "Prompt 配置", "样式设置", "系统设置"

**AI 配置相关:**
- ✅ 已标识: "选择 AI 提供商", "API Key", "模型名称", "API 地址"
- ✅ 已标识: "测试连接", "显示", "隐藏", "连接成功", "连接失败"
- ✅ 已标识: 各提供商的相关提示文本

**Anki 配置相关:**
- ✅ 已标识: "测试连接并刷新模型", "牌组", "模型", "字段信息"
- ✅ 已标识: "兼容模式", "动态字段模式", 字段数量显示

**Prompt 配置相关:**
- ✅ 已标识: "按模板配置 Prompt", "当前模板", "字段选择", "字段配置"
- ✅ 已标识: "自定义 Prompt 模板", "重置为默认模板", "已修改,保存后生效"
- ✅ 已标识: 各种 Prompt 编辑器的提示信息

**样式配置:**
- ✅ 已标识: "字体大小", "文本对齐", "行高", "样式预览"
- ✅ 已标识: 各选项的标签文字(如 "小", "中", "大", "左对齐", "居中", "右对齐")

**系统设置:**
- ✅ 已标识: "语言", "配置管理", "导出配置", "导入配置", "重置配置"
- ✅ 已标识: 各种配置操作的成功/失败消息

**按钮和操作:**
- ✅ 已标识: "保存设置", "保存成功", "保存失败"

#### 5.3 ai-service.js 需要国际化的内容

**错误消息:**
- ✅ 已标识: API 错误提示
- ✅ 已标识: 响应解析错误
- ✅ 已标识: 配置缺失错误

#### 5.4 prompt-engine.js 需要国际化的内容

**默认 Prompt 模板:**
- ⚠️ **特别注意**: `getDefaultIntegratedTemplate()` 函数返回的默认模板需要国际化
- ⚠️ **特别注意**: `generateFieldSchema()` 中的智能提示文本需要国际化
- ⚠️ **特别注意**: `buildIntegratedPrompt()` 中追加的要求文本需要国际化

**建议**:
- 为默认 Prompt 模板创建专门的 i18n key,如 `defaultPromptTemplate`
- 为字段智能提示创建对应的 key,如 `fieldHint_word`, `fieldHint_pronunciation`, `fieldHint_meaning`

#### 5.5 field-handler.js 和其他工具文件

**验证消息和错误提示:**
- ✅ 已标识: 字段验证相关的错误消息
- ✅ 已标识: 数据处理的状态消息

#### 5.6 动态生成的内容

**特别注意**以下动态生成的内容也需要国际化:
- options.js 中动态创建的 provider section
- options.js 中字段配置表单的提示文本
- popup.js 中动态渲染的字段标签
- 所有 confirm 和 alert 对话框的文本

### 步骤 6: 处理特殊场景

#### 6.1 AI Prompt 模板的多语言支持

**问题**: Prompt 模板会直接影响 AI 的输出质量,不同语言的 Prompt 可能需要不同的措辞。

**解决方案**:
1. 默认 Prompt 模板使用 i18n,根据用户界面语言自动切换
2. 用户自定义的 Prompt 保持原样,不做自动翻译
3. 在 `prompt-engine.js` 中:
   ```javascript
   function getDefaultIntegratedTemplate() {
     return chrome.i18n.getMessage('defaultPromptTemplate');
   }
   ```

#### 6.2 动态生成的字段提示

在 `generateFieldSchema()` 函数中,根据字段名生成的智能提示也应该国际化:

```javascript
function generateFieldSchema(fieldNames) {
  const schema = {};
  fieldNames.forEach((field) => {
    const fieldLower = field.toLowerCase();
    let hintKey = 'fieldHint_generic'; // 默认提示

    if (fieldLower.includes("word") || fieldLower.includes("front")) {
      hintKey = 'fieldHint_word';
    } else if (fieldLower.includes("reading") || fieldLower.includes("pronunciation")) {
      hintKey = 'fieldHint_pronunciation';
    } else if (fieldLower.includes("meaning") || fieldLower.includes("definition")) {
      hintKey = 'fieldHint_meaning';
    }

    schema[field] = chrome.i18n.getMessage(hintKey, field);
  });
  return JSON.stringify(schema, null, 2);
}
```

#### 6.3 日期和数字格式化

虽然当前代码中使用了 `toLocaleString('zh-CN')`,但应该根据用户的界面语言动态调整:

```javascript
// 获取当前界面语言
const uiLanguage = chrome.i18n.getUILanguage();
const localeMap = {
  'zh-CN': 'zh-CN',
  'zh-TW': 'zh-TW',
  'ja': 'ja-JP',
  'en': 'en-US'
};
const locale = localeMap[uiLanguage] || 'en-US';

// 使用动态 locale
date.toLocaleString(locale);
```

#### 6.4 Chrome 语言代码映射

Chrome 的 `getUILanguage()` 可能返回:
- `zh-CN` (简体中文)
- `zh-TW` (繁体中文)
- `ja` (日语)
- `en` (英语)

我们的 `_locales` 目录命名需要与这些代码完全匹配。

**注意**:
- Chrome 使用 `zh_CN` 作为文件夹名(下划线)
- 但 `getUILanguage()` 返回 `zh-CN` (连字符)
- `chrome.i18n` API 会自动处理这种差异

### 步骤 7: 语言切换功能(可选)

虽然系统设置页面有语言选择下拉框,但当前它只是占位符。如果要实现手动切换语言,需要:

1. **移除系统设置中的语言选择器**(因为 Chrome 扩展无法手动切换语言,必须跟随浏览器语言)
2. **或者添加说明**: 告知用户需要在浏览器设置中更改语言

**建议**: 移除语言选择下拉框,添加说明文本:
```html
<div class="mb-4">
  <label class="block text-sm font-medium text-gray-700 mb-2" data-i18n="languageLabel">语言</label>
  <p class="text-sm text-gray-600" data-i18n="languageDescription">
    扩展程序语言跟随浏览器设置。如需更改,请在浏览器设置中调整显示语言。
  </p>
  <p class="text-sm text-gray-500 mt-1">
    <span data-i18n="currentLanguage">当前语言</span>:
    <strong id="current-language-display"></strong>
  </p>
</div>

<script>
// 显示当前语言
document.addEventListener('DOMContentLoaded', () => {
  const langDisplay = document.getElementById('current-language-display');
  const uiLang = chrome.i18n.getUILanguage();
  const langNames = {
    'zh-CN': '简体中文',
    'zh-TW': '繁体中文',
    'ja': '日本語',
    'en': 'English'
  };
  langDisplay.textContent = langNames[uiLang] || uiLang;
});
</script>
```

## 4. 完整的 messages.json 键列表

基于对代码的全面分析,以下是需要在所有语言的 `messages.json` 中定义的键(按功能分类):

### 4.1 通用/应用级别

```json
{
  "appName": {
    "message": "Anki Word Assistant",
    "description": "应用程序名称"
  },
  "appDesc": {
    "message": "An AI-powered assistant to help create Anki cards from dictionary lookup results.",
    "description": "应用程序描述"
  }
}
```

### 4.2 popup.html 相关

```json
{
  "textInputLabel": {
    "message": "输入文本",
    "description": "文本输入区域的标签"
  },
  "textInputPlaceholder": {
    "message": "粘贴或输入文本...",
    "description": "文本输入框的占位符"
  },
  "parseBtn": {
    "message": "解析",
    "description": "解析按钮"
  },
  "writeBtn": {
    "message": "写入 Anki",
    "description": "写入按钮"
  },
  "cardFront": {
    "message": "正面",
    "description": "卡片正面标签"
  },
  "cardBack": {
    "message": "背面",
    "description": "卡片背面标签"
  },
  "dynamicFieldPlaceholder": {
    "message": "AI将自动填充此字段...",
    "description": "动态字段的占位符"
  }
}
```

### 4.3 popup.js 状态消息

```json
{
  "statusReady": {
    "message": "准备就绪",
    "description": "初始化完成状态"
  },
  "statusPleaseInput": {
    "message": "请输入要解析的文本",
    "description": "提示用户输入"
  },
  "statusParsing": {
    "message": "正在进行AI解析...",
    "description": "解析进行中"
  },
  "statusParseComplete": {
    "message": "解析完成",
    "description": "解析成功完成"
  },
  "statusWriting": {
    "message": "正在写入 Anki...",
    "description": "写入进行中"
  },
  "statusWriteSuccess": {
    "message": "写入成功",
    "description": "写入成功"
  },
  "statusFieldFilled": {
    "message": "已填充 {0}/{1} 个字段",
    "description": "字段填充状态,{0}=已填充数量,{1}=总数量"
  },
  "statusFieldEmpty": {
    "message": "{0} 个字段为空",
    "description": "空字段提示"
  },
  "labelFilled": {
    "message": "已填充",
    "description": "字段已填充标记"
  },
  "labelPending": {
    "message": "待填充",
    "description": "字段待填充标记"
  }
}
```

### 4.4 ErrorBoundary 错误消息

```json
{
  "errorNetwork": {
    "message": "网络连接失败,请检查网络后重试",
    "description": "网络错误"
  },
  "errorApiKey": {
    "message": "AI服务配置错误,请检查设置页面的API Key",
    "description": "API Key错误"
  },
  "errorQuota": {
    "message": "AI服务额度不足,请检查账户状态或更换服务商",
    "description": "配额不足"
  },
  "errorJsonParse": {
    "message": "AI解析格式错误,正在自动重试...",
    "description": "JSON解析错误"
  },
  "errorInvalidFields": {
    "message": "AI输出字段不匹配,请检查模板配置",
    "description": "字段不匹配"
  },
  "errorParseFailed": {
    "message": "AI解析失败: {0}",
    "description": "通用解析错误,{0}=错误详情"
  },
  "errorAnkiNotRunning": {
    "message": "请启动Anki并确保AnkiConnect插件已安装",
    "description": "Anki未启动"
  },
  "errorDuplicateCard": {
    "message": "卡片内容重复,请修改后重试",
    "description": "重复卡片"
  },
  "errorDeckNotFound": {
    "message": "指定的牌组不存在,请检查配置",
    "description": "牌组不存在"
  },
  "errorModelNotFound": {
    "message": "指定的模板不存在,请检查配置",
    "description": "模板不存在"
  },
  "errorAnkiFailed": {
    "message": "Anki操作失败: {0}",
    "description": "通用Anki错误"
  },
  "errorConfigLoad": {
    "message": "配置加载异常,已使用默认配置",
    "description": "配置加载错误"
  },
  "errorElementMissing": {
    "message": "页面元素缺失,请刷新页面重试",
    "description": "DOM元素缺失"
  },
  "errorFieldEmpty": {
    "message": "请至少填写一个字段内容",
    "description": "字段全空"
  },
  "errorFieldProcessing": {
    "message": "字段处理错误: {0}",
    "description": "字段处理错误"
  },
  "errorFrequent": {
    "message": "检测到频繁错误,建议刷新页面或检查网络连接",
    "description": "频繁错误警告"
  },
  "errorRetryConfirm": {
    "message": "{0}\n\n是否立即重试?",
    "description": "重试确认对话框"
  },
  "errorRetryParse": {
    "message": "解析失败可能是临时网络问题",
    "description": "解析重试提示"
  },
  "errorRetryAnki": {
    "message": "Anki操作失败可能是连接问题",
    "description": "Anki重试提示"
  },
  "errorRefreshConfirm": {
    "message": "{0}\n\n点击确定刷新页面,取消继续使用",
    "description": "刷新页面确认"
  },
  "errorNoFields": {
    "message": "当前模板未配置可解析的字段,请在选项页完成设置。",
    "description": "无字段配置错误"
  },
  "errorNoFieldsToWrite": {
    "message": "当前模板未配置可写入的字段,请在选项页完成设置。",
    "description": "无字段写入错误"
  },
  "errorFieldCollection": {
    "message": "字段收集失败: {0}",
    "description": "字段收集错误"
  },
  "errorNoContent": {
    "message": "没有可写入的字段内容",
    "description": "无内容错误"
  },
  "errorCurrentNoFields": {
    "message": "当前未配置字段,请先在选项页完成配置。",
    "description": "当前无字段配置"
  },
  "warningFieldValidation": {
    "message": "{0},继续写入...",
    "description": "字段验证警告"
  }
}
```

### 4.5 options.html 页面元素

```json
{
  "optionsTitle": {
    "message": "设置中心",
    "description": "选项页标题"
  },
  "tabAiConfig": {
    "message": "AI 配置",
    "description": "AI配置标签"
  },
  "tabAnkiConfig": {
    "message": "Anki 连接",
    "description": "Anki连接标签"
  },
  "tabPromptConfig": {
    "message": "Prompt 配置",
    "description": "Prompt配置标签"
  },
  "tabStyleConfig": {
    "message": "样式设置",
    "description": "样式设置标签"
  },
  "tabSystemConfig": {
    "message": "系统设置",
    "description": "系统设置标签"
  },
  "labelSelectProvider": {
    "message": "选择 AI 提供商",
    "description": "选择AI提供商标签"
  },
  "labelApiKey": {
    "message": "API Key",
    "description": "API Key标签"
  },
  "labelModelName": {
    "message": "模型名称",
    "description": "模型名称标签"
  },
  "labelApiUrl": {
    "message": "API 地址",
    "description": "API地址标签"
  },
  "btnTestConnection": {
    "message": "测试 {0} 连接",
    "description": "测试连接按钮,{0}=提供商名称"
  },
  "btnShow": {
    "message": "显示",
    "description": "显示密码按钮"
  },
  "btnHide": {
    "message": "隐藏",
    "description": "隐藏密码按钮"
  },
  "placeholderApiKey": {
    "message": "********",
    "description": "API Key占位符"
  },
  "placeholderModelName": {
    "message": "例如: {0}",
    "description": "模型名称占位符,{0}=示例名称"
  },
  "placeholderApiUrl": {
    "message": "https://",
    "description": "API地址占位符"
  },
  "hintGetApiKey": {
    "message": "获取 API Key:",
    "description": "获取API Key提示"
  },
  "hintDocs": {
    "message": "文档:",
    "description": "文档链接提示"
  },
  "linkApiDocs": {
    "message": "API 文档",
    "description": "API文档链接文本"
  },
  "hintSupportedModels": {
    "message": "常用模型: {0}",
    "description": "支持的模型提示,{0}=模型列表"
  },
  "hintDefaultUrl": {
    "message": "默认: {0}",
    "description": "默认URL提示"
  },
  "labelNotTestedYet": {
    "message": "尚未测试连接",
    "description": "未测试状态"
  },
  "labelHealthStatus": {
    "message": "状态: {0}",
    "description": "健康状态,{0}=状态文本"
  },
  "labelLastCheck": {
    "message": "上次检查: {0}",
    "description": "上次检查时间"
  },
  "labelErrorReason": {
    "message": "原因: {0}",
    "description": "错误原因"
  },
  "statusHealthy": {
    "message": "健康",
    "description": "健康状态"
  },
  "statusError": {
    "message": "异常",
    "description": "异常状态"
  },
  "statusUnknown": {
    "message": "未知",
    "description": "未知状态"
  },
  "labelNotRecorded": {
    "message": "未记录",
    "description": "未记录状态"
  },
  "btnTestAnki": {
    "message": "测试连接并刷新模型",
    "description": "测试Anki连接按钮"
  },
  "labelDeck": {
    "message": "牌组",
    "description": "牌组标签"
  },
  "labelModel": {
    "message": "模型",
    "description": "模型标签"
  },
  "labelFieldInfo": {
    "message": "字段信息",
    "description": "字段信息标签"
  },
  "optionSelectDeck": {
    "message": "请选择默认牌组",
    "description": "选择牌组选项"
  },
  "optionSelectModel": {
    "message": "请选择默认模型",
    "description": "选择模型选项"
  },
  "optionTestAnkiFirst": {
    "message": "请先测试 Anki 连接",
    "description": "需要先测试连接提示"
  },
  "labelModelFields": {
    "message": "模型字段 ({0}个)",
    "description": "模型字段数量,{0}=数量"
  },
  "titleLegacyMode": {
    "message": "🔄 兼容模式",
    "description": "兼容模式标题"
  },
  "descLegacyMode": {
    "message": "该模型字段数 ≤ 2,将使用传统的正面/背面模式。",
    "description": "兼容模式说明"
  },
  "titleDynamicMode": {
    "message": "✨ 动态字段模式",
    "description": "动态模式标题"
  },
  "descDynamicMode": {
    "message": "该模型支持多字段,AI将自动填充所有字段。popup页面将根据字段名智能生成相应的输入区域。",
    "description": "动态模式说明"
  },
  "titlePromptConfig": {
    "message": "按模板配置 Prompt",
    "description": "Prompt配置标题"
  },
  "hintPromptModelNotSelected": {
    "message": "请在「Anki 连接」面板选择要编辑的模型,随后在这里自定义 Prompt。",
    "description": "未选择模型提示"
  },
  "hintPromptModelSelected": {
    "message": "提示: 保存设置后将在 popup 中使用此 Prompt。",
    "description": "已选择模型提示"
  },
  "labelCurrentModel": {
    "message": "当前模板: {0}",
    "description": "当前模板标签,{0}=模板名称"
  },
  "labelModelNotSelected": {
    "message": "当前模板: 未选择",
    "description": "未选择模板"
  },
  "labelFieldSelection": {
    "message": "字段选择",
    "description": "字段选择标签"
  },
  "hintClickToToggle": {
    "message": "点击字段切换选中状态",
    "description": "点击切换提示"
  },
  "labelFieldConfig": {
    "message": "字段配置",
    "description": "字段配置标签"
  },
  "hintFieldConfig": {
    "message": "配置生成 AI 输出该字段所需的信息",
    "description": "字段配置提示"
  },
  "labelFieldContent": {
    "message": "字段内容",
    "description": "字段内容标签"
  },
  "labelRequired": {
    "message": "*",
    "description": "必填标记"
  },
  "placeholderFieldContent": {
    "message": "描述该字段应包含的内容,例如输出结构、语气等要求",
    "description": "字段内容占位符"
  },
  "errorFieldContentRequired": {
    "message": "字段内容为必填项",
    "description": "字段内容必填错误"
  },
  "labelCustomPrompt": {
    "message": "自定义 Prompt 模板",
    "description": "自定义Prompt标签"
  },
  "placeholderCustomPrompt": {
    "message": "请选择模型后编写对应的 Prompt。\n建议包含以下占位符:\n- {{INPUT_TEXT}} 表示用户输入\n- {{FIELD_SCHEMA}} 表示字段结构",
    "description": "自定义Prompt占位符"
  },
  "btnResetPrompt": {
    "message": "重置为默认模板",
    "description": "重置Prompt按钮"
  },
  "labelPromptDirty": {
    "message": "已修改,保存后生效",
    "description": "Prompt已修改提示"
  },
  "statusNoFields": {
    "message": "当前模板未返回任何字段。",
    "description": "无字段状态"
  },
  "statusSelectFields": {
    "message": "请选择需要输出的字段,并补全字段内容。",
    "description": "请选择字段提示"
  },
  "statusSelectAtLeastOne": {
    "message": "请选择至少一个要输出的字段。",
    "description": "至少选择一个字段"
  },
  "statusFieldConfigMissing": {
    "message": "字段\"{0}\"的内容不能为空。",
    "description": "字段配置缺失,{0}=字段名"
  },
  "statusFieldsConfigMissing": {
    "message": "以下字段内容不能为空: {0}",
    "description": "多个字段配置缺失,{0}=字段列表"
  },
  "statusFieldConfigReady": {
    "message": "字段配置已就绪。",
    "description": "字段配置完成"
  },
  "statusPromptReset": {
    "message": "已根据当前字段配置生成默认 Prompt。",
    "description": "Prompt重置提示"
  },
  "statusPromptResetNeedFields": {
    "message": "请先选择并配置字段,然后再生成默认 Prompt。",
    "description": "重置Prompt需要先配置字段"
  },
  "hintNoFieldsToSelect": {
    "message": "请选择字段后配置字段内容。",
    "description": "无字段可选提示"
  },
  "labelFontSize": {
    "message": "字体大小",
    "description": "字体大小标签"
  },
  "labelTextAlign": {
    "message": "文本对齐",
    "description": "文本对齐标签"
  },
  "labelLineHeight": {
    "message": "行高",
    "description": "行高标签"
  },
  "optionFontSmall": {
    "message": "小 (12px)",
    "description": "小字体选项"
  },
  "optionFontMedium": {
    "message": "中 (14px)",
    "description": "中字体选项"
  },
  "optionFontLarge": {
    "message": "大 (16px)",
    "description": "大字体选项"
  },
  "optionFontXLarge": {
    "message": "更大 (18px)",
    "description": "更大字体选项"
  },
  "optionAlignLeft": {
    "message": "左对齐",
    "description": "左对齐选项"
  },
  "optionAlignCenter": {
    "message": "居中",
    "description": "居中选项"
  },
  "optionAlignRight": {
    "message": "右对齐",
    "description": "右对齐选项"
  },
  "optionLineHeightCompact": {
    "message": "紧凑 (1.2)",
    "description": "紧凑行高选项"
  },
  "optionLineHeightNormal": {
    "message": "适中 (1.4)",
    "description": "适中行高选项"
  },
  "optionLineHeightRelaxed": {
    "message": "宽松 (1.6)",
    "description": "宽松行高选项"
  },
  "labelStylePreview": {
    "message": "样式预览",
    "description": "样式预览标签"
  },
  "textStylePreview": {
    "message": "这是一个示例文本。<br />用于预览字体、对齐与行高效果。",
    "description": "样式预览文本"
  },
  "labelLanguage": {
    "message": "语言",
    "description": "语言标签"
  },
  "descLanguageFollowBrowser": {
    "message": "扩展程序语言跟随浏览器设置。如需更改,请在浏览器设置中调整显示语言。",
    "description": "语言跟随浏览器说明"
  },
  "labelCurrentLanguage": {
    "message": "当前语言",
    "description": "当前语言标签"
  },
  "titleConfigManagement": {
    "message": "配置管理",
    "description": "配置管理标题"
  },
  "descConfigManagement": {
    "message": "导出、导入或重置您的配置设置。注意: 导出的配置文件不包含API密钥以确保安全。",
    "description": "配置管理说明"
  },
  "btnExportConfig": {
    "message": "📤 导出配置",
    "description": "导出配置按钮"
  },
  "btnImportConfig": {
    "message": "📥 导入配置",
    "description": "导入配置按钮"
  },
  "btnResetConfig": {
    "message": "🔄 重置配置",
    "description": "重置配置按钮"
  },
  "btnSaveSettings": {
    "message": "保存设置",
    "description": "保存设置按钮"
  },
  "confirmResetConfig": {
    "message": "确定要重置所有配置吗? 此操作不可撤销。",
    "description": "重置配置确认"
  }
}
```

### 4.6 options.js 状态消息

```json
{
  "statusPleaseEnterApiKey": {
    "message": "请为当前提供商填写 API Key",
    "description": "请输入API Key提示"
  },
  "statusInvalidApiUrl": {
    "message": "API 地址格式不正确",
    "description": "API地址格式错误"
  },
  "statusTesting": {
    "message": "正在测试连接...",
    "description": "测试连接中"
  },
  "statusTestingAnki": {
    "message": "正在测试连接并刷新数据...",
    "description": "测试Anki连接中"
  },
  "statusAnkiConnected": {
    "message": "连接成功,AnkiConnect 版本: {0}",
    "description": "Anki连接成功,{0}=版本号"
  },
  "statusAnkiError": {
    "message": "连接错误: {0}",
    "description": "Anki连接错误"
  },
  "statusAnkiRefreshed": {
    "message": "数据刷新完成",
    "description": "数据刷新完成"
  },
  "statusSaving": {
    "message": "正在保存...",
    "description": "保存中"
  },
  "statusSaved": {
    "message": "设置已保存",
    "description": "保存成功"
  },
  "statusSaveError": {
    "message": "保存出错: {0}",
    "description": "保存错误"
  },
  "statusPermissionDenied": {
    "message": "未获得 {0} 的访问权限,已取消保存。",
    "description": "权限被拒绝"
  },
  "statusExporting": {
    "message": "正在导出配置...",
    "description": "导出中"
  },
  "statusExported": {
    "message": "配置导出成功",
    "description": "导出成功"
  },
  "statusExportError": {
    "message": "配置导出失败: {0}",
    "description": "导出失败"
  },
  "statusImporting": {
    "message": "正在导入配置...",
    "description": "导入中"
  },
  "statusImported": {
    "message": "配置导入成功,请重新配置 API 密钥",
    "description": "导入成功"
  },
  "statusImportError": {
    "message": "配置导入失败: {0}",
    "description": "导入失败"
  },
  "statusResetting": {
    "message": "正在重置配置...",
    "description": "重置中"
  },
  "statusReset": {
    "message": "配置已重置为默认值",
    "description": "重置成功"
  },
  "statusResetError": {
    "message": "重置配置失败: {0}",
    "description": "重置失败"
  },
  "errorInvalidConfigFile": {
    "message": "配置文件不是有效的 JSON",
    "description": "配置文件格式错误"
  },
  "errorInvalidConfigFormat": {
    "message": "配置文件格式不正确",
    "description": "配置格式错误"
  },
  "errorMissingAiConfig": {
    "message": "配置文件缺少 aiConfig",
    "description": "缺少AI配置"
  },
  "errorLoadingDecks": {
    "message": "读取牌组失败: {0}",
    "description": "读取牌组错误"
  },
  "errorLoadingModels": {
    "message": "读取模型失败: {0}",
    "description": "读取模型错误"
  },
  "errorLoadingAnkiData": {
    "message": "出错: {0}",
    "description": "读取Anki数据错误"
  },
  "errorGettingFields": {
    "message": "获取字段失败: {0}",
    "description": "获取字段错误"
  },
  "statusPleaseEnterApiKeyFirst": {
    "message": "请先输入 API Key",
    "description": "需要先输入API Key"
  },
  "statusTestResult": {
    "message": "测试{0}: {1}",
    "description": "测试结果,{0}=成功/失败,{1}=消息"
  }
}
```

### 4.7 Prompt 模板相关

```json
{
  "defaultPromptTemplate": {
    "message": "# Role: 专业单词查询助手\n\n请完成以下任务:\n1. 查询单词/短语: \"{{INPUT_TEXT}}\"\n2. 生成详细解析信息\n3. 按以下JSON格式输出:\n{{FIELD_SCHEMA}}\n\n要求:\n- 输出纯JSON格式,不包含任何解释文字\n- 根据单词/短语的特点,填充相应字段\n- 如果某个字段不适用,可以不输出该字段",
    "description": "默认Prompt模板"
  },
  "promptRequirements": {
    "message": "\n\n要求:\n- 输出有效JSON格式\n- 只能使用字段: {0}\n- 可部分输出,但字段名必须准确",
    "description": "Prompt要求文本,{0}=字段列表"
  },
  "promptCustomSuffix": {
    "message": "\n-------------------------------\n以下是本次输入的内容: {0}",
    "description": "自定义Prompt后缀,{0}=用户输入"
  },
  "fieldHint_word": {
    "message": "单词本身",
    "description": "单词字段提示"
  },
  "fieldHint_pronunciation": {
    "message": "读音/音标",
    "description": "发音字段提示"
  },
  "fieldHint_meaning": {
    "message": "释义和解释",
    "description": "释义字段提示"
  },
  "fieldHint_generic": {
    "message": "{0}相关内容",
    "description": "通用字段提示,{0}=字段名"
  }
}
```

### 4.8 语言名称

```json
{
  "langName_zh_CN": {
    "message": "简体中文",
    "description": "简体中文语言名称"
  },
  "langName_zh_TW": {
    "message": "繁体中文",
    "description": "繁体中文语言名称"
  },
  "langName_ja": {
    "message": "日本語",
    "description": "日语语言名称"
  },
  "langName_en": {
    "message": "English",
    "description": "英语语言名称"
  }
}
```

## 5. 待办事项清单 (Checklist)

### 5.1 文件创建和基础配置

- [ ] 1. 在 `_locales` 目录下创建 `en`, `ja`, `zh_TW` 文件夹。
- [ ] 2. 在上述新文件夹中创建 `messages.json` 文件。
- [ ] 3. 复制完整的键列表(第4节)到所有 `messages.json` 文件中。
- [ ] 4. 完成 `en`, `ja`, `zh_TW` 语言的翻译工作。
- [ ] 5. 补充完善 `zh_CN/messages.json`,添加所有缺失的键。
- [ ] 6. 修改 `manifest.json`:
  - [ ] 将 `default_locale` 从 `"zh_CN"` 改为 `"en"`
  - [ ] 将 `name` 替换为 `"__MSG_appName__"`
  - [ ] 将 `description` 替换为 `"__MSG_appDesc__"`

### 5.2 HTML 文件改造

#### 5.2.1 popup.html

- [ ] 7. 移除 `<html lang="zh-CN">` 的 `lang` 属性(由浏览器自动设置)
- [ ] 8. `<title>` 标签不需要改造(Chrome会自动使用manifest中的name)
- [ ] 9. 为以下元素添加 `data-i18n` 属性并移除硬编码文本:
  - [ ] `<h1>` 应用名称: `data-i18n="appName"`
  - [ ] `<label>` 输入文本标签: `data-i18n="textInputLabel"`
  - [ ] `<button id="parse-btn">`: `data-i18n="parseBtn"`
  - [ ] `<button id="write-btn">`: `data-i18n="writeBtn"`
  - [ ] Legacy模式的标签: `data-i18n="cardFront"` 和 `data-i18n="cardBack"`
- [ ] 10. 为占位符添加 `data-i18n-placeholder`:
  - [ ] `<textarea id="text-input">`: `data-i18n-placeholder="textInputPlaceholder"`
- [ ] 11. 在 `<head>` 中引入 i18n 脚本:
  ```html
  <script type="module" src="../utils/i18n.js"></script>
  ```

#### 5.2.2 options.html

- [ ] 12. 移除 `<html lang="zh-CN">` 的 `lang` 属性
- [ ] 13. `<title>` 改为通过脚本动态设置(或保持静态,因为Chrome可能不会显示)
- [ ] 14. 为主标题添加 i18n: `<h1 data-i18n="optionsTitle"></h1>`
- [ ] 15. 为所有标签页按钮添加 i18n:
  - [ ] "AI 配置": `data-i18n="tabAiConfig"`
  - [ ] "Anki 连接": `data-i18n="tabAnkiConfig"`
  - [ ] "Prompt 配置": `data-i18n="tabPromptConfig"`
  - [ ] "样式设置": `data-i18n="tabStyleConfig"`
  - [ ] "系统设置": `data-i18n="tabSystemConfig"`
- [ ] 16. 为所有表单标签和按钮添加相应的 i18n 属性(参考第4.5节)
- [ ] 17. 移除或修改语言选择下拉框(参考步骤7)
- [ ] 18. 在 `<head>` 中引入 i18n 脚本

### 5.3 JavaScript 文件改造

#### 5.3.1 utils/i18n.js

- [ ] 19. 完善 `localizePage()` 函数,支持所有 data-i18n 属性类型
- [ ] 20. 确保在 DOMContentLoaded 时自动调用
- [ ] 21. 导出 `getMessage()` 函数供其他模块使用

#### 5.3.2 popup.js

- [ ] 22. 在文件顶部导入 i18n 工具:
  ```javascript
  import { getMessage } from '../utils/i18n.js';
  ```
- [ ] 23. 替换所有硬编码的状态消息为 `getMessage()` 调用:
  - [ ] "准备就绪" → `getMessage('statusReady')`
  - [ ] "请输入要解析的文本" → `getMessage('statusPleaseInput')`
  - [ ] "正在进行AI解析..." → `getMessage('statusParsing')`
  - [ ] 等等(参考第4.3节)
- [ ] 24. 替换 ErrorBoundary 类中的所有消息:
  - [ ] `getUserFriendlyMessage()` 方法中的所有返回值
  - [ ] `getRetryMessage()` 方法中的所有返回值
  - [ ] `showCriticalError()` 和 `showRetryOption()` 中的对话框文本
- [ ] 25. 替换动态生成的 HTML 中的文本:
  - [ ] `renderLegacyFields()` 中的标签文本
  - [ ] `renderDynamicFields()` 中的占位符文本
- [ ] 26. 替换所有 `alert()` 和 `confirm()` 中的文本

#### 5.3.3 options.js

- [ ] 27. 导入 i18n 工具
- [ ] 28. 替换 `createProviderSection()` 中的所有硬编码文本:
  - [ ] 标签文本
  - [ ] 按钮文本
  - [ ] 占位符
  - [ ] 提示文本
- [ ] 29. 替换所有状态消息和错误提示(参考第4.6节)
- [ ] 30. 替换 Prompt 编辑器相关的所有文本
- [ ] 31. 替换配置管理相关的文本
- [ ] 32. 替换 `confirm()` 对话框文本
- [ ] 33. 更新 `formatHealthStatusLabel()` 使用 getMessage
- [ ] 34. 更新日期格式化代码使用动态 locale

#### 5.3.4 prompt-engine.js

- [ ] 35. 导入 i18n 工具
- [ ] 36. 修改 `getDefaultIntegratedTemplate()`:
  ```javascript
  function getDefaultIntegratedTemplate() {
    return chrome.i18n.getMessage('defaultPromptTemplate');
  }
  ```
- [ ] 37. 修改 `generateFieldSchema()` 使用 getMessage 获取提示
- [ ] 38. 修改 `buildIntegratedPrompt()` 中的要求文本

#### 5.3.5 field-handler.js, ai-service.js, ankiconnect.js 等

- [ ] 39. 检查并替换所有面向用户的错误消息
- [ ] 40. 确保所有 console.log 中的调试消息可以保留中文(不面向用户)

### 5.4 动态内容和特殊场景

- [ ] 41. 实现动态 locale 获取功能:
  ```javascript
  function getLocale() {
    const uiLanguage = chrome.i18n.getUILanguage();
    const localeMap = {
      'zh-CN': 'zh-CN',
      'zh-TW': 'zh-TW',
      'ja': 'ja-JP',
      'en': 'en-US'
    };
    return localeMap[uiLanguage] || 'en-US';
  }
  ```
- [ ] 42. 替换所有 `toLocaleString('zh-CN')` 为 `toLocaleString(getLocale())`
- [ ] 43. 实现当前语言显示功能(如果保留语言选择区域)
- [ ] 44. 处理所有带占位符的消息(使用 `getMessage(key, [value1, value2])`)

### 5.5 测试

- [ ] 45. **测试简体中文 (zh-CN)**:
  - [ ] 设置浏览器语言为简体中文
  - [ ] 重新加载扩展
  - [ ] 检查 popup 页面所有文本
  - [ ] 检查 options 页面所有文本
  - [ ] 测试所有功能的状态消息和错误提示
- [ ] 46. **测试繁体中文 (zh-TW)**:
  - [ ] 重复上述测试步骤
- [ ] 47. **测试日语 (ja)**:
  - [ ] 重复上述测试步骤
- [ ] 48. **测试英语 (en)**:
  - [ ] 重复上述测试步骤
- [ ] 49. **测试其他语言回退**:
  - [ ] 设置浏览器为法语、德语等
  - [ ] 确认正确回退到英语
- [ ] 50. **功能测试**:
  - [ ] 测试所有 AI 提供商连接
  - [ ] 测试 Anki 连接和卡片创建
  - [ ] 测试 Prompt 配置
  - [ ] 测试配置导入/导出
  - [ ] 测试样式设置

### 5.6 文档和清理

- [ ] 51. 更新 README.md,添加多语言支持说明
- [ ] 52. 创建翻译指南文档(如果需要社区贡献翻译)
- [ ] 53. 移除所有遗留的硬编码文本
- [ ] 54. 清理不再使用的代码和注释

## 6. 注意事项和最佳实践

### 6.1 翻译质量

1. **上下文准确**: 确保翻译符合使用场景,避免字面翻译
2. **术语统一**: 在所有地方使用相同的技术术语翻译
3. **简洁明了**: 特别是错误消息,要清晰易懂
4. **文化适应**: 考虑不同文化背景的表达习惯

### 6.2 技术注意事项

1. **占位符顺序**: 使用 `{0}`, `{1}` 时,确保在不同语言中顺序合理
2. **HTML安全**: 避免在 getMessage 结果中插入未转义的HTML
3. **测试覆盖**: 每种语言都要全面测试所有功能
4. **性能**: getMessage 调用是同步的,性能良好,可以放心使用

### 6.3 维护性

1. **集中管理**: 所有翻译键在 messages.json 中集中管理
2. **命名规范**: 使用有意义的键名,如 `statusParsing` 而不是 `msg1`
3. **文档同步**: 添加新功能时同时更新所有语言的 messages.json
4. **版本控制**: 在 commit message 中标注新增的翻译键

## 7. 补充建议

### 7.1 未来扩展

1. **语言检测**: 可以添加功能检测用户输入的语言,自动调整 Prompt
2. **更多语言**: 框架已经支持,添加新语言只需新建对应的 messages.json
3. **翻译工具**: 可以开发脚本自动检测缺失的翻译键

### 7.2 用户体验

1. **首次使用**: 考虑根据检测到的语言显示欢迎信息
2. **错误友好**: 错误消息应该给出明确的解决建议,而不仅仅是说明问题
3. **一致性**: 确保所有界面元素的措辞风格一致

## 8. 已识别的特殊问题

### 8.1 Prompt 模板的多语言问题

**问题**: Prompt 模板直接影响 AI 的理解和输出,不同语言的 Prompt 可能需要不同的表达方式。

**解决方案**:
1. 默认 Prompt 使用 i18n,根据界面语言提供优化的 Prompt
2. 用户自定义的 Prompt 保持原样,不做翻译
3. 在 UI 中提示用户:自定义 Prompt 时建议使用英语以获得最佳 AI 理解效果

### 8.2 字段名称的国际化

**问题**: Anki 模板的字段名称由用户定义,可能是中文、日语或英语。

**解决方案**:
1. 字段名称本身不翻译(保持用户在 Anki 中定义的原样)
2. 字段相关的 UI 文本(如"字段选择"、"字段配置")翻译
3. 智能提示文本翻译

### 8.3 日期和时间格式

**问题**: 不同地区对日期时间有不同的习惯。

**解决方案**:
使用动态 locale 和 `toLocaleString()`/`toLocaleDateString()` 自动适应。

## 9. 总结

遵循以上步骤,我们可以系统性地完成项目的国际化改造。该方案:

- ✅ 利用了 Chrome 的原生能力,具有良好的性能和可维护性
- ✅ 为未来支持更多语言打下了坚实的基础
- ✅ 全面覆盖了所有用户界面文本
- ✅ 考虑了特殊场景和边缘情况
- ✅ 提供了详细的测试清单

**预计工作量**:
- 创建和翻译 messages.json: 2-3天(每种语言)
- HTML 改造: 1-2天
- JavaScript 改造: 3-4天
- 测试和调试: 2-3天
- **总计: 约 1-2周**
## 术语与占位符说明

- **键名命名**：按页面与职责组合，例如 `popup_status_ready`、`options_button_save`、`ai_service_error_request_failed`，保持语义可读。
- **占位符格式**：源码统一书写为 `{name}`，生成 `messages.json` 时转换成 `$NAME$` 并补充 `placeholders` 的 `description`、`example`。
- **复用策略**：跨页面复用的提示（如“当前模板未配置…”）保持单一键名，避免重复翻译。
- **翻译占位**：`en`、`ja`、`zh_TW` 当前暂以中文占位，后续阶段补齐正式译文并校对语体。
- **模板拆分**：原先内嵌 HTML 的长字符串将在后续阶段拆分成结构化 DOM + 键值，降低翻译难度。
Stage 6 validation checklist: docs/internationalization-stage6.md


