# Anki单词助手：多AI供应商切换功能技术实现方案

**文档版本：** v1.0  
**创建日期：** 2025年9月3日  
**作者：** Gemini

---

## 1. 简介

### 1.1 文档目的
本文档旨在为“Anki单词助手”浏览器插件设计并规划多AI供应商切换功能的具体技术实现。文档详细描述了从当前单一供应商（Gemini）架构迁移到支持多种AI供应商（如OpenAI, Anthropic, Google）的灵活架构所需的步骤、代码修改和技术选型。

本文档将作为技术评审、开发实施和后续维护的核心依据。

### 1.2 需求背景
当前项目仅支持单一的Google Gemini作为AI服务，这带来了几个关键问题：
- **单点故障风险**: 如果Gemini服务中断或API政策变更，插件核心功能将完全瘫痪。
- **成本与性能失衡**: 无法根据任务的复杂度和成本敏感度，选择性价比最高的AI模型。
- **用户选择受限**: 用户无法根据个人偏好或已有的API Key选择自己信任的AI服务商。
- **功能扩展性不足**: 不同AI供应商在特定语言或任务上各有优势，单一供应商限制了插件未来的功能扩展。

为了解决以上问题，引入一个灵活、可扩展的多AI供应商切换机制至关重要。

### 1.3 实现目标
- **支持主流供应商**: 至少支持 Google (Gemini), OpenAI (GPT系列), 和 Anthropic (Claude系列)。
- **统一服务接口**: 在应用层使用统一的接口调用AI服务，无论底层选择哪个供应商，业务逻辑代码无需改动。
- **用户可配置**: 在插件的配置页面，用户可以自由选择AI供应商，并配置相应的API Key和模型。
- **安全存储**: 所有API Key必须在本地进行加密存储，防止被轻易窃取。
- **平滑迁移**: 尽可能减少对现有代码的侵入性，保证迁移过程的稳定性。

---

## 2. 现有技术实现分析

在进行方案设计前，我们首先需要理解当前与AI功能相关的核心代码实现。

### 2.1 核心组件
- **AI服务层 (`utils/ai-service.js`)**: 负责与AI供应商API直接交互。
- **配置存储层 (`utils/storage.js`)**: 负责在`chrome.storage.local`中保存和读取用户配置，包括API Key。
- **配置界面 (`options/options.html` & `options.js`)**: 用户进行插件配置的UI和交互逻辑。

### 2.2 AI服务层 (`ai-service.js`)
- **实现方式**: 通过原生的`fetch` API直接调用Google Gemini的API端点。
- **硬编码**: API端点URL、请求结构都为Gemini的格式硬编码，缺乏扩展性。
- **单一职责**: `parseText`函数强依赖Gemini的返回格式，`testConnection`函数也只针对Gemini的验证方式。

### 2.3 配置存储层 (`utils/storage.js`)
- **存储结构**: 当前的配置结构为单一供应商设计，API Key直接存储在`aiConfig.models.gemini.apiKey`路径下。
- **加密逻辑**: 实现了一个基于`crypto.subtle`的`encryptApiKey`和`decryptApiKey`方法。**这是一个关键优势**，但`saveConfig`和`loadConfig`函数目前只对Gemini的API Key进行加解密，需要将其通用化。

### 2.4 配置界面 (`options.html` & `options.js`)
- **UI**: 界面上只有一个API Key输入框和一个模型名称输入框，没有供应商选择的选项。
- **逻辑**: `handleSave`, `loadAndDisplayConfig`, `handleTestAi`等函数都假定后台只有Gemini一个供应商，直接读写固定的DOM元素和配置路径。

---

## 3. 技术选型

根据《多AI供应商切换方案技术调研报告.md》的结论，我们选择 **Vercel AI SDK (`ai`包)** 作为核心依赖。

- **选择理由**:
  - **官方维护与稳定性**: 由Vercel团队维护，已被大量生产项目验证，可靠性高。
  - **统一的API**: 提供`generateText`等标准接口，一行代码即可切换不同的AI供应商，极大降低了`ai-service.js`的改造复杂度。
  - **框架无关**: 纯JavaScript库，与本项目现有技术栈完美兼容。
  - **社区生态**: 拥有完善的文档和活跃的社区，便于解决开发中遇到的问题。

---

## 4. 详细设计与实现方案

### 4.1 步骤一：安装依赖
首先，我们需要在项目中添加Vercel AI SDK及其相关的供应商包。

```bash
npm install ai @ai-sdk/google @ai-sdk/openai @ai-sdk/anthropic
```

### 4.2 步骤二：重构配置存储 (`utils/storage.js`)

