# 多AI供应商切换方案技术调研报告

**文档版本：** v1.0  
**创建日期：** 2025年9月3日  
**调研目的：** 为Anki单词助手项目选择合适的多AI供应商切换解决方案  
**当前项目状态：** feature/stage-1-architecture 分支，目前仅支持 Gemini

---

## 1. 调研背景

### 1.1 现有技术栈限制
项目当前只支持单一AI供应商（Gemini），存在以下问题：
- **供应商依赖风险：** 单点故障，API限制或服务中断影响整个应用
- **成本优化受限：** 无法根据不同场景选择最优性价比的模型
- **功能局限性：** 不同供应商在特定任务上表现差异明显
- **用户选择权限制：** 用户无法根据偏好选择AI服务

### 1.2 业务需求分析
- **多供应商支持：** 支持OpenAI、Anthropic (Claude)、Google (Gemini)等主流供应商
- **统一接口设计：** 最小化代码改动，保持现有业务逻辑
- **配置化切换：** 用户可在配置页面选择不同的AI供应商
- **降级策略：** 主供应商不可用时自动切换到备用方案
- **成本控制：** 根据任务类型选择最合适的模型

---

## 2. 技术方案调研结果

### 2.1 主要解决方案对比

| 方案 | 成熟度 | 维护状态 | 支持供应商 | 社区活跃度 | 推荐指数 |
|------|--------|----------|------------|------------|----------|
| Vercel AI SDK | 高 | 官方维护 | 10+ | 很高 | ⭐⭐⭐⭐⭐ |
| LLM.js | 中 | 个人维护 | 100+ | 中等 | ⭐⭐⭐⭐ |
| any-llm | 中 | 个人维护 | 8+ | 较低 | ⭐⭐⭐ |
| uni-api | 高 | 社区维护 | 20+ | 中等 | ⭐⭐⭐⭐ |
| 自建方案 | 低 | 项目维护 | 按需 | - | ⭐⭐ |

### 2.2 详细方案分析

#### 2.2.1 Vercel AI SDK (推荐方案)

**基本信息：**
- **NPM包名：** `ai`
- **维护方：** Vercel (官方)
- **当前版本：** 5.0.29
- **使用项目：** 1230+ (npm统计)

**核心特性：**
- ✅ 统一API接口，一行代码切换供应商
- ✅ 支持流式响应和实时UI更新
- ✅ 框架无关（React、Vue、Next.js等）
- ✅ TypeScript原生支持
- ✅ 官方维护，更新频繁
- ✅ 文档完善，生产级稳定性

**支持的AI供应商：**
```javascript
// OpenAI系列
import { openai } from '@ai-sdk/openai';
- GPT-4, GPT-4 Turbo, GPT-3.5 Turbo
- DALL-E (图像生成)

// Google系列  
import { google } from '@ai-sdk/google';
- Gemini 1.5 Pro, Gemini 1.5 Flash
- Gemini 1.0 Pro Vision

// Anthropic系列
import { anthropic } from '@ai-sdk/anthropic';
- Claude 3.5 Sonnet, Claude 3 Opus/Sonnet/Haiku

// 其他供应商
- Mistral AI
- Cohere
- Hugging Face
- Azure OpenAI
```

**代码示例：**
```javascript
import { generateText } from 'ai';
import { openai } from '@ai-sdk/openai';
import { google } from '@ai-sdk/google';
import { anthropic } from '@ai-sdk/anthropic';

// 供应商切换逻辑
function getModel(provider, model) {
  switch(provider) {
    case 'openai':
      return openai(model || 'gpt-4');
    case 'google':
      return google(model || 'gemini-1.5-pro');
    case 'anthropic':
      return anthropic(model || 'claude-3-5-sonnet-20241022');
    default:
      throw new Error(`Unsupported provider: ${provider}`);
  }
}

// 统一调用接口
async function callAI(prompt, config) {
  const model = getModel(config.provider, config.model);
  
  const { text } = await generateText({
    model,
    prompt,
    temperature: config.temperature || 0.7,
    maxTokens: config.maxTokens || 1000,
  });
  
  return text;
}
```

**优势：**
- 生产级稳定性，被大量商业项目使用
- 官方维护，bug修复和新功能更新及时
- 统一的API设计，学习成本低
- 优秀的TypeScript支持
- 详细的文档和示例

**劣势：**
- 相对较新，某些高级功能可能不如专用SDK丰富
- 需要安装多个provider包

#### 2.2.2 LLM.js (备选方案)

