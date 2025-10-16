// floating-panel.test.js - フローティング解析パネルの検証

import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

import { createFloatingPanelController } from "../content/floating-panel.js";

function withPanelContext(html, fn) {
  const dom = new JSDOM(html, { pretendToBeVisual: true });
  const { window } = dom;

  const previousWindow = globalThis.window;
  const previousDocument = globalThis.document;
  const previousChrome = globalThis.chrome;
  const previousFetch = globalThis.fetch;

  globalThis.window = window;
  globalThis.document = window.document;
  globalThis.chrome = {
    runtime: {
      getURL: (path) => path,
    },
    i18n: {
      getUILanguage: () => "en-US",
      getMessage: () => "",
    },
  };
  globalThis.fetch = async () => ({
    ok: false,
    json: async () => ({}),
  });

  const controller = createFloatingPanelController({
    windowRef: window,
    documentRef: window.document,
  });

  return Promise.resolve()
    .then(() => fn({ window, document: window.document, controller }))
    .finally(() => {
      controller.destroy();
      dom.window.close();
      if (previousWindow === undefined) {
        delete globalThis.window;
      } else {
        globalThis.window = previousWindow;
      }
      if (previousDocument === undefined) {
        delete globalThis.document;
      } else {
        globalThis.document = previousDocument;
      }
      if (previousChrome === undefined) {
        delete globalThis.chrome;
      } else {
        globalThis.chrome = previousChrome;
      }
      if (previousFetch === undefined) {
        delete globalThis.fetch;
      } else {
        globalThis.fetch = previousFetch;
      }
    });
}

const TEST_SELECTION = {
  text: "example",
  rect: {
    top: 120,
    left: 80,
    right: 160,
    bottom: 140,
    width: 80,
    height: 20,
    x: 80,
    y: 120,
  },
  signature: "sig-test",
};

test("renderFieldsFromConfig builds legacy inputs", async () => {
  await withPanelContext("<main></main>", async ({ controller }) => {
    const layout = controller.renderFieldsFromConfig({
      ui: { enableFloatingAssistant: true },
      ankiConfig: { modelFields: ["Front", "Back"] },
    });

    assert.equal(layout.mode, "legacy");
    assert.equal(layout.hasFields, true);

    const root = controller.getFieldRoot();
    assert.ok(root, "shadow root should exist");

    const front = root.getElementById("front-input");
    const back = root.getElementById("back-input");
    assert.ok(front, "front input should be rendered");
    assert.ok(back, "back textarea should be rendered");
  });
});

test("renderFieldsFromConfig builds dynamic textareas for selected fields", async () => {
  await withPanelContext("<main></main>", async ({ controller }) => {
    const layout = controller.renderFieldsFromConfig({
      ui: { enableFloatingAssistant: true },
      ankiConfig: {
        defaultModel: "BasicPlus",
        modelFields: ["Front", "Back", "Example"],
      },
      promptTemplates: {
        promptTemplatesByModel: {
          BasicPlus: {
            selectedFields: ["Example", "Back"],
          },
        },
      },
    });

    assert.equal(layout.mode, "dynamic");
    assert.equal(layout.hasFields, true);

    const root = controller.getFieldRoot();
    const textareas = root.querySelectorAll("textarea[data-field-name]");
    assert.equal(textareas.length, 2);
    const names = Array.from(textareas).map((node) => node.getAttribute("data-field-name"));
    assert.deepEqual(names, ["Example", "Back"]);
  });
});

test("renderFieldsFromConfig signals missing fields when configuration is empty", async () => {
  await withPanelContext("<main></main>", async ({ controller }) => {
    const layout = controller.renderFieldsFromConfig({
      ui: { enableFloatingAssistant: true },
      ankiConfig: {
        defaultModel: "BasicPlus",
        modelFields: ["Front", "Back", "Example"],
      },
      promptTemplates: {
        promptTemplatesByModel: {
          BasicPlus: {
            selectedFields: ["NonExisting"],
          },
        },
      },
    });

    assert.equal(layout.hasFields, false);
    assert.equal(layout.mode, "dynamic-empty");
    const root = controller.getFieldRoot();
    const notice = root.querySelector(".panel-empty");
    assert.ok(notice, "empty notice should exist");
    assert.equal(notice.hidden, false, "empty notice should be visible");
    assert.equal(layout.message, notice.textContent);
  });
});

test("state transitions update debug flags for loading and ready", async () => {
  await withPanelContext("<main></main>", async ({ controller }) => {
    controller.renderFieldsFromConfig({
      ui: { enableFloatingAssistant: true },
      ankiConfig: { modelFields: ["Front", "Back"] },
    });

    controller.showLoading(TEST_SELECTION);
    let state = controller.getDebugState();
    assert.equal(state.visible, true);
    assert.equal(state.currentState, "loading");

    controller.showReady();
    state = controller.getDebugState();
    assert.equal(state.currentState, "ready");
  });
});

test("showError exposes retry button and invokes handler", async () => {
  await withPanelContext("<main></main>", async ({ controller, window }) => {
    controller.renderFieldsFromConfig({
      ui: { enableFloatingAssistant: true },
      ankiConfig: { modelFields: ["Front", "Back"] },
    });
    controller.showLoading(TEST_SELECTION);
    let retried = false;
    controller.setRetryHandler(() => {
      retried = true;
    });
    controller.showError({
      message: "Simulated failure",
      allowRetry: true,
    });

    const state = controller.getDebugState();
    assert.equal(state.currentState, "error");

    const root = controller.getFieldRoot();
    const retryButton = root.querySelector(".retry-button");
    assert.ok(retryButton, "retry button should exist");
    assert.equal(retryButton.hidden, false, "retry button should be visible");

    retryButton.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
    assert.equal(retried, true, "retry handler should be invoked");
  });
});
