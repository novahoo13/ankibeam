/**
 * @fileoverview ai-service.js - AI服务调用的统一抽象层。
 *
 * 该文件提供了一个与多种AI服务（如OpenAI, Google, Anthropic）交互的统一接口。
 * 它负责处理服务商配置、API密钥管理、请求构建、响应解析、重试逻辑和备用服务切换。
 * 主要功能包括：
 * - 调用AI服务API进行文本解析。
 * - 支持服务商健康检查和状态更新。
 * - 实现带重试和备用机制的稳定请求。
 * - 根据用户配置动态构建提示（Prompt）。
 * - 验证和清理AI返回的数据。
 */

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

/**
 * 获取国际化文本。
 * @param {string} key - i18n消息键。
 * @param {string} fallback - 如果键不存在时的回退文本。
 * @param {Array<string>} [substitutions] - 用于替换占位符的字符串数组。
 * @returns {string} 国际化后的文本。
 */
const getText = (key, fallback, substitutions) =>
	translate(key, { fallback, substitutions });

/** @type {Set<string>} - 有效的提供商健康状态集合。 */
const VALID_HEALTH_STATUSES = new Set(["healthy", "error", "unknown"]);

/**
 * 确保给定的提供商ID有效并返回其配置。
 * @param {string} providerId - AI提供商的ID。
 * @returns {object} 提供商的配置对象。
 * @throws {I18nError} 如果提供商ID未知。
 */
function ensureProvider(providerId) {
	const provider = getProviderById(providerId);
	if (!provider) {
		throw createI18nError("ai_service_error_unknown_provider", {
			fallback: `未知的AI提供商: ${providerId}`,
			substitutions: [providerId],
		});
	}
	return provider;
}

/**
 * 解析并返回提供商的运行时配置（重试策略和健康检查）。
 * @param {object} providerConfig - 提供商的配置对象。
 * @returns {{retryPolicy: object, healthCheck: object}} 运行时配置。
 */
function resolveRuntime(providerConfig) {
	const runtime = providerConfig.runtime ?? {};
	return {
		retryPolicy: runtime.retryPolicy ?? DEFAULT_RETRY_POLICY,
		healthCheck: runtime.healthCheck ?? DEFAULT_HEALTH_CHECK,
	};
}

/**
 * 解析并清理用户提供的覆盖Base URL。
 * 如果URL以特定API端点后缀结尾，则移除该后缀。
 * @param {object} providerConfig - 提供商配置。
 * @param {string|null} storedUrl - 用户存储的URL。
 * @returns {string|null} 清理后的Base URL或null。
 */
function resolveOverrideBaseUrl(providerConfig, storedUrl) {
	if (!storedUrl || typeof storedUrl !== "string") {
		return null;
	}

	const trimmed = storedUrl.trim();
	if (!trimmed) {
		return null;
	}

	// API端点后缀映射
	const suffixMap = {
		google: "/models",
		openai: "/chat/completions",
		anthropic: "/messages",
	};

	const suffix = suffixMap[providerConfig.id];
	if (suffix && trimmed.endsWith(suffix)) {
		// 移除后缀，以获得纯净的Base URL
		return trimmed.slice(0, -suffix.length);
	}

	return trimmed;
}

/**
 * 清理AI返回的原始响应字符串。
 * 移除首尾的空白字符和常见的代码块标记 (```)。
 * @param {string} raw - AI返回的原始字符串。
 * @returns {string} 清理后的文本。
 */
function cleanAIResponse(raw) {
	if (typeof raw !== "string") {
		return "";
	}

	let text = raw.trim();
	if (!text) {
		return "";
	}

	// 如果响应被包裹在Markdown代码块中，则移除它们
	if (text.startsWith("```")) {
		const lines = text.split(/\r?\n/);
		lines.shift(); // 移除开头的```
		while (lines.length && lines[lines.length - 1].trim() === "```") {
			lines.pop(); // 移除结尾的```
		}
		text = lines.join("\n").trim();
	}

	return text;
}

/**
 * 将AI响应的字符串解析为JSON对象。
 * 如果直接解析失败，会尝试从字符串中提取一个有效的JSON对象进行解析。
 * @param {string} raw - 包含JSON的原始字符串。
 * @returns {object} 解析后的JSON对象。
 * @throws {I18nError} 如果响应为空或无法解析为JSON。
 */
function parseJsonResponse(raw) {
	if (!raw || typeof raw !== "string") {
		throw createI18nError("ai_service_error_empty_response", {
			fallback: "AI响应体为空",
		});
	}

	try {
		// 尝试直接解析
		return JSON.parse(raw);
	} catch (error) {
		// 如果失败，尝试在文本中寻找被包裹的JSON对象
		const match = raw.match(/\{[\s\S]*\}/);
		if (match) {
			return JSON.parse(match[0]);
		}
		throw createI18nError("ai_service_error_parse_json", {
			fallback: "无法将AI响应解析为JSON",
		});
	}
}

