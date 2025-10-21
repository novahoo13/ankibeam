// content-main.js - 浮动助手入口文件

// 日志前缀，方便在控制台过滤和识别日志
const LOG_PREFIX = "[floating-assistant]";
// 存储在 chrome.storage.local 中的配置键名
const CONFIG_STORAGE_KEY = "ankiWordAssistantConfig";

// 从模块动态导入的函数，预先声明
let parseTextWithFallback = null;
let parseTextWithDynamicFieldsFallback = null;
let isLegacyMode = null;
let validateFields = null;
let getPromptConfigForModel = null;
let addNote = null;

/**
 * 打印普通信息日志
 * @param {string} message - 日志消息
 * @param {any} [payload] - 可选的附加数据
 */
function logInfo(message, payload) {
  if (payload !== undefined) {
    console.info(`${LOG_PREFIX} ${message}`, payload);
    return;
  }
  console.info(`${LOG_PREFIX} ${message}`);
}

/**
 * 打印警告日志
 * @param {string} message - 警告消息
 * @param {any} [payload] - 可选的附加数据
 */
function logWarn(message, payload) {
  if (payload !== undefined) {
    console.warn(`${LOG_PREFIX} ${message}`, payload);
    return;
  }
  console.warn(`${LOG_PREFIX} ${message}`);
}

/**
 * 启动函数 (IIFE - 立即调用函数表达式)
 * 负责异步加载所有模块并初始化内容脚本
 */
(async function bootstrap() {
  try {
    // 并行加载所有必需的JS模块，以提高启动速度
    const [
      selectionModule, // 处理文本选择
      floatingButtonModule, // 浮动按钮UI
      floatingPanelModule, // 浮动面板UI
      aiServiceModule, // AI解析服务
      fieldHandlerModule, // Anki字段处理
      promptEngineModule, // Prompt模板引擎
      ankiConnectModule, // AnkiConnect代理
    ] = await Promise.all([
      import(chrome.runtime.getURL("content/selection.js")),
      import(chrome.runtime.getURL("content/floating-button.js")),
      import(chrome.runtime.getURL("content/floating-panel.js")),
      import(chrome.runtime.getURL("utils/ai-service.js")),
      import(chrome.runtime.getURL("utils/field-handler.js")),
      import(chrome.runtime.getURL("utils/prompt-engine.js")),
      import(chrome.runtime.getURL("utils/ankiconnect-proxy.js")),
    ]);

    // 从加载的模块中解构并赋值函数到顶层变量
    const { createSelectionMonitor, isRestrictedLocation } = selectionModule;
    const { createFloatingButtonController } = floatingButtonModule;
    const { createFloatingPanelController } = floatingPanelModule;
    ({ parseTextWithFallback, parseTextWithDynamicFieldsFallback } =
      aiServiceModule);
    ({ isLegacyMode, validateFields } = fieldHandlerModule);
    ({ getPromptConfigForModel } = promptEngineModule);
    ({ addNote } = ankiConnectModule);

    // 检查当前页面是否是扩展程序不应运行的受限页面（如Chrome商店）
    if (isRestrictedLocation(window.location, document)) {
      logInfo("当前是受限页面，内容脚本将不会激活。", {
        url: window.location.href,
      });
      return; // 终止执行
    }

    // 创建主控制器，管理所有UI和逻辑
    const controller = createController(
      createSelectionMonitor,
      createFloatingButtonController,
      createFloatingPanelController,
      loadFloatingAssistantConfig
    );
    // 加载并应用初始配置
    await controller.refreshConfig();

    // 监听存储中的配置变化
    if (chrome?.storage?.onChanged?.addListener) {
      chrome.storage.onChanged.addListener((changes, areaName) => {
        // 只关心 local 存储区域的变化
        if (areaName !== "local") {
          return;
        }
        const change = changes[CONFIG_STORAGE_KEY];
        if (!change) {
          return;
        }
        // 如果有新值，则应用更新；否则，重新加载整个配置
        if (Object.prototype.hasOwnProperty.call(change, "newValue")) {
          controller.applyConfigUpdate(change.newValue);
          return;
        }
        controller.refreshConfig();
      });
    }
  } catch (error) {
    console.error(`${LOG_PREFIX} 内容脚本初始化失败。`, error);
  }
})();

