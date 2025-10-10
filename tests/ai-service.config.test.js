import "./helpers/test-env.js";
import assert from "node:assert/strict";
import test from "node:test";

import { getProvidersInfo } from "../utils/ai-service.js";
import { getProviderById } from "../utils/providers.config.js";

test("getProvidersInfo mirrors provider configuration map", () => {
  const providers = getProvidersInfo();
  const ids = Object.keys(providers).sort();
  assert.deepStrictEqual(ids, ["anthropic", "google", "openai"]);

  for (const id of ids) {
    const expected = getProviderById(id);
    assert.ok(expected, `missing provider definition for ${id}`);
    assert.strictEqual(
      providers[id],
      expected,
      `getProvidersInfo should share provider reference for ${id}`,
    );
  }
});

test("provider metadata exposes compat modes and UI hints", () => {
  const providers = getProvidersInfo();

  assert.strictEqual(providers.google.compatMode, "google-generative");
  assert.strictEqual(providers.openai.ui.apiKeyPlaceholder, "sk-...");
  assert.ok(
    providers.anthropic.hostPermissions.includes("https://api.anthropic.com/*"),
  );
});
