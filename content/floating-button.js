// floating-button.js - フローティングボタンの管理

const DEFAULT_BUTTON_SIZE = 20;
const DEFAULT_GAP = 12;
const DEFAULT_VIEWPORT_PADDING = 8;
const SHOW_DELAY_MS = 120;

function clamp(value, min, max) {
  if (value < min) {
    return min;
  }
  if (value > max) {
    return max;
  }
  return value;
}

export function computeFloatingButtonPosition(rect, viewport, options = {}) {
  if (!rect) {
    throw new Error("rect is required");
  }
  if (!viewport) {
    throw new Error("viewport is required");
  }

  const buttonSize = options.buttonSize ?? DEFAULT_BUTTON_SIZE;
  const gap = options.gap ?? DEFAULT_GAP;
  const padding = options.viewportPadding ?? DEFAULT_VIEWPORT_PADDING;

  const halfWidth = rect.width / 2;
  const centerX = rect.left + halfWidth;

  let placement = "top";
  let proposedY = rect.top - gap - buttonSize;

  if (proposedY < padding) {
    placement = "bottom";
    proposedY = rect.bottom + gap;
  }

  let x = centerX - buttonSize / 2;
  x = clamp(x, padding, viewport.width - padding - buttonSize);

  let y = clamp(proposedY, padding, viewport.height - padding - buttonSize);

  return {
    x,
    y,
    placement,
  };
}

