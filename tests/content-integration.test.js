// content-integration.test.js - Stage 4 統合テスト: フィールド収集とAnki書き込み準備

import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { createFloatingPanelController } from "../content/floating-panel.js";

test("collectFields returns legacy fields for two-field config", () => {
  const dom = new JSDOM("<!DOCTYPE html><html><body></body></html>");
  const { window } = dom;
  const { document } = window;

  const config = {
    ankiConfig: {
      modelFields: ["Front", "Back"],
    },
  };

  const controller = createFloatingPanelController({
    windowRef: window,
    documentRef: document,
  });

  controller.renderFieldsFromConfig(config);

  // Shadow DOMから要素を取得してデータを設定
  const shadowRoot = controller.getFieldRoot();
  const frontInput = shadowRoot.getElementById("front-input");
  const backInput = shadowRoot.getElementById("back-input");

  assert.ok(frontInput, "front-input should exist");
  assert.ok(backInput, "back-input should exist");

  frontInput.value = "Test Word";
  backInput.value = "Test Definition";

  const collected = controller.collectFields();

  assert.strictEqual(collected.mode, "legacy", "mode should be legacy");
  assert.strictEqual(collected.fields.Front, "Test Word");
  assert.strictEqual(collected.fields.Back, "Test Definition");
  assert.strictEqual(collected.collectedFields.length, 2);
  assert.strictEqual(collected.emptyFields.length, 0);

  controller.destroy();
});

test("collectFields returns dynamic fields for multi-field config", () => {
  const dom = new JSDOM("<!DOCTYPE html><html><body></body></html>");
  const { window } = dom;
  const { document } = window;

  const config = {
    ankiConfig: {
      modelFields: ["Word", "Definition", "Example", "Notes"],
    },
    promptTemplates: {
      promptTemplatesByModel: {
        TestModel: {
          selectedFields: ["Word", "Definition", "Example"],
        },
      },
    },
  };

  const controller = createFloatingPanelController({
    windowRef: window,
    documentRef: document,
  });

  controller.renderFieldsFromConfig(config);

  const shadowRoot = controller.getFieldRoot();
  const textareas = shadowRoot.querySelectorAll("textarea[data-field-name]");

  assert.strictEqual(textareas.length, 3, "should have 3 textareas");

  // 设置字段值
  textareas[0].value = "apple";
  textareas[1].value = "a fruit";
  textareas[2].value = "";  // 留空

  const collected = controller.collectFields();

  assert.strictEqual(collected.mode, "dynamic", "mode should be dynamic");
  assert.strictEqual(collected.fields.Word, "apple");
  assert.strictEqual(collected.fields.Definition, "a fruit");
  assert.strictEqual(collected.fields.Example, "");
  assert.strictEqual(collected.collectedFields.length, 2, "should have 2 filled fields");
  assert.strictEqual(collected.emptyFields.length, 1, "should have 1 empty field");

  controller.destroy();
});

test("collectFields handles empty legacy fields", () => {
  const dom = new JSDOM("<!DOCTYPE html><html><body></body></html>");
  const { window } = dom;
  const { document } = window;

  const config = {
    ankiConfig: {
      modelFields: ["Front", "Back"],
    },
  };

  const controller = createFloatingPanelController({
    windowRef: window,
    documentRef: document,
  });

  controller.renderFieldsFromConfig(config);

  const shadowRoot = controller.getFieldRoot();
  const frontInput = shadowRoot.getElementById("front-input");
  const backInput = shadowRoot.getElementById("back-input");

  // 留空
  frontInput.value = "";
  backInput.value = "";

  const collected = controller.collectFields();

  assert.strictEqual(collected.mode, "legacy");
  assert.strictEqual(collected.collectedFields.length, 0, "no filled fields");
  assert.strictEqual(collected.emptyFields.length, 2, "both fields empty");

  controller.destroy();
});

test("collectFields handles whitespace-only values as empty", () => {
  const dom = new JSDOM("<!DOCTYPE html><html><body></body></html>");
  const { window } = dom;
  const { document } = window;

  const config = {
    ankiConfig: {
      modelFields: ["Front", "Back"],
    },
  };

  const controller = createFloatingPanelController({
    windowRef: window,
    documentRef: document,
  });

  controller.renderFieldsFromConfig(config);

  const shadowRoot = controller.getFieldRoot();
  const frontInput = shadowRoot.getElementById("front-input");
  const backInput = shadowRoot.getElementById("back-input");

  frontInput.value = "   ";  // 空白のみ
  backInput.value = "Valid content";

  const collected = controller.collectFields();

  assert.strictEqual(collected.collectedFields.length, 1);
  assert.strictEqual(collected.emptyFields.length, 1);
  assert.ok(collected.emptyFields.includes("Front"));

  controller.destroy();
});
