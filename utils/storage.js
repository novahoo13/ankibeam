/**
 * @fileoverview 设置存储管理模块
 *
 * 该模块负责处理 Anki Word Assistant 的所有配置存储操作，包括：
 * - 配置的保存和加载
 * - API 密钥的加密和解密
 * - 配置版本的迁移和合并
 * - 提供商配置的规范化
 * - 配置的默认值管理
 *
 * 使用 AES-GCM 加密算法保护 API 密钥，每个提供商使用独立的加密盐值。
 * 支持从旧版本配置自动迁移到新版本，保持向后兼容性。
 */

import { normalizePromptTemplateConfig } from "./prompt-engine.js";
import {
  getAllProviders,
  getDefaultProviderId,
  getFallbackOrder,
  getProviderById,
} from "./providers.config.js";

/** @const {string} 存储配置的键名 */
const CONFIG_KEY = "ankiWordAssistantConfig";

/** @const {string} 当前配置版本号 */
export const CONFIG_VERSION = "2.3";

/** @const {string} 加密密钥材料（用于生成加密密钥） */
const ENCRYPTION_KEY_MATERIAL = "anki-word-assistant-secret-key";

/** @const {number} 初始化向量的长度（字节） */
const IV_LENGTH = 12;

/**
 * 旧版提供商 ID 映射表
 * 用于将旧版本的提供商标识符映射到新版本的规范标识符
 * @const {Object.<string, string>}
 */
const LEGACY_PROVIDER_ID_MAP = Object.freeze({
  gemini: "google",
  claude: "anthropic",
  claude3: "anthropic",
  gpt: "openai",
});

/**
 * 有效的健康状态值集合
 * @const {Set<string>}
 */
const VALID_HEALTH_STATUSES = new Set(["unknown", "healthy", "error"]);

/**
 * 构建指定提供商的默认模型状态
 * @param {Object} provider - 提供商配置对象
 * @returns {Object} 包含默认值的模型状态对象
 */
function buildDefaultModelState(provider) {
  return {
    apiKey: "", // API 密钥（加密存储）
    modelName: provider.defaultModel ?? "", // 模型名称
    apiUrl: getDefaultApiUrl(provider), // API 端点 URL
    healthStatus: "unknown", // 健康状态: unknown/healthy/error
    lastHealthCheck: null, // 最后一次健康检查时间戳
    lastErrorMessage: "", // 最后一次错误信息
  };
}

/**
 * 获取提供商的默认 API URL
 * 根据不同的提供商返回对应的默认 API 端点
 * @param {Object} provider - 提供商配置对象
 * @returns {string} 默认的 API URL
 */
function getDefaultApiUrl(provider) {
  const base = provider.api.baseUrl;
  switch (provider.id) {
    case "google":
      return `${base}/models`;
    case "anthropic":
      return `${base}/messages`;
    default:
      return base;
  }
}

/**
 * 构建默认配置对象
 * 包含所有配置项的初始默认值
 * @returns {Object} 完整的默认配置对象
 */
function buildDefaultConfig() {
  const providers = getAllProviders();
  const models = {};
  // 为每个提供商初始化默认模型状态
  for (const provider of providers) {
    models[provider.id] = buildDefaultModelState(provider);
  }

  return {
    version: CONFIG_VERSION, // 配置版本号
    aiConfig: {
      provider: getDefaultProviderId(), // 当前使用的提供商 ID
      models, // 各提供商的模型配置
      fallbackOrder: Array.from(getFallbackOrder()), // 提供商回退顺序
    },
    promptTemplates: {
      custom: "", // 自定义提示词模板
      promptTemplatesByModel: {}, // 按模型分类的提示词模板
    },
    ankiConfig: {
      defaultDeck: "", // 默认牌组
      defaultModel: "", // 默认笔记模板
      modelFields: [], // 笔记模板字段
      defaultTags: [], // 默认标签
    },
    ui: {
      fieldDisplayMode: "auto", // 字段显示模式
      enableFloatingAssistant: true, // 是否启用悬浮助手
    },
    styleConfig: {
      fontSize: "14px", // 字体大小
      textAlign: "left", // 文本对齐方式
      lineHeight: "1.4", // 行高
    },
    language: "zh-CN", // 界面语言
  };
}

/**
 * 规范化提供商 ID
 * 将用户输入的提供商标识符转换为规范的提供商 ID，支持旧版本别名映射
 * @param {string} providerId - 原始提供商 ID
 * @returns {string|null} 规范化后的提供商 ID，如果无效则返回 null
 */
