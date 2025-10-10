// options.js - 选项配置页面
// 功能：设置的显示与保存、各种连接测试

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
import {
  testConnection as testAi,
} from "../utils/ai-service.js";
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

// API密钥的实际值（DOM中显示星号掩码）
const actualApiKeys = Object.create(null);
const providerUiRegistry = new Map();
const manifestHostPermissionSet = new Set(
  getAllManifestHostPermissions() ?? [],
);

class PermissionRequestError extends Error {
  constructor(origin, cause) {
    super(`未获得 ${origin} 的访问权限，已取消保存。`);
    this.name = "PermissionRequestError";
    this.origin = origin;
    if (cause) {
      this.cause = cause;
    }
  }
}

const dependencyOverrides = globalThis?.__ankiWordOptionsDeps ?? {};

const storageApi = dependencyOverrides.storage ?? {
  loadConfig,
  saveConfig,
  getDefaultConfig,
};

const aiServiceApi = dependencyOverrides.aiService ?? {
  testConnection: testAi,
};

const ankiApi = dependencyOverrides.anki ?? {
  testConnection: testAnki,
  getDeckNames,
  getModelNames,
  getModelFieldNames,
};

const promptApi = dependencyOverrides.prompt ?? {
  loadPromptForModel,
  savePromptForModel,
  getPromptConfigForModel,
  updatePromptConfigForModel,
};

// 当前模型字段列表
let currentModelFields = [];

// 当前配置对象
let currentConfig = {};

const promptEditorState = {
  currentModel: "",
  lastSavedPrompt: "",
  selectedFields: [],
  fieldConfigs: {},
  availableFields: [],
  lastGeneratedPrompt: "",
};

