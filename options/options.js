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
} from "../utils/storage.js";
import {
  testConnection as testAnki,
  getDeckNames,
  getModelNames,
  getModelFieldNames,
} from "../utils/ankiconnect.js";
import { testConnection as testAi } from "../utils/ai-service.js";
import {
  loadPromptForModel,
  savePromptForModel,
  getPromptConfigForModel,
  updatePromptConfigForModel,
} from "../utils/prompt-engine.js";
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
const getText = (key, fallback, substitutions) =>
  translate(key, { fallback, substitutions });

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

/**
 * 提供商 UI 组件注册表
 * @type {Map<string, Object>}
 */
const providerUiRegistry = new Map();

/**
 * 清单文件中声明的主机权限集合
 * @type {Set<string>}
 */
const manifestHostPermissionSet = new Set(
  getAllManifestHostPermissions() ?? []
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
        [origin]
      )
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
  getModelFieldNames,
};

/**
 * Prompt API 接口
 * @type {Object}
 */
const promptApi = dependencyOverrides.prompt ?? {
  loadPromptForModel,
  savePromptForModel,
  getPromptConfigForModel,
  updatePromptConfigForModel,
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
 * Prompt 编辑器状态对象
 * @type {Object}
 * @property {string} currentModel - 当前编辑的模型名称
 * @property {string} lastSavedPrompt - 上次保存的 Prompt 内容
 * @property {Array<string>} selectedFields - 已选择的字段列表
 * @property {Object} fieldConfigs - 字段配置对象
 * @property {Array<string>} availableFields - 可用字段列表
 * @property {string} lastGeneratedPrompt - 上次生成的 Prompt 内容
 */
const promptEditorState = {
  currentModel: "",
  lastSavedPrompt: "",
  selectedFields: [],
  fieldConfigs: {},
  availableFields: [],
  lastGeneratedPrompt: "",
};

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
        [provider.defaultModel]
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
      [provider.supportedModels.join("、")]
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
      [defaultModelState.apiUrl]
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
    [provider.label]
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
    "显示"
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
    [statusLabel]
  );
  const lastCheckedValue =
    lastCheckText || getText("options_status_not_tested", "尚未测试连接");
  const lastCheckedSegment = getText(
    "options_status_last_checked",
    `上次检查：${lastCheckedValue}`,
    [lastCheckedValue]
  );

  const segments = [statusSegment, lastCheckedSegment];

  if (
    modelState.healthStatus === "error" &&
    typeof modelState.lastErrorMessage === "string" &&
    modelState.lastErrorMessage.trim()
  ) {
    const reason = modelState.lastErrorMessage.trim();
    segments.push(
      getText("options_status_reason", `原因：${reason}`, [reason])
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
  await whenI18nReady();
  initTabNavigation();
  initProviderUI();
  loadAndDisplayConfig();

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

  setupPromptEditor();

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
});

/**
 * Prompt 编辑器相关初始化
 * @description 设置 Prompt 编辑器的事件监听器和初始状态
 * @returns {void}
 */
function setupPromptEditor() {
  const promptTextarea = document.getElementById("custom-prompt-textarea");
  const fieldSelectionList = document.getElementById("field-selection-list");
  const fieldConfigList = document.getElementById("field-config-list");
  const resetButton = document.getElementById("reset-prompt-btn");
  if (promptTextarea) {
    promptTextarea.addEventListener("input", () => {
      markPromptDirtyFlag();
    });
  }

  if (fieldSelectionList) {
    fieldSelectionList.addEventListener("click", handleFieldSelectionClick);
  }

  if (fieldConfigList) {
    fieldConfigList.addEventListener("input", handleFieldConfigInput);
  }

  if (resetButton) {
    resetButton.addEventListener("click", handleResetPromptTemplate);
  }

  hidePromptConfig();
  markPromptDirtyFlag(false);
}

/**
 * 处理字段选择点击事件
 * @param {MouseEvent} event - 鼠标点击事件
 * @returns {void}
 */
function handleFieldSelectionClick(event) {
  const button = event.target.closest("[data-field-option]");
  if (!button) {
    return;
  }

  const fieldName = button.dataset.fieldOption;
  if (!fieldName) {
    return;
  }

  event.preventDefault();
  toggleFieldSelection(fieldName);
}

/**
 * 切换字段的选中状态
 * @param {string} fieldName - 字段名称
 * @returns {void}
 */
