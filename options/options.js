/**
 * @fileoverview options.js - 选项配置页面
 * @description 负责选项配置页面的显示、设置保存以及各种连接测试功能
 * @module options/options
 * @requires utils/storage
 * @requires utils/ankiconnect
 * @requires utils/ai-service
 * @requires utils/prompt-engine
 * @requires utils/providers.config
 * @requires utils/i18n
 */

import {
  CONFIG_VERSION,
  saveConfig,
  loadConfig,
  getDefaultConfig,
  decryptApiKey,
} from "../utils/storage.js";
import {
  testConnection as testAnki,
  getDeckNames,
  getModelNames,
  getModelNamesAndIds,
  getModelFieldNames,
} from "../utils/ankiconnect.js";
import { testConnection as testAi } from "../utils/ai-service.js";

import {
  getAllProviders,
  getDefaultProviderId,
  getFallbackOrder,
  getAllManifestHostPermissions,
} from "../utils/providers.config.js";
import {
  translate,
  createI18nError,
  getLocale,
  resetLocaleCache,
  whenI18nReady,
  localizePage,
} from "../utils/i18n.js";
import {
  loadTemplateLibrary,
  getTemplateById,
  saveTemplate,
  deleteTemplate,
  setDefaultTemplate,
  setActiveTemplate,
  listTemplates,
  getActiveTemplate,
  getDefaultTemplate,
  normalizeTemplateFields,
} from "../utils/template-store.js";

/**
 * 获取国际化文本的便捷方法
 * @param {string} key - 国际化消息键
 * @param {string} fallback - 回退文本
 * @param {Array} [substitutions] - 替换参数数组
 * @returns {string} 翻译后的文本
 */
const translationCache = new Map();
const getText = (key, fallback, substitutions) => {
  const cacheKey = `${getLocale()}::${key}::${
    substitutions ? JSON.stringify(substitutions) : ""
  }`;
  if (translationCache.has(cacheKey)) {
    return translationCache.get(cacheKey);
  }
  const value = translate(key, { fallback, substitutions });
  translationCache.set(cacheKey, value);
  return value;
};

/**
 * 支持的语言和消息键的对应表
 * @type {Object<string, string>}
 * @constant
 */
const LANGUAGE_NAME_KEY_BY_LOCALE = Object.freeze({
  "zh-CN": "options_language_chinese_simplified",
  "zh-TW": "options_language_chinese_traditional",
  "ja-JP": "options_language_japanese",
  "en-US": "options_language_english",
});

/**
 * 解析当前语言名称的工具函数
 * @param {string} locale - 语言代码（如 "zh-CN", "en-US"）
 * @returns {string} 本地化的语言名称
 */
function resolveCurrentLanguageName(locale) {
  if (!locale) {
    return "";
  }

  const messageKey = LANGUAGE_NAME_KEY_BY_LOCALE[locale];
  if (messageKey) {
    const localizedName = getText(messageKey, "");
    if (localizedName && localizedName !== messageKey) {
      return localizedName;
    }
  }

  if (typeof Intl !== "undefined" && typeof Intl.DisplayNames === "function") {
    try {
      const displayNames = new Intl.DisplayNames([getLocale()], {
        type: "language",
      });
      const directName = displayNames.of(locale);
      if (directName) {
        return directName;
      }
      const baseLocale = locale.split("-")[0];
      if (baseLocale) {
        const baseName = displayNames.of(baseLocale);
        if (baseName) {
          return baseName;
        }
      }
    } catch (error) {
      // console.warn("Intl.DisplayNames 失败:", error);
    }
  }

  return locale;
}

/**
 * API 密钥的实际值存储对象（DOM 中显示星号掩码）
 * @type {Object<string, string>}
 */
const actualApiKeys = Object.create(null);

function clearActualApiKeys() {
  Object.keys(actualApiKeys).forEach((key) => {
    actualApiKeys[key] = "";
  });
}

/**
 * 提供商 UI 组件注册表
 * @type {Map<string, Object>}
 */
const providerUiRegistry = new Map();

/**
 * 已解密的 API Key 缓存，key = `${providerId}:${ciphertext}`
 * @type {Map<string, string>}
 */
const apiKeyDecryptionCache = new Map();

/**
 * 最近一次从 storage 变更事件看到的密文缓存
 * @type {Map<string, string>}
 */
const encryptedApiKeyCache = new Map();

/**
 * 清单文件中声明的主机权限集合
 * @type {Set<string>}
 */
const manifestHostPermissionSet = new Set(
  getAllManifestHostPermissions() ?? [],
);

/**
 * 权限请求错误类
 * @class
 * @extends Error
 */
class PermissionRequestError extends Error {
  /**
   * 创建权限请求错误实例
   * @param {string} origin - 请求权限的源地址
   * @param {Error} [cause] - 导致错误的原因
   */
  constructor(origin, cause) {
    super(
      getText(
        "options_permission_request_error",
        `Failed to request permission for ${origin}`,
        [origin],
      ),
    );
    this.name = "PermissionRequestError";
    this.origin = origin;
    if (cause) {
      this.cause = cause;
    }
  }
}

/**
 * 依赖项覆盖对象（用于测试注入）
 * @type {Object}
 */
const dependencyOverrides = globalThis?.__ankiWordOptionsDeps ?? {};

/**
 * 存储 API 接口
 * @type {Object}
 */
const storageApi = dependencyOverrides.storage ?? {
  loadConfig,
  saveConfig,
  getDefaultConfig,
};

/**
 * AI 服务 API 接口
 * @type {Object}
 */
const aiServiceApi = dependencyOverrides.aiService ?? {
  testConnection: testAi,
};

/**
 * Anki API 接口
 * @type {Object}
 */
const ankiApi = dependencyOverrides.anki ?? {
  testConnection: testAnki,
  getDeckNames,
  getModelNames,
  getModelNamesAndIds,
  getModelFieldNames,
};

/**
 * 当前选中的 Anki 模型字段列表
 * @type {Array<string>}
 */
let currentModelFields = [];

/**
 * 当前配置对象
 * @type {Object}
 */
let currentConfig = {};

/**


/**
 * テンプレート編集器の状態オブジェクト
 * Template editor state object
 * @type {Object}
 * @property {string|null} currentTemplateId - 現在編集中のテンプレートID (null=新規作成)
 * @property {string} mode - 編集モード: 'create' | 'edit'
 * @property {Array<string>} availableFields - 利用可能なフィールドリスト
 * @property {Array<string>} selectedFields - 選択されたフィールドリスト
 * @property {Object} fieldConfigs - フィールド設定オブジェクト {fieldName: {parseInstruction, order}}
 * @property {string} lastGeneratedPrompt - 最後に生成されたPrompt内容
 */
const templateEditorState = {
  currentTemplateId: null,
  mode: "create",
  availableFields: [],
  selectedFields: [],
  fieldConfigs: {},
  lastGeneratedPrompt: "",
  modelNamesAndIds: {}, // 模型名称到ID的映射
  modelId: null, // 当前选中模型的ID
};

/**
 * API 密钥占位符常量
 * @type {string}
 * @constant
 */
const API_KEY_PLACEHOLDER = "********";

/**
 * 提供商事件是否已绑定的标志
 * @type {boolean}
 */
let providerEventsBound = false;

/**
 * 模板卡片事件是否已绑定
 * @type {boolean}
 */
let templateCardEventsBound = false;

/**
 * 模板字段选择事件是否已绑定
 * @type {boolean}
 */
let templateFieldSelectionEventsBound = false;

/**
 * Storage 变更处理节流相关
 */
const STORAGE_CHANGE_DEBOUNCE_MS = 500;
let pendingConfigChange = null;
let storageChangeTimer = null;

/**
 * 规范化 API 源地址模式
 * @param {string} apiUrl - API 地址
 * @returns {string|null} 规范化后的源地址模式，失败返回 null
 */
function normalizeApiOriginPattern(apiUrl) {
  if (typeof apiUrl !== "string") {
    return null;
  }
  const trimmed = apiUrl.trim();
  if (!trimmed) {
    return null;
  }

  try {
    const parsed = new URL(trimmed);
    const protocol = parsed.protocol;
    if (protocol !== "https:" && protocol !== "http:") {
      return null;
    }

    const hostname = parsed.hostname;
    if (!hostname) {
      return null;
    }

    if (hostname === "localhost") {
      return `${protocol}//localhost/*`;
    }

    if (hostname === "127.0.0.1") {
      if (parsed.port === "8765") {
        return `${protocol}//127.0.0.1:8765/*`;
      }
      return `${protocol}//127.0.0.1/*`;
    }

    const portSegment = parsed.port ? `:${parsed.port}` : "";
    return `${protocol}//${hostname}${portSegment}/*`;
  } catch {
    return null;
  }
}

/**
 * 检查是否包含指定源地址的权限
 * @param {string} origin - 源地址
 * @returns {Promise<boolean>} 是否包含该权限
 */
