// ai-service.js - AI 服务统一接口
// 支持多AI供应商：Google (Gemini), OpenAI (GPT), Anthropic (Claude)
// 使用原生 fetch API 实现

import { loadConfig, saveConfig } from './storage.js';
import { buildIntegratedPrompt, validateAIOutput } from './prompt-engine.js';

// AI 供应商配置
const PROVIDERS = {
  google: {
    defaultModel: 'gemini-2.5-flash-lite',
    supportedModels: ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.5-flash-lite'],
    testModel: 'gemini-2.5-flash-lite',
    apiUrl: 'https://generativelanguage.googleapis.com/v1beta/models',
    name: 'Google Gemini'
  },
  openai: {
    defaultModel: 'gpt-4o',
    supportedModels: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-5'],
    testModel: 'gpt-4o-mini',
    apiUrl: 'https://api.openai.com/v1/chat/completions',
    name: 'OpenAI GPT'
  },
  anthropic: {
    defaultModel: 'claude-3-7-sonnet-all',
    supportedModels: ['claude-3-7-sonnet-all', 'claude-sonnet-4-all', 'claude-opus-4-all'],
    testModel: 'claude-3-7-sonnet-all',
    apiUrl: 'https://api.anthropic.com/v1/messages',
    name: 'Anthropic Claude'
  }
};

/**
 * 清理AI响应文本，移除markdown代码块格式
 * @param {string} responseText - AI返回的原始文本
 * @returns {string} - 清理后的JSON文本
 */
function cleanAIResponse(responseText) {
  if (!responseText || typeof responseText !== 'string') {
    return responseText;
  }

  let cleanText = responseText.trim();

  // 尝试移除markdown代码块（支持多种格式）
  const codeBlockPatterns = [
    /```(?:json)?\s*([\s\S]*?)\s*```/g,  // ```json ... ``` 或 ``` ... ```
    /`([\s\S]*?)`/g,                     // 单个反引号
  ];

  for (const pattern of codeBlockPatterns) {
    const match = cleanText.match(pattern);
    if (match) {
      // 提取代码块内容
      cleanText = cleanText.replace(pattern, '$1').trim();
      break;
    }
  }

  // 如果还没有找到JSON，尝试提取大括号内容
  if (!cleanText.startsWith('{') && !cleanText.startsWith('[')) {
    const jsonMatch = cleanText.match(/(\{[\s\S]*\})/);
    if (jsonMatch) {
      cleanText = jsonMatch[1];
    }
  }

  return cleanText.trim();
}

/**
 * 调用Google Gemini API
 * @param {string} apiKey - API Key
 * @param {string} modelName - 模型名称
 * @param {string} prompt - 提示词
 * @param {object} options - 可选参数
 * @returns {Promise<string>} - AI响应文本
 */
async function callGoogleAPI(apiKey, modelName, prompt, options = {}) {
  // 使用配置中的API URL，如果没有则使用默认值
  const config = await loadConfig();
  const providerConfig = config?.aiConfig?.models?.google || {};
  const baseUrl = providerConfig.apiUrl || PROVIDERS.google.apiUrl;
  const url = `${baseUrl}/${modelName}:generateContent`;
  
  const requestBody = {
    contents: [{
      parts: [{
        text: prompt
      }]
    }],
    generationConfig: {
      temperature: options.temperature || 0.3,
      maxOutputTokens: options.maxTokens || 2000,
      topP: 0.8,
      topK: 10
    }
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey
    },
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(`Google API请求失败: ${response.status} ${response.statusText}. ${errorData.error?.message || ''}`);
  }

  const data = await response.json();

  if (data.candidates && data.candidates[0] && data.candidates[0].content) {
    const rawText = data.candidates[0].content.parts[0].text;
    return cleanAIResponse(rawText);
  }

  throw new Error('Google API返回格式异常');
}

/**
 * 调用OpenAI API
 * @param {string} apiKey - API Key
 * @param {string} modelName - 模型名称
 * @param {string} prompt - 提示词
 * @param {object} options - 可选参数
 * @returns {Promise<string>} - AI响应文本
 */
