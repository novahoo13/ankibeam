// floating-button.test.js - フローティングボタン制御の検証

import test from "node:test";
import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import { JSDOM } from "jsdom";

import { computeFloatingButtonPosition, createFloatingButtonController } from "../content/floating-button.js";

test("computeFloatingButtonPosition places button above when space is available", () => {
  const rect = { top: 200, bottom: 260, left: 150, right: 310, width: 160, height: 60, x: 150, y: 200 };
  const viewport = { width: 800, height: 600 };
  const result = computeFloatingButtonPosition(rect, viewport, { buttonSize: 40, gap: 10, viewportPadding: 12 });
  assert.equal(result.placement, "top");
  assert.equal(result.x, 150 + 80 - 20);
  assert.equal(result.y, 200 - 10 - 40);
});

test("computeFloatingButtonPosition flips below when top space is limited", () => {
  const rect = { top: 10, bottom: 70, left: 20, right: 180, width: 160, height: 60, x: 20, y: 10 };
  const viewport = { width: 320, height: 200 };
  const result = computeFloatingButtonPosition(rect, viewport, { buttonSize: 40, gap: 10, viewportPadding: 8 });
  assert.equal(result.placement, "bottom");
  assert.equal(result.y, 70 + 10);
  assert.equal(result.x, 20 + 80 - 20);
});

function withFloatingContext(html, options, fn) {
  const dom = new JSDOM(html, { pretendToBeVisual: true });
  const { window } = dom;
  const previousWindow = globalThis.window;
  const previousDocument = globalThis.document;

  globalThis.window = window;
  globalThis.document = window.document;

  const controller = createFloatingButtonController({
    windowRef: window,
    documentRef: window.document,
    showDelay: options?.showDelay ?? 10,
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
    });
}

test("floating button becomes visible after delay and tracks signature", async () => {
  await withFloatingContext("<p id='target'>Example text content for testing</p>", { showDelay: 20 }, async ({ window, controller }) => {
    const { document } = window;
    const range = document.createRange();
    const textNode = document.getElementById("target").firstChild;
    range.setStart(textNode, 0);
    range.setEnd(textNode, 7);
    const rect = {
      top: 140,
      left: 100,
      width: 160,
      height: 24,
      right: 260,
      bottom: 164,
    };

    controller.showForSelection({ text: "Example", rect, signature: "sig-1" });
    let state = controller.getDebugState();
    assert.equal(state.visible, false, "should stay hidden before delay");

    await delay(30);
    state = controller.getDebugState();
    assert.equal(state.visible, true, "should become visible after delay");
    assert.equal(state.currentSelection.signature, "sig-1");
  });
});

test("showing a new selection cancels previous pending show", async () => {
  await withFloatingContext("<p>abc</p>", { showDelay: 40 }, async ({ controller }) => {
    const rectA = { top: 50, left: 50, width: 20, height: 20, right: 70, bottom: 70 };
    const rectB = { top: 120, left: 150, width: 30, height: 30, right: 180, bottom: 150 };

    controller.showForSelection({ text: "A", rect: rectA, signature: "sig-A" });
    await delay(10);
    controller.showForSelection({ text: "B", rect: rectB, signature: "sig-B" });
    await delay(60);

    const state = controller.getDebugState();
    assert.equal(state.visible, true);
    assert.equal(state.currentSelection.signature, "sig-B");
  });
});

test("scroll event hides the floating button", async () => {
  await withFloatingContext("<p>abc</p>", { showDelay: 10 }, async ({ window, controller }) => {
    const rect = { top: 120, left: 150, width: 80, height: 24, right: 230, bottom: 144 };
    controller.showForSelection({ text: "abc", rect, signature: "sig-scroll" });
    await delay(20);
    assert.equal(controller.getDebugState().visible, true);

    window.dispatchEvent(new window.Event("scroll"));
    assert.equal(controller.getDebugState().visible, false);
  });
});

test("trigger handler fires on click", async () => {
  await withFloatingContext("<p>abc</p>", { showDelay: 10 }, async ({ window, controller }) => {
    const rect = { top: 80, left: 80, width: 60, height: 18, right: 140, bottom: 98 };
    controller.showForSelection({ text: "abc", rect, signature: "sig-trigger" });
    await delay(20);

    let triggered = false;
    controller.setTriggerHandler((payload) => {
      triggered = payload.signature === "sig-trigger";
    });

    const host = window.document.getElementById("anki-floating-assistant-host");
    assert.ok(host, "host element should exist");
    const button = host.shadowRoot.querySelector(".floating-button");
    button.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));

    assert.equal(triggered, true);
  });
});
