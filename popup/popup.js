// popup.js - Chrome扩展弹出窗口主文件
// 功能: 处理用户输入文本的AI解析和Anki卡片创建的完整UI流程

import { parseTextWithDynamicFieldsFallback } from "../utils/ai-service.js";
import { addNote, getModelFieldNames } from "../utils/ankiconnect.js";
import { loadConfig, saveConfig } from "../utils/storage.js";
import {
	collectFieldsForWrite,
	validateFields,
} from "../utils/field-handler.js";
import { writeToAnki } from "../services/anki-service.js";
import { ErrorBoundary } from "../utils/error-boundary.js";

import {
	translate,
	createI18nError,
	localizePage,
	whenI18nReady,
} from "../utils/i18n.js";
import {
	getActiveTemplate as getActiveTemplateFromConfig,
	setActiveTemplate,
	listTemplates,
} from "../utils/template-store.js";

const getText = (key, fallback, substitutions) =>
	translate(key, { fallback, substitutions });

const createDetailedError = (key, fallback, detail, substitutions) => {
	const err = createI18nError(key, { fallback, substitutions });
	if (detail) {
		const base = (err.message || "").trimEnd();
		const hasSuffix = /[：:]\s*$/.test(base);
		const separator = hasSuffix ? " " : ": ";
		err.message = detail ? `${base}${separator}${detail}`.trim() : base;
		err.detail = detail;
	}
	return err;
};

// 全局配置对象（初始化后保存用户配置）
let config = {};

// 状态消息定时器（用于自动清除状态提示）
let statusTimer = null;

// 当前活动模板（缓存模板对象以避免重复查找）
let currentTemplate = null;

// 模板选择来源标识（防止自己触发的 storage 变更导致重复渲染）
let isTemplateChangedByPopup = false;

// 标记是否需要重新解析（模板切换后）
let needsReparse = false;

/**
 * 获取当前激活的提示设置和字段配置
 * 根据用户配置确定要使用的AI模型、字段列表和提示模板
 * @returns {object} 包含模型名、全部字段、选中字段和提示配置的对象
 */

/**
 * アクティブなテンプレートを取得
 * Get active template
 * @description 获取当前活动的解析模板，若无则返回 null
 * @returns {Object|null} 模板对象或 null
 */
function getActiveTemplate() {
	if (!config) {
		return null;
	}

	const template = getActiveTemplateFromConfig(config);
	currentTemplate = template;
	return template;
}

/**
 * テンプレートのフィールド名一覧を取得
 * @param {Object|null} template - テンプレート
 * @returns {string[]} order順に整列したフィールド名
 */
function getTemplateFieldNames(template) {
	if (!template || !Array.isArray(template.fields)) {
		return [];
	}

	return template.fields
		.slice()
		.sort((a, b) => {
			const orderA = typeof a.order === "number" ? a.order : 0;
			const orderB = typeof b.order === "number" ? b.order : 0;
			return orderA - orderB;
		})
		.map((field) => (typeof field.name === "string" ? field.name.trim() : ""))
		.filter((name) => !!name);
}

/**
 * 入力済みフィールドが存在するか判定
 * @returns {boolean} いずれかのフィールドに値がある場合はtrue
 */
function hasFilledFieldValues() {
	const container = document.getElementById("fields-container");
	if (!container) {
		return false;
	}

	const inputs = container.querySelectorAll("input, textarea");
	return Array.from(inputs).some(
		(element) =>
			typeof element.value === "string" && element.value.trim().length > 0,
	);
}

/**
 * テンプレートセレクターのレンダリング
 * Render template selector
 * @description 渲染模板选择器下拉列表
 * @returns {void}
 */
function renderTemplateSelector() {
	const templateSelect = document.getElementById("template-select");
	const emptyState = document.getElementById("template-empty-state");

	if (!templateSelect || !emptyState) {
		console.warn("[popup] Template selector elements not found");
		return;
	}

	// 获取所有模板并按更新时间排序
	const templates = listTemplates(config);

	// 清空现有选项
	templateSelect.innerHTML = "";

	if (templates.length === 0) {
		// 显示空态
		templateSelect.innerHTML = `<option value="" data-i18n="popup_template_none">${getText(
			"popup_template_none",
			"无可用模板",
		)}</option>`;
		templateSelect.disabled = true;
		emptyState.classList.remove("hidden");
		currentTemplate = null;
		return;
	}

	// 隐藏空态
	emptyState.classList.add("hidden");
	templateSelect.disabled = false;

	// 获取当前活动模板
	const activeTemplate = getActiveTemplate();
	const activeTemplateId = activeTemplate?.id || null;

	// 渲染模板选项
	templates.forEach((template) => {
		const option = document.createElement("option");
		option.value = template.id;
		option.textContent = template.name;
		option.selected = template.id === activeTemplateId;
		templateSelect.appendChild(option);
	});
}