function containsOriginPermission(origin) {
  return new Promise((resolve, reject) => {
    try {
      chrome.permissions.contains({ origins: [origin] }, (result) => {
        const lastError = chrome.runtime?.lastError;
        if (lastError) {
          reject(new Error(lastError.message));
          return;
        }
        resolve(Boolean(result));
      });
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * 请求指定源地址的权限
 * @param {string} origin - 源地址
 * @returns {Promise<boolean>} 是否授予权限
 */
function requestOriginPermission(origin) {
  return new Promise((resolve, reject) => {
    try {
      chrome.permissions.request({ origins: [origin] }, (granted) => {
        const lastError = chrome.runtime?.lastError;
        if (lastError) {
          reject(new Error(lastError.message));
          return;
        }
        resolve(Boolean(granted));
      });
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * 确保所有 API 源地址拥有必要的权限
 * @param {Object} models - 模型配置对象
 * @returns {Promise<void>}
 * @throws {PermissionRequestError} 当权限请求失败时抛出
 */
async function ensureApiOriginsPermission(models) {
  if (
    !chrome?.permissions?.contains ||
    !chrome.permissions.request ||
    !models ||
    typeof models !== "object"
  ) {
    return;
  }

  const requiredOrigins = new Set();
  for (const modelState of Object.values(models)) {
    if (!modelState) {
      continue;
    }
    const origin = normalizeApiOriginPattern(modelState.apiUrl);
    if (!origin || manifestHostPermissionSet.has(origin)) {
      continue;
    }
    requiredOrigins.add(origin);
  }

  if (!requiredOrigins.size) {
    return;
  }

  for (const origin of requiredOrigins) {
    try {
      if (await containsOriginPermission(origin)) {
        continue;
      }
    } catch (error) {
      // console.warn('[options] 权限确认失败:', error);
      throw new PermissionRequestError(origin, error);
    }

    try {
      const granted = await requestOriginPermission(origin);
      if (!granted) {
        throw new PermissionRequestError(origin);
      }
    } catch (error) {
      if (error instanceof PermissionRequestError) {
        throw error;
      }
      // console.warn('[options] 权限请求发生错误:', error);
      throw new PermissionRequestError(origin, error);
    }
  }
}

/**
 * 初始化提供商 UI 界面
 * @description 创建并配置所有 AI 提供商的 UI 组件，包括下拉选择器和配置表单
 * @returns {void}
 */
function initProviderUI() {
  const select = document.getElementById("ai-provider");
  const container = document.getElementById("provider-config-container");
  if (!select || !container) {
    return;
  }

  providerUiRegistry.clear();
  for (const key of Object.keys(actualApiKeys)) {
    delete actualApiKeys[key];
  }

  const providers = getAllProviders();
  const defaultModels = storageApi.getDefaultConfig()?.aiConfig?.models ?? {};

  select.innerHTML = "";
  container.innerHTML = "";

  providers.forEach((provider, index) => {
    actualApiKeys[provider.id] = "";
    const option = document.createElement("option");
    option.value = provider.id;
    option.textContent = provider.label ?? provider.id;
    select.appendChild(option);

    const baseState = defaultModels[provider.id] ?? {};
    const section = createProviderSection(provider, baseState);
    if (index !== 0) {
      section.root.style.display = "none";
    }
    container.appendChild(section.root);
    providerUiRegistry.set(provider.id, section);
  });

  if (!providerEventsBound) {
    container.addEventListener("click", (event) => {
      const target =
        event.target instanceof HTMLElement
          ? event.target.closest("[data-action]")
          : null;
      if (!target) {
        return;
      }
      const providerId = target.dataset.provider;
      if (!providerId) {
        return;
      }
      const action = target.dataset.action;
      if (action === "toggle-visibility") {
        toggleApiKeyVisibility(providerId);
      } else if (action === "test-provider") {
        handleTestProvider(providerId);
      }
    });

    container.addEventListener("input", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement)) {
        return;
      }
      const providerId = target.dataset.provider;
      if (!providerId) {
        return;
      }
      if (target.dataset.field === "apiKey") {
        handleApiKeyInputChange(providerId, target.value);
      }
    });

    providerEventsBound = true;
  }
}

/**
 * 创建单个提供商的配置区域
 * @param {Object} provider - 提供商配置对象
 * @param {Object} [defaultModelState={}] - 默认模型状态
 * @returns {Object} 包含 DOM 元素和输入控件的对象
 * @returns {HTMLElement} returns.root - 根元素
 * @returns {Object} returns.inputs - 输入控件集合
 * @returns {HTMLButtonElement} returns.toggleButton - 显示/隐藏按钮
 * @returns {HTMLElement} returns.statusEl - 状态显示元素
 * @returns {HTMLElement} returns.healthMeta - 健康状态元数据元素
 */
function createProviderSection(provider, defaultModelState = {}) {
  const root = document.createElement("div");
  root.className =
    "provider-config bg-slate-50 border border-slate-200 rounded-md p-6";
  root.id = `config-${provider.id}`;
  root.dataset.provider = provider.id;

  const apiKeyBlock = document.createElement("div");
  apiKeyBlock.className = "mb-4";

  const apiKeyLabel = document.createElement("label");
  apiKeyLabel.htmlFor = `${provider.id}-api-key`;
  apiKeyLabel.className = "block text-sm font-medium text-gray-700 mb-2";
  apiKeyLabel.textContent =
    provider.ui?.apiKeyLabel ?? `${provider.label} API Key`;
  apiKeyBlock.appendChild(apiKeyLabel);

  const keyWrapper = document.createElement("div");
  keyWrapper.className = "flex gap-2";

  const apiKeyInput = document.createElement("input");
  apiKeyInput.type = "password";
  apiKeyInput.id = `${provider.id}-api-key`;
  apiKeyInput.placeholder =
    provider.ui?.apiKeyPlaceholder ?? API_KEY_PLACEHOLDER;
  apiKeyInput.className =
    "flex-1 p-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-slate-500";
  apiKeyInput.dataset.provider = provider.id;
  apiKeyInput.dataset.field = "apiKey";
  keyWrapper.appendChild(apiKeyInput);

  const toggleButton = document.createElement("button");
  toggleButton.type = "button";
  toggleButton.className =
    "toggle-visibility-btn bg-gray-200 hover:bg-gray-300 px-3 py-2 rounded-md transition";
  toggleButton.dataset.provider = provider.id;
  toggleButton.dataset.action = "toggle-visibility";
  toggleButton.textContent = getText("options_button_toggle_show", "显示");
  keyWrapper.appendChild(toggleButton);

  apiKeyBlock.appendChild(keyWrapper);

  if (provider.ui?.dashboardUrl || provider.ui?.docsUrl) {
    const helper = document.createElement("small");
    helper.className = "text-xs text-gray-500 mt-1 block";

    if (provider.ui?.dashboardUrl) {
      helper.append(getText("options_helper_get_api_key", "获取 API Key："));
      const dashLink = document.createElement("a");
      dashLink.href = provider.ui.dashboardUrl;
      dashLink.target = "_blank";
      dashLink.rel = "noreferrer";
      dashLink.className = "text-slate-600 hover:underline";
      dashLink.textContent = provider.label;
      helper.appendChild(dashLink);
      if (provider.ui?.docsUrl) {
        helper.append(getText("options_helper_docs_separator", " ｜ 文档："));
      }
    }

    if (provider.ui?.docsUrl) {
      if (!provider.ui?.dashboardUrl) {
        helper.append(getText("options_helper_docs_fallback", "参考文档："));
      }
      const docsLink = document.createElement("a");
      docsLink.href = provider.ui.docsUrl;
      docsLink.target = "_blank";
      docsLink.rel = "noreferrer";
      docsLink.className = "text-slate-600 hover:underline";
      docsLink.textContent = getText("options_helper_api_docs", "API 文档");
      helper.appendChild(docsLink);
    }

    apiKeyBlock.appendChild(helper);
  }

  const modelBlock = document.createElement("div");
  modelBlock.className = "mb-4";

  const modelLabel = document.createElement("label");
  modelLabel.htmlFor = `${provider.id}-model-name`;
  modelLabel.className = "block text-sm font-medium text-gray-700 mb-2";
  modelLabel.textContent = getText("options_label_model_name", "模型名称");
  modelBlock.appendChild(modelLabel);

  const modelInput = document.createElement("input");
  modelInput.type = "text";
  modelInput.id = `${provider.id}-model-name`;
  modelInput.placeholder = provider.defaultModel
    ? getText(
        "options_placeholder_model_example",
        `例如：${provider.defaultModel}`,
        [provider.defaultModel],
      )
    : getText("options_placeholder_model_input", "输入模型名称");
  modelInput.className =
    "w-full p-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-slate-500";
  modelInput.dataset.provider = provider.id;
  modelInput.dataset.field = "modelName";
  modelInput.value = defaultModelState.modelName ?? provider.defaultModel ?? "";
  modelBlock.appendChild(modelInput);

  if (
    Array.isArray(provider.supportedModels) &&
    provider.supportedModels.length > 0
  ) {
    const modelsHint = document.createElement("small");
    modelsHint.className = "text-xs text-gray-500 mt-1 block";
    modelsHint.textContent = getText(
      "options_hint_model_common",
      `常用模型：${provider.supportedModels.join("、")}`,
      [provider.supportedModels.join("、")],
    );
    modelBlock.appendChild(modelsHint);
  }

  const urlBlock = document.createElement("div");
  urlBlock.className = "mb-4";

  const urlLabel = document.createElement("label");
  urlLabel.htmlFor = `${provider.id}-api-url`;
  urlLabel.className = "block text-sm font-medium text-gray-700 mb-2";
  urlLabel.textContent = getText("options_label_api_url", "API 地址");
  urlBlock.appendChild(urlLabel);

  const apiUrlInput = document.createElement("input");
  apiUrlInput.type = "text";
  apiUrlInput.id = `${provider.id}-api-url`;
  apiUrlInput.placeholder =
    defaultModelState.apiUrl ?? provider.api?.baseUrl ?? "https://";
  apiUrlInput.className =
    "w-full p-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-slate-500";
  apiUrlInput.dataset.provider = provider.id;
  apiUrlInput.dataset.field = "apiUrl";
  apiUrlInput.value = defaultModelState.apiUrl ?? "";
  urlBlock.appendChild(apiUrlInput);

  if (defaultModelState.apiUrl) {
    const urlHint = document.createElement("small");
    urlHint.className = "text-xs text-gray-500 mt-1 block";
    urlHint.textContent = getText(
      "options_provider_custom_url_hint",
      `Current URL: ${defaultModelState.apiUrl}`,
      [defaultModelState.apiUrl],
    );
    urlBlock.appendChild(urlHint);
  }

  const actionsRow = document.createElement("div");
  actionsRow.className =
    "flex flex-col gap-2 md:flex-row md:items-center md:gap-4";

  const testButton = document.createElement("button");
  testButton.type = "button";
  testButton.className =
    "test-provider-btn bg-slate-600 hover:bg-slate-700 text-white font-medium py-2 px-4 rounded-md transition";
  testButton.dataset.provider = provider.id;
  testButton.dataset.action = "test-provider";
  testButton.textContent = getText(
    "options_provider_test_button",
    `Test ${provider.label} connection`,
    [provider.label],
  );
  actionsRow.appendChild(testButton);

  const statusEl = document.createElement("div");
  statusEl.id = `ai-status-${provider.id}`;
  statusEl.className = "text-sm text-gray-600 flex-1";
  statusEl.dataset.provider = provider.id;
  actionsRow.appendChild(statusEl);

  const healthMeta = document.createElement("div");
  healthMeta.className = "text-xs text-gray-500 mt-2";
  healthMeta.dataset.provider = provider.id;
  healthMeta.dataset.role = "provider-health-meta";
  healthMeta.textContent = getText("options_status_not_tested", "尚未测试连接");

  root.appendChild(apiKeyBlock);
  root.appendChild(modelBlock);
  root.appendChild(urlBlock);
  root.appendChild(actionsRow);
  root.appendChild(healthMeta);

  return {
    root,
    inputs: {
      apiKey: apiKeyInput,
      modelName: modelInput,
      apiUrl: apiUrlInput,
    },
    toggleButton,
    statusEl,
    healthMeta,
  };
}

/**
 * 设置提供商表单的状态
 * @param {string} providerId - 提供商 ID
 * @param {Object} [modelState={}] - 模型状态对象
 * @returns {void}
 */
function setProviderFormState(providerId, modelState = {}) {
  const entry = providerUiRegistry.get(providerId);
  if (!entry) {
    return;
  }

  const apiKey = typeof modelState.apiKey === "string" ? modelState.apiKey : "";
  actualApiKeys[providerId] = apiKey;

  entry.inputs.apiKey.type = "password";
  entry.inputs.apiKey.value = apiKey ? API_KEY_PLACEHOLDER : "";
  entry.toggleButton.textContent = getText(
    "options_button_toggle_show",
    "显示",
  );

  entry.inputs.modelName.value =
    typeof modelState.modelName === "string" ? modelState.modelName : "";
  entry.inputs.apiUrl.value =
    typeof modelState.apiUrl === "string" ? modelState.apiUrl : "";

  updateProviderHealthMeta(providerId, modelState);
}

/**
 * 处理 API 密钥输入变化
 * @param {string} providerId - 提供商 ID
 * @param {string} rawValue - 输入的原始值
 * @returns {void}
 */
function handleApiKeyInputChange(providerId, rawValue) {
  if (rawValue === API_KEY_PLACEHOLDER) {
    return;
  }
  actualApiKeys[providerId] = rawValue.trim();
}

/**
 * 切换 API 密钥的显示/隐藏状态
 * @param {string} providerId - 提供商 ID
 * @returns {void}
 */
function toggleApiKeyVisibility(providerId) {
  const entry = providerUiRegistry.get(providerId);
  if (!entry) {
    return;
  }

  const input = entry.inputs.apiKey;
  const button = entry.toggleButton;
  if (input.type === "password") {
    input.type = "text";
    input.value = actualApiKeys[providerId] ?? "";
    button.textContent = getText("options_button_toggle_hide", "隐藏");
  } else {
    input.type = "password";
    input.value = actualApiKeys[providerId] ? API_KEY_PLACEHOLDER : "";
    button.textContent = getText("options_button_toggle_show", "显示");
  }
}

/**
 * 收集提供商表单的当前状态
 * @param {string} providerId - 提供商 ID
 * @returns {Object} 表单状态对象
 * @returns {string} returns.apiKey - API 密钥
 * @returns {string} returns.modelName - 模型名称
 * @returns {string} returns.apiUrl - API 地址
 */
function collectProviderFormState(providerId) {
  const entry = providerUiRegistry.get(providerId);
  return {
    apiKey: (actualApiKeys[providerId] ?? "").trim(),
    modelName: entry ? entry.inputs.modelName.value.trim() : "",
    apiUrl: entry ? entry.inputs.apiUrl.value.trim() : "",
  };
}

/**
 * 更新提供商的健康状态元数据显示
 * @param {string} providerId - 提供商 ID
 * @param {Object} [modelState={}] - 模型状态对象
 * @returns {void}
 */
function updateProviderHealthMeta(providerId, modelState = {}) {
  const entry = providerUiRegistry.get(providerId);
  if (!entry || !entry.healthMeta) {
    return;
  }

  const statusLabel = formatHealthStatusLabel(modelState.healthStatus);
  const lastCheckText = formatHealthTimestamp(modelState.lastHealthCheck);
  const statusSegment = getText(
    "options_status_prefix",
    `状态：${statusLabel}`,
    [statusLabel],
  );
  const lastCheckedValue =
    lastCheckText || getText("options_status_not_tested", "尚未测试连接");
  const lastCheckedSegment = getText(
    "options_status_last_checked",
    `上次检查：${lastCheckedValue}`,
    [lastCheckedValue],
  );

  const segments = [statusSegment, lastCheckedSegment];

  if (
    modelState.healthStatus === "error" &&
    typeof modelState.lastErrorMessage === "string" &&
    modelState.lastErrorMessage.trim()
  ) {
    const reason = modelState.lastErrorMessage.trim();
    segments.push(
      getText("options_status_reason", `原因：${reason}`, [reason]),
    );
  }

  entry.healthMeta.textContent = segments.join(" ｜ ");
}

/**
 * 格式化健康状态标签
 * @param {string} status - 健康状态（"healthy", "error", "unknown"）
 * @returns {string} 本地化的状态标签
 */
function formatHealthStatusLabel(status) {
  switch (status) {
    case "healthy":
      return getText("options_status_health_ok", "健康");
    case "error":
      return getText("options_status_health_error", "异常");
    case "unknown":
    default:
      return getText("options_status_health_unknown", "未知");
  }
}

/**
 * 格式化健康检查时间戳
 * @param {number|string} value - 时间戳（数字或字符串）
 * @returns {string} 本地化的时间字符串
 */
function formatHealthTimestamp(value) {
  if (!value) {
    return "";
  }

  if (typeof value === "number") {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return "";
    }
    return date.toLocaleString(getLocale());
  }

  if (typeof value === "string") {
    const parsed = Date.parse(value);
    if (Number.isNaN(parsed)) {
      return "";
    }
    return new Date(parsed).toLocaleString(getLocale());
  }

  return "";
}

/**
 * 页面 DOM 加载完成后的初始化函数
 * @description 初始化所有 UI 组件和事件监听器
 * @listens DOMContentLoaded
 */
document.addEventListener("DOMContentLoaded", async () => {
  if (window.__optionsPageInitialized) {
    return;
  }
  window.__optionsPageInitialized = true;

  await whenI18nReady();
  initTabNavigation();
  initProviderUI();
  await loadAndDisplayConfig();

  const saveButton = document.getElementById("save-btn");
  if (saveButton) {
    saveButton.addEventListener("click", handleSave);
  }

  const testAnkiButton = document.getElementById("test-anki-btn");
  if (testAnkiButton) {
    testAnkiButton.addEventListener("click", handleTestAnki);
  }

  const defaultModelSelect = document.getElementById("default-model");
  if (defaultModelSelect) {
    defaultModelSelect.addEventListener("change", handleModelChange);
  }

  const providerSelect = document.getElementById("ai-provider");
  if (providerSelect) {
    providerSelect.addEventListener("change", handleProviderChange);
  }

  const exportButton = document.getElementById("export-config-btn");
  if (exportButton) {
    exportButton.addEventListener("click", handleExportConfiguration);
  }

  const importButton = document.getElementById("import-config-btn");
  if (importButton) {
    importButton.addEventListener("click", handleImportConfigurationClick);
  }

  const importInput = document.getElementById("import-config-input");
  if (importInput) {
    importInput.addEventListener("change", handleImportConfigurationFile);
  }

  const resetButton = document.getElementById("reset-config-btn");
  if (resetButton) {
    resetButton.addEventListener("click", handleResetConfiguration);
  }

  const fontSizeSelect = document.getElementById("font-size-select");
  if (fontSizeSelect) {
    fontSizeSelect.addEventListener("change", updateStylePreview);
  }

  const textAlignSelect = document.getElementById("text-align-select");
  if (textAlignSelect) {
    textAlignSelect.addEventListener("change", updateStylePreview);
  }

  const lineHeightSelect = document.getElementById("line-height-select");
  if (lineHeightSelect) {
    lineHeightSelect.addEventListener("change", updateStylePreview);
  }

  // テンプレート関連のイベントリスナー / Template-related event listeners
  const addTemplateBtn = document.getElementById("add-template-btn");
  if (addTemplateBtn) {
    addTemplateBtn.addEventListener("click", () => {
      resetTemplateForm();
      switchTemplateView("form");
    });
  }

  const addTemplateBtnEmpty = document.getElementById("add-template-btn-empty");
  if (addTemplateBtnEmpty) {
    addTemplateBtnEmpty.addEventListener("click", () => {
      resetTemplateForm();
      switchTemplateView("form");
    });
  }

  const templateFormCancel = document.getElementById("template-form-cancel");
  if (templateFormCancel) {
    templateFormCancel.addEventListener("click", () => {
      switchTemplateView("list");
    });
  }

  const templateFormCancelBottom = document.getElementById(
    "template-form-cancel-bottom",
  );
  if (templateFormCancelBottom) {
    templateFormCancelBottom.addEventListener("click", () => {
      switchTemplateView("list");
    });
  }

  // テンプレート表単内のイベントリスナー / Template form event listeners
  const templateTestAnkiBtn = document.getElementById("template-test-anki-btn");
  if (templateTestAnkiBtn) {
    templateTestAnkiBtn.addEventListener("click", handleTemplateTestAnki);
  }

  const templateModelSelect = document.getElementById("template-model");
  if (templateModelSelect) {
    templateModelSelect.addEventListener("change", handleTemplateModelChange);
  }

  const templateGeneratePromptBtn = document.getElementById(
    "template-generate-prompt-btn",
  );
  if (templateGeneratePromptBtn) {
    templateGeneratePromptBtn.addEventListener(
      "click",
      handleTemplateGeneratePrompt,
    );
  }

  const templateFormSaveBtn = document.getElementById("template-form-save");
  if (templateFormSaveBtn) {
    templateFormSaveBtn.addEventListener("click", handleTemplateSave);
  }

  // テンプレートリストを読み込む / Load template list
  loadTemplateList({ config: currentConfig, skipStorageReload: true });
});

// =============================================================================
// Storage 変更監視 (Storage Change Listener) - 阶段 2.2.6
// =============================================================================

/**
 * 生成模板库的轻量签名，用于快速判断是否有变更
 * @param {Object} library
 * @returns {string}
 */
function getTemplateLibrarySignature(library) {
  if (!library || typeof library !== "object") {
    return "none";
  }

  const templates = Array.isArray(library.templates) ? library.templates : [];
  const maxUpdatedAt = templates.reduce((max, tpl) => {
    const ts = Date.parse(tpl?.updatedAt ?? 0);
    return Number.isFinite(ts) && ts > max ? ts : max;
  }, 0);
  const idsChecksum = templates
    .map((tpl) => tpl?.id ?? "")
    .filter(Boolean)
    .sort()
    .join("|");

  return [
    library.version ?? "",
    library.defaultTemplateId ?? "",
    templates.length,
    maxUpdatedAt,
    idsChecksum,
  ].join("::");
}

/**
 * 判断 storage 变更是否与当前配置存在实质差异
 * @param {Object} newValue
 * @returns {boolean}
 */
function hasMeaningfulConfigChange(newValue) {
  if (!newValue) {
    return false;
  }
  if (!currentConfig || typeof currentConfig !== "object") {
    return true;
  }

  if ((newValue.version ?? "") !== (currentConfig.version ?? "")) {
    return true;
  }

  if ((newValue.language ?? null) !== (currentConfig.language ?? null)) {
    return true;
  }

  if (
    (newValue?.ui?.enableFloatingAssistant ?? null) !==
    (currentConfig?.ui?.enableFloatingAssistant ?? null)
  ) {
    return true;
  }

  const newStyleSig = [
    newValue?.styleConfig?.fontSize,
    newValue?.styleConfig?.textAlign,
    newValue?.styleConfig?.lineHeight,
  ].join("|");
  const currentStyleSig = [
    currentConfig?.styleConfig?.fontSize,
    currentConfig?.styleConfig?.textAlign,
    currentConfig?.styleConfig?.lineHeight,
  ].join("|");
  if (newStyleSig !== currentStyleSig) {
    return true;
  }

  const newFallback = Array.isArray(newValue?.aiConfig?.fallbackOrder)
    ? newValue.aiConfig.fallbackOrder
    : [];
  const currentFallback = Array.isArray(currentConfig?.aiConfig?.fallbackOrder)
    ? currentConfig.aiConfig.fallbackOrder
    : [];
  if (
    newFallback.length !== currentFallback.length ||
    newFallback.some((id, index) => id !== currentFallback[index])
  ) {
    return true;
  }

  const newProvider = newValue?.aiConfig?.provider;
  if (
    typeof newProvider === "string" &&
    newProvider !== currentConfig?.aiConfig?.provider
  ) {
    return true;
  }

  const newModels = newValue?.aiConfig?.models ?? {};
  const currentModels = currentConfig?.aiConfig?.models ?? {};
  if (Object.keys(newModels).length !== Object.keys(currentModels).length) {
    return true;
  }
  for (const [providerId, modelState] of Object.entries(newModels)) {
    const currentModel = currentModels[providerId] ?? {};
    if (
      (modelState?.modelName ?? "") !== (currentModel.modelName ?? "") ||
      (modelState?.apiUrl ?? "") !== (currentModel.apiUrl ?? "") ||
      (modelState?.healthStatus ?? "unknown") !==
        (currentModel.healthStatus ?? "unknown") ||
      (modelState?.lastHealthCheck ?? null) !==
        (currentModel.lastHealthCheck ?? null) ||
      (modelState?.updatedAt ?? null) !== (currentModel.updatedAt ?? null)
    ) {
      return true;
    }
  }

  const newTemplateSig = getTemplateLibrarySignature(newValue.templateLibrary);
  const currentTemplateSig = getTemplateLibrarySignature(
    currentConfig?.templateLibrary,
  );
  if (newTemplateSig !== currentTemplateSig) {
    return true;
  }

  return false;
}

/**
 * 带缓存的 API Key 解密
 * @param {string} ciphertext
 * @param {string} providerId
 * @returns {Promise<string>}
 */
async function decryptApiKeyCached(ciphertext, providerId) {
  if (!ciphertext) {
    return "";
  }
  const cacheKey = `${providerId}:${ciphertext}`;
  if (apiKeyDecryptionCache.has(cacheKey)) {
    return apiKeyDecryptionCache.get(cacheKey);
  }
  const decrypted = await decryptApiKey(ciphertext, providerId);
  apiKeyDecryptionCache.set(cacheKey, decrypted ?? "");
  return decrypted ?? "";
}

/**
 * 将 storage 变更合并进当前配置（仅按需解密）
 * @param {Object} newValue
 * @returns {Promise<Object>}
 */
async function mergeIncomingConfig(newValue) {
  const baseConfig = currentConfig ?? storageApi.getDefaultConfig();
  const nextConfig = {
    ...baseConfig,
    ...newValue,
    aiConfig: {
      ...(baseConfig.aiConfig ?? {}),
      ...(newValue?.aiConfig ?? {}),
      models: { ...(baseConfig.aiConfig?.models ?? {}) },
    },
    templateLibrary: newValue?.templateLibrary
      ? { ...(baseConfig.templateLibrary ?? {}), ...newValue.templateLibrary }
      : baseConfig.templateLibrary,
  };

  const incomingModels = newValue?.aiConfig?.models ?? {};
  for (const [providerId, incomingState] of Object.entries(incomingModels)) {
    const previous = nextConfig.aiConfig.models[providerId] ?? {};
    const ciphertext = incomingState?.apiKey;
    let apiKey = previous.apiKey ?? "";

    if (typeof ciphertext === "string" && ciphertext) {
      const cachedCiphertext = encryptedApiKeyCache.get(providerId);
      if (ciphertext !== cachedCiphertext) {
        apiKey = await decryptApiKeyCached(ciphertext, providerId);
        encryptedApiKeyCache.set(providerId, ciphertext);
        actualApiKeys[providerId] = apiKey ?? "";
      } else {
        const cacheKey = `${providerId}:${ciphertext}`;
        if (apiKeyDecryptionCache.has(cacheKey)) {
          apiKey = apiKeyDecryptionCache.get(cacheKey);
          actualApiKeys[providerId] = apiKey ?? "";
        }
      }
    }

    nextConfig.aiConfig.models[providerId] = {
      ...previous,
      ...incomingState,
      apiKey,
    };
  }

  return nextConfig;
}

/**
 * 处理 storage 配置变更（带 500ms 节流）
 * @param {Object} changeEntry
 * @returns {Promise<void>}
 */
async function handleConfigChange(changeEntry) {
  const newValue = changeEntry?.newValue;
  if (!newValue || !hasMeaningfulConfigChange(newValue)) {
    return;
  }

  const previousTemplateSig = getTemplateLibrarySignature(
    currentConfig?.templateLibrary,
  );
  const incomingTemplateSig = getTemplateLibrarySignature(
    newValue.templateLibrary,
  );
  const sections = [];

  const languageChanged =
    typeof newValue?.language === "string" &&
    newValue.language !== currentConfig?.language;

  if (newValue?.aiConfig) {
    sections.push("providers");
  }
  if (newValue?.ankiConfig) {
    sections.push("anki");
  }
  if (newValue?.styleConfig) {
    sections.push("style");
  }
  if (newValue?.ui) {
    sections.push("ui");
  }
  if (newValue?.language) {
    sections.push("language");
    if (languageChanged) {
      sections.push("templates");
      translationCache.clear();
    }
  }
  if (incomingTemplateSig !== previousTemplateSig) {
    sections.push("templates");
  }

  currentConfig = await mergeIncomingConfig(newValue);

  if (languageChanged) {
    await refreshLanguageResources();
  }

  if (sections.length > 0) {
    const uniqueSections = Array.from(new Set(sections));
    refreshUI({ sections: uniqueSections });
  }
}

/**
 * Storage変更監視リスナー
 * Storage change listener
 * @description 监听 storage 的变化，当 templateLibrary 被修改时自动刷新模板列表
 * @param {Object} changes - 变更对象
 * @param {string} areaName - 存储区域名称
 * @returns {void}
 */
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local" || !changes.ankiWordAssistantConfig) {
    return;
  }

  pendingConfigChange = changes.ankiWordAssistantConfig;
  if (storageChangeTimer) {
    clearTimeout(storageChangeTimer);
  }

  storageChangeTimer = setTimeout(() => {
    handleConfigChange(pendingConfigChange).catch((error) =>
      console.error("[options] 处理 storage 变更失败:", error),
    );
    pendingConfigChange = null;
  }, STORAGE_CHANGE_DEBOUNCE_MS);
});

/**
 * 转义 HTML 特殊字符
 * @param {string} value - 需要转义的值
 * @returns {string} 转义后的字符串
 */
function escapeHtml(value) {
  if (typeof value !== "string") {
    return "";
  }
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * 处理导出配置文件操作
 * @description 导出当前配置为 JSON 文件（不包含 API 密钥）
 * @returns {Promise<void>}
 */
async function handleExportConfiguration() {
  try {
    updateStatus(
      "save-status",
      getText("options_export_status_running", "正在导出配置..."),
      "loading",
    );
    const baseConfig =
      currentConfig && Object.keys(currentConfig).length
        ? currentConfig
        : getDefaultConfig();
    const exportData = JSON.parse(JSON.stringify(baseConfig));
    exportData.version = exportData.version || CONFIG_VERSION;
    exportData.exportedAt = new Date().toISOString();

    if (exportData.aiConfig?.models) {
      Object.keys(exportData.aiConfig.models).forEach((provider) => {
        if (!exportData.aiConfig.models[provider]) {
          exportData.aiConfig.models[provider] = {};
        }
        exportData.aiConfig.models[provider].apiKey = "";
        exportData.aiConfig.models[provider].healthStatus = "unknown";
        exportData.aiConfig.models[provider].lastHealthCheck = null;
        exportData.aiConfig.models[provider].lastErrorMessage = "";
      });
    }

    const timestamp = new Date()
      .toISOString()
      .replace(/[:T]/g, "-")
      .slice(0, 19);
    const fileName = `ankibeam-config-${timestamp}.json`;
    const blob = new Blob([JSON.stringify(exportData, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
    URL.revokeObjectURL(url);

    updateStatus(
      "save-status",
      getText("options_export_status_success", "配置导出成功"),
      "success",
    );
  } catch (error) {
    console.error("配置导出失败:", error);
    updateStatus(
      "save-status",
      getText(
        "options_export_status_failed",
        `配置导出失败: ${error.message}`,
        [error.message],
      ),
      "error",
    );
  }
}

/**
 * 处理导入配置文件操作（旧版）
 * @param {Event} event - change 事件
 * @returns {Promise<void>}
 * @deprecated 此函数已被 handleImportConfigurationFile 替代
 */
async function handleImportConfiguration(event) {
  const fileInput = event?.target;
  const file = fileInput?.files && fileInput.files[0];
  if (!file) {
    return;
  }

  try {
    updateStatus(
      "save-status",
      getText("options_import_status_running", "正在导入配置..."),
      "loading",
    );
    const text = await file.text();
    let importedConfig;
    try {
      importedConfig = JSON.parse(text);
    } catch (parseError) {
      throw createI18nError("options_import_error_json_invalid", {
        fallback: "配置文件不是有效的 JSON",
      });
    }

    if (!importedConfig || typeof importedConfig !== "object") {
      throw createI18nError("options_import_error_format_invalid", {
        fallback: "配置文件格式不正确",
      });
    }

    if (!importedConfig.aiConfig) {
      throw createI18nError("options_import_error_missing_ai_config", {
        fallback: "配置文件缺少 aiConfig",
      });
    }

    const baseConfig = storageApi.getDefaultConfig();
    const mergedConfig = {
      ...baseConfig,
      ...importedConfig,
      aiConfig: {
        ...baseConfig.aiConfig,
        ...(importedConfig.aiConfig || {}),
        models: {
          ...baseConfig.aiConfig.models,
          ...(importedConfig.aiConfig?.models || {}),
        },
      },
      promptTemplates: {
        ...baseConfig.promptTemplates,
        ...(importedConfig.promptTemplates || {}),
      },
      ankiConfig: {
        ...baseConfig.ankiConfig,
        ...(importedConfig.ankiConfig || {}),
      },
      styleConfig: {
        ...baseConfig.styleConfig,
        ...(importedConfig.styleConfig || {}),
      },
      ui: {
        ...baseConfig.ui,
        ...(importedConfig.ui || {}),
      },
      language: importedConfig.language || baseConfig.language,
    };

    mergedConfig.aiConfig.fallbackOrder =
      importedConfig.aiConfig?.fallbackOrder ||
      baseConfig.aiConfig.fallbackOrder;

    const mergedModelPrompts = {
      ...baseConfig.promptTemplates.promptTemplatesByModel,
      ...(importedConfig.promptTemplates?.promptTemplatesByModel || {}),
      ...(importedConfig.ankiConfig?.promptTemplatesByModel || {}), // 向后兼容旧版本
    };

    mergedConfig.promptTemplates.promptTemplatesByModel = {
      ...mergedModelPrompts,
    };

    if (mergedConfig.aiConfig?.models) {
      Object.keys(mergedConfig.aiConfig.models).forEach((provider) => {
        const modelConfig = mergedConfig.aiConfig.models[provider] || {};
        mergedConfig.aiConfig.models[provider] = {
          ...modelConfig,
          apiKey: "",
          healthStatus: "unknown",
        };
      });
    }

    mergedConfig.version = importedConfig.version || baseConfig.version;
    delete mergedConfig.exportDate;
    delete mergedConfig.exportedAt;

    await storageApi.saveConfig(mergedConfig);
    currentConfig = mergedConfig;
    clearActualApiKeys();
    await refreshLanguageResources();
    updateStatus(
      "save-status",
      getText(
        "options_import_status_success",
        "配置导入成功，请重新配置 API 密钥",
      ),
      "success",
    );
    refreshUI({
      sections: ["providers", "templates", "anki", "style", "language", "ui"],
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  } catch (error) {
    console.error("配置导入失败:", error);
    updateStatus(
      "save-status",
      getText(
        "options_import_status_failed",
        `配置导入失败: ${error.message}`,
        [error.message],
      ),
      "error",
    );
  } finally {
    if (event?.target) {
      event.target.value = "";
    }
  }
}

/**
 * 处理重置配置操作
 * @description 将所有配置重置为默认状态
 * @returns {Promise<void>}
 */
async function handleResetConfiguration() {
  if (
    !confirm(
      getText(
        "options_reset_confirm",
        "确定要重置所有配置吗？此操作不可撤销。",
      ),
    )
  ) {
    return;
  }

  try {
    updateStatus(
      "save-status",
      getText("options_reset_status_running", "正在重置配置..."),
      "loading",
    );
    const defaultConfig = storageApi.getDefaultConfig();
    await storageApi.saveConfig(defaultConfig);
    currentConfig = defaultConfig;
    await refreshLanguageResources();
    updateStatus(
      "save-status",
      getText("options_reset_status_success", "配置已重置为默认值"),
      "success",
    );
    clearActualApiKeys();
    refreshUI({
      sections: ["providers", "templates", "anki", "style", "language", "ui"],
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  } catch (error) {
    console.error("配置重置失败:", error);
    updateStatus(
      "save-status",
      getText("options_reset_status_failed", `重置配置失败: ${error.message}`, [
        error.message,
      ]),
      "error",
    );
  }
}

/**
 * 加载并显示配置
 * @description 从存储中加载配置并更新 UI 界面
 * @returns {Promise<void>}
 */
async function loadAndDisplayConfig() {
  const config = await storageApi.loadConfig();
  applyConfigToUI(config);
}

/**
 * 将配置应用到 UI（可按需刷新部分区域）
 * @param {Object} config - 配置对象
 * @param {Object} [options]
 * @param {Array<string>} [options.sections] - 需要刷新的区域；空数组表示全部
 */
function applyConfigToUI(config, { sections = [] } = {}) {
  currentConfig = config;
  const refreshAll = sections.length === 0;
  const shouldRefresh = (section) => refreshAll || sections.includes(section);

  if (shouldRefresh("providers")) {
    const providers = getAllProviders();
    const aiConfig = config?.aiConfig || {};
    const models = aiConfig.models || {};

    const providerSelect = document.getElementById("ai-provider");
    let activeProvider = aiConfig.provider;

    if (!providerUiRegistry.has(activeProvider || "")) {
      const fallback =
        providers.find((item) => providerUiRegistry.has(item.id))?.id ??
        getDefaultProviderId();
      activeProvider = fallback;
    }

    if (providerSelect && activeProvider) {
      providerSelect.value = activeProvider;
    }

    providers.forEach((provider) => {
      if (!providerUiRegistry.has(provider.id)) {
        return;
      }
      const modelState = models[provider.id] || {};
      setProviderFormState(provider.id, modelState);
    });

    handleProviderChange();
  }

  if (shouldRefresh("anki")) {
    currentModelFields = config?.ankiConfig?.modelFields || [];
    populateSavedAnkiOptions(config);

    if (
      config?.ankiConfig?.defaultModel &&
      Array.isArray(config?.ankiConfig?.modelFields)
    ) {
      displaySavedModelInfo(
        config.ankiConfig.defaultModel,
        config.ankiConfig.modelFields,
      );
    }
  }

  if (shouldRefresh("style")) {
    const fontSizeSelect = document.getElementById("font-size-select");
    if (fontSizeSelect) {
      fontSizeSelect.value = config?.styleConfig?.fontSize || "14px";
    }

    const textAlignSelect = document.getElementById("text-align-select");
    if (textAlignSelect) {
      textAlignSelect.value = config?.styleConfig?.textAlign || "left";
    }

    const lineHeightSelect = document.getElementById("line-height-select");
    if (lineHeightSelect) {
      lineHeightSelect.value = config?.styleConfig?.lineHeight || "1.4";
    }
  }

  if (shouldRefresh("language")) {
    const languageSelect = document.getElementById("language-select");
    if (languageSelect) {
      const savedLanguage = config?.language;
      const resolvedLanguage =
        typeof savedLanguage === "string" && savedLanguage.trim()
          ? savedLanguage
          : getLocale();
      const options = Array.from(languageSelect.options ?? []);
      const hasMatch = options.some(
        (option) => option.value === resolvedLanguage,
      );
      if (hasMatch) {
        languageSelect.value = resolvedLanguage;
      } else if (options.length > 0) {
        languageSelect.value = options[0].value;
      }
    }

    const currentLanguageIndicator = document.getElementById(
      "current-language-name",
    );
    if (currentLanguageIndicator) {
      currentLanguageIndicator.textContent =
        resolveCurrentLanguageName(getLocale());
    }
  }

  if (shouldRefresh("ui")) {
    const floatingAssistantCheckbox = document.getElementById(
      "enable-floating-assistant",
    );
    if (floatingAssistantCheckbox) {
      floatingAssistantCheckbox.checked =
        config?.ui?.enableFloatingAssistant ?? true;
    }
  }
}

/**
 * 根据当前配置刷新指定的 UI 区域
 * @param {Object} [options]
 * @param {Array<string>} [options.sections] - 需要刷新的区域；空表示全量
 */
function refreshUI({ sections = [] } = {}) {
  if (!currentConfig || typeof currentConfig !== "object") {
    return;
  }

  applyConfigToUI(currentConfig, { sections });

  const refreshAll = sections.length === 0;
  const refreshTemplates = refreshAll || sections.includes("templates");
  if (refreshTemplates) {
    loadTemplateList({
      config: currentConfig,
      skipStorageReload: true,
      forceRender: true,
    });
  }
}

/**
 * 刷新语言资源并重新本地化页面
 * @returns {Promise<void>}
 */
async function refreshLanguageResources() {
  translationCache.clear();
  resetLocaleCache();
  await whenI18nReady();
  localizePage();
}

/**
 * 处理保存按钮点击事件
 * @description 保存所有配置到存储并执行必要的验证
 * @returns {Promise<void>}
 */
async function handleSave() {
  const providerSelect = document.getElementById("ai-provider");
  const providers = getAllProviders();
  const defaultConfigSnapshot = storageApi.getDefaultConfig();

  let providerId = providerSelect?.value;
  if (!providerId || !providerUiRegistry.has(providerId)) {
    providerId =
      providers.find((item) => providerUiRegistry.has(item.id))?.id ??
      getDefaultProviderId();
  }

  const selectedState = collectProviderFormState(providerId);
  if (!selectedState.apiKey) {
    updateStatus(
      "save-status",
      getText("options_error_missing_api_key", "请为当前提供商填写 API Key"),
      "error",
    );
    return;
  }

  if (selectedState.apiUrl && !/^https?:\/\//i.test(selectedState.apiUrl)) {
    updateStatus(
      "save-status",
      getText("options_error_invalid_api_url", "API 地址格式不正确"),
      "error",
    );
    return;
  }

  const promptTextarea = document.getElementById("custom-prompt-textarea");
  const deckSelect = document.getElementById("default-deck");
  const modelSelect = document.getElementById("default-model");
  const fontSizeSelect = document.getElementById("font-size-select");
  const textAlignSelect = document.getElementById("text-align-select");
  const lineHeightSelect = document.getElementById("line-height-select");
  const languageSelect = document.getElementById("language-select");

  const language = languageSelect ? languageSelect.value : getLocale();
  const defaultDeck = deckSelect ? deckSelect.value : "";
  const defaultModel = modelSelect ? modelSelect.value : "";
  const fontSize = fontSizeSelect ? fontSizeSelect.value : "14px";
  const textAlign = textAlignSelect ? textAlignSelect.value : "left";
  const lineHeight = lineHeightSelect ? lineHeightSelect.value : "1.4";

  const nextConfig = JSON.parse(
    JSON.stringify(currentConfig ?? storageApi.getDefaultConfig()),
  );

  const fallbackSource = Array.isArray(currentConfig?.aiConfig?.fallbackOrder)
    ? currentConfig.aiConfig.fallbackOrder
    : getFallbackOrder();
  const fallbackSet = new Set();
  const fallbackOrder = [];

  for (const rawId of fallbackSource) {
    if (!providerUiRegistry.has(rawId) || fallbackSet.has(rawId)) {
      continue;
    }
    fallbackSet.add(rawId);
    fallbackOrder.push(rawId);
  }

  const models = {};
  providers.forEach((provider) => {
    if (!providerUiRegistry.has(provider.id)) {
      return;
    }
    const baseState = currentConfig?.aiConfig?.models?.[provider.id] ?? {};
    const formState = collectProviderFormState(provider.id);
    const defaultModelState =
      defaultConfigSnapshot?.aiConfig?.models?.[provider.id] ?? {};

    models[provider.id] = {
      ...baseState,
      apiKey: formState.apiKey,
      modelName:
        formState.modelName ||
        baseState.modelName ||
        provider.defaultModel ||
        "",
      apiUrl:
        formState.apiUrl || baseState.apiUrl || defaultModelState.apiUrl || "",
    };

    if (!fallbackSet.has(provider.id)) {
      fallbackSet.add(provider.id);
      fallbackOrder.push(provider.id);
    }
  });

  nextConfig.aiConfig = {
    ...(nextConfig.aiConfig ?? {}),
    provider: providerId,
    models,
    fallbackOrder,
  };

  nextConfig.promptTemplates = {
    ...(nextConfig.promptTemplates ?? {}),
    // Deprecated: promptTemplatesByModel is no longer updated
  };

  nextConfig.ankiConfig = {
    ...(nextConfig.ankiConfig ?? {}),
    defaultDeck,
    defaultModel,
    modelFields: currentModelFields,
    defaultTags: Array.isArray(nextConfig.ankiConfig?.defaultTags)
      ? nextConfig.ankiConfig.defaultTags
      : [],
  };

  // 保留模板库数据，避免被覆盖
  nextConfig.templateLibrary = {
    ...(nextConfig.templateLibrary ?? {}),
  };

  nextConfig.styleConfig = {
    ...(nextConfig.styleConfig ?? {}),
    fontSize,
    textAlign,
    lineHeight,
  };

  const floatingAssistantCheckbox = document.getElementById(
    "enable-floating-assistant",
  );
  const enableFloatingAssistant = floatingAssistantCheckbox
    ? floatingAssistantCheckbox.checked
    : true;

  nextConfig.ui = {
    ...(nextConfig.ui ?? {}),
    fieldDisplayMode: nextConfig.ui?.fieldDisplayMode ?? "auto",
    enableFloatingAssistant,
  };

  nextConfig.language = language;

  const languageChanged = currentConfig?.language !== language;

  try {
    await ensureApiOriginsPermission(models);
    await storageApi.saveConfig(nextConfig);
    currentConfig = nextConfig; // 更新本地配置缓存

    updateStatus(
      "save-status",
      getText("options_save_status_success", "设置已保存"),
      "success",
    );

    if (languageChanged) {
      await refreshLanguageResources();
    }

    const sectionsToRefresh = ["providers", "anki", "style", "language", "ui"];
    if (languageChanged) {
      sectionsToRefresh.push("templates");
    }
    refreshUI({ sections: sectionsToRefresh });
  } catch (error) {
    if (error instanceof PermissionRequestError) {
      // console.warn('[options] 域名权限请求被拒绝:', error);
      updateStatus("save-status", error.message, "error");
      return;
    }

    console.error("保存配置时发生错误:", error);
    updateStatus(
      "save-status",
      getText("options_save_status_failed", `保存出错: ${error.message}`, [
        error.message,
      ]),
      "error",
    );
  }
}

/**
 * 处理 Anki 模型选择变更
 * @description 当用户选择不同的 Anki 模型时，获取并显示该模型的字段信息
 * @returns {Promise<void>}
 */
async function handleModelChange() {
  const modelName = document.getElementById("default-model").value;
  if (!modelName) {
    document.getElementById("field-mapping").style.display = "none";
    currentModelFields = []; // 清空
    return;
  }

  try {
    const fieldsResult = await ankiApi.getModelFieldNames(modelName);
    if (fieldsResult.error) {
      throw new Error(fieldsResult.error);
    }

    // 保存获取到的 Anki 模型字段名
    currentModelFields = fieldsResult.result;

    // 在 UI 中显示字段信息
    const fieldMappingDiv = document.getElementById("field-mapping");
    const container = fieldMappingDiv.querySelector(".field-mapping-container");

    const fieldCount = fieldsResult.result.length;
    const fieldHeading = getText(
      "options_model_fields_heading",
      `模型字段 (${fieldCount}个):`,
      [String(fieldCount)],
    );

    container.innerHTML = `
      <strong>${fieldHeading}</strong>
      <div class="field-tags">
        ${fieldsResult.result
          .map((field) => `<span class="field-tag">${field}</span>`)
          .join("; ")}
      </div>
    `;

    // 添加模式说明
    const modeDiv = document.createElement("div");
    modeDiv.className = "mode-info";
    modeDiv.style.marginTop = "15px";

    const legacyHeading = getText("options_mode_legacy_heading", "🔄 兼容模式");
    const legacyDescription = getText(
      "options_mode_legacy_description",
      "该模型字段数 ≤ 2，将使用传统的正面/背面模式。",
    );
    const dynamicHeading = getText(
      "options_mode_dynamic_heading",
      "✨ 动态字段模式",
    );
    const dynamicDescription = getText(
      "options_mode_dynamic_description",
      "该模型支持多字段，AI将自动填充所有字段。popup页面将根据字段名智能生成相应的输入区域。",
    );

    if (fieldCount <= 2) {
      modeDiv.innerHTML = `
        <div class="legacy-mode-info">
          <p><strong>${legacyHeading}</strong></p>
          <p>${legacyDescription}</p>
        </div>
      `;
    } else {
      modeDiv.innerHTML = `
        <div class="dynamic-mode-info">
          <p><strong>${dynamicHeading}</strong></p>
          <p>${dynamicDescription}</p>
        </div>
      `;
    }

    container.appendChild(modeDiv);
    fieldMappingDiv.style.display = "block";
  } catch (error) {
    console.error("字段获取失败:", error);
    document.getElementById("field-mapping").style.display = "none";
    currentModelFields = []; // 清空
  }
}

/**
 * 处理测试 Anki 连接操作
 * @description 测试 Anki 连接并刷新牌组和模型数据
 * @returns {Promise<void>}
 */
async function handleTestAnki() {
  updateStatus(
    "anki-status",
    getText("options_test_running", "正在测试连接并刷新数据..."),
    "loading",
  );
  try {
    const result = await ankiApi.testConnection();
    if (result.error) {
      throw new Error(result.error);
    }
    updateStatus(
      "anki-status",
      getText(
        "options_test_success_with_version",
        `连接成功，AnkiConnect 版本: ${result.result}`,
        [result.result],
      ),
      "success",
    );

    // 保存当前用户选择的值
    const currentDeck = document.getElementById("default-deck").value;
    const currentModel = document.getElementById("default-model").value;

    // 连接成功后，拉取最新的 Anki 数据
    await loadAnkiData();

    // 尝试恢复用户之前的选择（如果仍然有效）
    if (currentDeck) {
      const deckSelect = document.getElementById("default-deck");
      const deckOption = Array.from(deckSelect.options).find(
        (opt) => opt.value === currentDeck,
      );
      if (deckOption) {
        deckSelect.value = currentDeck;
      }
    }

    if (currentModel) {
      const modelSelect = document.getElementById("default-model");
      const modelOption = Array.from(modelSelect.options).find(
        (opt) => opt.value === currentModel,
      );
      if (modelOption) {
        modelSelect.value = currentModel;
        // 如果模型仍然有效，重新获取字段信息
        await handleModelChange();
      }
    }

    updateStatus(
      "anki-status",
      getText("options_status_provider_test_success", "数据刷新完成"),
      "success",
    );
  } catch (error) {
    console.error("Anki 连接测试发生错误:", error);
    updateStatus(
      "anki-status",
      getText("options_error_fetch_anki_data", `连接错误: ${error.message}`, [
        error.message,
      ]),
      "error",
    );
  }
}

/**
 * 处理 AI 提供商选择变更
 * @description 切换显示的提供商配置区域
 * @returns {void}
 */
function handleProviderChange() {
  const select = document.getElementById("ai-provider");
  let selectedProvider = select?.value ?? null;

  if (!selectedProvider || !providerUiRegistry.has(selectedProvider)) {
    const iterator = providerUiRegistry.keys();
    const first = iterator.next();
    selectedProvider = first.done ? null : first.value;
    if (select && selectedProvider) {
      select.value = selectedProvider;
    }
  }

  providerUiRegistry.forEach((entry, providerId) => {
    entry.root.style.display =
      providerId === selectedProvider ? "block" : "none";
  });
}

/**
 * 处理单个 AI 提供商连接测试
 * @param {string} providerId - 提供商 ID
 * @returns {Promise<void>}
 */
async function handleTestProvider(providerId) {
  const entry = providerUiRegistry.get(providerId);
  if (!entry) {
    return;
  }

  const apiKey = (actualApiKeys[providerId] ?? "").trim();
  if (!apiKey) {
    updateStatus(
      entry.statusEl.id,
      getText("options_error_missing_api_key", "请先输入 API Key"),
      "error",
    );
    return;
  }

  const modelName = entry.inputs.modelName.value.trim() || undefined;

  const apiUrl = entry.inputs.apiUrl.value.trim();

  try {
    const result = await aiServiceApi.testConnection(
      providerId,
      apiKey,
      modelName,
      apiUrl,
    );
    updateStatus(
      entry.statusEl.id,
      result.message,
      result.success ? "success" : "error",
    );

    const nextState = {
      ...(currentConfig?.aiConfig?.models?.[providerId] ?? {}),
      apiKey,
      modelName:
        modelName ||
        currentConfig?.aiConfig?.models?.[providerId]?.modelName ||
        entry.inputs.modelName.value,
      healthStatus: result.success ? "healthy" : "error",
      lastHealthCheck: new Date().toISOString(),
      lastErrorMessage: result.success ? "" : result.message,
    };

    if (!currentConfig.aiConfig) {
      currentConfig.aiConfig = { models: {} };
    }
    if (!currentConfig.aiConfig.models) {
      currentConfig.aiConfig.models = {};
    }
    currentConfig.aiConfig.models[providerId] = nextState;
    updateProviderHealthMeta(providerId, nextState);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`${providerId} 的测试失败:`, error);
    updateStatus(
      entry.statusEl.id,
      getText("options_provider_test_status_error", `Test failed: ${message}`, [
        message,
      ]),
      "error",
    );

    const fallbackState = {
      ...(currentConfig?.aiConfig?.models?.[providerId] ?? {}),
      healthStatus: "error",
      lastHealthCheck: new Date().toISOString(),
      lastErrorMessage: message,
    };

    if (!currentConfig.aiConfig) {
      currentConfig.aiConfig = { models: {} };
    }
    if (!currentConfig.aiConfig.models) {
      currentConfig.aiConfig.models = {};
    }
    currentConfig.aiConfig.models[providerId] = fallbackState;
    updateProviderHealthMeta(providerId, fallbackState);
  }
}

/**
 * 基于已保存配置填充 Anki 选项
 * @param {Object} config - 配置对象
 * @returns {void}
 */
function populateSavedAnkiOptions(config) {
  const ankiConfig = config?.ankiConfig || {};

  // 处理牌组下拉框
  const deckSelect = document.getElementById("default-deck");
  if (ankiConfig.defaultDeck) {
    deckSelect.innerHTML = "";
    const deckPlaceholderOption = document.createElement("option");
    deckPlaceholderOption.value = "";
    deckPlaceholderOption.textContent = getText(
      "options_default_deck_placeholder",
      "Select a default deck",
    );
    deckSelect.appendChild(deckPlaceholderOption);
    const deckOption = document.createElement("option");
    deckOption.value = ankiConfig.defaultDeck;
    deckOption.textContent = ankiConfig.defaultDeck;
    deckOption.selected = true;
    deckSelect.appendChild(deckOption);
  }

  // 处理模板下拉框
  const modelSelect = document.getElementById("default-model");
  if (ankiConfig.defaultModel) {
    modelSelect.innerHTML = "";
    const modelPlaceholderOption = document.createElement("option");
    modelPlaceholderOption.value = "";
    modelPlaceholderOption.textContent = getText(
      "options_default_model_placeholder",
      "Select a default model",
    );
    modelSelect.appendChild(modelPlaceholderOption);
    const modelOption = document.createElement("option");
    modelOption.value = ankiConfig.defaultModel;
    modelOption.textContent = ankiConfig.defaultModel;
    modelOption.selected = true;
    modelSelect.appendChild(modelOption);
  }
}

/**
 * 显示已保存的 Anki 模型信息和字段
 * @param {string} modelName - 模型名称
 * @param {Array<string>} modelFields - 字段列表
 * @returns {void}
 */
function displaySavedModelInfo(modelName, modelFields) {
  if (!modelName || !modelFields || modelFields.length === 0) {
    return;
  }

  // 更新全局变量
  currentModelFields = modelFields;

  // 显示字段信息
  const fieldMappingDiv = document.getElementById("field-mapping");
  const container = fieldMappingDiv.querySelector(".field-mapping-container");

  const fieldCount = modelFields.length;
  const fieldHeading = getText(
    "options_model_fields_heading",
    `模型字段 (${fieldCount}个):`,
    [String(fieldCount)],
  );

  container.innerHTML = `
    <strong>${fieldHeading}</strong>
    <div class="field-tags">
      ${modelFields
        .map((field) => `<span class="field-tag">${field}</span>`)
        .join("; ")}
    </div>
  `;

  // 添加模式说明
  const modeDiv = document.createElement("div");
  modeDiv.className = "mode-info";
  modeDiv.style.marginTop = "15px";

  const legacyHeading = getText("options_mode_legacy_heading", "🔄 兼容模式");
  const legacyDescription = getText(
    "options_mode_legacy_description",
    "该模型字段数 ≤ 2，将使用传统的正面/背面模式。",
  );
  const dynamicHeading = getText(
    "options_mode_dynamic_heading",
    "✨ 动态字段模式",
  );
  const dynamicDescription = getText(
    "options_mode_dynamic_description",
    "该模型支持多字段，AI将自动填充所有字段。popup页面将根据字段名智能生成相应的输入区域。",
  );

  if (fieldCount <= 2) {
    modeDiv.innerHTML = `
      <div class="legacy-mode-info">
        <p><strong>${legacyHeading}</strong></p>
        <p>${legacyDescription}</p>
      </div>
    `;
  } else {
    modeDiv.innerHTML = `
      <div class="dynamic-mode-info">
        <p><strong>${dynamicHeading}</strong></p>
        <p>${dynamicDescription}</p>
      </div>
    `;
  }

  container.appendChild(modeDiv);
  fieldMappingDiv.style.display = "block";
}

/**
 * 从 Anki 读取牌组和模型数据
 * @description 获取所有可用的牌组和模型列表并更新 UI
 * @returns {Promise<void>}
 */
async function loadAnkiData() {
  try {
    // 牌组
    const decksResult = await ankiApi.getDeckNames();
    if (decksResult.error) {
      throw createI18nError("options_error_fetch_decks", {
        fallback: `读取牌组失败: ${decksResult.error}`,
        substitutions: [decksResult.error],
      });
    }

    // 模型
    const modelsResult = await ankiApi.getModelNames();
    if (modelsResult.error) {
      throw createI18nError("options_error_fetch_models", {
        fallback: `读取模型失败: ${modelsResult.error}`,
        substitutions: [modelsResult.error],
      });
    }

    // 牌组下拉
    const deckSelect = document.getElementById("default-deck");
    deckSelect.innerHTML = "";
    const deckPlaceholderOption = document.createElement("option");
    deckPlaceholderOption.value = "";
    deckPlaceholderOption.textContent = getText(
      "options_default_deck_placeholder",
      "Select a default deck",
    );
    deckSelect.appendChild(deckPlaceholderOption);
    decksResult.result.forEach((deck) => {
      const option = document.createElement("option");
      option.value = deck;
      option.textContent = deck;
      deckSelect.appendChild(option);
    });

    // 模型下拉
    const modelSelect = document.getElementById("default-model");
    modelSelect.innerHTML = "";
    const modelPlaceholderOption = document.createElement("option");
    modelPlaceholderOption.value = "";
    modelPlaceholderOption.textContent = getText(
      "options_default_model_placeholder",
      "Select a default model",
    );
    modelSelect.appendChild(modelPlaceholderOption);
    modelsResult.result.forEach((model) => {
      const option = document.createElement("option");
      option.value = model;
      option.textContent = model;
      modelSelect.appendChild(option);
    });
  } catch (error) {
    console.error("Anki 数据获取发生错误:", error);
    updateStatus(
      "anki-status",
      getText("options_error_fetch_anki_data", `出错: ${error.message}`, [
        error.message,
      ]),
      "error",
    );
  }
}

/**
 * 更新样式预览
 * @description 根据用户选择的字体大小、对齐方式和行高更新预览区域
 * @returns {void}
 */
function updateStylePreview() {
  const fontSize = document.getElementById("font-size-select").value;
  const textAlign = document.getElementById("text-align-select").value;
  const lineHeight = document.getElementById("line-height-select").value;

  const previewContent = document.getElementById("preview-content");
  previewContent.style.fontSize = fontSize;
  previewContent.style.textAlign = textAlign;
  previewContent.style.lineHeight = lineHeight;
}

/**
 * 更新状态显示
 * @param {string} elementId - 元素ID
 * @param {string} message - 消息
 * @param {'success'|'error'|'loading'} type - 类型
 */
function updateStatus(elementId, message, type) {
  const statusElement = document.getElementById(elementId);
  statusElement.textContent = message;
  statusElement.className = `status-${type}`;

  // 清除之前的定时器（如果有）
  if (statusElement.hideTimer) {
    clearTimeout(statusElement.hideTimer);
  }

  // 对于success和error类型的消息，2秒后自动隐藏
  if (type === "success" || type === "error") {
    statusElement.hideTimer = setTimeout(() => {
      statusElement.textContent = "";
      statusElement.className = "";
    }, 2000);
  }
}

/**
 * 显示 Toast 通知
 * @description 在页面底部显示临时通知消息
 * @param {string} message - 消息内容
 * @param {'success'|'error'|'info'} type - 消息类型
 * @returns {void}
 */
function showToast(message, type = "info") {
  // 使用 save-status 元素显示消息
  const statusElement = document.getElementById("save-status");
  if (!statusElement) {
    // console.warn("save-status element not found, using console instead");
    // console.log(`[${type.toUpperCase()}] ${message}`);
    return;
  }

  // 设置消息内容
  statusElement.textContent = message;

  // 根据类型设置样式
  statusElement.className = "text-sm";
  switch (type) {
    case "success":
      statusElement.className += " text-green-600 font-medium";
      break;
    case "error":
      statusElement.className += " text-red-600 font-medium";
      break;
    case "info":
    default:
      statusElement.className += " text-blue-600 font-medium";
      break;
  }

  // 清除之前的定时器（如果有）
  if (statusElement.hideTimer) {
    clearTimeout(statusElement.hideTimer);
  }

  // 3秒后自动隐藏消息
  statusElement.hideTimer = setTimeout(() => {
    statusElement.textContent = "";
    statusElement.className = "text-sm text-gray-600";
  }, 3000);
}

/**
 * 初始化选项卡导航
 * @description 设置选项卡按钮的点击和键盘导航事件
 * @returns {void}
 */
function initTabNavigation() {
  const tabButtons = document.querySelectorAll(".settings-tab-btn");
  const tabContents = document.querySelectorAll(".tab-content");

  tabButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const targetTab = button.getAttribute("data-tab");

      // 移除所有active状态
      tabButtons.forEach((btn) => {
        btn.classList.remove("active");
        btn.setAttribute("aria-selected", "false");
        // 重置按钮样式
        btn.classList.remove(
          "text-slate-600",
          "bg-slate-50",
          "border-slate-500",
        );
        btn.classList.add("text-gray-500", "border-transparent");
      });

      tabContents.forEach((content) => {
        content.classList.remove("active");
      });

      // 设置当前按钮为active
      button.classList.add("active");
      button.setAttribute("aria-selected", "true");
      button.classList.remove("text-gray-500", "border-transparent");
      button.classList.add("text-slate-600", "bg-slate-50", "border-slate-500");

      // 显示对应内容
      const targetContent = document.getElementById(targetTab);
      if (targetContent) {
        targetContent.classList.add("active");
      }
    });

    // 键盘支持
    button.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        button.click();
      }

      // 左右箭头键导航
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        e.preventDefault();
        const currentIndex = Array.from(tabButtons).indexOf(button);
        const nextIndex =
          e.key === "ArrowLeft"
            ? (currentIndex - 1 + tabButtons.length) % tabButtons.length
            : (currentIndex + 1) % tabButtons.length;

        tabButtons[nextIndex].focus();
        tabButtons[nextIndex].click();
      }
    });
  });
}