**基本信息：**
- **NPM包名：** `@themaximalist/llm.js`
- **维护方：** The Maximalist (个人)
- **特点：** 零依赖，轻量级

**核心特性：**
- ✅ 零依赖设计，包体积小
- ✅ 支持100+模型
- ✅ 浏览器和Node.js兼容
- ✅ 内置成本追踪功能
- ✅ 简洁的API设计
- ⚠️ 个人维护，稳定性相对较低

**使用示例：**
```javascript
import LLM from '@themaximalist/llm.js';

// 简单调用
const response = await LLM("解析这段文本", {
  service: "openai",    // 或 "anthropic", "google"
  model: "gpt-4",
  temperature: 0.7
});

// 聊天模式
const llm = new LLM({ service: "google", model: "gemini-pro" });
const chat = await llm.chat("你好");
```

#### 2.2.3 any-llm (TypeScript优先方案)

**基本信息：**
- **GitHub：** `fkesheh/any-llm`
- **特点：** TypeScript原生支持
- **维护状态：** 活跃开发中

**支持供应商：**
- OpenAI (GPT-4, GPT-3.5)
- Google (Gemini系列)
- Anthropic (Claude系列)  
- Mistral, Groq, Perplexity, Cohere

**使用示例：**
```typescript
import { Client, ModelProvider, ChatModels } from 'any-llm';

const client = new Client(
  ModelProvider.OpenAI,
  { OPENAI_API_KEY: process.env.OPENAI_API_KEY }
);

const response = await client.createChatCompletion(
  {
    model: ChatModels.OpenAI.GPT_4,
    max_tokens: 1000,
    temperature: 0.7
  },
  [{ role: 'user', content: 'Hello' }]
);
```

#### 2.2.4 uni-api (服务端代理方案)

**基本信息：**
- **GitHub：** `yym68686/uni-api`
- **特点：** 服务端统一代理，转换为OpenAI格式
- **部署方式：** 独立服务或Docker容器

**核心特性：**
- ✅ 统一转换为OpenAI API格式
- ✅ 支持负载均衡和故障转移
- ✅ 配置文件管理，无需前端改动
- ✅ 支持20+供应商
- ⚠️ 需要额外部署服务

**架构示例：**
```
项目 → uni-api服务 → OpenAI/Claude/Gemini等
          ↓
    统一OpenAI格式API
```

---

## 3. 项目集成方案建议

### 3.1 推荐方案：Vercel AI SDK

**选择理由：**
1. **生产级稳定性：** 官方维护，被1230+项目使用
2. **最小改动：** 与现有JavaScript架构完美兼容
3. **统一API：** 一套代码支持多个供应商
4. **长期支持：** Vercel公司背书，持续更新保障

### 3.2 具体集成步骤

#### 步骤1：安装依赖包
```bash
npm install ai @ai-sdk/openai @ai-sdk/google @ai-sdk/anthropic
```

#### 步骤2：改造现有 ai-service.js
```javascript
// utils/ai-service.js 改造后
import { generateText } from 'ai';
import { openai } from '@ai-sdk/openai';
import { google } from '@ai-sdk/google';
import { anthropic } from '@ai-sdk/anthropic';
import { loadConfig } from './storage.js';

// 供应商映射配置
const PROVIDERS = {
  openai: {
    client: openai,
    models: {
      'gpt-4': 'gpt-4',
      'gpt-3.5-turbo': 'gpt-3.5-turbo'
    }
  },
  google: {
    client: google,
    models: {
      'gemini-1.5-pro': 'gemini-1.5-pro',
      'gemini-1.5-flash': 'gemini-1.5-flash'
    }
  },
  anthropic: {
    client: anthropic,
    models: {
      'claude-3.5-sonnet': 'claude-3-5-sonnet-20241022',
      'claude-3-haiku': 'claude-3-haiku-20240307'
    }
  }
};

// 获取配置的模型实例
function getModel(config) {
  const provider = config?.aiConfig?.provider || 'google';
  const modelName = config?.aiConfig?.modelName || 'gemini-1.5-flash';
  
  const providerConfig = PROVIDERS[provider];
  if (!providerConfig) {
    throw new Error(`不支持的AI供应商: ${provider}`);
  }
  
  const actualModelName = providerConfig.models[modelName] || modelName;
  return providerConfig.client(actualModelName);
}

// 统一的解析接口
export async function parseText(inputText, promptTemplate) {
  const config = await loadConfig();
  const model = getModel(config);
  
  const fullPrompt = buildPrompt(inputText, promptTemplate);
  
  try {
    const { text } = await generateText({
      model,
      prompt: fullPrompt,
      temperature: 0.7,
      maxTokens: 2000,
    });
    
    return JSON.parse(text);
  } catch (error) {
    console.error('AI解析失败:', error);
    throw new Error(`AI服务请求失败: ${error.message}`);
  }
}

// 测试连接功能
export async function testConnection(provider, apiKey, modelName) {
  try {
    const providerConfig = PROVIDERS[provider];
    if (!providerConfig) {
      throw new Error(`不支持的供应商: ${provider}`);
    }
    
    const model = providerConfig.client(modelName);
    
    // 简单测试请求
    await generateText({
      model,
      prompt: '测试连接',
      maxTokens: 10,
    });
    
    return { success: true };
  } catch (error) {
    throw new Error(`连接测试失败: ${error.message}`);
  }
}

// 保持现有的buildPrompt函数不变
export function buildPrompt(inputText, template) {
  // ... 现有实现保持不变
}
```

