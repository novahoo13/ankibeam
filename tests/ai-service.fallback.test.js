import "./helpers/test-env.js";
import assert from "node:assert/strict";
import test from "node:test";

import { parseTextWithFallback } from "../utils/ai-service.js";
import {
  getDefaultConfig,
  loadConfig,
  saveConfig,
} from "../utils/storage.js";
import { resetChromeStorage } from "./helpers/test-env.js";

test("parseTextWithFallback falls back to next provider and updates health", async () => {
  resetChromeStorage();

  const config = getDefaultConfig();
  config.aiConfig.provider = "google";
  config.aiConfig.models.google.apiKey = "google-key";
  config.aiConfig.models.openai.apiKey = "openai-key";
  config.aiConfig.models.anthropic.apiKey = "";

  await saveConfig(config);

  const fetchCalls = [];
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (url, init) => {
    fetchCalls.push({ url, init });

    if (fetchCalls.length <= 3) {
      return new Response(
        JSON.stringify({
          error: { message: "upstream failure" },
        }),
        {
          status: 500,
          headers: {
            "Content-Type": "application/json",
          },
        },
      );
    }

    return new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content: '{"front":"F","back":"B"}',
            },
          },
        ],
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        },
      },
    );
  };

  try {
    const result = await parseTextWithFallback("WORD", undefined, {
      sleep: () => Promise.resolve(),
    });

    assert.deepStrictEqual(result, { front: "F", back: "B" });
    assert.strictEqual(fetchCalls.length, 4);

    const googleCalls = fetchCalls.slice(0, 3);
    googleCalls.forEach((call) => {
      assert.ok(
        call.url.startsWith(
          "https://generativelanguage.googleapis.com/v1beta/models",
        ),
        "expected initial calls to target Google endpoint",
      );
    });

    const openaiCall = fetchCalls[3];
    assert.ok(
      openaiCall.url.startsWith("https://api.openai.com/v1/chat/completions"),
      "expected fallback call to use OpenAI endpoint",
    );

    const updated = await loadConfig();
    const googleState = updated.aiConfig.models.google;
    const openaiState = updated.aiConfig.models.openai;

    assert.strictEqual(googleState.healthStatus, "error");
    assert.ok(
      googleState.lastErrorMessage.includes("请求失败"),
      "google error message should mention failure",
    );
    assert.strictEqual(openaiState.healthStatus, "healthy");
    assert.strictEqual(openaiState.lastErrorMessage, "");
  } finally {
    globalThis.fetch = originalFetch;
    resetChromeStorage();
  }
});