// ==================== テンプレート管理功能 (Template Management) ====================

/**
 * テンプレートビューを切り替える
 * Switch between template list and form views
 * @param {'list'|'form'} view - 表示するビュー
 * @returns {void}
 */
function switchTemplateView(view) {
  const listView = document.getElementById("template-list-view");
  const formView = document.getElementById("template-form-view");

  if (!listView || !formView) {
    // console.warn("[options] テンプレートビュー要素が見つかりません");
    return;
  }

  if (view === "list") {
    listView.style.display = "block";
    formView.style.display = "none";
  } else if (view === "form") {
    listView.style.display = "none";
    formView.style.display = "block";
  }
}

/**
 * テンプレートフォームをリセットする
 * Reset template form to initial state
 * @returns {void}
 */
function resetTemplateForm() {
  // 状態をリセット / Reset state
  templateEditorState.currentTemplateId = null;
  templateEditorState.mode = "create";
  templateEditorState.availableFields = [];
  templateEditorState.selectedFields = [];
  templateEditorState.fieldConfigs = {};
  templateEditorState.lastGeneratedPrompt = "";

  // 基本情報フィールドをクリア / Clear basic info fields
  const nameInput = document.getElementById("template-name");
  const descInput = document.getElementById("template-description");
  if (nameInput) nameInput.value = "";
  if (descInput) descInput.value = "";

  // Anki設定をクリア / Clear Anki settings
  const deckSelect = document.getElementById("template-deck");
  const modelSelect = document.getElementById("template-model");
  if (deckSelect) deckSelect.value = "";
  if (modelSelect) modelSelect.value = "";

  // フィールド関連をクリア / Clear field sections
  const fieldMapping = document.getElementById("template-field-mapping");
  const fieldsSection = document.getElementById("template-fields-section");
  const promptSection = document.getElementById("template-prompt-section");
  if (fieldMapping) fieldMapping.style.display = "none";
  if (fieldsSection) fieldsSection.style.display = "none";
  if (promptSection) promptSection.style.display = "none";

  // Promptテキストエリアをクリア / Clear prompt textarea
  const promptTextarea = document.getElementById("template-prompt");
  if (promptTextarea) promptTextarea.value = "";

  // ステータスメッセージをクリア / Clear status messages
  const ankiStatus = document.getElementById("template-anki-status");
  if (ankiStatus) ankiStatus.textContent = "";

  // フォームタイトルを新規作成に設定 / Set form title to create mode
  const formTitle = document.getElementById("template-form-title");
  if (formTitle) {
    formTitle.setAttribute("data-i18n", "template_form_title_new");
    formTitle.textContent = getText(
      "template_form_title_new",
      "新規テンプレート",
    );
  }
}