#### 步骤3：扩展配置结构
```javascript
// utils/storage.js 中的配置结构扩展
const defaultConfig = {
  aiConfig: {
    provider: 'google',        // 新增：供应商选择
    models: {
      openai: {
        apiKey: '',
        modelName: 'gpt-4',
        available: ['gpt-4', 'gpt-3.5-turbo']
      },
      google: {
        apiKey: '',
        modelName: 'gemini-1.5-flash', 
        available: ['gemini-1.5-pro', 'gemini-1.5-flash']
      },
      anthropic: {
        apiKey: '',
        modelName: 'claude-3.5-sonnet',
        available: ['claude-3.5-sonnet', 'claude-3-haiku']
      }
    }
  },
  // ... 其他配置保持不变
};
```

#### 步骤4：更新配置界面
```html
<!-- options/options.html 新增供应商选择 -->
<div class="form-group">
  <label for="ai-provider">AI服务供应商</label>
  <select id="ai-provider">
    <option value="google">Google (Gemini)</option>
    <option value="openai">OpenAI (GPT)</option>
    <option value="anthropic">Anthropic (Claude)</option>
  </select>
</div>

<div class="provider-configs">
  <!-- OpenAI配置 -->
  <div id="openai-config" class="provider-config" style="display: none;">
    <div class="form-group">
      <label for="openai-api-key">OpenAI API Key</label>
      <input type="password" id="openai-api-key" placeholder="sk-...">
    </div>
    <div class="form-group">
      <label for="openai-model">模型选择</label>
      <select id="openai-model">
        <option value="gpt-4">GPT-4</option>
        <option value="gpt-3.5-turbo">GPT-3.5 Turbo</option>
      </select>
    </div>
  </div>
  
  <!-- Claude配置 -->
  <div id="anthropic-config" class="provider-config" style="display: none;">
    <div class="form-group">
      <label for="claude-api-key">Claude API Key</label>
      <input type="password" id="claude-api-key" placeholder="sk-ant-...">
    </div>
    <div class="form-group">
      <label for="claude-model">模型选择</label>
      <select id="claude-model">
        <option value="claude-3.5-sonnet">Claude 3.5 Sonnet</option>
        <option value="claude-3-haiku">Claude 3 Haiku</option>
      </select>
    </div>
  </div>
</div>
```

### 3.3 降级和容错策略

#### 3.3.1 自动降级机制
```javascript
// 增强的parseText函数，支持自动降级
export async function parseTextWithFallback(inputText, promptTemplate) {
  const config = await loadConfig();
  const primaryProvider = config?.aiConfig?.provider || 'google';
  
  // 定义降级顺序
  const fallbackOrder = {
    'google': ['openai', 'anthropic'],
    'openai': ['google', 'anthropic'], 
    'anthropic': ['google', 'openai']
  };
  
  const tryProviders = [primaryProvider, ...fallbackOrder[primaryProvider]];
  
  for (const provider of tryProviders) {
    try {
      const providerConfig = {...config};
      providerConfig.aiConfig.provider = provider;
      
      const model = getModel(providerConfig);
      const result = await parseText(inputText, promptTemplate);
      
      // 如果使用了备用供应商，记录日志
      if (provider !== primaryProvider) {
        console.warn(`主供应商${primaryProvider}不可用，使用备用方案${provider}`);
      }
      
      return result;
    } catch (error) {
      console.error(`供应商${provider}解析失败:`, error.message);
      continue;
    }
  }
  
  throw new Error('所有AI供应商都不可用');
}
```

