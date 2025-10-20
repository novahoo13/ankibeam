// content-main.js - フローティングアシスタントのエントリ

const LOG_PREFIX = "[floating-assistant]";
const CONFIG_STORAGE_KEY = "ankiWordAssistantConfig";

let parseTextWithFallback = null;
let parseTextWithDynamicFieldsFallback = null;
let isLegacyMode = null;
let validateFields = null;
let getPromptConfigForModel = null;
let addNote = null;

function logInfo(message, payload) {
  if (payload !== undefined) {
    console.info(`${LOG_PREFIX} ${message}`, payload);
    return;
  }
  console.info(`${LOG_PREFIX} ${message}`);
}

function logWarn(message, payload) {
  if (payload !== undefined) {
    console.warn(`${LOG_PREFIX} ${message}`, payload);
    return;
  }
  console.warn(`${LOG_PREFIX} ${message}`);
}

(async function bootstrap() {
  try {
    const [
      selectionModule,
      floatingButtonModule,
      floatingPanelModule,
      aiServiceModule,
      fieldHandlerModule,
      promptEngineModule,
      ankiConnectModule,
    ] = await Promise.all([
      import(chrome.runtime.getURL("content/selection.js")),
      import(chrome.runtime.getURL("content/floating-button.js")),
      import(chrome.runtime.getURL("content/floating-panel.js")),
      import(chrome.runtime.getURL("utils/ai-service.js")),
      import(chrome.runtime.getURL("utils/field-handler.js")),
      import(chrome.runtime.getURL("utils/prompt-engine.js")),
      import(chrome.runtime.getURL("utils/ankiconnect-proxy.js")),
    ]);
    const { createSelectionMonitor, isRestrictedLocation } = selectionModule;
    const { createFloatingButtonController } = floatingButtonModule;
    const { createFloatingPanelController } = floatingPanelModule;
    ({
      parseTextWithFallback,
      parseTextWithDynamicFieldsFallback,
    } = aiServiceModule);
    ({ isLegacyMode, validateFields } = fieldHandlerModule);
    ({ getPromptConfigForModel } = promptEngineModule);
    ({ addNote } = ankiConnectModule);

    if (isRestrictedLocation(window.location, document)) {
      logInfo("制限されたページのため、コンテンツスクリプトを終了します。", {
        url: window.location.href,
      });
      return;
    }

    const controller = createController(
      createSelectionMonitor,
      createFloatingButtonController,
      createFloatingPanelController,
      loadFloatingAssistantConfig,
    );
    await controller.refreshConfig();

    if (chrome?.storage?.onChanged?.addListener) {
      chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName !== "local") {
          return;
        }
        const change = changes[CONFIG_STORAGE_KEY];
        if (!change) {
          return;
        }
        if (Object.prototype.hasOwnProperty.call(change, "newValue")) {
          controller.applyConfigUpdate(change.newValue);
          return;
        }
        controller.refreshConfig();
      });
    }
  } catch (error) {
    console.error(`${LOG_PREFIX} 初期化に失敗しました。`, error);
  }
})();