function normalizeProviderId(providerId) {
  if (typeof providerId !== "string") {
    return null;
  }
  const trimmed = providerId.trim().toLowerCase();
  if (!trimmed) {
    return null;
  }
  // 尝试直接匹配提供商
  const provider = getProviderById(trimmed);
  if (provider) {
    return provider.id;
  }
  // 尝试使用旧版别名映射
  const alias = LEGACY_PROVIDER_ID_MAP[trimmed];
  if (alias) {
    const aliasedProvider = getProviderById(alias);
    if (aliasedProvider) {
      return aliasedProvider.id;
    }
  }
  return null;
}

/**
 * 确定当前激活的提供商
 * 如果原始提供商 ID 有效则使用它，否则使用默认提供商
 * @param {string} rawProvider - 原始提供商 ID
 * @param {string} defaultProvider - 默认提供商 ID
 * @returns {string} 有效的提供商 ID
 */
function determineActiveProvider(rawProvider, defaultProvider) {
  const canonical = normalizeProviderId(rawProvider);
  if (canonical) {
    return canonical;
  }
  return defaultProvider ?? getDefaultProviderId();
}

/**
 * 获取指定提供商的加密盐值
 * 如果找不到指定提供商的盐值，则使用默认提供商的盐值
 * @param {string} providerId - 提供商 ID
 * @returns {Uint8Array} 加密盐值
 */
function getEncryptionSalt(providerId) {
  const canonical = normalizeProviderId(providerId) ?? getDefaultProviderId();
  const provider = getProviderById(canonical);
  if (provider?.encryptionSalt instanceof Uint8Array) {
    return provider.encryptionSalt;
  }
  console.warn(
    `[storage] 提供商 ${
      providerId ?? "unknown"
    } 的加密盐值未找到，使用默认提供商。`
  );
  const fallback = getProviderById(getDefaultProviderId());
  if (fallback?.encryptionSalt instanceof Uint8Array) {
    return fallback.encryptionSalt;
  }
  // 如果都找不到，返回一个空的 16 字节数组
  return new Uint8Array(16);
}

/**
 * 规范化健康状态值
 * 确保状态值为有效的健康状态之一
 * @param {string} status - 原始状态值
 * @returns {string} 规范化后的状态值，默认为 "unknown"
 */
function normalizeHealthStatus(status) {
  if (typeof status !== "string") {
    return "unknown";
  }
  const normalized = status.trim().toLowerCase();
  return VALID_HEALTH_STATUSES.has(normalized) ? normalized : "unknown";
}

/**
 * 清理和验证 API URL
 * @param {string} rawUrl - 原始 URL 字符串
 * @returns {string|null} 清理后的 URL，如果无效则返回 null
 */
function sanitizeApiUrl(rawUrl) {
  if (typeof rawUrl !== "string") {
    return null;
  }
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    return null;
  }
  return trimmed;
}

/**
 * 从模型状态中提取最后的错误消息
 * 优先使用 lastErrorMessage，如果不存在则尝试 healthMessage
 * @param {Object} modelState - 模型状态对象
 * @returns {string|undefined} 错误消息，如果都不存在则返回 undefined
 */
function pickLastErrorMessage(modelState) {
  if (typeof modelState.lastErrorMessage === "string") {
    return modelState.lastErrorMessage;
  }
  if (typeof modelState.healthMessage === "string") {
    return modelState.healthMessage;
  }
  return undefined;
}

/**
 * 合并模型状态
 * 将原始状态数据与基础状态合并，验证并规范化各个字段
 * @param {Object} baseState - 基础模型状态（包含默认值）
 * @param {Object} rawState - 原始状态数据（从存储中读取）
 * @param {Object} provider - 提供商配置对象
 * @returns {Object} 合并后的模型状态
 */
