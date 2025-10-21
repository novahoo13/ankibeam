// background.js - 后台服务工作线程
// 该文件作为 Chrome 扩展的后台服务工作线程运行。
// 主要职责是处理来自内容脚本 (content script) 的消息，特别是与 AnkiConnect 的交互，以绕过浏览器的 CORS 限制。

// 定义 AnkiConnect 服务器的默认 URL 和 API 版本。
const ANKI_CONNECT_URL = 'http://127.0.0.1:8765';
const ANKI_CONNECT_VERSION = 6;

/**
 * 向本地运行的 AnkiConnect 服务器发送请求。
 * 此函数通过 fetch API 发送 POST 请求，并处理 AnkiConnect 的响应。
 * @param {string} action - 要执行的 AnkiConnect API 动作名称（例如 'addNote', 'findNotes'）。
 * @param {object} [params={}] - 传递给 AnkiConnect API 动作的参数对象。
 * @returns {Promise<any>} - 返回一个 Promise，解析为 AnkiConnect 的响应数据，如果发生错误则拒绝。
 */
async function invokeAnkiConnect(action, params = {}) {
  // 发送 POST 请求到 AnkiConnect URL
  const response = await fetch(ANKI_CONNECT_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    // 请求体包含动作、API 版本和参数
    body: JSON.stringify({ action, version: ANKI_CONNECT_VERSION, params }),
  });

  // 检查 HTTP 响应状态，如果不是 2xx 则抛出错误
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  // 解析 JSON 响应体
  const data = await response.json();

  // AnkiConnect 在其响应体中报告业务逻辑错误
  if (data.error) {
    throw new Error(data.error);
  }

  return data;
}

/**
 * 监听来自 Chrome 扩展其他部分（如内容脚本或弹出窗口）的消息。
 * 当接收到类型为 'ankiConnect' 的消息时，它会调用 invokeAnkiConnect 函数与 AnkiConnect 交互，
 * 并将结果或错误通过 sendResponse 回传给消息发送方。
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // 只处理类型为 'ankiConnect' 的消息，忽略其他消息
  if (message.type !== 'ankiConnect') {
    return false; // 返回 false 表示此监听器不处理此消息
  }

  // 从消息中解构出 action 和 params
  const { action, params } = message;

  // 由于 invokeAnkiConnect 是异步的，需要在一个异步 IIFE (Immediately Invoked Function Expression) 中调用它
  // 并使用 sendResponse 异步地回传结果。
  (async () => {
    try {
      const result = await invokeAnkiConnect(action, params);
      // 成功时，回传 AnkiConnect 的结果
      sendResponse({ result: result.result, error: null });
    } catch (error) {
      // 失败时，回传错误信息
      sendResponse({ result: null, error: error.message });
    }
  })();

  // 返回 true 表示 sendResponse 将会被异步调用，这是 Chrome 消息传递机制的要求
  return true;
});

// 后台服务工作线程初始化完成时在控制台输出一条消息，用于调试。
console.log('[background] Background service worker initialized');
