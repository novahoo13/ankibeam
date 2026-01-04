// content-main.js - Floating Assistant Entry Point
// This file initializes the floating assistant feature for the Chrome extension.

// Log prefix for console filtering and identification
const LOG_PREFIX = "[floating-assistant]";

// Module functions loaded dynamically
let parseTextWithFallback = null;
let parseTextWithDynamicFieldsFallback = null;

let addNote = null;
let translate = null;
let getActiveTemplate = null;
let loadFloatingAssistantConfig = null;
let writeToAnki = null;
let errorBoundary = null;

/**
 * 获取国际化文本的辅助函数。
 * @param {string} key - i18n消息的键。
 * @param {string} fallback - 如果找不到键，则使用的备用文本。
 * @param {Object} substitutions - 用于替换文本中占位符的变量。
 * @returns {string} - 翻译后的文本。
 */
const getText = (key, fallback, substitutions) =>
	translate(key, { fallback, substitutions });

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
 * Bootstrap function (IIFE - Immediately Invoked Function Expression)
 * Responsible for asynchronously loading all modules and initializing the content script
 */
(async function bootstrap() {
	try {
		// 并行加载所有必需的JS模块，以提高启动速度
		const [
			selectionModule, // Text selection handling
			floatingButtonModule, // Floating button UI
			floatingPanelModule, // Floating panel UI
			aiServiceModule, // AI parsing service
			promptEngineModule, // Prompt template engine
			ankiConnectModule, // AnkiConnect proxy
			i18nModule, // Multi-language support
			templateStoreModule, // Template storage
			storageModule, // Storage module (ConfigService)
			ankiServiceModule, // Anki service
			errorBoundaryModule, // Error boundary
		] = await Promise.all([
			import(chrome.runtime.getURL("content/selection.js")),
			import(chrome.runtime.getURL("content/floating-button.js")),
			import(chrome.runtime.getURL("content/floating-panel.js")),
			import(chrome.runtime.getURL("utils/ai-service.js")),
			import(chrome.runtime.getURL("utils/prompt-engine.js")),
			import(chrome.runtime.getURL("utils/ankiconnect-proxy.js")),
			import(chrome.runtime.getURL("utils/i18n.js")),
			import(chrome.runtime.getURL("utils/template-store.js")),
			import(chrome.runtime.getURL("services/config-service.js")),
			import(chrome.runtime.getURL("services/anki-service.js")),
			import(chrome.runtime.getURL("utils/error-boundary.js")),
		]);

		// Extract and assign functions from loaded modules to top-level variables
		const { createSelectionMonitor, isRestrictedLocation } = selectionModule;
		const { createFloatingButtonController } = floatingButtonModule;
		const { createFloatingPanelController } = floatingPanelModule;
		({ parseTextWithFallback, parseTextWithDynamicFieldsFallback } =
			aiServiceModule);

		({ addNote } = ankiConnectModule);
		({ translate } = i18nModule);
		({ getActiveTemplate } = templateStoreModule);

		// Initialize ConfigService
		const { configService } = storageModule; // actually configServiceModule
		await configService.init();

		// Update helper to use configService.get()
		loadFloatingAssistantConfig = async function () {
			return await configService.get();
		};

		// Assign to global variables
		({ writeToAnki } = ankiServiceModule);
		const { ErrorBoundary } = errorBoundaryModule;
		errorBoundary = new ErrorBoundary();

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
			loadFloatingAssistantConfig,
		);
		// 加载并应用初始配置
		await controller.refreshConfig();

		// Subscribe to config changes via ConfigService
		configService.subscribe((newConfig) => {
			logInfo("配置变更通知已接收，重新加载控制器配置");
			controller.refreshConfig();
		});

		// Configure Error Boundary for Content Script UI
		errorBoundary.setCallbacks({
			onUpdateStatus: (msg, type) => {
				logInfo(`[Status:${type}] ${msg}`);
			},
			onShowRetry: (context, callback) => {
				logInfo("Retry available for: " + context);
			},
		});
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
	loadConfig,
) {
	let monitor = null; // 文本选择监视器实例
	let floatingButton = null; // 浮动按钮控制器实例
	let floatingPanel = null; // 浮动面板控制器实例
	let monitoring = false; // 是否正在监视文本选择
	let currentEnabled = false; // 当前浮动助手是否启用
	let currentConfig = null; // 当前缓存的配置
	let pendingConfig = null; // 暂存的配置（当面板忙碌时）
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

		// 如果是禁用操作，立即执行
		const newEnabled = Boolean(normalized.ui?.enableFloatingAssistant);
		if (!newEnabled && currentEnabled) {
			currentConfig = normalized;
			currentEnabled = false;
			pendingConfig = null;
			stopMonitoring();
			logInfo("浮动助手已被禁用。");
			return;
		}

		// 检查是否需要延迟更新
		let shouldDefer = false;
		if (floatingPanel) {
			// 获取面板当前状态
			const panelState =
				typeof floatingPanel.getDebugState === "function"
					? floatingPanel.getDebugState()
					: null;

			// 如果面板可见且不处于空闲状态（例如正在加载或显示结果），则延迟更新
			// 避免"Zombie Field"问题：UI显示旧字段，逻辑使用新配置
			const isBusy = panelState?.visible && panelState.currentState !== "idle";
			if (isBusy) {
				shouldDefer = true;
			}
		}

		if (shouldDefer) {
			logInfo("配置更新：面板正在使用中，已暂存配置待面板关闭后应用");
			pendingConfig = normalized;
			return;
		}

		// 立即应用配置
		pendingConfig = null;
		currentConfig = normalized;

		if (floatingPanel) {
			// 如果面板已存在，根据新配置重新渲染字段
			floatingPanel.renderFieldsFromConfig(currentConfig);
			logInfo("配置更新：重新渲染字段布局");
		}

		if (newEnabled === currentEnabled) {
			return; // 启用状态未改变，无需操作
		}
		currentEnabled = newEnabled;

		if (!newEnabled) {
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
							message:
								error?.message ??
								getText("popup_error_generic", "操作失败，请重试", [
									"未知错误",
								]),
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
							message:
								error?.message ??
								getText("popup_error_generic", "操作失败，请重试", [
									"未知错误",
								]),
							allowRetry: true,
						});
					}
				});
				// 设置关闭处理器
				floatingPanel.setCloseHandler((reason) => {
					logInfo("解析面板已关闭。", { reason });
					// 面板关闭后，检查是否有暂存的配置需要应用
					if (pendingConfig) {
						logInfo("检测到暂存的配置，正在应用...");
						applyConfig(pendingConfig);
					}
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
		// 如果面板已固定，不处理新的选择事件
		if (floatingPanel && floatingPanel.isPinned && floatingPanel.isPinned()) {
			return;
		}

		if (!result) {
			// 如果没有选择，隐藏面板
			if (floatingPanel) {
				floatingPanel.hide(true);
			}
			return;
		}

		// 忽略在浮动助手面板内部的选择
		if (result.kind === "ignored-floating-panel") {
			logInfo("忽略面板内部的文本选择。", {
				anchorTagName: result.anchorTagName,
				focusTagName: result.focusTagName,
			});
			return;
		}

		if (result.kind === "valid") {
			// 额外防护: 如果 anchorTagName 或 focusTagName 是 HTML/BODY
			// 且面板已打开，则可能是面板内部选择被误判为有效
			// 此时不应触发 patchSelection，以避免位移
			const isHtmlBodyTag =
				result.anchorTagName === "HTML" ||
				result.anchorTagName === "BODY" ||
				result.focusTagName === "HTML" ||
				result.focusTagName === "BODY";

			const panelState =
				floatingPanel && typeof floatingPanel.getDebugState === "function"
					? floatingPanel.getDebugState()
					: null;
			const isPanelOpen = panelState?.visible;

			if (isHtmlBodyTag && isPanelOpen) {
				// 面板已打开且选择节点是 HTML/BODY，非常可能是面板内选择
				// 不触发任何操作，直接返回
				logInfo("检测到可疑的 HTML/BODY 选择，面板已打开，忽略此选择。", {
					anchorTagName: result.anchorTagName,
					focusTagName: result.focusTagName,
				});
				return;
			}

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
			throw new Error(
				getText("popup_error_field_empty", "请输入至少一个字段内容"),
			);
		}

		if (!currentConfig) {
			throw new Error(getText("popup_error_config_load", "配置加载失败"));
		}

		const modelFields = currentConfig?.ankiConfig?.modelFields;
		// 动态模式：基于当前活动模板
		const activeTemplate = getActiveTemplate(currentConfig);

		if (!activeTemplate) {
			throw new Error(
				getText(
					"popup_status_no_template",
					"未选择解析模板，请在选项页面创建或选择模板",
				),
			);
		}

		// 如果有活动模板，优先使用模板配置
		const dynamicFields = activeTemplate.fields.map((f) => f.name);
		const customPrompt = activeTemplate.prompt;

		logInfo(`使用模板 "${activeTemplate.name}" 执行AI解析。`, {
			fields: dynamicFields,
		});

		if (!dynamicFields || dynamicFields.length === 0) {
			throw new Error(
				getText(
					"popup_status_no_fields_parse",
					"当前模板没有可供解析的字段，请在选项页面完成设置",
				),
			);
		}

		const result = await parseTextWithDynamicFieldsFallback(
			selectedText,
			dynamicFields,
			customPrompt,
		);

		// Apply AI parsing results to the panel fields
		if (floatingPanel) {
			floatingPanel.applyFieldValues(result);
			floatingPanel.showReady(); // Show ready state
		}

		logInfo("AI parsing completed.", result);
	}

	/**
	 * 处理将笔记写入Anki的逻辑
	 * 与popup.js的handleWriteToAnki保持完全一致的处理流程
	 */
	/**
	 * 处理将笔记写入Anki的逻辑
	 * 使用 Service 层统一逻辑
	 */
	async function handleAnkiWrite() {
		if (!floatingPanel) {
			return;
		}

		try {
			// 从面板收集字段原始内容
			const rawCollected = floatingPanel.collectFields();
			logInfo("字段收集完成", {
				fields: Object.keys(rawCollected.fields),
			});

			floatingPanel.showLoading(currentSelection, {
				message: getText("popup_status_writing", "正在写入 Anki..."),
			});

			// 调用 Service
			const result = await writeToAnki({
				rawFields: rawCollected.fields,
				config: currentConfig,
				onWarning: async (warningMessage) => {
					logWarn("写入警告", warningMessage);
					floatingPanel.showLoading(currentSelection, {
						message: getText(
							"popup_status_validation_continue",
							"验证通过但有警告，继续写入...",
							{ MESSAGE: warningMessage },
						),
					});
					await new Promise((resolve) => setTimeout(resolve, 1000));
				},
			});

			// 成功
			floatingPanel.showReady({
				message: getText("popup_status_write_success", "写入成功"),
			});

			floatingPanel.markWriteSuccess();

			logInfo("Anki写入成功", result);
		} catch (error) {
			logWarn("Anki写入失败", error);

			// 使用 ErrorBoundary 处理消息
			const userMessage = errorBoundary.getUserFriendlyMessage(error, "anki");

			floatingPanel.showError({
				message: userMessage,
				allowRetry: errorBoundary.isRetryableError(error, "anki"),
			});
		}
	}

	// Return the controller's public API
	return {
		refreshConfig,
		applyConfigUpdate: applyConfig,
	};
}