export function createFloatingButtonController(options = {}) {
  const windowRef = options.windowRef ?? window;
  const documentRef = options.documentRef ?? document;
  const showDelay = typeof options.showDelay === "number" ? options.showDelay : SHOW_DELAY_MS;

  if (!windowRef || !documentRef) {
    throw new Error("windowRef and documentRef are required");
  }

  let host = null;
  let shadowRoot = null;
  let wrapper = null;
  let button = null;
  let visible = false;
  let destroyed = false;
  let pendingShowTimeout = null;
  let currentSelection = null;
  let triggerHandler = null;
  let listenersBound = false;

  function ensureDom() {
    if (host) {
      return;
    }

    host = documentRef.createElement("div");
    host.id = "anki-floating-assistant-host";
    host.style.position = "fixed";
    host.style.top = "0";
    host.style.left = "0";
    host.style.width = "0";
    host.style.height = "0";
    host.style.zIndex = "2147483647";
    host.style.display = "none";

    shadowRoot = host.attachShadow({ mode: "open" });

    const style = documentRef.createElement("style");
    style.textContent = `
:host {
  all: initial;
}
*, *::before, *::after {
  box-sizing: border-box;
}
.wrapper {
  position: fixed;
  top: 0;
  left: 0;
  transform: translate3d(0px, 0px, 0px);
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.12s ease-out, transform 0.12s ease-out;
}
.wrapper[data-visible="true"] {
  pointer-events: auto;
  opacity: 1;
  transform: translate3d(0px, 0px, 0px) scale(1);
}
.floating-button {
  all: unset;
  width: ${DEFAULT_BUTTON_SIZE}px;
  height: ${DEFAULT_BUTTON_SIZE}px;
  border-radius: 9999px;
  background: rgb(255 255 255 / 0.95);
  color: #fff;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  box-shadow: 0 10px 25px rgba(15, 23, 42, 0.22);
  transition: background 0.12s ease-out;
  padding: 8px;
}
.floating-button:hover {
  background: rgb(240 240 240 / 0.95);
}
.floating-button img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}
.floating-button:focus-visible {
  outline: 2px solid rgba(71, 85, 105, 0.5);
  outline-offset: 2px;
}
`;

    wrapper = documentRef.createElement("div");
    wrapper.className = "wrapper";
    wrapper.setAttribute("aria-hidden", "true");

    button = documentRef.createElement("button");
    button.type = "button";
    button.className = "floating-button";
    button.setAttribute("aria-label", "Open floating assistant");

    // SVGアイコンの読み込み
    const iconImg = documentRef.createElement("img");
    iconImg.src = chrome.runtime.getURL("icons/ANKI.svg");
    iconImg.alt = "Anki Assistant";
    button.appendChild(iconImg);

    wrapper.appendChild(button);
    shadowRoot.append(style, wrapper);
    documentRef.documentElement?.appendChild(host);

    button.addEventListener("click", handleButtonClick);
    button.addEventListener("keydown", handleButtonKeyDown);
  }

  function handleButtonClick(event) {
    event.preventDefault();
    event.stopPropagation();
    if (!visible || !currentSelection) {
      return;
    }
    if (typeof triggerHandler === "function") {
      triggerHandler(currentSelection);
    }
  }

  function handleButtonKeyDown(event) {
    const { key } = event;
    if (key === "Enter" || key === " ") {
      event.preventDefault();
      handleButtonClick(event);
    }
  }

  function bindGlobalListeners() {
    if (listenersBound) {
      return;
    }

    windowRef.addEventListener("scroll", handleGlobalHide, true);
    windowRef.addEventListener("resize", handleGlobalHide, true);
    documentRef.addEventListener("pointerdown", handlePointerDown, true);
    listenersBound = true;
  }

  function unbindGlobalListeners() {
    if (!listenersBound) {
      return;
    }
    windowRef.removeEventListener("scroll", handleGlobalHide, true);
    windowRef.removeEventListener("resize", handleGlobalHide, true);
    documentRef.removeEventListener("pointerdown", handlePointerDown, true);
    listenersBound = false;
  }

  function handleGlobalHide() {
    hide(true);
  }

  function handlePointerDown(event) {
    if (!host || !visible) {
      return;
    }
    const path = event.composedPath?.();
    if (path && path.includes(button)) {
      return;
    }
    if (event.target && (event.target === button || button.contains(event.target))) {
      return;
    }
    hide(true);
  }

  function scheduleShow(selection) {
    clearPendingShow();
    pendingShowTimeout = windowRef.setTimeout(() => {
      pendingShowTimeout = null;
      commitShow(selection);
    }, showDelay);
  }

  function clearPendingShow() {
    if (pendingShowTimeout != null) {
      windowRef.clearTimeout(pendingShowTimeout);
      pendingShowTimeout = null;
    }
  }

  function commitShow(selection) {
    if (destroyed) {
      return;
    }
    ensureDom();

    const rect = selection?.rect;
    if (!rect) {
      hide(true);
      return;
    }

    const viewport = {
      width: windowRef.innerWidth,
      height: windowRef.innerHeight,
    };

    const position = computeFloatingButtonPosition(rect, viewport);
    wrapper.style.transform = `translate3d(${Math.round(position.x)}px, ${Math.round(position.y)}px, 0)`;
    wrapper.dataset.visible = "true";
    wrapper.setAttribute("aria-hidden", "false");
    host.style.display = "block";
    host.style.pointerEvents = "auto";
    visible = true;
    currentSelection = selection;
    bindGlobalListeners();
  }

  function hide(immediate = false) {
    clearPendingShow();
    if (!visible && !immediate) {
      return;
    }
    if (!host || !wrapper) {
      return;
    }
    wrapper.dataset.visible = "false";
    wrapper.setAttribute("aria-hidden", "true");
    host.style.pointerEvents = "none";
    host.style.display = "none";
    visible = false;
    currentSelection = null;
    unbindGlobalListeners();
  }

  function destroy() {
    if (destroyed) {
      return;
    }
    destroyed = true;
    clearPendingShow();
    unbindGlobalListeners();
    if (button) {
      button.removeEventListener("click", handleButtonClick);
      button.removeEventListener("keydown", handleButtonKeyDown);
    }
    if (host?.isConnected) {
      host.remove();
    }
    host = null;
    shadowRoot = null;
    wrapper = null;
    button = null;
    currentSelection = null;
    visible = false;
  }

  function showForSelection(selection) {
    if (!selection || !selection.rect) {
      hide(true);
      return;
    }
    if (currentSelection?.signature === selection.signature && visible) {
      currentSelection = selection;
      updatePosition(selection.rect);
      return;
    }
    currentSelection = selection;
    scheduleShow(selection);
  }

  function updatePosition(rect) {
    if (!visible || !wrapper) {
      return;
    }
    const viewport = {
      width: windowRef.innerWidth,
      height: windowRef.innerHeight,
    };
    const position = computeFloatingButtonPosition(rect, viewport);
    wrapper.style.transform = `translate3d(${Math.round(position.x)}px, ${Math.round(position.y)}px, 0)`;
  }

  function setTriggerHandler(handler) {
    if (handler && typeof handler !== "function") {
      throw new TypeError("handler must be a function");
    }
    triggerHandler = handler ?? null;
  }

  function getDebugState() {
    return {
      visible,
      currentSelection,
      destroyed,
      hasHost: Boolean(host),
    };
  }

  return {
    showForSelection,
    hide,
    destroy,
    setTriggerHandler,
    updatePosition,
    getDebugState,
  };
}