async function callOpenAIAPI(apiKey, modelName, prompt, options = {}) {
  // 使用配置中的API URL，如果没有则使用默认值
  const config = await loadConfig();
  const providerConfig = config?.aiConfig?.models?.openai || {};
  const apiUrl = providerConfig.apiUrl || PROVIDERS.openai.apiUrl;
  
  const requestBody = {
    model: modelName,
    messages: [{
      role: 'user',
      content: prompt
    }],
    temperature: options.temperature || 0.3,
    max_tokens: options.maxTokens || 2000
  };

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(`OpenAI API请求失败: ${response.status} ${response.statusText}. ${errorData.error?.message || ''}`);
  }

  const data = await response.json();

  if (data.choices && data.choices[0] && data.choices[0].message) {
    const rawText = data.choices[0].message.content;
    return cleanAIResponse(rawText);
  }

  throw new Error('OpenAI API返回格式异常');
}

/**
 * 调用Anthropic API
 * @param {string} apiKey - API Key
 * @param {string} modelName - 模型名称
 * @param {string} prompt - 提示词
 * @param {object} options - 可选参数
 * @returns {Promise<string>} - AI响应文本
 */
async function callAnthropicAPI(apiKey, modelName, prompt, options = {}) {
  // 使用配置中的API URL，如果没有则使用默认值
  const config = await loadConfig();
  const providerConfig = config?.aiConfig?.models?.anthropic || {};
  const apiUrl = providerConfig.apiUrl || PROVIDERS.anthropic.apiUrl;
  
  const requestBody = {
    model: modelName,
    max_tokens: options.maxTokens || 2000,
    messages: [{
      role: 'user',
      content: prompt
    }],
    temperature: options.temperature || 0.3
  };

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(`Anthropic API请求失败: ${response.status} ${response.statusText}. ${errorData.error?.message || ''}`);
  }

  const data = await response.json();

  if (data.content && data.content[0] && data.content[0].text) {
    const rawText = data.content[0].text;
    return cleanAIResponse(rawText);
  }

  throw new Error('Anthropic API返回格式异常');
}

/**
 * 根据供应商调用对应的API
 * @param {string} provider - 供应商名称
 * @param {string} apiKey - API Key
 * @param {string} modelName - 模型名称
 * @param {string} prompt - 提示词
 * @param {object} options - 可选参数
 * @returns {Promise<string>} - AI响应文本
 */
async function callProviderAPI(provider, apiKey, modelName, prompt, options = {}) {
  switch (provider) {
    case 'google':
      return await callGoogleAPI(apiKey, modelName, prompt, options);
    case 'openai':
      return await callOpenAIAPI(apiKey, modelName, prompt, options);
    case 'anthropic':
      return await callAnthropicAPI(apiKey, modelName, prompt, options);
    default:
      throw new Error(`不支持的AI供应商: ${provider}`);
  }
}

/**
 * 获取当前配置的AI模型信息
 * @param {string} overrideProvider - 可选的供应商覆盖
 * @returns {Promise<{provider: string, apiKey: string, modelName: string}>}
 */
async function getCurrentModel(overrideProvider = null) {
  const config = await loadConfig();
  const provider = overrideProvider || config.aiConfig.provider;
  const providerConfig = config.aiConfig.models[provider];

  if (!providerConfig) {
    throw new Error(`未找到 ${provider} 的配置`);
  }

  if (!providerConfig.apiKey) {
    throw new Error(`未配置 ${provider} 的 API Key`);
  }

  const providerInfo = PROVIDERS[provider];
  const modelName = providerConfig.modelName || providerInfo.defaultModel;

  return { 
    provider, 
    apiKey: providerConfig.apiKey, 
    modelName 
  };
}

/**
 * 更新供应商健康状态
 * @param {string} provider - 供应商名称
 * @param {string} status - 健康状态：'healthy', 'error', 'unknown'
 * @param {string} error - 可选的错误信息
 */
