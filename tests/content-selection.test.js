// content-selection.test.js - 選択ユーティリティの検証

import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

import { evaluateSelection, isRestrictedLocation } from "../content/selection.js";

function withDom(html, fn) {
  const dom = new JSDOM(html, { pretendToBeVisual: true });
  const { window } = dom;

  const previousWindow = globalThis.window;
  const previousDocument = globalThis.document;
  const previousNode = globalThis.Node;

  globalThis.window = window;
  globalThis.document = window.document;
  globalThis.Node = window.Node;

  try {
    return fn(window);
  } finally {
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
    if (previousNode === undefined) {
      delete globalThis.Node;
    } else {
      globalThis.Node = previousNode;
    }
  }
}

test("evaluateSelection returns valid payload for standard text nodes", () => {
  withDom(`<p id="target">Hello World</p>`, (window) => {
    const { document } = window;
    const selection = window.getSelection();
    const range = document.createRange();

    const textNode = document.getElementById("target").firstChild;
    range.setStart(textNode, 0);
    range.setEnd(textNode, 5);

    selection.removeAllRanges();
    selection.addRange(range);

    const result = evaluateSelection(selection);

    assert.equal(result.kind, "valid");
    assert.equal(result.text, "Hello");
    assert.equal(result.anchorTagName, "P");
    assert.equal(result.focusTagName, "P");
    assert.equal(typeof result.signature, "string");
  });
});

test("evaluateSelection flags contenteditable selections as unsupported", () => {
  withDom(`<div id="editor" contenteditable="true">Editable text</div>`, (window) => {
    const { document } = window;
    const selection = window.getSelection();
    const range = document.createRange();

    const textNode = document.getElementById("editor").firstChild;
    range.setStart(textNode, 0);
    range.setEnd(textNode, 2);

    selection.removeAllRanges();
    selection.addRange(range);

    const result = evaluateSelection(selection);

    assert.equal(result.kind, "unsupported-input");
    assert.equal(result.anchorTagName, "DIV");
    assert.equal(result.focusTagName, "DIV");
  });
});

test("evaluateSelection treats whitespace-only selections as empty", () => {
  withDom(`<p id="target">   </p>`, (window) => {
    const { document } = window;
    const selection = window.getSelection();
    const range = document.createRange();

    const textNode = document.getElementById("target").firstChild;
    range.setStart(textNode, 0);
    range.setEnd(textNode, textNode.length);

    selection.removeAllRanges();
    selection.addRange(range);

    const result = evaluateSelection(selection);

    assert.equal(result.kind, "empty");
  });
});

test("isRestrictedLocation identifies reserved protocols and PDFs", () => {
  assert.equal(
    isRestrictedLocation(new URL("chrome://settings/")),
    true,
    "chrome:// should be restricted",
  );

  assert.equal(
    isRestrictedLocation(new URL("https://example.com/sample.pdf")),
    true,
    "PDF path should be restricted",
  );

  assert.equal(
    isRestrictedLocation(new URL("https://example.com/doc"), { contentType: "text/html" }),
    false,
    "Standard pages should be allowed",
  );
});
