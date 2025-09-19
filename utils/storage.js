// storage.js - 配置存储管理
// 使用 chrome.storage.local API 来存储和读取配置

const CONFIG_KEY = 'ankiWordAssistantConfig';
const CONFIG_VERSION = '2.1'; // 配置版本，用于数据迁移

// --- 加密参数 ---
// 警告: 在客户端代码中硬编码密钥和盐值本质上不是完全安全的，
// 但它提供了一层混淆，可以防止对存储的简单、非侵入式检查。
// 一个坚定的攻击者仍然可以通过检查扩展的源代码来提取这些。
const ENCRYPTION_KEY_MATERIAL = 'anki-word-assistant-secret-key'; // 用于派生密钥的密码
const PROVIDER_SALTS = {
  google: new Uint8Array([18, 24, 193, 131, 8, 11, 20, 153, 22, 163, 3, 19, 84, 134, 103, 174]),
  openai: new Uint8Array([45, 67, 89, 12, 34, 56, 78, 90, 123, 145, 167, 189, 211, 233, 255, 21]),
  anthropic: new Uint8Array([98, 76, 54, 32, 10, 87, 65, 43, 21, 99, 77, 55, 33, 11, 89, 67])
};
const IV_LENGTH = 12; // AES-GCM 推荐的 IV 长度

// 默认配置结构
const DEFAULT_CONFIG = {
  version: CONFIG_VERSION,
  aiConfig: {
    provider: 'google', // 当前启用的供应商
    models: {
      google: {
        apiKey: '',
        modelName: 'gemini-1.5-flash',
        healthStatus: 'unknown' // unknown, healthy, error
      },
      openai: {
        apiKey: '',
        modelName: 'gpt-4o',
        healthStatus: 'unknown'
      },
      anthropic: {
        apiKey: '',
        modelName: 'claude-3-5-sonnet-20241022',
        healthStatus: 'unknown'
      }
    },
    fallbackOrder: ['google', 'openai', 'anthropic']
  },
  promptTemplates: {
    custom: '',
    promptTemplatesByModel: {} // 新增：按模板存储的prompt配置
  },
  ankiConfig: {
    defaultDeck: '',
    defaultModel: '',
    modelFields: [], // 新增：用于存储当前模板的字段列表
    defaultTags: []
  },
  ui: {
    fieldDisplayMode: 'auto' // auto|legacy|dynamic
  },
  styleConfig: {
    fontSize: '14px',
    textAlign: 'left',
    lineHeight: '1.4'
  },
  language: 'zh-CN'
};

/**
 * 从固定密码和供应商特定盐值派生加密密钥
 * @param {string} provider - 供应商名称
 * @returns {Promise<CryptoKey>}
 */
async function getDerivedKey(provider = 'google') {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(ENCRYPTION_KEY_MATERIAL),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );
  
  const salt = PROVIDER_SALTS[provider] || PROVIDER_SALTS.google;
  
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt,
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
 * @param {string} provider - 供应商名称
 * @returns {Promise<string>} - Base64 编码的加密字符串 (IV + Ciphertext)
 */