/**
 * テンプレート変更処理
 * Handle template change
 * @description 处理用户切换模板的操作
 * @param {string} templateId - 新选中的模板ID
 * @returns {Promise<void>}
 */
async function handleTemplateChange(templateId) {
	if (!templateId) {
		return;
	}

	const previousConfig = config;
	const hadFilledFields = hasFilledFieldValues();

	try {
		// 标记模板变更由 popup 触发
		isTemplateChangedByPopup = true;

		// 保存活动模板到 storage
		const updatedConfig = {
			...(config || {}),
			ui: {
				...(config?.ui || {}),
			},
		};
		setActiveTemplate(updatedConfig, templateId, "popup");
		await saveConfig(updatedConfig);

		// 更新本地配置缓存
		config = updatedConfig;

		// 获取新模板
		const template = getActiveTemplate();

		if (!template) {
			console.warn(`[popup] Template ${templateId} not found`);
			return;
		}

		await initializeDynamicFields();
		updateUIBasedOnTemplate();

		if (hadFilledFields) {
			// 显示重新解析提示
			showReparseNotice();
			needsReparse = true;

			// 禁用写入按钮
			const writeBtn = document.getElementById("write-btn");
			if (writeBtn) {
				writeBtn.disabled = true;
			}
		} else {
			hideReparseNotice();
		}

		console.log(`[popup] Template changed to: ${template.name}`);
	} catch (error) {
		config = previousConfig;
		console.error("[popup] Failed to change template:", error);
		errorBoundary.handleError(error, "template");
	} finally {
		// 重置标记
		setTimeout(() => {
			isTemplateChangedByPopup = false;
		}, 500);
	}
}

/**
 * 再解析通知の表示
 * Show reparse notice
 * @description 显示"需要重新解析"的提示条
 * @returns {void}
 */
function showReparseNotice() {
	const notice = document.getElementById("template-change-notice");
	if (notice) {
		notice.classList.remove("hidden");
	}
}

/**
 * 再解析通知の非表示
 * Hide reparse notice
 * @description 隐藏"需要重新解析"的提示条
 * @returns {void}
 */
function hideReparseNotice() {
	const notice = document.getElementById("template-change-notice");
	if (notice) {
		notice.classList.add("hidden");
	}
	needsReparse = false;
}

/**
 * ストレージ変更処理
 * Handle storage change
 * @description 处理 storage 变更事件，同步模板选择
 * @param {Object} change - storage 变更对象
 * @returns {void}
 */
async function handleStorageChange(change) {
	// 防止自己触发的变更导致重复渲染
	if (isTemplateChangedByPopup) {
		return;
	}

	// 获取更新前的状态
	const previousTemplate = getActiveTemplate();
	const previousFieldNames = getTemplateFieldNames(previousTemplate);
	const hadFilledFields = hasFilledFieldValues();

	// 从存储重新完整加载配置（包括解密）
	const loadedConfig = await loadConfig();

	// 更新配置缓存并刷新下拉
	config = loadedConfig;
	renderTemplateSelector();

	const newTemplate = getActiveTemplate();
	const newFieldNames = getTemplateFieldNames(newTemplate);
	const currentTemplateSelect = document.getElementById("template-select");

	if (currentTemplateSelect && newTemplate) {
		currentTemplateSelect.value = newTemplate.id;
	}

	const templateChanged =
		(previousTemplate?.id || null) !== (newTemplate?.id || null);
	const fieldsChanged =
		previousFieldNames.length !== newFieldNames.length ||
		previousFieldNames.some((field, index) => field !== newFieldNames[index]);

	if (!newTemplate) {
		await initializeDynamicFields();
		updateUIBasedOnTemplate();
		hideReparseNotice();
		return;
	}

	if (templateChanged || fieldsChanged) {
		await initializeDynamicFields();
		updateUIBasedOnTemplate();

		if (hadFilledFields) {
			showReparseNotice();
			needsReparse = true;
			const writeBtn = document.getElementById("write-btn");
			if (writeBtn) {
				writeBtn.disabled = true;
			}
		} else {
			hideReparseNotice();
		}
	}
}

