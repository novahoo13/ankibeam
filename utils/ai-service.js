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
import { translate, createI18nError } from "./i18n.js";

const getText = (key, fallback, substitutions) =>
  translate(key, { fallback, substitutions });

const VALID_HEALTH_STATUSES = new Set(["healthy", "error", "unknown"]);

function ensureProvider(providerId) {
  const provider = getProviderById(providerId);
  if (!provider) {
    throw createI18nError("ai_service_error_unknown_provider", { fallback: `Unknown AI provider: ${providerId}`, substitutions: [providerId] });
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
    throw createI18nError("ai_service_error_empty_response", { fallback: "AI response body is empty" });
  }

  try {
    return JSON.parse(raw);
  } catch (error) {
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) {
      return JSON.parse(match[0]);
    }
    throw createI18nError("ai_service_error_parse_json", { fallback: "Failed to parse AI response as JSON" });
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
    throw createI18nError("ai_service_error_request_failed", { fallback: `${providerConfig.label} request failed: ${error.message}`, substitutions: [providerConfig.label, error.message] });
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
        throw createI18nError("ai_service_error_parse_failed", { fallback: `${providerConfig.label} response parsing failed: ${error.message}`, substitutions: [providerConfig.label, error.message] });
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

    throw createI18nError("ai_service_error_request_failed", { fallback: `${providerConfig.label} request failed: ${message}`, substitutions: [providerConfig.label, message] });
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
    throw createI18nError("ai_service_error_empty_body", { fallback: `${providerConfig.label} response body is empty`, substitutions: [providerConfig.label] });
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
    throw createI18nError("ai_service_error_missing_provider_config", { fallback: `Provider configuration not found: ${activeProviderId}`, substitutions: [activeProviderId] });
  }

  if (!modelState.apiKey) {
    throw createI18nError("ai_service_error_missing_api_key_active", {
      fallback: `Provider ${activeProviderId} API key is not configured`,
      substitutions: [activeProviderId],
    });
  }

  const modelName =
    modelState.modelName ||
    providerConfig.defaultModel ||
    providerConfig.testModel;

  if (!modelName) {
    throw createI18nError("ai_service_error_missing_default_model_active", {
      fallback: `Provider ${activeProviderId} is missing a default model configuration`,
      substitutions: [activeProviderId],
    });
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

  if (lastError) {
    throw lastError;
  }
  throw createI18nError("ai_service_error_request_generic", {
    fallback: "AI request failed",
  });
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
    throw createI18nError("ai_service_error_missing_api_key", {
      fallback: `Provider ${providerId} API key is not configured`,
      substitutions: [providerId],
    });
  }

  const config = await loadConfig();
  const modelState = config?.aiConfig?.models?.[providerId] ?? {};

  const effectiveModelName =
    modelName ||
    modelState.modelName ||
    providerConfig.defaultModel ||
    providerConfig.testModel;

  if (!effectiveModelName) {
    throw createI18nError("ai_service_error_missing_default_model", {
      fallback: `Provider ${providerId} is missing a default model configuration`,
      substitutions: [providerId],
    });
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
  const defaultPromptTemplate = getText(
    "ai_service_prompt_classic",
    `Convert the following dictionary lookup result into structured data for an Anki card.
Return a pure JSON object that only includes the "front" and "back" fields. Do not add extra commentary or code fences.
JSON example:
{
  "front": "Word",
  "back": "Complete lookup result with original formatting"
}

Source text:
---
$INPUT$
---
`,
    [inputText]
  );

  if (template && template.trim().length > 0) {
    if (template.includes("{{INPUT_TEXT}}")) {
      return template.replace("{{INPUT_TEXT}}", inputText);
    }

    console.warn(
      getText(
        "ai_service_warn_missing_input_placeholder",
        "Custom prompt is missing the {{INPUT_TEXT}} placeholder. Appended the input text to the end."
      )
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
      errors.push(
        createI18nError('ai_service_error_missing_api_key', {
          fallback: `Provider ${providerId} API key is not configured`,
          substitutions: [providerId],
        }),
      );
      continue;
    }

    const modelName =
      modelState.modelName ||
      providerConfig.defaultModel ||
      providerConfig.testModel;

    if (!modelName) {
      errors.push(
        createI18nError('ai_service_error_missing_default_model', {
          fallback: `Provider ${providerId} is missing a default model configuration`,
          substitutions: [providerId],
        }),
      );
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
    throw createI18nError("ai_service_error_request_with_message", { fallback: `AI request failed: ${errors[errors.length - 1].message}`, substitutions: [errors[errors.length - 1].message] });
  }

  throw createI18nError("ai_service_error_no_provider_available", { fallback: "AI request failed: no providers available" });
}


export async function testConnection(providerId, apiKey, modelName) {
  let providerConfig;
  try {
    providerConfig = ensureProvider(providerId);
  } catch (error) {
    return {
      success: false,
      message: getText(
        'ai_service_connection_test_failed_with_reason',
        `Connection test failed: ${error instanceof Error ? error.message : String(error)}`,
        [error instanceof Error ? error.message : String(error)],
      ),
    };
  }

  if (!apiKey) {
    return {
      success: false,
      message: getText(
        'ai_service_connection_test_failed_missing_key',
        'Connection test failed: API key is not configured',
      ),
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
      throw createI18nError("ai_service_error_missing_default_model", {
        fallback: `${providerConfig.label} is missing a default model configuration`,
        substitutions: [providerConfig.label],
      });
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
      message: getText(
        'ai_service_connection_test_success',
        `${providerConfig.label} connection test succeeded`,
        [providerConfig.label],
      ),
    };
  } catch (error) {
    await updateProviderHealth(
      providerId,
      "error",
      error instanceof Error ? error.message : String(error),
    );

    return {
      success: false,
      message: getText(
        'ai_service_connection_test_failed_with_reason',
        `Connection test failed: ${error instanceof Error ? error.message : String(error)}`,
        [error instanceof Error ? error.message : String(error)],
      ),
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
    throw createI18nError("popup_status_no_fields_parse", { fallback: "No fields configured for parsing. Update the template in Options first." });
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
        const fallbackDetail = (validation.invalidFields ?? []).join(", ");
        const message =
          validation.error ||
          getText(
            "ai_service_error_output_invalid_fields",
            `Output contains invalid fields: ${fallbackDetail}`,
            [fallbackDetail]
          );
        throw createI18nError("ai_service_error_output_invalid_fields", {
          fallback: message,
          substitutions: [fallbackDetail],
        });
      }

      if (!validation.hasContent) {
        throw createI18nError("ai_service_error_output_all_empty", {
          fallback: "AI output contains only empty fields. Check the input text or try again.",
        });
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

      throw createI18nError("ai_service_error_parse_fail_message", { fallback: `AI parsing failed: ${lastError.message}`, substitutions: [lastError.message] });
    }
  }

  throw createI18nError("ai_service_error_parse_fail_unknown", { fallback: "AI parsing failed: Unknown error" });
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