/**
 * Sanitize a string array, removing invalid entries
 * @param {any} value - The value to process
 * @returns {string[]} Cleaned string array
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
 * Normalize config object, ensuring all fields exist with correct types
 * @param {object} rawConfig - Raw config from storage
 * @returns {object} Normalized config object
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

	// Normalize UI config
	const ui =
		rawConfig.ui && typeof rawConfig.ui === "object"
			? { ...defaults.ui, ...rawConfig.ui }
			: { ...defaults.ui };
	ui.enableFloatingAssistant = Boolean(ui.enableFloatingAssistant);
	normalized.ui = ui;

	// Normalize Anki config
	const ankiConfig =
		rawConfig.ankiConfig && typeof rawConfig.ankiConfig === "object"
			? { ...defaults.ankiConfig, ...rawConfig.ankiConfig }
			: { ...defaults.ankiConfig };
	ankiConfig.modelFields = sanitizeStringArray(ankiConfig.modelFields);
	ankiConfig.defaultTags = sanitizeStringArray(ankiConfig.defaultTags);
	normalized.ankiConfig = ankiConfig;

	// Normalize Prompt templates config
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

	// Normalize style config
	const styleConfig =
		rawConfig.styleConfig && typeof rawConfig.styleConfig === "object"
			? { ...rawConfig.styleConfig }
			: { ...defaults.styleConfig };
	normalized.styleConfig = styleConfig;

	// Normalize language config
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
