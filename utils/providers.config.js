/**
 * @fileoverview AI 提供商配置的集中管理模块
 *
 * 本模块负责管理所有 AI 提供商(Google Gemini、OpenAI GPT、Anthropic Claude)的配置信息,
 * 包括 API 端点、加密盐值、请求构建器、响应解析器等。
 *
 * 主要功能:
 * - 提供商配置管理(API 配置、加密设置、UI 配置等)
 * - 请求配置构建(URL、请求头、请求体等)
 * - 响应解析(提取 AI 响应文本)
 * - 主机权限管理(用于扩展的 manifest 配置)
 *
 * @module utils/providers.config
 */

/**
 * Google Gemini API 密钥加密使用的盐值
 * @constant {Uint8Array}
 * @private
 */
const GOOGLE_SALT = new Uint8Array([
  18, 24, 193, 131, 8, 11, 20, 153, 22, 163, 3, 19, 84, 134, 103, 174,
]);

/**
 * OpenAI API 密钥加密使用的盐值
 * @constant {Uint8Array}
 * @private
 */
const OPENAI_SALT = new Uint8Array([
  45, 67, 89, 12, 34, 56, 78, 90, 123, 145, 167, 189, 211, 233, 255, 21,
]);

/**
 * Anthropic Claude API 密钥加密使用的盐值
 * @constant {Uint8Array}
 * @private
 */
const ANTHROPIC_SALT = new Uint8Array([
  98, 76, 54, 32, 10, 87, 65, 43, 21, 99, 77, 55, 33, 11, 89, 67,
]);

/**
 * DeepSeek API 密钥加密使用的盐值
 * @constant {Uint8Array}
 * @private
 */
const DEEPSEEK_SALT = new Uint8Array([
  56, 12, 89, 34, 45, 67, 78, 90, 11, 22, 33, 44, 55, 66, 77, 88,
]);

/**
 * Groq API 密钥加密使用的盐值
 * @constant {Uint8Array}
 * @private
 */
const GROQ_SALT = new Uint8Array([
  99, 88, 77, 66, 55, 44, 33, 22, 11, 21, 31, 41, 51, 61, 71, 81,
]);

/**
 * Zhipu AI API 密钥加密使用的盐值
 * @constant {Uint8Array}
 * @private
 */
const ZHIPU_SALT = new Uint8Array([
  180, 247, 26, 199, 88, 28, 151, 70, 118, 55, 169, 193, 25, 248, 252, 199,
]);

/**
 * Qwen API 密钥加密使用的盐值
 * @constant {Uint8Array}
 * @private
 */
const QWEN_SALT = new Uint8Array([
  11, 22, 33, 44, 55, 66, 77, 88, 99, 10, 20, 30, 40, 50, 60, 70,
]);

/**
 * Moonshot AI API 密钥加密使用的盐值
 * @constant {Uint8Array}
 * @private
 */
const MOONSHOT_SALT = new Uint8Array([
  13, 24, 35, 46, 57, 68, 79, 80, 91, 12, 23, 34, 45, 56, 67, 78,
]);

/**
 * manifest 中始终需要的基础主机权限
 * 包含本地 Anki Connect 服务的访问权限
 * @constant {Array<string>}
 * @private
 */
const BASE_HOST_PERMISSIONS = Object.freeze([
  "http://127.0.0.1:8765/*", // Anki Connect 默认地址
]);

/**
 * 默认使用的提供商 ID
 * @constant {string}
 * @private
 */
const DEFAULT_PROVIDER_ID = "google";

/**
 * 提供商回退顺序
 * 当某个提供商不可用时,按此顺序尝试其他提供商
 * @constant {Array<string>}
 * @private
 */
const FALLBACK_ORDER = Object.freeze([
  "google",
  "openai",
  "anthropic",
  "groq",
  "deepseek",
  "zhipu",
  "qwen",
  "moonshot",
]);

/**
 * 默认的重试策略配置
 * 用于 API 请求失败时的自动重试机制
 *
 * @constant {Object}
 * @property {number} maxAttempts - 最大重试次数
 * @property {number} baseDelayMs - 基础延迟时间(毫秒)
 * @property {number} backoffFactor - 指数退避因子(每次重试延迟时间 = baseDelayMs * backoffFactor^attemptCount)
 */
export const DEFAULT_RETRY_POLICY = Object.freeze({
  maxAttempts: 3,
  baseDelayMs: 200,
  backoffFactor: 2,
});

/**
 * 默认的健康检查配置
 * 用于测试 AI 提供商的连接状态和响应能力
 *
 * @constant {Object}
 * @property {string} prompt - 测试用的提示词
 * @property {Object} options - 请求选项
 * @property {number} options.maxTokens - 最大令牌数(限制响应长度)
 * @property {number} options.temperature - 温度参数(0 表示确定性输出)
 */
export const DEFAULT_HEALTH_CHECK = Object.freeze({
  prompt: "これは接続テストです。短い応答を返してください。",
  options: Object.freeze({
    maxTokens: 16,
    temperature: 0,
  }),
});