const API_KEY_PLACEHOLDER = "********";
let providerEventsBound = false;

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
      console.warn("[options] 权限确认失败：", error);
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
      console.warn("[options] 请求权限时发生错误：", error);
      throw new PermissionRequestError(origin, error);
    }
  }
}

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
  apiKeyLabel.className =
    "block text-sm font-medium text-gray-700 mb-2";
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
  toggleButton.textContent = "显示";
  keyWrapper.appendChild(toggleButton);

  apiKeyBlock.appendChild(keyWrapper);

  if (provider.ui?.dashboardUrl || provider.ui?.docsUrl) {
    const helper = document.createElement("small");
    helper.className = "text-xs text-gray-500 mt-1 block";

    if (provider.ui?.dashboardUrl) {
      helper.append("获取 API Key：");
      const dashLink = document.createElement("a");
      dashLink.href = provider.ui.dashboardUrl;
      dashLink.target = "_blank";
      dashLink.rel = "noreferrer";
      dashLink.className = "text-slate-600 hover:underline";
      dashLink.textContent = provider.label;
      helper.appendChild(dashLink);
      if (provider.ui?.docsUrl) {
        helper.append(" ｜ 文档：");
      }
    }

    if (provider.ui?.docsUrl) {
      if (!provider.ui?.dashboardUrl) {
        helper.append("参考文档：");
      }
      const docsLink = document.createElement("a");
      docsLink.href = provider.ui.docsUrl;
      docsLink.target = "_blank";
      docsLink.rel = "noreferrer";
      docsLink.className = "text-slate-600 hover:underline";
      docsLink.textContent = "API 文档";
      helper.appendChild(docsLink);
    }

    apiKeyBlock.appendChild(helper);
  }

  const modelBlock = document.createElement("div");
  modelBlock.className = "mb-4";

  const modelLabel = document.createElement("label");
  modelLabel.htmlFor = `${provider.id}-model-name`;
  modelLabel.className =
    "block text-sm font-medium text-gray-700 mb-2";
  modelLabel.textContent = "模型名称";
  modelBlock.appendChild(modelLabel);

  const modelInput = document.createElement("input");
  modelInput.type = "text";
  modelInput.id = `${provider.id}-model-name`;
  modelInput.placeholder = provider.defaultModel
    ? `例如：${provider.defaultModel}`
    : "输入模型名称";
  modelInput.className =
    "w-full p-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-slate-500";
  modelInput.dataset.provider = provider.id;
  modelInput.dataset.field = "modelName";
  modelInput.value =
    defaultModelState.modelName ?? provider.defaultModel ?? "";
  modelBlock.appendChild(modelInput);

  if (Array.isArray(provider.supportedModels) && provider.supportedModels.length > 0) {
    const modelsHint = document.createElement("small");
    modelsHint.className = "text-xs text-gray-500 mt-1 block";
    modelsHint.textContent = `常用模型：${provider.supportedModels.join("、")}`;
    modelBlock.appendChild(modelsHint);
  }

  const urlBlock = document.createElement("div");
  urlBlock.className = "mb-4";

  const urlLabel = document.createElement("label");
  urlLabel.htmlFor = `${provider.id}-api-url`;
  urlLabel.className =
    "block text-sm font-medium text-gray-700 mb-2";
  urlLabel.textContent = "API 地址";
  urlBlock.appendChild(urlLabel);

  const apiUrlInput = document.createElement("input");
  apiUrlInput.type = "text";
  apiUrlInput.id = `${provider.id}-api-url`;
  apiUrlInput.placeholder =
    defaultModelState.apiUrl ??
    provider.api?.baseUrl ??
    "https://";
  apiUrlInput.className =
    "w-full p-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-slate-500";
  apiUrlInput.dataset.provider = provider.id;
  apiUrlInput.dataset.field = "apiUrl";
  apiUrlInput.value = defaultModelState.apiUrl ?? "";
  urlBlock.appendChild(apiUrlInput);

  if (defaultModelState.apiUrl) {
    const urlHint = document.createElement("small");
    urlHint.className = "text-xs text-gray-500 mt-1 block";
    urlHint.textContent = `默认：${defaultModelState.apiUrl}`;
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
  testButton.textContent = `测试 ${provider.label} 连接`;
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
  healthMeta.textContent = "尚未测试连接";

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

function setProviderFormState(providerId, modelState = {}) {
  const entry = providerUiRegistry.get(providerId);
  if (!entry) {
    return;
  }

  const apiKey =
    typeof modelState.apiKey === "string" ? modelState.apiKey : "";
  actualApiKeys[providerId] = apiKey;

  entry.inputs.apiKey.type = "password";
  entry.inputs.apiKey.value = apiKey ? API_KEY_PLACEHOLDER : "";
  entry.toggleButton.textContent = "显示";

  entry.inputs.modelName.value =
    typeof modelState.modelName === "string" ? modelState.modelName : "";
  entry.inputs.apiUrl.value =
    typeof modelState.apiUrl === "string" ? modelState.apiUrl : "";

  updateProviderHealthMeta(providerId, modelState);
}

function handleApiKeyInputChange(providerId, rawValue) {
  if (rawValue === API_KEY_PLACEHOLDER) {
    return;
  }
  actualApiKeys[providerId] = rawValue.trim();
}

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
    button.textContent = "隐藏";
  } else {
    input.type = "password";
    input.value = actualApiKeys[providerId] ? API_KEY_PLACEHOLDER : "";
    button.textContent = "显示";
  }
}

function collectProviderFormState(providerId) {
  const entry = providerUiRegistry.get(providerId);
  return {
    apiKey: (actualApiKeys[providerId] ?? "").trim(),
    modelName: entry ? entry.inputs.modelName.value.trim() : "",
    apiUrl: entry ? entry.inputs.apiUrl.value.trim() : "",
  };
}

function updateProviderHealthMeta(providerId, modelState = {}) {
  const entry = providerUiRegistry.get(providerId);
  if (!entry || !entry.healthMeta) {
    return;
  }

  const statusLabel = formatHealthStatusLabel(modelState.healthStatus);
  const lastCheckText = formatHealthTimestamp(modelState.lastHealthCheck);

  const segments = [`状态：${statusLabel}`];
  segments.push(`上次检查：${lastCheckText || "未记录"}`);

  if (
    modelState.healthStatus === "error" &&
    typeof modelState.lastErrorMessage === "string" &&
    modelState.lastErrorMessage.trim()
  ) {
    segments.push(`原因：${modelState.lastErrorMessage.trim()}`);
  }

  entry.healthMeta.textContent = segments.join(" ｜ ");
}

