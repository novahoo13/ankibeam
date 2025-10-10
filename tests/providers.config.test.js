import "./helpers/test-env.js";
import assert from "node:assert/strict";
import test from "node:test";

import {
  buildRequestConfig,
  getAllProviders,
  getDefaultProviderId,
  getFallbackOrder,
  getProviderById,
} from "../utils/providers.config.js";

test("getAllProviders returns known provider definitions", () => {
  const providers = getAllProviders();
  assert.strictEqual(providers.length, 3);

  const providerIds = providers.map((provider) => provider.id);
  assert.deepStrictEqual(providerIds, ["google", "openai", "anthropic"]);

  for (const provider of providers) {
    assert.ok(provider.label, `label missing for ${provider.id}`);
    assert.ok(provider.compatMode, `compatMode missing for ${provider.id}`);
    assert.ok(provider.defaultModel, `defaultModel missing for ${provider.id}`);
    assert.ok(provider.testModel, `testModel missing for ${provider.id}`);
    assert.ok(provider.api, `api config missing for ${provider.id}`);
    assert.ok(provider.api.baseUrl, `api.baseUrl missing for ${provider.id}`);
    assert.equal(
      typeof provider.api.pathBuilder,
      "function",
      `api.pathBuilder missing for ${provider.id}`,
    );
    assert.equal(
      typeof provider.api.headers,
      "function",
      `api.headers missing for ${provider.id}`,
    );
    assert.equal(
      typeof provider.api.payloadBuilder,
      "function",
      `api.payloadBuilder missing for ${provider.id}`,
    );
    assert.equal(
      typeof provider.api.responseParser,
      "function",
      `api.responseParser missing for ${provider.id}`,
    );
    assert.ok(
      provider.encryptionSalt instanceof Uint8Array,
      `encryptionSalt must be Uint8Array for ${provider.id}`,
    );
    assert.ok(
      Array.isArray(provider.hostPermissions) &&
        provider.hostPermissions.length > 0,
      `hostPermissions missing for ${provider.id}`,
    );
    assert.ok(provider.ui, `ui metadata missing for ${provider.id}`);
  }
});

test("buildRequestConfig produces canonical Google request", () => {
  const google = getProviderById("google");
  assert.ok(google);

  const context = {
    apiKey: "test-google-key",
    modelName: "gemini-2.5-flash-lite",
    prompt: "hello world",
    options: { temperature: 0.5, maxTokens: 128 },
  };

  const request = buildRequestConfig(google, context);
  assert.strictEqual(
    request.url,
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent",
  );
  assert.strictEqual(request.init.method, "POST");
  assert.strictEqual(
    request.init.headers["x-goog-api-key"],
    "test-google-key",
  );

  const body = JSON.parse(request.init.body);
  assert.strictEqual(body.contents[0].parts[0].text, "hello world");
  assert.strictEqual(body.generationConfig.temperature, 0.5);
  assert.strictEqual(body.generationConfig.maxOutputTokens, 128);
});

test("buildRequestConfig respects override base URL", () => {
  const openai = getProviderById("openai");
  assert.ok(openai);

  const context = {
    apiKey: "sk-test",
    modelName: "gpt-4o-mini",
    prompt: "ping",
    options: {},
    overrideBaseUrl: "https://proxy.example.com/v1",
  };

  const request = buildRequestConfig(openai, context);
  assert.strictEqual(
    request.url,
    "https://proxy.example.com/v1/chat/completions",
  );
  assert.strictEqual(request.init.headers.Authorization, "Bearer sk-test");
});

test("default provider metadata helpers", () => {
  assert.strictEqual(getDefaultProviderId(), "google");
  assert.deepStrictEqual(getFallbackOrder(), [
    "google",
    "openai",
    "anthropic",
  ]);

  const anthropic = getProviderById("anthropic");
  assert.ok(anthropic);
  assert.ok(
    anthropic.hostPermissions.includes("https://api.anthropic.com/*"),
  );
});
