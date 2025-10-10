// storage.js - 設定ストレージ管理

import { normalizePromptTemplateConfig } from "./prompt-engine.js";
import {
  getAllProviders,
  getDefaultProviderId,
  getFallbackOrder,
  getProviderById,
} from "./providers.config.js";

const CONFIG_KEY = "ankiWordAssistantConfig";
export const CONFIG_VERSION = "2.2";
const ENCRYPTION_KEY_MATERIAL = "anki-word-assistant-secret-key";
const IV_LENGTH = 12;

const LEGACY_PROVIDER_ID_MAP = Object.freeze({
  gemini: "google",
  claude: "anthropic",
  claude3: "anthropic",
  gpt: "openai",
});

const VALID_HEALTH_STATUSES = new Set(["unknown", "healthy", "error"]);

function buildDefaultModelState(provider) {
  return {
    apiKey: "",
    modelName: provider.defaultModel ?? "",
    apiUrl: getDefaultApiUrl(provider),
    healthStatus: "unknown",
    lastHealthCheck: null,
    lastErrorMessage: "",
  };
}

function getDefaultApiUrl(provider) {
  const base = provider.api.baseUrl;
  switch (provider.id) {
    case "google":
      return `${base}/models`;
    case "anthropic":
      return `${base}/messages`;
    default:
      return base;
  }
}

function buildDefaultConfig() {
  const providers = getAllProviders();
  const models = {};
  for (const provider of providers) {
    models[provider.id] = buildDefaultModelState(provider);
  }

  return {
    version: CONFIG_VERSION,
    aiConfig: {
      provider: getDefaultProviderId(),
      models,
      fallbackOrder: Array.from(getFallbackOrder()),
    },
    promptTemplates: {
      custom: "",
      promptTemplatesByModel: {},
    },
    ankiConfig: {
      defaultDeck: "",
      defaultModel: "",
      modelFields: [],
      defaultTags: [],
    },
    ui: {
      fieldDisplayMode: "auto",
    },
    styleConfig: {
      fontSize: "14px",
      textAlign: "left",
      lineHeight: "1.4",
    },
    language: "zh-CN",
  };
}

function normalizeProviderId(providerId) {
  if (typeof providerId !== "string") {
    return null;
  }
  const trimmed = providerId.trim().toLowerCase();
  if (!trimmed) {
    return null;
  }
  const provider = getProviderById(trimmed);
  if (provider) {
    return provider.id;
  }
  const alias = LEGACY_PROVIDER_ID_MAP[trimmed];
  if (alias) {
    const aliasedProvider = getProviderById(alias);
    if (aliasedProvider) {
      return aliasedProvider.id;
    }
  }
  return null;
}

function determineActiveProvider(rawProvider, defaultProvider) {
  const canonical = normalizeProviderId(rawProvider);
  if (canonical) {
    return canonical;
  }
  return defaultProvider ?? getDefaultProviderId();
}

function getEncryptionSalt(providerId) {
  const canonical = normalizeProviderId(providerId) ?? getDefaultProviderId();
  const provider = getProviderById(canonical);
  if (provider?.encryptionSalt instanceof Uint8Array) {
    return provider.encryptionSalt;
  }
  console.warn(
    `[storage] ${providerId ?? "unknown"} の暗号化ソルトが見つからないため、デフォルトプロバイダを使用します。`,
  );
  const fallback = getProviderById(getDefaultProviderId());
  if (fallback?.encryptionSalt instanceof Uint8Array) {
    return fallback.encryptionSalt;
  }
  return new Uint8Array(16);
}

function normalizeHealthStatus(status) {
  if (typeof status !== "string") {
    return "unknown";
  }
  const normalized = status.trim().toLowerCase();
  return VALID_HEALTH_STATUSES.has(normalized) ? normalized : "unknown";
}

function sanitizeApiUrl(rawUrl) {
  if (typeof rawUrl !== "string") {
    return null;
  }
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    return null;
  }
  return trimmed;
}

function pickLastErrorMessage(modelState) {
  if (typeof modelState.lastErrorMessage === "string") {
    return modelState.lastErrorMessage;
  }
  if (typeof modelState.healthMessage === "string") {
    return modelState.healthMessage;
  }
  return undefined;
}