function formatHealthStatusLabel(status) {
  switch (status) {
    case "healthy":
      return "健康";
    case "error":
      return "异常";
    case "unknown":
    default:
      return "未知";
  }
}

function formatHealthTimestamp(value) {
  if (!value) {
    return "";
  }

  if (typeof value === "number") {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return "";
    }
    return date.toLocaleString("zh-CN");
  }

  if (typeof value === "string") {
    const parsed = Date.parse(value);
    if (Number.isNaN(parsed)) {
      return "";
    }
    return new Date(parsed).toLocaleString("zh-CN");
  }

  return "";
}

document.addEventListener("DOMContentLoaded", () => {
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
 * Prompt编辑器相关初始化
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
 * 点击字段标签插入占位符
 * @param {MouseEvent} event - 点击事件
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
    setPromptConfigStatus("当前模板未返回任何字段。", "info");
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
    setPromptConfigStatus("请选择需要输出的字段，并补全字段内容。", "info");
  }
}

function renderFieldConfigForm() {
  const container = document.getElementById("field-config-list");
  if (!container) {
    return;
  }

  const selectedFields = promptEditorState.selectedFields || [];
  if (selectedFields.length === 0) {
    container.innerHTML =
      '<div class="text-xs text-gray-500 border border-dashed border-slate-300 rounded-md p-3 bg-slate-50">请选择字段后配置字段内容。</div>';
    return;
  }

  const cardsHtml = selectedFields
    .map((field) => {
      const safeField = escapeHtml(field);
      return `
        <div class="field-config-item border border-slate-200 rounded-md p-4 bg-white" data-field-config-item="${safeField}">
          <div class="flex flex-col gap-1">
            <h5 class="text-sm font-semibold text-slate-700">${safeField}</h5>
          </div>
          <div class="mt-3">
            <label class="block text-xs font-medium text-gray-600 mb-1">字段内容 <span class="text-red-500">*</span></label>
            <textarea
              class="w-full p-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-slate-500 focus:border-slate-500"
              rows="3"
              data-field-name="${safeField}"
              data-field-role="content"
              placeholder="描述该字段应包含的内容，例如输出结构、语气等要求"
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

function ensureFieldConfig(fieldName) {
  if (!promptEditorState.fieldConfigs[fieldName]) {
    promptEditorState.fieldConfigs[fieldName] = {
      content: "",
    };
  }
  return promptEditorState.fieldConfigs[fieldName];
}

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

function generateDefaultPrompt() {
  const selectedFields = promptEditorState.selectedFields || [];
  if (selectedFields.length === 0) {
    return "";
  }

  const lines = [];
  lines.push("请严格按照下列要求生成输出。");
  lines.push("");
  lines.push("字段返回内容定义：");

  selectedFields.forEach((field) => {
    const config = ensureFieldConfig(field);
    const content = (config.content || "").trim();

    lines.push(`${field}：${content || "请生成与该字段相关的内容。"}`);
    lines.push("");
  });

  lines.push("输出格式定义：");
  lines.push("请按照以下 JSON 结构返回结果，仅包含所列字段：");
  lines.push("{");
  selectedFields.forEach((field, index) => {
    const comma = index === selectedFields.length - 1 ? "" : ",";
    lines.push(`  "${field}": "请填入${field}的内容"${comma}`);
  });
  lines.push("}");
  lines.push("");
  lines.push("注意事项：");
  lines.push("- 仅返回 JSON，不要包含额外解释。");
  lines.push("- 确保各字段内容满足上文要求。");

  return (
    lines
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim() + "\n"
  );
}

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
        errorLabel.textContent = "字段内容为必填项";
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
      setPromptConfigStatus("请选择至少一个要输出的字段。", "error");
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
    setPromptConfigStatus("字段配置已就绪。", "success");
    setTimeout(() => {
      setPromptConfigStatus("", "");
    }, 1500);
  } else {
    setPromptConfigStatus("", "");
  }

  return { isValid: true, missingFields: [] };
}

function escapeCssSelector(value) {
  if (window.CSS && typeof window.CSS.escape === "function") {
    return window.CSS.escape(value);
  }
  return value.replace(/([\s!"#$%&'()*+,./:;<=>?@[\]^`{|}~])/g, "$1");
}

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
 * 将模型专用Prompt重置为默认值
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
    setPromptConfigStatus("已根据当前字段配置生成默认 Prompt。", "info");
  } else {
    setPromptConfigStatus(
      "请先选择并配置字段，然后再生成默认 Prompt。",
      "info"
    );
  }
}