/**
 * テンプレートベースでUIを更新
 * Update UI based on template
 * @description 根据当前模板状态更新按钮的禁用状态
 * @returns {void}
 */
function updateUIBasedOnTemplate() {
	const template = getActiveTemplate();
	const parseBtn = document.getElementById("parse-btn");
	const writeBtn = document.getElementById("write-btn");

	if (!template || !template.fields || template.fields.length === 0) {
		// 无模板或模板无字段：禁用解析和写入按钮
		if (parseBtn) {
			parseBtn.disabled = true;
			parseBtn.title = getText(
				"popup_template_empty_hint",
				"请先在设置页面创建模板",
			);
		}
		if (writeBtn) {
			writeBtn.disabled = true;
		}
	} else {
		// 有模板：启用解析按钮
		if (parseBtn) {
			parseBtn.disabled = false;
			parseBtn.title = "";
		}
		// 写入按钮需要在解析完成后才能启用
		if (writeBtn) {
			writeBtn.disabled = true;
		}
	}
}

/**
 * UI状态恢复
 *确保按钮状态和加载提示回到正常状态
 */
function resetUIState() {
	// 重新启用操作按钮，确保用户可以继续使用
	const parseBtn = document.getElementById("parse-btn");
	const writeBtn = document.getElementById("write-btn");

	if (parseBtn) parseBtn.disabled = false;
	if (writeBtn) writeBtn.disabled = false;

	// 清除加载动画和禁用状态
	setUiLoading(false);
}

/**
 * 重试选项提示
 */
function showRetryPrompt(context, retryCallback) {
	if (!retryCallback) return;

	let retryMessage = "";
	switch (context) {
		case "parse":
		case "ai":
			retryMessage = getText(
				"popup_hint_parse_network",
				"解析失败可能是临时网络问题",
			);
			break;
		case "anki":
			retryMessage = getText(
				"popup_hint_anki_connection",
				"Anki操作失败可能是连接问题",
			);
			break;
		default:
			retryMessage = getText(
				"popup_hint_retry_general",
				"操作失败可能是临时问题",
			);
	}

	const retryPrompt = getText(
		"popup_confirm_retry",
		`${retryMessage}\n\n是否立即重试？`,
		[retryMessage],
	);

	if (confirm(retryPrompt)) {
		retryCallback();
	}
}

// 全局错误边界实例
const errorBoundary = new ErrorBoundary();

// 配置错误边界回调
errorBoundary.setCallbacks({
	onUpdateStatus: (msg, type) => updateStatus(msg, type),
	onResetUI: resetUIState,
	onShowRetry: showRetryPrompt,
	onCriticalError: (msg) => {
		updateStatus(msg, "error");
		setTimeout(() => {
			const reloadPrompt = getText(
				"popup_confirm_reload",
				`${msg}\n\n点击确定刷新页面，取消继续使用`,
				[msg],
			);
			if (confirm(reloadPrompt)) {
				window.location.reload();
			}
		}, 1000);
	},
});

// DOM加载完成后启动应用初始化
document.addEventListener("DOMContentLoaded", async () => {
	// 执行应用程序初始化：加载配置、注册事件监听器
	await whenI18nReady();
	initialize();
});

/**
 * 应用程序初始化
 * 加载用户配置、注册事件处理器、初始化动态字段显示
 */