/**
 * 根据重试策略计算下一次重试的延迟时间。
 * @param {object} policy - 重试策略配置。
 * @param {number} attemptIndex - 当前的尝试次数（从1开始）。
 * @returns {number} 延迟的毫秒数。
 */
function computeRetryDelay(policy, attemptIndex) {
	if (!policy) {
		return 0;
	}
	const base = Math.max(0, Number(policy.baseDelayMs) || 0);
	if (base === 0) {
		return 0;
	}
	const factor = Number(policy.backoffFactor) || 1;
	// 实现指数退避
	return Math.round(base * Math.pow(factor, Math.max(0, attemptIndex - 1)));
}

/**
 * 默认的异步等待函数。
 * @param {number} delayMs - 等待的毫秒数。
 * @returns {Promise<void>}
 */
function defaultSleep(delayMs) {
	if (!delayMs || delayMs <= 0) {
		return Promise.resolve();
	}
	return new Promise((resolve) => setTimeout(resolve, delayMs));
}

/**
 * 执行一个已配置的AI请求。
 * @param {object} context - 请求的上下文，包含提供商配置、API密钥、模型名称等。
 * @returns {Promise<string>} 清理后的AI响应内容。
 * @throws {I18nError} 如果请求失败或响应无效。
 */
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
		throw createI18nError("ai_service_error_request_failed", {
			fallback: `${providerConfig.label} 请求失败: ${error.message}`,
			substitutions: [providerConfig.label, error.message],
		});
	}

	let bodyText = "";
	try {
		bodyText = await response.text();
	} catch (error) {
		// 读取响应体失败，bodyText保持为空
		bodyText = "";
	}

	let parsedBody = null;
	if (bodyText) {
		try {
			parsedBody = JSON.parse(bodyText);
		} catch (error) {
			if (response.ok) {
				// 响应成功但JSON解析失败，这是一个问题
				throw createI18nError("ai_service_error_parse_failed", {
					fallback: `${providerConfig.label} 响应解析失败: ${error.message}`,
					substitutions: [providerConfig.label, error.message],
				});
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

		throw createI18nError("ai_service_error_request_failed", {
			fallback: `${providerConfig.label} 请求失败: ${message}`,
			substitutions: [providerConfig.label, message],
		});
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
		throw createI18nError("ai_service_error_empty_body", {
			fallback: `${providerConfig.label} 响应体为空`,
			substitutions: [providerConfig.label],
		});
	}

	return cleanAIResponse(content);
}

/**
 * 调用与OpenAI兼容的API。
 * @param {object} context - 请求上下文。
 * @returns {Promise<string>} AI响应。
 */
async function callOpenAICompatible(context) {
	return executeConfiguredRequest(context);
}

/**
 * 调用Google Generative AI API。
 * @param {object} context - 请求上下文。
 * @returns {Promise<string>} AI响应。
 */
async function callGoogleGenerative(context) {
	return executeConfiguredRequest(context);
}

/**
 * 调用Anthropic Messages API。
 * @param {object} context - 请求上下文。
 * @returns {Promise<string>} AI响应。
 */
async function callAnthropicMessages(context) {
	return executeConfiguredRequest(context);
}

/** @type {Map<string, Function>} - API兼容模式与执行函数的注册表。 */
const EXECUTOR_REGISTRY = new Map([
	["openai-compatible", callOpenAICompatible],
	["google-generative", callGoogleGenerative],
	["anthropic-messages", callAnthropicMessages],
]);

/**
 * 根据提供商的兼容模式调用相应的执行函数。
 * @param {object} context - 请求上下文。
 * @returns {Promise<string>} AI响应。
 */
async function invokeExecutor(context) {
	const compatMode = context?.providerConfig?.compatMode ?? "openai-compatible";
	const executor = EXECUTOR_REGISTRY.get(compatMode) ?? callOpenAICompatible;
	return executor(context);
}

/**
 * 更新提供商的健康状态。
 * @param {string} providerId - 提供商ID。
 * @param {'healthy'|'error'|'unknown'} status - 新的健康状态。
 * @param {string} [errorMessage=""] - 如果状态是'error'，相关的错误信息。
 * @returns {Promise<void>}
 */
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

/**
 * 加载当前活动提供商的状态（配置、API密钥、模型名称）。
 * @param {string|null} [requestedProviderId=null] - 请求的提供商ID，如果为null则使用默认。
 * @returns {Promise<object>} 包含活动提供商状态的对象。
 * @throws {I18nError} 如果配置或API密钥缺失。
 */
async function loadActiveProviderState(requestedProviderId = null) {
	const config = await loadConfig();
	const activeProviderId =
		requestedProviderId ?? config?.aiConfig?.provider ?? getDefaultProviderId();
	const providerConfig = ensureProvider(activeProviderId);

	const models = config?.aiConfig?.models ?? {};
	const modelState = models[activeProviderId];

	if (!modelState) {
		throw createI18nError("ai_service_error_missing_provider_config", {
			fallback: `找不到提供商配置: ${activeProviderId}`,
			substitutions: [activeProviderId],
		});
	}

	if (!modelState.apiKey) {
		throw createI18nError("ai_service_error_missing_api_key_active", {
			fallback: `提供商 ${activeProviderId} 的API密钥未配置`,
			substitutions: [activeProviderId],
		});
	}

	const modelName =
		modelState.modelName ||
		providerConfig.defaultModel ||
		providerConfig.testModel;

	if (!modelName) {
		throw createI18nError("ai_service_error_missing_default_model_active", {
			fallback: `提供商 ${activeProviderId} 缺少默认模型配置`,
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

/**
 * 构建备用提供商的调用序列。
 * @param {object} config - 应用配置。
 * @returns {string[]} 提供商ID的有序列表。
 */
function buildFallbackSequence(config) {
	const sequence = [];
	const add = (id) => {
		if (id && !sequence.includes(id)) {
			sequence.push(id);
		}
	};

	// 优先使用当前激活的提供商
	add(config?.aiConfig?.provider ?? getDefaultProviderId());

	// 添加用户配置的备用顺序
	const storedFallback = Array.isArray(config?.aiConfig?.fallbackOrder)
		? config.aiConfig.fallbackOrder
		: [];
	storedFallback.forEach(add);

	// 添加系统默认的备用顺序
	getFallbackOrder().forEach(add);

	return sequence;
}

/**
 * 使用重试逻辑执行AI调用。
 * @param {object} context - 执行上下文。
 * @param {object} retryPolicy - 重试策略。
 * @param {Function} [sleepFn=defaultSleep] - 用于等待的函数。
 * @returns {Promise<string>} AI响应。
 * @throws {Error|I18nError} 如果所有尝试都失败。
 */
async function runWithRetry(context, retryPolicy, sleepFn = defaultSleep) {
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
		fallback: "AI请求失败",
	});
}

/**
 * 直接调用指定提供商的API。
 * @export
 * @param {string} providerId - 提供商ID。
 * @param {string} apiKey - API密钥。
 * @param {string} modelName - 模型名称。
 * @param {string} prompt - 发送给AI的提示。
 * @param {object} [options={}] - 传递给API的额外选项。
 * @returns {Promise<string>} AI响应。
 * @throws {I18nError} 如果配置不完整或请求失败。
 */
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
			fallback: `提供商 ${providerId} 的API密钥未配置`,
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
			fallback: `提供商 ${providerId} 缺少默认模型配置`,
			substitutions: [providerId],
		});
	}

	const executionContext = {
		providerConfig,
		apiKey,
		modelName: effectiveModelName,
		prompt,
		options: options ?? {},
		overrideBaseUrl: resolveOverrideBaseUrl(providerConfig, modelState.apiUrl),
	};

	return invokeExecutor(executionContext);
}

