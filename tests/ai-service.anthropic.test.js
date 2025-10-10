import "./helpers/test-env.js";
import assert from "node:assert/strict";
import test from "node:test";

import { callProviderAPI } from "../utils/ai-service.js";

test("callProviderAPI supports Anthropic messages endpoint", async () => {
  const records = [];
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (url, init) => {
    records.push({ url, init });
    return new Response(
      JSON.stringify({
        content: [
          {
            text: "Anthropic Reply",
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
      "anthropic",
      "ant-key",
      "claude-3-7-sonnet-all",
      "PROMPT",
      { maxTokens: 512 },
    );

    assert.strictEqual(result, "Anthropic Reply");
    assert.strictEqual(records.length, 1);

    const [{ url, init }] = records;
    assert.strictEqual(url, "https://api.anthropic.com/v1/messages");
    assert.strictEqual(init.headers["x-api-key"], "ant-key");
    assert.strictEqual(init.headers["anthropic-version"], "2023-06-01");

    const payload = JSON.parse(init.body);
    assert.strictEqual(payload.model, "claude-3-7-sonnet-all");
    assert.strictEqual(payload.max_tokens, 512);
    assert.strictEqual(payload.messages[0].content, "PROMPT");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