function mergeModelState(baseState, rawState, provider) {
  if (!rawState || typeof rawState !== "object") {
    return { ...baseState };
  }

  const merged = { ...baseState };

  if (typeof rawState.apiKey === "string") {
    merged.apiKey = rawState.apiKey;
  }

  if (typeof rawState.modelName === "string" && rawState.modelName.trim()) {
    merged.modelName = rawState.modelName.trim();
  }

  const overrideUrl = sanitizeApiUrl(rawState.apiUrl);
  if (overrideUrl) {
    merged.apiUrl = overrideUrl;
  }

  merged.healthStatus = normalizeHealthStatus(rawState.healthStatus);

  if (rawState.lastHealthCheck === null) {
    merged.lastHealthCheck = null;
  } else if (
    typeof rawState.lastHealthCheck === "number" &&
    Number.isFinite(rawState.lastHealthCheck)
  ) {
    merged.lastHealthCheck = rawState.lastHealthCheck;
  }

  const errorMessage = pickLastErrorMessage(rawState);
  if (errorMessage !== undefined) {
    merged.lastErrorMessage = errorMessage;
  }

  return merged;
}

function normalizeFallbackOrder(order) {
  const baseOrder = Array.from(getFallbackOrder());
  const normalized = [];
  const seen = new Set();

  if (Array.isArray(order)) {
    for (const rawId of order) {
      const canonical = normalizeProviderId(rawId);
      if (!canonical) {
        continue;
      }
      if (!baseOrder.includes(canonical)) {
        continue;
      }
      if (seen.has(canonical)) {
        continue;
      }
      seen.add(canonical);
      normalized.push(canonical);
    }
  }

  for (const providerId of baseOrder) {
    if (!seen.has(providerId)) {
      seen.add(providerId);
      normalized.push(providerId);
    }
  }

  return normalized;
}

function mergeAiConfig(baseAiConfig, legacyAiConfig = {}) {
  const merged = {
    provider: determineActiveProvider(legacyAiConfig.provider, baseAiConfig.provider),
    fallbackOrder: normalizeFallbackOrder(legacyAiConfig.fallbackOrder),
    models: { ...baseAiConfig.models },
  };

  const legacyModels = legacyAiConfig.models;
  if (legacyModels && typeof legacyModels === "object") {
    for (const [rawId, rawState] of Object.entries(legacyModels)) {
      const canonical = normalizeProviderId(rawId);
      if (!canonical) {
        continue;
      }
      const provider = getProviderById(canonical);
      if (!provider) {
        continue;
      }
      const baseState = merged.models[canonical] ?? buildDefaultModelState(provider);
      merged.models[canonical] = mergeModelState(baseState, rawState, provider);
    }
  }

  for (const provider of getAllProviders()) {
    if (!merged.models[provider.id]) {
      merged.models[provider.id] = buildDefaultModelState(provider);
    }
  }

  return merged;
}

function mergePromptTemplates(baseTemplates, legacyTemplates) {
  const merged = {
    ...baseTemplates,
    ...legacyTemplates,
    promptTemplatesByModel: {
      ...(baseTemplates.promptTemplatesByModel || {}),
      ...(legacyTemplates?.promptTemplatesByModel || {}),
    },
  };

  if (typeof merged.custom !== "string") {
    merged.custom = baseTemplates.custom;
  }

  if (
    !merged.promptTemplatesByModel ||
    typeof merged.promptTemplatesByModel !== "object"
  ) {
    merged.promptTemplatesByModel = {};
  }

  return merged;
}

function mergeAnkiConfig(baseConfig, legacyConfig) {
  const merged = {
    ...baseConfig,
    ...(legacyConfig && typeof legacyConfig === "object" ? legacyConfig : {}),
  };

  if (!Array.isArray(merged.modelFields)) {
    merged.modelFields = Array.isArray(baseConfig.modelFields)
      ? [...baseConfig.modelFields]
      : [];
  }

  if (!Array.isArray(merged.defaultTags)) {
    merged.defaultTags = Array.isArray(baseConfig.defaultTags)
      ? [...baseConfig.defaultTags]
      : [];
  }

  if (
    !merged.promptTemplatesByModel ||
    typeof merged.promptTemplatesByModel !== "object"
  ) {
    merged.promptTemplatesByModel = {};
  }

  return merged;
}