/**
 * 规范化基础 URL
 * 移除 URL 末尾的斜杠,确保 URL 格式统一
 *
 * @private
 * @param {string} baseUrl - 原始基础 URL
 * @returns {string} 规范化后的 URL(不含末尾斜杠)
 * @example
 * normalizeBaseUrl("https://api.example.com/") // => "https://api.example.com"
 * normalizeBaseUrl("https://api.example.com")  // => "https://api.example.com"
 */
function normalizeBaseUrl(baseUrl) {
  return baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
}

/**
 * 确保路径以斜杠开头
 * 用于构建完整的 API 端点 URL
 *
 * @private
 * @param {string} path - 原始路径
 * @returns {string} 以斜杠开头的路径,如果路径为空则返回空字符串
 * @example
 * ensureLeadingSlash("api/test")  // => "/api/test"
 * ensureLeadingSlash("/api/test") // => "/api/test"
 * ensureLeadingSlash("")          // => ""
 */
function ensureLeadingSlash(path) {
  if (!path) {
    return "";
  }
  return path.startsWith("/") ? path : `/${path}`;
}

/**
 * AI 提供商配置数组
 * 包含所有支持的 AI 提供商的完整配置信息
 *
 * @constant {Array<Object>}
 * @private
 */
const PROVIDERS = Object.freeze([
  /**
   * Google Gemini 提供商配置
   * @type {Object}
   */
  Object.freeze({
    /** @type {string} 提供商唯一标识符 */
    id: "google",
    /** @type {string} 提供商显示名称 */
    label: "Google Gemini",
    /** @type {string} 兼容模式标识 */
    compatMode: "google-generative",
    /** @type {string} 默认使用的模型 */
    defaultModel: "gemini-3-flash-preview",
    /** @type {string} 用于健康检查的测试模型 */
    testModel: "gemini-2.5-flash",
    /** @type {Array<string>} 支持的模型列表 */
    supportedModels: [
      "gemini-3-pro-preview",
      "gemini-3-flash-preview",
      "gemini-2.5-flash",
    ],
    /**
     * API 配置
     * @type {Object}
     */
    api: {
      /** @type {string} API 基础 URL */
      baseUrl: normalizeBaseUrl(
        "https://generativelanguage.googleapis.com/v1beta",
      ),
      /**
       * 构建 API 路径
       * @param {Object} context - 上下文对象
       * @param {string} context.modelName - 模型名称
       * @returns {string} API 路径
       */
      pathBuilder: ({ modelName }) => `/models/${modelName}:generateContent`,
      /**
       * 构建请求头
       * @param {Object} context - 上下文对象
       * @param {string} context.apiKey - API 密钥
       * @returns {Object} 请求头对象
       */
      headers: ({ apiKey }) => ({
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      }),
      /**
       * 构建请求负载(payload)
       * @param {Object} context - 上下文对象
       * @param {string} context.prompt - 用户提示词
       * @param {Object} [context.options={}] - 可选配置
       * @returns {Object} 请求负载对象
       */
      payloadBuilder: ({ prompt, options = {} }) => {
        // 生成配置默认值
        const generationDefaults = {
          temperature: options.temperature ?? 0.3, // 温度参数:控制输出随机性
          maxOutputTokens: options.maxTokens ?? 2000, // 最大输出令牌数
          topP: 0.8, // 核采样参数
          topK: 10, // Top-K 采样参数
        };

        const payload = {
          // 内容数组:可使用自定义内容或默认文本提示
          contents: options.contents ?? [
            {
              parts: [
                {
                  text: prompt,
                },
              ],
            },
          ],
          // 生成配置:合并默认值和自定义配置
          generationConfig: {
            ...generationDefaults,
            ...(options.generationConfig ?? {}),
          },
        };

        // 可选:添加系统指令
        if (options.systemInstruction) {
          payload.systemInstruction = options.systemInstruction;
        }

        // 可选:添加安全设置
        if (options.safetySettings) {
          payload.safetySettings = options.safetySettings;
        }

        // 可选:合并额外的负载字段
        if (options.extraPayload) {
          Object.assign(payload, options.extraPayload);
        }

        return payload;
      },
      /**
       * 解析 API 响应,提取文本内容
       * @param {Object} context - 上下文对象
       * @param {Object} context.data - API 响应数据
       * @returns {string} 提取的文本内容,如果没有内容则返回空字符串
       */
      responseParser: ({ data }) => {
        const candidate = data?.candidates?.[0];
        if (!candidate) {
          return "";
        }

        // 尝试从标准格式提取文本
        if (candidate.content?.parts?.length) {
          const part = candidate.content.parts.find(
            (item) => typeof item?.text === "string",
          );
          if (part?.text) {
            return part.text;
          }
        }

        // 尝试从旧版格式提取文本
        if (candidate.content?.length) {
          const legacyPart = candidate.content.find(
            (item) => typeof item?.text === "string",
          );
          if (legacyPart?.text) {
            return legacyPart.text;
          }
        }

        return "";
      },
    },
    /** @type {Uint8Array} API 密钥加密使用的盐值 */
    encryptionSalt: GOOGLE_SALT,
    /** @type {Array<string>} 需要的主机权限(用于 manifest) */
    hostPermissions: Object.freeze([
      "https://generativelanguage.googleapis.com/*",
    ]),
    /**
     * UI 相关配置
     * @type {Object}
     */
    ui: Object.freeze({
      /** @type {string} API 密钥输入框的标签 */
      apiKeyLabel: "Google API Key",
      /** @type {string} API 密钥输入框的占位符 */
      apiKeyPlaceholder: "AIza...",
      /** @type {string} API 文档链接 */
      docsUrl: "https://ai.google.dev/gemini-api/docs",
      /** @type {string} API 密钥管理面板链接 */
      dashboardUrl: "https://aistudio.google.com/app/apikey",
    }),
    /**
     * 运行时配置
     * @type {Object}
     */
    runtime: Object.freeze({
      /** @type {Object} 重试策略 */
      retryPolicy: DEFAULT_RETRY_POLICY,
      /** @type {Object} 健康检查配置 */
      healthCheck: DEFAULT_HEALTH_CHECK,
    }),
  }),
  /**
   * OpenAI GPT 提供商配置
   * @type {Object}
   */
  Object.freeze({
    /** @type {string} 提供商唯一标识符 */
    id: "openai",
    /** @type {string} 提供商显示名称 */
    label: "OpenAI GPT",
    /** @type {string} 兼容模式标识 */
    compatMode: "openai-compatible",
    /** @type {string} 默认使用的模型 */
    defaultModel: "gpt-5.2",
    /** @type {string} 用于健康检查的测试模型 */
    testModel: "gpt-5-mini",
    /** @type {Array<string>} 支持的模型列表 */
    supportedModels: ["gpt-5.2", "gpt-5-mini", "o3-mini"],
    /**
     * API 配置
     * @type {Object}
     */
    api: {
      /** @type {string} API 基础 URL */
      baseUrl: normalizeBaseUrl("https://api.openai.com/v1"),
      /**
       * 构建 API 路径
       * @returns {string} API 路径
       */
      pathBuilder: () => "/chat/completions",
      /**
       * 构建请求头
       * @param {Object} context - 上下文对象
       * @param {string} context.apiKey - API 密钥
       * @returns {Object} 请求头对象
       */
      headers: ({ apiKey }) => ({
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      }),
      /**
       * 构建请求负载(payload)
       * @param {Object} context - 上下文对象
       * @param {string} context.modelName - 模型名称
       * @param {string} context.prompt - 用户提示词
       * @param {Object} [context.options={}] - 可选配置
       * @returns {Object} 请求负载对象
       */
      payloadBuilder: ({ modelName, prompt, options = {} }) => {
        const payload = {
          model: modelName, // 使用的模型名称
          // 消息数组:可使用自定义消息或默认用户消息
          messages: options.messages ?? [
            {
              role: "user",
              content: prompt,
            },
          ],
          temperature: options.temperature ?? 0.3, // 温度参数:控制输出随机性
          max_tokens: options.maxTokens ?? 2000, // 最大令牌数
        };

        // 可选:添加响应格式设置
        if (options.responseFormat) {
          payload.response_format = options.responseFormat;
        }

        // 可选:合并额外的负载字段
        if (options.extraPayload) {
          Object.assign(payload, options.extraPayload);
        }

        return payload;
      },
      /**
       * 解析 API 响应,提取文本内容
       * @param {Object} context - 上下文对象
       * @param {Object} context.data - API 响应数据
       * @returns {string} 提取的文本内容,如果没有内容则返回空字符串
       */
      responseParser: ({ data }) => data?.choices?.[0]?.message?.content ?? "",
    },
    /** @type {Uint8Array} API 密钥加密使用的盐值 */
    encryptionSalt: OPENAI_SALT,
    /** @type {Array<string>} 需要的主机权限(用于 manifest) */
    hostPermissions: Object.freeze(["https://api.openai.com/*"]),
    /**
     * UI 相关配置
     * @type {Object}
     */
    ui: Object.freeze({
      /** @type {string} API 密钥输入框的标签 */
      apiKeyLabel: "OpenAI API Key",
      /** @type {string} API 密钥输入框的占位符 */
      apiKeyPlaceholder: "sk-...",
      /** @type {string} API 文档链接 */
      docsUrl: "https://platform.openai.com/docs/api-reference",
      /** @type {string} API 密钥管理面板链接 */
      dashboardUrl: "https://platform.openai.com/api-keys",
    }),
    /**
     * 运行时配置
     * @type {Object}
     */
    runtime: Object.freeze({
      /** @type {Object} 重试策略 */
      retryPolicy: DEFAULT_RETRY_POLICY,
      /** @type {Object} 健康检查配置 */
      healthCheck: DEFAULT_HEALTH_CHECK,
    }),
  }),
  /**
   * Anthropic Claude 提供商配置
   * @type {Object}
   */
  Object.freeze({
    /** @type {string} 提供商唯一标识符 */
    id: "anthropic",
    /** @type {string} 提供商显示名称 */
    label: "Anthropic Claude",
    /** @type {string} 兼容模式标识 */
    compatMode: "anthropic-messages",
    /** @type {string} 默认使用的模型 */
    defaultModel: "claude-opus-4-6",
    /** @type {string} 用于健康检查的测试模型 */
    testModel: "claude-haiku-4-5",
    /** @type {Array<string>} 支持的模型列表 */
    supportedModels: [
      "claude-opus-4-6",
      "claude-sonnet-4-5",
      "claude-haiku-4-5",
    ],
    /**
     * API 配置
     * @type {Object}
     */
    api: {
      /** @type {string} API 基础 URL */
      baseUrl: normalizeBaseUrl("https://api.anthropic.com/v1"),
      /**
       * 构建 API 路径
       * @returns {string} API 路径
       */
      pathBuilder: () => "/messages",
      /**
       * 构建请求头
       * @param {Object} context - 上下文对象
       * @param {string} context.apiKey - API 密钥
       * @returns {Object} 请求头对象
       */
      headers: ({ apiKey }) => ({
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-dangerous-direct-browser-access": "true", // 允许浏览器直接访问
        "anthropic-version": "2023-06-01", // Anthropic API 版本号
      }),
      /**
       * 构建请求负载(payload)
       * @param {Object} context - 上下文对象
       * @param {string} context.modelName - 模型名称
       * @param {string} context.prompt - 用户提示词
       * @param {Object} [context.options={}] - 可选配置
       * @returns {Object} 请求负载对象
       */
      payloadBuilder: ({ modelName, prompt, options = {} }) => {
        const payload = {
          model: modelName, // 使用的模型名称
          max_tokens: options.maxTokens ?? 2000, // 最大令牌数
          temperature: options.temperature ?? 0.3, // 温度参数:控制输出随机性
          // 消息数组:可使用自定义消息或默认用户消息
          messages: options.messages ?? [
            {
              role: "user",
              content: prompt,
            },
          ],
        };

        // 可选:添加系统提示
        if (options.system) {
          payload.system = options.system;
        }

        // 可选:合并额外的负载字段
        if (options.extraPayload) {
          Object.assign(payload, options.extraPayload);
        }

        return payload;
      },
      /**
       * 解析 API 响应,提取文本内容
       * @param {Object} context - 上下文对象
       * @param {Object} context.data - API 响应数据
       * @returns {string} 提取的文本内容,如果没有内容则返回空字符串
       */
      responseParser: ({ data }) =>
        data?.content?.[0]?.text ?? // 首先尝试从第一个内容块获取文本
        data?.content?.find((item) => typeof item?.text === "string")?.text ?? // 否则查找第一个包含文本的内容块
        "",
    },
    /** @type {Uint8Array} API 密钥加密使用的盐值 */
    encryptionSalt: ANTHROPIC_SALT,
    /** @type {Array<string>} 需要的主机权限(用于 manifest) */
    hostPermissions: Object.freeze(["https://api.anthropic.com/*"]),
    /**
     * UI 相关配置
     * @type {Object}
     */
    ui: Object.freeze({
      /** @type {string} API 密钥输入框的标签 */
      apiKeyLabel: "Anthropic API Key",
      /** @type {string} API 密钥输入框的占位符 */
      apiKeyPlaceholder: "sk-ant-...",
      /** @type {string} API 文档链接 */
      docsUrl: "https://docs.anthropic.com/claude/reference/messages_post",
      /** @type {string} API 密钥管理面板链接 */
      dashboardUrl: "https://console.anthropic.com/settings/keys",
    }),
    /**
     * 运行时配置
     * @type {Object}
     */
    runtime: Object.freeze({
      /** @type {Object} 重试策略 */
      retryPolicy: DEFAULT_RETRY_POLICY,
      /** @type {Object} 健康检查配置 */
      healthCheck: DEFAULT_HEALTH_CHECK,
    }),
  }),
  /**
   * Groq 提供商配置
   * @type {Object}
   */
  Object.freeze({
    /** @type {string} 提供商唯一标识符 */
    id: "groq",
    /** @type {string} 提供商显示名称 */
    label: "Groq",
    /** @type {string} 兼容模式标识 */
    compatMode: "openai-compatible",
    /** @type {string} 默认使用的模型 */
    defaultModel: "llama-3.3-70b-versatile",
    /** @type {string} 用于健康检查的测试模型 */
    testModel: "llama-3.1-8b-instant",
    /** @type {Array<string>} 支持的模型列表 */
    supportedModels: [
      "llama-3.3-70b-versatile",
      "llama-3.1-8b-instant",
      "mixtral-8x7b-32768",
      "gemma2-9b-it",
    ],
    /**
     * API 配置
     * @type {Object}
     */
    api: {
      /** @type {string} API 基础 URL */
      baseUrl: normalizeBaseUrl("https://api.groq.com/openai/v1"),
      /**
       * 构建 API 路径
       * @returns {string} API 路径
       */
      pathBuilder: () => "/chat/completions",
      /**
       * 构建请求头
       * @param {Object} context - 上下文对象
       * @param {string} context.apiKey - API 密钥
       * @returns {Object} 请求头对象
       */
      headers: ({ apiKey }) => ({
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      }),
      /**
       * 构建请求负载(payload)
       * @param {Object} context - 上下文对象
       * @returns {Object} 请求负载对象
       */
      payloadBuilder: ({ modelName, prompt, options = {} }) => {
        const payload = {
          model: modelName,
          messages: options.messages ?? [
            {
              role: "user",
              content: prompt,
            },
          ],
          temperature: options.temperature ?? 0.3,
          max_tokens: options.maxTokens ?? 2000,
        };
        if (options.responseFormat) {
          payload.response_format = options.responseFormat;
        }
        if (options.extraPayload) {
          Object.assign(payload, options.extraPayload);
        }
        return payload;
      },
      /**
       * 解析 API 响应
       * @param {Object} context - 上下文对象
       * @returns {string} 提取的文本内容
       */
      responseParser: ({ data }) => data?.choices?.[0]?.message?.content ?? "",
    },
    /** @type {Uint8Array} API 密钥加密使用的盐值 */
    encryptionSalt: GROQ_SALT,
    /** @type {Array<string>} 需要的主机权限(用于 manifest) */
    hostPermissions: Object.freeze(["https://api.groq.com/*"]),
    /**
     * UI 相关配置
     * @type {Object}
     */
    ui: Object.freeze({
      /** @type {string} API 密钥输入框的标签 */
      apiKeyLabel: "Groq API Key",
      /** @type {string} API 密钥输入框的占位符 */
      apiKeyPlaceholder: "gsk_...",
      /** @type {string} API 文档链接 */
      docsUrl: "https://console.groq.com/docs/api-reference",
      /** @type {string} API 密钥管理面板链接 */
      dashboardUrl: "https://console.groq.com/keys",
    }),
    /**
     * 运行时配置
     * @type {Object}
     */
    runtime: Object.freeze({
      /** @type {Object} 重试策略 */
      retryPolicy: DEFAULT_RETRY_POLICY,
      /** @type {Object} 健康检查配置 */
      healthCheck: DEFAULT_HEALTH_CHECK,
    }),
  }),
  /**
   * DeepSeek 提供商配置
   * @type {Object}
   */
  Object.freeze({
    /** @type {string} 提供商唯一标识符 */
    id: "deepseek",
    /** @type {string} 提供商显示名称 */
    label: "DeepSeek",
    /** @type {string} 兼容模式标识 */
    compatMode: "openai-compatible",
    /** @type {string} 默认使用的模型 */
    defaultModel: "deepseek-chat",
    /** @type {string} 用于健康检查的测试模型 */
    testModel: "deepseek-chat",
    /** @type {Array<string>} 支持的模型列表 */
    supportedModels: ["deepseek-chat", "deepseek-reasoner"],
    /**
     * API 配置
     * @type {Object}
     */
    api: {
      /** @type {string} API 基础 URL */
      baseUrl: normalizeBaseUrl("https://api.deepseek.com"),
      /**
       * 构建 API 路径
       * @returns {string} API 路径
       */
      pathBuilder: () => "/chat/completions",
      /**
       * 构建请求头
       * @param {Object} context - 上下文对象
       * @param {string} context.apiKey - API 密钥
       * @returns {Object} 请求头对象
       */
      headers: ({ apiKey }) => ({
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      }),
      /**
       * 构建请求负载(payload) - 复用 OpenAI 结构
       * @param {Object} context - 上下文对象
       * @returns {Object} 请求负载对象
       */
      payloadBuilder: ({ modelName, prompt, options = {} }) => {
        const payload = {
          model: modelName,
          messages: options.messages ?? [
            {
              role: "user",
              content: prompt,
            },
          ],
          temperature: options.temperature ?? 0.3,
          max_tokens: options.maxTokens ?? 2000,
        };
        if (options.responseFormat) {
          payload.response_format = options.responseFormat;
        }
        if (options.extraPayload) {
          Object.assign(payload, options.extraPayload);
        }
        return payload;
      },
      /**
       * 解析 API 响应 - 复用 OpenAI 结构
       * @param {Object} context - 上下文对象
       * @returns {string} 提取的文本内容
       */
      responseParser: ({ data }) => data?.choices?.[0]?.message?.content ?? "",
    },
    /** @type {Uint8Array} API 密钥加密使用的盐值 */
    encryptionSalt: DEEPSEEK_SALT,
    /** @type {Array<string>} 需要的主机权限(用于 manifest) */
    hostPermissions: Object.freeze(["https://api.deepseek.com/*"]),
    /**
     * UI 相关配置
     * @type {Object}
     */
    ui: Object.freeze({
      /** @type {string} API 密钥输入框的标签 */
      apiKeyLabel: "DeepSeek API Key",
      /** @type {string} API 密钥输入框的占位符 */
      apiKeyPlaceholder: "sk-...",
      /** @type {string} API 文档链接 */
      docsUrl: "https://platform.deepseek.com/api-docs",
      /** @type {string} API 密钥管理面板链接 */
      dashboardUrl: "https://platform.deepseek.com/api_keys",
    }),
    /**
     * 运行时配置
     * @type {Object}
     */
    runtime: Object.freeze({
      /** @type {Object} 重试策略 */
      retryPolicy: DEFAULT_RETRY_POLICY,
      /** @type {Object} 健康检查配置 */
      healthCheck: DEFAULT_HEALTH_CHECK,
    }),
  }),
  /**
   * Zhipu AI 提供商配置
   * @type {Object}
   */
  Object.freeze({
    /** @type {string} 提供商唯一标识符 */
    id: "zhipu",
    /** @type {string} 提供商显示名称 */
    label: "Zhipu AI (智谱)",
    /** @type {string} 兼容模式标识 */
    compatMode: "openai-compatible",
    /** @type {string} 默认使用的模型 */
    defaultModel: "glm-4",
    /** @type {string} 用于健康检查的测试模型 */
    testModel: "glm-4-flash",
    /** @type {Array<string>} 支持的模型列表 */
    supportedModels: ["glm-4", "glm-4-flash", "glm-4-air", "glm-4-plus"],
    /**
     * API 配置
     * @type {Object}
     */
    api: {
      /** @type {string} API 基础 URL */
      baseUrl: normalizeBaseUrl("https://open.bigmodel.cn/api/paas/v4"),
      /**
       * 构建 API 路径
       * @returns {string} API 路径
       */
      pathBuilder: () => "/chat/completions",
      /**
       * 构建请求头
       * @param {Object} context - 上下文对象
       * @param {string} context.apiKey - API 密钥
       * @returns {Object} 请求头对象
       */
      headers: ({ apiKey }) => ({
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      }),
      /**
       * 构建请求负载(payload)
       * @param {Object} context - 上下文对象
       * @returns {Object} 请求负载对象
       */
      payloadBuilder: ({ modelName, prompt, options = {} }) => {
        const payload = {
          model: modelName,
          messages: options.messages ?? [
            {
              role: "user",
              content: prompt,
            },
          ],
          temperature: options.temperature ?? 0.3,
          max_tokens: options.maxTokens ?? 2000,
        };
        if (options.responseFormat) {
          payload.response_format = options.responseFormat;
        }
        if (options.extraPayload) {
          Object.assign(payload, options.extraPayload);
        }
        return payload;
      },
      /**
       * 解析 API 响应
       * @param {Object} context - 上下文对象
       * @returns {string} 提取的文本内容
       */
      responseParser: ({ data }) => data?.choices?.[0]?.message?.content ?? "",
    },
    /** @type {Uint8Array} API 密钥加密使用的盐值 */
    encryptionSalt: ZHIPU_SALT,
    /** @type {Array<string>} 需要的主机权限(用于 manifest) */
    hostPermissions: Object.freeze(["https://open.bigmodel.cn/*"]),
    /**
     * UI 相关配置
     * @type {Object}
     */
    ui: Object.freeze({
      /** @type {string} API 密钥输入框的标签 */
      apiKeyLabel: "Zhipu API Key",
      /** @type {string} API 密钥输入框的占位符 */
      apiKeyPlaceholder: "...",
      /** @type {string} API 文档链接 */
      docsUrl: "https://open.bigmodel.cn/dev/api",
      /** @type {string} API 密钥管理面板链接 */
      dashboardUrl: "https://open.bigmodel.cn/usercenter/apikeys",
    }),
    /**
     * 运行时配置
     * @type {Object}
     */
    runtime: Object.freeze({
      /** @type {Object} 重试策略 */
      retryPolicy: DEFAULT_RETRY_POLICY,
      /** @type {Object} 健康检查配置 */
      healthCheck: DEFAULT_HEALTH_CHECK,
    }),
  }),
  /**
   * Qwen (通义千问) 提供商配置
   * @type {Object}
   */
  Object.freeze({
    /** @type {string} 提供商唯一标识符 */
    id: "qwen",
    /** @type {string} 提供商显示名称 */
    label: "Alibaba Qwen (通义千问)",
    /** @type {string} 兼容模式标识 */
    compatMode: "openai-compatible",
    /** @type {string} 默认使用的模型 */
    defaultModel: "qwen-max",
    /** @type {string} 用于健康检查的测试模型 */
    testModel: "qwen-turbo",
    /** @type {Array<string>} 支持的模型列表 */
    supportedModels: ["qwen-max", "qwen-plus", "qwen-turbo", "qwen-long"],
    /**
     * API 配置
     * @type {Object}
     */
    api: {
      /** @type {string} API 基础 URL */
      baseUrl: normalizeBaseUrl(
        "https://dashscope.aliyuncs.com/compatible-mode/v1",
      ),
      /**
       * 构建 API 路径
       * @returns {string} API 路径
       */
      pathBuilder: () => "/chat/completions",
      /**
       * 构建请求头
       * @param {Object} context - 上下文对象
       * @param {string} context.apiKey - API 密钥
       * @returns {Object} 请求头对象
       */
      headers: ({ apiKey }) => ({
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      }),
      /**
       * 构建请求负载(payload)
       * @param {Object} context - 上下文对象
       * @returns {Object} 请求负载对象
       */
      payloadBuilder: ({ modelName, prompt, options = {} }) => {
        const payload = {
          model: modelName,
          messages: options.messages ?? [
            {
              role: "user",
              content: prompt,
            },
          ],
          temperature: options.temperature ?? 0.3,
          max_tokens: options.maxTokens ?? 2000,
        };
        if (options.responseFormat) {
          payload.response_format = options.responseFormat;
        }
        if (options.extraPayload) {
          Object.assign(payload, options.extraPayload);
        }
        return payload;
      },
      /**
       * 解析 API 响应
       * @param {Object} context - 上下文对象
       * @returns {string} 提取的文本内容
       */
      responseParser: ({ data }) => data?.choices?.[0]?.message?.content ?? "",
    },
    /** @type {Uint8Array} API 密钥加密使用的盐值 */
    encryptionSalt: QWEN_SALT,
    /** @type {Array<string>} 需要的主机权限(用于 manifest) */
    hostPermissions: Object.freeze(["https://dashscope.aliyuncs.com/*"]),
    /**
     * UI 相关配置
     * @type {Object}
     */
    ui: Object.freeze({
      /** @type {string} API 密钥输入框的标签 */
      apiKeyLabel: "DashScope API Key",
      /** @type {string} API 密钥输入框的占位符 */
      apiKeyPlaceholder: "sk-...",
      /** @type {string} API 文档链接 */
      docsUrl:
        "https://help.aliyun.com/zh/model-studio/developer-reference/use-qwen-by-calling-api",
      /** @type {string} API 密钥管理面板链接 */
      dashboardUrl:
        "https://bailian.console.aliyun.com/?spm=5176.28103460.0.0.3e0f5d27X1A3vD&apiKey=1",
    }),
    /**
     * 运行时配置
     * @type {Object}
     */
    runtime: Object.freeze({
      /** @type {Object} 重试策略 */
      retryPolicy: DEFAULT_RETRY_POLICY,
      /** @type {Object} 健康检查配置 */
      healthCheck: DEFAULT_HEALTH_CHECK,
    }),
  }),
  /**
   * Moonshot AI (月之暗面) 提供商配置
   * @type {Object}
   */
  Object.freeze({
    /** @type {string} 提供商唯一标识符 */
    id: "moonshot",
    /** @type {string} 提供商显示名称 */
    label: "Moonshot AI (月之暗面)",
    /** @type {string} 兼容模式标识 */
    compatMode: "openai-compatible",
    /** @type {string} 默认使用的模型 */
    defaultModel: "kimi-k2.5",
    /** @type {string} 用于健康检查的测试模型 */
    testModel: "moonshot-v1-8k",
    /** @type {Array<string>} 支持的模型列表 */
    supportedModels: [
      "kimi-k2.5",
      "moonshot-v1-8k",
      "moonshot-v1-32k",
      "moonshot-v1-128k",
    ],
    /**
     * API 配置
     * @type {Object}
     */
    api: {
      /** @type {string} API 基础 URL */
      baseUrl: normalizeBaseUrl("https://api.moonshot.cn/v1"),
      /**
       * 构建 API 路径
       * @returns {string} API 路径
       */
      pathBuilder: () => "/chat/completions",
      /**
       * 构建请求头
       * @param {Object} context - 上下文对象
       * @param {string} context.apiKey - API 密钥
       * @returns {Object} 请求头对象
       */
      headers: ({ apiKey }) => ({
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      }),
      /**
       * 构建请求负载(payload)
       * @param {Object} context - 上下文对象
       * @returns {Object} 请求负载对象
       */
      payloadBuilder: ({ modelName, prompt, options = {} }) => {
        const payload = {
          model: modelName,
          messages: options.messages ?? [
            {
              role: "user",
              content: prompt,
            },
          ],
          temperature: options.temperature ?? 0.3,
          max_tokens: options.maxTokens ?? 2000,
        };
        if (options.responseFormat) {
          payload.response_format = options.responseFormat;
        }
        if (options.extraPayload) {
          Object.assign(payload, options.extraPayload);
        }
        return payload;
      },
      /**
       * 解析 API 响应
       * @param {Object} context - 上下文对象
       * @returns {string} 提取的文本内容
       */
      responseParser: ({ data }) => data?.choices?.[0]?.message?.content ?? "",
    },
    /** @type {Uint8Array} API 密钥加密使用的盐值 */
    encryptionSalt: MOONSHOT_SALT,
    /** @type {Array<string>} 需要的主机权限(用于 manifest) */
    hostPermissions: Object.freeze(["https://api.moonshot.cn/*"]),
    /**
     * UI 相关配置
     * @type {Object}
     */
    ui: Object.freeze({
      /** @type {string} API 密钥输入框的标签 */
      apiKeyLabel: "Moonshot API Key",
      /** @type {string} API 密钥输入框的占位符 */
      apiKeyPlaceholder: "sk-...",
      /** @type {string} API 文档链接 */
      docsUrl: "https://platform.moonshot.cn/docs/api/chat-completions",
      /** @type {string} API 密钥管理面板链接 */
      dashboardUrl: "https://platform.moonshot.cn/console/api-keys",
    }),
    /**
     * 运行时配置
     * @type {Object}
     */
    runtime: Object.freeze({
      /** @type {Object} 重试策略 */
      retryPolicy: DEFAULT_RETRY_POLICY,
      /** @type {Object} 健康检查配置 */
      healthCheck: DEFAULT_HEALTH_CHECK,
    }),
  }),
]);