为了支持多供应商，我们需要重新设计配置对象的结构。

#### 4.2.1 新的配置结构
```javascript
// 新的默认配置结构
const defaultConfig = {
  aiConfig: {
    // 新增：当前启用的供应商
    provider: 'google', 
    // 新增：一个包含所有供应商配置的对象
    models: {
      google: {
        apiKey: '',
        modelName: 'gemini-1.5-flash',
      },
      openai: {
        apiKey: '',
        modelName: 'gpt-4-turbo',
      },
      anthropic: {
        apiKey: '',
        modelName: 'claude-3-5-sonnet-20240620',
      }
    }
  },
  // ... 其他配置保持不变
};
```

#### 4.2.2 修改加解密逻辑
`saveConfig` 和 `loadConfig` 函数需要被修改，使其能够动态地对**所有**供应商的API Key进行加解密。

```javascript
// utils/storage.js (修改示例)

export async function saveConfig(config) {
  const configToSave = JSON.parse(JSON.stringify(config)); // 深拷贝
  
  // 遍历所有供应商并加密其API Key
  if (configToSave.aiConfig && configToSave.aiConfig.models) {
    for (const provider in configToSave.aiConfig.models) {
      const apiKey = configToSave.aiConfig.models[provider].apiKey;
      if (apiKey) {
        configToSave.aiConfig.models[provider].apiKey = await encryptApiKey(apiKey);
      }
    }
  }
  
  return chrome.storage.local.set({ [CONFIG_KEY]: configToSave });
}

export async function loadConfig() {
  return new Promise((resolve) => {
    chrome.storage.local.get(CONFIG_KEY, async (result) => {
      // ... 错误处理 ...
      const config = result[CONFIG_KEY];
      if (config && config.aiConfig && config.aiConfig.models) {
        // 遍历所有供应商并解密其API Key
        for (const provider in config.aiConfig.models) {
          const encryptedKey = config.aiConfig.models[provider].apiKey;
          if (encryptedKey) {
            config.aiConfig.models[provider].apiKey = await decryptApiKey(encryptedKey);
          }
        }
      }
      resolve(config);
    });
  });
}
```

### 4.3 步骤三：重构AI服务层 (`utils/ai-service.js`)

这是本次改造的核心。我们将用Vercel AI SDK替换掉原有的`fetch`实现。

```javascript
// utils/ai-service.js (重构后)

import { generateText } from 'ai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { loadConfig } from './storage.js';

// 供应商工厂，用于创建AI客户端实例
function getAiClient(provider, apiKey) {
  switch (provider) {
    case 'google':
      return createGoogleGenerativeAI({ apiKey });
    case 'openai':
      return createOpenAI({ apiKey });
    case 'anthropic':
      return createAnthropic({ apiKey });
    default:
      throw new Error(`不支持的AI供应商: ${provider}`);
  }
}

// 获取当前配置的模型实例
async function getModel() {
  const config = await loadConfig();
  const provider = config?.aiConfig?.provider || 'google';
  const providerConfig = config?.aiConfig?.models[provider];

  if (!providerConfig || !providerConfig.apiKey) {
    throw new Error(`未配置'${provider}'的API Key`);
  }

  const aiClient = getAiClient(provider, providerConfig.apiKey);
  return aiClient(providerConfig.modelName);
}

// 统一的文本解析接口
export async function parseText(inputText, promptTemplate) {
  const model = await getModel();
  const fullPrompt = buildPrompt(inputText, promptTemplate);

  try {
    const { text } = await generateText({
      model,
      prompt: fullPrompt,
      // Vercel AI SDK 默认输出JSON字符串，无需额外配置
    });
    return JSON.parse(text);
  } catch (error) {
    console.error(`AI服务(${model.provider})调用失败:`, error);
    throw error;
  }
}

// 通用化的连接测试函数
export async function testConnection(provider, apiKey, modelName) {
  if (!apiKey) throw new Error('API Key不能为空');
  
  const aiClient = getAiClient(provider, apiKey);
  const model = aiClient(modelName);

  try {
    // 发送一个简短的测试请求
    await generateText({
      model,
      prompt: 'Hi',
      maxTokens: 5,
    });
  } catch (error) {
    console.error(`'${provider}'连接测试失败:`, error);
    throw new Error(`连接测试失败: ${error.message}`);
  }
}

// buildPrompt 函数保持不变
export function buildPrompt(inputText, template) {
  // ... 现有实现保持不变
}
```

### 4.4 步骤四：更新配置界面 (`options.html` & `options.js`)

#### 4.4.1 HTML (`options.html`)
在AI服务配置区域，添加供应商选择下拉框，并为每个供应商创建独立的配置区块。