function toggleFieldSelection(fieldName) {
  if (!fieldName) {
    return;
  }

  const availableFields = promptEditorState.availableFields || [];
  if (!availableFields.includes(fieldName)) {
    return;
  }

  const selected = promptEditorState.selectedFields || [];
  const isSelected = selected.includes(fieldName);

  if (isSelected) {
    promptEditorState.selectedFields = selected.filter(
      (field) => field !== fieldName
    );
  } else {
    promptEditorState.selectedFields = Array.from(
      new Set([...selected, fieldName])
    );
  }

  const normalizedSelection = (promptEditorState.selectedFields || []).filter(
    (field) => availableFields.includes(field)
  );

  promptEditorState.selectedFields = availableFields.filter((field) =>
    normalizedSelection.includes(field)
  );

  if (!promptEditorState.fieldConfigs[fieldName]) {
    promptEditorState.fieldConfigs[fieldName] = {
      content: "",
    };
  }

  renderFieldSelection();
  renderFieldConfigForm();
  validateFieldConfigurations(false);

  synchronizeGeneratedPrompt();
  markPromptDirtyFlag();
}

/**
 * 处理字段配置输入事件
 * @param {Event} event - 输入事件
 * @returns {void}
 */
function handleFieldConfigInput(event) {
  const target = event.target;
  if (!target || target.tagName !== "TEXTAREA" || !target.dataset.fieldName) {
    return;
  }

  const fieldName = target.dataset.fieldName;
  const role = target.dataset.fieldRole;

  const config = ensureFieldConfig(fieldName);

  if (role === "content") {
    config.content = target.value;
  }

  validateFieldConfigurations(false);

  synchronizeGeneratedPrompt();
  markPromptDirtyFlag();
}

/**
 * 渲染字段选择区域
 * @param {Array<string>} [fields] - 可选的字段列表
 * @returns {void}
 */
function renderFieldSelection(fields) {
  if (Array.isArray(fields)) {
    promptEditorState.availableFields = [...fields];
  }

  const selectionList = document.getElementById("field-selection-list");
  const editorContainer = document.getElementById("prompt-field-editor");

  if (!selectionList || !editorContainer) {
    return;
  }

  const availableFields = promptEditorState.availableFields || [];

  const normalizedSelection = (promptEditorState.selectedFields || []).filter(
    (field) => availableFields.includes(field)
  );
  promptEditorState.selectedFields = availableFields.filter((field) =>
    normalizedSelection.includes(field)
  );

  Object.keys(promptEditorState.fieldConfigs).forEach((field) => {
    if (!availableFields.includes(field)) {
      delete promptEditorState.fieldConfigs[field];
    }
  });

  if (availableFields.length === 0) {
    editorContainer.style.display = "none";
    selectionList.innerHTML = "";
    const configList = document.getElementById("field-config-list");
    if (configList) {
      configList.innerHTML = "";
    }
    setPromptConfigStatus(
      getText("options_prompt_no_fields", "当前模板未返回任何字段。"),
      "info"
    );
    return;
  }

  editorContainer.style.display = "block";

  const baseButtonClass =
    "px-3 py-1 rounded-md border text-xs font-medium transition-colors duration-150";

  selectionList.innerHTML = availableFields
    .map((field) => {
      const isSelected = promptEditorState.selectedFields.includes(field);
      const classes = isSelected
        ? `${baseButtonClass} bg-slate-600 text-white border-slate-600`
        : `${baseButtonClass} bg-white text-slate-600 border-slate-300 hover:border-slate-500`;
      return `<button type="button" class="${classes}" data-field-option="${escapeHtml(
        field
      )}" aria-pressed="${isSelected}">${escapeHtml(field)}</button>`;
    })
    .join("");

  if (promptEditorState.selectedFields.length === 0) {
    setPromptConfigStatus(
      getText(
        "options_prompt_select_fields",
        "请选择需要输出的字段，并补全字段内容。"
      ),
      "info"
    );
  }
}

/**
 * 渲染字段配置表单
 * @description 为每个选中的字段生成配置表单界面
 * @returns {void}
 */
