// storage.js - 配置存储管理
// 使用 chrome.storage.local API 来存储和读取配置

const CONFIG_KEY = 'ankiWordAssistantConfig';

// --- 加密参数 ---
// 警告: 在客户端代码中硬编码密钥和盐值本质上不是完全安全的，
// 但它提供了一层混淆，可以防止对存储的简单、非侵入式检查。
// 一个坚定的攻击者仍然可以通过检查扩展的源代码来提取这些。
const ENCRYPTION_KEY_MATERIAL = 'anki-word-assistant-secret-key'; // 用于派生密钥的密码
const SALT = new Uint8Array([
  // 随机生成的盐值
  18, 24, 193, 131, 8, 11, 20, 153, 22, 163, 3, 19, 84, 134, 103, 174,
]);
const IV_LENGTH = 12; // AES-GCM 推荐的 IV 长度

/**
 * 从固定密码和盐值派生加密密钥
 * @returns {Promise<CryptoKey>}
 */
async function getDerivedKey() {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(ENCRYPTION_KEY_MATERIAL),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: SALT,
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
}

/**
 * 加密 API Key
 * @param {string} key - 明文 API Key
 * @returns {Promise<string>} - Base64 编码的加密字符串 (IV + Ciphertext)
 */
export async function encryptApiKey(key) {
  if (!key) return null;
  const derivedKey = await getDerivedKey();
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const encoder = new TextEncoder();
  const encodedKey = encoder.encode(key);

  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv },
    derivedKey,
    encodedKey
  );

  const combined = new Uint8Array(iv.length + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), iv.length);

  // 转换为 Base64 字符串以便存储
  return btoa(String.fromCharCode.apply(null, combined));
}

/**
 * 解密 API Key
 * @param {string} encryptedBase64 - Base64 编码的加密字符串
 * @returns {Promise<string>} - 解密后的 API Key
 */
export async function decryptApiKey(encryptedBase64) {
  if (!encryptedBase64) return null;
  try {
    const derivedKey = await getDerivedKey();
    
    const combined = new Uint8Array(atob(encryptedBase64).split('').map(c => c.charCodeAt(0)));
    const iv = combined.slice(0, IV_LENGTH);
    const ciphertext = combined.slice(IV_LENGTH);

    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv },
      derivedKey,
      ciphertext
    );

    const decoder = new TextDecoder();
    return decoder.decode(decrypted);
  } catch (error) {
    console.error('API Key 解密失败:', error);
    // 如果解密失败，可能意味着数据损坏或格式陈旧。
    // 返回一个空值或原始值，以防止应用崩溃。
    return null; 
  }
}


/**
 * 保存配置到 chrome.storage.local
 * @param {object} config - 要保存的配置对象
 * @returns {Promise<void>}
 */
export async function saveConfig(config) {
  const configToSave = JSON.parse(JSON.stringify(config)); // 深拷贝以避免修改原始对象
  const apiKey = configToSave.aiConfig?.models?.gemini?.apiKey;

  if (apiKey) {
    configToSave.aiConfig.models.gemini.apiKey = await encryptApiKey(apiKey);
  }
  
  return chrome.storage.local.set({ [CONFIG_KEY]: configToSave });
}

/**
 * 从 chrome.storage.local 加载配置
 * @returns {Promise<object|null>} - 返回配置对象，如果不存在则返回 null
 */
export async function loadConfig() {
  return new Promise((resolve) => {
    chrome.storage.local.get(CONFIG_KEY, async (result) => {
      if (chrome.runtime.lastError) {
        console.error('加载配置时出错:', chrome.runtime.lastError);
        resolve(null);
        return;
      }
      
      const config = result[CONFIG_KEY];
      if (config) {
        const encryptedKey = config.aiConfig?.models?.gemini?.apiKey;
        if (encryptedKey) {
          config.aiConfig.models.gemini.apiKey = await decryptApiKey(encryptedKey);
        }
      }
      resolve(config);
    });
  });
}