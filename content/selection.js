// selection.js - 用于处理文本选择状态的工具函数集合。

// 定义节点类型常量，以兼容在某些环境中（如 Node.js）可能未定义 Node 对象的情况。
const ELEMENT_NODE = typeof Node === "undefined" ? 1 : Node.ELEMENT_NODE; // 元素节点
const TEXT_NODE = typeof Node === "undefined" ? 3 : Node.TEXT_NODE; // 文本节点
// 定义不支持文本选择的 HTML 标签集合。
const UNSUPPORTED_TAGS = new Set(["INPUT", "TEXTAREA"]);

/**
 * 将 DOM 节点解析为其有效的父元素。
 * @param {Node} node - 需要解析的 DOM 节点。
 * @returns {Element|null} 如果是元素节点，则返回自身；如果是文本节点，则返回其父元素；否则返回 null。
 */
function resolveElement(node) {
  if (!node) {
    return null;
  }
  if (node.nodeType === ELEMENT_NODE) {
    return node;
  }
  if (node.nodeType === TEXT_NODE) {
    return node.parentElement ?? null;
  }
  return node.ownerDocument?.body ?? null;
}

/**
 * 检查一个元素是否是可编辑的。
 * @param {Element} element - 需要检查的元素。
 * @returns {boolean} 如果元素是可编辑的，则返回 true。
 */
function isContentEditable(element) {
  if (!element) {
    return false;
  }
  if (typeof element.isContentEditable === "boolean") {
    return element.isContentEditable;
  }
  const attr = element.getAttribute?.("contenteditable");
  return attr != null && attr.toLowerCase() !== "false";
}

/**
 * 检查一个元素是否是不支持的类型（如输入框、文本域或可编辑元素）。
 * @param {Element} element - 需要检查的元素。
 * @returns {boolean} 如果元素是不支持的类型，则返回 true。
 */
function isUnsupportedElement(element) {
  if (!element) {
    return false;
  }
  const tagName = element.tagName;
  if (UNSUPPORTED_TAGS.has(tagName)) {
    return true;
  }
  if (isContentEditable(element)) {
    return true;
  }
  return false;
}

/**
 * 检查一个元素是否位于浮动助手面板内部。
 * @param {Element} element - 需要检查的元素。
 * @returns {boolean} 如果元素在浮动助手内部，则返回 true。
 */
function isInsideFloatingAssistant(element) {
  if (!element) {
    return false;
  }

  let current = element;
  while (current) {
    // 检查是否为浮动助手面板的宿主元素
    if (current.id === "anki-floating-assistant-panel-host" ||
        current.id === "anki-floating-assistant-host") {
      return true;
    }

    // 检查 Shadow Root
    if (typeof current.getRootNode === "function") {
      const root = current.getRootNode();
      if (root !== document && root.host) {
        const hostId = root.host.id;
        if (hostId && hostId.includes("anki-floating-assistant")) {
          return true;
        }
      }
    }

    current = current.parentElement;
  }

  return false;
}

/**
 * 根据选择范围（Range）构建一个包含位置和尺寸信息的矩形对象。
 * @param {Range} range - 文本选择的范围。
 * @returns {object|null} 返回一个 ClientRect 对象，如果范围无效则返回 null。
 */
function buildClientRect(range) {
  if (!range?.getBoundingClientRect) {
    return null;
  }
  const rect = range.getBoundingClientRect();
  if (!rect || Number.isNaN(rect.x) || Number.isNaN(rect.y)) {
    return null;
  }
  return {
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
    top: rect.top,
    right: rect.right,
    bottom: rect.bottom,
    left: rect.left,
  };
}

/**
 * 为一次文本选择创建一个唯一的签名。
 * 用于防止对完全相同的选择内容和位置重复触发回调。
 * @param {string} text - 选择的文本。
 * @param {string} anchorTag - 选择范围起始节点的标签名。
 * @param {string} focusTag - 选择范围结束节点的标签名。
 * @param {object} rect - 选择范围的矩形信息。
 * @returns {string} 生成的签名字符串。
 */
function createSignature(text, anchorTag, focusTag, rect) {
  const rectPart = rect ? `${Math.round(rect.x)}:${Math.round(rect.y)}:${Math.round(rect.width)}:${Math.round(rect.height)}` : "0:0:0:0";
  return `${text}::${anchorTag ?? "?"}::${focusTag ?? "?"}::${rectPart}`;
}

/**
 * 评估当前的文本选择（Selection）对象。
 * @param {Selection} selection - 浏览器的 Selection 对象。
 * @returns {object} 返回一个描述选择状态的对象。
 * 'kind' 字段可以是 'empty', 'ignored-floating-panel', 'unsupported-input', 或 'valid'。
 */
