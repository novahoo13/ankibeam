// floating-panel.js - フローティング解析パネルの管理

import { translate } from "../utils/i18n.js";
import { isLegacyMode } from "../utils/field-handler.js";

const LOG_PREFIX = "[floating-assistant/panel]";

const PANEL_WIDTH = 360;
const PANEL_MAX_HEIGHT = 420;
const PANEL_GAP = 12;
const PANEL_PADDING = 8;

const STATE_IDLE = "idle";
const STATE_LOADING = "loading";
const STATE_READY = "ready";
const STATE_ERROR = "error";

const getText = (key, fallback, substitutions) =>
  translate(key, { fallback, substitutions });

function clamp(value, min, max) {
  if (value < min) {
    return min;
  }
  if (value > max) {
    return max;
  }
  return value;
}

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

function buildFieldLayout(config) {
  const legacy = isLegacyMode(config);
  const allFields = normalizeFieldList(config?.ankiConfig?.modelFields ?? []);
  if (legacy) {
    return {
      mode: "legacy",
      fields: allFields,
    };
  }
  const selected = resolveSelectedFields(config, allFields);
  return {
    mode: selected.length > 0 ? "dynamic" : "dynamic-empty",
    fields: selected,
  };
}

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

export function createFloatingPanelController(options = {}) {
  const windowRef = options.windowRef ?? window;
  const documentRef = options.documentRef ?? document;

  if (!windowRef || !documentRef) {
    throw new Error("windowRef and documentRef are required");
  }

  let host = null;
  let shadowRoot = null;
  let wrapper = null;
  let panel = null;
  let statusLabel = null;
  let statusIcon = null;
  let fieldContainer = null;
  let emptyNotice = null;
  let actionContainer = null;
  let retryButton = null;
  let currentState = STATE_IDLE;
  let visible = false;
  let destroyed = false;
  let listenersBound = false;
  let currentSelection = null;
  let currentConfig = null;
  let currentFieldMode = "legacy";
  let retryHandler = null;
  let closeHandler = null;

  function ensureDom() {
    if (host) {
      return;
    }

    host = documentRef.createElement("div");
    host.id = "anki-floating-assistant-panel-host";
    host.style.position = "fixed";
    host.style.top = "0";
    host.style.left = "0";
    host.style.width = "0";
    host.style.height = "0";
    host.style.zIndex = "2147483647";
    host.style.pointerEvents = "none";
    host.style.display = "none";

    shadowRoot = host.attachShadow({ mode: "open" });

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
  transition: opacity 0.16s ease-out, transform 0.16s ease-out;
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
    0 0 0 2px rgba(59, 130, 246, 0.2),
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
.panel-close:hover {
  background: rgba(59, 130, 246, 0.12);
  color: rgb(37, 99, 235);
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
  border: 2px solid rgba(59, 130, 246, 0.45);
  border-top-color: rgb(37, 99, 235);
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
  background: rgba(59, 130, 246, 0.35);
  border-radius: 999px;
}
.field-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
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
  border-color: rgba(59, 130, 246, 0.65);
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.18);
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
.retry-button {
  all: unset;
  padding: 8px 14px;
  font-size: 13px;
  font-weight: 500;
  border-radius: 999px;
  cursor: pointer;
  background: rgba(37, 99, 235, 0.12);
  color: rgb(37, 99, 235);
  transition: background 0.16s ease-out, color 0.16s ease-out;
}
.retry-button:hover {
  background: rgba(37, 99, 235, 0.18);
  color: rgb(29, 78, 216);
}
@media (prefers-color-scheme: dark) {
  .panel-empty {
    background: rgba(30, 41, 59, 0.65);
    color: rgba(203, 213, 225, 0.92);
    border-color: rgba(148, 163, 184, 0.55);
  }
  .retry-button {
    background: rgba(96, 165, 250, 0.18);
    color: rgb(147, 197, 253);
  }
  .retry-button:hover {
    background: rgba(96, 165, 250, 0.26);
    color: rgb(191, 219, 254);
  }
}
`;

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

    const closeButton = documentRef.createElement("button");
    closeButton.className = "panel-close";
    closeButton.type = "button";
    closeButton.setAttribute(
      "aria-label",
      getText("floating_panel_close_label", "パネルを閉じる"),
    );
    closeButton.innerHTML = `
<svg width="14" height="14" viewBox="0 0 20 20" fill="none" aria-hidden="true">
  <path d="M5 5L15 15M15 5L5 15" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
</svg>
`;
    closeButton.addEventListener("click", () => {
      hide(true);
      if (typeof closeHandler === "function") {
        closeHandler("manual");
      }
    });

    header.appendChild(title);
    header.appendChild(closeButton);

    const status = documentRef.createElement("div");
    status.className = "panel-status";
    status.dataset.state = STATE_IDLE;

    statusIcon = documentRef.createElement("div");
    statusIcon.className = "status-icon";
    statusIcon.dataset.kind = "spinner";

    statusLabel = createTextElement(
      documentRef,
      "span",
      "status-label",
      "",
    );

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
    retryButton.className = "retry-button";
    retryButton.textContent = getText("floating_panel_retry_label", "再試行");
    retryButton.hidden = true;
    retryButton.addEventListener("click", () => {
      if (typeof retryHandler === "function") {
        retryHandler(currentSelection);
      }
    });

    actionContainer.appendChild(retryButton);

    panel.appendChild(header);
    panel.appendChild(status);
    panel.appendChild(body);
    panel.appendChild(actionContainer);

    wrapper.appendChild(panel);

    shadowRoot.append(style, wrapper);

    shadowRoot.addEventListener("keydown", handleKeyDown, true);

    documentRef.documentElement?.appendChild(host);
  }

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

  function bindGlobalListeners() {
    if (listenersBound) {
      return;
    }
    windowRef.addEventListener("scroll", handleViewportChange, true);
    windowRef.addEventListener("resize", handleViewportChange, true);
    documentRef.addEventListener("pointerdown", handlePointerDown, true);
    listenersBound = true;
  }

  function unbindGlobalListeners() {
    if (!listenersBound) {
      return;
    }
    windowRef.removeEventListener("scroll", handleViewportChange, true);
    windowRef.removeEventListener("resize", handleViewportChange, true);
    documentRef.removeEventListener("pointerdown", handlePointerDown, true);
    listenersBound = false;
  }

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

  function handlePointerDown(event) {
    if (!visible) {
      return;
    }
    const path = typeof event.composedPath === "function" ? event.composedPath() : [];
    if (path.includes(host) || path.includes(panel)) {
      return;
    }
    hide(true);
    if (typeof closeHandler === "function") {
      closeHandler("outside");
    }
  }

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

    if (preferredY + size.height > viewport.height - padding) {
      const flippedY = rect.top - gap - size.height;
      y = flippedY >= padding ? flippedY : viewport.height - padding - size.height;
    }

    y = clamp(y, padding, viewport.height - padding - size.height);

    wrapper.style.transform = `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0)`;
  }

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
      statusLabel.textContent = message ?? getText("popup_status_parsing", "正在解析选中的内容...");
    } else if (nextState === STATE_READY) {
      statusIcon.dataset.kind = "success";
      statusLabel.textContent = message ?? getText("popup_status_ready_to_write", "解析完成，可以继续编辑字段。");
    } else if (nextState === STATE_ERROR) {
      statusIcon.dataset.kind = "error";
      statusLabel.textContent = message ?? getText("popup_error_generic", "解析时出现错误，请稍后重试。");
    } else {
      statusIcon.dataset.kind = "spinner";
      statusLabel.textContent = "";
    }

    if (statusLabel.parentElement) {
      statusLabel.parentElement.dataset.state = nextState;
    }
  }

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

  function autoResize(textarea) {
    if (!textarea) {
      return;
    }
    textarea.style.height = "auto";
    const next = Math.min(textarea.scrollHeight, PANEL_MAX_HEIGHT - 80);
    textarea.style.height = `${next}px`;
  }

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
    bindGlobalListeners();

    updatePosition(selection?.rect);
    panel.focus();
  }

  function hide(immediate = false) {
    if (!host || !wrapper) {
      return;
    }
    wrapper.dataset.visible = "false";
    host.style.pointerEvents = "none";
    if (immediate) {
      host.style.display = "none";
    } else {
      windowRef.setTimeout(() => {
        if (!visible) {
          host.style.display = "none";
        }
      }, 160);
    }
    visible = false;
    currentSelection = null;
    setStatus(STATE_IDLE);
    unbindGlobalListeners();
  }

  function destroy() {
    if (destroyed) {
      return;
    }
    destroyed = true;
    unbindGlobalListeners();
    if (shadowRoot) {
      shadowRoot.removeEventListener("keydown", handleKeyDown, true);
    }
    if (host?.isConnected) {
      host.remove();
    }
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
    currentState = STATE_IDLE;
    visible = false;
    currentSelection = null;
  }

  function showLoading(selection, options = {}) {
    show(selection);
    setStatus(STATE_LOADING, options);
  }

  function showReady(options = {}) {
    if (!visible) {
      return;
    }
    setStatus(STATE_READY, options);
    focusFirstField();
  }

  function showError(options = {}) {
    if (!visible) {
      return;
    }
    setStatus(STATE_ERROR, {
      message: options.message,
      allowRetry: Boolean(options.allowRetry),
    });
  }

  function renderFieldsFromConfig(config) {
    ensureDom();
    currentConfig = config ?? null;
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
      console.error(`${LOG_PREFIX} フィールド描画中にエラーが発生しました。`, error);
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
    return result;
  }

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
    if (previousSignature && selection.signature && previousSignature !== selection.signature) {
      hide(true);
      return;
    }
    if (!selection.rect) {
      hide(true);
      return;
    }
    updatePosition(selection.rect);
  }

  function setRetryHandler(handler) {
    if (handler && typeof handler !== "function") {
      throw new TypeError("retry handler must be a function");
    }
    retryHandler = handler ?? null;
  }

  function setCloseHandler(handler) {
    if (handler && typeof handler !== "function") {
      throw new TypeError("close handler must be a function");
    }
    closeHandler = handler ?? null;
  }

  function getFieldRoot() {
    return shadowRoot;
  }

  function getDebugState() {
    return {
      visible,
      currentState,
      currentFieldMode,
      fieldCount: fieldContainer?.children?.length ?? 0,
      hasEmptyNotice: emptyNotice ? !emptyNotice.hidden : false,
    };
  }

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
    getFieldRoot,
    getDebugState,
    get config() {
      return currentConfig;
    },
  };
}