function mergeModelState(baseState, rawState, provider) {
  if (!rawState || typeof rawState !== "object") {
    return { ...baseState };
  }

  const merged = { ...baseState };

  // 合并 API 密钥
  if (typeof rawState.apiKey === "string") {
    merged.apiKey = rawState.apiKey;
  }

  // 合并模型名称（去除首尾空格）
  if (typeof rawState.modelName === "string" && rawState.modelName.trim()) {
    merged.modelName = rawState.modelName.trim();
  }

  // 合并 API URL（清理并验证）
  const overrideUrl = sanitizeApiUrl(rawState.apiUrl);
  if (overrideUrl) {
    merged.apiUrl = overrideUrl;
  }

  // 规范化健康状态
  merged.healthStatus = normalizeHealthStatus(rawState.healthStatus);

  // 合并最后健康检查时间
  if (rawState.lastHealthCheck === null) {
    merged.lastHealthCheck = null;
  } else if (
    typeof rawState.lastHealthCheck === "number" &&
    Number.isFinite(rawState.lastHealthCheck)
  ) {
    merged.lastHealthCheck = rawState.lastHealthCheck;
  }

  // 提取并合并错误消息
  const errorMessage = pickLastErrorMessage(rawState);
  if (errorMessage !== undefined) {
    merged.lastErrorMessage = errorMessage;
  }

  return merged;
}

/**
 * 规范化回退顺序
 * 验证并清理提供商的回退顺序，确保只包含有效的提供商且无重复
 * @param {Array<string>} order - 原始回退顺序数组
 * @returns {Array<string>} 规范化后的回退顺序数组
 */
function normalizeFallbackOrder(order) {
  const baseOrder = Array.from(getFallbackOrder());
  const normalized = [];
  const seen = new Set();

  // 处理用户提供的顺序
  if (Array.isArray(order)) {
    for (const rawId of order) {
      const canonical = normalizeProviderId(rawId);
      // 跳过无效的提供商 ID
      if (!canonical) {
        continue;
      }
      // 跳过不在基础顺序中的提供商
      if (!baseOrder.includes(canonical)) {
        continue;
      }
      // 跳过重复的提供商
      if (seen.has(canonical)) {
        continue;
      }
      seen.add(canonical);
      normalized.push(canonical);
    }
  }

  // 添加用户未指定的提供商（按基础顺序）
  for (const providerId of baseOrder) {
    if (!seen.has(providerId)) {
      seen.add(providerId);
      normalized.push(providerId);
    }
  }

  return normalized;
}

/**
 * 合并 AI 配置
 * 将旧配置与基础配置合并，确保所有提供商都有有效的模型状态
 * @param {Object} baseAiConfig - 基础 AI 配置
 * @param {Object} legacyAiConfig - 旧的 AI 配置
 * @returns {Object} 合并后的 AI 配置
 */
function mergeAiConfig(baseAiConfig, legacyAiConfig = {}) {
  const merged = {
    provider: determineActiveProvider(
      legacyAiConfig.provider,
      baseAiConfig.provider
    ),
    fallbackOrder: normalizeFallbackOrder(legacyAiConfig.fallbackOrder),
    models: { ...baseAiConfig.models },
  };

  // 合并旧配置中的模型状态
  const legacyModels = legacyAiConfig.models;
  if (legacyModels && typeof legacyModels === "object") {
    for (const [rawId, rawState] of Object.entries(legacyModels)) {
      const canonical = normalizeProviderId(rawId);
      if (!canonical) {
        continue;
      }
      const provider = getProviderById(canonical);
      if (!provider) {
        continue;
      }
      const baseState =
        merged.models[canonical] ?? buildDefaultModelState(provider);
      merged.models[canonical] = mergeModelState(baseState, rawState, provider);
    }
  }

  // 确保所有提供商都有模型状态
  for (const provider of getAllProviders()) {
    if (!merged.models[provider.id]) {
      merged.models[provider.id] = buildDefaultModelState(provider);
    }
  }

  return merged;
}

/**
 * 合并提示词模板配置
 * @param {Object} baseTemplates - 基础模板配置
 * @param {Object} legacyTemplates - 旧的模板配置
 * @returns {Object} 合并后的模板配置
 */
function mergePromptTemplates(baseTemplates, legacyTemplates) {
  const merged = {
    ...baseTemplates,
    ...legacyTemplates,
    promptTemplatesByModel: {
      ...(baseTemplates.promptTemplatesByModel || {}),
      ...(legacyTemplates?.promptTemplatesByModel || {}),
    },
  };

  // 确保 custom 字段是字符串
  if (typeof merged.custom !== "string") {
    merged.custom = baseTemplates.custom;
  }

  // 确保 promptTemplatesByModel 是有效对象
  if (
    !merged.promptTemplatesByModel ||
    typeof merged.promptTemplatesByModel !== "object"
  ) {
    merged.promptTemplatesByModel = {};
  }

  return merged;
}

