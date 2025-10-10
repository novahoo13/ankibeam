// ai-service.js - AI服务调用的统一层

import { loadConfig, saveConfig } from "./storage.js";
import { buildIntegratedPrompt, validateAIOutput } from "./prompt-engine.js";
import {
  DEFAULT_HEALTH_CHECK,
  DEFAULT_RETRY_POLICY,
  buildRequestConfig,
  getAllProviders,
  getDefaultProviderId,
  getFallbackOrder,
  getProviderById,
} from "./providers.config.js";

const VALID_HEALTH_STATUSES = new Set(["healthy", "error", "unknown"]);

function ensureProvider(providerId) {
  const provider = getProviderById(providerId);
  if (!provider) {
    throw new Error(`未知的AI提供商: ${providerId}`);
  }
  return provider;
}

function resolveRuntime(providerConfig) {
  const runtime = providerConfig.runtime ?? {};
  return {
    retryPolicy: runtime.retryPolicy ?? DEFAULT_RETRY_POLICY,
    healthCheck: runtime.healthCheck ?? DEFAULT_HEALTH_CHECK,
  };
}

function resolveOverrideBaseUrl(providerConfig, storedUrl) {
  if (!storedUrl || typeof storedUrl !== "string") {
    return null;
  }

  const trimmed = storedUrl.trim();
  if (!trimmed) {
    return null;
  }

  const suffixMap = {
    google: "/models",
    openai: "/chat/completions",
    anthropic: "/messages",
  };

  const suffix = suffixMap[providerConfig.id];
  if (suffix && trimmed.endsWith(suffix)) {
    return trimmed.slice(0, -suffix.length);
  }

  return trimmed;
}

function cleanAIResponse(raw) {
  if (typeof raw !== "string") {
    return "";
  }

  let text = raw.trim();
  if (!text) {
    return "";
  }

  if (text.startsWith("```")) {
    const lines = text.split(/\r?\n/);
    lines.shift();
    while (lines.length && lines[lines.length - 1].trim() === "```") {
      lines.pop();
    }
    text = lines.join("\n").trim();
  }

  return text;
}

function parseJsonResponse(raw) {
  if (!raw || typeof raw !== "string") {
    throw new Error("AI响应内容为空");
  }

  try {
    return JSON.parse(raw);
  } catch (error) {
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) {
      return JSON.parse(match[0]);
    }
    throw new Error("无法解析AI返回的结果为JSON格式");
  }
}

function computeRetryDelay(policy, attemptIndex) {
  if (!policy) {
    return 0;
  }
  const base = Math.max(0, Number(policy.baseDelayMs) || 0);
  if (base === 0) {
    return 0;
  }
  const factor = Number(policy.backoffFactor) || 1;
  return Math.round(base * Math.pow(factor, Math.max(0, attemptIndex - 1)));
}