/**
 * 显示Prompt设置UI
 * @param {string} modelName - 模型名称
 * @param {string[]} fields - 字段列表
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
    console.warn("未找到Prompt设置元素");
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
    currentModelLabel.textContent = `当前模板：${modelName}`;
  }

  if (modelHint) {
    modelHint.textContent = "提示：保存设置后将在 popup 中使用此 Prompt。";
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
 * 重置Prompt设置UI
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
    console.warn("未找到Prompt设置元素");
    return;
  }

  promptEditorState.currentModel = "";
  promptEditorState.lastSavedPrompt = "";
  promptEditorState.selectedFields = [];
  promptEditorState.fieldConfigs = {};
  promptEditorState.availableFields = [];
  promptEditorState.lastGeneratedPrompt = "";

  if (currentModelLabel) {
    currentModelLabel.textContent = "当前模板：未选择";
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
 * 显示Prompt编辑状态
 * @param {boolean} [forced] - 强制显示/隐藏
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
 * 导出配置文件
 */
async function handleExportConfiguration() {
  try {
    updateStatus("save-status", "正在导出配置...", "loading");
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

    updateStatus("save-status", "配置导出成功", "success");
  } catch (error) {
    console.error("导出配置失败:", error);
    updateStatus("save-status", `配置导出失败: ${error.message}`, "error");
  }
}


/**
 * 导入配置文件
 * @param {Event} event - change事件
 */
