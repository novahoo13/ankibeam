// options.js - オプション画面
// 目的: 設定の表示・保存、各種接続のテスト

import { saveConfig, loadConfig, getDefaultConfig } from "../utils/storage.js";
import {
  testConnection as testAnki,
  getDeckNames,
  getModelNames,
  getModelFieldNames,
} from "../utils/ankiconnect.js";
import {
  testConnection as testAi,
  getProvidersHealth,
  testCurrentProvider,
} from "../utils/ai-service.js";
import {
  loadPromptForModel,
  savePromptForModel,
  getPromptConfigForModel,
  updatePromptConfigForModel,
} from "../utils/prompt-engine.js";

// APIキーの実値（DOMには伏せ字を表示）
let actualApiKeys = {
  google: "",
  openai: "",
  anthropic: "",
};

// 現在のモデルフィールド一覧
let currentModelFields = [];

// 現在の設定オブジェクト
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

document.addEventListener("DOMContentLoaded", () => {
  // Tab导航初始化
  initTabNavigation();

  // 設定のロードと表示
  loadAndDisplayConfig();

  // イベント登録
  document.getElementById("save-btn").addEventListener("click", handleSave);
  document
    .getElementById("test-anki-btn")
    .addEventListener("click", handleTestAnki);
  document
    .getElementById("default-model")
    .addEventListener("change", handleModelChange);

  // AIプロバイダ関連
  document
    .getElementById("ai-provider")
    .addEventListener("change", handleProviderChange);

  // APIキーの表示切替
  setupApiKeyInputs();

  // 各プロバイダ接続テストボタン
  setupTestProviderButtons();

  // Promptエディタの初期化
  setupPromptEditor();

  // 配置管理按钮
  document
    .getElementById("export-config-btn")
    .addEventListener("click", handleExportConfiguration);
  document
    .getElementById("import-config-btn")
    .addEventListener("click", handleImportConfigurationClick);
  document
    .getElementById("import-config-input")
    .addEventListener("change", handleImportConfigurationFile);
  document
    .getElementById("reset-config-btn")
    .addEventListener("click", handleResetConfiguration);

  // スタイルプレビュー
  document
    .getElementById("font-size-select")
    .addEventListener("change", updateStylePreview);
  document
    .getElementById("text-align-select")
    .addEventListener("change", updateStylePreview);
  document
    .getElementById("line-height-select")
    .addEventListener("change", updateStylePreview);
});

/**
 * 各プロバイダ接続テストボタン
 */
function setupTestProviderButtons() {
  document.querySelectorAll(".test-provider-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const provider = e.target.getAttribute("data-provider");
      if (provider) {
        handleTestProvider(provider);
      }
    });
  });
}

/**
 * Promptエディタ関連の初期化
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
 * フィールドタグのクリックでプレースホルダを挿入
 * @param {MouseEvent} event - クリックイベント
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
    promptEditorState.selectedFields = selected.filter((field) => field !== fieldName);
  } else {
    promptEditorState.selectedFields = Array.from(new Set([...selected, fieldName]));
  }

  const normalizedSelection = (promptEditorState.selectedFields || []).filter((field) =>
    availableFields.includes(field)
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

  const normalizedSelection = (promptEditorState.selectedFields || []).filter((field) =>
    availableFields.includes(field)
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

    const contentArea = card.querySelector('textarea[data-field-role="content"]');

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

  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
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
  const trimmedLastGenerated = (promptEditorState.lastGeneratedPrompt || "").trim();

  const wasAutoGenerated = !trimmedCurrent || trimmedCurrent === trimmedLastGenerated;

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
  return value.replace(/([\s!"#$%&'()*+,./:;<=>?@[\]^`{|}~])/g, "\$1");
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
 * モデル専用Promptをデフォルトに戻す
 */