async function initialize() {
	try {
		// 从chrome.storage加载用户配置，供全局使用
		config = (await loadConfig()) || {};
		// console.log(getText("popup_status_config_loaded", "用户配置加载完成:"), config);

		// 重新本地化页面，确保静态元素使用用户配置的语言
		localizePage();

		// 渲染模板选择器
		renderTemplateSelector();

		// 注册主要功能按钮的点击事件处理器
		document.getElementById("parse-btn").addEventListener("click", handleParse);
		document
			.getElementById("write-btn")
			.addEventListener("click", handleWriteToAnki);

		// 注册模板选择器的变更事件
		const templateSelect = document.getElementById("template-select");
		if (templateSelect) {
			templateSelect.addEventListener("change", (e) => {
				handleTemplateChange(e.target.value);
			});
		}

		// 注册"前往设置"按钮的点击事件
		const openOptionsBtn = document.getElementById("open-options-btn");
		if (openOptionsBtn) {
			openOptionsBtn.addEventListener("click", () => {
				chrome.runtime.openOptionsPage();
			});
		}

		// 添加 storage 变更监听器
		chrome.storage.onChanged.addListener((changes, namespace) => {
			if (namespace === "local" && changes.ankiWordAssistantConfig) {
				handleStorageChange(changes.ankiWordAssistantConfig);
			}
		});

		// 根据模板渲染字段输入框
		await initializeDynamicFields();

		// 检查模板状态并更新UI
		updateUIBasedOnTemplate();

		// 向用户显示应用已准备就绪
		updateStatus(getText("popup_status_ready", "准备就绪"), "success");
	} catch (error) {
		await errorBoundary.handleError(error, "config", {
			allowRetry: true,
			retryCallback: () => initialize(),
		});
	}
}

/**
 * AI解析按钮事件处理器
 * 处理用户输入的文本，调用AI服务进行解析，并填充到对应字段中
 */
async function handleParse() {
	// 获取用户输入的待解析文本
	const textInput = document.getElementById("text-input").value;
	if (!textInput.trim()) {
		updateStatus(
			getText("popup_status_input_required", "请输入要解析的文本"),
			"error",
		);
		return;
	}

	// 获取当前活动模板
	const template = getActiveTemplate();
	const templateFields = getTemplateFieldNames(template);

	// 检查模板是否存在
	if (!template) {
		updateStatus(
			getText("popup_status_no_template", "请先在设置页面创建解析模板"),
			"error",
		);
		return;
	}

	// 检查模板字段
	if (templateFields.length === 0) {
		updateStatus(
			getText("popup_status_template_no_fields", "当前模板未配置字段"),
			"error",
		);
		return;
	}

	// 显示加载状态，禁用按钮防止重复提交
	setUiLoading(true, getText("popup_status_parsing", "正在进行AI解析..."));

	try {
		// 隐藏重新解析提示（如果有）
		hideReparseNotice();

		// 使用模板的 prompt
		// 如果 template.prompt 为空或 null，AI服务会自动使用默认模板
		// 不需要手动调用 buildPromptFromTemplate，因为 parseTextWithDynamicFieldsFallback 会内部处理
		const customPrompt = template.prompt;

		// 执行AI解析
		const result = await parseTextWithDynamicFieldsFallback(
			textInput,
			templateFields,
			customPrompt,
		);

		// 将解析结果填充到动态字段中
		fillDynamicFields(result, templateFields);

		// 解析成功后启用写入按钮，允许用户将内容保存到Anki
		document.getElementById("write-btn").disabled = false;
		updateStatus(getText("popup_status_parsed", "解析完成"), "success");
	} catch (error) {
		await errorBoundary.handleError(error, "parse", {
			allowRetry: true,
			retryCallback: () => handleParse(),
		});
	} finally {
		// 无论成功失败都要清除加载状态
		setUiLoading(false);
	}
}

/**
 * Anki写入按钮事件处理器
 * 收集字段内容、验证数据完整性、调用AnkiConnect API创建新卡片
 */
/**
 * Anki写入按钮事件处理器
 * 收集字段内容、验证数据完整性、调用AnkiConnect API创建新卡片
 */