/**
 * 提供商索引 Map
 * 用于快速根据 ID 查找提供商配置
 * @constant {Map<string, Object>}
 * @private
 */
const PROVIDER_INDEX = new Map(
  PROVIDERS.map((provider) => [provider.id, provider]),
);

/**
 * 获取所有提供商配置
 *
 * @returns {Array<Object>} 所有提供商配置的数组
 * @example
 * const providers = getAllProviders();
 * console.log(providers.map(p => p.id)); // ["google", "openai", "anthropic"]
 */
export function getAllProviders() {
  return PROVIDERS;
}

/**
 * 根据 ID 获取提供商配置
 *
 * @param {string} providerId - 提供商 ID
 * @returns {Object|null} 提供商配置对象,如果未找到则返回 null
 * @example
 * const google = getProviderById("google");
 * console.log(google.label); // "Google Gemini"
 *
 * const unknown = getProviderById("unknown");
 * console.log(unknown); // null
 */
export function getProviderById(providerId) {
  return PROVIDER_INDEX.get(providerId) ?? null;
}

/**
 * 获取默认提供商 ID
 *
 * @returns {string} 默认提供商的 ID
 * @example
 * const defaultId = getDefaultProviderId();
 * console.log(defaultId); // "google"
 */
export function getDefaultProviderId() {
  return DEFAULT_PROVIDER_ID;
}