function defaultSleep(delayMs) {
  if (!delayMs || delayMs <= 0) {
    return Promise.resolve();
  }
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

async function executeConfiguredRequest(context) {
  const {
    providerConfig,
    apiKey,
    modelName,
    prompt,
    options = {},
    overrideBaseUrl = null,
  } = context;

  const requestContext = {
    apiKey,
    modelName,
    prompt,
    options,
    provider: providerConfig,
    overrideBaseUrl,
  };

  let response;
  const { url, init, responseParser, errorParser } = buildRequestConfig(
    providerConfig,
    requestContext,
  );

  try {
    response = await fetch(url, init);
  } catch (error) {
    throw new Error(`${providerConfig.label} 请求失败: ${error.message}`);
  }

  let bodyText = "";
  try {
    bodyText = await response.text();
  } catch (error) {
    bodyText = "";
  }

  let parsedBody = null;
  if (bodyText) {
    try {
      parsedBody = JSON.parse(bodyText);
    } catch (error) {
      if (response.ok) {
        throw new Error(`${providerConfig.label} 响应解析失败: ${error.message}`);
      }
    }
  }

  if (!response.ok) {
    let message = `${response.status} ${response.statusText}`.trim();

    if (typeof errorParser === "function") {
      try {
        const parsedMessage = errorParser({
          response,
          data: parsedBody,
          provider: providerConfig,
          requestContext,
        });
        if (parsedMessage) {
          message = parsedMessage;
        }
      } catch {
        // 即使 errorParser 失败也使用默认消息
      }
    } else if (parsedBody?.error?.message) {
      message = parsedBody.error.message;
    }

    throw new Error(`${providerConfig.label} 请求失败: ${message}`);
  }

  let content = bodyText;
  if (typeof responseParser === "function") {
    content = responseParser({
      data: parsedBody,
      provider: providerConfig,
      prompt,
      options,
      modelName,
      responseBody: bodyText,
    });
  }

  if (!content || typeof content !== "string" || !content.trim()) {
    throw new Error(`${providerConfig.label} 响应内容为空`);
  }

  return cleanAIResponse(content);
}

async function callOpenAICompatible(context) {
  return executeConfiguredRequest(context);
}

async function callGoogleGenerative(context) {
  return executeConfiguredRequest(context);
}

async function callAnthropicMessages(context) {
  return executeConfiguredRequest(context);
}

const EXECUTOR_REGISTRY = new Map([
  ["openai-compatible", callOpenAICompatible],
  ["google-generative", callGoogleGenerative],
  ["anthropic-messages", callAnthropicMessages],
]);

async function invokeExecutor(context) {
  const compatMode =
    context?.providerConfig?.compatMode ?? "openai-compatible";
  const executor = EXECUTOR_REGISTRY.get(compatMode) ?? callOpenAICompatible;
  return executor(context);
}

async function updateProviderHealth(providerId, status, errorMessage = "") {
  const config = await loadConfig();
  const models = config?.aiConfig?.models;
  if (!models?.[providerId]) {
    return;
  }

  const normalized = VALID_HEALTH_STATUSES.has(status) ? status : "unknown";
  models[providerId] = {
    ...models[providerId],
    healthStatus: normalized,
    lastHealthCheck: new Date().toISOString(),
    lastErrorMessage: normalized === "error" ? errorMessage ?? "" : "",
  };

  await saveConfig(config);
}

async function loadActiveProviderState(requestedProviderId = null) {
  const config = await loadConfig();
  const activeProviderId =
    requestedProviderId ??
    config?.aiConfig?.provider ??
    getDefaultProviderId();
  const providerConfig = ensureProvider(activeProviderId);

  const models = config?.aiConfig?.models ?? {};
  const modelState = models[activeProviderId];

  if (!modelState) {
    throw new Error(`未找到供应商配置: ${activeProviderId}`);
  }

  if (!modelState.apiKey) {
    throw new Error(`供应商 ${activeProviderId} 的 API Key 尚未设置`);
  }

  const modelName =
    modelState.modelName ||
    providerConfig.defaultModel ||
    providerConfig.testModel;

  if (!modelName) {
    throw new Error(`供应商 ${activeProviderId} 缺少默认模型配置`);
  }

  return {
    config,
    providerId: activeProviderId,
    providerConfig,
    modelState,
    apiKey: modelState.apiKey,
    modelName,
  };
}

function buildFallbackSequence(config) {
  const sequence = [];
  const add = (id) => {
    if (id && !sequence.includes(id)) {
      sequence.push(id);
    }
  };

  add(config?.aiConfig?.provider ?? getDefaultProviderId());

  const storedFallback = Array.isArray(config?.aiConfig?.fallbackOrder)
    ? config.aiConfig.fallbackOrder
    : [];
  storedFallback.forEach(add);

  getFallbackOrder().forEach(add);

  return sequence;
}

async function runWithRetry(
  context,
  retryPolicy,
  sleepFn = defaultSleep,
) {
  const attempts = Math.max(1, retryPolicy?.maxAttempts ?? 1);
  let lastError = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await invokeExecutor(context);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt < attempts) {
        const delay = computeRetryDelay(retryPolicy, attempt);
        await sleepFn(delay);
      }
    }
  }

  throw lastError ?? new Error("AI服务请求失败");
}