async function handleImportConfiguration(event) {
  const fileInput = event?.target;
  const file = fileInput?.files && fileInput.files[0];
  if (!file) {
    return;
  }

  try {
    updateStatus("save-status", "正在导入配置...", "loading");
    const text = await file.text();
    let importedConfig;
    try {
      importedConfig = JSON.parse(text);
    } catch (parseError) {
      throw new Error("配置文件不是有效的 JSON");
    }

    if (!importedConfig || typeof importedConfig !== "object") {
      throw new Error("配置文件格式不正确");
    }

    if (!importedConfig.aiConfig) {
      throw new Error("配置文件缺少 aiConfig");
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
    updateStatus("save-status", "配置导入成功，请重新配置 API 密钥", "success");
    setTimeout(() => window.location.reload(), 1000);
  } catch (error) {
    console.error("导入配置失败:", error);
    updateStatus("save-status", `配置导入失败: ${error.message}`, "error");
  } finally {
    if (event?.target) {
      event.target.value = "";
    }
  }
}

/**
 * 将配置重置为默认状态
 */
async function handleResetConfiguration() {
  if (!confirm("确定要重置所有配置吗？此操作不可撤销。")) {
    return;
  }

  try {
    updateStatus("save-status", "正在重置配置...", "loading");
    const defaultConfig = storageApi.getDefaultConfig();
    await storageApi.saveConfig(defaultConfig);
    currentConfig = defaultConfig;
    updateStatus("save-status", "配置已重置为默认值", "success");
    setTimeout(() => window.location.reload(), 800);
  } catch (error) {
    console.error("重置配置失败:", error);
    updateStatus("save-status", `重置配置失败: ${error.message}`, "error");
  }
}

/**
 * 加载并显示配置
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
  if (languageSelect && config?.language) {
    languageSelect.value = config.language;
  }

  console.info("配置加载完成。");
}

/**
 * 保存按钮处理器
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
    updateStatus("save-status", "请为当前提供商填写 API Key", "error");
    return;
  }

  if (
    selectedState.apiUrl &&
    !/^https?:\/\//i.test(selectedState.apiUrl)
  ) {
    updateStatus("save-status", "API 地址格式不正确", "error");
    return;
  }

  const promptTextarea = document.getElementById("custom-prompt-textarea");
  const languageSelect = document.getElementById("language-select");
  const deckSelect = document.getElementById("default-deck");
  const modelSelect = document.getElementById("default-model");
  const fontSizeSelect = document.getElementById("font-size-select");
  const textAlignSelect = document.getElementById("text-align-select");
  const lineHeightSelect = document.getElementById("line-height-select");

  const language = languageSelect ? languageSelect.value : "zh-CN";
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

  // 构建新配置
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
    const baseState =
      currentConfig?.aiConfig?.models?.[provider.id] ?? {};
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
        formState.apiUrl ||
        baseState.apiUrl ||
        defaultModelState.apiUrl ||
        "",
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
      promptApi.savePromptForModel(
        selectedModel,
        normalizedValue,
        nextConfig
      );
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

    updateStatus("save-status", "设置已保存", "success");
  } catch (error) {
    if (error instanceof PermissionRequestError) {
      console.warn("[options] 域名权限请求被拒绝：", error);
      updateStatus("save-status", error.message, "error");
      return;
    }

    console.error("保存设置出错:", error);
    updateStatus("save-status", `保存出错: ${error.message}`, "error");
  }
}

/**
 * 模型选择变更处理器
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

    // 保存获取到的字段名
    currentModelFields = fieldsResult.result;

    // 显示字段信息
    const fieldMappingDiv = document.getElementById("field-mapping");
    const container = fieldMappingDiv.querySelector(".field-mapping-container");

    container.innerHTML = `
      <strong>模型字段 (${fieldsResult.result.length}个):</strong>
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

    if (fieldsResult.result.length <= 2) {
      modeDiv.innerHTML = `
        <div class="legacy-mode-info">
          <p><strong>🔄 兼容模式</strong></p>
          <p>该模型字段数 ≤ 2，将使用传统的正面/背面模式。</p>
        </div>
      `;
    } else {
      modeDiv.innerHTML = `
        <div class="dynamic-mode-info">
          <p><strong>✨ 动态字段模式</strong></p>
          <p>该模型支持多字段，AI将自动填充所有字段。popup页面将根据字段名智能生成相应的输入区域。</p>
        </div>
      `;
    }

    container.appendChild(modeDiv);
    fieldMappingDiv.style.display = "block";

    // 显示Prompt配置区域并加载对应模板的Prompt
    showPromptConfig(modelName, currentModelFields);
  } catch (error) {
    console.error("获取字段失败:", error);
    document.getElementById("field-mapping").style.display = "none";
    currentModelFields = []; // 清空
  }
}

/**
 * 测试 Anki 连接并刷新数据
 */
async function handleTestAnki() {
  updateStatus("anki-status", "正在测试连接并刷新数据...", "loading");
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

    updateStatus("anki-status", "数据刷新完成", "success");
  } catch (error) {
    console.error("测试 Anki 连接错误:", error);
    updateStatus("anki-status", `连接错误: ${error.message}`, "error");
  }
}

/**
 * 提供商选择变更
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
 * 单个提供商连接测试
 */