function createController(createSelectionMonitor, createFloatingButtonController, createFloatingPanelController, loadConfig) {
  let monitor = null;
  let floatingButton = null;
  let floatingPanel = null;
  let monitoring = false;
  let currentEnabled = false;
  let currentConfig = null;
  let currentSelection = null;

  async function refreshConfig() {
    try {
      const config = await loadConfig();
      applyConfig(config);
    } catch (error) {
      console.error(`${LOG_PREFIX} 設定の読み込みに失敗しました。`, error);
    }
  }

  function applyConfig(config) {
    const normalized = normalizeConfig(config);
    currentConfig = normalized;
    if (floatingPanel) {
      floatingPanel.renderFieldsFromConfig(currentConfig);
    }

    const enabled = Boolean(normalized.ui?.enableFloatingAssistant);
    if (enabled === currentEnabled) {
      return;
    }
    currentEnabled = enabled;

    if (!enabled) {
      stopMonitoring();
      logInfo("フローティングアシスタントが無効化されています。");
      return;
    }

    startMonitoring();
    logInfo("フローティングアシスタントが有効になりました。");
  }

  function startMonitoring() {
    if (!monitor) {
      monitor = createSelectionMonitor(handleSelectionEvent);
    }
    if (!floatingButton) {
      try {
        floatingButton = createFloatingButtonController();
        floatingButton.setTriggerHandler(async (selection) => {
          logInfo("フローティングボタンが起動されました。");
          if (!floatingPanel) {
            return;
          }

          // 保存当前选择
          currentSelection = selection;

          // 显示加载状态
          floatingPanel.showLoading(selection);

          // 渲染字段
          const layout = floatingPanel.renderFieldsFromConfig(currentConfig);
          if (!layout.hasFields) {
            floatingPanel.showError({
              message: layout.message ?? undefined,
              allowRetry: false,
            });
            return;
          }

          // 调用 AI 解析
          try {
            await handleAIParsing(selection.text, layout);
          } catch (error) {
            logWarn("AI解析失败", error);
            floatingPanel.showError({
              message: error?.message ?? "AI解析失败，请重试。",
              allowRetry: true,
            });
          }
        });
      } catch (creationError) {
        console.error(`${LOG_PREFIX} フローティングボタンの初期化に失敗しました。`, creationError);
      }
    }
    if (!floatingPanel) {
      try {
        floatingPanel = createFloatingPanelController();
        floatingPanel.setRetryHandler(async (selection) => {
          logInfo("パネルから再試行要求が呼び出されました。");
          if (!selection || !selection.text) {
            logWarn("再試行時に選択テキストが見つかりません。");
            return;
          }

          // 保存当前选择
          currentSelection = selection;

          floatingPanel.showLoading(selection);
          const layout = floatingPanel.renderFieldsFromConfig(currentConfig);
          if (!layout.hasFields) {
            floatingPanel.showError({
              message: layout.message ?? undefined,
              allowRetry: false,
            });
            return;
          }

          try {
            await handleAIParsing(selection.text, layout);
          } catch (error) {
            logWarn("再試行でもAI解析が失敗しました。", error);
            floatingPanel.showError({
              message: error?.message ?? "AI解析失敗、もう一度お試しください。",
              allowRetry: true,
            });
          }
        });
        floatingPanel.setCloseHandler((reason) => {
          logInfo("解析パネルが閉じられました。", { reason });
        });
        floatingPanel.setWriteHandler(async () => {
          await handleAnkiWrite();
        });
        if (currentConfig) {
          floatingPanel.renderFieldsFromConfig(currentConfig);
        }
      } catch (panelError) {
        console.error(`${LOG_PREFIX} 解析パネルの初期化に失敗しました。`, panelError);
        floatingPanel = null;
      }
    }
    if (monitoring) {
      return;
    }
    monitor.start();
    monitoring = true;
    logInfo("選択監視を開始しました。");
    logInfo("入力要素および contenteditable の選択は対応対象外です。");
  }

  function stopMonitoring() {
    if (monitor && monitoring) {
      monitor.stop();
    }
    monitoring = false;
    if (floatingButton) {
      floatingButton.hide(true);
      floatingButton.destroy();
      floatingButton = null;
    }
    if (floatingPanel) {
      floatingPanel.hide(true);
      floatingPanel.destroy();
      floatingPanel = null;
    }
  }

  function handleSelectionEvent(result) {
    if (!result) {
      if (floatingPanel) {
        floatingPanel.hide(true);
      }
      return;
    }

    // フローティングアシスタントパネル内の選択を無視
    if (result.kind === "ignored-floating-panel") {
      return;
    }

    if (result.kind === "valid") {
      if (floatingPanel) {
        floatingPanel.patchSelection(result);
      }
      if (floatingButton) {
        floatingButton.showForSelection({
          text: result.text,
          rect: result.rect,
          signature: result.signature,
        });
      }
      const payload = {
        anchorTagName: result.anchorTagName,
        focusTagName: result.focusTagName,
      };
      if (result.rect) {
        payload.rect = result.rect;
      }
      logInfo(`選択テキスト: "${result.text}"`, payload);
      return;
    }
    if (floatingButton) {
      floatingButton.hide(true);
    }
    if (floatingPanel) {
      const panelState =
        typeof floatingPanel.getDebugState === "function"
          ? floatingPanel.getDebugState()
          : null;
      const isPanelActive =
        panelState?.visible &&
        (panelState.currentState === "loading" ||
          panelState.currentState === "ready" ||
          panelState.currentState === "error");
      if (!isPanelActive) {
        floatingPanel.hide(true);
      }
    }
    if (result.kind === "unsupported-input") {
      logWarn("入力要素や編集可能領域の選択は対象外です。", {
        anchorTagName: result.anchorTagName,
        focusTagName: result.focusTagName,
      });
    }
  }

  async function handleAIParsing(selectedText, layout) {
    if (!selectedText || !selectedText.trim()) {
      throw new Error("選択されたテキストが空です。");
    }

    if (!currentConfig) {
      throw new Error("設定が読み込まれていません。");
    }

    const modelFields = currentConfig?.ankiConfig?.modelFields;
    const isLegacy = isLegacyMode(currentConfig);

    let result;

    if (isLegacy) {
      // Legacy モード: Front/Back の2つのフィールド
      logInfo("Legacy モードでAI解析を実行します。");
      result = await parseTextWithFallback(selectedText);
    } else {
      // Dynamic モード: ユーザー設定に基づく複数フィールド
      const { modelName, selectedFields, allFields } = getActivePromptSetup();
      const dynamicFields =
        selectedFields && selectedFields.length > 0
          ? selectedFields
          : Array.isArray(modelFields) && modelFields.length > 0
          ? modelFields
          : allFields;

      if (!dynamicFields || dynamicFields.length === 0) {
        throw new Error("現在のテンプレートには解析可能なフィールドが設定されていません。オプションページで設定を完了してください。");
      }

      logInfo("Dynamic モードでAI解析を実行します。", { fields: dynamicFields });

      const customTemplate = getPromptConfigForModel(
        modelName,
        currentConfig
      ).customPrompt;

      result = await parseTextWithDynamicFieldsFallback(
        selectedText,
        dynamicFields,
        customTemplate
      );
    }

    // AI解析結果をパネルのフィールドに適用
    if (floatingPanel) {
      floatingPanel.applyFieldValues(result);
      floatingPanel.showReady();
    }

    logInfo("AI解析が完了しました。", result);
  }

  function getActivePromptSetup() {
    const allFields = Array.isArray(currentConfig?.ankiConfig?.modelFields)
      ? [...currentConfig.ankiConfig.modelFields]
      : [];

    let modelName = currentConfig?.ankiConfig?.defaultModel || "";

    const promptTemplates = currentConfig?.promptTemplates?.promptTemplatesByModel || {};
    if (!modelName && Object.keys(promptTemplates).length > 0) {
      modelName = Object.keys(promptTemplates)[0];
    }

    const promptConfig = getPromptConfigForModel(modelName, currentConfig);
    let selectedFields = Array.isArray(promptConfig.selectedFields)
      ? promptConfig.selectedFields.filter(
          (field) => typeof field === "string" && field.trim()
        )
      : [];

    if (selectedFields.length > 0 && allFields.length > 0) {
      selectedFields = selectedFields.filter((field) =>
        allFields.includes(field)
      );
    }

    if (selectedFields.length === 0) {
      selectedFields = allFields.slice();
    }

    return {
      modelName,
      allFields,
      selectedFields,
      promptConfig,
    };
  }

  async function handleAnkiWrite() {
    if (!floatingPanel) {
      return;
    }

    try {
      // 收集字段
      const collected = floatingPanel.collectFields();
      logInfo("フィールド収集完了", collected);

      const isLegacy = collected.mode === "legacy";

      // 验证字段
      const validation = validateFields(collected.fields, isLegacy);

      if (!validation.isValid) {
        const errorMessage = validation.message || "フィールド検証に失敗しました。";
        floatingPanel.showError({
          message: errorMessage,
          allowRetry: false,
        });
        return;
      }

      // 显示写入状态
      floatingPanel.showLoading(currentSelection, {
        message: "Ankiに書き込んでいます...",
      });

      // 准备写入数据
      const deckName = currentConfig?.ankiConfig?.defaultDeck || "Default";
      const modelName = currentConfig?.ankiConfig?.defaultModel || "Basic";
      const tags = currentConfig?.ankiConfig?.defaultTags || [];

      const noteData = {
        deckName,
        modelName,
        fields: collected.fields,
        tags,
      };

      logInfo("Ankiに書き込みます。", noteData);

      // 调用 AnkiConnect
      const result = await addNote(noteData);

      if (result.error) {
        throw new Error(result.error);
      }

      // 成功
      floatingPanel.showReady({
        message: "Ankiに書き込みました！",
      });

      logInfo("Anki書き込み成功", { noteId: result.result });

    } catch (error) {
      logWarn("Anki書き込み失敗", error);

      let errorMessage = error?.message || "Anki書き込みに失敗しました。";

      // 特殊错误处理
      if (errorMessage.includes("fetch") || errorMessage.includes("Failed to fetch")) {
        errorMessage = "Ankiが起動していることと、AnkiConnectプラグインがインストールされていることを確認してください。";
      }

      floatingPanel.showError({
        message: errorMessage,
        allowRetry: false,
      });
    }
  }

  return {
    refreshConfig,
    applyConfigUpdate: applyConfig,
  };
}

