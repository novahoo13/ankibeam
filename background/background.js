// background.js - Background Service Worker
// 处理来自 content script 的消息,绕过 CORS 限制

const ANKI_CONNECT_URL = 'http://127.0.0.1:8765';
const ANKI_CONNECT_VERSION = 6;

/**
 * 向 AnkiConnect 发送请求
 * @param {string} action - API action 名称
 * @param {object} [params={}] - API action 参数
 * @returns {Promise<any>} - 返回 AnkiConnect 的响应
 */
async function invokeAnkiConnect(action, params = {}) {
  const response = await fetch(ANKI_CONNECT_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ action, version: ANKI_CONNECT_VERSION, params }),
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  const data = await response.json();

  // AnkiConnect 在其响应体中报告错误
  if (data.error) {
    throw new Error(data.error);
  }

  return data;
}

/**
 * 处理来自 content script 的 AnkiConnect 请求
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // 只处理 ankiConnect 类型的消息
  if (message.type !== 'ankiConnect') {
    return false;
  }

  const { action, params } = message;

  // 执行异步操作
  (async () => {
    try {
      const result = await invokeAnkiConnect(action, params);
      sendResponse({ result: result.result, error: null });
    } catch (error) {
      sendResponse({ result: null, error: error.message });
    }
  })();

  // 返回 true 表示异步响应
  return true;
});

console.log('[background] Background service worker initialized');