export async function callProviderAPI(
  providerId,
  apiKey,
  modelName,
  prompt,
  options = {},
) {
  const providerConfig = ensureProvider(providerId);
  if (!apiKey) {
    throw new Error(`供应商 ${providerId} 的 API Key 尚未设置`);
  }

  const config = await loadConfig();
  const modelState = config?.aiConfig?.models?.[providerId] ?? {};

  const effectiveModelName =
    modelName ||
    modelState.modelName ||
    providerConfig.defaultModel ||
    providerConfig.testModel;

  if (!effectiveModelName) {
    throw new Error(`供应商 ${providerId} 缺少默认模型配置`);
  }

  const executionContext = {
    providerConfig,
    apiKey,
    modelName: effectiveModelName,
    prompt,
    options: options ?? {},
    overrideBaseUrl: resolveOverrideBaseUrl(
      providerConfig,
      modelState.apiUrl,
    ),
  };

  return invokeExecutor(executionContext);
}

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
    if (template.includes("{{INPUT_TEXT}}")) {
      return template.replace("{{INPUT_TEXT}}", inputText);
    }

    console.warn(
      "自定义Prompt中不存在 {{INPUT_TEXT}} 占位符，因此已将输入文本追加到末尾。",
    );
    return `${template}\n\n${inputText}`;
  }

  return defaultPromptTemplate;
}

export async function parseTextWithFallback(
  inputText,
  promptTemplate,
  runtimeOverrides = {},
) {
  const config = await loadConfig();
  const prompt = buildPrompt(inputText, promptTemplate);
  const sequence = buildFallbackSequence(config);
  const errors = [];

  for (const providerId of sequence) {
    let providerConfig;
    try {
      providerConfig = ensureProvider(providerId);
    } catch (error) {
      errors.push(error instanceof Error ? error : new Error(String(error)));
      continue;
    }

    const modelState = config?.aiConfig?.models?.[providerId];
    if (!modelState?.apiKey) {
      errors.push(new Error(`供应商 ${providerId} 的 API Key 尚未设置`));
      continue;
    }

    const modelName =
      modelState.modelName ||
      providerConfig.defaultModel ||
      providerConfig.testModel;

    if (!modelName) {
      errors.push(new Error(`供应商 ${providerId} 缺少默认模型配置`));
      continue;
    }

    const runtime = resolveRuntime(providerConfig);
    const executionContext = {
      providerConfig,
      apiKey: modelState.apiKey,
      modelName,
      prompt,
      options: {
        temperature:
          runtimeOverrides.temperature ?? 0.3,
        maxTokens: runtimeOverrides.maxTokens ?? 2000,
        ...(runtimeOverrides.requestOptions ?? {}),
      },
      overrideBaseUrl: resolveOverrideBaseUrl(
        providerConfig,
        modelState.apiUrl,
      ),
    };

    try {
      const text = await runWithRetry(
        executionContext,
        runtime.retryPolicy,
        runtimeOverrides.sleep ?? defaultSleep,
      );
      await updateProviderHealth(providerId, "healthy");
      return parseJsonResponse(text);
    } catch (error) {
      await updateProviderHealth(
        providerId,
        "error",
        error instanceof Error ? error.message : String(error),
      );
      errors.push(error instanceof Error ? error : new Error(String(error)));
    }
  }

  if (errors.length > 0) {
    throw new Error(`AI服务请求失败: ${errors[errors.length - 1].message}`);
  }

  throw new Error("AI服务请求失败: 未找到可用的供应商");
}

export function getProvidersInfo() {
  return getAllProviders().reduce((result, provider) => {
    result[provider.id] = provider;
    return result;
  }, {});
}

