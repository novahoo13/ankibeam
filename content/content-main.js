// content-main.js - 浮动助手入口文件

// 日志前缀，方便在控制台过滤和识别日志
const LOG_PREFIX = "[floating-assistant]";
// 存储在 chrome.storage.local 中的配置键名
const CONFIG_STORAGE_KEY = "ankiWordAssistantConfig";

// 从模块动态导入的函数，预先声明
let parseTextWithFallback = null;
let parseTextWithDynamicFieldsFallback = null;

let validateFields = null;

let addNote = null;
let translate = null;
let getActiveTemplate = null;
let loadFloatingAssistantConfig = null;

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
			i18nModule, // 多语言支持
			templateStoreModule, // 模板存储
		] = await Promise.all([
			import(chrome.runtime.getURL("content/selection.js")),
			import(chrome.runtime.getURL("content/floating-button.js")),
			import(chrome.runtime.getURL("content/floating-panel.js")),
			import(chrome.runtime.getURL("utils/ai-service.js")),
			import(chrome.runtime.getURL("utils/field-handler.js")),
			import(chrome.runtime.getURL("utils/prompt-engine.js")),
			import(chrome.runtime.getURL("utils/ankiconnect-proxy.js")),
			import(chrome.runtime.getURL("utils/i18n.js")),
			import(chrome.runtime.getURL("utils/template-store.js")),
			import(chrome.runtime.getURL("utils/storage.js")),
		]);

		// 从加载的模块中解构并赋值函数到顶层变量
		const { createSelectionMonitor, isRestrictedLocation } = selectionModule;
		const { createFloatingButtonController } = floatingButtonModule;
		const { createFloatingPanelController } = floatingPanelModule;
		({ parseTextWithFallback, parseTextWithDynamicFieldsFallback } =
			aiServiceModule);
		({ validateFields } = fieldHandlerModule);

		({ addNote } = ankiConnectModule);
		({ translate } = i18nModule);
		({ getActiveTemplate } = templateStoreModule);
		// Import loadConfig from storage module
		let loadConfig;
		({ loadConfig } = await import(chrome.runtime.getURL("utils/storage.js")));

		// Update helper to use loadConfig (with decryption)
		loadFloatingAssistantConfig = async function () {
			return await loadConfig();
		};
		// 确保从 templateStoreModule 正确解构，如果上述数组解构不匹配，这里需要调整
		// 由于 Promise.all 返回数组顺序对应，这里我们需要手动获取最后一个模块
		// 但上面的解构是 const [..., templateStoreModule] = ...
		// 所以我们需要更新 Promise.all 的解构部分

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
				// 即使有新值，我们也应该重新加载配置
				// 因为 storage 中的数据可能包含加密的 API 密钥
				// 而 change.newValue 是原始的加密数据，直接使用会导致密钥状态不一致
				// refreshConfig 会调用 loadConfig，后者负责解密密钥
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

		result = await parseTextWithDynamicFieldsFallback(
			selectedText,
			dynamicFields,
			customPrompt,
		);

		// 将AI解析结果应用到面板的字段中
		if (floatingPanel) {
			floatingPanel.applyFieldValues(result);
			floatingPanel.showReady(); // 显示准备就绪状态
		}

		logInfo("AI解析完成。", result);
	}

	/**
	 * 内容样式包装器
	 * 将纯文本内容转换为带样式的HTML，用于在Anki中显示
	 * 与popup.js的wrapContentWithStyle保持一致
	 * @param {string} content - 原始文本内容
	 * @returns {string} 包装后的HTML字符串
	 */
	function wrapContentWithStyle(content) {
		// 从配置中获取样式
		const styleConfig = currentConfig?.styleConfig || {};
		const fontSize = styleConfig.fontSize || "14px";
		const textAlign = styleConfig.textAlign || "left";
		const lineHeight = styleConfig.lineHeight || "1.4";

		// 将换行符转换成 <br>
		const contentWithBreaks = content.replace(/\n/g, "<br>");

		// 包装后返回
		return `<div style="font-size: ${fontSize}; text-align: ${textAlign}; line-height: ${lineHeight};">${contentWithBreaks}</div>`;
	}

	/**
	 * 处理将笔记写入Anki的逻辑
	 * 与popup.js的handleWriteToAnki保持完全一致的处理流程
	 */
	async function handleAnkiWrite() {
		if (!floatingPanel) {
			return;
		}

		try {
			// 第一步：从面板收集字段原始内容用于验证（不带HTML样式）
			const rawCollected = floatingPanel.collectFields();
			logInfo("字段收集完成（原始内容）", {
				mode: rawCollected.mode,
				collectedFields: rawCollected.collectedFields,
				emptyFields: rawCollected.emptyFields,
			});

			// 准备字段配置
			const activeTemplate = getActiveTemplate(currentConfig);

			let targetFields;
			let templateAllFields = [];

			if (activeTemplate) {
				targetFields = activeTemplate.fields.map((f) => f.name);
				templateAllFields = targetFields; // 模板模式下，目标字段就是所有字段
			} else {
				// No active template in dynamic mode - this should be blocked before write
				floatingPanel.showError({
					message: getText(
						"popup_status_no_template",
						"未选择解析模板，无法写入",
					),
					allowRetry: false,
				});
				return;
			}

			if (!targetFields || targetFields.length === 0) {
				floatingPanel.showError({
					message: getText(
						"popup_status_no_fields_write",
						"当前模板未配置可写入的字段，请在选项页完成设置",
					),
					allowRetry: false,
				});
				return;
			}

			// 第二步：验证字段内容的完整性和有效性
			const validation = validateFields(
				rawCollected.fields,
				false, // Force non-legacy mode
				rawCollected,
			);

			// 验证失败时显示详细错误信息并终止写入
			if (!validation.isValid) {
				let errorMessage = validation.message;
				if (validation.warnings.length > 0) {
					const warningsText = validation.warnings.join(", ");
					errorMessage += `\n警告: ${warningsText}`;
				}
				floatingPanel.showError({
					message: errorMessage,
					allowRetry: false,
				});
				return;
			}

			// 处理验证警告：显示提示但不阻止写入操作
			if (validation.warnings.length > 0) {
				logWarn("字段验证警告:", validation.warnings);
				floatingPanel.showLoading(currentSelection, {
					message: getText(
						"popup_status_validation_continue",
						"验证通过但有警告，继续写入...",
						{
							MESSAGE: validation.message,
						},
					),
				});
				await new Promise((resolve) => setTimeout(resolve, 1000));
			}

			// 第三步：应用样式包装到字段内容
			const fields = {};

			// Dynamic模式：处理用户自定义的多字段结构
			Object.keys(rawCollected.fields).forEach((fieldName) => {
				const rawValue = rawCollected.fields[fieldName];

				// 基于原始值判断是否有内容，避免HTML标签干扰
				if (rawValue && rawValue.trim()) {
					fields[fieldName] = wrapContentWithStyle(rawValue);
				}
			});

			// 为Anki模型的所有字段提供空值，防止缺失字段错误
			// 在模板模式下，templateAllFields 就是模板定义的所有字段
			(templateAllFields || []).forEach((fieldName) => {
				if (!(fieldName in fields)) {
					fields[fieldName] = "";
				}
			});

			// 最终验证：确保有实际内容可以写入Anki
			const filledFieldCount = Object.values(fields).filter(
				(value) => typeof value === "string" && value.trim(),
			).length;
			const payloadFieldCount = Object.keys(fields).length;

			if (filledFieldCount === 0) {
				floatingPanel.showError({
					message: getText(
						"popup_status_no_fillable_fields",
						"没有可写入的字段内容",
					),
					allowRetry: false,
				});
				return;
			}

			// 显示写入状态
			floatingPanel.showLoading(currentSelection, {
				message: getText("popup_status_writing", "正在写入 Anki..."),
			});

			// 从配置中获取Anki卡片的基本属性
			// 优先从模板获取，否则回退到默认配置
			let deckName, modelName;

			if (activeTemplate) {
				deckName = activeTemplate.deckName;
				modelName = activeTemplate.modelName;
			} else {
				deckName = currentConfig?.ankiConfig?.defaultDeck || "Default";
				modelName = currentConfig?.ankiConfig?.defaultModel || "Basic";
			}

			const tags = currentConfig?.ankiConfig?.defaultTags || [];

			// 构建AnkiConnect API所需的完整笔记数据
			const noteData = {
				deckName: deckName,
				modelName: modelName,
				fields: fields,
				tags: tags,
			};

			// 记录写入操作的详细信息用于调试
			logInfo("准备写入Anki:", {
				mode: isLegacyMode ? "legacy" : "dynamic",
				totalFields: rawCollected.collectedFields || payloadFieldCount,
				collectedFields: rawCollected.collectedFields,
				finalFields: filledFieldCount,
				payloadFields: payloadFieldCount,
				validation: validation.isValid,
				warnings: validation.warnings.length,
				noteData,
			});

			// 调用 AnkiConnect API执行实际写入操作
			const result = await addNote(noteData);

			if (result.error) {
				throw new Error(result.error);
			}

			// 成功
			floatingPanel.showReady({
				message: getText("popup_status_write_success", "写入成功"),
			});

			// 标记写入成功，以便点击面板外部时自动关闭
			floatingPanel.markWriteSuccess();

			logInfo("Anki写入成功", {
				noteId: result.result,
				fieldsCount: filledFieldCount,
				mode: isLegacyMode ? "legacy" : "dynamic",
			});
		} catch (error) {
			logWarn("Anki写入失败", error);

			let errorMessage =
				error?.message ||
				getText("popup_error_anki_generic", "Anki操作失败", [
					error?.message || "",
				]);

			// 对特定错误进行更友好的提示
			if (
				errorMessage.includes("fetch") ||
				errorMessage.includes("Failed to fetch")
			) {
				errorMessage = getText(
					"popup_error_anki_launch",
					"请确认Anki已启动，并且AnkiConnect插件已安装",
				);
			} else if (
				errorMessage.includes("duplicate") ||
				errorMessage.includes("重复")
			) {
				errorMessage = getText(
					"popup_error_anki_duplicate",
					"卡片内容重复，请修改后重试",
				);
			} else if (
				errorMessage.includes("deck") &&
				errorMessage.includes("not found")
			) {
				errorMessage = getText(
					"popup_error_anki_deck_missing",
					"指定的牌组不存在，请检查配置",
				);
			} else if (
				errorMessage.includes("model") &&
				errorMessage.includes("not found")
			) {
				errorMessage = getText(
					"popup_error_anki_model_missing",
					"指定的模板不存在，请检查配置",
				);
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
 * 旧版加载逻辑，已被 bootstrap 中的动态加载替代
 * @deprecated
 */
// async function loadFloatingAssistantConfig() {
// 	const stored = await readStoredConfig();
// 	return normalizeConfig(stored);
// }

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
