// 文件名: floating-panel.js
// 描述: 该文件负责管理悬浮式AI解析面板的创建、显示、状态管理和用户交互。

import { translate } from "../utils/i18n.js";
import { isLegacyMode } from "../utils/field-handler.js";
import {
	getActiveTemplate,
	listTemplates,
	setActiveTemplate,
} from "../utils/template-store.js";
import { saveConfig } from "../utils/storage.js";

// 日志前缀，用于控制台输出，方便调试。
const LOG_PREFIX = "[floating-assistant/panel]";

// 定义面板的尺寸和布局相关的常量。
const PANEL_WIDTH = 360; // 面板宽度
const PANEL_MAX_HEIGHT = 420; // 面板最大高度
const PANEL_GAP = 12; // 面板与选中文本之间的间隙
const PANEL_PADDING = 8; // 面板与视口边缘的内边距

// 定义面板的几种状态。
const STATE_IDLE = "idle"; // 空闲状态
const STATE_LOADING = "loading"; // 加载状态
const STATE_READY = "ready"; // 准备就绪状态
const STATE_ERROR = "error"; // 错误状态

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
 * 将一个值限制在指定的最小值和最大值之间。
 * @param {number} value - 要限制的值。
 * @param {number} min - 允许的最小值。
 * @param {number} max - 允许的最大值。
 * @returns {number} - 限制后的值。
 */
function clamp(value, min, max) {
	if (value < min) {
		return min;
	}
	if (value > max) {
		return max;
	}
	return value;
}

/**
 * 规范化字段列表，移除重复和无效的字段。
 * @param {Array<string>} rawFields - 原始字段名数组。
 * @returns {Array<string>} - 规范化后的字段名数组。
 */
function normalizeFieldList(rawFields) {
	if (!Array.isArray(rawFields)) {
		return [];
	}
	const seen = new Set();
	const normalized = [];
	for (const field of rawFields) {
		if (typeof field !== "string") {
			continue;
		}
		const trimmed = field.trim();
		if (!trimmed || seen.has(trimmed)) {
			continue;
		}
		seen.add(trimmed);
		normalized.push(trimmed);
	}
	return normalized;
}

/**
 * 根据配置选择当前应该使用的Anki模型名称。
 * @param {object} config - 应用配置对象。
 * @returns {string} - 选定的模型名称。
 */
function selectModelName(config) {
	const templates = config?.promptTemplates?.promptTemplatesByModel ?? {};
	const defaultModel = config?.ankiConfig?.defaultModel;
	if (defaultModel && templates[defaultModel]) {
		return defaultModel;
	}
	const templateKeys = Object.keys(templates);
	if (templateKeys.length > 0) {
		return templateKeys[0];
	}
	return defaultModel ?? "";
}

/**
 * 解析并返回当前模型选定的字段列表。
 * @param {object} config - 应用配置对象。
 * @param {Array<string>} allFields - 当前模型的所有字段列表。
 * @returns {Array<string>} - 筛选后的选定字段列表。
 */
function resolveSelectedFields(config, allFields) {
	const templates = config?.promptTemplates?.promptTemplatesByModel ?? {};
	const modelName = selectModelName(config);
	const modelTemplate = templates[modelName];
	if (!modelTemplate) {
		return normalizeFieldList(allFields);
	}
	const selected = normalizeFieldList(modelTemplate.selectedFields);
	if (selected.length === 0) {
		return normalizeFieldList(allFields);
	}
	return selected.filter((field) => allFields.includes(field));
}

/**
 * 根据配置构建字段布局信息（传统模式或动态模式）。
 * @param {object} config - 应用配置对象。
 * @returns {{mode: string, fields: Array<string>}} - 字段布局信息。
 */
function buildFieldLayout(config) {
	const legacy = isLegacyMode(config);
	const allFields = normalizeFieldList(config?.ankiConfig?.modelFields ?? []);

	if (legacy) {
		return {
			mode: "legacy",
			fields: allFields,
		};
	}

	// Use Template Store Logic
	const activeTemplate = getActiveTemplate(config);
	if (activeTemplate) {
		// If we have an active template, use its fields
		const templateFields = activeTemplate.fields.map((f) => f.name);
		return {
			mode: templateFields.length > 0 ? "dynamic" : "dynamic-empty",
			fields: templateFields,
		};
	}

	// Fallback to old dynamic logic
	const selected = resolveSelectedFields(config, allFields);
	return {
		mode: selected.length > 0 ? "dynamic" : "dynamic-empty",
		fields: selected,
	};
}

/**
 * 创建一个带文本内容的HTML元素。
 * @param {Document} documentRef - 文档对象引用。
 * @param {string} tagName - 元素的标签名。
 * @param {string} className - 元素的CSS类名。
 * @param {string} textContent - 元素的文本内容。
 * @returns {HTMLElement} - 创建的HTML元素。
 */
function createTextElement(documentRef, tagName, className, textContent) {
	const element = documentRef.createElement(tagName);
	if (className) {
		element.className = className;
	}
	if (typeof textContent === "string") {
		element.textContent = textContent;
	}
	return element;
}

/**
 * 创建并导出一个悬浮面板控制器实例。
 * @param {object} options - 控制器选项，如window和document的引用。
 * @returns {object} - 悬浮面板控制器API对象。
 */
