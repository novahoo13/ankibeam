import assert from "node:assert/strict";
import { after, test } from "node:test";

const messageFixtures = {
  prompt_engine_default_header:
    "# 統合プロンプト\n入力: {{INPUT_TEXT}}\nスキーマ:\n{{FIELD_SCHEMA}}\nフィールド一覧: {{AVAILABLE_FIELDS}}",
  prompt_engine_requirements_body:
    "\n\n- 出力フィールド: $1\n- JSON 形式で返してください",
  prompt_engine_schema_word: "単語",
  prompt_engine_schema_reading: "読み",
  prompt_engine_schema_meaning: "意味",
  prompt_engine_field_prompt: "$1 を入力してください",
  prompt_engine_custom_template_header:
    "$1\n-------------------------------\n追加入力: $2",
};

const originalChrome = globalThis.chrome;

globalThis.chrome = {
  i18n: {
    getMessage(key, substitutions) {
      const template = messageFixtures[key];
      if (!template) {
        return key;
      }
      if (!substitutions) {
        return template;
      }
      const values = Array.isArray(substitutions) ? substitutions : [substitutions];
      return values.reduce(
        (acc, value, index) => acc.replaceAll(`$${index + 1}`, value),
        template,
      );
    },
  },
};

const { buildIntegratedPrompt } = await import("../utils/prompt-engine.js");

after(() => {
  if (originalChrome === undefined) {
    Reflect.deleteProperty(globalThis, "chrome");
  } else {
    globalThis.chrome = originalChrome;
  }
});

const sampleFields = ["Front", "Reading", "Definition", "Extra"];

test("buildIntegratedPrompt: デフォルトテンプレートをローカライズで構築する", () => {
  const prompt = buildIntegratedPrompt("example input", sampleFields);

  assert.match(prompt, /^# 統合プロンプト/m);
  assert.match(prompt, /入力: example input/);
  assert.match(prompt, /"Front": "単語"/);
  assert.match(prompt, /"Reading": "読み"/);
  assert.match(prompt, /"Definition": "意味"/);
  assert.match(prompt, /"Extra": "Extra を入力してください"/);
  assert.match(prompt, /出力フィールド: Front, Reading, Definition, Extra/);
});

test("buildIntegratedPrompt: カスタムテンプレートでも補助文言を付加する", () => {
  const customTemplate = "## Custom Prompt Block";
  const prompt = buildIntegratedPrompt("user provided", sampleFields, customTemplate);

  assert.ok(prompt.startsWith(customTemplate));
  assert.match(prompt, /追加入力: user provided/);
});