function renderFieldConfigForm() {
  const container = document.getElementById("field-config-list");
  if (!container) {
    return;
  }

  const selectedFields = promptEditorState.selectedFields || [];
  if (selectedFields.length === 0) {
    const emptyHint = getText(
      "options_prompt_field_config_hint",
      "配置生成 AI 输出该字段所需的信息"
    );
    container.innerHTML = `<div class="text-xs text-gray-500 border border-dashed border-slate-300 rounded-md p-3 bg-slate-50">${emptyHint}</div>`;
    return;
  }

  const fieldLabelText = getText("options_prompt_field_label", "字段内容");
  const fieldPlaceholderText = getText(
    "options_prompt_field_placeholder",
    "描述该字段应包含的内容，例如输出结构、语气等要求"
  );

  const cardsHtml = selectedFields
    .map((field) => {
      const safeField = escapeHtml(field);
      return `
        <div class="field-config-item border border-slate-200 rounded-md p-4 bg-white" data-field-config-item="${safeField}">
          <div class="flex flex-col gap-1">
            <h5 class="text-sm font-semibold text-slate-700">${safeField}</h5>
          </div>
          <div class="mt-3">
            <label class="block text-xs font-medium text-gray-600 mb-1">${fieldLabelText} <span class="text-red-500">*</span></label>
            <textarea
              class="w-full p-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-slate-500 focus:border-slate-500"
              rows="3"
              data-field-name="${safeField}"
              data-field-role="content"
              placeholder="${fieldPlaceholderText}"
            ></textarea>
            <p class="text-xs text-red-600 mt-1" data-field-error></p>
          </div>
        </div>
      `;
    })
    .join("");

  container.innerHTML = cardsHtml;

  selectedFields.forEach((field) => {
    const config = ensureFieldConfig(field);
    const selector = `[data-field-config-item="${escapeCssSelector(field)}"]`;
    const card = container.querySelector(selector);
    if (!card) {
      return;
    }

    const contentArea = card.querySelector(
      'textarea[data-field-role="content"]'
    );

    if (contentArea) {
      contentArea.value = config.content || "";
    }
  });

  validateFieldConfigurations(false);
}

/**
 * 确保字段配置对象存在
 * @param {string} fieldName - 字段名称
 * @returns {Object} 字段配置对象
 */
function ensureFieldConfig(fieldName) {
  if (!promptEditorState.fieldConfigs[fieldName]) {
    promptEditorState.fieldConfigs[fieldName] = {
      content: "",
    };
  }
  return promptEditorState.fieldConfigs[fieldName];
}

/**
 * 克隆选中字段的配置
 * @param {Array<string>} selectedFields - 选中的字段列表
 * @returns {Object} 克隆的字段配置对象
 */
function cloneSelectedFieldConfigs(selectedFields) {
  const result = {};
  selectedFields.forEach((field) => {
    const config = ensureFieldConfig(field);
    result[field] = {
      content: (config.content || "").trim(),
    };
  });
  return result;
}

/**
 * 生成默认 Prompt 内容
 * @description 根据选中的字段和配置生成结构化的 Prompt
 * @returns {string} 生成的 Prompt 文本
 */
function generateDefaultPrompt() {
  const selectedFields = promptEditorState.selectedFields || [];
  if (selectedFields.length === 0) {
    return "";
  }

  const lines = [];
  lines.push(
    getText("options_prompt_rule_intro", "请严格按照下列要求生成输出。")
  );
  lines.push("");
  lines.push(
    getText("options_prompt_rule_field_definition", "字段返回内容定义：")
  );

  selectedFields.forEach((field) => {
    const config = ensureFieldConfig(field);
    const content = (config.content || "").trim();
    const fieldDetail =
      content ||
      getText(
        "options_prompt_rule_field_fallback",
        "请生成与该字段相关的内容。"
      );
    lines.push(`${field}：${fieldDetail}`);
    lines.push("");
  });

  lines.push(getText("options_prompt_rule_output_format", "输出格式定义："));
  lines.push(
    getText(
      "options_prompt_rule_output_json",
      "请按照以下 JSON 结构返回结果，仅包含所列字段："
    )
  );
  lines.push("{");
  selectedFields.forEach((field, index) => {
    const comma = index === selectedFields.length - 1 ? "" : ",";
    lines.push(
      getText(
        "options_prompt_rule_output_line",
        `  "${field}": "请填入${field}的内容"${comma}`,
        [field, comma]
      )
    );
  });
  lines.push("}");
  lines.push("");
  lines.push(getText("options_prompt_rule_notes", "注意事项："));
  lines.push(
    getText(
      "options_prompt_rule_note_json_only",
      "- 仅返回 JSON，不要包含额外解释。"
    )
  );
  lines.push(
    getText(
      "options_prompt_rule_note_requirements",
      "- 确保各字段内容满足上文要求。"
    )
  );

  return (
    lines
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim() + "\n"
  );
}