async function handleWriteToAnki() {
	// 显示写入中状态，禁用按钮防止重复提交
	setUiLoading(true, getText("popup_status_writing", "正在写入 Anki..."));
	document.getElementById("write-btn").disabled = true;

	try {
		const activeTemplate = getActiveTemplate();
		if (!activeTemplate) {
			throw createI18nError("popup_status_no_template", {
				fallback: "请先选择解析模板",
			});
		}

		const templateFieldNames = getTemplateFieldNames(activeTemplate);
		if (templateFieldNames.length === 0) {
			throw createI18nError("popup_status_no_fields_write", {
				fallback: "当前模板未配置可写入的字段，请在选项页完成设置。",
			});
		}

		// 第一步：收集字段原始内容
		const rawCollectResult = collectFieldsForWrite(templateFieldNames, null, {
			forceDynamic: true,
		});

		// 字段收集过程的错误检查
		if (rawCollectResult.error) {
			const collectDetail = rawCollectResult.errors.join(", ");
			throw createDetailedError(
				"popup_status_collect_failed",
				"字段收集失败:",
				collectDetail,
			);
		}

		// 调用 Service
		const result = await writeToAnki({
			rawFields: rawCollectResult.fields,
			config: config,
			activeTemplate: activeTemplate,
			onWarning: async (warningMessage) => {
				updateStatus(
					getText(
						"popup_status_validation_continue",
						`${warningMessage}，继续写入...`,
						[warningMessage],
					),
					"warning",
				);
				await new Promise((resolve) => setTimeout(resolve, 1000));
			},
		});

		// 显示成功消息并触发自定义事件
		updateStatus(getText("popup_status_write_success", "写入成功"), "success");

		// 发布写入成功事件，供其他模块监听
		const event = new CustomEvent("ankiWriteSuccess", {
			detail: {
				noteId: result.noteId,
				fieldsCount: result.fieldsCount,
				mode: "dynamic",
			},
		});
		document.dispatchEvent(event);
	} catch (error) {
		await errorBoundary.handleError(error, "anki", {
			allowRetry: true,
			retryCallback: () => handleWriteToAnki(),
		});

		// 发布写入失败事件，供错误监控使用
		const event = new CustomEvent("ankiWriteError", {
			detail: {
				error: error.message,
				timestamp: new Date().toISOString(),
			},
		});
		document.dispatchEvent(event);
	} finally {
		// 无论成功失败都要恢复UI状态
		setUiLoading(false);
		document.getElementById("write-btn").disabled = false;
	}
}

/**
 * 字段界面初始化
 * 根据当前模板的字段配置渲染输入界面，并提供错误提示
 */
async function initializeDynamicFields() {
	try {
		// 获取当前激活的字段配置
		const activeTemplate = getActiveTemplate();
		const templateFieldNames = getTemplateFieldNames(activeTemplate);

		if (!activeTemplate || templateFieldNames.length === 0) {
			throw createI18nError("popup_status_no_configured_fields", {
				fallback: "当前模板未配置字段，请在选项页完成配置。",
			});
		}

		renderDynamicFields(templateFieldNames);
	} catch (error) {
		await errorBoundary.handleError(error, "fields");
		renderDynamicFields([]);
	}
}

/**
 * Dynamic模式字段渲染
 * 根据提供的字段名数组创建对应的输入控件
 * @param {string[]} fieldNames - 要渲染的字段名数组
 */

function renderDynamicFields(fieldNames) {
	// 获取字段容器元素
	const container = document.getElementById("fields-container");
	if (!container) {
		return;
	}

	// 字段名验证：如果没有有效字段则显示提示信息
	if (!Array.isArray(fieldNames) || fieldNames.length === 0) {
		const emptyFieldsHint = getText(
			"popup_dynamic_fields_missing",
			"当前未配置可填充的字段，请先在选项页完成字段配置。",
		);
		container.innerHTML = `<div class="text-xs text-gray-500 border border-dashed border-slate-300 rounded-md p-3 bg-slate-50">${emptyFieldsHint}</div>`;
		return;
	}

	// 为每个字段生成对应的HTML输入元素
	const fieldPlaceholder = getText(
		"popup_dynamic_field_placeholder",
		"AI将自动填充此字段...",
	);
	const fieldsHtml = fieldNames
		.map((fieldName, index) => {
			const inputId = `field-${index}`;

			return `
			<div class="form-group">
				<label for="${inputId}" class="block text-sm font-medium text-gray-700 mb-1">${fieldName}:</label>
				<textarea
					id="${inputId}"
					rows="1"
					placeholder="${fieldPlaceholder}"
					data-i18n-placeholder="popup_dynamic_field_placeholder"
					class="auto-resize-textarea w-full p-2 border border-gray-300 rounded-md resize-none focus:outline-none focus:ring-2 focus:ring-slate-500 focus:border-slate-500 text-sm"
				></textarea>
			</div>
		`;
		})
		.join("");

	// 将生成的HTML注入到容器中
	container.innerHTML = fieldsHtml;
	localizePage();

	// 为新创建的文本框添加自适应高度功能
	setupAutoResizeTextareas();
}

/**
 * 字段状态样式应用
 * 根据字段内容添加相应的CSS类名，提供视觉反馈
 * @param {HTMLElement} element - 要设置样式的字段元素
 * @param {string} value - 字段的文本内容
 */