/**
 * 合并 Anki 配置
 * @param {Object} baseConfig - 基础 Anki 配置
 * @param {Object} legacyConfig - 旧的 Anki 配置
 * @returns {Object} 合并后的 Anki 配置
 */
function mergeAnkiConfig(baseConfig, legacyConfig) {
  const merged = {
    ...baseConfig,
    ...(legacyConfig && typeof legacyConfig === "object" ? legacyConfig : {}),
  };

  // 确保 modelFields 是数组
  if (!Array.isArray(merged.modelFields)) {
    merged.modelFields = Array.isArray(baseConfig.modelFields)
      ? [...baseConfig.modelFields]
      : [];
  }

  // 确保 defaultTags 是数组
  if (!Array.isArray(merged.defaultTags)) {
    merged.defaultTags = Array.isArray(baseConfig.defaultTags)
      ? [...baseConfig.defaultTags]
      : [];
  }

  // 确保 promptTemplatesByModel 是有效对象
  if (
    !merged.promptTemplatesByModel ||
    typeof merged.promptTemplatesByModel !== "object"
  ) {
    merged.promptTemplatesByModel = {};
  }

  return merged;
}

/**
 * 合并样式配置
 * @param {Object} baseStyle - 基础样式配置
 * @param {Object} legacyStyle - 旧的样式配置
 * @returns {Object} 合并后的样式配置
 */
function mergeStyleConfig(baseStyle, legacyStyle) {
  if (!legacyStyle || typeof legacyStyle !== "object") {
    return { ...baseStyle };
  }
  return {
    ...baseStyle,
    ...legacyStyle,
  };
}

/**
 * 合并 UI 配置
 * @param {Object} baseUi - 基础 UI 配置
 * @param {Object} legacyUi - 旧的 UI 配置
 * @returns {Object} 合并后的 UI 配置
 */
function mergeUiConfig(baseUi, legacyUi) {
  if (!legacyUi || typeof legacyUi !== "object") {
    return { ...baseUi };
  }
  const merged = {
    ...baseUi,
    ...legacyUi,
  };
  // 验证 fieldDisplayMode 字段
  if (typeof merged.fieldDisplayMode !== "string") {
    merged.fieldDisplayMode = baseUi.fieldDisplayMode;
  }
  // 验证 enableFloatingAssistant 字段
  if (typeof merged.enableFloatingAssistant !== "boolean") {
    merged.enableFloatingAssistant = baseUi.enableFloatingAssistant;
  }
  return merged;
}

/**
 * 将旧配置与默认配置合并
 * 这是配置迁移的核心函数，确保所有配置字段都有有效值
 * @param {Object} legacyConfig - 旧的配置对象
 * @returns {Object} 合并后的完整配置对象
 */
function mergeConfigWithDefaults(legacyConfig = {}) {
  const baseConfig = buildDefaultConfig();
  const merged = {
    ...baseConfig,
    aiConfig: mergeAiConfig(baseConfig.aiConfig, legacyConfig.aiConfig),
    promptTemplates: mergePromptTemplates(
      baseConfig.promptTemplates,
      legacyConfig.promptTemplates
    ),
    ankiConfig: mergeAnkiConfig(baseConfig.ankiConfig, legacyConfig.ankiConfig),
    styleConfig: mergeStyleConfig(
      baseConfig.styleConfig,
      legacyConfig.styleConfig
    ),
    ui: mergeUiConfig(baseConfig.ui, legacyConfig.ui),
    language:
      typeof legacyConfig.language === "string"
        ? legacyConfig.language
        : baseConfig.language,
  };

  // 保留旧配置中未被处理的自定义字段
  for (const [key, value] of Object.entries(legacyConfig)) {
    if (key in merged) {
      continue;
    }
    merged[key] = value;
  }

  return merged;
}

/**
 * 规范化存储中的提示词模板配置
 * 确保提示词模板配置结构正确，并对每个模型的模板进行规范化处理
 * @param {Object} config - 配置对象（会被直接修改）
 */
function normalizePromptTemplatesStore(config) {
  if (!config) {
    return;
  }

  // 确保 promptTemplates 字段存在
  if (!config.promptTemplates) {
    config.promptTemplates = {
      custom: "",
      promptTemplatesByModel: {},
    };
  }

  const map = config.promptTemplates.promptTemplatesByModel;
  if (!map || typeof map !== "object") {
    config.promptTemplates.promptTemplatesByModel = {};
    return;
  }

  // 规范化每个模型的模板配置
  const normalized = {};
  Object.keys(map).forEach((modelName) => {
    normalized[modelName] = normalizePromptTemplateConfig(map[modelName]);
  });

  config.promptTemplates.promptTemplatesByModel = normalized;
}

