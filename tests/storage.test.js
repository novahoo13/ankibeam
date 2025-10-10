import "./helpers/test-env.js";
import assert from "node:assert/strict";
import test from "node:test";

import {
  CONFIG_VERSION,
  decryptApiKey,
  encryptApiKey,
  getDefaultConfig,
  loadConfig,
  saveConfig,
} from "../utils/storage.js";
import {
  getAllProviders,
  getDefaultProviderId,
  getFallbackOrder,
  getProviderById,
} from "../utils/providers.config.js";
import { resetChromeStorage } from "./helpers/test-env.js";

function expectedDefaultApiUrl(provider) {
  switch (provider.id) {
    case "google":
      return `${provider.api.baseUrl}/models`;
    case "anthropic":
      return `${provider.api.baseUrl}/messages`;
    default:
      return provider.api.baseUrl;
  }
}

test("getDefaultConfig derives provider models from providers.config", () => {
  const defaultConfig = getDefaultConfig();
  const providers = getAllProviders();

  assert.strictEqual(defaultConfig.aiConfig.provider, getDefaultProviderId());
  assert.deepStrictEqual(
    defaultConfig.aiConfig.fallbackOrder,
    Array.from(getFallbackOrder()),
  );

  for (const provider of providers) {
    const modelState = defaultConfig.aiConfig.models[provider.id];
    assert.ok(modelState, `missing model state for ${provider.id}`);
    assert.strictEqual(
      modelState.modelName,
      provider.defaultModel ?? "",
      `unexpected default model for ${provider.id}`,
    );
    assert.strictEqual(
      modelState.apiUrl,
      expectedDefaultApiUrl(provider),
      `unexpected default apiUrl for ${provider.id}`,
    );
    assert.strictEqual(modelState.healthStatus, "unknown");
    assert.strictEqual(modelState.lastHealthCheck, null);
    assert.strictEqual(modelState.lastErrorMessage, "");
  }
});

test("saveConfig encrypts API keys and loadConfig returns decrypted state", async () => {
  resetChromeStorage();

  const config = getDefaultConfig();
  config.aiConfig.provider = "openai";
  config.aiConfig.fallbackOrder = ["anthropic"];
  config.aiConfig.models.google.apiKey = "google-secret";
  config.aiConfig.models.openai.apiKey = "openai-secret";

  await saveConfig(config);

  const stored = await chrome.storage.local.get("ankiWordAssistantConfig");
  const storedConfig = stored.ankiWordAssistantConfig;
  assert.ok(storedConfig, "config was not persisted");

  assert.strictEqual(storedConfig.version, CONFIG_VERSION);
  assert.deepStrictEqual(storedConfig.aiConfig.fallbackOrder, [
    "anthropic",
    "google",
    "openai",
  ]);

  const encryptedGoogle = storedConfig.aiConfig.models.google.apiKey;
  assert.ok(typeof encryptedGoogle === "string" && encryptedGoogle.length > 0);
  assert.notStrictEqual(encryptedGoogle, "google-secret");

  const decryptedGoogle = await decryptApiKey(encryptedGoogle, "google");
  assert.strictEqual(decryptedGoogle, "google-secret");

  const loaded = await loadConfig();
  assert.strictEqual(loaded.version, CONFIG_VERSION);
  assert.strictEqual(loaded.aiConfig.models.google.apiKey, "google-secret");
  assert.strictEqual(loaded.aiConfig.models.openai.apiKey, "openai-secret");
  assert.strictEqual(loaded.aiConfig.models.google.lastHealthCheck, null);
  assert.strictEqual(loaded.aiConfig.models.google.lastErrorMessage, "");
});

test("loadConfig migrates legacy schema and normalizes provider ids", async () => {
  resetChromeStorage();

  const legacyConfig = {
    version: "2.1",
    aiConfig: {
      provider: "gemini",
      fallbackOrder: ["gemini", "openai"],
      models: {
        gemini: {
          apiKey: await encryptApiKey("legacy-google-key", "gemini"),
          modelName: "gemini-1.5-pro",
          apiUrl: "",
          healthStatus: "healthy",
        },
        openai: {
          apiKey: await encryptApiKey("legacy-openai-key", "openai"),
          modelName: "gpt-4o",
        },
      },
    },
    promptTemplates: {
      custom: "LEGACY",
    },
  };

  await chrome.storage.local.set({
    ankiWordAssistantConfig: legacyConfig,
  });

  const migrated = await loadConfig();

  assert.strictEqual(migrated.version, CONFIG_VERSION);
  assert.strictEqual(migrated.aiConfig.provider, "google");
  assert.deepStrictEqual(migrated.aiConfig.fallbackOrder, [
    "google",
    "openai",
    "anthropic",
  ]);

  const googleState = migrated.aiConfig.models.google;
  assert.ok(googleState, "google model state missing after migration");
  assert.strictEqual(googleState.apiKey, "legacy-google-key");
  assert.strictEqual(googleState.modelName, "gemini-1.5-pro");
  assert.strictEqual(
    googleState.apiUrl,
    expectedDefaultApiUrl(getProviderById("google")),
  );
  assert.strictEqual(googleState.healthStatus, "healthy");
  assert.strictEqual(googleState.lastHealthCheck, null);
  assert.strictEqual(googleState.lastErrorMessage, "");

  const openaiState = migrated.aiConfig.models.openai;
  assert.strictEqual(openaiState.apiKey, "legacy-openai-key");
  assert.strictEqual(openaiState.lastHealthCheck, null);
  assert.strictEqual(openaiState.lastErrorMessage, "");
});