// ==================== テンプレートリスト機能 / Template List Functions ====================

let renderedTemplateMap = new Map();
let currentTemplateSignature = "";

/**
 * テンプレートリストを読み込んでレンダリングする（增量化）
 * @param {Object} [options]
 * @param {Object} [options.config] - 直接使用的配置对象，未提供则按需读取
 * @param {boolean} [options.skipStorageReload=false] - 为 true 时优先使用 currentConfig
 * @returns {Promise<void>}
 */
async function loadTemplateList(options = {}) {
  const {
    config: providedConfig,
    skipStorageReload = false,
    forceRender = false,
  } = options;

  try {
    const config =
      providedConfig ??
      (skipStorageReload ? currentConfig : await storageApi.loadConfig());
    if (!config) return;

    const templateLibrary = loadTemplateLibrary(config);
    const templates = listTemplates(config);
    const signature = getTemplateLibrarySignature(templateLibrary);

    const emptyState = document.getElementById("template-empty-state");
    const listContainer = document.getElementById("template-list-container");
    const cardsGrid = document.getElementById("template-cards-grid");

    if (!emptyState || !listContainer || !cardsGrid) {
      return;
    }

    ensureTemplateCardEvents();

    if (!templates || templates.length === 0) {
      emptyState.style.display = "flex";
      listContainer.style.display = "none";
      cardsGrid.replaceChildren();
      renderedTemplateMap = new Map();
      currentTemplateSignature = signature;
      return;
    }

    emptyState.style.display = "none";
    listContainer.style.display = "block";

    if (forceRender || signature !== currentTemplateSignature) {
      updateTemplateCards(cardsGrid, templates, templateLibrary.defaultTemplateId);
      currentTemplateSignature = signature;
    }
  } catch (error) {
    console.error("テンプレートリストの読み込みに失敗:", error);
    showToast(
      getText("template_load_error", "テンプレートの読み込みに失敗しました"),
      "error",
    );
  }
}