function mergeStyleConfig(baseStyle, legacyStyle) {
  if (!legacyStyle || typeof legacyStyle !== "object") {
    return { ...baseStyle };
  }
  return {
    ...baseStyle,
    ...legacyStyle,
  };
}

function mergeUiConfig(baseUi, legacyUi) {
  if (!legacyUi || typeof legacyUi !== "object") {
    return { ...baseUi };
  }
  const merged = {
    ...baseUi,
    ...legacyUi,
  };
  if (typeof merged.fieldDisplayMode !== "string") {
    merged.fieldDisplayMode = baseUi.fieldDisplayMode;
  }
  return merged;
}

function mergeConfigWithDefaults(legacyConfig = {}) {
  const baseConfig = buildDefaultConfig();
  const merged = {
    ...baseConfig,
    aiConfig: mergeAiConfig(baseConfig.aiConfig, legacyConfig.aiConfig),
    promptTemplates: mergePromptTemplates(
      baseConfig.promptTemplates,
      legacyConfig.promptTemplates,
    ),
    ankiConfig: mergeAnkiConfig(baseConfig.ankiConfig, legacyConfig.ankiConfig),
    styleConfig: mergeStyleConfig(baseConfig.styleConfig, legacyConfig.styleConfig),
    ui: mergeUiConfig(baseConfig.ui, legacyConfig.ui),
    language:
      typeof legacyConfig.language === "string"
        ? legacyConfig.language
        : baseConfig.language,
  };

  for (const [key, value] of Object.entries(legacyConfig)) {
    if (key in merged) {
      continue;
    }
    merged[key] = value;
  }

  return merged;
}

function normalizePromptTemplatesStore(config) {
  if (!config) {
    return;
  }

  if (!config.promptTemplates) {
    config.promptTemplates = {
      custom: "",
      promptTemplatesByModel: {},
    };
  }

  const map = config.promptTemplates.promptTemplatesByModel;
  if (!map || typeof map !== "object") {
    config.promptTemplates.promptTemplatesByModel = {};
    return;
  }

  const normalized = {};
  Object.keys(map).forEach((modelName) => {
    normalized[modelName] = normalizePromptTemplateConfig(map[modelName]);
  });

  config.promptTemplates.promptTemplatesByModel = normalized;
}

async function getDerivedKey(providerId = getDefaultProviderId()) {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(ENCRYPTION_KEY_MATERIAL),
    { name: "PBKDF2" },
    false,
    ["deriveKey"],
  );

  const salt = getEncryptionSalt(providerId);

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations: 100000,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"],
  );
}

/**
 * 固有ソルトを用いて API キーを暗号化する。
 * @param {string} key
 * @param {string} providerId
 * @returns {Promise<string|null>}
 */
export async function encryptApiKey(key, providerId = getDefaultProviderId()) {
  if (!key) {
    return null;
  }

  const derivedKey = await getDerivedKey(providerId);
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const encoder = new TextEncoder();
  const encodedKey = encoder.encode(key);

  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    derivedKey,
    encodedKey,
  );

  const combined = new Uint8Array(iv.length + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), iv.length);

  return btoa(String.fromCharCode.apply(null, combined));
}

/**
 * 保存済みの API キーを復号する。
 * @param {string} encryptedBase64
 * @param {string} providerId
 * @returns {Promise<string|null>}
 */
export async function decryptApiKey(encryptedBase64, providerId = getDefaultProviderId()) {
  if (!encryptedBase64) {
    return null;
  }

  try {
    const derivedKey = await getDerivedKey(providerId);

    const combined = new Uint8Array(
      atob(encryptedBase64)
        .split("")
        .map((c) => c.charCodeAt(0)),
    );
    const iv = combined.slice(0, IV_LENGTH);
    const ciphertext = combined.slice(IV_LENGTH);

    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      derivedKey,
      ciphertext,
    );

    const decoder = new TextDecoder();
    return decoder.decode(decrypted);
  } catch (error) {
    console.error(`[storage] ${providerId} の API キー復号に失敗しました:`, error);
    return null;
  }
}

