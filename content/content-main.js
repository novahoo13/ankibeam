// content-main.js - フローティングアシスタントのエントリ

const LOG_PREFIX = "[floating-assistant]";
const CONFIG_STORAGE_KEY = "ankiWordAssistantConfig";

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
    const [selectionModule, floatingButtonModule] = await Promise.all([
      import(chrome.runtime.getURL("content/selection.js")),
      import(chrome.runtime.getURL("content/floating-button.js")),
    ]);
    const { createSelectionMonitor, isRestrictedLocation } = selectionModule;
    const { createFloatingButtonController } = floatingButtonModule;

    if (isRestrictedLocation(window.location, document)) {
      logInfo("制限されたページのため、コンテンツスクリプトを終了します。", {
        url: window.location.href,
      });
      return;
    }

    const controller = createController(createSelectionMonitor, createFloatingButtonController, loadFloatingAssistantConfig);
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

function createController(createSelectionMonitor, createFloatingButtonController, loadConfig) {
  let monitor = null;
  let floatingButton = null;
  let monitoring = false;
  let currentEnabled = false;

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
        floatingButton.setTriggerHandler(() => {
          logInfo("フローティングボタンが起動されました。");
        });
      } catch (creationError) {
        console.error(`${LOG_PREFIX} フローティングボタンの初期化に失敗しました。`, creationError);
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
  }

  function handleSelectionEvent(result) {
    if (!result) {
      return;
    }
    if (result.kind === "valid") {
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
    if (result.kind === "unsupported-input") {
      logWarn("入力要素や編集可能領域の選択は対象外です。", {
        anchorTagName: result.anchorTagName,
        focusTagName: result.focusTagName,
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

function normalizeConfig(rawConfig) {
  const base = {
    ui: {
      enableFloatingAssistant: true,
    },
  };

  if (!rawConfig || typeof rawConfig !== "object") {
    return base;
  }

  const normalized = { ...rawConfig };
  const ui = (normalized.ui && typeof normalized.ui === "object" ? { ...normalized.ui } : {});
  if (typeof ui.enableFloatingAssistant !== "boolean") {
    ui.enableFloatingAssistant = true;
  }

  normalized.ui = ui;
  return normalized;
}