async function updateProviderHealth(provider, status, error = null) {
  try {
    const config = await loadConfig();
    if (config.aiConfig.models[provider]) {
      config.aiConfig.models[provider].healthStatus = status;
      config.aiConfig.models[provider].lastError = error;
      config.aiConfig.models[provider].lastCheck = new Date().toISOString();
      await saveConfig(config);
    }
  } catch (err) {
    console.warn('更新供应商健康状态失败:', err);
  }
}

/**
 * 使用 AI 服务解析文本
 * @param {string} inputText - 用户输入的原始文本
 * @param {string} promptTemplate - 用于指导 AI 的 Prompt 模板
 * @returns {Promise<{front: string, back: string}>} - 解析后的结构化数据
 */
export async function parseText(inputText, promptTemplate) {
  try {
    const { provider, apiKey, modelName } = await getCurrentModel();
    const fullPrompt = buildPrompt(inputText, promptTemplate);

    console.log(`使用 ${provider} (${modelName}) 解析文本`);

    const responseText = await callProviderAPI(provider, apiKey, modelName, fullPrompt, {
      temperature: 0.3,
      maxTokens: 2000
    });

    // 更新供应商健康状态
    await updateProviderHealth(provider, 'healthy');

    // 解析返回的JSON
    try {
      const parsedResult = JSON.parse(responseText);
      return parsedResult;
    } catch (parseError) {
      console.warn('JSON解析失败，尝试提取结构化内容:', parseError);
      // 使用统一的清理函数再次尝试
      const cleanedText = cleanAIResponse(responseText);
      try {
        return JSON.parse(cleanedText);
      } catch (secondError) {
        throw new Error('无法解析AI返回的结果为JSON格式');
      }
    }

  } catch (error) {
    console.error('AI解析失败:', error);
    
    // 更新供应商健康状态
    const config = await loadConfig();
    await updateProviderHealth(config.aiConfig.provider, 'error', error.message);
    
    throw new Error(`AI服务请求失败: ${error.message}`);
  }
}

/**
 * 测试 AI 服务连接
 * @param {string} provider - 供应商名称 ('google', 'openai', 'anthropic')
 * @param {string} apiKey - API Key
 * @param {string} modelName - 用于测试的模型名称（可选）
 * @returns {Promise<{success: boolean, message: string}>} - 测试结果
 */
export async function testConnection(provider, apiKey, modelName) {
  try {
    if (!apiKey) {
      throw new Error('API Key不能为空');
    }

    const providerConfig = PROVIDERS[provider];
    if (!providerConfig) {
      throw new Error(`不支持的供应商: ${provider}`);
    }

    // 使用测试模型或指定模型
    const testModel = modelName || providerConfig.testModel;

    // 发送简单的测试请求
    const responseText = await callProviderAPI(provider, apiKey, testModel, '测试连接，请回复"连接成功"', {
      maxTokens: 10,
      temperature: 0
    });

    // 更新供应商健康状态
    await updateProviderHealth(provider, 'healthy');

    return {
      success: true,
      message: `${providerConfig.name} 连接测试成功`
    };

  } catch (error) {
    console.error(`${provider} 连接测试失败:`, error);
    
    // 更新供应商健康状态
    await updateProviderHealth(provider, 'error', error.message);

    return {
      success: false,
      message: `连接测试失败: ${error.message}`
    };
  }
}

/**
 * 构建完整的 Prompt
 * @param {string} inputText - 用户输入的文本
 * @param {string} template - Prompt 模板
 * @returns {string} - 结合了模板和输入文本的完整 Prompt
 */
export function buildPrompt(inputText, template) {
  const defaultPromptTemplate = `
请将以下单词查询结果解析为结构化数据。
你的输出必须是一个纯粹的JSON对象，不要包含任何解释性文字或代码块标记。
JSON格式如下:
{
  "front": "单词",
  "back": "完整的单词查询结果（保留原始换行格式）"
}

待解析的文本如下：
---
${inputText}
---
`;

  if (template && template.trim().length > 0) {
    // 如果用户提供了自定义模板，则使用它
    // 确保模板中包含 {{INPUT_TEXT}} 占位符
    if (template.includes('{{INPUT_TEXT}}')) {
        return template.replace('{{INPUT_TEXT}}', inputText);
    } else {
        // 如果模板没有占位符，则将输入文本附加到末尾，以提供一些灵活性
        console.warn('自定义Prompt中缺少 {{INPUT_TEXT}} 占位符，已将输入文本附加到末尾。');
        return `${template}\n\n${inputText}`;
    }
  }
  
  // 否则，使用默认模板
  return defaultPromptTemplate;
}