/**
 * 同步生成的 Prompt 到编辑器
 * @param {Object} [options={}] - 配置选项
 * @param {boolean} [options.forceUpdate=false] - 是否强制更新
 * @returns {boolean} 是否更新了 Prompt
 */
function synchronizeGeneratedPrompt(options = {}) {
  const { forceUpdate = false } = options;
  const promptTextarea = document.getElementById("custom-prompt-textarea");

  if (!promptTextarea || promptTextarea.disabled) {
    promptEditorState.lastGeneratedPrompt = generateDefaultPrompt();
    return false;
  }

  const generatedPrompt = generateDefaultPrompt();
  const trimmedGenerated = (generatedPrompt || "").trim();
  const trimmedCurrent = (promptTextarea.value || "").trim();
  const trimmedLastGenerated = (
    promptEditorState.lastGeneratedPrompt || ""
  ).trim();

  const wasAutoGenerated =
    !trimmedCurrent || trimmedCurrent === trimmedLastGenerated;

  promptEditorState.lastGeneratedPrompt = generatedPrompt;

  if (!trimmedGenerated) {
    if ((forceUpdate || wasAutoGenerated) && promptTextarea.value) {
      promptTextarea.value = "";
      markPromptDirtyFlag();
      return true;
    }
    return false;
  }

  if (forceUpdate || wasAutoGenerated) {
    if (trimmedCurrent !== trimmedGenerated) {
      promptTextarea.value = generatedPrompt;
      markPromptDirtyFlag();
      return true;
    }
  }

  return false;
}

/**
 * 设置 Prompt 配置状态消息
 * @param {string} [message=""] - 状态消息
 * @param {string} [level=""] - 消息级别（"error", "success", "info"）
 * @returns {void}
 */
function setPromptConfigStatus(message = "", level = "") {
  const statusElement = document.getElementById("prompt-config-status");
  if (!statusElement) {
    return;
  }

  const baseClass = "text-xs mt-1";
  let colorClass = "text-gray-500";

  if (level === "error") {
    colorClass = "text-red-600";
  } else if (level === "success") {
    colorClass = "text-green-600";
  } else if (level === "info") {
    colorClass = "text-gray-500";
  }

  statusElement.className = `${baseClass} ${colorClass}`;
  statusElement.textContent = message;
}

/**
 * 验证字段配置的完整性
 * @param {boolean} [showStatus=false] - 是否显示验证状态消息
 * @returns {Object} 验证结果
 * @returns {boolean} returns.isValid - 是否验证通过
 * @returns {Array<string>} returns.missingFields - 缺失的字段列表
 */
function validateFieldConfigurations(showStatus = false) {
  const selectedFields = promptEditorState.selectedFields || [];
  const configList = document.getElementById("field-config-list");
  const missingFields = [];

  selectedFields.forEach((field) => {
    const config = ensureFieldConfig(field);
    const contentValue = (config.content || "").trim();
    const selector = `[data-field-config-item="${escapeCssSelector(field)}"]`;
    const card = configList ? configList.querySelector(selector) : null;
    const errorLabel = card ? card.querySelector("[data-field-error]") : null;

    if (!contentValue) {
      missingFields.push(field);
      if (card) {
        card.classList.remove("border-slate-200");
        card.classList.add("border-red-300");
      }
      if (errorLabel) {
        errorLabel.textContent = getText(
          "options_prompt_error_field_required",
          "字段内容为必填项"
        );
      }
    } else {
      if (card) {
        card.classList.remove("border-red-300");
        if (!card.classList.contains("border-slate-200")) {
          card.classList.add("border-slate-200");
        }
      }
      if (errorLabel) {
        errorLabel.textContent = "";
      }
    }
  });

  if (selectedFields.length === 0) {
    if (showStatus) {
      setPromptConfigStatus(
        getText(
          "options_prompt_error_select_fields",
          "请选择至少一个要输出的字段。"
        ),
        "error"
      );
    }
    return { isValid: false, missingFields };
  }

  if (missingFields.length > 0) {
    if (showStatus) {
      const message =
        missingFields.length === 1
          ? `字段“${missingFields[0]}”的内容不能为空。`
          : `以下字段内容不能为空：${missingFields.join("、")}`;
      setPromptConfigStatus(message, "error");
    }
    return { isValid: false, missingFields };
  }

  if (showStatus) {
    setPromptConfigStatus(
      getText("options_prompt_status_ready", "字段配置已就绪。"),
      "success"
    );
    setTimeout(() => {
      setPromptConfigStatus("", "");
    }, 1500);
  } else {
    setPromptConfigStatus("", "");
  }

  return { isValid: true, missingFields: [] };
}