/**
 * 获取提供商回退顺序
 *
 * @returns {Array<string>} 提供商 ID 的回退顺序数组
 * @example
 * const fallback = getFallbackOrder();
 * console.log(fallback); // ["google", "openai", "anthropic"]
 */
export function getFallbackOrder() {
  return FALLBACK_ORDER;
}

/**
 * 获取 manifest 所需的所有主机权限
 * 合并基础权限和所有提供商的主机权限
 *
 * @returns {Array<string>} 去重并排序后的主机权限数组
 * @example
 * const permissions = getAllManifestHostPermissions();
 * // [
 * //   "http://127.0.0.1:8765/*",
 * //   "https://api.anthropic.com/*",
 * //   "https://api.openai.com/*",
 * //   "https://generativelanguage.googleapis.com/*"
 * // ]
 */
export function getAllManifestHostPermissions() {
  const permissions = new Set(BASE_HOST_PERMISSIONS);
  for (const provider of PROVIDERS) {
    // 验证 hostPermissions 是否为数组
    if (!Array.isArray(provider.hostPermissions)) {
      continue;
    }
    // 添加每个有效的主机权限
    for (const origin of provider.hostPermissions) {
      if (typeof origin === "string" && origin.trim()) {
        permissions.add(origin.trim());
      }
    }
  }
  return Array.from(permissions).sort();
}

