// selection.js - 選択状態のユーティリティ

const ELEMENT_NODE = typeof Node === "undefined" ? 1 : Node.ELEMENT_NODE;
const TEXT_NODE = typeof Node === "undefined" ? 3 : Node.TEXT_NODE;
const UNSUPPORTED_TAGS = new Set(["INPUT", "TEXTAREA"]);

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

function isInsideFloatingAssistant(element) {
  if (!element) {
    return false;
  }

  let current = element;
  while (current) {
    // フローティングアシスタントのホスト要素をチェック
    if (current.id === "anki-floating-assistant-panel-host" ||
        current.id === "anki-floating-assistant-host") {
      return true;
    }

    // Shadow Root をチェック
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

function createSignature(text, anchorTag, focusTag, rect) {
  const rectPart = rect ? `${Math.round(rect.x)}:${Math.round(rect.y)}:${Math.round(rect.width)}:${Math.round(rect.height)}` : "0:0:0:0";
  return `${text}::${anchorTag ?? "?"}::${focusTag ?? "?"}::${rectPart}`;
}

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

  // フローティングアシスタントパネル内の選択を無視
  if (isInsideFloatingAssistant(anchorElement) || isInsideFloatingAssistant(focusElement)) {
    return {
      kind: "ignored-floating-panel",
      text,
      anchorTagName: anchorElement?.tagName ?? null,
      focusTagName: focusElement?.tagName ?? null,
    };
  }

  if (isUnsupportedElement(anchorElement) || isUnsupportedElement(focusElement)) {
    return {
      kind: "unsupported-input",
      text,
      anchorTagName: anchorElement?.tagName ?? null,
      focusTagName: focusElement?.tagName ?? null,
    };
  }

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

  return {
    kind: "valid",
    text,
    anchorTagName: anchorElement?.tagName ?? null,
    focusTagName: focusElement?.tagName ?? null,
    rect,
    signature: createSignature(text, anchorElement?.tagName, focusElement?.tagName, rect),
  };
}

export function createSelectionMonitor(callback) {
  if (typeof callback !== "function") {
    throw new TypeError("callback must be a function");
  }

  const eventTargets = [
    { target: document, type: "selectionchange" },
    { target: document, type: "mouseup" },
    { target: document, type: "keyup" },
    { target: document, type: "touchend" },
  ];

  let lastSignature = null;

  function emit() {
    const selection = document.getSelection
      ? document.getSelection()
      : window.getSelection
        ? window.getSelection()
        : null;
    const result = evaluateSelection(selection);

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

  function start() {
    eventTargets.forEach(({ target, type }) => {
      target.addEventListener(type, emit, { passive: true });
    });
  }

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

export function isRestrictedLocation(location, documentRef) {
  if (!location) {
    return false;
  }
  const protocol = location.protocol;
  if (["chrome:", "edge:", "about:", "devtools:", "moz-extension:", "chrome-extension:"].includes(protocol)) {
    return true;
  }

  const host = location.host;
  if (host === "chrome.google.com") {
    return true;
  }

  const doc = documentRef ?? (typeof document !== "undefined" ? document : null);

  if (doc?.contentType === "application/pdf") {
    return true;
  }

  const extension = location.pathname?.toLowerCase();
  if (extension && extension.endsWith(".pdf")) {
    return true;
  }

  return false;
}