/**
 * 转义 CSS 选择器中的特殊字符
 * @param {string} value - 需要转义的值
 * @returns {string} 转义后的字符串
 */
function escapeCssSelector(value) {
  if (window.CSS && typeof window.CSS.escape === "function") {
    return window.CSS.escape(value);
  }
  return value.replace(/([\s!"#$%&'()*+,./:;<=>?@[\]^`{|}~])/g, "$1");
}

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
 * 处理重置 Prompt 模板操作
 * @description 将模型专用 Prompt 重置为默认生成的值
 * @returns {void}
 */
function handleResetPromptTemplate() {
  const promptTextarea = document.getElementById("custom-prompt-textarea");
  if (!promptTextarea || promptTextarea.disabled) {
    return;
  }

  synchronizeGeneratedPrompt({ forceUpdate: true });
  markPromptDirtyFlag();

  const generatedPrompt = (promptEditorState.lastGeneratedPrompt || "").trim();
  if (generatedPrompt) {
    setPromptConfigStatus(
      getText(
        "options_prompt_status_generated",
        "已根据当前字段配置生成默认 Prompt。"
      ),
      "info"
    );
  } else {
    setPromptConfigStatus(
      getText(
        "options_prompt_error_generate_first",
        "请先选择并配置字段，然后再生成默认 Prompt。"
      ),
      "info"
    );
  }
}

/**
 * 显示 Prompt 配置 UI
 * @param {string} modelName - 模型名称
 * @param {Array<string>} fields - 字段列表
 * @returns {void}
 */
function showPromptConfig(modelName, fields) {
  const editorContainer = document.getElementById("prompt-field-editor");
  const selectionList = document.getElementById("field-selection-list");
  const configList = document.getElementById("field-config-list");
  const promptTextarea = document.getElementById("custom-prompt-textarea");
  const currentModelLabel = document.getElementById("prompt-current-model");
  const resetButton = document.getElementById("reset-prompt-btn");
  const modelHint = document.getElementById("prompt-model-hint");

  if (!editorContainer || !selectionList || !configList || !promptTextarea) {
    // console.warn('Prompt 配置元素未找到');
    return;
  }

  promptEditorState.currentModel = modelName;
  promptEditorState.availableFields = Array.isArray(fields) ? [...fields] : [];

  const promptConfig = promptApi.getPromptConfigForModel(
    modelName,
    currentConfig
  );
  promptEditorState.selectedFields = Array.isArray(promptConfig.selectedFields)
    ? [...promptConfig.selectedFields]
    : [];
  promptEditorState.fieldConfigs = {};
  if (
    promptConfig.fieldConfigs &&
    typeof promptConfig.fieldConfigs === "object"
  ) {
    Object.keys(promptConfig.fieldConfigs).forEach((fieldName) => {
      const fieldConfig = promptConfig.fieldConfigs[fieldName] || {};
      promptEditorState.fieldConfigs[fieldName] = {
        content:
          typeof fieldConfig.content === "string" ? fieldConfig.content : "",
      };
    });
  }

  const availableFields = promptEditorState.availableFields;
  promptEditorState.selectedFields = promptEditorState.selectedFields.filter(
    (field) => availableFields.includes(field)
  );
  Object.keys(promptEditorState.fieldConfigs).forEach((field) => {
    if (!availableFields.includes(field)) {
      delete promptEditorState.fieldConfigs[field];
    }
  });

  if (currentModelLabel) {
    currentModelLabel.textContent = getText(
      "options_prompt_current_model_label",
      `当前模板：${modelName}`,
      [modelName]
    );
  }

  if (modelHint) {
    modelHint.textContent = getText(
      "options_prompt_hint_save_usage",
      "提示：保存设置后将在 popup 中使用此 Prompt。"
    );
  }

  renderFieldSelection(availableFields);
  renderFieldConfigForm();

  promptTextarea.disabled = false;
  if (resetButton) {
    resetButton.disabled = false;
  }

  const storedPrompt =
    typeof promptConfig.customPrompt === "string"
      ? promptConfig.customPrompt
      : "";
  promptTextarea.value = storedPrompt;
  promptEditorState.lastSavedPrompt = storedPrompt;

  const forceGenerate = !storedPrompt.trim();
  synchronizeGeneratedPrompt({ forceUpdate: forceGenerate });
  markPromptDirtyFlag();
}

/**
 * 隐藏 Prompt 配置 UI
 * @description 重置 Prompt 编辑器状态并隐藏配置界面
 * @returns {void}
 */
function hidePromptConfig() {
  const editorContainer = document.getElementById("prompt-field-editor");
  const selectionList = document.getElementById("field-selection-list");
  const configList = document.getElementById("field-config-list");
  const promptTextarea = document.getElementById("custom-prompt-textarea");
  const currentModelLabel = document.getElementById("prompt-current-model");
  const resetButton = document.getElementById("reset-prompt-btn");
  const modelHint = document.getElementById("prompt-model-hint");

  if (!editorContainer || !selectionList || !configList || !promptTextarea) {
    // console.warn('Prompt 配置元素未找到');
    return;
  }

  promptEditorState.currentModel = "";
  promptEditorState.lastSavedPrompt = "";
  promptEditorState.selectedFields = [];
  promptEditorState.fieldConfigs = {};
  promptEditorState.availableFields = [];
  promptEditorState.lastGeneratedPrompt = "";

  if (currentModelLabel) {
    currentModelLabel.textContent = getText(
      "options_prompt_current_model",
      "当前模板：未选择"
    );
  }

  if (modelHint) {
    modelHint.textContent =
      "请在「Anki 连接」面板选择要编辑的模型，随后在这里自定义 Prompt。";
  }

  editorContainer.style.display = "none";
  selectionList.innerHTML = "";
  configList.innerHTML = "";
  setPromptConfigStatus("", "");

  promptTextarea.value = "";
  promptTextarea.disabled = true;

  if (resetButton) {
    resetButton.disabled = true;
  }

  markPromptDirtyFlag(false);
}

/**
 * 标记 Prompt 编辑状态
 * @param {boolean} [forced] - 强制显示/隐藏标记
 * @returns {void}
 */
function markPromptDirtyFlag(forced) {
  const flag = document.getElementById("prompt-dirty-flag");
  const promptTextarea = document.getElementById("custom-prompt-textarea");
  if (!flag || !promptTextarea) {
    return;
  }

  if (typeof forced === "boolean") {
    flag.style.display = forced ? "inline" : "none";
    return;
  }

  const isDirty = promptTextarea.value !== promptEditorState.lastSavedPrompt;
  flag.style.display = isDirty ? "inline" : "none";
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
      "loading"
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
    const fileName = `anki-word-assistant-config-${timestamp}.json`;
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
      "success"
    );
  } catch (error) {
    console.error("配置导出失败:", error);
    updateStatus(
      "save-status",
      getText(
        "options_export_status_failed",
        `配置导出失败: ${error.message}`,
        [error.message]
      ),
      "error"
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
      "loading"
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
    updateStatus(
      "save-status",
      getText(
        "options_import_status_success",
        "配置导入成功，请重新配置 API 密钥"
      ),
      "success"
    );
    setTimeout(() => window.location.reload(), 1000);
  } catch (error) {
    console.error("配置导入失败:", error);
    updateStatus(
      "save-status",
      getText(
        "options_import_status_failed",
        `配置导入失败: ${error.message}`,
        [error.message]
      ),
      "error"
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
      getText("options_reset_confirm", "确定要重置所有配置吗？此操作不可撤销。")
    )
  ) {
    return;
  }

  try {
    updateStatus(
      "save-status",
      getText("options_reset_status_running", "正在重置配置..."),
      "loading"
    );
    const defaultConfig = storageApi.getDefaultConfig();
    await storageApi.saveConfig(defaultConfig);
    currentConfig = defaultConfig;
    updateStatus(
      "save-status",
      getText("options_reset_status_success", "配置已重置为默认值"),
      "success"
    );
    setTimeout(() => window.location.reload(), 800);
  } catch (error) {
    console.error("配置重置失败:", error);
    updateStatus(
      "save-status",
      getText("options_reset_status_failed", `重置配置失败: ${error.message}`, [
        error.message,
      ]),
      "error"
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
  currentConfig = config;

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

  currentModelFields = config?.ankiConfig?.modelFields || [];
  populateSavedAnkiOptions(config);

  if (
    config?.ankiConfig?.defaultModel &&
    Array.isArray(config?.ankiConfig?.modelFields)
  ) {
    displaySavedModelInfo(
      config.ankiConfig.defaultModel,
      config.ankiConfig.modelFields
    );
  }

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

  const languageSelect = document.getElementById("language-select");
  if (languageSelect) {
    const savedLanguage = config?.language;
    const resolvedLanguage =
      typeof savedLanguage === "string" && savedLanguage.trim()
        ? savedLanguage
        : getLocale();
    const options = Array.from(languageSelect.options ?? []);
    const hasMatch = options.some(
      (option) => option.value === resolvedLanguage
    );
    if (hasMatch) {
      languageSelect.value = resolvedLanguage;
    } else if (options.length > 0) {
      languageSelect.value = options[0].value;
    }
  }

  const currentLanguageIndicator = document.getElementById(
    "current-language-name"
  );
  if (currentLanguageIndicator) {
    currentLanguageIndicator.textContent = resolveCurrentLanguageName(
      getLocale()
    );
  }

  const floatingAssistantCheckbox = document.getElementById(
    "enable-floating-assistant"
  );
  if (floatingAssistantCheckbox) {
    floatingAssistantCheckbox.checked =
      config?.ui?.enableFloatingAssistant ?? true;
  }

  // console.info('配置加载完成。');
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
      "error"
    );
    return;
  }

  if (selectedState.apiUrl && !/^https?:\/\//i.test(selectedState.apiUrl)) {
    updateStatus(
      "save-status",
      getText("options_error_invalid_api_url", "API 地址格式不正确"),
      "error"
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

  const isPromptEditorActive =
    promptEditorState.currentModel &&
    promptTextarea &&
    !promptTextarea.disabled;

  if (isPromptEditorActive) {
    const validation = validateFieldConfigurations(true);
    if (!validation.isValid) {
      return;
    }
  }

  // 构建新配置对象
  const existingPromptTemplatesByModel = {};
  const storedPromptConfigs =
    currentConfig?.promptTemplates?.promptTemplatesByModel || {};
  const legacyPromptConfigs =
    currentConfig?.ankiConfig?.promptTemplatesByModel || {};

  new Set([
    ...Object.keys(storedPromptConfigs),
    ...Object.keys(legacyPromptConfigs),
  ]).forEach((modelName) => {
    existingPromptTemplatesByModel[modelName] =
      promptApi.getPromptConfigForModel(modelName, currentConfig);
  });

  if (promptEditorState.currentModel) {
    const selectedSnapshot = [...(promptEditorState.selectedFields || [])];
    const existingConfig = existingPromptTemplatesByModel[
      promptEditorState.currentModel
    ] || {
      selectedFields: [],
      fieldConfigs: {},
      customPrompt: "",
    };

    existingPromptTemplatesByModel[promptEditorState.currentModel] = {
      ...existingConfig,
      selectedFields: selectedSnapshot,
      fieldConfigs: cloneSelectedFieldConfigs(selectedSnapshot),
    };
  }

  const nextConfig = JSON.parse(
    JSON.stringify(currentConfig ?? storageApi.getDefaultConfig())
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
    promptTemplatesByModel: existingPromptTemplatesByModel,
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

  nextConfig.styleConfig = {
    ...(nextConfig.styleConfig ?? {}),
    fontSize,
    textAlign,
    lineHeight,
  };

  const floatingAssistantCheckbox = document.getElementById(
    "enable-floating-assistant"
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

  let promptValueForSelectedModel = null;
  const selectedModel = defaultModel;

  if (
    selectedModel &&
    promptEditorState.currentModel === selectedModel &&
    promptTextarea &&
    !promptTextarea.disabled
  ) {
    const normalizedValue = promptTextarea.value.trim();
    if (normalizedValue) {
      if (promptTextarea.value !== normalizedValue) {
        promptTextarea.value = normalizedValue;
      }
      promptApi.savePromptForModel(selectedModel, normalizedValue, nextConfig);
      promptValueForSelectedModel = normalizedValue;
    } else {
      promptApi.updatePromptConfigForModel(
        selectedModel,
        { customPrompt: "" },
        nextConfig
      );
      promptValueForSelectedModel = "";
    }

    promptApi.updatePromptConfigForModel(
      selectedModel,
      {
        selectedFields: [...(promptEditorState.selectedFields || [])],
        fieldConfigs: cloneSelectedFieldConfigs(
          promptEditorState.selectedFields || []
        ),
      },
      nextConfig
    );
  }

  const languageChanged = currentConfig?.language !== language;

  try {
    await ensureApiOriginsPermission(models);
    await storageApi.saveConfig(nextConfig);
    currentConfig = nextConfig; // 更新本地配置缓存

    if (
      selectedModel &&
      promptEditorState.currentModel === selectedModel &&
      promptValueForSelectedModel !== null
    ) {
      promptEditorState.lastSavedPrompt = promptValueForSelectedModel;
      markPromptDirtyFlag(false);
    }

    updateStatus(
      "save-status",
      getText("options_save_status_success", "设置已保存"),
      "success"
    );

    if (languageChanged) {
      resetLocaleCache();
      setTimeout(() => window.location.reload(), 800);
    }
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
      "error"
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
      [String(fieldCount)]
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
      "该模型字段数 ≤ 2，将使用传统的正面/背面模式。"
    );
    const dynamicHeading = getText(
      "options_mode_dynamic_heading",
      "✨ 动态字段模式"
    );
    const dynamicDescription = getText(
      "options_mode_dynamic_description",
      "该模型支持多字段，AI将自动填充所有字段。popup页面将根据字段名智能生成相应的输入区域。"
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

    // 显示 Prompt 配置区域并加载对应模板的 Prompt
    showPromptConfig(modelName, currentModelFields);
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
    "loading"
  );
  try {
    const result = await ankiApi.testConnection();
    if (result.error) {
      throw new Error(result.error);
    }
    updateStatus(
      "anki-status",
      `连接成功，AnkiConnect 版本: ${result.result}`,
      "success"
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
        (opt) => opt.value === currentDeck
      );
      if (deckOption) {
        deckSelect.value = currentDeck;
      }
    }

    if (currentModel) {
      const modelSelect = document.getElementById("default-model");
      const modelOption = Array.from(modelSelect.options).find(
        (opt) => opt.value === currentModel
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
      "success"
    );
  } catch (error) {
    console.error("Anki 连接测试发生错误:", error);
    updateStatus(
      "anki-status",
      getText("options_error_fetch_anki_data", `连接错误: ${error.message}`, [
        error.message,
      ]),
      "error"
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
      "error"
    );
    return;
  }

  const modelName = entry.inputs.modelName.value.trim() || undefined;

  try {
    const result = await aiServiceApi.testConnection(
      providerId,
      apiKey,
      modelName
    );
    updateStatus(
      entry.statusEl.id,
      result.message,
      result.success ? "success" : "error"
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
      "error"
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
      "Select a default deck"
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
      "Select a default model"
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
    [String(fieldCount)]
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
    "该模型字段数 ≤ 2，将使用传统的正面/背面模式。"
  );
  const dynamicHeading = getText(
    "options_mode_dynamic_heading",
    "✨ 动态字段模式"
  );
  const dynamicDescription = getText(
    "options_mode_dynamic_description",
    "该模型支持多字段，AI将自动填充所有字段。popup页面将根据字段名智能生成相应的输入区域。"
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

  // 激活 Prompt 配置区域
  showPromptConfig(modelName, modelFields);
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
      "Select a default deck"
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
      "Select a default model"
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
      "error"
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
          "border-slate-500"
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
    console.warn("[options] テンプレートビュー要素が見つかりません");
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
    formTitle.textContent = getText("template_form_title_new", "新規テンプレート");
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
    updateStatus(
      "save-status",
      getText(
        "options_import_status_success",
        "配置导入成功，请重新配置API密钥"
      ),
      "success"
    );

    // 重新加载页面配置
    setTimeout(() => window.location.reload(), 1500);
  } catch (error) {
    console.error("配置导入失败:", error);
    updateStatus(
      "save-status",
      getText("options_import_status_failed", `导入失败: ${error.message}`, [
        error.message,
      ]),
      "error"
    );
  }

  // 清空文件输入，允许重复导入相同文件
  event.target.value = "";
}