/**
 * 生成派生加密密钥
 * 使用 PBKDF2 算法从密钥材料和提供商特定的盐值生成 AES-GCM 加密密钥
 * @param {string} providerId - 提供商 ID
 * @returns {Promise<CryptoKey>} 派生的加密密钥
 */
async function getDerivedKey(providerId = getDefaultProviderId()) {
  const encoder = new TextEncoder();
  // 导入密钥材料
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(ENCRYPTION_KEY_MATERIAL),
    { name: "PBKDF2" },
    false,
    ["deriveKey"]
  );

  // 获取提供商特定的盐值
  const salt = getEncryptionSalt(providerId);

  // 使用 PBKDF2 派生加密密钥
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations: 100000, // 迭代次数
      hash: "SHA-256", // 哈希算法
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 }, // 生成 256 位 AES-GCM 密钥
    true,
    ["encrypt", "decrypt"]
  );
}

/**
 * 使用提供商特定的盐值加密 API 密钥
 * 使用 AES-GCM 算法加密 API 密钥，并将初始化向量（IV）与密文组合后进行 Base64 编码
 * @param {string} key - 要加密的 API 密钥
 * @param {string} providerId - 提供商 ID
 * @returns {Promise<string|null>} Base64 编码的加密结果，如果密钥为空则返回 null
 */
export async function encryptApiKey(key, providerId = getDefaultProviderId()) {
  if (!key) {
    return null;
  }

  // 获取派生密钥
  const derivedKey = await getDerivedKey(providerId);
  // 生成随机初始化向量
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const encoder = new TextEncoder();
  const encodedKey = encoder.encode(key);

  // 使用 AES-GCM 加密
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    derivedKey,
    encodedKey
  );

  // 将 IV 和密文组合
  const combined = new Uint8Array(iv.length + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), iv.length);

  // Base64 编码
  return btoa(String.fromCharCode.apply(null, combined));
}

/**
 * 解密已保存的 API 密钥
 * 将 Base64 编码的加密数据解密为原始 API 密钥
 * @param {string} encryptedBase64 - Base64 编码的加密数据
 * @param {string} providerId - 提供商 ID
 * @returns {Promise<string|null>} 解密后的 API 密钥，解密失败则返回 null
 */
export async function decryptApiKey(
  encryptedBase64,
  providerId = getDefaultProviderId()
) {
  if (!encryptedBase64) {
    return null;
  }

  try {
    // 获取派生密钥
    const derivedKey = await getDerivedKey(providerId);

    // Base64 解码并分离 IV 和密文
    const combined = new Uint8Array(
      atob(encryptedBase64)
        .split("")
        .map((c) => c.charCodeAt(0))
    );
    const iv = combined.slice(0, IV_LENGTH);
    const ciphertext = combined.slice(IV_LENGTH);

    // 使用 AES-GCM 解密
    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      derivedKey,
      ciphertext
    );

    const decoder = new TextDecoder();
    return decoder.decode(decrypted);
  } catch (error) {
    console.error(`[storage] 提供商 ${providerId} 的 API 密钥解密失败:`, error);
    return null;
  }
}

/**
 * 迁移配置到最新版本
 * 检测配置版本并执行必要的迁移操作，确保配置结构与当前版本兼容
 * @param {Object} legacyConfig - 旧版本的配置对象
 * @returns {Object} 迁移后的配置对象
 */
function migrateConfig(legacyConfig) {
  if (!legacyConfig) {
    return buildDefaultConfig();
  }

  const needsMigration = legacyConfig.version !== CONFIG_VERSION;
  if (needsMigration) {
    console.info("[storage] 检测到旧版配置，正在更新架构。");
  }

  // 将旧配置与默认配置合并
  const merged = mergeConfigWithDefaults(legacyConfig);
  merged.version = CONFIG_VERSION;

  if (needsMigration) {
    console.info("[storage] 配置迁移完成。");
  }

  return merged;
}

/**
 * 从 Chrome 存储中读取数据
 * 兼容 Promise 和回调两种 API 形式
 * @param {string} key - 存储键名
 * @returns {Promise<Object>} 存储的数据对象
 */
