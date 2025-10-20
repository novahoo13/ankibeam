// ankiconnect-proxy.js - Content Script 用 AnkiConnect 代理
// 通过 background service worker 发送请求以绕过 CORS 限制

/**
 * 通过 background service worker 向 AnkiConnect 发送请求
 * @param {string} action - API action 名称
 * @param {object} [params={}] - API action 参数
 * @returns {Promise<{result: any, error: string|null}>}
 */
async function invokeViaBackground(action, params = {}) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      {
        type: 'ankiConnect',
        action,
        params,
      },
      (response) => {
        // 检查是否有运行时错误
        if (chrome.runtime.lastError) {
          resolve({
            result: null,
            error: chrome.runtime.lastError.message,
          });
          return;
        }

        resolve(response);
      }
    );
  });
}

/**
 * 测试与 AnkiConnect 的连接
 * @returns {Promise<{result: string, error: null}|{result: null, error: string}>}
 */
export async function testConnection() {
  try {
    const response = await invokeViaBackground('version');
    return { result: response.result, error: response.error };
  } catch (e) {
    return { result: null, error: e.message };
  }
}

/**
 * 在 Anki 中添加一个新笔记 (卡片)
 * @param {object} noteData - 笔记数据
 * @param {string} noteData.deckName - 牌组名称
 * @param {string} noteData.modelName - 模板名称
 * @param {object} noteData.fields - 字段内容, e.g., { Front: 'word', Back: 'definition' }
 * @param {string[]} noteData.tags - 标签数组
 * @returns {Promise<{result: number, error: null}|{result: null, error: string}>} - 返回新笔记的ID或错误
 */
export async function addNote(noteData) {
  try {
    const response = await invokeViaBackground('addNote', { note: noteData });
    return { result: response.result, error: response.error };
  } catch (e) {
    return { result: null, error: e.message };
  }
}

/**
 * 获取所有牌组的名称
 * @returns {Promise<{result: string[], error: null}|{result: null, error: string}>}
 */
export async function getDeckNames() {
  try {
    const response = await invokeViaBackground('deckNames');
    return { result: response.result, error: response.error };
  } catch (e) {
    return { result: null, error: e.message };
  }
}

/**
 * 获取所有模板的名称
 * @returns {Promise<{result: string[], error: null}|{result: null, error: string}>}
 */
export async function getModelNames() {
  try {
    const response = await invokeViaBackground('modelNames');
    return { result: response.result, error: response.error };
  } catch (e) {
    return { result: null, error: e.message };
  }
}

/**
 * 获取特定模板的字段名称
 * @param {string} modelName - 模板名称
 * @returns {Promise<{result: string[], error: null}|{result: null, error: string}>}
 */
export async function getModelFieldNames(modelName) {
  try {
    const response = await invokeViaBackground('modelFieldNames', { modelName: modelName });
    return { result: response.result, error: response.error };
  } catch (e) {
    return { result: null, error: e.message };
  }
}