/**
 * 根据输入文本和模板构建最终的AI提示。
 * @export
 * @param {string} inputText - 用户输入或查词结果。
 * @param {string} template - 用户自定义的提示模板。
 * @returns {string} 构建完成的提示。
 */
export function buildPrompt(inputText, template) {
	const defaultPromptTemplate = getText(
		"ai_service_prompt_classic",
		`将以下词典查询结果转换为用于Anki卡片的结构化数据。\n返回一个只包含 \"front\" 和 \"back\" 字段的纯JSON对象。不要添加额外的注释或代码围栏。\nJSON示例:\n{\n  \"front\": \"单词\",\n  \"back\": \"包含原始格式的完整查询结果\"\n}\n\n源文本:\n---\n$INPUT$\n---\n`,
		[inputText],
	);

	if (template && template.trim().length > 0) {
		if (template.includes("{{INPUT_TEXT}}")) {
			return template.replace("{{INPUT_TEXT}}", inputText);
		}

		console.warn(
			getText(
				"ai_service_warn_missing_input_placeholder",
				"自定义提示缺少 {{INPUT_TEXT}} 占位符。已将输入文本附加到末尾。",
			),
		);
		return `${template}\n\n${inputText}`;
	}

	return defaultPromptTemplate;
}

/**
 * 使用备用链解析文本。它会按顺序尝试配置的AI提供商，直到成功为止。
 * @export
 * @param {string} inputText - 要解析的文本。
 * @param {string} promptTemplate - 自定义提示模板。
 * @param {object} [runtimeOverrides={}] - 运行时覆盖选项（如temperature）。
 * @returns {Promise<object>} 解析后的JSON对象。
 * @throws {I18nError} 如果所有提供商都失败。
 */
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
				createI18nError("ai_service_error_missing_api_key", {
					fallback: `提供商 ${providerId} 的API密钥未配置`,
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
				createI18nError("ai_service_error_missing_default_model", {
					fallback: `提供商 ${providerId} 缺少默认模型配置`,
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
				temperature: runtimeOverrides.temperature ?? 0.3,
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
		throw createI18nError("ai_service_error_request_with_message", {
			fallback: `AI请求失败: ${errors[errors.length - 1].message}`,
			substitutions: [errors[errors.length - 1].message],
		});
	}

	throw createI18nError("ai_service_error_no_provider_available", {
		fallback: "AI请求失败: 没有可用的提供商",
	});
}

/**
 * 测试与指定AI提供商的连接。
 * @export
 * @param {string} providerId - 提供商ID。
 * @param {string} apiKey - API密钥。
 * @param {string} modelName - 模型名称。
 * @returns {Promise<{success: boolean, message: string}>} 连接测试的结果。
 */
export async function testConnection(
	providerId,
	apiKey,
	modelName,
	apiUrl = null,
) {
	let providerConfig;
	try {
		providerConfig = ensureProvider(providerId);
	} catch (error) {
		return {
			success: false,
			message: getText(
				"ai_service_connection_test_failed_with_reason",
				`连接测试失败: ${
					error instanceof Error ? error.message : String(error)
				}`,
				[error instanceof Error ? error.message : String(error)],
			),
		};
	}

	if (!apiKey) {
		return {
			success: false,
			message: getText(
				"ai_service_connection_test_failed_missing_key",
				"连接测试失败: API密钥未配置",
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
				fallback: `${providerConfig.label} 缺少默认模型配置`,
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
				apiUrl || modelState.apiUrl,
			),
		};

		await runWithRetry(executionContext, runtime.retryPolicy);
		await updateProviderHealth(providerId, "healthy");

		return {
			success: true,
			message: getText(
				"ai_service_connection_test_success",
				`${providerConfig.label} 连接测试成功`,
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
				"ai_service_connection_test_failed_with_reason",
				`连接测试失败: ${
					error instanceof Error ? error.message : String(error)
				}`,
				[error instanceof Error ? error.message : String(error)],
			),
		};
	}
}

/**
 * 运行动态字段解析的核心逻辑，包含重试和验证。
 * @param {string} inputText - 输入文本。
 * @param {string[]} fieldNames - 需要解析的字段名数组。
 * @param {string} customTemplate - 自定义提示模板。
 * @param {number} [maxRetries=2] - 最大重试次数。
 * @returns {Promise<object>} 解析后的数据对象。
 * @throws {I18nError} 如果解析失败或验证不通过。
 */
async function runDynamicParsing(
	inputText,
	fieldNames,
	customTemplate,
	maxRetries = 2,
) {
	if (!Array.isArray(fieldNames) || fieldNames.length === 0) {
		throw createI18nError("popup_status_no_fields_parse", {
			fallback: "没有配置用于解析的字段。请先在选项中更新模板。",
		});
	}

	const { providerConfig, modelState, apiKey, modelName } =
		await loadActiveProviderState();
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
			// 在重试时稍微降低 temperature 以获得更稳定的输出
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
						`输出包含无效字段: ${fallbackDetail}`,
						[fallbackDetail],
					);
				throw createI18nError("ai_service_error_output_invalid_fields", {
					fallback: message,
					substitutions: [fallbackDetail],
				});
			}

			if (!validation.hasContent) {
				throw createI18nError("ai_service_error_output_all_empty", {
					fallback: "AI输出仅包含空字段。请检查输入文本或重试。",
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

			await updateProviderHealth(providerConfig.id, "error", lastError.message);

			throw createI18nError("ai_service_error_parse_fail_message", {
				fallback: `AI解析失败: ${lastError.message}`,
				substitutions: [lastError.message],
			});
		}
	}

	throw createI18nError("ai_service_error_parse_fail_unknown", {
		fallback: "AI解析失败: 未知错误",
	});
}

/**
 * Parse text using dynamic fields and integrated prompts.
 * @export
 * @param {string} inputText - The input text to parse.
 * @param {string[]} fieldNames - Array of field names to extract.
 * @param {string} customTemplate - Custom prompt template.
 * @param {number} [maxRetries=2] - Maximum retry attempts.
 * @returns {Promise<object>} Parsed data object.
 */
export async function parseTextWithDynamicFields(
	inputText,
	fieldNames,
	customTemplate,
	maxRetries = 2,
) {
	return runDynamicParsing(inputText, fieldNames, customTemplate, maxRetries);
}

// Alias export for backward compatibility (same as parseTextWithDynamicFields)
export { parseTextWithDynamicFields as parseTextWithDynamicFieldsFallback };