export function evaluateSelection(selection) {
  if (!selection || typeof selection.toString !== "function") {
    return { kind: "empty" };
  }

  const rawText = selection.toString();
  const text = rawText.trim();
  if (!text) {
    return { kind: "empty" };
  }

  const anchorElement = resolveElement(selection.anchorNode);
  const focusElement = resolveElement(selection.focusNode);

  // 忽略在浮动助手面板内部的文本选择
  if (isInsideFloatingAssistant(anchorElement) || isInsideFloatingAssistant(focusElement)) {
    return {
      kind: "ignored-floating-panel",
      text,
      anchorTagName: anchorElement?.tagName ?? null,
      focusTagName: focusElement?.tagName ?? null,
    };
  }

  // 忽略在不支持的元素（如输入框）中的选择
  if (isUnsupportedElement(anchorElement) || isUnsupportedElement(focusElement)) {
    return {
      kind: "unsupported-input",
      text,
      anchorTagName: anchorElement?.tagName ?? null,
      focusTagName: focusElement?.tagName ?? null,
    };
  }

  // 如果没有有效的选择范围，也视为有效，但不包含位置信息
  if (selection.rangeCount <= 0) {
    return {
      kind: "valid",
      text,
      anchorTagName: anchorElement?.tagName ?? null,
      focusTagName: focusElement?.tagName ?? null,
      rect: null,
      signature: createSignature(text, anchorElement?.tagName, focusElement?.tagName, null),
    };
  }

  const range = selection.getRangeAt(0);
  const rect = buildClientRect(range);

  // 返回有效的选择结果
  return {
    kind: "valid",
    text,
    anchorTagName: anchorElement?.tagName ?? null,
    focusTagName: focusElement?.tagName ?? null,
    rect,
    signature: createSignature(text, anchorElement?.tagName, focusElement?.tagName, rect),
  };
}

/**
 * 创建一个选择监视器，用于监听页面上的文本选择事件。
 * @param {function} callback - 当选择状态发生变化时调用的回调函数。
 * @returns {{start: function, stop: function}} 返回一个包含 start 和 stop 方法的对象，用于控制监视器的启停。
 */
export function createSelectionMonitor(callback) {
  if (typeof callback !== "function") {
    throw new TypeError("callback must be a function");
  }

  // 定义需要监听的事件列表
  const eventTargets = [
    { target: document, type: "selectionchange" },
    { target: document, type: "mouseup" },
    { target: document, type: "keyup" },
    { target: document, type: "touchend" },
  ];

  let lastSignature = null; // 用于存储上一次有效选择的签名

  // 事件触发时执行的函数
  function emit() {
    const selection = document.getSelection
      ? document.getSelection()
      : window.getSelection
        ? window.getSelection()
        : null;
    const result = evaluateSelection(selection);

    // 如果是有效的选择，检查其签名是否与上一次相同，以避免重复触发
    if (result.kind === "valid") {
      if (result.signature === lastSignature) {
        return;
      }
      lastSignature = result.signature;
    } else {
      lastSignature = null;
    }

    callback(result);
  }

  // 开始监听
  function start() {
    eventTargets.forEach(({ target, type }) => {
      target.addEventListener(type, emit, { passive: true });
    });
  }

  // 停止监听
  function stop() {
    eventTargets.forEach(({ target, type }) => {
      target.removeEventListener(type, emit, { passive: true });
    });
    lastSignature = null;
  }

  return {
    start,
    stop,
  };
}

/**
 * 检查当前页面的 location 是否为受限制的区域（不允许运行内容脚本）。
 * @param {Location} location - window.location 对象。
 * @param {Document} documentRef - document 对象引用。
 * @returns {boolean} 如果是受限制的 location，则返回 true。
 */
export function isRestrictedLocation(location, documentRef) {
  if (!location) {
    return false;
  }
  // 检查协议是否为浏览器内部页面
  const protocol = location.protocol;
  if (["chrome:", "edge:", "about:", "devtools:", "moz-extension:", "chrome-extension:"].includes(protocol)) {
    return true;
  }

  // 检查域名是否为应用商店
  const host = location.host;
  if (host === "chrome.google.com") {
    return true;
  }

  const doc = documentRef ?? (typeof document !== "undefined" ? document : null);

  // 检查内容类型是否为 PDF
  if (doc?.contentType === "application/pdf") {
    return true;
  }

  // 通过文件扩展名检查是否为 PDF
  const extension = location.pathname?.toLowerCase();
  if (extension && extension.endsWith(".pdf")) {
    return true;
  }

  return false;
}
