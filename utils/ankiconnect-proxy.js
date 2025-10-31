/**
 * @file AnkiConnect 代理模块 (内容脚本)
 * @description 该文件为内容脚本(Content Script)提供了一个与AnkiConnect交互的代理。
 * 由于内容脚本受到CORS策略的限制，无法直接访问AnkiConnect的HTTP API (通常在localhost)，
 * 因此所有请求都通过background service worker进行转发。
 * 这种方法将网络请求的责任委托给了拥有更宽松权限的后台脚本。
 */

/**
 * 通过后台服务工作线程(background service worker)调用AnkiConnect API。
 * 这是所有AnkiConnect操作的核心通信函数。
 * @private
 * @param {string} action - 需要调用的AnkiConnect API动作名称 (例如 'deckNames', 'addNote')。
 * @param {object} [params={}] - 传递给API动作的参数。
 * @returns {Promise<{result: any, error: string|null}>} 一个Promise，解析为一个包含`result`和`error`字段的对象。
 * - 如果成功, `result` 包含API的返回数据, `error` 为 `null`。
 * - 如果失败, `result` 为 `null`, `error` 包含错误信息。
 */
async function invokeViaBackground(action, params = {}) {
  // 使用Promise封装chrome.runtime.sendMessage以支持async/await语法
  return new Promise((resolve) => {
    // 向background脚本发送消息，请求调用AnkiConnect
    chrome.runtime.sendMessage(
      {
        type: "ankiConnect", // 消息类型，用于background脚本识别
        action,
        params,
      },
      (response) => {
        // 检查在消息发送过程中是否发生了运行时错误（例如，background脚本不存在或已失效）
        if (chrome.runtime.lastError) {
          console.error(
            "AnkiConnect代理错误:",
            chrome.runtime.lastError.message
          );
          // 如果发生错误，以统一的格式返回错误信息
          resolve({
            result: null,
            error: `与后台脚本通信失败: ${chrome.runtime.lastError.message}`,
          });
          return;
        }
        // 成功接收到background脚本的响应，将其返回
        resolve(response);
      }
    );
  });
}

/**
 * 测试与AnkiConnect服务的连接状态。
 * 它通过请求AnkiConnect的版本号来验证是否可以成功通信。
 * @public
 * @returns {Promise<{result: string|null, error: string|null}>} Promise解析后，若成功，result为AnkiConnect的版本号字符串；若失败，error为错误信息。
 */
export async function testConnection() {
  try {
    // 调用 'version' 是测试AnkiConnect是否可达的标准方法
    const response = await invokeViaBackground("version");
    return { result: response.result, error: response.error };
  } catch (e) {
    // 捕获在invokeViaBackground中可能抛出的意外错误
    return { result: null, error: e.message };
  }
}

/**
 * 在Anki中添加一个新笔记（卡片）。
 * @public
 * @param {object} noteData - 描述新笔记所需数据的对象。
 * @param {string} noteData.deckName - 目标牌组的名称。
 * @param {string} noteData.modelName - 使用的模板名称。
 * @param {object} noteData.fields - 笔记的字段内容，格式为 { 字段名1: '内容1', 字段名2: '内容2' }。
 * @param {string[]} [noteData.tags] - 附加到笔记上的标签数组。
 * @returns {Promise<{result: number|null, error: string|null}>} Promise解析后，若成功，result为新创建笔记的ID；若失败，error为错误信息。
 */
export async function addNote(noteData) {
  try {
    // AnkiConnect的'addNote'动作需要一个包含'note'对象的参数
    const response = await invokeViaBackground("addNote", { note: noteData });
    if (response.error) {
      console.error("添加笔记失败:", response.error);
    }
    return { result: response.result, error: response.error };
  } catch (e) {
    console.error("添加笔记时发生意外错误:", e.message);
    return { result: null, error: e.message };
  }
}

/**
 * 获取Anki中所有牌组的名称列表。
 * @public
 * @returns {Promise<{result: string[]|null, error: string|null}>} Promise解析后，若成功，result为包含所有牌组名称的字符串数组；若失败，error为错误信息。
 */
export async function getDeckNames() {
  try {
    const response = await invokeViaBackground("deckNames");
    return { result: response.result, error: response.error };
  } catch (e) {
    return { result: null, error: e.message };
  }
}

/**
 * 获取Anki中所有模板的名称列表。
 * @public
 * @returns {Promise<{result: string[]|null, error: string|null}>} Promise解析后，若成功，result为包含所有模板名称的字符串数组；若失败，error为错误信息。
 */
export async function getModelNames() {
  try {
    const response = await invokeViaBackground("modelNames");
    return { result: response.result, error: response.error };
  } catch (e) {
    return { result: null, error: e.message };
  }
}

/**
 * 根据指定的模板名称，获取其所有字段的名称列表。
 * @public
 * @param {string} modelName - 要查询的模板的名称。
 * @returns {Promise<{result: string[]|null, error: string|null}>} Promise解析后，若成功，result为包含该模板所有字段名称的字符串数组；若失败，error为错误信息。
 */
export async function getModelFieldNames(modelName) {
  try {
    const response = await invokeViaBackground("modelFieldNames", {
      modelName: modelName,
    });
    return { result: response.result, error: response.error };
  } catch (e) {
    return { result: null, error: e.message };
  }
}