/**
 * 使用当前选择的供应商解析文本（简化版，不进行轮询）
 * @param {string} inputText - 用户输入的原始文本
 * @param {string} promptTemplate - 用于指导 AI 的 Prompt 模板
 * @returns {Promise<{front: string, back: string}>} - 解析后的结构化数据
 */
export async function parseTextWithFallback(inputText, promptTemplate) {
  try {
    const { provider, apiKey, modelName } = await getCurrentModel();
    const fullPrompt = buildPrompt(inputText, promptTemplate);

    console.log(`使用 ${provider} (${modelName}) 解析文本`);

    const responseText = await callProviderAPI(provider, apiKey, modelName, fullPrompt, {
      temperature: 0.3,
      maxTokens: 2000
    });

    // 更新供应商健康状态
    await updateProviderHealth(provider, 'healthy');

    // 解析返回的JSON
    try {
      return JSON.parse(responseText);
    } catch (parseError) {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      throw new Error('无法解析AI返回的结果为JSON格式');
    }

  } catch (error) {
    console.error('AI解析失败:', error);

    // 更新供应商健康状态
    const config = await loadConfig();
    await updateProviderHealth(config.aiConfig.provider, 'error', error.message);

    throw new Error(`AI服务请求失败: ${error.message}`);
  }
}

/**
 * 获取所有供应商信息
 * @returns {object} - 供应商信息对象
 */
export function getProvidersInfo() {
  return PROVIDERS;
}

/**
 * 使用动态字段进行AI解析 (增强版本，包含JSON验证和重试机制)
 * @param {string} inputText - 用户输入的文本
 * @param {string[]} fieldNames - 字段名数组
 * @param {string} [customTemplate] - 自定义prompt模板
 * @param {number} [maxRetries=2] - 最大重试次数
 * @returns {Promise<object>} - 解析后的动态字段对象
 */
export async function parseTextWithDynamicFields(inputText, fieldNames, customTemplate, maxRetries = 2) {
  const { provider, apiKey, modelName } = await getCurrentModel();
  const integratedPrompt = buildIntegratedPrompt(inputText, fieldNames, customTemplate);

  let retryCount = 0;
  let lastError = null;

  while (retryCount <= maxRetries) {
    try {
      const retryPrefix = retryCount > 0 ? `[重试${retryCount}/${maxRetries}] ` : '';
      console.log(`${retryPrefix}使用 ${provider} (${modelName}) 进行一体化解析`);

      // 根据重试次数调整temperature
      const temperature = retryCount === 0 ? 0.3 : Math.max(0.1, 0.3 - retryCount * 0.1);

      const responseText = await callProviderAPI(provider, apiKey, modelName, integratedPrompt, {
        temperature: temperature,
        maxTokens: 2000
      });

      // 验证AI输出
      const validation = validateAIOutput(responseText, fieldNames);

      if (!validation.isValid) {
        const errorMsg = validation.error || `输出包含无效字段: ${validation.invalidFields?.join(', ')}`;

        // 如果是JSON解析错误且还有重试机会，继续重试
        if (validation.error && validation.error.includes('JSON解析失败') && retryCount < maxRetries) {
          console.warn(`JSON解析失败，降低temperature重试: ${errorMsg}`);
          throw new Error(errorMsg);
        }

        // 否则直接抛出错误
        throw new Error(errorMsg);
      }

      if (!validation.hasContent) {
        const errorMsg = 'AI输出的所有字段都为空，请检查输入内容或重试';

        // 空内容错误可以重试
        if (retryCount < maxRetries) {
          console.warn('输出为空，重试...');
          throw new Error(errorMsg);
        }

        throw new Error(errorMsg);
      }

      // 成功解析
      await updateProviderHealth(provider, 'healthy');

      if (retryCount > 0) {
        console.log(`经过 ${retryCount} 次重试后成功解析`);
      }

      return validation.parsedData;

    } catch (error) {
      lastError = error;
      retryCount++;

      if (retryCount <= maxRetries) {
        // 等待递增延迟后重试
        const delay = 1000 * retryCount;
        console.warn(`解析失败，${delay}ms后重试 (${retryCount}/${maxRetries}): ${error.message}`);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        // 超过重试次数，更新健康状态并抛出错误
        await updateProviderHealth(provider, 'error', error.message);
        throw new Error(`AI解析失败: ${lastError.message}`);
      }
    }
  }
}