async function readFromStorage(key) {
  if (!chrome?.storage?.local?.get) {
    return {};
  }

  const getter = chrome.storage.local.get.bind(chrome.storage.local);

  // 检查是否支持 Promise API（Chrome 新版本）
  if (chrome.storage.local.get.length <= 1) {
    const result = getter(key);
    if (result && typeof result.then === "function") {
      return result;
    }
  }

  // 使用回调 API（Chrome 旧版本）
  return new Promise((resolve, reject) => {
    try {
      getter(key, (value) => {
        const lastError = chrome.runtime?.lastError;
        if (lastError) {
          reject(new Error(lastError.message));
          return;
        }
        resolve(value);
      });
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * 向 Chrome 存储中写入数据
 * 兼容 Promise 和回调两种 API 形式
 * @param {Object} items - 要存储的数据对象
 * @returns {Promise<void>}
 */
async function writeToStorage(items) {
  if (!chrome?.storage?.local?.set) {
    return;
  }

  const setter = chrome.storage.local.set.bind(chrome.storage.local);

  // 检查是否支持 Promise API（Chrome 新版本）
  if (chrome.storage.local.set.length <= 1) {
    const result = setter(items);
    if (result && typeof result.then === "function") {
      await result;
      return;
    }
  }

  // 使用回调 API（Chrome 旧版本）
  await new Promise((resolve, reject) => {
    try {
      setter(items, () => {
        const lastError = chrome.runtime?.lastError;
        if (lastError) {
          reject(new Error(lastError.message));
          return;
        }
        resolve();
      });
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * 将配置持久化到存储
 * 在保存前会执行以下操作：
 * 1. 深拷贝配置以避免修改原对象
 * 2. 迁移配置到最新版本
 * 3. 规范化提示词模板
 * 4. 加密所有 API 密钥
 * 5. 保存到 Chrome 存储
 * @param {Object} config - 要保存的配置对象
 * @returns {Promise<void>}
 */
export async function saveConfig(config) {
  // 深拷贝配置对象
  const clone = JSON.parse(JSON.stringify(config));
  // 迁移到最新版本
  const canonical = migrateConfig(clone);

  // 规范化提示词模板
  normalizePromptTemplatesStore(canonical);
  canonical.version = CONFIG_VERSION;

  // 加密所有提供商的 API 密钥
  if (canonical.aiConfig?.models) {
    for (const [providerId, modelState] of Object.entries(
      canonical.aiConfig.models
    )) {
      const apiKey = modelState?.apiKey;
      if (apiKey) {
        canonical.aiConfig.models[providerId].apiKey = await encryptApiKey(
          apiKey,
          providerId
        );
      }
    }
  }

  // 写入存储
  await writeToStorage({ [CONFIG_KEY]: canonical });
}

/**
 * 从存储中加载配置
 * 执行以下操作：
 * 1. 从 Chrome 存储读取配置
 * 2. 迁移配置到最新版本
 * 3. 规范化提示词模板
 * 4. 解密所有 API 密钥
 * 5. 如果没有保存的配置或发生错误，返回默认配置
 * @returns {Promise<Object>} 加载并处理后的配置对象
 */
export async function loadConfig() {
  try {
    const result = await readFromStorage(CONFIG_KEY);
    let config = result[CONFIG_KEY];

    if (!config) {
      console.info("[storage] 未找到已保存的配置，返回默认值。");
      return buildDefaultConfig();
    }

    // 迁移到最新版本
    const migrated = migrateConfig(config);
    // 规范化提示词模板
    normalizePromptTemplatesStore(migrated);

    // 解密所有提供商的 API 密钥
    if (migrated.aiConfig?.models) {
      for (const [providerId, modelState] of Object.entries(
        migrated.aiConfig.models
      )) {
        const encryptedKey = modelState?.apiKey;
        if (!encryptedKey) {
          continue;
        }

        try {
          const decrypted = await decryptApiKey(encryptedKey, providerId);
          migrated.aiConfig.models[providerId].apiKey = decrypted ?? "";
        } catch (error) {
          console.warn(
            `[storage] 提供商 ${providerId} 的 API 密钥解密失败，已初始化为空字符串。`,
            error
          );
          migrated.aiConfig.models[providerId].apiKey = "";
        }
      }
    }

    return migrated;
  } catch (error) {
    console.error("[storage] 配置加载时发生错误:", error);
    return buildDefaultConfig();
  }
}

/**
 * 生成默认配置
 * 返回一个包含所有默认值的新配置对象
 * @returns {Object} 默认配置对象
 */
export function getDefaultConfig() {
  return buildDefaultConfig();
}