function handleResetPromptTemplate() {
  const promptTextarea = document.getElementById("custom-prompt-textarea");
  if (!promptTextarea || promptTextarea.disabled) {
    return;
  }

  synchronizeGeneratedPrompt({ forceUpdate: true });
  updatePromptPreview();
  markPromptDirtyFlag();

  const generatedPrompt = (promptEditorState.lastGeneratedPrompt || "").trim();
  if (generatedPrompt) {
    setPromptConfigStatus("已根据当前字段配置生成默认 Prompt。", "info");
  } else {
    setPromptConfigStatus("请先选择并配置字段，然后再生成默认 Prompt。", "info");
  }
}



/**
 * Prompt設定UIを表示
 * @param {string} modelName - モデル名
 * @param {string[]} fields - フィールド一覧
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
    console.warn("Prompt設定要素が見つかりません");
    return;
  }

  promptEditorState.currentModel = modelName;
  promptEditorState.availableFields = Array.isArray(fields) ? [...fields] : [];

  const promptConfig = getPromptConfigForModel(modelName, currentConfig);
  promptEditorState.selectedFields = Array.isArray(promptConfig.selectedFields)
    ? [...promptConfig.selectedFields]
    : [];
  promptEditorState.fieldConfigs = {};
  if (promptConfig.fieldConfigs && typeof promptConfig.fieldConfigs === "object") {
    Object.keys(promptConfig.fieldConfigs).forEach((fieldName) => {
      const fieldConfig = promptConfig.fieldConfigs[fieldName] || {};
      promptEditorState.fieldConfigs[fieldName] = {
        content: typeof fieldConfig.content === "string" ? fieldConfig.content : "",
      };
    });
  }

  const availableFields = promptEditorState.availableFields;
  promptEditorState.selectedFields = promptEditorState.selectedFields.filter((field) =>
    availableFields.includes(field)
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

  const storedPrompt = typeof promptConfig.customPrompt === "string" ? promptConfig.customPrompt : "";
  promptTextarea.value = storedPrompt;
  promptEditorState.lastSavedPrompt = storedPrompt;

  const forceGenerate = !storedPrompt.trim();
  synchronizeGeneratedPrompt({ forceUpdate: forceGenerate });
  markPromptDirtyFlag();
}



/**
 * Prompt設定UIをリセット
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
    console.warn("Prompt設定要素が見つかりません");
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
 * Promptの編集状態を表示
 * @param {boolean} [forced] - 強制表示/非表示
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
 * 正規表現用に文字列をエスケープ
 * @param {string} value - 対象文字列
 * @returns {string}
 */
/**
 * 設定ファイルをエクスポート
 */