function applyFieldStatusStyle(element, value) {
	// 清除之前的状态样式类
	element.classList.remove("filled", "partially-filled", "empty");

	const trimmedValue = value.trim();

	// 根据内容状态添加不同的样式类和提示信息
	if (trimmedValue) {
		element.classList.add("filled");
		const previewValue =
			trimmedValue.length > 20
				? `${trimmedValue.substring(0, 20)}...`
				: trimmedValue;
		element.title = getText("popup_field_preview", `已填充: ${previewValue}`, [
			previewValue,
		]);
	} else {
		element.classList.add("empty");
		element.title = getText("popup_field_tag_pending_label", "待填充");
	}
}

/**
 * Dynamic模式字段填充器
 * 将AI解析结果填入对应的动态字段，包含完整的错误处理和统计反馈
 * 支持自动高度调整、状态样式和填充结果统计
 * @param {object} aiResult - AI返回的字段解析结果对象
 * @param {string[]} fieldNames - 需要填充的字段名数组
 * @returns {object} 包含填充统计信息的结果对象
 */
function fillDynamicFields(aiResult, fieldNames) {
	try {
		// 验证输入参数
		if (!aiResult || typeof aiResult !== "object") {
			throw createI18nError("popup_status_parse_result_empty", {
				fallback: "AI解析结果为空或格式无效",
			});
		}

		if (!Array.isArray(fieldNames) || fieldNames.length === 0) {
			throw createI18nError("popup_status_field_names_invalid", {
				fallback: "字段名数组为空或无效",
			});
		}

		let filledCount = 0;
		const filledFields = [];
		const emptyFields = [];
		const missingElements = [];

		fieldNames.forEach((fieldName, index) => {
			const inputId = `field-${index}`;
			const element = document.getElementById(inputId);

			if (!element) {
				// console.warn(getText("popup_field_not_found", `找不到字段元素: ${inputId} (${fieldName})`, [inputId, fieldName]));
				missingElements.push(fieldName);
				return;
			}

			const value = aiResult[fieldName] || "";
			const trimmedValue = value.trim();

			// 设置字段值
			element.value = value;

			// 调整文本框高度（如果是自动调整的文本框）
			if (element.classList.contains("auto-resize-textarea")) {
				adjustTextareaHeight(element);
			}

			// 添加填充状态样式
			element.classList.remove("filled", "partially-filled", "empty");

			if (trimmedValue) {
				filledCount++;
				filledFields.push(fieldName);
				element.classList.add("filled");
			} else {
				emptyFields.push(fieldName);
				element.classList.add("empty");
			}

			// 添加工具提示
			element.title = trimmedValue
				? getText("popup_field_tag_filled", `已填充: ${fieldName}`, [fieldName])
				: getText("popup_field_tag_pending", `待填充: ${fieldName}`, [
						fieldName,
				  ]);
		});

		// 生成状态反馈
		const fillResult = {
			totalFields: fieldNames.length,
			filledCount,
			emptyCount: emptyFields.length,
			missingElements: missingElements.length,
			filledFields,
			emptyFields,
			fillRate: Math.round((filledCount / fieldNames.length) * 100),
		};

		// 显示详细状态信息
		let statusMessage = getText(
			"popup_field_progress",
			`已填充 ${filledCount}/${fieldNames.length} 个字段`,
			[String(filledCount), String(fieldNames.length)],
		);
		let statusType = "success";

		if (filledCount === 0) {
			statusMessage = getText(
				"popup_field_all_empty_warning",
				"警告：所有字段都为空，请检查AI解析结果",
			);
			statusType = "error";
		} else if (filledCount < fieldNames.length) {
			statusMessage += ` ${getText(
				"popup_field_empty_count",
				`(${emptyFields.length} 个字段为空)`,
				[String(emptyFields.length)],
			)}`;
			statusType = "warning";
		}

		// 添加特殊情况提示
		if (missingElements.length > 0) {
			// console.error(getText("popup_field_missing_dom_prefix", "缺失DOM元素:"), missingElements);
			statusMessage += ` ${getText(
				"popup_field_missing_dom_summary",
				`[${missingElements.length} 个元素缺失]`,
				[String(missingElements.length)],
			)}`;
			statusType = "error";
		}

		updateStatus(statusMessage, statusType);

		// 打印详细日志
		// console.log(getText("popup_dynamic_fill_complete", "动态字段填充完成:"), {
		//   fillResult,
		//   aiResult,
		//   fieldNames,
		// });

		// 触发字段变化事件，供其他模块监听
		const event = new CustomEvent("dynamicFieldsFilled", {
			detail: fillResult,
		});
		document.dispatchEvent(event);

		return fillResult;
	} catch (error) {
		// console.error(getText("popup_dynamic_fill_error", "填充动态字段时发生错误:"), error);
		updateStatus(
			getText("popup_field_fill_failed", `字段填充失败: ${error.message}`, [
				error.message,
			]),
			"error",
		);

		// 返回错误状态
		return {
			error: true,
			message: error.message,
			totalFields: fieldNames ? fieldNames.length : 0,
			filledCount: 0,
		};
	}
}

