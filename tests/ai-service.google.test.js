import "./helpers/test-env.js";
import assert from "node:assert/strict";
import test from "node:test";

import { callProviderAPI } from "../utils/ai-service.js";

test("callProviderAPI handles Google Generative AI payload", async () => {
  const records = [];
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (url, init) => {
    records.push({ url, init });
    return new Response(
      JSON.stringify({
        candidates: [
          {
            content: {
              parts: [{ text: "Google Response" }],
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
    const result = await callProviderAPI(
      "google",
      "google-key",
      "gemini-2.5-flash-lite",
      "PROMPT",
    );

    assert.strictEqual(result, "Google Response");
    assert.strictEqual(records.length, 1);

    const [{ url, init }] = records;
    assert.strictEqual(
      url,
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent",
    );
    assert.strictEqual(init.headers["x-goog-api-key"], "google-key");

    const payload = JSON.parse(init.body);
    assert.strictEqual(payload.contents[0].parts[0].text, "PROMPT");
    assert.strictEqual(payload.generationConfig.temperature, 0.3);
    assert.strictEqual(payload.generationConfig.maxOutputTokens, 2000);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