/**
 * 增量更新模板卡片
 * @param {HTMLElement} container
 * @param {Array<Object>} templates
 * @param {string|null} defaultTemplateId
 */
function updateTemplateCards(container, templates, defaultTemplateId) {
  const nextMap = new Map();
  const seen = new Set();

  templates.forEach((template) => {
    const existingEntry = renderedTemplateMap.get(template.id);
    const nextSignature = getTemplateCardSignature(
      template,
      defaultTemplateId,
    );
    let card = existingEntry?.element;

    if (!card) {
      card = renderTemplateCard(template, defaultTemplateId);
      container.appendChild(card);
    } else if (existingEntry?.signature !== nextSignature) {
      patchTemplateCard(card, template, defaultTemplateId);
    }

    nextMap.set(template.id, { element: card, signature: nextSignature });
    seen.add(template.id);
  });

  for (const [templateId, entry] of renderedTemplateMap.entries()) {
    if (!seen.has(templateId) && entry?.element?.remove) {
      entry.element.remove();
    }
  }

  renderedTemplateMap = nextMap;
}

/**
 * 生成单个模板卡的签名，便于检测是否需要 patch
 * @param {Object} template
 * @param {string|null} defaultTemplateId
 * @returns {string}
 */
function getTemplateCardSignature(template, defaultTemplateId) {
  const updatedStamp = template.updatedAt
    ? Date.parse(template.updatedAt)
    : 0;
  const fieldsCount = Array.isArray(template.fields)
    ? template.fields.length
    : 0;
  const locale = getLocale();

  return [
    template.id,
    template.name,
    template.description,
    template.deckName,
    template.modelName,
    fieldsCount,
    updatedStamp,
    defaultTemplateId === template.id ? "default" : "custom",
    locale,
  ].join("|");
}

