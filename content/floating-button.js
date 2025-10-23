// floating-button.js - 悬浮按钮管理
// 该文件负责创建和管理页面上的悬浮按钮。
// 当用户在页面上选择文本时，会显示一个悬浮按钮，点击该按钮可以触发后续操作（如查询单词、创建Anki卡片等）。

// --- 默认常量定义 ---
const DEFAULT_BUTTON_SIZE = 20; // 按钮的默认大小（像素）
const DEFAULT_GAP = 25; // 按钮与选中文本之间的默认间距（像素）
const DEFAULT_VIEWPORT_PADDING = 8; // 按钮距离视口边缘的默认内边距（像素）
const SHOW_DELAY_MS = 900; // 延迟显示按钮的时间（毫秒），以防止在选择文本过程中闪烁

/**
 * 将一个值限制在指定的最小值和最大值之间。
 * @param {number} value 要限制的值。
 * @param {number} min 允许的最小值。
 * @param {number} max 允许的最大值。
 * @returns {number} 限制后的值。
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
 * 计算悬浮按钮的位置。
 * 它会尝试将按钮放置在选区上方，如果空间不足，则放置在下方。
 * 同时确保按钮不会超出视口范围。
 * @param {DOMRect} rect 选中文本的矩形区域（由 getBoundingClientRects 获取）。
 * @param {{width: number, height: number}} viewport 浏览器视口的尺寸。
 * @param {object} [options={}] 可选配置项。
 * @param {number} [options.buttonSize] 按钮的大小。
 * @param {number} [options.gap] 按钮与选区的间距。
 * @param {number} [options.viewportPadding] 按钮与视口边缘的间距。
 * @returns {{x: number, y: number, placement: string}} 按钮的x、y坐标和放置位置（"top" 或 "bottom"）。
 */
export function computeFloatingButtonPosition(rect, viewport, options = {}) {
  if (!rect) {
    throw new Error("rect is required");
  }
  if (!viewport) {
    throw new Error("viewport is required");
  }

  // 使用传入的选项或默认值
  const buttonSize = options.buttonSize ?? DEFAULT_BUTTON_SIZE;
  const gap = options.gap ?? DEFAULT_GAP;
  const padding = options.viewportPadding ?? DEFAULT_VIEWPORT_PADDING;

  const halfWidth = rect.width / 2;
  const centerX = rect.left + halfWidth;

  // 默认尝试放置在选区上方
  let placement = "top";
  let proposedY = rect.top - gap - buttonSize;

  // 如果上方空间不足，则尝试放置在选区下方
  if (proposedY < padding) {
    placement = "bottom";
    proposedY = rect.bottom + gap;
  }

  // 计算x坐标，使其在选区中心对齐
  let x = centerX - buttonSize / 2;
  // 确保x坐标在视口范围内
  x = clamp(x, padding, viewport.width - padding - buttonSize);

  // 确保y坐标在视口范围内
  let y = clamp(proposedY, padding, viewport.height - padding - buttonSize);

  return {
    x,
    y,
    placement,
  };
}

/**
 * 创建并返回一个悬浮按钮控制器。
 * 该控制器封装了按钮的创建、显示、隐藏、销毁和事件处理等所有逻辑。
 * @param {object} [options={}] 可选配置项。
 * @param {Window} [options.windowRef] 窗口对象的引用，默认为全局 window。
 * @param {Document} [options.documentRef] 文档对象的引用，默认为全局 document。
 * @param {number} [options.showDelay] 显示按钮的延迟时间。
 * @returns {object} 包含控制方法的对象。
 */