export async function encryptApiKey(key, provider = 'google') {
  if (!key) return null;
  const derivedKey = await getDerivedKey(provider);
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
 * @param {string} provider - 供应商名称
 * @returns {Promise<string>} - 解密后的 API Key
 */
export async function decryptApiKey(encryptedBase64, provider = 'google') {
  if (!encryptedBase64) return null;
  try {
    const derivedKey = await getDerivedKey(provider);
    
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
    console.error(`${provider} API Key 解密失败:`, error);
    // 如果解密失败，可能意味着数据损坏或格式陈旧。
    // 返回一个空值或原始值，以防止应用崩溃。
    return null; 
  }
}


/**
 * 从旧版本配置迁移到新版本
 * @param {object} oldConfig - 旧版本配置
 * @returns {object} - 新版本配置
 */
function migrateConfig(oldConfig) {
  if (!oldConfig || oldConfig.version === CONFIG_VERSION) {
    return oldConfig;
  }

  console.log('检测到旧版本配置，开始迁移...');
  
  // 创建基于默认配置的新配置
  const newConfig = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
  
  // 迁移现有配置
  if (oldConfig.aiConfig?.models?.gemini) {
    newConfig.aiConfig.models.google = {
      ...newConfig.aiConfig.models.google,
      apiKey: oldConfig.aiConfig.models.gemini.apiKey || '',
      modelName: oldConfig.aiConfig.models.gemini.modelName || 'gemini-1.5-flash'
    };
  }
  
  // 处理v2.0到v2.1的迁移
  if (oldConfig.version === '2.0') {
    console.log('从版本2.0迁移到2.1...');
    // 保持现有配置不变，添加新字段
    if (!newConfig.ankiConfig.promptTemplatesByModel) {
      newConfig.ankiConfig.promptTemplatesByModel = {};
    }
    if (!newConfig.ui) {
      newConfig.ui = { fieldDisplayMode: 'auto' };
    }
    if (!newConfig.promptTemplates.promptTemplatesByModel) {
      newConfig.promptTemplates.promptTemplatesByModel = {};
    }
  }

  // 迁移其他配置
  if (oldConfig.promptTemplates) {
    newConfig.promptTemplates = {
      ...newConfig.promptTemplates,
      ...oldConfig.promptTemplates
    };
    // 确保新字段存在
    if (!newConfig.promptTemplates.promptTemplatesByModel) {
      newConfig.promptTemplates.promptTemplatesByModel = {};
    }
  }
  if (oldConfig.ankiConfig) {
    newConfig.ankiConfig = {
      ...newConfig.ankiConfig,
      ...oldConfig.ankiConfig
    };
    // 确保新字段存在
    if (!newConfig.ankiConfig.modelFields) {
      newConfig.ankiConfig.modelFields = [];
    }
    if (!newConfig.ankiConfig.promptTemplatesByModel) {
      newConfig.ankiConfig.promptTemplatesByModel = {};
    }
  }
  if (oldConfig.styleConfig) {
    newConfig.styleConfig = { ...oldConfig.styleConfig };
  }
  if (oldConfig.language) {
    newConfig.language = oldConfig.language;
  }
  if (oldConfig.ui) {
    newConfig.ui = { ...newConfig.ui, ...oldConfig.ui };
  }

  console.log('配置迁移完成');
  return newConfig;
}

/**
 * 保存配置到 chrome.storage.local
 * @param {object} config - 要保存的配置对象
 * @returns {Promise<void>}
 */
export async function saveConfig(config) {
  const configToSave = JSON.parse(JSON.stringify(config)); // 深拷贝以避免修改原始对象
  
  // 确保版本信息
  configToSave.version = CONFIG_VERSION;
  
  // 遍历所有供应商并加密其API Key
  if (configToSave.aiConfig && configToSave.aiConfig.models) {
    for (const provider in configToSave.aiConfig.models) {
      const apiKey = configToSave.aiConfig.models[provider]?.apiKey;
      if (apiKey) {
        configToSave.aiConfig.models[provider].apiKey = await encryptApiKey(apiKey, provider);
      }
    }
  }
  
  return chrome.storage.local.set({ [CONFIG_KEY]: configToSave });
}

/**
 * 从 chrome.storage.local 加载配置
 * @returns {Promise<object>} - 返回配置对象，如果不存在则返回默认配置
 */
export async function loadConfig() {
  return new Promise((resolve) => {
    chrome.storage.local.get(CONFIG_KEY, async (result) => {
      if (chrome.runtime.lastError) {
        console.error('加载配置时出错:', chrome.runtime.lastError);
        resolve(DEFAULT_CONFIG);
        return;
      }
      
      let config = result[CONFIG_KEY];
      
      // 如果没有配置，返回默认配置
      if (!config) {
        console.log('未找到配置，使用默认配置');
        resolve(DEFAULT_CONFIG);
        return;
      }
      
      // 检查并处理配置迁移
      config = migrateConfig(config);
      
      // 解密所有供应商的API Key
      if (config.aiConfig && config.aiConfig.models) {
        for (const provider in config.aiConfig.models) {
          const encryptedKey = config.aiConfig.models[provider]?.apiKey;
          if (encryptedKey) {
            try {
              config.aiConfig.models[provider].apiKey = await decryptApiKey(encryptedKey, provider);
            } catch (error) {
              console.warn(`解密${provider} API Key失败，将重置为空:`, error);
              config.aiConfig.models[provider].apiKey = '';
            }
          }
        }
      }
      
      resolve(config);
    });
  });
}

/**
 * 获取默认配置
 * @returns {object} - 默认配置对象的深拷贝
 */
export function getDefaultConfig() {
  return JSON.parse(JSON.stringify(DEFAULT_CONFIG));
}