/**
 * 构建 API 请求配置
 * 根据提供商配置和上下文生成完整的 fetch 请求配置
 *
 * @param {Object} providerConfig - 提供商配置对象
 * @param {Object} context - 请求上下文
 * @param {string} [context.apiKey] - API 密钥
 * @param {string} [context.modelName] - 模型名称
 * @param {string} [context.prompt] - 用户提示词
 * @param {Object} [context.options] - 可选配置
 * @param {string} [context.overrideBaseUrl] - 覆盖默认的基础 URL
 * @returns {Object} 请求配置对象
 * @returns {string} returns.url - 完整的请求 URL
 * @returns {Object} returns.init - fetch 初始化选项(method、headers、body 等)
 * @returns {Function} returns.responseParser - 响应解析函数
 * @returns {Function} [returns.errorParser] - 错误解析函数(可选)
 *
 * @example
 * const config = buildRequestConfig(
 *   getProviderById("google"),
 *   {
 *     apiKey: "YOUR_API_KEY",
 *     modelName: "gemini-2.5-flash-lite",
 *     prompt: "こんにちは",
 *     options: { maxTokens: 100 }
 *   }
 * );
 * const response = await fetch(config.url, config.init);
 * const data = await response.json();
 * const text = config.responseParser({ data });
 */