export function createFloatingPanelController(options = {}) {
	const windowRef = options.windowRef ?? window;
	const documentRef = options.documentRef ?? document;

	if (!windowRef || !documentRef) {
		throw new Error("windowRef and documentRef are required");
	}

	// DOM元素和状态变量的引用
	let host = null; // Shadow DOM的宿主元素
	let shadowRoot = null; // Shadow DOM根节点
	let wrapper = null; // 面板的包装器，用于定位和动画
	let panel = null; // 面板主元素
	let statusLabel = null; // 显示状态文本的标签
	let statusIcon = null; // 显示状态图标（如加载中、成功、失败）
	let fieldContainer = null; // 容纳所有字段输入的容器
	let emptyNotice = null; // 当没有字段时显示的提示信息
	let actionContainer = null; // 容纳操作按钮（如重试、写入）的容器
	let retryButton = null; // 重试按钮
	let writeButton = null; // 写入Anki按钮
	let currentState = STATE_IDLE; // 当前面板状态
	let visible = false; // 面板是否可见
	let destroyed = false; // 控制器是否已被销毁
	let listenersBound = false; // 全局事件监听器是否已绑定
	let currentSelection = null; // 当前用户选择的文本及位置信息
	let currentConfig = null; // 当前的应用配置
	let currentFieldMode = "legacy"; // 当前字段模式（legacy或dynamic）
	let retryHandler = null; // 重试操作的回调函数
	let closeHandler = null; // 面板关闭时的回调函数
	let writeHandler = null; // 写入Anki操作的回调函数
	let isPinned = false; // 面板是否被固定
	let pinButton = null; // 固定按钮
	let isDragging = false; // 是否正在拖动面板
	let dragStartX = 0; // 拖动开始时的鼠标X坐标
	let dragStartY = 0; // 拖动开始时的鼠标Y坐标
	let panelStartX = 0; // 拖动开始时面板的X坐标
	let panelStartY = 0; // 拖动开始时面板的Y坐标
	let writeSuccess = false; // 是否刚刚成功写入Anki

	/**
	 * 确保面板所需的DOM结构已经创建并注入到页面中。
	 * 该函数是惰性执行的，只在首次需要时创建DOM。
	 */
	function ensureDom() {
		if (host) {
			return;
		}

		// 创建Shadow DOM宿主
		host = documentRef.createElement("div");
		host.id = "anki-floating-assistant-panel-host";
		host.style.position = "fixed";
		host.style.top = "0";
		host.style.left = "0";
		host.style.width = "0";
		host.style.height = "0";
		host.style.zIndex = "2147483647"; // 确保在最顶层
		host.style.pointerEvents = "none";
		host.style.display = "none";

		shadowRoot = host.attachShadow({ mode: "open" });

		// 创建样式表并注入Shadow DOM
		const style = documentRef.createElement("style");
		style.textContent = `
:host {
  all: initial;
  color-scheme: light dark;
}
*, *::before, *::after {
  box-sizing: border-box;
}
.panel-wrapper {
  position: fixed;
  top: 0;
  left: 0;
  pointer-events: none;
  opacity: 0;
  transform: translate3d(-9999px, -9999px, 0);
  transition: opacity 0.16s ease-out;
}
.panel-wrapper[data-visible="true"] {
  pointer-events: auto;
  opacity: 1;
}
.panel {
  width: ${PANEL_WIDTH}px;
  max-width: min(${PANEL_WIDTH}px, calc(100vw - ${PANEL_PADDING * 2}px));
  max-height: min(${PANEL_MAX_HEIGHT}px, calc(100vh - ${PANEL_PADDING * 2}px));
  background: color-mix(in srgb, rgb(248 250 252) 96%, rgb(15 23 42) 4%);
  color: rgb(15 23 42);
  border-radius: 16px;
  box-shadow:
    0 18px 50px rgba(15, 23, 42, 0.24),
    0 6px 15px rgba(15, 23, 42, 0.18);
  padding: 16px;
  font-family: "Segoe UI", system-ui, -apple-system, BlinkMacSystemFont, "Helvetica Neue", sans-serif;
  backdrop-filter: blur(12px);
  display: flex;
  flex-direction: column;
  gap: 12px;
  border: 1px solid rgba(148, 163, 184, 0.16);
  cursor: grab;
}
@media (prefers-color-scheme: dark) {
  .panel {
    background: color-mix(in srgb, rgb(30 41 59) 92%, rgb(15 23 42) 8%);
    color: rgb(226 232 240);
    border-color: rgba(148, 163, 184, 0.28);
  }
  .status-icon::before {
    border-top-color: rgb(203 213 225);
  }
}
.panel:focus {
  outline: none;
  box-shadow:
    0 0 0 2px rgba(71, 85, 105, 0.2),
    0 18px 50px rgba(15, 23, 42, 0.24);
}
.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.panel-title {
  font-size: 15px;
  font-weight: 600;
  letter-spacing: 0.01em;
}
.panel-actions-header {
  display: flex;
  align-items: center;
  gap: 4px;
}
.panel-pin,
.panel-close {
  all: unset;
  width: 28px;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 9999px;
  cursor: pointer;
  color: inherit;
  background: transparent;
  transition: background 0.16s ease-out, color 0.16s ease-out;
}
.panel-pin:hover,
.panel-close:hover {
  background: rgba(71, 85, 105, 0.12);
  color: rgb(71, 85, 105);
}
.panel-pin[data-pinned="true"] {
  color: rgb(34, 197, 94);
}
.panel-pin[data-pinned="true"]:hover {
  background: rgba(34, 197, 94, 0.12);
  color: rgb(22, 163, 74);
}
.panel-pin[data-pinned="true"] .pin-icon {
  transform: rotate(45deg);
}
.pin-icon {
  transition: transform 0.16s ease-out;
}
.panel-status {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 24px;
  font-size: 13px;
  color: rgba(30, 41, 59, 0.86);
}
@media (prefers-color-scheme: dark) {
  .panel-status {
    color: rgba(226, 232, 240, 0.92);
  }
}
.panel-status[data-state="${STATE_ERROR}"] {
  color: rgb(220, 38, 38);
}
.status-icon {
  position: relative;
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}
.status-icon::before,
.status-icon::after {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: 50%;
  border: 2px solid rgba(71, 85, 105, 0.45);
  border-top-color: rgb(71, 85, 105);
  opacity: 0;
}
.status-icon[data-kind="spinner"]::before {
  opacity: 1;
  animation: panel-spinner 1s linear infinite;
}
.status-icon[data-kind="success"]::after {
  opacity: 1;
  border-color: rgba(34, 197, 94, 0.7);
  border-top-color: rgb(34, 197, 94);
  animation: none;
}
.status-icon[data-kind="error"]::after {
  opacity: 1;
  border-color: rgba(220, 38, 38, 0.65);
  border-top-color: rgb(220, 38, 38);
  animation: none;
}
@keyframes panel-spinner {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}
.panel-body {
  flex: 1 1 auto;
  min-height: 120px;
  overflow-y: auto;
  padding-right: 4px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.panel-body::-webkit-scrollbar {
  width: 6px;
}
.panel-body::-webkit-scrollbar-track {
  background: rgba(148, 163, 184, 0.18);
  border-radius: 999px;
}
.panel-body::-webkit-scrollbar-thumb {
  background: rgba(71, 85, 105, 0.35);
  border-radius: 999px;
}
.field-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.field-input::-webkit-scrollbar,
.field-textarea::-webkit-scrollbar {
  display: none;
}
.field-input,
.field-textarea {
  scrollbar-width: none;
  -ms-overflow-style: none;
}
.field-label {
  font-size: 13px;
  font-weight: 500;
  letter-spacing: 0.01em;
}
.field-input,
.field-textarea {
  width: 100%;
  border: 1px solid rgba(148, 163, 184, 0.35);
  border-radius: 10px;
  padding: 10px 12px;
  font-size: 13px;
  font-family: inherit;
  resize: none;
  min-height: 42px;
  background: rgba(255, 255, 255, 0.92);
  color: inherit;
  transition: border-color 0.16s ease-out, box-shadow 0.16s ease-out;
}
@media (prefers-color-scheme: dark) {
  .field-input,
  .field-textarea {
    background: rgba(15, 23, 42, 0.65);
    border-color: rgba(148, 163, 184, 0.38);
  }
}
.field-input:focus,
.field-textarea:focus {
  outline: none;
  border-color: rgba(71, 85, 105, 0.65);
  box-shadow: 0 0 0 2px rgba(71, 85, 105, 0.18);
}
.panel-empty {
  font-size: 12px;
  line-height: 1.5;
  color: rgba(100, 116, 139, 0.9);
  border: 1px dashed rgba(148, 163, 184, 0.45);
  border-radius: 12px;
  padding: 12px;
  background: rgba(241, 245, 249, 0.75);
}
.panel-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
.action-button {
  all: unset;
  padding: 8px 14px;
  font-size: 13px;
  font-weight: 500;
  border-radius: 999px;
  cursor: pointer;
  transition: background 0.16s ease-out, color 0.16s ease-out;
}
.retry-button {
  background: rgba(71, 85, 105, 0.12);
  color: rgb(71, 85, 105);
}
.retry-button:hover {
  background: rgba(71, 85, 105, 0.18);
  color: rgb(51, 65, 85);
}
.write-button {
  background: rgba(34, 197, 94, 0.12);
  color: rgb(34, 197, 94);
}
.write-button:hover {
  background: rgba(34, 197, 94, 0.18);
  color: rgb(22, 163, 74);
}
.write-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
@media (prefers-color-scheme: dark) {
  .panel-empty {
    background: rgba(30, 41, 59, 0.65);
    color: rgba(203, 213, 225, 0.92);
    border-color: rgba(148, 163, 184, 0.55);
  }
  .retry-button {
    background: rgba(148, 163, 184, 0.18);
    color: rgb(203, 213, 225);
  }
  .retry-button:hover {
    background: rgba(148, 163, 184, 0.26);
    color: rgb(226, 232, 240);
  }
  .write-button {
    background: rgba(74, 222, 128, 0.18);
    color: rgb(134, 239, 172);
  }
  .write-button:hover {
    background: rgba(74, 222, 128, 0.26);
    color: rgb(187, 247, 208);
  }
	.write-button:hover {
		background: rgba(74, 222, 128, 0.26);
		color: rgb(187, 247, 208);
	}
}
.panel-template-select {
    flex: 1;
    min-width: 0;
    height: 24px;
    margin: 0 8px;
    padding: 0 4px;
    font-size: 13px;
    color: inherit;
    background: transparent;
    border: 1px solid rgba(148, 163, 184, 0.35);
    border-radius: 4px;
    outline: none;
    cursor: pointer;
}
.panel-template-select:focus {
    border-color: rgba(71, 85, 105, 0.65);
}
@media (prefers-color-scheme: dark) {
    .panel-template-select {
        border-color: rgba(148, 163, 184, 0.38);
        background: rgba(15, 23, 42, 0.65);
    }
}
`;

		// 创建面板的各个组成部分
		wrapper = documentRef.createElement("div");
		wrapper.className = "panel-wrapper";
		wrapper.dataset.visible = "false";

		panel = documentRef.createElement("div");
		panel.className = "panel";
		panel.tabIndex = -1;
		panel.setAttribute("role", "dialog");
		panel.setAttribute("aria-modal", "false");

		const header = documentRef.createElement("div");
		header.className = "panel-header";

		const title = createTextElement(
			documentRef,
			"div",
			"panel-title",
			getText("popup_app_title", "Anki Word Assistant"),
		);
		// Hide title visually but keep for structure if needed, or just replace functionality
		// Let's hide the title if we have templates, or keep it if no templates.
		// Actually, let's make the title smaller or just use the select as the main element in the middle.
		title.style.display = "none"; // We will show the select instead

		const templateSelect = documentRef.createElement("select");
		templateSelect.className = "panel-template-select";

		templateSelect.addEventListener("change", async (e) => {
			const newTemplateId = e.target.value;
			if (!newTemplateId || !currentConfig) return;

			try {
				// Update global config
				setActiveTemplate(currentConfig, newTemplateId, "floating");
				await saveConfig(currentConfig);

				// Update local state and UI
				currentFieldMode = "dynamic"; // Assume template mode used

				// Re-build layout
				const layout = buildFieldLayout(currentConfig);
				// Clear previous fields
				fieldContainer.innerHTML = "";

				// Re-render fields
				if (layout.mode === "dynamic") {
					renderDynamicFields(layout.fields);
					emptyNotice.style.display = "none";
					fieldContainer.style.display = "flex";
				} else if (layout.mode === "legacy") {
					// Should typically not happen if we are selecting templates, but for safety
					renderLegacyFields(layout.fields);
					emptyNotice.style.display = "none";
					fieldContainer.style.display = "flex";
				} else {
					// Empty
					emptyNotice.style.display = "block";
					fieldContainer.style.display = "none";
				}

				// Reset status to idle to encourage retry
				currentState = STATE_IDLE;
				updateStatus("idle");

				// Disable write button until re-parsed
				writeButton.disabled = true;
			} catch (err) {
				console.error(LOG_PREFIX, "Failed to switch template", err);
			}
		});

		// 创建操作按钮容器
		const actionsHeader = documentRef.createElement("div");
		actionsHeader.className = "panel-actions-header";

		// 创建固定按钮
		pinButton = documentRef.createElement("button");
		pinButton.className = "panel-pin";
		pinButton.type = "button";
		pinButton.dataset.pinned = "false";
		pinButton.setAttribute(
			"aria-label",
			getText("floating_panel_pin_label", "固定面板"),
		);
		pinButton.innerHTML = `
<svg class="pin-icon" width="14" height="14" viewBox="0 0 20 20" fill="none" aria-hidden="true">
  <path d="M10 3L10 11M7 6L10 3L13 6M10 11L10 17M6 11L14 11" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
`;
		pinButton.addEventListener("click", togglePin);

		const closeButton = documentRef.createElement("button");
		closeButton.className = "panel-close";
		closeButton.type = "button";
		closeButton.setAttribute(
			"aria-label",
			getText("floating_panel_close_label", "关闭面板"),
		);
		closeButton.innerHTML = `
<svg width="14" height="14" viewBox="0 0 20 20" fill="none" aria-hidden="true">
  <path d="M5 5L15 15M15 5L5 15" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
</svg>
`;
		closeButton.addEventListener("click", () => {
			// 如果面板被固定,先取消固定
			if (isPinned) {
				togglePin();
			}
			hide(true);
			if (typeof closeHandler === "function") {
				closeHandler("manual");
			}
		});

		actionsHeader.appendChild(pinButton);
		actionsHeader.appendChild(closeButton);

		header.appendChild(title);
		header.appendChild(templateSelect);
		header.appendChild(actionsHeader);

		const status = documentRef.createElement("div");
		status.className = "panel-status";
		status.dataset.state = STATE_IDLE;

		statusIcon = documentRef.createElement("div");
		statusIcon.className = "status-icon";
		statusIcon.dataset.kind = "spinner";

		statusLabel = createTextElement(documentRef, "span", "status-label", "");

		status.appendChild(statusIcon);
		status.appendChild(statusLabel);

		const body = documentRef.createElement("div");
		body.className = "panel-body";

		fieldContainer = documentRef.createElement("div");
		fieldContainer.className = "panel-fields";
		fieldContainer.setAttribute("data-field-mode", "legacy");

		emptyNotice = documentRef.createElement("div");
		emptyNotice.className = "panel-empty";
		emptyNotice.hidden = true;
		emptyNotice.textContent = getText(
			"popup_dynamic_fields_missing",
			"当前未配置可填充的字段，请先在选项页完成字段配置。",
		);

		body.appendChild(fieldContainer);
		body.appendChild(emptyNotice);

		actionContainer = documentRef.createElement("div");
		actionContainer.className = "panel-actions";

		retryButton = documentRef.createElement("button");
		retryButton.type = "button";
		retryButton.className = "retry-button action-button";
		retryButton.textContent = getText("floating_panel_retry_label", "重试");
		retryButton.hidden = true;
		retryButton.addEventListener("click", () => {
			if (typeof retryHandler === "function") {
				retryHandler(currentSelection);
			}
		});

		writeButton = documentRef.createElement("button");
		writeButton.type = "button";
		writeButton.className = "write-button action-button";
		writeButton.textContent = getText("floating_panel_write_label", "写入Anki");
		writeButton.disabled = true;
		writeButton.hidden = false;
		writeButton.addEventListener("click", () => {
			if (typeof writeHandler === "function") {
				writeHandler();
			}
		});

		actionContainer.appendChild(retryButton);
		actionContainer.appendChild(writeButton);

		panel.appendChild(header);
		panel.appendChild(status);
		panel.appendChild(body);
		panel.appendChild(actionContainer);

		wrapper.appendChild(panel);

		shadowRoot.append(style, wrapper);

		// 监听键盘事件，用于处理Esc键关闭面板
		shadowRoot.addEventListener("keydown", handleKeyDown, true);

		// 为panel添加拖动监听器（只在pin状态下启用）
		panel.addEventListener("mousedown", handlePanelMouseDown);

		documentRef.documentElement?.appendChild(host);
	}

	/**
	 * 处理键盘按下事件，主要用于监听Escape键来关闭面板。
	 * @param {KeyboardEvent} event - 键盘事件对象。
	 */
	function handleKeyDown(event) {
		if (event.key === "Escape") {
			if (!visible) {
				return;
			}
			event.preventDefault();
			hide(true);
			if (typeof closeHandler === "function") {
				closeHandler("escape");
			}
		}
	}

	/**
	 * 绑定全局事件监听器，如滚动、窗口大小调整和点击事件。
	 */
	function bindGlobalListeners() {
		if (listenersBound) {
			return;
		}
		windowRef.addEventListener("scroll", handleViewportChange, true);
		windowRef.addEventListener("resize", handleViewportChange, true);
		documentRef.addEventListener("pointerdown", handlePointerDown, true);
		listenersBound = true;
	}

	/**
	 * 解绑全局事件监听器。
	 */
	function unbindGlobalListeners() {
		if (!listenersBound) {
			return;
		}
		windowRef.removeEventListener("scroll", handleViewportChange, true);
		windowRef.removeEventListener("resize", handleViewportChange, true);
		documentRef.removeEventListener("pointerdown", handlePointerDown, true);
		listenersBound = false;
	}

	/**
	 * 处理滚动或窗口大小调整事件，用于实时更新面板位置。
	 */
	function handleViewportChange() {
		if (!visible) {
			return;
		}
		if (!currentSelection?.rect) {
			hide(true);
			return;
		}
		updatePosition(currentSelection.rect);
	}

	/**
	 * 处理页面上的点击事件，如果点击发生在面板外部，则关闭面板。
	 * @param {PointerEvent} event - 指针事件对象。
	 */
	function handlePointerDown(event) {
		if (!visible) {
			return;
		}
		const path =
			typeof event.composedPath === "function" ? event.composedPath() : [];
		if (path.includes(host) || path.includes(panel)) {
			return;
		}
		// 如果写入成功，忽略固定状态，直接关闭面板
		if (writeSuccess) {
			forceHide(true);
			if (typeof closeHandler === "function") {
				closeHandler("outside");
			}
			return;
		}
		hide(true);
		if (typeof closeHandler === "function") {
			closeHandler("outside");
		}
	}

	/**
	 * 处理面板的拖动开始事件。
	 * 只在面板被固定时允许拖动。
	 * @param {MouseEvent} event - 鼠标事件对象。
	 */
	function handlePanelMouseDown(event) {
		// 面板必须可见才能拖动
		if (!visible) {
			return;
		}

		// 检查点击目标是否是可交互元素，如果是则不启动拖动
		// 只排除真正的交互元素：输入框、文本框和按钮
		const target = event.target;
		const isInteractive =
			target.tagName === "INPUT" ||
			target.tagName === "TEXTAREA" ||
			target.tagName === "BUTTON" ||
			target.closest("button") ||
			target.closest("input") ||
			target.closest("textarea");

		if (isInteractive) {
			return;
		}

		// 开始拖动时，如果面板未固定，自动固定它
		// 这样可以防止拖动过程中面板被自动隐藏
		if (!isPinned) {
			togglePin();
		}

		// 记录拖动开始时的状态
		isDragging = true;
		dragStartX = event.clientX;
		dragStartY = event.clientY;

		// 获取当前面板位置
		const transform = wrapper.style.transform;
		const match = transform.match(/translate3d\(([^,]+)px,\s*([^,]+)px/);
		if (match) {
			panelStartX = parseFloat(match[1]);
			panelStartY = parseFloat(match[2]);
		} else {
			panelStartX = 0;
			panelStartY = 0;
		}

		// 添加全局拖动监听器
		documentRef.addEventListener("mousemove", handlePanelMouseMove, true);
		documentRef.addEventListener("mouseup", handlePanelMouseUp, true);

		// 添加拖动时的样式
		if (panel) {
			panel.style.cursor = "grabbing";
			panel.style.userSelect = "none";
		}

		event.preventDefault();
	}

	/**
	 * 处理面板的拖动移动事件。
	 * @param {MouseEvent} event - 鼠标事件对象。
	 */
	function handlePanelMouseMove(event) {
		if (!isDragging || !wrapper) {
			return;
		}

		// 计算新位置
		const deltaX = event.clientX - dragStartX;
		const deltaY = event.clientY - dragStartY;
		const newX = panelStartX + deltaX;
		const newY = panelStartY + deltaY;

		// 限制在视口范围内
		const viewport = {
			width: windowRef.innerWidth,
			height: windowRef.innerHeight,
		};
		const size = measurePanelSize();
		const padding = PANEL_PADDING;

		const clampedX = clamp(
			newX,
			padding,
			viewport.width - padding - size.width,
		);
		const clampedY = clamp(
			newY,
			padding,
			viewport.height - padding - size.height,
		);

		// 更新位置
		wrapper.style.transform = `translate3d(${Math.round(
			clampedX,
		)}px, ${Math.round(clampedY)}px, 0)`;

		event.preventDefault();
	}

	/**
	 * 处理面板的拖动结束事件。
	 * @param {MouseEvent} event - 鼠标事件对象。
	 */
	function handlePanelMouseUp(event) {
		if (!isDragging) {
			return;
		}

		isDragging = false;

		// 移除全局拖动监听器
		documentRef.removeEventListener("mousemove", handlePanelMouseMove, true);
		documentRef.removeEventListener("mouseup", handlePanelMouseUp, true);

		// 恢复样式
		if (panel) {
			panel.style.cursor = "";
			panel.style.userSelect = "";
		}

		event.preventDefault();
	}

	/**
	 * 切换面板的固定状态。
	 * 固定时，面板将不会因为滚动、点击外部等操作而自动隐藏。
	 */
	function togglePin() {
		isPinned = !isPinned;

		if (!pinButton) {
			return;
		}

		if (isPinned) {
			// 固定时：解绑所有自动隐藏的监听器
			unbindGlobalListeners();
			// 更新pin按钮状态
			pinButton.dataset.pinned = "true";
			pinButton.setAttribute(
				"aria-label",
				getText("floating_panel_unpin_label", "取消固定面板"),
			);
		} else {
			// 取消固定：重新绑定自动隐藏的监听器
			bindGlobalListeners();
			// 更新pin按钮状态
			pinButton.dataset.pinned = "false";
			pinButton.setAttribute(
				"aria-label",
				getText("floating_panel_pin_label", "固定面板"),
			);
		}
	}

	/**
	 * 测量面板的实际渲染尺寸。
	 * @returns {{width: number, height: number}} - 面板的宽度和高度。
	 */
	function measurePanelSize() {
		if (!panel) {
			return { width: PANEL_WIDTH, height: PANEL_MAX_HEIGHT };
		}
		const rect = panel.getBoundingClientRect();
		let width = rect.width;
		let height = rect.height;
		if (!width || !Number.isFinite(width)) {
			width = PANEL_WIDTH;
		}
		if (!height || !Number.isFinite(height)) {
			height = panel.scrollHeight;
			if (!height || !Number.isFinite(height)) {
				height = PANEL_MAX_HEIGHT;
			}
		}
		return { width, height };
	}

	/**
	 * 根据用户选择的文本矩形区域，计算并更新面板的位置。
	 * @param {DOMRect} rect - 用户选择文本的矩形区域。
	 */
	function updatePosition(rect) {
		if (!wrapper || !panel || !rect) {
			return;
		}

		const viewport = {
			width: windowRef.innerWidth,
			height: windowRef.innerHeight,
		};

		const size = measurePanelSize();
		const gap = PANEL_GAP;
		const padding = PANEL_PADDING;

		const preferredX = rect.left;
		const preferredY = rect.bottom + gap;

		let x = clamp(preferredX, padding, viewport.width - padding - size.width);
		let y = preferredY;

		// 如果面板在下方超出视口，尝试在上方显示
		if (preferredY + size.height > viewport.height - padding) {
			const flippedY = rect.top - gap - size.height;
			y =
				flippedY >= padding
					? flippedY
					: viewport.height - padding - size.height;
		}

		y = clamp(y, padding, viewport.height - padding - size.height);

		wrapper.style.transform = `translate3d(${Math.round(x)}px, ${Math.round(
			y,
		)}px, 0)`;
	}

	/**
	 * 设置面板的状态，并更新UI（图标和状态文本）。
	 * @param {string} nextState - 新的状态（如 'loading', 'ready', 'error'）。
	 * @param {object} options - 附加选项，如自定义消息和是否允许重试。
	 */
	function setStatus(nextState, options = {}) {
		currentState = nextState;
		if (!statusLabel || !statusIcon) {
			return;
		}
		const { message, allowRetry = false } = options;
		if (retryButton) {
			retryButton.hidden = !allowRetry;
		}

		if (nextState === STATE_LOADING) {
			statusIcon.dataset.kind = "spinner";
			statusLabel.textContent =
				message ?? getText("popup_status_parsing", "正在解析选中的内容...");
		} else if (nextState === STATE_READY) {
			statusIcon.dataset.kind = "success";
			statusLabel.textContent =
				message ??
				getText("popup_status_ready_to_write", "解析完成，可以继续编辑字段。");
		} else if (nextState === STATE_ERROR) {
			statusIcon.dataset.kind = "error";
			statusLabel.textContent =
				message ??
				getText("popup_error_generic", "解析时出现错误，请稍后重试。");
		} else {
			statusIcon.dataset.kind = "spinner";
			statusLabel.textContent = "";
		}

		if (statusLabel.parentElement) {
			statusLabel.parentElement.dataset.state = nextState;
		}
	}

	/**
	 * 渲染传统的"正面"和"背面"字段。
	 */
	function renderLegacyFields() {
		if (!fieldContainer) {
			return;
		}
		fieldContainer.innerHTML = "";
		currentFieldMode = "legacy";

		const groups = [
			{
				id: "front-input",
				tag: "input",
				labelKey: "cardFront",
				fallback: "正面",
				rows: 1,
			},
			{
				id: "back-input",
				tag: "textarea",
				labelKey: "cardBack",
				fallback: "背面",
				rows: 4,
			},
		];

		for (const group of groups) {
			const wrapperElem = documentRef.createElement("div");
			wrapperElem.className = "field-group";

			const label = documentRef.createElement("label");
			label.className = "field-label";
			label.setAttribute("for", group.id);
			label.textContent = getText(group.labelKey, `${group.fallback}:`);

			let input;
			if (group.tag === "textarea") {
				input = documentRef.createElement("textarea");
				input.className = "field-textarea";
				input.rows = group.rows;
			} else {
				input = documentRef.createElement("input");
				input.className = "field-input";
				input.type = "text";
			}
			input.id = group.id;

			wrapperElem.appendChild(label);
			wrapperElem.appendChild(input);

			fieldContainer.appendChild(wrapperElem);
		}

		emptyNotice.hidden = true;
	}

	/**
	 * 根据配置动态渲染字段。
	 * @param {Array<string>} fieldNames - 要渲染的字段名称列表。
	 */
	function renderDynamicFields(fieldNames) {
		if (!fieldContainer) {
			return;
		}
		fieldContainer.innerHTML = "";
		currentFieldMode = "dynamic";

		if (!Array.isArray(fieldNames) || fieldNames.length === 0) {
			emptyNotice.hidden = false;
			emptyNotice.textContent = getText(
				"popup_dynamic_fields_missing",
				"当前未配置可填充的字段，请先在选项页完成字段配置。",
			);
			return;
		}

		emptyNotice.hidden = true;

		const placeholder = getText(
			"popup_dynamic_field_placeholder",
			"AI将自动填充此字段...",
		);

		fieldNames.forEach((fieldName, index) => {
			const group = documentRef.createElement("div");
			group.className = "field-group";

			const label = documentRef.createElement("label");
			label.className = "field-label";
			const inputId = `field-${index}`;
			label.setAttribute("for", inputId);
			label.textContent = `${fieldName}:`;

			const textarea = documentRef.createElement("textarea");
			textarea.className = "field-textarea";
			textarea.id = inputId;
			textarea.rows = 3;
			textarea.placeholder = placeholder;
			textarea.setAttribute("data-field-name", fieldName);

			textarea.addEventListener("input", () => autoResize(textarea));
			queueMicrotask(() => autoResize(textarea));

			group.appendChild(label);
			group.appendChild(textarea);
			fieldContainer.appendChild(group);
		});
	}

	/**
	 * 自动调整文本区域的高度以适应其内容。
	 * @param {HTMLTextAreaElement} textarea - 文本区域元素。
	 */
	function autoResize(textarea) {
		if (!textarea) {
			return;
		}
		textarea.style.height = "auto";
		const next = Math.min(textarea.scrollHeight, PANEL_MAX_HEIGHT - 80);
		textarea.style.height = `${next}px`;
	}

	/**
	 * 将焦点设置到面板中的第一个输入字段。
	 */
	function focusFirstField() {
		if (!fieldContainer) {
			return;
		}
		const selector =
			currentFieldMode === "legacy"
				? "#front-input, #back-input"
				: "textarea, input";
		const firstField = fieldContainer.querySelector(selector);
		if (firstField && typeof firstField.focus === "function") {
			firstField.focus();
		} else if (panel) {
			panel.focus();
		}
	}

	/**
	 * 显示悬浮面板。
	 * @param {object} selection - 用户选择的文本信息，包含位置矩形。
	 */
	function show(selection) {
		ensureDom();
		if (!host || !wrapper || !panel) {
			return;
		}

		currentSelection = selection ?? null;

		host.style.display = "block";
		host.style.pointerEvents = "auto";
		wrapper.dataset.visible = "true";
		visible = true;

		// 为了防止打开面板的点击事件传播到全局监听器，
		// 将监听器的绑定延迟到下一个微任务。
		windowRef.setTimeout(() => {
			if (visible) {
				bindGlobalListeners();
			}
		}, 0);

		updatePosition(selection?.rect);
		panel.focus();
	}

	/**
	 * 隐藏悬浮面板。
	 * @param {boolean} immediate - 是否立即隐藏，无动画效果。
	 */
	function hide(immediate = false) {
		// 如果面板被固定，不执行隐藏操作
		if (isPinned) {
			return;
		}
		if (!host || !wrapper) {
			return;
		}
		wrapper.dataset.visible = "false";
		host.style.pointerEvents = "none";
		if (immediate) {
			host.style.display = "none";
		} else {
			// 等待动画结束后再隐藏host，以避免闪烁
			windowRef.setTimeout(() => {
				if (!visible) {
					host.style.display = "none";
				}
			}, 160);
		}
		visible = false;
		currentSelection = null;
		setStatus(STATE_IDLE);
		if (writeButton) {
			writeButton.disabled = true;
		}
		writeSuccess = false; // 重置写入成功标记
		unbindGlobalListeners();
	}

	/**
	 * 强制隐藏悬浮面板，忽略固定状态。
	 * @param {boolean} immediate - 是否立即隐藏，无动画效果。
	 */
	function forceHide(immediate = false) {
		// 取消固定状态并关闭面板
		// 不需要恢复固定状态，因为面板已关闭，固定状态应该重置
		if (isPinned) {
			isPinned = false;
			// 更新固定按钮的UI状态
			if (pinButton) {
				pinButton.dataset.pinned = "false";
				pinButton.setAttribute(
					"aria-label",
					getText("floating_panel_pin_label", "固定面板"),
				);
			}
		}
		hide(immediate);
	}

	/**
	 * 销毁面板和控制器，清理所有DOM和事件监听器。
	 */
	function destroy() {
		if (destroyed) {
			return;
		}
		destroyed = true;
		unbindGlobalListeners();
		if (shadowRoot) {
			shadowRoot.removeEventListener("keydown", handleKeyDown, true);
		}
		if (panel) {
			panel.removeEventListener("mousedown", handlePanelMouseDown);
		}
		// 清理拖动监听器（如果存在）
		documentRef.removeEventListener("mousemove", handlePanelMouseMove, true);
		documentRef.removeEventListener("mouseup", handlePanelMouseUp, true);
		if (host?.isConnected) {
			host.remove();
		}
		// 清理所有引用
		host = null;
		shadowRoot = null;
		wrapper = null;
		panel = null;
		statusLabel = null;
		statusIcon = null;
		fieldContainer = null;
		emptyNotice = null;
		actionContainer = null;
		retryButton = null;
		pinButton = null;
		currentState = STATE_IDLE;
		visible = false;
		currentSelection = null;
		isPinned = false;
		isDragging = false;
	}

	/**
	 * 显示加载状态的面板。
	 * @param {object} selection - 用户选择信息。
	 * @param {object} options - 状态选项。
	 */
	function showLoading(selection, options = {}) {
		// 重置写入成功标记，因为开始新的操作
		writeSuccess = false;
		// 如果面板已经可见，只更新状态，不重置位置
		// 这样可以保持用户拖动后的位置
		if (visible) {
			setStatus(STATE_LOADING, options);
			if (writeButton) {
				writeButton.disabled = true;
			}
		} else {
			// 面板不可见时，需要先显示面板
			show(selection);
			setStatus(STATE_LOADING, options);
			if (writeButton) {
				writeButton.disabled = true;
			}
		}
	}

	/**
	 * 显示准备就绪状态的面板。
	 * @param {object} options - 状态选项。
	 */
	function showReady(options = {}) {
		if (!visible) {
			return;
		}
		setStatus(STATE_READY, options);
		if (writeButton) {
			writeButton.disabled = false;
		}
		focusFirstField();
	}

	/**
	 * 标记为写入成功状态，此时点击面板外部会自动关闭（忽略固定状态）。
	 */
	function markWriteSuccess() {
		writeSuccess = true;
		// 如果面板被固定，监听器可能已被解绑，需要强制重新绑定
		if (isPinned && !listenersBound) {
			// 直接绑定监听器，因为我们需要在写入成功后监听点击外部事件
			windowRef.addEventListener("scroll", handleViewportChange, true);
			windowRef.addEventListener("resize", handleViewportChange, true);
			documentRef.addEventListener("pointerdown", handlePointerDown, true);
			listenersBound = true;
		} else {
			// 正常情况下，使用标准的绑定函数
			bindGlobalListeners();
		}
	}

	/**
	 * 显示错误状态的面板。
	 * @param {object} options - 状态选项，如错误消息和是否允许重试。
	 */
	function showError(options = {}) {
		if (!visible) {
			return;
		}
		setStatus(STATE_ERROR, {
			message: options.message,
			allowRetry: Boolean(options.allowRetry),
		});
	}

	/**
	 * 根据提供的配置渲染字段布局。
	 * @param {object} config - 应用配置对象。
	 * @returns {{mode: string, hasFields: boolean, message: string|null}} - 渲染结果。
	 */
	function renderFieldsFromConfig(config) {
		ensureDom();
		currentConfig = config ?? null;
		// Update Template Select
		// Need re-query the select element because it is created inside createFloatingPanelController closure but not exposed globally,
		// but 'panel' variable is available in closure scope.
		const templateSelect = panel.querySelector(".panel-template-select");
		const title = panel.querySelector(".panel-title");

		if (templateSelect) {
			const templates = listTemplates(config);
			if (templates && templates.length > 0) {
				templateSelect.innerHTML = "";
				templates.forEach((t) => {
					// Use documentRef from closure scope (it is available)
					// BUT createFloatingPanelController has documentRef.
					// renderFieldsFromConfig is inside createFloatingPanelController closure.
					const opt = documentRef.createElement("option");
					opt.value = t.id;
					opt.textContent = t.name;
					templateSelect.appendChild(opt);
				});
				const active = getActiveTemplate(config);
				if (active) {
					templateSelect.value = active.id;
				}
				templateSelect.style.display = "block";
				if (title) title.style.display = "none";
			} else {
				templateSelect.style.display = "none";
				if (title) title.style.display = "block";
			}
		}

		let reasonMessage = null;
		let result = {
			mode: "legacy",
			hasFields: false,
			message: null,
		};
		try {
			const layout = buildFieldLayout(config ?? {});
			if (layout.mode === "legacy") {
				renderLegacyFields();
				result = {
					mode: layout.mode,
					hasFields: true,
					message: null,
				};
			} else if (layout.mode === "dynamic" && layout.fields.length > 0) {
				renderDynamicFields(layout.fields);
				result = {
					mode: layout.mode,
					hasFields: true,
					message: null,
				};
			} else {
				currentFieldMode = "dynamic";
				fieldContainer.innerHTML = "";
				emptyNotice.hidden = false;
				reasonMessage = getText(
					"popup_dynamic_fields_missing",
					"当前未配置可填充的字段，请先在选项页完成字段配置。",
				);
				emptyNotice.textContent = reasonMessage;
				result = {
					mode: layout.mode ?? "dynamic",
					hasFields: false,
					message: reasonMessage,
				};
			}
		} catch (error) {
			console.error(`${LOG_PREFIX} 渲染字段时发生错误。`, error);
			currentFieldMode = "dynamic";
			fieldContainer.innerHTML = "";
			emptyNotice.hidden = false;
			reasonMessage = getText(
				"popup_error_field_generic",
				"字段渲染时出现问题，请检查配置。",
			);
			emptyNotice.textContent = reasonMessage;
			result = {
				mode: "dynamic",
				hasFields: false,
				message: reasonMessage,
			};
		}
		// 字段渲染后更新国际化文本
		updateLocalization();
		return result;
	}

	/**
	 * 将AI解析出的值填充到对应的字段输入框中。
	 * @param {object} values - 包含字段名和值的对象。
	 */
	function applyFieldValues(values) {
		if (!values || typeof values !== "object") {
			return;
		}
		if (!fieldContainer) {
			return;
		}

		if (currentFieldMode === "legacy") {
			const frontValue = values.Front ?? values.front ?? "";
			const backValue = values.Back ?? values.back ?? "";
			const frontElem = shadowRoot.getElementById("front-input");
			const backElem = shadowRoot.getElementById("back-input");
			if (frontElem) {
				frontElem.value = String(frontValue ?? "");
			}
			if (backElem) {
				backElem.value = String(backValue ?? "");
			}
			return;
		}

		const entries = Object.entries(values);
		for (const [fieldName, value] of entries) {
			const escaped =
				typeof CSS !== "undefined" && typeof CSS.escape === "function"
					? CSS.escape(fieldName)
					: String(fieldName).replace(/[^a-zA-Z0-9_-]/g, "_");
			const target = fieldContainer.querySelector(
				`[data-field-name="${escaped}"]`,
			);
			if (target) {
				target.value = String(value ?? "");
				autoResize(target);
			}
		}
	}

	/**
	 * 当用户选择的文本发生变化时，更新面板状态或位置。
	 * @param {object} selection - 新的用户选择信息。
	 */
	function patchSelection(selection) {
		if (!selection) {
			hide(true);
			return;
		}
		if (!visible) {
			return;
		}
		const previousSignature = currentSelection?.signature;
		currentSelection = selection;

		// 当面板处于加载或就绪状态时，选择范围的改变不应关闭面板，
		// 以防止用户在选择文本时面板消失。
		const isWorkingState =
			currentState === STATE_LOADING || currentState === STATE_READY;
		if (
			!isWorkingState &&
			previousSignature &&
			selection.signature &&
			previousSignature !== selection.signature
		) {
			hide(true);
			return;
		}

		if (!selection.rect) {
			hide(true);
			return;
		}
		updatePosition(selection.rect);
	}

	/**
	 * 设置重试操作的回调函数。
	 * @param {Function} handler - 回调函数。
	 */
	function setRetryHandler(handler) {
		if (handler && typeof handler !== "function") {
			throw new TypeError("retry handler must be a function");
		}
		retryHandler = handler ?? null;
	}

	/**
	 * 设置面板关闭的回调函数。
	 * @param {Function} handler - 回调函数。
	 */
	function setCloseHandler(handler) {
		if (handler && typeof handler !== "function") {
			throw new TypeError("close handler must be a function");
		}
		closeHandler = handler ?? null;
	}

	/**
	 * 设置写入Anki操作的回调函数。
	 * @param {Function} handler - 回调函数。
	 */
	function setWriteHandler(handler) {
		if (handler && typeof handler !== "function") {
			throw new TypeError("write handler must be a function");
		}
		writeHandler = handler ?? null;
	}

	/**
	 * 收集面板中所有字段的当前值。
	 * @returns {{fields: object, collectedFields: Array<string>, emptyFields: Array<string>, mode: string}} - 收集到的字段数据。
	 */
	function collectFields() {
		const fields = {};
		const collectedFields = [];
		const emptyFields = [];

		if (!fieldContainer || !shadowRoot) {
			throw new Error("字段容器未初始化。");
		}

		if (currentFieldMode === "legacy") {
			// 传统模式：正面和背面
			const frontElem = shadowRoot.getElementById("front-input");
			const backElem = shadowRoot.getElementById("back-input");

			const modelFields = currentConfig?.ankiConfig?.modelFields;
			const frontFieldName = (modelFields && modelFields[0]) || "Front";
			const backFieldName = (modelFields && modelFields[1]) || "Back";

			const frontValue = frontElem?.value?.trim() || "";
			const backValue = backElem?.value?.trim() || "";

			fields[frontFieldName] = frontElem?.value || "";
			fields[backFieldName] = backElem?.value || "";

			if (frontValue) {
				collectedFields.push(frontFieldName);
			} else {
				emptyFields.push(frontFieldName);
			}

			if (backValue) {
				collectedFields.push(backFieldName);
			} else {
				emptyFields.push(backFieldName);
			}
		} else {
			// 动态模式
			const textareas = fieldContainer.querySelectorAll(
				"textarea[data-field-name]",
			);
			textareas.forEach((textarea) => {
				const fieldName = textarea.getAttribute("data-field-name");
				if (!fieldName) return;

				const value = textarea.value?.trim() || "";
				fields[fieldName] = textarea.value || "";

				if (value) {
					collectedFields.push(fieldName);
				} else {
					emptyFields.push(fieldName);
				}
			});
		}

		return {
			fields,
			collectedFields,
			emptyFields,
			mode: currentFieldMode,
		};
	}

	/**
	 * 获取Shadow DOM的根节点，用于外部访问。
	 * @returns {ShadowRoot} - Shadow DOM根节点。
	 */
	function getFieldRoot() {
		return shadowRoot;
	}

	/**
	 * 更新面板UI上的所有国际化（i18n）文本。
	 */
	function updateLocalization() {
		if (!shadowRoot) {
			return;
		}

		// 更新面板标题
		const titleElement = shadowRoot.querySelector(".panel-title");
		if (titleElement) {
			titleElement.textContent = getText(
				"popup_app_title",
				"Anki Word Assistant",
			);
		}

		// 更新固定按钮的aria-label
		if (pinButton) {
			pinButton.setAttribute(
				"aria-label",
				isPinned
					? getText("floating_panel_unpin_label", "取消固定面板")
					: getText("floating_panel_pin_label", "固定面板"),
			);
		}

		// 更新关闭按钮的aria-label
		const closeButton = shadowRoot.querySelector(".panel-close");
		if (closeButton) {
			closeButton.setAttribute(
				"aria-label",
				getText("floating_panel_close_label", "关闭面板"),
			);
		}

		// 更新重试按钮的文本
		if (retryButton) {
			retryButton.textContent = getText("floating_panel_retry_label", "重试");
		}

		// 更新写入按钮的文本
		if (writeButton) {
			writeButton.textContent = getText(
				"floating_panel_write_label",
				"写入Anki",
			);
		}

		// 更新空字段提示消息
		if (emptyNotice) {
			emptyNotice.textContent = getText(
				"popup_dynamic_fields_missing",
				"当前未配置可填充的字段，请先在选项页完成字段配置。",
			);
		}

		// 更新传统模式的字段标签
		if (currentFieldMode === "legacy" && fieldContainer) {
			const frontLabel = fieldContainer.querySelector(
				'label[for="front-input"]',
			);
			if (frontLabel) {
				frontLabel.textContent = getText("cardFront", "正面:");
			}
			const backLabel = fieldContainer.querySelector('label[for="back-input"]');
			if (backLabel) {
				backLabel.textContent = getText("cardBack", "背面:");
			}
		}

		// 更新动态模式的占位符文本
		if (currentFieldMode === "dynamic" && fieldContainer) {
			const placeholder = getText(
				"popup_dynamic_field_placeholder",
				"AI将自动填充此字段...",
			);
			const textareas = fieldContainer.querySelectorAll(".field-textarea");
			textareas.forEach((textarea) => {
				textarea.placeholder = placeholder;
			});
		}

		// 根据当前状态更新状态消息
		if (currentState !== STATE_IDLE) {
			setStatus(currentState);
		}
	}

	/**
	 * 获取用于调试的当前面板状态信息。
	 * @returns {object} - 调试状态对象。
	 */
	function getDebugState() {
		return {
			visible,
			currentState,
			currentFieldMode,
			fieldCount: fieldContainer?.children?.length ?? 0,
			hasEmptyNotice: emptyNotice ? !emptyNotice.hidden : false,
		};
	}

	/**
	 * 获取当前面板是否被固定。
	 * @returns {boolean} - 面板是否被固定。
	 */
	function getIsPinned() {
		return isPinned;
	}

	// 返回公共API
	return {
		showLoading,
		showReady,
		showError,
		renderFieldsFromConfig,
		applyFieldValues,
		patchSelection,
		hide,
		destroy,
		setRetryHandler,
		setCloseHandler,
		setWriteHandler,
		collectFields,
		getFieldRoot,
		getDebugState,
		updateLocalization,
		markWriteSuccess,
		isPinned: getIsPinned,
		get config() {
			return currentConfig;
		},
	};
}