/**
 * UI加载状态管理
 * 控制按钮的禁用状态和加载提示消息的显示
 * @param {boolean} isLoading 是否处于加载状态
 * @param {string} [message=''] 要显示的加载消息
 */
function setUiLoading(isLoading, message = "") {
	document.getElementById("parse-btn").disabled = isLoading;
	document.getElementById("write-btn").disabled = isLoading;

	// 只有在有消息内容时才更新状态，避免覆盖现有的成功/错误消息
	if (message || isLoading) {
		updateStatus(message, "loading");
	}
	// 如果是结束loading且没有消息，不更新状态，保留现有消息
}

/**
 * 状态消息更新器
 * 在UI中显示状态信息，并根据类型自动设置清除定时器
 * @param {string} message - 要显示的消息文本
 * @param {'success'|'error'|'loading'|'warning'|''} type - 消息类型，影响样式和显示时长
 */
function updateStatus(message, type = "") {
	const statusElement = document.getElementById("status-message");
	statusElement.textContent = message;
	statusElement.className = `status-${type}`;

	// 清除现有计时器
	if (statusTimer) {
		clearTimeout(statusTimer);
		statusTimer = null;
	}

	// 根据类型设置不同的显示时长
	let timeout = 0;
	switch (type) {
		case "success":
			timeout = 3000; // 成功消息显示3秒
			break;
		case "error":
			timeout = 5000; // 错误消息显示5秒
			break;
		case "warning":
			timeout = 4000; // 警告消息显示4秒
			break;
		default:
			timeout = 0; // loading等状态不自动消失
	}

	if (timeout > 0) {
		statusTimer = setTimeout(() => {
			statusElement.textContent = "";
			statusElement.className = "";
			statusTimer = null;
		}, timeout);
	}
}

/**
 * 自适应文本框初始化
 * 为所有具有自适应类名的文本框添加高度自动调整功能
 */
function setupAutoResizeTextareas() {
	const textareas = document.querySelectorAll(".auto-resize-textarea");

	textareas.forEach((textarea) => {
		// 初始化高度
		adjustTextareaHeight(textarea);

		// 监听输入事件
		textarea.addEventListener("input", () => {
			adjustTextareaHeight(textarea);
		});

		// 监听粘贴事件
		textarea.addEventListener("paste", () => {
			setTimeout(() => {
				adjustTextareaHeight(textarea);
			}, 0);
		});
	});
}

/**
 * 文本框高度调整算法
 * 根据内容自动计算并设置合适的文本框高度，带最大高度限制
 * @param {HTMLTextAreaElement} textarea - 需要调整高度的文本框元素
 */
function adjustTextareaHeight(textarea) {
	// 重置高度以获取准确的scrollHeight
	textarea.style.height = "auto";

	// 计算所需高度
	const scrollHeight = textarea.scrollHeight;
	const lineHeight = parseInt(getComputedStyle(textarea).lineHeight) || 20;
	const padding =
		parseInt(getComputedStyle(textarea).paddingTop) +
		parseInt(getComputedStyle(textarea).paddingBottom);

	// 计算行数
	const lines = Math.ceil((scrollHeight - padding) / lineHeight);

	// 限制最大5行
	const maxLines = 5;
	const actualLines = Math.min(lines, maxLines);

	// 设置新高度
	const newHeight = Math.max(actualLines * lineHeight + padding, 40); // 最小高度40px
	textarea.style.height = newHeight + "px";

	// 如果内容超过5行，显示滚动条
	if (lines > maxLines) {
		textarea.style.overflowY = "auto";
	} else {
		textarea.style.overflowY = "hidden";
	}
}