export function createFloatingButtonController(options = {}) {
  const windowRef = options.windowRef ?? window;
  const documentRef = options.documentRef ?? document;
  const showDelay =
    typeof options.showDelay === "number" ? options.showDelay : SHOW_DELAY_MS;

  if (!windowRef || !documentRef) {
    throw new Error("windowRef and documentRef are required");
  }

  // --- 内部状态变量 ---
  let host = null; // 承载 Shadow DOM 的宿主元素
  let shadowRoot = null; // Shadow DOM 的根节点
  let wrapper = null; // 包裹按钮的容器，用于定位和动画
  let button = null; // 按钮元素本身
  let visible = false; // 按钮当前是否可见
  let destroyed = false; // 控制器是否已被销毁
  let pendingShowTimeout = null; // 用于延迟显示的 setTimeout ID
  let currentSelection = null; // 当前关联的文本选区信息
  let triggerHandler = null; // 按钮被点击时触发的回调函数
  let listenersBound = false; // 全局事件监听器是否已绑定

  /**
   * 确保按钮相关的 DOM 元素已创建并注入页面。
   * 如果尚未创建，则进行初始化。使用 Shadow DOM 来隔离样式。
   */
  function ensureDom() {
    if (host) {
      return;
    }

    // 创建宿主元素
    host = documentRef.createElement("div");
    host.id = "anki-floating-assistant-host";
    host.style.position = "fixed";
    host.style.top = "0";
    host.style.left = "0";
    host.style.width = "0";
    host.style.height = "0";
    host.style.zIndex = "2147483647"; // 设为最大 z-index，确保在最上层
    host.style.display = "none";

    // 附加 Shadow DOM
    shadowRoot = host.attachShadow({ mode: "open" });

    // 创建样式表并注入 Shadow DOM
    const style = documentRef.createElement("style");
    style.textContent = `
:host {
  all: initial; /* 重置所有继承的样式 */
}
*, *::before, *::after {
  box-sizing: border-box;
}
.wrapper {
  position: fixed;
  top: 0;
  left: 0;
  transform: translate3d(0px, 0px, 0px);
  pointer-events: none; /* 不可见时禁用指针事件 */
  opacity: 0;
  transition: opacity 0.12s ease-out, transform 0.12s ease-out;
}
.wrapper[data-visible="true"] {
  pointer-events: auto; /* 可见时启用指针事件 */
  opacity: 1;
  transform: translate3d(0px, 0px, 0px) scale(1);
}
.floating-button {
  all: unset; /* 重置按钮默认样式 */
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

    // 创建包裹容器
    wrapper = documentRef.createElement("div");
    wrapper.className = "wrapper";
    wrapper.setAttribute("aria-hidden", "true");

    // 创建按钮
    button = documentRef.createElement("button");
    button.type = "button";
    button.className = "floating-button";
    button.setAttribute("aria-label", "Open floating assistant"); // 辅助功能标签

    // 加载SVG图标
    const iconImg = documentRef.createElement("img");
    iconImg.src = chrome.runtime.getURL("icons/ANKI.svg");
    iconImg.alt = "Anki Assistant";
    button.appendChild(iconImg);

    // 组装 DOM 结构
    wrapper.appendChild(button);
    shadowRoot.append(style, wrapper);
    documentRef.documentElement?.appendChild(host);

    // 为按钮绑定事件监听器
    button.addEventListener("click", handleButtonClick);
    button.addEventListener("keydown", handleButtonKeyDown);
  }

  /**
   * 处理按钮的点击事件。
   * @param {MouseEvent} event
   */
  function handleButtonClick(event) {
    event.preventDefault();
    event.stopPropagation();
    if (!visible || !currentSelection) {
      return;
    }
    // 如果设置了触发器回调，则调用它
    if (typeof triggerHandler === "function") {
      triggerHandler(currentSelection);
    }
  }

  /**
   * 处理按钮的键盘事件（回车和空格）。
   * @param {KeyboardEvent} event
   */
  function handleButtonKeyDown(event) {
    const { key } = event;
    if (key === "Enter" || key === " ") {
      event.preventDefault();
      handleButtonClick(event);
    }
  }

  /**
   * 绑定全局事件监听器，用于在特定条件下隐藏按钮（如滚动、调整大小、点击页面其他地方）。
   */
  function bindGlobalListeners() {
    if (listenersBound) {
      return;
    }
    windowRef.addEventListener("scroll", handleGlobalHide, true);
    windowRef.addEventListener("resize", handleGlobalHide, true);
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
    windowRef.removeEventListener("scroll", handleGlobalHide, true);
    windowRef.removeEventListener("resize", handleGlobalHide, true);
    documentRef.removeEventListener("pointerdown", handlePointerDown, true);
    listenersBound = false;
  }

  /**
   * 全局隐藏事件的处理器。
   */
  function handleGlobalHide() {
    hide(true); // 立即隐藏
  }

  /**
   * 处理页面上的指针（鼠标/触摸）按下事件。
   * 如果事件目标不是悬浮按钮本身，则隐藏按钮。
   * @param {PointerEvent} event
   */
  function handlePointerDown(event) {
    if (!host || !visible) {
      return;
    }
    // 检查事件路径是否包含按钮，以正确处理 Shadow DOM 内的点击
    const path = event.composedPath?.();
    if (path && path.includes(button)) {
      return;
    }
    // 兼容不支持 composedPath 的情况
    if (
      event.target &&
      (event.target === button || button.contains(event.target))
    ) {
      return;
    }
    hide(true); // 立即隐藏
  }

  /**
   * 安排一个延迟任务来显示按钮。
   * @param {object} selection 当前的文本选区信息。
   */
  function scheduleShow(selection) {
    clearPendingShow(); // 清除任何待处理的显示任务
    pendingShowTimeout = windowRef.setTimeout(() => {
      pendingShowTimeout = null;
      commitShow(selection); // 延迟时间到后，实际执行显示操作
    }, showDelay);
  }

  /**
   * 清除待处理的显示任务。
   */
  function clearPendingShow() {
    if (pendingShowTimeout != null) {
      windowRef.clearTimeout(pendingShowTimeout);
      pendingShowTimeout = null;
    }
  }

  /**
   * 实际执行显示按钮的操作。
   * 计算位置、更新样式并使按钮可见。
   * @param {object} selection 当前的文本选区信息。
   */
  function commitShow(selection) {
    if (destroyed) {
      return;
    }
    ensureDom(); // 确保 DOM 已准备好

    const rect = selection?.rect;
    if (!rect) {
      hide(true); // 如果没有有效的选区矩形，则隐藏
      return;
    }

    const viewport = {
      width: windowRef.innerWidth,
      height: windowRef.innerHeight,
    };

    // 计算并应用位置
    const position = computeFloatingButtonPosition(rect, viewport);
    wrapper.style.transform = `translate3d(${Math.round(
      position.x
    )}px, ${Math.round(position.y)}px, 0)`;
    wrapper.dataset.visible = "true";
    wrapper.setAttribute("aria-hidden", "false");
    host.style.display = "block";
    host.style.pointerEvents = "auto";
    visible = true;
    currentSelection = selection;
    bindGlobalListeners(); // 按钮显示后，开始监听全局事件
  }

  /**
   * 隐藏按钮。
   * @param {boolean} [immediate=false] 是否立即隐藏，跳过任何过渡效果的考虑。
   */
  function hide(immediate = false) {
    clearPendingShow(); // 清除任何待处理的显示任务
    if (!visible && !immediate) {
      return;
    }
    if (!host || !wrapper) {
      return;
    }
    // 更新样式和属性以隐藏按钮
    wrapper.dataset.visible = "false";
    wrapper.setAttribute("aria-hidden", "true");
    host.style.pointerEvents = "none";
    host.style.display = "none";
    visible = false;
    currentSelection = null;
    unbindGlobalListeners(); // 按钮隐藏后，移除全局监听器以节省资源
  }

  /**
   * 销毁控制器和所有相关的 DOM 元素及事件监听器。
   */
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
      host.remove(); // 从 DOM 中移除宿主元素
    }
    // 清理所有内部引用
    host = null;
    shadowRoot = null;
    wrapper = null;
    button = null;
    currentSelection = null;
    visible = false;
  }

  /**
   * 根据给定的文本选区信息来显示按钮。
   * 这是控制器的主要入口点之一。
   * @param {object} selection 文本选区信息，包含矩形（rect）和签名（signature）。
   */
  function showForSelection(selection) {
    if (!selection || !selection.rect) {
      hide(true); // 无效选区则隐藏
      return;
    }
    // 如果是同一个选区且按钮已可见，则只更新位置
    if (currentSelection?.signature === selection.signature && visible) {
      currentSelection = selection;
      updatePosition(selection.rect);
      return;
    }
    // 否则，安排显示新按钮
    currentSelection = selection;
    scheduleShow(selection);
  }

  /**
   * 更新按钮的位置。
   * @param {DOMRect} rect 新的选区矩形。
   */
  function updatePosition(rect) {
    if (!visible || !wrapper) {
      return;
    }
    const viewport = {
      width: windowRef.innerWidth,
      height: windowRef.innerHeight,
    };
    const position = computeFloatingButtonPosition(rect, viewport);
    wrapper.style.transform = `translate3d(${Math.round(
      position.x
    )}px, ${Math.round(position.y)}px, 0)`;
  }

  /**
   * 设置当按钮被触发（点击）时要执行的回调函数。
   * @param {function} handler 回调函数。
   */
  function setTriggerHandler(handler) {
    if (handler && typeof handler !== "function") {
      throw new TypeError("handler must be a function");
    }
    triggerHandler = handler ?? null;
  }

  /**
   * 获取当前的调试状态。
   * @returns {object} 包含内部状态的对象。
   */
  function getDebugState() {
    return {
      visible,
      currentSelection,
      destroyed,
      hasHost: Boolean(host),
    };
  }

  // 返回公共 API
  return {
    showForSelection, // 为指定选区显示按钮
    hide, // 隐藏按钮
    destroy, // 销毁控制器
    setTriggerHandler, // 设置触发回调
    updatePosition, // 更新按钮位置
    getDebugState, // 获取调试状态
  };
}