async function handleExportConfiguration() {
  try {
    updateStatus("save-status", "正在导出配置...", "loading");
    const baseConfig =
      currentConfig && Object.keys(currentConfig).length
        ? currentConfig
        : getDefaultConfig();
    const exportData = JSON.parse(JSON.stringify(baseConfig));
    exportData.version = exportData.version || "2.1";
    exportData.exportedAt = new Date().toISOString();

    if (exportData.aiConfig?.models) {
      Object.keys(exportData.aiConfig.models).forEach((provider) => {
        if (!exportData.aiConfig.models[provider]) {
          exportData.aiConfig.models[provider] = {};
        }
        exportData.aiConfig.models[provider].apiKey = "";
        exportData.aiConfig.models[provider].healthStatus = "unknown";
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
    console.error("設定エクスポートに失敗しました:", error);
    updateStatus("save-status", `配置导出失败: ${error.message}`, "error");
  }
}

/**
 * インポートダイアログを開く
 */
function triggerImportDialog() {
  const fileInput = document.getElementById("import-config-input");
  if (fileInput) {
    fileInput.value = "";
    fileInput.click();
  }
}

/**
 * 設定ファイルをインポート
 * @param {Event} event - changeイベント
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

    const baseConfig = getDefaultConfig();
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

    await saveConfig(mergedConfig);
    currentConfig = mergedConfig;
    updateStatus("save-status", "配置导入成功，请重新配置 API 密钥", "success");
    setTimeout(() => window.location.reload(), 1000);
  } catch (error) {
    console.error("設定インポートに失敗しました:", error);
    updateStatus("save-status", `配置导入失败: ${error.message}`, "error");
  } finally {
    if (event?.target) {
      event.target.value = "";
    }
  }
}

/**
 * 設定をデフォルト状態にリセット
 */
async function handleResetConfiguration() {
  if (!confirm("确定要重置所有配置吗？此操作不可撤销。")) {
    return;
  }

  try {
    updateStatus("save-status", "正在重置配置...", "loading");
    const defaultConfig = getDefaultConfig();
    await saveConfig(defaultConfig);
    currentConfig = defaultConfig;
    updateStatus("save-status", "配置已重置为默认值", "success");
    setTimeout(() => window.location.reload(), 800);
  } catch (error) {
    console.error("設定リセットに失敗しました:", error);
    updateStatus("save-status", `重置配置失败: ${error.message}`, "error");
  }
}

/**
 * APIキーの表示/非表示 切替
 * @param {Event} e - イベント
 */
function setupApiKeyInputs() {
  document.querySelectorAll(".toggle-visibility-btn").forEach((btn) => {
    btn.addEventListener("click", handleToggleVisibility);
  });

  Object.keys(actualApiKeys).forEach((provider) => {
    const input = document.getElementById(`${provider}-api-key`);
    if (input) {
      input.addEventListener("input", (e) => {
        // プレースホルダー以外が入力されたら実値を更新
        if (e.target.value !== API_KEY_PLACEHOLDER) {
          actualApiKeys[provider] = e.target.value;
        }
      });
    }
  });
}

/**
 * APIキーの表示/非表示 切替
 * @param {Event} e - イベント
 */
function handleToggleVisibility(e) {
  const targetId = e.target.getAttribute("data-target");
  const input = document.getElementById(targetId);
  const provider = targetId.replace("-api-key", "");

  if (input) {
    if (input.type === "password") {
      input.type = "text";
      input.value = actualApiKeys[provider];
      e.target.textContent = "隐藏";
    } else {
      input.type = "password";
      input.value = API_KEY_PLACEHOLDER;
      e.target.textContent = "显示";
    }
  }
}

/**
 * 設定のロードと表示
 */
async function loadAndDisplayConfig() {
  const config = await loadConfig();
  currentConfig = config;

  // AI設定
  const aiConfig = config?.aiConfig || {};

  // デフォルトプロバイダ
  document.getElementById("ai-provider").value = aiConfig.provider || "google";

  // 各プロバイダ設定
  const models = aiConfig.models || {};

  // 供給者ごとの入力反映
  const loadProviderConfig = (provider) => {
    const providerConfig = models[provider] || {};
    const input = document.getElementById(`${provider}-api-key`);
    if (providerConfig.apiKey) {
      actualApiKeys[provider] = providerConfig.apiKey;
      input.value = API_KEY_PLACEHOLDER;
    }
    const modelInput = document.getElementById(`${provider}-model-name`);
    if (modelInput) modelInput.value = providerConfig.modelName || "";
    const urlInput = document.getElementById(`${provider}-api-url`);
    if (urlInput) urlInput.value = providerConfig.apiUrl || "";
  };

  ["google", "openai", "anthropic"].forEach(loadProviderConfig);


  // AnkiConfig
  currentModelFields = config?.ankiConfig?.modelFields || [];

  // 基于已保存配置填充Anki选项
  populateSavedAnkiOptions(config);

  // 如果已经有默认模型和字段，直接显示模板信息
  if (config?.ankiConfig?.defaultModel && config?.ankiConfig?.modelFields) {
    displaySavedModelInfo(config.ankiConfig.defaultModel, config.ankiConfig.modelFields);
  }

  // StyleConfig
  document.getElementById("font-size-select").value =
    config?.styleConfig?.fontSize || "14px";
  document.getElementById("text-align-select").value =
    config?.styleConfig?.textAlign || "left";
  document.getElementById("line-height-select").value =
    config?.styleConfig?.lineHeight || "1.4";

  console.log("設定を読み込みました。");
}

/**
 * 保存ボタン ハンドラ
 */

async function handleSave() {
  // 選択中のAIプロバイダ
  const provider = document.getElementById("ai-provider").value;

  // DOM から情報を取得（APIキーは actualApiKeys から）
  const googleConfig = {
    apiKey: actualApiKeys.google,
    modelName: document.getElementById("google-model-name").value,
    apiUrl: document.getElementById("google-api-url").value,
    healthStatus: "unknown",
  };

  const openaiConfig = {
    apiKey: actualApiKeys.openai,
    modelName: document.getElementById("openai-model-name").value,
    apiUrl: document.getElementById("openai-api-url").value,
    healthStatus: "unknown",
  };

  const anthropicConfig = {
    apiKey: actualApiKeys.anthropic,
    modelName: document.getElementById("anthropic-model-name").value,
    apiUrl: document.getElementById("anthropic-api-url").value,
    healthStatus: "unknown",
  };

  // Prompt
  const promptTextarea = document.getElementById("custom-prompt-textarea");
  const language = document.getElementById("language-select").value;
  const defaultDeck = document.getElementById("default-deck").value;
  const defaultModel = document.getElementById("default-model").value;

  // スタイル
  const fontSize = document.getElementById("font-size-select").value;
  const textAlign = document.getElementById("text-align-select").value;
  const lineHeight = document.getElementById("line-height-select").value;

  const isPromptEditorActive =
    promptEditorState.currentModel && promptTextarea && !promptTextarea.disabled;

  if (isPromptEditorActive) {
    const validation = validateFieldConfigurations(true);
    if (!validation.isValid) {
      return;
    }
  }

  // 新しい設定
  const existingPromptTemplatesByModel = {};
  const storedPromptConfigs =
    currentConfig?.promptTemplates?.promptTemplatesByModel || {};
  const legacyPromptConfigs = currentConfig?.ankiConfig?.promptTemplatesByModel || {};

  new Set([
    ...Object.keys(storedPromptConfigs),
    ...Object.keys(legacyPromptConfigs),
  ]).forEach((modelName) => {
    existingPromptTemplatesByModel[modelName] = getPromptConfigForModel(
      modelName,
      currentConfig
    );
  });

  if (promptEditorState.currentModel) {
    const selectedSnapshot = [...(promptEditorState.selectedFields || [])];
    const existingConfig =
      existingPromptTemplatesByModel[promptEditorState.currentModel] || {
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

  const newConfig = {
    aiConfig: {
      provider: provider,
      models: {
        google: googleConfig,
        openai: openaiConfig,
        anthropic: anthropicConfig,
      },
      fallbackOrder: ["google", "openai", "anthropic"],
    },
    promptTemplates: {
      promptTemplatesByModel: existingPromptTemplatesByModel,
    },
    ankiConfig: {
      defaultDeck: defaultDeck,
      defaultModel: defaultModel,
      modelFields: currentModelFields,
      defaultTags: [],
    },
    styleConfig: {
      fontSize: fontSize,
      textAlign: textAlign,
      lineHeight: lineHeight,
    },
    language: language,
  };

  let promptValueForSelectedModel = null;
  const selectedModel = document.getElementById("default-model").value;

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
      savePromptForModel(selectedModel, normalizedValue, newConfig);
      promptValueForSelectedModel = normalizedValue;
    } else {
      updatePromptConfigForModel(selectedModel, { customPrompt: "" }, newConfig);
      promptValueForSelectedModel = "";
    }

    updatePromptConfigForModel(
      selectedModel,
      {
        selectedFields: [...(promptEditorState.selectedFields || [])],
        fieldConfigs: cloneSelectedFieldConfigs(promptEditorState.selectedFields || []),
      },
      newConfig
    );
  }

  try {
    await saveConfig(newConfig);
    currentConfig = newConfig; // 更新本地配置缓存

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
    console.error("保存设置出错:", error);
    updateStatus("save-status", `保存出错: ${error.message}`, "error");
  }
}


/**
 * モデル選択変更 ハンドラ
 */
async function handleModelChange() {
  const modelName = document.getElementById("default-model").value;
  if (!modelName) {
    document.getElementById("field-mapping").style.display = "none";
    currentModelFields = []; // クリア
    return;
  }

  try {
    const fieldsResult = await getModelFieldNames(modelName);
    if (fieldsResult.error) {
      throw new Error(fieldsResult.error);
    }

    // 取得したフィールド名を保持
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
    currentModelFields = []; // クリア
  }
}

/**
 * 测试 Anki 连接并刷新数据
 */
async function handleTestAnki() {
  updateStatus("anki-status", "正在测试连接并刷新数据...", "loading");
  try {
    const result = await testAnki();
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
      const deckOption = Array.from(deckSelect.options).find(opt => opt.value === currentDeck);
      if (deckOption) {
        deckSelect.value = currentDeck;
      }
    }

    if (currentModel) {
      const modelSelect = document.getElementById("default-model");
      const modelOption = Array.from(modelSelect.options).find(opt => opt.value === currentModel);
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
 * 提供商选择改变
 */
function handleProviderChange() {
  const selectedProvider = document.getElementById("ai-provider").value;

  // 先隐藏全部
  document.querySelectorAll(".provider-config").forEach((config) => {
    config.style.display = "none";
  });

  // 显示选中项
  const activeConfig = document.getElementById(`config-${selectedProvider}`);
  if (activeConfig) {
    activeConfig.style.display = "block";
  }
}

/**
 * 单个提供商连接测试
 */
async function handleTestProvider(provider) {
  const modelSelect = document.getElementById(`${provider}-model-name`);

  try {
    const result = await testAi(provider, {
      modelName: modelSelect ? modelSelect.value : undefined,
    });

    if (result.success) {
      updateStatus(`ai-status-${provider}`, result.message, "success");
    } else {
      updateStatus(`ai-status-${provider}`, result.message, "error");
    }
  } catch (error) {
    console.error(`${provider} 测试失败:`, error);
    updateStatus(
      `ai-status-${provider}`,
      `测试失败: ${error.message}`,
      "error"
    );
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
 * 读取 Anki 数据（牌组/模型）
 */
async function loadAnkiData() {
  try {
    // 牌组
    const decksResult = await getDeckNames();
    if (decksResult.error) {
      throw new Error(`读取牌组失败: ${decksResult.error}`);
    }

    // 模型
    const modelsResult = await getModelNames();
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
    console.error("读取 Anki 数据出错:", error);
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
 * ステータス表示更新
 * @param {string} elementId - 要素ID
 * @param {string} message - メッセージ
 * @param {'success'|'error'|'loading'} type - 種別
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
 * Tab导航初始化函数
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

/**
 * 可选：URL hash路由支持
 */
function initTabRouting() {
  // 监听hash变化
  window.addEventListener("hashchange", () => {
    const hash = window.location.hash.slice(1);
    const targetButton = document.querySelector(`[data-tab="${hash}"]`);
    if (targetButton) {
      targetButton.click();
    }
  });

  // 页面加载时根据hash设置初始tab
  if (window.location.hash) {
    const hash = window.location.hash.slice(1);
    const targetButton = document.querySelector(`[data-tab="${hash}"]`);
    if (targetButton) {
      targetButton.click();
    }
  }
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

    await saveConfig(mergedConfig);
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