```html
<!-- options.html (修改部分) -->
<section id="ai-config">
  <h2>AI 服务配置</h2>
  
  <!-- 供应商选择 -->
  <div class="form-group">
    <label for="ai-provider">AI 服务商</label>
    <select id="ai-provider">
      <option value="google">Google (Gemini)</option>
      <option value="openai">OpenAI (GPT)</option>
      <option value="anthropic">Anthropic (Claude)</option>
    </select>
  </div>

  <!-- Google Gemini 配置 -->
  <div id="config-google" class="provider-config">
    <div class="form-group">
      <label for="google-api-key">Gemini API Key</label>
      <input type="password" id="google-api-key" placeholder="输入您的 Gemini API Key">
    </div>
    <div class="form-group">
      <label for="google-model-name">模型名称</label>
      <input type="text" id="google-model-name" placeholder="例如: gemini-1.5-flash">
    </div>
  </div>

  <!-- OpenAI 配置 -->
  <div id="config-openai" class="provider-config" style="display: none;">
    <div class="form-group">
      <label for="openai-api-key">OpenAI API Key</label>
      <input type="password" id="openai-api-key" placeholder="sk-...">
    </div>
    <div class="form-group">
      <label for="openai-model-name">模型名称</label>
      <input type="text" id="openai-model-name" placeholder="例如: gpt-4-turbo">
    </div>
  </div>

  <!-- Anthropic 配置 -->
  <div id="config-anthropic" class="provider-config" style="display: none;">
    <div class="form-group">
      <label for="anthropic-api-key">Claude API Key</label>
      <input type="password" id="anthropic-api-key" placeholder="sk-ant-...">
    </div>
    <div class="form-group">
      <label for="anthropic-model-name">模型名称</label>
      <input type="text" id="anthropic-model-name" placeholder="例如: claude-3-5-sonnet-20240620">
    </div>
  </div>

  <button id="test-ai-btn">测试 AI 连接</button>
  <p id="ai-status"></p>
</section>
```

#### 4.4.2 JavaScript (`options.js`)
更新JS逻辑以响应UI变化，并正确地加载和保存多供应商的配置。

1.  **添加事件监听**: 监听`ai-provider`下拉框的`change`事件，根据选择显示或隐藏对应的配置区块。
2.  **修改`loadAndDisplayConfig`**: 加载配置后，不仅要设置当前选中的供应商，还要填充所有供应商的输入框，并根据当前供应商显示正确的区块。
3.  **修改`handleSave`**: 保存时，从所有输入框收集数据，构建新的配置对象结构，然后调用`saveConfig`。
4.  **修改`handleTestAi`**: 测试连接时，获取当前选中的供应商及其对应的API Key和模型名称，然后调用通用的`testConnection`函数。

---

## 5. 实施计划
1.  **阶段一：环境与存储 (0.5天)**
    - `npm install` 安装所有新依赖。
    - 备份`storage.js`，然后按照`4.2`中的方案进行重构和测试，确保配置的读、写、加解密完全正常。
2.  **阶段二：核心服务重构 (1天)**
    - 备份`ai-service.js`，然后按照`4.3`中的方案进行重构。
    - 编写临时的测试脚本调用`parseText`和`testConnection`，确保在不依赖UI的情况下，各供应商服务能正常工作。
3.  **阶段三：UI与交互 (1天)**
    - 修改`options.html`，添加新的UI元素。
    - 修改`options.js`，实现UI交互逻辑、配置的加载与保存、以及连接测试功能。
4.  **阶段四：集成测试与回归 (0.5天)**
    - 全面测试配置页面的所有功能。
    - 回归测试插件的核心功能（通过popup进行单词解析），确保在不同AI供应商之间切换后功能正常。

**预估总工时：3天**

---

## 6. 风险评估
- **API Key安全**: 客户端加密仅为混淆，无法完全阻止专业攻击者。需在文档和UI中明确告知用户此风险。
- **向后兼容性**: 本次修改会完全改变配置结构。从旧版本升级的用户，其原有的Gemini API Key会丢失。需要考虑是否做一个一次性的迁移脚本。对于新项目，此风险可以忽略。
- **测试成本**: 需要准备所有目标AI供应商的有效API Key才能进行完整的端到端测试。

---

## 7. 总结
本方案通过引入Vercel AI SDK，可以系统性地、低风险地将项目从单一供应商架构重构为灵活的多供应商架构。方案详细规划了数据结构、核心服务和用户界面的修改，步骤清晰，风险可控。建议评审通过后，按照此方案进行开发实施。