/**
 * 単一のテンプレートカードをレンダリングする
 * Render a single template card
 * @param {Object} template - テンプレートオブジェクト
 * @param {string|null} defaultTemplateId - デフォルトテンプレートID
 * @returns {HTMLElement} カード要素
 */
function renderTemplateCard(template, defaultTemplateId) {
  const card = document.createElement("div");
  card.className =
    "bg-white border border-gray-200 rounded-lg p-6 shadow-sm hover:shadow-md transition";
  card.dataset.templateId = template.id;

  const isDefault = template.id === defaultTemplateId;

  // フォーマット更新日時 / Format update time
  const updatedDate = template.updatedAt
    ? new Date(template.updatedAt)
    : new Date();
  const formattedDate = updatedDate.toLocaleDateString(getLocale(), {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  card.innerHTML = `
    <div class="flex items-start justify-between mb-4">
      <div class="flex-1">
        <h3 class="text-lg font-semibold text-gray-900 mb-2" data-template-field="name">${escapeHtml(
          template.name,
        )}</h3>
        <p class="text-sm text-gray-600 mb-3" data-template-field="description">${escapeHtml(
          template.description || "",
        )}</p>
        <div class="flex flex-wrap gap-2 text-xs text-gray-500">
          <span class="inline-flex items-center" data-template-field="deck">
            <svg class="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <use href="#icon-deck"></use>
            </svg>
            <span data-template-field-value="deck">${escapeHtml(
              template.deckName || "-",
            )}</span>
          </span>
          <span class="text-gray-300">|</span>
          <span class="inline-flex items-center" data-template-field="model">
            <svg class="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <use href="#icon-model"></use>
            </svg>
            <span data-template-field-value="model">${escapeHtml(
              template.modelName || "-",
            )}</span>
          </span>
          <span class="text-gray-300">|</span>
          <span class="inline-flex items-center" data-template-field="fields">
            <svg class="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <use href="#icon-fields"></use>
            </svg>
            <span data-template-field-value="fields">${
              template.fields ? template.fields.length : 0
            } ${getText(
              "template_card_fields_count",
              "个字段",
            )}</span>
          </span>
        </div>
      </div>
      ${
        isDefault
          ? `<span class="ml-4 inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800" data-template-role="default-badge" data-i18n="template_card_default_badge">${getText(
              "template_card_default_badge",
              "默认",
            )}</span>`
          : `<span class="ml-4 inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800" data-template-role="default-badge" style="display:none" data-i18n="template_card_default_badge">${getText(
              "template_card_default_badge",
              "默认",
            )}</span>`
      }
    </div>

    <div class="flex items-center justify-between pt-4 border-t border-gray-200">
      <span class="text-xs text-gray-500" data-template-field="updated-at">
        ${getText("template_card_updated_at", "更新时间:")} <span data-template-field-value="updated-at">${formattedDate}</span>
      </span>
      <div class="flex gap-2">
        ${
          !isDefault
            ? `<button
            type="button"
            class="template-set-default-btn text-sm text-blue-600 hover:text-blue-800 font-medium"
            data-template-id="${template.id}"
            data-template-action="set-default"
            data-i18n="template_card_set_default"
          >${getText("template_card_set_default", "设为默认")}</button>`
            : ""
        }
        <button
          type="button"
          class="template-edit-btn text-sm text-gray-600 hover:text-gray-900 font-medium"
          data-template-id="${template.id}"
          data-template-action="edit"
          data-i18n="template_card_edit"
        >${getText("template_card_edit", "编辑")}</button>
        <button
          type="button"
          class="template-delete-btn text-sm text-red-600 hover:text-red-800 font-medium"
          data-template-id="${template.id}"
          data-template-action="delete"
          data-i18n="template_card_delete"
        >${getText("template_card_delete", "删除")}</button>
      </div>
    </div>
  `;

  return card;
}

/**
 * 对已有卡片进行补丁更新，避免整卡重建
 * @param {HTMLElement} card
 * @param {Object} template
 * @param {string|null} defaultTemplateId
 */
function patchTemplateCard(card, template, defaultTemplateId) {
  const isDefault = template.id === defaultTemplateId;
  const nameEl = card.querySelector('[data-template-field="name"]');
  if (nameEl) {
    nameEl.textContent = template.name ?? "";
  }

  const descEl = card.querySelector('[data-template-field="description"]');
  if (descEl) {
    descEl.textContent = template.description ?? "";
  }

  const deckEl = card.querySelector('[data-template-field-value="deck"]');
  if (deckEl) {
    deckEl.textContent = template.deckName || "-";
  }

  const modelEl = card.querySelector('[data-template-field-value="model"]');
  if (modelEl) {
    modelEl.textContent = template.modelName || "-";
  }

  const fieldsEl = card.querySelector('[data-template-field-value="fields"]');
  if (fieldsEl) {
    const count = template.fields ? template.fields.length : 0;
    fieldsEl.textContent = `${count} ${getText(
      "template_card_fields_count",
      "个字段",
    )}`;
  }

  const updatedEl = card.querySelector(
    '[data-template-field-value="updated-at"]',
  );
  if (updatedEl) {
    const updatedDate = template.updatedAt
      ? new Date(template.updatedAt)
      : new Date();
    updatedEl.textContent = updatedDate.toLocaleDateString(getLocale(), {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
  }

  const defaultBadge = card.querySelector('[data-template-role="default-badge"]');
  if (defaultBadge) {
    defaultBadge.style.display = isDefault ? "inline-flex" : "none";
  }

  const setDefaultBtn = card.querySelector('[data-template-action="set-default"]');
  if (setDefaultBtn) {
    setDefaultBtn.dataset.templateId = template.id;
    setDefaultBtn.toggleAttribute("hidden", isDefault);
  }

  const editBtn = card.querySelector('[data-template-action="edit"]');
  if (editBtn) {
    editBtn.dataset.templateId = template.id;
  }

  const deleteBtn = card.querySelector('[data-template-action="delete"]');
  if (deleteBtn) {
    deleteBtn.dataset.templateId = template.id;
  }
}

/**
 * 为模板卡片容器绑定一次性事件委托
 */
function ensureTemplateCardEvents() {
  if (templateCardEventsBound) {
    return;
  }
  const cardsGrid = document.getElementById("template-cards-grid");
  if (!cardsGrid) {
    return;
  }

  cardsGrid.addEventListener("click", (event) => {
    const actionTarget = event.target.closest("[data-template-action]");
    if (!actionTarget || !cardsGrid.contains(actionTarget)) {
      return;
    }
    const { templateAction, templateId } = actionTarget.dataset;
    if (!templateId || !templateAction) {
      return;
    }

    switch (templateAction) {
      case "set-default":
        handleSetDefaultTemplate(templateId);
        break;
      case "edit":
        handleEditTemplate(templateId);
        break;
      case "delete":
        handleDeleteTemplate(templateId);
        break;
      default:
        break;
    }
  });

  templateCardEventsBound = true;
}

/**
 * デフォルトテンプレートを設定する
 * Set default template
 * @param {string} templateId - テンプレートID
 * @returns {Promise<void>}
 */
async function handleSetDefaultTemplate(templateId) {
  try {
    const config = currentConfig ?? (await storageApi.loadConfig());
    const updated = setDefaultTemplate(config, templateId);
    if (!updated) {
      throw new Error("Failed to set default template");
    }
    await storageApi.saveConfig(config);
    currentConfig = config;

    showToast(
      getText("options_toast_template_set_default", "已设置为默认模板"),
      "success",
    );

    refreshUI({ sections: ["templates"] });
  } catch (error) {
    console.error("デフォルトテンプレートの設定に失敗:", error);
    showToast(
      getText("options_toast_template_set_default_error", "设置默认模板失败"),
      "error",
    );
  }
}

/**
 * テンプレートを編集する
 * Edit template
 * @param {string} templateId - テンプレートID
 * @returns {Promise<void>}
 */
async function handleEditTemplate(templateId) {
  try {
    const config = currentConfig ?? (await storageApi.loadConfig());
    currentConfig = config;
    const template = getTemplateById(config, templateId);

    if (!template) {
      showToast(
        getText("options_toast_template_not_found", "未找到指定模板"),
        "error",
      );
      return;
    }

    // 編集状態を設定 / Set edit state
    templateEditorState.currentTemplateId = templateId;
    templateEditorState.mode = "edit";

    // フォームに値を設定 / Populate form
    const nameInput = document.getElementById("template-name");
    const descInput = document.getElementById("template-description");
    const deckSelect = document.getElementById("template-deck");
    const modelSelect = document.getElementById("template-model");
    const promptTextarea = document.getElementById("template-prompt");

    if (nameInput) nameInput.value = template.name || "";
    if (descInput) descInput.value = template.description || "";
    if (promptTextarea) promptTextarea.value = template.prompt || "";

    // フォームタイトルを更新 / Update form title
    const formTitle = document.getElementById("template-form-title");
    if (formTitle) {
      formTitle.setAttribute("data-i18n", "template_form_title_edit");
      formTitle.textContent = getText(
        "template_form_title_edit",
        "编辑解析模板",
      );
    }

    // Anki データを読み込み / Load Anki data
    await loadTemplateAnkiData();

    // deck/model を設定 / Set deck and model
    if (deckSelect && template.deckName) {
      deckSelect.value = template.deckName;
    }
    if (modelSelect && template.modelName) {
      modelSelect.value = template.modelName;
    }

    // modelId を保存 / Save modelId
    if (template.modelId) {
      templateEditorState.modelId = template.modelId;
    }

    // 模型が選択されている場合、字段を読み込む / If model is selected, load fields
    if (template.modelName) {
      await handleTemplateModelChange();
    }

    // 字段選択状態を復元 / Restore field selection state
    if (template.fields && Array.isArray(template.fields)) {
      // 字段按 order 排序 / Sort fields by order
      const sortedFields = [...template.fields].sort(
        (a, b) => a.order - b.order,
      );

      // 保存选中的字段列表 / Save selected fields
      templateEditorState.selectedFields = sortedFields.map((f) => f.name);

      // 保存字段配置 / Save field configurations
      templateEditorState.fieldConfigs = {};
      sortedFields.forEach((field) => {
        templateEditorState.fieldConfigs[field.name] = {
          content: field.parseInstruction || "",
        };
      });

      // 重新渲染字段配置 UI / Re-render field configuration UI
      renderTemplateFieldSelection(templateEditorState.availableFields || []);
      renderTemplateFieldConfig();
    }

    // フォームビューに切り替え / Switch to form view
    switchTemplateView("form");
  } catch (error) {
    console.error("テンプレートの編集準備に失敗:", error);
    showToast(
      getText("options_toast_template_edit_error", "加载模板编辑失败"),
      "error",
    );
  }
}

/**
 * テンプレートを削除する
 * Delete template
 * @param {string} templateId - テンプレートID
 * @returns {Promise<void>}
 */
async function handleDeleteTemplate(templateId) {
  try {
    const config = currentConfig ?? (await storageApi.loadConfig());
    const template = getTemplateById(config, templateId);

    if (!template) {
      showToast(
        getText(
          "options_toast_template_not_found",
          "テンプレートが見つかりません",
        ),
        "error",
      );
      return;
    }

    // 確認ダイアログを表示 / Show confirmation dialog
    const confirmMessage = getText(
      "template_card_delete_confirm",
      "确定要删除这个模板吗？此操作不可撤销。",
      [template.name],
    );

    if (!confirm(confirmMessage)) {
      return;
    }

    // テンプレートを削除 / Delete template
    const deleted = deleteTemplate(config, templateId);
    if (!deleted) {
      throw new Error("Failed to delete template");
    }
    await storageApi.saveConfig(config);
    currentConfig = config;

    showToast(
      getText("options_toast_template_deleted", "模板已删除"),
      "success",
    );

    refreshUI({ sections: ["templates"] });
  } catch (error) {
    console.error("テンプレートの削除に失敗:", error);
    showToast(
      getText("options_toast_template_delete_error", "删除模板失败"),
      "error",
    );
  }
}

// ==================== 配置管理功能 ====================

/**
 * 处理导入配置按钮点击事件
 * @description 触发文件选择对话框
 * @returns {void}
 */
function handleImportConfigurationClick() {
  document.getElementById("import-config-input").click();
}

/**
 * 处理导入配置文件操作
 * @param {Event} event - 文件输入变更事件
 * @returns {Promise<void>}
 */
async function handleImportConfigurationFile(event) {
  const file = event.target.files[0];
  if (!file) return;

  try {
    const text = await file.text();
    const importedConfig = JSON.parse(text);

    // 简单验证配置格式
    if (!importedConfig.version || !importedConfig.aiConfig) {
      throw createI18nError("options_import_error_format_invalid", {
        fallback: "配置文件格式不正确",
      });
    }

    // 合并配置（保留当前的API密钥，避免明文导入）
    const mergedConfig = {
      ...importedConfig,
      aiConfig: {
        ...importedConfig.aiConfig,
        models: {
          ...importedConfig.aiConfig.models,
        },
      },
    };

    // 清空API Key（为安全考虑）
    Object.keys(mergedConfig.aiConfig.models).forEach((provider) => {
      if (mergedConfig.aiConfig.models[provider]) {
        mergedConfig.aiConfig.models[provider].apiKey = "";
      }
    });

    await storageApi.saveConfig(mergedConfig);
    currentConfig = mergedConfig;
    clearActualApiKeys();
    await refreshLanguageResources();
    updateStatus(
      "save-status",
      getText(
        "options_import_status_success",
        "配置导入成功，请重新配置API密钥",
      ),
      "success",
    );

    refreshUI({
      sections: ["providers", "templates", "anki", "style", "language", "ui"],
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  } catch (error) {
    console.error("配置导入失败:", error);
    updateStatus(
      "save-status",
      getText("options_import_status_failed", `导入失败: ${error.message}`, [
        error.message,
      ]),
      "error",
    );
  }

  // 清空文件输入，允许重复导入相同文件
  event.target.value = "";
}

// =============================================================================
// 模板表单功能 (Template Form Functions) - 阶段 2.2.3
// =============================================================================

/**
 * テンプレート用のAnki接続テスト
 * Handle Anki connection test for template form
 * @description 复用 handleTestAnki 的逻辑,但使用模板表单的 DOM 元素
 * @returns {Promise<void>}
 */
async function handleTemplateTestAnki() {
  const statusElement = document.getElementById("template-anki-status");
  if (!statusElement) return;

  updateTemplateStatus(
    getText("options_test_running", "正在测试连接并刷新数据..."),
    "loading",
  );

  try {
    const result = await ankiApi.testConnection();
    if (result.error) {
      throw new Error(result.error);
    }

    updateTemplateStatus(
      getText(
        "options_test_success_with_version",
        `连接成功，AnkiConnect 版本: ${result.result}`,
        [result.result],
      ),
      "success",
    );

    // 保存当前用户选择的值
    const currentDeck = document.getElementById("template-deck").value;
    const currentModel = document.getElementById("template-model").value;

    // 连接成功后，拉取最新的 Anki 数据
    await loadTemplateAnkiData();

    // 尝试恢复用户之前的选择（如果仍然有效）
    if (currentDeck) {
      const deckSelect = document.getElementById("template-deck");
      const deckOption = Array.from(deckSelect.options).find(
        (opt) => opt.value === currentDeck,
      );
      if (deckOption) {
        deckSelect.value = currentDeck;
      }
    }

    if (currentModel) {
      const modelSelect = document.getElementById("template-model");
      const modelOption = Array.from(modelSelect.options).find(
        (opt) => opt.value === currentModel,
      );
      if (modelOption) {
        modelSelect.value = currentModel;
        // 如果模型仍然有效，重新获取字段信息
        await handleTemplateModelChange();
      }
    }

    updateTemplateStatus(
      getText("options_test_success_with_refresh", "连接成功，数据已刷新"),
      "success",
    );
  } catch (error) {
    console.error("Anki 连接测试失败:", error);
    updateTemplateStatus(
      getText("options_test_failed", `连接失败: ${error.message}`, [
        error.message,
      ]),
      "error",
    );
  }
}

/**
 * テンプレート用のAnkiデータ読み込み
 * Load Anki data for template form
 * @description 从 Anki 读取牌组和模型数据，更新模板表单的下拉框
 * @returns {Promise<void>}
 */
async function loadTemplateAnkiData() {
  try {
    // 牌组
    const decksResult = await ankiApi.getDeckNames();
    if (decksResult.error) {
      throw createI18nError("options_error_fetch_decks", {
        fallback: `读取牌组失败: ${decksResult.error}`,
        substitutions: [decksResult.error],
      });
    }

    // 模型（同时获取名称和ID）
    const modelsResult = await ankiApi.getModelNamesAndIds();
    if (modelsResult.error) {
      throw createI18nError("options_error_fetch_models", {
        fallback: `读取模型失败: ${modelsResult.error}`,
        substitutions: [modelsResult.error],
      });
    }

    // 保存模型名称和ID的映射到 templateEditorState
    templateEditorState.modelNamesAndIds = modelsResult.result || {};

    // 牌组下拉
    const deckSelect = document.getElementById("template-deck");
    deckSelect.innerHTML = "";
    const deckPlaceholderOption = document.createElement("option");
    deckPlaceholderOption.value = "";
    deckPlaceholderOption.textContent = getText(
      "options_default_deck_placeholder",
      "Select a default deck",
    );
    deckSelect.appendChild(deckPlaceholderOption);
    decksResult.result.forEach((deck) => {
      const option = document.createElement("option");
      option.value = deck;
      option.textContent = deck;
      deckSelect.appendChild(option);
    });

    // 模型下拉（从 modelNamesAndIds 对象中获取模型名称）
    const modelSelect = document.getElementById("template-model");
    modelSelect.innerHTML = "";
    const modelPlaceholderOption = document.createElement("option");
    modelPlaceholderOption.value = "";
    modelPlaceholderOption.textContent = getText(
      "options_default_model_placeholder",
      "Select a default model",
    );
    modelSelect.appendChild(modelPlaceholderOption);

    // modelNamesAndIds 是一个对象 {modelName: modelId, ...}
    const modelNames = Object.keys(modelsResult.result || {});
    modelNames.forEach((modelName) => {
      const option = document.createElement("option");
      option.value = modelName;
      option.textContent = modelName;
      modelSelect.appendChild(option);
    });
  } catch (error) {
    console.error("Anki 数据获取发生错误:", error);
    updateTemplateStatus(
      getText("options_error_fetch_anki_data", `出错: ${error.message}`, [
        error.message,
      ]),
      "error",
    );
  }
}

/**
 * テンプレート用のモデル変更処理
 * Handle model change for template form
 * @description 当用户选择不同的 Anki 模型时，获取并显示该模型的字段信息
 * @returns {Promise<void>}
 */
async function handleTemplateModelChange() {
  const modelName = document.getElementById("template-model").value;
  if (!modelName) {
    document.getElementById("template-field-mapping").style.display = "none";
    document.getElementById("template-fields-section").style.display = "none";
    document.getElementById("template-prompt-section").style.display = "none";
    templateEditorState.availableFields = [];
    templateEditorState.modelId = null;
    return;
  }

  try {
    // 保存选中模型的ID
    const modelId = templateEditorState.modelNamesAndIds[modelName];
    templateEditorState.modelId = modelId || null;

    const fieldsResult = await ankiApi.getModelFieldNames(modelName);
    if (fieldsResult.error) {
      throw new Error(fieldsResult.error);
    }

    // 保存获取到的 Anki 模型字段名
    templateEditorState.availableFields = fieldsResult.result;

    // 在 UI 中显示字段信息
    const fieldMappingDiv = document.getElementById("template-field-mapping");
    const container = document.getElementById(
      "template-field-mapping-container",
    );

    const fieldCount = fieldsResult.result.length;
    const fieldHeading = getText(
      "options_model_fields_heading",
      `模型字段 (${fieldCount}个):`,
      [String(fieldCount)],
    );

    container.innerHTML = `
      <strong>${fieldHeading}</strong>
      <div class="field-tags">
        ${fieldsResult.result
          .map((field) => `<span class="field-tag">${field}</span>`)
          .join("; ")}
      </div>
    `;

    fieldMappingDiv.style.display = "block";

    // 显示字段配置区域
    renderTemplateFieldSelection(fieldsResult.result);
    document.getElementById("template-fields-section").style.display = "block";
  } catch (error) {
    console.error("字段获取失败:", error);
    document.getElementById("template-field-mapping").style.display = "none";
    document.getElementById("template-fields-section").style.display = "none";
    document.getElementById("template-prompt-section").style.display = "none";
    templateEditorState.availableFields = [];
  }
}

/**
 * テンプレート用のフィールド選択UIレンダリング
 * Render field selection UI for template form
 * @description 渲染字段选择复选框列表
 * @param {Array<string>} fields - 可用字段列表
 * @returns {void}
 */
function renderTemplateFieldSelection(fields) {
  const selectionList = document.getElementById(
    "template-field-selection-list",
  );
  if (!selectionList) return;

  if (!templateFieldSelectionEventsBound) {
    selectionList.addEventListener(
      "change",
      handleTemplateFieldSelectionChange,
    );
    templateFieldSelectionEventsBound = true;
  }

  selectionList.innerHTML = "";

  fields.forEach((field) => {
    const isSelected = templateEditorState.selectedFields.includes(field);

    const checkboxWrapper = document.createElement("label");
    checkboxWrapper.className =
      "inline-flex items-center px-3 py-2 border border-gray-300 rounded-md cursor-pointer hover:bg-gray-50";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.value = field;
    checkbox.checked = isSelected;
    checkbox.dataset.fieldName = field;
    checkbox.className = "mr-2";

    const label = document.createElement("span");
    label.textContent = field;
    label.className = "text-sm font-medium text-gray-700";

    checkboxWrapper.appendChild(checkbox);
    checkboxWrapper.appendChild(label);
    selectionList.appendChild(checkboxWrapper);
  });

  // 渲染字段配置区域
  renderTemplateFieldConfig();
}

/**
 * 模板字段选择变更处理（事件委托）
 * @param {Event} event
 */
function handleTemplateFieldSelectionChange(event) {
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) {
    return;
  }
  if (target.type !== "checkbox") {
    return;
  }
  const field = target.dataset.fieldName;
  if (!field) {
    return;
  }

  if (target.checked) {
    if (!templateEditorState.selectedFields.includes(field)) {
      templateEditorState.selectedFields.push(field);
    }
    if (!templateEditorState.fieldConfigs[field]) {
      templateEditorState.fieldConfigs[field] = { content: "" };
    }
  } else {
    const index = templateEditorState.selectedFields.indexOf(field);
    if (index > -1) {
      templateEditorState.selectedFields.splice(index, 1);
    }
  }

  renderTemplateFieldConfig();
  synchronizeTemplatePrompt({ forceUpdate: false });
}

/**
 * テンプレート用のフィールド設定UIレンダリング
 * Render field config UI for template form
 * @description 渲染已选择字段的配置表单
 * @returns {void}
 */
function renderTemplateFieldConfig() {
  const configList = document.getElementById("template-field-config-list");
  if (!configList) return;

  configList.innerHTML = "";

  if (templateEditorState.selectedFields.length === 0) {
    configList.innerHTML = `<p class="text-sm text-gray-500">${getText(
      "template_form_no_fields_selected",
      "请先选择字段",
    )}</p>`;
    return;
  }

  templateEditorState.selectedFields.forEach((field) => {
    const config = templateEditorState.fieldConfigs[field] || { content: "" };

    const card = document.createElement("div");
    card.className = "bg-white border border-gray-200 rounded-md p-4";
    card.dataset.fieldConfigItem = field;

    const fieldHeader = document.createElement("h5");
    fieldHeader.className = "text-sm font-medium text-gray-900 mb-2";
    fieldHeader.textContent = field;

    const textarea = document.createElement("textarea");
    textarea.rows = 3;
    textarea.value = config.content || "";
    textarea.className =
      "w-full p-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-slate-500 focus:border-slate-500";
    textarea.placeholder = getText(
      "template_form_field_instruction_placeholder",
      "请描述该字段应该包含什么内容...",
    );
    textarea.dataset.fieldRole = "content";
    textarea.addEventListener("input", (e) => {
      if (!templateEditorState.fieldConfigs[field]) {
        templateEditorState.fieldConfigs[field] = {};
      }
      templateEditorState.fieldConfigs[field].content = e.target.value;
      synchronizeTemplatePrompt({ forceUpdate: false });
    });

    card.appendChild(fieldHeader);
    card.appendChild(textarea);
    configList.appendChild(card);
  });
}

/**
 * テンプレート用のPrompt生成
 * Generate prompt for template
 * @description 根据选中的字段和配置生成 Prompt
 * @returns {void}
 */
function handleTemplateGeneratePrompt() {
  const selectedFields = templateEditorState.selectedFields || [];
  if (selectedFields.length === 0) {
    updateTemplateStatus(
      getText(
        "options_prompt_error_no_fields",
        "请先选择至少一个字段，然后再生成 Prompt。",
      ),
      "info",
    );
    return;
  }

  // 显示 Prompt 编辑区域
  const promptSection = document.getElementById("template-prompt-section");
  if (promptSection) {
    promptSection.style.display = "block";
  }

  // 生成并填充 Prompt
  synchronizeTemplatePrompt({ forceUpdate: true });

  updateTemplateStatus(
    getText("template_form_prompt_generated", "Prompt 已生成"),
    "success",
  );
}

/**
 * テンプレート用のPrompt同期
 * Synchronize generated prompt for template
 * @description 同步生成的 Prompt 到模板编辑器
 * @param {Object} [options={}] - 配置选项
 * @param {boolean} [options.forceUpdate=false] - 是否强制更新
 * @returns {boolean} 是否更新了 Prompt
 */
function synchronizeTemplatePrompt(options = {}) {
  const { forceUpdate = false } = options;
  const promptTextarea = document.getElementById("template-prompt");

  if (!promptTextarea) {
    return false;
  }

  const generatedPrompt = generateTemplatePrompt();
  const trimmedGenerated = (generatedPrompt || "").trim();
  const trimmedCurrent = (promptTextarea.value || "").trim();

  if (!trimmedGenerated) {
    if (forceUpdate && promptTextarea.value) {
      promptTextarea.value = "";
      return true;
    }
    return false;
  }

  if (forceUpdate || !trimmedCurrent) {
    if (trimmedCurrent !== trimmedGenerated) {
      promptTextarea.value = generatedPrompt;
      return true;
    }
  }

  return false;
}

/**
 * テンプレート用のデフォルトPrompt生成
 * Generate default prompt for template
 * @description 根据选中的字段和配置生成结构化的 Prompt（复用 generateDefaultPrompt 的逻辑）
 * @returns {string} 生成的 Prompt 文本
 */
function generateTemplatePrompt() {
  const selectedFields = templateEditorState.selectedFields || [];
  if (selectedFields.length === 0) {
    return "";
  }

  const lines = [];
  lines.push(
    getText("options_prompt_rule_intro", "请严格按照下列要求生成输出。"),
  );
  lines.push("");
  lines.push(
    getText("options_prompt_rule_field_definition", "字段返回内容定义："),
  );

  selectedFields.forEach((field) => {
    const config = templateEditorState.fieldConfigs[field] || {};
    const content = (config.content || "").trim();
    const fieldDetail =
      content ||
      getText(
        "options_prompt_rule_field_fallback",
        "请生成与该字段相关的内容。",
      );
    lines.push(`${field}：${fieldDetail}`);
    lines.push("");
  });

  lines.push(getText("options_prompt_rule_output_format", "输出格式定义："));
  lines.push(
    getText(
      "options_prompt_rule_output_json",
      "请按照以下 JSON 结构返回结果，仅包含所列字段：",
    ),
  );
  lines.push("{");
  selectedFields.forEach((field, index) => {
    const comma = index === selectedFields.length - 1 ? "" : ",";
    lines.push(
      getText(
        "options_prompt_rule_output_line",
        `  "${field}": "请填入${field}的内容"${comma}`,
        [field, comma],
      ),
    );
  });
  lines.push("}");
  lines.push("");
  lines.push(getText("options_prompt_rule_notes", "注意事项："));
  lines.push(
    getText(
      "options_prompt_rule_note_json_only",
      "- 仅返回 JSON，不要包含额外解释。",
    ),
  );
  lines.push(
    getText(
      "options_prompt_rule_note_requirements",
      "- 确保各字段内容满足上文要求。",
    ),
  );

  return (
    lines
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim() + "\n"
  );
}

/**
 * テンプレートステータス更新
 * Update template status message
 * @description 更新模板表单的状态消息
 * @param {string} message - 状态消息
 * @param {string} level - 消息级别（"loading", "success", "error", "info"）
 * @returns {void}
 */
function updateTemplateStatus(message, level) {
  const statusElement = document.getElementById("template-anki-status");
  if (!statusElement) return;

  // 移除所有状态类
  statusElement.className = "text-sm";

  // 根据级别添加相应的类
  switch (level) {
    case "loading":
      statusElement.className += " text-blue-600";
      break;
    case "success":
      statusElement.className += " text-green-600";
      break;
    case "error":
      statusElement.className += " text-red-600";
      break;
    case "info":
      statusElement.className += " text-gray-600";
      break;
    default:
      statusElement.className += " text-gray-600";
  }

  statusElement.textContent = message;
}

// =============================================================================
// 模板保存与验证 (Template Save & Validation) - 阶段 2.2.4
// =============================================================================

/**
 * テンプレートフォームバリデーション
 * Validate template form inputs
 * @description 验证模板表单的所有必填字段
 * @returns {Object} { valid: boolean, errors: string[] }
 */
function validateTemplateForm() {
  const errors = [];

  // 验证名称
  const name = document.getElementById("template-name")?.value?.trim();
  if (!name) {
    errors.push(getText("template_form_validation_name", "请输入模板名称"));
  }

  // 验证描述
  const description = document
    .getElementById("template-description")
    ?.value?.trim();
  if (!description) {
    errors.push(
      getText("template_form_validation_description", "请输入模板描述"),
    );
  }

  // 验证牌组
  const deckName = document.getElementById("template-deck")?.value;
  if (!deckName) {
    errors.push(getText("template_form_validation_deck", "请选择 Anki 牌组"));
  }

  // 验证模型
  const modelName = document.getElementById("template-model")?.value;
  if (!modelName) {
    errors.push(getText("template_form_validation_model", "请选择 Anki 模型"));
  }

  // 验证字段选择
  const selectedFields = templateEditorState.selectedFields || [];
  if (selectedFields.length === 0) {
    errors.push(
      getText("template_form_validation_fields", "请至少选择一个字段"),
    );
  }

  // 验证字段配置（每个选中的字段都需要有解析指令）
  selectedFields.forEach((fieldName) => {
    const config = templateEditorState.fieldConfigs[fieldName];
    const parseInstruction = config?.content?.trim();
    if (!parseInstruction) {
      errors.push(
        getText(
          "template_form_validation_field_instruction",
          `字段"${fieldName}"缺少解析指令`,
          [fieldName],
        ),
      );
    }
  });

  // 验证 Prompt
  const prompt = document.getElementById("template-prompt")?.value?.trim();
  if (!prompt) {
    errors.push(
      getText("template_form_validation_prompt", "请输入或生成 Prompt"),
    );
  }

  return {
    valid: errors.length === 0,
    errors: errors,
  };
}

/**
 * テンプレートフォームデータ収集
 * Collect template form data
 * @description 从表单收集所有模板数据
 * @returns {Promise<Object>} 模板对象
 */
async function collectTemplateFormData() {
  const name = document.getElementById("template-name")?.value?.trim() || "";
  const description =
    document.getElementById("template-description")?.value?.trim() || "";
  const deckName = document.getElementById("template-deck")?.value || "";
  const modelName = document.getElementById("template-model")?.value || "";
  const prompt =
    document.getElementById("template-prompt")?.value?.trim() || "";

  // 从 templateEditorState 获取 modelId
  const modelId = templateEditorState.modelId || null;

  // 收集字段配置
  const selectedFields = templateEditorState.selectedFields || [];
  const fields = selectedFields.map((fieldName, index) => {
    const config = templateEditorState.fieldConfigs[fieldName] || {};
    return {
      name: fieldName,
      label: fieldName, // 默认使用字段名作为标签
      parseInstruction: config.content?.trim() || "",
      order: index,
      isRequired: false, // 默认不是必填
      aiStrategy: "auto", // 默认使用 AI 自动解析
    };
  });

  // 构建模板对象
  const template = {
    name: name,
    description: description,
    deckName: deckName,
    modelName: modelName,
    modelId: modelId,
    fields: fields,
    prompt: prompt,
  };

  // 如果是编辑模式，保留原有的 ID 和创建时间
  if (
    templateEditorState.mode === "edit" &&
    templateEditorState.currentTemplateId
  ) {
    template.id = templateEditorState.currentTemplateId;

    // 读取原模板的 createdAt
    const config = currentConfig ?? (await storageApi.loadConfig());
    currentConfig = config;
    const originalTemplate = getTemplateById(
      config,
      templateEditorState.currentTemplateId,
    );
    if (originalTemplate && originalTemplate.createdAt) {
      template.createdAt = originalTemplate.createdAt;
    }
  }

  return template;
}

/**
 * テンプレート保存処理
 * Handle template save
 * @description 验证并保存模板
 * @returns {Promise<void>}
 */
async function handleTemplateSave() {
  try {
    // 验证表单
    const validation = validateTemplateForm();
    if (!validation.valid) {
      // 显示所有验证错误
      const errorMessage = validation.errors.join("\n");
      updateTemplateStatus(errorMessage, "error");

      // 也可以用弹窗显示
      alert(
        getText("template_form_validation_failed", "表单验证失败：\n") +
          "\n" +
          errorMessage,
      );
      return;
    }

    // 收集表单数据（异步）
    const templateData = await collectTemplateFormData();

    // 加载当前配置
    const config = currentConfig ?? (await storageApi.loadConfig());

    // 保存模板（会自动处理新增/更新逻辑）
    const savedTemplate = saveTemplate(config, templateData);

    // 保存配置到 storage
    await saveConfig(config);
    currentConfig = config;

    // 显示成功消息
    updateTemplateStatus(
      getText("options_toast_template_saved", "模板已保存"),
      "success",
    );

    // 短暂延迟后切换回列表视图
    setTimeout(() => {
      switchTemplateView("list");
      refreshUI({ sections: ["templates"] });
    }, 400);
  } catch (error) {
    console.error("保存模板失败:", error);
    updateTemplateStatus(
      getText(
        "options_toast_template_save_failed",
        `保存失败: ${error.message}`,
        [error.message],
      ),
      "error",
    );
    alert(
      getText("template_form_save_error", "保存模板时发生错误：\n") +
        error.message,
    );
  }
}