/**
 * 使用当前选择的供应商进行动态字段解析（简化版，不进行轮询）
 * @param {string} inputText - 用户输入的文本
 * @param {string[]} fieldNames - 字段名数组
 * @param {string} [customTemplate] - 自定义prompt模板
 * @param {number} [maxRetries=2] - 最大重试次数
 * @returns {Promise<object>} - 解析后的动态字段对象
 */
export async function parseTextWithDynamicFieldsFallback(inputText, fieldNames, customTemplate, maxRetries = 2) {
  const { provider, apiKey, modelName } = await getCurrentModel();
  const integratedPrompt = buildIntegratedPrompt(inputText, fieldNames, customTemplate);

  let retryCount = 0;
  let lastError = null;

  while (retryCount <= maxRetries) {
    try {
      const retryPrefix = retryCount > 0 ? `[重试${retryCount}/${maxRetries}] ` : '';
      console.log(`${retryPrefix}使用 ${provider} (${modelName}) 进行动态字段解析`);

      // 根据重试次数调整temperature
      const temperature = retryCount === 0 ? 0.3 : Math.max(0.1, 0.3 - retryCount * 0.1);

      const responseText = await callProviderAPI(provider, apiKey, modelName, integratedPrompt, {
        temperature: temperature,
        maxTokens: 2000
      });

      // 验证AI输出
      const validation = validateAIOutput(responseText, fieldNames);

      if (!validation.isValid) {
        const errorMsg = validation.error || `输出包含无效字段: ${validation.invalidFields?.join(', ')}`;

        // 如果是JSON解析错误且还有重试机会，继续重试
        if (validation.error && validation.error.includes('JSON解析失败') && retryCount < maxRetries) {
          console.warn(`JSON解析失败，降低temperature重试: ${errorMsg}`);
          throw new Error(errorMsg);
        }

        // 否则直接抛出错误
        throw new Error(errorMsg);
      }

      if (!validation.hasContent) {
        const errorMsg = 'AI输出的所有字段都为空，请检查输入内容或重试';

        // 空内容错误可以重试
        if (retryCount < maxRetries) {
          console.warn('输出为空，重试...');
          throw new Error(errorMsg);
        }

        throw new Error(errorMsg);
      }

      // 成功解析
      await updateProviderHealth(provider, 'healthy');

      if (retryCount > 0) {
        console.log(`经过 ${retryCount} 次重试后成功解析`);
      }

      return validation.parsedData;

    } catch (error) {
      lastError = error;
      retryCount++;

      if (retryCount <= maxRetries) {
        // 等待递增延迟后重试
        const delay = 1000 * retryCount;
        console.warn(`解析失败，${delay}ms后重试 (${retryCount}/${maxRetries}): ${error.message}`);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        // 超过重试次数，更新健康状态并抛出错误
        await updateProviderHealth(provider, 'error', error.message);
        throw new Error(`AI解析失败: ${lastError.message}`);
      }
    }
  }
}

/**
 * 保持向后兼容的legacy解析函数（原parseText函数的重命名版本）
 */
export async function parseTextLegacy(inputText, promptTemplate) {
  return await parseText(inputText, promptTemplate);
}