function migrateConfig(legacyConfig) {
  if (!legacyConfig) {
    return buildDefaultConfig();
  }

  const needsMigration = legacyConfig.version !== CONFIG_VERSION;
  if (needsMigration) {
    console.info("旧バージョンの設定を検出したため、スキーマを更新します。");
  }

  const merged = mergeConfigWithDefaults(legacyConfig);
  merged.version = CONFIG_VERSION;

  if (needsMigration) {
    console.info("設定の移行が完了しました。");
  }

  return merged;
}

async function readFromStorage(key) {
  if (!chrome?.storage?.local?.get) {
    return {};
  }

  const getter = chrome.storage.local.get.bind(chrome.storage.local);

  if (chrome.storage.local.get.length <= 1) {
    const result = getter(key);
    if (result && typeof result.then === "function") {
      return result;
    }
  }

  return new Promise((resolve, reject) => {
    try {
      getter(key, (value) => {
        const lastError = chrome.runtime?.lastError;
        if (lastError) {
          reject(new Error(lastError.message));
          return;
        }
        resolve(value);
      });
    } catch (error) {
      reject(error);
    }
  });
}

async function writeToStorage(items) {
  if (!chrome?.storage?.local?.set) {
    return;
  }

  const setter = chrome.storage.local.set.bind(chrome.storage.local);

  if (chrome.storage.local.set.length <= 1) {
    const result = setter(items);
    if (result && typeof result.then === "function") {
      await result;
      return;
    }
  }

  await new Promise((resolve, reject) => {
    try {
      setter(items, () => {
        const lastError = chrome.runtime?.lastError;
        if (lastError) {
          reject(new Error(lastError.message));
          return;
        }
        resolve();
      });
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * 設定を永続化する。
 * @param {object} config
 * @returns {Promise<void>}
 */
export async function saveConfig(config) {
  const clone = JSON.parse(JSON.stringify(config));
  const canonical = migrateConfig(clone);

  normalizePromptTemplatesStore(canonical);
  canonical.version = CONFIG_VERSION;

  if (canonical.aiConfig?.models) {
    for (const [providerId, modelState] of Object.entries(canonical.aiConfig.models)) {
      const apiKey = modelState?.apiKey;
      if (apiKey) {
        canonical.aiConfig.models[providerId].apiKey = await encryptApiKey(
          apiKey,
          providerId,
        );
      }
    }
  }

  await writeToStorage({ [CONFIG_KEY]: canonical });
}

/**
 * ストレージから設定を読み込む。
 * @returns {Promise<object>}
 */
export async function loadConfig() {
  try {
    const result = await readFromStorage(CONFIG_KEY);
    let config = result[CONFIG_KEY];

    if (!config) {
      console.info("保存済みの設定が見つからなかったため、既定値を返します。");
      return buildDefaultConfig();
    }

    const migrated = migrateConfig(config);
    normalizePromptTemplatesStore(migrated);

    if (migrated.aiConfig?.models) {
      for (const [providerId, modelState] of Object.entries(migrated.aiConfig.models)) {
        const encryptedKey = modelState?.apiKey;
        if (!encryptedKey) {
          continue;
        }

        try {
          const decrypted = await decryptApiKey(encryptedKey, providerId);
          migrated.aiConfig.models[providerId].apiKey = decrypted ?? "";
        } catch (error) {
          console.warn(
            `[storage] ${providerId} の API キー復号に失敗したため、空文字に初期化しました。`,
            error,
          );
          migrated.aiConfig.models[providerId].apiKey = "";
        }
      }
    }

    return migrated;
  } catch (error) {
    console.error("設定の読み込みでエラーが発生しました:", error);
    return buildDefaultConfig();
  }
}

/**
 * 既定設定を生成する。
 * @returns {object}
 */
export function getDefaultConfig() {
  return buildDefaultConfig();
}