#### 3.3.2 成本优化策略
```javascript
// 根据任务类型选择最优供应商
export function getOptimalProvider(taskType, textLength) {
  // 短文本、简单任务 -> 使用便宜快速的模型
  if (textLength < 500 && taskType === 'simple') {
    return { provider: 'google', model: 'gemini-1.5-flash' };
  }
  
  // 长文本、复杂分析 -> 使用高质量模型  
  if (textLength > 2000 || taskType === 'complex') {
    return { provider: 'anthropic', model: 'claude-3.5-sonnet' };
  }
  
  // 默认平衡方案
  return { provider: 'openai', model: 'gpt-4' };
}
```

---

## 4. 成本效益分析

### 4.1 实施成本

| 项目 | 预估工作量 | 复杂度 |
|------|------------|--------|
| 安装和配置AI SDK | 0.5天 | 低 |
| 改造现有ai-service.js | 1天 | 中 |
| 扩展配置系统 | 1天 | 中 | 
| 更新配置界面 | 1天 | 中 |
| 测试和调试 | 1天 | 中 |
| **总计** | **4.5天** | **中等** |

### 4.2 长期收益

**技术收益：**
- ✅ **风险降低：** 避免单一供应商依赖风险
- ✅ **成本优化：** 根据任务选择最优性价比模型
- ✅ **性能提升：** 不同场景使用最适合的AI模型
- ✅ **用户体验：** 给用户更多选择和控制权

**业务收益：**
- ✅ **竞争优势：** 支持更多AI供应商，功能更全面
- ✅ **可扩展性：** 轻松添加新的AI供应商支持
- ✅ **稳定性：** 多重保障，服务可用性更高

---

## 5. 风险评估和应对

### 5.1 技术风险

| 风险 | 概率 | 影响 | 应对策略 |
|------|------|------|----------|
| API接口变化 | 中 | 中 | 使用稳定版本，及时更新依赖 |
| 供应商不兼容 | 低 | 中 | 充分测试，提供降级方案 |
| 性能影响 | 低 | 低 | 基准测试，代码优化 |

### 5.2 业务风险

| 风险 | 概率 | 影响 | 应对策略 |
|------|------|------|----------|
| 用户配置复杂 | 中 | 中 | 提供默认配置和预设方案 |
| 成本增加 | 低 | 低 | 智能调度，成本监控 |
| 迁移问题 | 低 | 中 | 向后兼容，平滑迁移 |

---

## 6. 实施时间线

### 阶段1：基础架构准备 (1天)
- [ ] 安装Vercel AI SDK及相关依赖
- [ ] 搭建基础的供应商抽象层
- [ ] 创建配置结构扩展

### 阶段2：核心功能改造 (2天)  
- [ ] 改造ai-service.js支持多供应商
- [ ] 实现供应商切换逻辑
- [ ] 添加错误处理和降级机制

### 阶段3：用户界面更新 (1天)
- [ ] 更新配置页面UI
- [ ] 添加供应商选择和配置界面
- [ ] 实现配置保存和加载

### 阶段4：测试和优化 (0.5天)
- [ ] 功能测试和兼容性验证
- [ ] 性能测试和优化
- [ ] 文档更新

---

## 7. 总结和建议

### 7.1 最终建议
**强烈推荐使用 Vercel AI SDK 方案**，理由如下：

1. **技术成熟度高：** 官方维护，生产级稳定性
2. **实施成本低：** 4.5天即可完成集成，风险可控  
3. **长期收益大：** 显著提升项目的技术竞争力和稳定性
4. **扩展性强：** 为后续功能迭代奠定良好基础

### 7.2 实施优先级
1. **P0 - 必须实现：** OpenAI、Gemini基础支持
2. **P1 - 重要功能：** Claude支持、降级机制
3. **P2 - 增强功能：** 成本优化、智能调度

### 7.3 后续规划
- **短期 (1个月内)：** 完成基础多供应商支持
- **中期 (3个月内)：** 添加智能调度和成本优化
- **长期 (6个月内)：** 支持更多供应商，完善监控体系

---

**文档维护：** 请在实施过程中及时更新本文档，记录实际遇到的问题和解决方案，为后续优化提供参考。

**相关文档：**
- [动态字段功能技术说明书](./动态字段功能技术说明书.md)
- [项目主要技术文档](./anki-word-assistanthrome浏览器插件开发项目文档.md)