async function handleTestProvider(providerId) {
  const entry = providerUiRegistry.get(providerId);
  if (!entry) {
    return;
  }

  const apiKey = (actualApiKeys[providerId] ?? "").trim();
  if (!apiKey) {
    updateStatus(entry.statusEl.id, "请先输入 API Key", "error");
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
    const message =
      error instanceof Error ? error.message : String(error);
    console.error(`${providerId} 测试失败:`, error);
    updateStatus(entry.statusEl.id, `测试失败: ${message}`, "error");

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
 * 基于已保存配置填充Anki选项
 * @param {object} config - 配置对象
 */
function populateSavedAnkiOptions(config) {
  const ankiConfig = config?.ankiConfig || {};

  // 处理牌组下拉框
  const deckSelect = document.getElementById("default-deck");
  if (ankiConfig.defaultDeck) {
    deckSelect.innerHTML = '<option value="">请选择默认牌组</option>';
    const deckOption = document.createElement("option");
    deckOption.value = ankiConfig.defaultDeck;
    deckOption.textContent = ankiConfig.defaultDeck;
    deckOption.selected = true;
    deckSelect.appendChild(deckOption);
  }

  // 处理模板下拉框
  const modelSelect = document.getElementById("default-model");
  if (ankiConfig.defaultModel) {
    modelSelect.innerHTML = '<option value="">请选择默认模型</option>';
    const modelOption = document.createElement("option");
    modelOption.value = ankiConfig.defaultModel;
    modelOption.textContent = ankiConfig.defaultModel;
    modelOption.selected = true;
    modelSelect.appendChild(modelOption);
  }
}

/**
 * 显示已保存的模板信息和字段
 * @param {string} modelName - 模板名称
 * @param {string[]} modelFields - 字段列表
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

  container.innerHTML = `
    <strong>模型字段 (${modelFields.length}个):</strong>
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

  if (modelFields.length <= 2) {
    modeDiv.innerHTML = `
      <div class="legacy-mode-info">
        <p><strong>🔄 兼容模式</strong></p>
        <p>该模型字段数 ≤ 2，将使用传统的正面/背面模式。</p>
      </div>
    `;
  } else {
    modeDiv.innerHTML = `
      <div class="dynamic-mode-info">
        <p><strong>✨ 动态字段模式</strong></p>
        <p>该模型支持多字段，AI将自动填充所有字段。popup页面将根据字段名智能生成相应的输入区域。</p>
      </div>
    `;
  }

  container.appendChild(modeDiv);
  fieldMappingDiv.style.display = "block";

  // 激活Prompt配置区域
  showPromptConfig(modelName, modelFields);
}

/**
 * 读取Anki数据（牌组/模型）
 */
async function loadAnkiData() {
  try {
    // 牌组
    const decksResult = await ankiApi.getDeckNames();
    if (decksResult.error) {
      throw new Error(`读取牌组失败: ${decksResult.error}`);
    }

    // 模型
    const modelsResult = await ankiApi.getModelNames();
    if (modelsResult.error) {
      throw new Error(`读取模型失败: ${modelsResult.error}`);
    }

    // 牌组下拉
    const deckSelect = document.getElementById("default-deck");
    deckSelect.innerHTML = '<option value="">请选择默认牌组</option>';
    decksResult.result.forEach((deck) => {
      const option = document.createElement("option");
      option.value = deck;
      option.textContent = deck;
      deckSelect.appendChild(option);
    });

    // 模型下拉
    const modelSelect = document.getElementById("default-model");
    modelSelect.innerHTML = '<option value="">请选择默认模型</option>';
    modelsResult.result.forEach((model) => {
      const option = document.createElement("option");
      option.value = model;
      option.textContent = model;
      modelSelect.appendChild(option);
    });
  } catch (error) {
    console.error("读取Anki数据出错:", error);
    updateStatus("anki-status", `出错: ${error.message}`, "error");
  }
}

/**
 * 样式预览更新
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
 * Tab导航初始化
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


// ==================== 配置管理功能 ====================

/**
 * 点击导入配置按钮
 */
function handleImportConfigurationClick() {
  document.getElementById("import-config-input").click();
}

/**
 * 处理导入配置文件
 */
async function handleImportConfigurationFile(event) {
  const file = event.target.files[0];
  if (!file) return;

  try {
    const text = await file.text();
    const importedConfig = JSON.parse(text);

    // 简单验证配置格式
    if (!importedConfig.version || !importedConfig.aiConfig) {
      throw new Error("配置文件格式不正确");
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
    updateStatus("save-status", "配置导入成功，请重新配置API密钥", "success");

    // 重新加载页面配置
    setTimeout(() => window.location.reload(), 1500);
  } catch (error) {
    console.error("导入配置失败:", error);
    updateStatus("save-status", `导入失败: ${error.message}`, "error");
  }

  // 清空文件输入，允许重复导入相同文件
  event.target.value = "";
}

/**
 * 重置配置 - 使用现有的handleResetConfiguration函数
 */
// 这个函数已经在文件中存在了，不需要重复定义