export function buildRequestConfig(providerConfig, context) {
  const apiConfig = providerConfig.api;

  // 构建 API 路径
  const path = ensureLeadingSlash(apiConfig.pathBuilder(context));

  // 确定基础 URL(优先使用覆盖的 URL)
  const baseUrl = context.overrideBaseUrl
    ? normalizeBaseUrl(context.overrideBaseUrl)
    : apiConfig.baseUrl;

  // 构建完整 URL
  const url = `${baseUrl}${path}`;

  // 构建请求头
  const headers = apiConfig.headers(context) ?? {};

  // 构建请求负载
  const payload = apiConfig.payloadBuilder(context);

  // 初始化 fetch 配置
  const init = {
    method: apiConfig.method ?? "POST", // 默认使用 POST 方法
    headers: { ...headers },
  };

  // 添加请求体(如果有负载)
  if (payload !== undefined) {
    init.body = typeof payload === "string" ? payload : JSON.stringify(payload);
  }

  // 合并自定义 fetch 选项
  if (context.options?.fetchOptions) {
    const { fetchOptions } = context.options;
    const extra = { ...fetchOptions };

    // 特殊处理请求头:合并而不是覆盖
    if (extra.headers) {
      init.headers = {
        ...init.headers,
        ...extra.headers,
      };
      delete extra.headers;
    }

    // 合并其他选项
    Object.assign(init, extra);
  }

  return {
    url,
    init,
    responseParser: apiConfig.responseParser,
    errorParser: apiConfig.errorParser,
  };
}