export async function testConnection(providerId, apiKey, modelName) {
  let providerConfig;
  try {
    providerConfig = ensureProvider(providerId);
  } catch (error) {
    return {
      success: false,
      message: `连接测试失败: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  if (!apiKey) {
    return {
      success: false,
      message: "连接测试失败: API Key尚未设置",
    };
  }

  try {
    const config = await loadConfig();
    const modelState = config?.aiConfig?.models?.[providerId] ?? {};
    const runtime = resolveRuntime(providerConfig);

    const targetModel =
      modelName ||
      modelState.modelName ||
      providerConfig.testModel ||
      providerConfig.defaultModel;

    if (!targetModel) {
      throw new Error(`${providerConfig.label} 缺少默认模型配置`);
    }

    const executionContext = {
      providerConfig,
      apiKey,
      modelName: targetModel,
      prompt: runtime.healthCheck?.prompt ?? DEFAULT_HEALTH_CHECK.prompt,
      options: {
        ...(runtime.healthCheck?.options ?? DEFAULT_HEALTH_CHECK.options),
      },
      overrideBaseUrl: resolveOverrideBaseUrl(
        providerConfig,
        modelState.apiUrl,
      ),
    };

    await runWithRetry(executionContext, runtime.retryPolicy);
    await updateProviderHealth(providerId, "healthy");

    return {
      success: true,
      message: `${providerConfig.label} 连接测试成功`,
    };
  } catch (error) {
    await updateProviderHealth(
      providerId,
      "error",
      error instanceof Error ? error.message : String(error),
    );

    return {
      success: false,
      message: `连接测试失败: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

async function runDynamicParsing(
  inputText,
  fieldNames,
  customTemplate,
  maxRetries = 2,
) {
  if (!Array.isArray(fieldNames) || fieldNames.length === 0) {
    throw new Error("当前模板未配置可解析的字段，请在选项页完成设置。");
  }

  const {
    providerConfig,
    modelState,
    apiKey,
    modelName,
  } = await loadActiveProviderState();
  const runtime = resolveRuntime(providerConfig);

  const attemptLimit = Math.max(
    Math.max(0, maxRetries) + 1,
    runtime.retryPolicy?.maxAttempts ?? 1,
  );

  const prompt = buildIntegratedPrompt(inputText, fieldNames, customTemplate);
  const overrideBaseUrl = resolveOverrideBaseUrl(
    providerConfig,
    modelState.apiUrl,
  );

  let lastError = null;

  for (let attempt = 1; attempt <= attemptLimit; attempt += 1) {
    try {
      const temperature =
        attempt === 1 ? 0.3 : Math.max(0.1, 0.3 - 0.1 * (attempt - 1));

      const text = await invokeExecutor({
        providerConfig,
        apiKey,
        modelName,
        prompt,
        options: {
          temperature,
          maxTokens: 2000,
        },
        overrideBaseUrl,
      });

      const validation = validateAIOutput(text, fieldNames);

      if (!validation.isValid) {
        const message =
          validation.error ??
          `输出包含无效字段: ${(validation.invalidFields ?? []).join(", ")}`;
        throw new Error(message);
      }

      if (!validation.hasContent) {
        throw new Error("AI输出的所有字段都为空，请检查输入内容或重试");
      }

      await updateProviderHealth(providerConfig.id, "healthy");
      return validation.parsedData;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt < attemptLimit) {
        const delay = computeRetryDelay(runtime.retryPolicy, attempt);
        await defaultSleep(delay);
        continue;
      }

      await updateProviderHealth(
        providerConfig.id,
        "error",
        lastError.message,
      );

      throw new Error(`AI解析失败: ${lastError.message}`);
    }
  }

  throw new Error("AI解析失败: 未知错误");
}

export async function parseTextWithDynamicFields(
  inputText,
  fieldNames,
  customTemplate,
  maxRetries = 2,
) {
  return runDynamicParsing(inputText, fieldNames, customTemplate, maxRetries);
}

export async function parseTextWithDynamicFieldsFallback(
  inputText,
  fieldNames,
  customTemplate,
  maxRetries = 2,
) {
  return runDynamicParsing(inputText, fieldNames, customTemplate, maxRetries);
}

export async function parseTextLegacy(inputText, promptTemplate) {
  return parseTextWithFallback(inputText, promptTemplate);
}
