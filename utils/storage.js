// storage.js - 配置存储管理
// 使用 chrome.storage.local API 来存储和读取配置

const CONFIG_KEY = 'ankiWordAssistantConfig';

/**
 * 保存配置到 chrome.storage.local
 * @param {object} config - 要保存的配置对象
 * @returns {Promise<void>}
 */
export async function saveConfig(config) {
  // TODO: 在保存前加密 API Key
  // const encryptedConfig = { ...config };
  // if (encryptedConfig.aiConfig?.models?.gemini?.apiKey) {
  //   encryptedConfig.aiConfig.models.gemini.apiKey = await encryptApiKey(encryptedConfig.aiConfig.models.gemini.apiKey);
  // }
  return chrome.storage.local.set({ [CONFIG_KEY]: config });
}

/**
 * 从 chrome.storage.local 加载配置
 * @returns {Promise<object|null>} - 返回配置对象，如果不存在则返回 null
 */
export async function loadConfig() {
  return new Promise((resolve) => {
    chrome.storage.local.get(CONFIG_KEY, (result) => {
      if (chrome.runtime.lastError) {
        console.error('加载配置时出错:', chrome.runtime.lastError);
        resolve(null);
      } else {
        const config = result[CONFIG_KEY];
        // TODO: 解密 API Key
        resolve(config);
      }
    });
  });
}

/**
 * (预留) 加密 API Key
 * @param {string} key - 明文 API Key
 * @returns {Promise<string>} - 加密后的字符串
 */
export async function encryptApiKey(key) {
  // 注意：在客户端进行对称加密意义有限，只能增加一点点逆向难度。
  // 这里只是一个框架，实际可能使用简单的 Base64 转换或更复杂的逻辑。
  console.warn('API Key 加密尚未实现，将以明文存储。');
  return key;
}

/**
 * (预留) 解密 API Key
 * @param {string} encryptedKey - 加密后的字符串
 * @returns {Promise<string>} - 解密后的 API Key
 */
export async function decryptApiKey(encryptedKey) {
  console.warn('API Key 解密尚未实现。');
  return encryptedKey;
}
