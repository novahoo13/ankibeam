import "./helpers/test-env.js";
import assert from "node:assert/strict";
import test from "node:test";

import { callProviderAPI } from "../utils/ai-service.js";

test("callProviderAPI constructs OpenAI compatible request", async () => {
  const records = [];
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (url, init) => {
    records.push({ url, init });
    return new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content: "Hello!",
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
      "openai",
      "sk-test",
      "gpt-4o",
      "PING",
      { temperature: 0.5 },
    );

    assert.strictEqual(result, "Hello!");
    assert.strictEqual(records.length, 1);

    const [{ url, init }] = records;
    assert.strictEqual(
      url,
      "https://api.openai.com/v1/chat/completions",
      "unexpected request url",
    );
    assert.strictEqual(init.method, "POST");
    assert.strictEqual(init.headers.Authorization, "Bearer sk-test");
    assert.strictEqual(init.headers["Content-Type"], "application/json");

    const payload = JSON.parse(init.body);
    assert.strictEqual(payload.model, "gpt-4o");
    assert.deepStrictEqual(payload.messages, [
      { role: "user", content: "PING" },
    ]);
    assert.strictEqual(payload.temperature, 0.5);
    assert.strictEqual(payload.max_tokens, 2000);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