/**
 * 创建主控制器对象，管理浮动助手的所有状态和交互
 * @param {Function} createSelectionMonitor - 创建文本选择监视器的工厂函数
 * @param {Function} createFloatingButtonController - 创建浮动按钮控制器的工厂函数
 * @param {Function} createFloatingPanelController - 创建浮动面板控制器的工厂函数
 * @param {Function} loadConfig - 加载配置的函数
 * @returns {object} 控制器实例
 */
function createController(
  createSelectionMonitor,
  createFloatingButtonController,
  createFloatingPanelController,
  loadConfig
) {
  let monitor = null; // 文本选择监视器实例
  let floatingButton = null; // 浮动按钮控制器实例
  let floatingPanel = null; // 浮动面板控制器实例
  let monitoring = false; // 是否正在监视文本选择
  let currentEnabled = false; // 当前浮动助手是否启用
  let currentConfig = null; // 当前缓存的配置
  let currentSelection = null; // 当前处理的文本选择对象

  /**
   * 异步刷新配置
   */
  async function refreshConfig() {
    try {
      const config = await loadConfig();
      applyConfig(config);
    } catch (error) {
      console.error(`${LOG_PREFIX} 加载配置失败。`, error);
    }
  }

  /**
   * 应用新的配置
   * @param {object} config - 新的配置对象
   */
  function applyConfig(config) {
    const normalized = normalizeConfig(config);
    currentConfig = normalized;
    if (floatingPanel) {
      // 如果面板已存在，根据新配置重新渲染字段
      floatingPanel.renderFieldsFromConfig(currentConfig);
    }

    const enabled = Boolean(normalized.ui?.enableFloatingAssistant);
    if (enabled === currentEnabled) {
      return; // 启用状态未改变，无需操作
    }
    currentEnabled = enabled;

    if (!enabled) {
      stopMonitoring();
      logInfo("浮动助手已被禁用。");
      return;
    }

    startMonitoring();
    logInfo("浮动助手已启用。");
  }

  /**
   * 启动文本选择监视和UI初始化
   */
  function startMonitoring() {
    if (!monitor) {
      monitor = createSelectionMonitor(handleSelectionEvent);
    }
    if (!floatingButton) {
      try {
        floatingButton = createFloatingButtonController();
        floatingButton.setTriggerHandler(async (selection) => {
          logInfo("浮动按钮被触发。");
          if (!floatingPanel) {
            return;
          }

          // 保存当前选择
          currentSelection = selection;

          // 显示加载状态
          floatingPanel.showLoading(selection);

          // 根据配置渲染字段布局
          const layout = floatingPanel.renderFieldsFromConfig(currentConfig);
          if (!layout.hasFields) {
            // 如果没有有效字段，显示错误并禁止重试
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
        console.error(`${LOG_PREFIX} 浮动按钮初始化失败。`, creationError);
      }
    }
    if (!floatingPanel) {
      try {
        floatingPanel = createFloatingPanelController();
        // 设置重试处理器
        floatingPanel.setRetryHandler(async (selection) => {
          logInfo("从面板请求重试。");
          if (!selection || !selection.text) {
            logWarn("重试时未找到选择的文本。");
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
            logWarn("重试AI解析仍然失败。", error);
            floatingPanel.showError({
              message: error?.message ?? "AI解析失败，请再试一次。",
              allowRetry: true,
            });
          }
        });
        // 设置关闭处理器
        floatingPanel.setCloseHandler((reason) => {
          logInfo("解析面板已关闭。", { reason });
        });
        // 设置写入Anki处理器
        floatingPanel.setWriteHandler(async () => {
          await handleAnkiWrite();
        });
        // 如果配置已存在，立即渲染字段
        if (currentConfig) {
          floatingPanel.renderFieldsFromConfig(currentConfig);
        }
      } catch (panelError) {
        console.error(`${LOG_PREFIX} 解析面板初始化失败。`, panelError);
        floatingPanel = null;
      }
    }
    if (monitoring) {
      return;
    }
    monitor.start();
    monitoring = true;
    logInfo("文本选择监视已开始。");
    logInfo("输入框和可编辑区域的选择将被忽略。");
  }

  /**
   * 停止文本选择监视并销毁UI组件
   */
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

  /**
   * 处理来自选择监视器的事件
   * @param {object | null} result - 选择结果
   */
  function handleSelectionEvent(result) {
    if (!result) {
      // 如果没有选择，隐藏面板
      if (floatingPanel) {
        floatingPanel.hide(true);
      }
      return;
    }

    // 忽略在浮动助下面板内部的选择
    if (result.kind === "ignored-floating-panel") {
      return;
    }

    if (result.kind === "valid") {
      // 有效选择
      if (floatingPanel) {
        // 更新面板中的选择信息
        floatingPanel.patchSelection(result);
      }
      if (floatingButton) {
        // 在选择位置显示浮动按钮
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
      logInfo(`选中文本: "${result.text}"`, payload);
      return;
    }

    // 对于无效选择，隐藏按钮
    if (floatingButton) {
      floatingButton.hide(true);
    }
    if (floatingPanel) {
      // 检查面板是否处于活动状态，如果不是，则隐藏
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
      logWarn("不支持在输入框或可编辑区域中选择。", {
        anchorTagName: result.anchorTagName,
        focusTagName: result.focusTagName,
      });
    }
  }

  /**
   * 处理AI解析逻辑
   * @param {string} selectedText - 选中的文本
   * @param {object} layout - 字段布局信息
   */
  async function handleAIParsing(selectedText, layout) {
    if (!selectedText || !selectedText.trim()) {
      throw new Error("选中的文本为空。");
    }

    if (!currentConfig) {
      throw new Error("配置尚未加载。");
    }

    const modelFields = currentConfig?.ankiConfig?.modelFields;
    const isLegacy = isLegacyMode(currentConfig);

    let result;

    if (isLegacy) {
      // 旧版模式：只处理 Front/Back 两个字段
      logInfo("在旧版模式下执行AI解析。");
      result = await parseTextWithFallback(selectedText);
    } else {
      // 动态模式：基于用户设置的多个字段
      const { modelName, selectedFields, allFields } = getActivePromptSetup();
      const dynamicFields =
        selectedFields && selectedFields.length > 0
          ? selectedFields
          : Array.isArray(modelFields) && modelFields.length > 0
          ? modelFields
          : allFields;

      if (!dynamicFields || dynamicFields.length === 0) {
        throw new Error("当前模板没有可供解析的字段。请在选项页面完成设置。");
      }

      logInfo("在动态模式下执行AI解析。", { fields: dynamicFields });

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

    // 将AI解析结果应用到面板的字段中
    if (floatingPanel) {
      floatingPanel.applyFieldValues(result);
      floatingPanel.showReady(); // 显示准备就绪状态
    }

    logInfo("AI解析完成。", result);
  }

  /**
   * 获取当前活动的Prompt设置
   * @returns {object} 包含模型名称、所有字段、选定字段和Prompt配置的对象
   */
  function getActivePromptSetup() {
    const allFields = Array.isArray(currentConfig?.ankiConfig?.modelFields)
      ? [...currentConfig.ankiConfig.modelFields]
      : [];

    let modelName = currentConfig?.ankiConfig?.defaultModel || "";

    const promptTemplates =
      currentConfig?.promptTemplates?.promptTemplatesByModel || {};
    if (!modelName && Object.keys(promptTemplates).length > 0) {
      modelName = Object.keys(promptTemplates)[0];
    }

    const promptConfig = getPromptConfigForModel(modelName, currentConfig);
    let selectedFields = Array.isArray(promptConfig.selectedFields)
      ? promptConfig.selectedFields.filter(
          (field) => typeof field === "string" && field.trim()
        )
      : [];

    // 确保选定字段是模型所有字段的子集
    if (selectedFields.length > 0 && allFields.length > 0) {
      selectedFields = selectedFields.filter((field) =>
        allFields.includes(field)
      );
    }

    // 如果没有选定字段，则默认使用所有字段
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

  /**
   * 处理将笔记写入Anki的逻辑
   */
  async function handleAnkiWrite() {
    if (!floatingPanel) {
      return;
    }

    try {
      // 从面板收集字段数据
      const collected = floatingPanel.collectFields();
      logInfo("字段收集完成", collected);

      const isLegacy = collected.mode === "legacy";

      // 验证字段数据
      const validation = validateFields(collected.fields, isLegacy);

      if (!validation.isValid) {
        const errorMessage = validation.message || "字段验证失败。";
        floatingPanel.showError({
          message: errorMessage,
          allowRetry: false,
        });
        return;
      }

      // 显示写入状态
      floatingPanel.showLoading(currentSelection, {
        message: "正在写入Anki...",
      });

      // 准备写入Anki的数据
      const deckName = currentConfig?.ankiConfig?.defaultDeck || "Default";
      const modelName = currentConfig?.ankiConfig?.defaultModel || "Basic";
      const tags = currentConfig?.ankiConfig?.defaultTags || [];

      const noteData = {
        deckName,
        modelName,
        fields: collected.fields,
        tags,
      };

      logInfo("正在写入Anki。", noteData);

      // 调用 AnkiConnect 添加笔记
      const result = await addNote(noteData);

      if (result.error) {
        throw new Error(result.error);
      }

      // 成功
      floatingPanel.showReady({
        message: "成功写入Anki！",
      });

      logInfo("Anki写入成功", { noteId: result.result });
    } catch (error) {
      logWarn("Anki写入失败", error);

      let errorMessage = error?.message || "写入Anki失败。";

      // 对特定错误进行更友好的提示
      if (
        errorMessage.includes("fetch") ||
        errorMessage.includes("Failed to fetch")
      ) {
        errorMessage = "请确认Anki已启动，并且AnkiConnect插件已安装。";
      }

      floatingPanel.showError({
        message: errorMessage,
        allowRetry: false,
      });
    }
  }

  // 返回控制器公共API
  return {
    refreshConfig,
    applyConfigUpdate: applyConfig,
  };
}

/**
 * 从chrome.storage.local加载浮动助手的配置
 * @returns {Promise<object>} 规范化后的配置对象
 */
async function loadFloatingAssistantConfig() {
  const stored = await readStoredConfig();
  return normalizeConfig(stored);
}

/**
 * 读取存储的原始配置
 * @returns {Promise<object|null>} 存储的配置或null
 */
async function readStoredConfig() {
  if (!chrome?.storage?.local?.get) {
    return null;
  }

  try {
    const getter = chrome.storage.local.get.bind(chrome.storage.local);
    let result;
    try {
      // 尝试使用Promise-based API
      result = getter(CONFIG_STORAGE_KEY);
    } catch (callError) {
      result = null;
    }

    // 如果返回的是Promise，则等待其解析
    if (result && typeof result.then === "function") {
      const resolved = await result;
      return resolved?.[CONFIG_STORAGE_KEY] ?? null;
    }

    // 否则，使用传统的回调API
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
    console.error(`${LOG_PREFIX} 读取存储时发生错误。`, error);
    return null;
  }
}

/**
 * 清理字符串数组，移除无效条目
 * @param {any} value - 待处理的值
 * @returns {string[]} 清理后的字符串数组
 */
function sanitizeStringArray(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter((entry) => entry.length > 0);
}

/**
 * 规范化配置对象，确保所有字段都存在并具有正确的类型
 * @param {object} rawConfig - 从存储中读取的原始配置
 * @returns {object} 规范化后的配置对象
 */
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

  // 规范化UI配置
  const ui =
    rawConfig.ui && typeof rawConfig.ui === "object"
      ? { ...defaults.ui, ...rawConfig.ui }
      : { ...defaults.ui };
  ui.enableFloatingAssistant = Boolean(ui.enableFloatingAssistant);
  normalized.ui = ui;

  // 规范化Anki配置
  const ankiConfig =
    rawConfig.ankiConfig && typeof rawConfig.ankiConfig === "object"
      ? { ...defaults.ankiConfig, ...rawConfig.ankiConfig }
      : { ...defaults.ankiConfig };
  ankiConfig.modelFields = sanitizeStringArray(ankiConfig.modelFields);
  ankiConfig.defaultTags = sanitizeStringArray(ankiConfig.defaultTags);
  normalized.ankiConfig = ankiConfig;

  // 规范化Prompt模板配置
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

  // 规范化样式配置
  const styleConfig =
    rawConfig.styleConfig && typeof rawConfig.styleConfig === "object"
      ? { ...rawConfig.styleConfig }
      : { ...defaults.styleConfig };
  normalized.styleConfig = styleConfig;

  // 规范化语言配置
  if (typeof rawConfig.language === "string" && rawConfig.language.trim()) {
    normalized.language = rawConfig.language.trim();
  } else if (
    typeof normalized.language !== "string" ||
    !normalized.language.trim()
  ) {
    normalized.language = defaults.language;
  }

  return normalized;
}