async function loadFloatingAssistantConfig() {
  const stored = await readStoredConfig();
  return normalizeConfig(stored);
}

async function readStoredConfig() {
  if (!chrome?.storage?.local?.get) {
    return null;
  }

  try {
    const getter = chrome.storage.local.get.bind(chrome.storage.local);
    let result;
    try {
      result = getter(CONFIG_STORAGE_KEY);
    } catch (callError) {
      result = null;
    }

    if (result && typeof result.then === "function") {
      const resolved = await result;
      return resolved?.[CONFIG_STORAGE_KEY] ?? null;
    }

    return await new Promise((resolve, reject) => {
      try {
        getter(CONFIG_STORAGE_KEY, (items) => {
          const lastError = chrome.runtime?.lastError;
          if (lastError) {
            reject(new Error(lastError.message));
            return;
          }
          resolve(items?.[CONFIG_STORAGE_KEY] ?? null);
        });
      } catch (error) {
        reject(error);
      }
    });
  } catch (error) {
    console.error(`${LOG_PREFIX} ストレージ読み込み時にエラーが発生しました。`, error);
    return null;
  }
}

function sanitizeStringArray(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter((entry) => entry.length > 0);
}

function normalizeConfig(rawConfig) {
  const defaults = {
    ui: {
      enableFloatingAssistant: true,
      fieldDisplayMode: "auto",
    },
    ankiConfig: {
      defaultDeck: "",
      defaultModel: "",
      modelFields: [],
      defaultTags: [],
    },
    promptTemplates: {
      promptTemplatesByModel: {},
      custom: "",
    },
    styleConfig: {},
    language: "zh-CN",
  };

  if (!rawConfig || typeof rawConfig !== "object") {
    return { ...defaults };
  }

  const normalized = { ...rawConfig };

  const ui =
    rawConfig.ui && typeof rawConfig.ui === "object"
      ? { ...defaults.ui, ...rawConfig.ui }
      : { ...defaults.ui };
  ui.enableFloatingAssistant = Boolean(ui.enableFloatingAssistant);
  normalized.ui = ui;

  const ankiConfig =
    rawConfig.ankiConfig && typeof rawConfig.ankiConfig === "object"
      ? { ...defaults.ankiConfig, ...rawConfig.ankiConfig }
      : { ...defaults.ankiConfig };
  ankiConfig.modelFields = sanitizeStringArray(ankiConfig.modelFields);
  ankiConfig.defaultTags = sanitizeStringArray(ankiConfig.defaultTags);
  normalized.ankiConfig = ankiConfig;

  const promptTemplates =
    rawConfig.promptTemplates && typeof rawConfig.promptTemplates === "object"
      ? { ...defaults.promptTemplates, ...rawConfig.promptTemplates }
      : { ...defaults.promptTemplates };
  if (
    !promptTemplates.promptTemplatesByModel ||
    typeof promptTemplates.promptTemplatesByModel !== "object"
  ) {
    promptTemplates.promptTemplatesByModel = {};
  }
  normalized.promptTemplates = promptTemplates;

  const styleConfig =
    rawConfig.styleConfig && typeof rawConfig.styleConfig === "object"
      ? { ...rawConfig.styleConfig }
      : { ...defaults.styleConfig };
  normalized.styleConfig = styleConfig;

  if (typeof rawConfig.language === "string" && rawConfig.language.trim()) {
    normalized.language = rawConfig.language.trim();
  } else if (typeof normalized.language !== "string" || !normalized.language.trim()) {
    normalized.language = defaults.language;
  }

  return normalized;
}
