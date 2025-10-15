import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { JSDOM } from "jsdom";

const importFreshI18n = async () => {
  const moduleUrl = new URL("../utils/i18n.js", import.meta.url);
  moduleUrl.searchParams.set("t", `${Date.now()}${Math.random()}`);
  return import(moduleUrl.href);
};

let originalChrome;
let originalNavigator;
let originalDocument;
let originalWindow;
let originalNode;

beforeEach(() => {
  originalChrome = globalThis.chrome;
  originalNavigator = globalThis.navigator;
  originalDocument = globalThis.document;
  originalWindow = globalThis.window;
  originalNode = globalThis.Node;

  Reflect.deleteProperty(globalThis, "chrome");
  Reflect.deleteProperty(globalThis, "navigator");
  Reflect.deleteProperty(globalThis, "document");
  Reflect.deleteProperty(globalThis, "window");
  Reflect.deleteProperty(globalThis, "Node");
});

afterEach(() => {
  if (originalChrome === undefined) {
    Reflect.deleteProperty(globalThis, "chrome");
  } else {
    globalThis.chrome = originalChrome;
  }

  if (originalNavigator === undefined) {
    Reflect.deleteProperty(globalThis, "navigator");
  } else {
    globalThis.navigator = originalNavigator;
  }

  if (originalDocument === undefined) {
    Reflect.deleteProperty(globalThis, "document");
  } else {
    globalThis.document = originalDocument;
  }

  if (originalWindow === undefined) {
    Reflect.deleteProperty(globalThis, "window");
  } else {
    globalThis.window = originalWindow;
  }

  if (originalNode === undefined) {
    Reflect.deleteProperty(globalThis, "Node");
  } else {
    globalThis.Node = originalNode;
  }
});

test("getLocale 正常系: Chrome UI 言語をロケールに変換する", async () => {
  globalThis.chrome = {
    i18n: {
      getUILanguage: () => "ja",
    },
  };

  const { getLocale, resetLocaleCache } = await importFreshI18n();

  assert.equal(getLocale(), "ja-JP");

  globalThis.chrome.i18n.getUILanguage = () => "en-GB";
  resetLocaleCache();
  assert.equal(getLocale(), "en-US");
});

test("getLocale 正常系: 繁体字バリアントを zh-TW に揃える", async () => {
  globalThis.chrome = {
    i18n: {
      getUILanguage: () => "zh-HK",
    },
  };

  const { getLocale, resetLocaleCache } = await importFreshI18n();

  assert.equal(getLocale(), "zh-TW");

  globalThis.chrome.i18n.getUILanguage = () => "zh-mo";
  resetLocaleCache();
  assert.equal(getLocale(), "zh-TW");
});

test("getLocale フォールバック: navigator.languages を利用する", async () => {
  globalThis.navigator = {
    languages: ["zh-TW", "fr-FR"],
    language: "fr-FR",
  };

  const { getLocale } = await importFreshI18n();

  assert.equal(getLocale(), "zh-TW");
});

test("getLocale フォールバック: 候補が無い場合は en-US を返す", async () => {
  const { getLocale } = await importFreshI18n();

  assert.equal(getLocale(), "en-US");
});

test("localizePage: data-i18n 属性を一括適用する", async () => {
  const messages = {
    sample_heading: "見出しテキスト",
    sample_placeholder: "入力してください",
    sample_title: "タイトル情報",
    sample_value: "初期値テキスト",
    sample_aria: "ARIAラベル",
  };

  globalThis.chrome = {
    i18n: {
      getMessage(key) {
        return messages[key] ?? "";
      },
    },
  };

  const dom = new JSDOM(
    `<body>
      <h1 data-i18n="sample_heading"></h1>
      <input
        data-i18n-placeholder="sample_placeholder"
        data-i18n-title="sample_title"
        data-i18n-value="sample_value"
        data-i18n-aria="sample_aria"
      />
    </body>`,
    { url: "http://localhost" },
  );

  try {
    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    globalThis.Node = dom.window.Node;

    const { localizePage } = await importFreshI18n();

    localizePage();

    const heading = document.querySelector("[data-i18n]");
    const input = document.querySelector("input");

    assert.equal(heading.textContent, messages.sample_heading);
    assert.equal(input.placeholder, messages.sample_placeholder);
    assert.equal(input.title, messages.sample_title);
    assert.equal(input.value, messages.sample_value);
    assert.equal(input.getAttribute("aria-label"), messages.sample_aria);
  } finally {
    dom.window.close();
    Reflect.deleteProperty(globalThis, "document");
    Reflect.deleteProperty(globalThis, "window");
    Reflect.deleteProperty(globalThis, "Node");
  }
});

test("translate: フォールバックと代入処理を制御する", async () => {
  let callCount = 0;
  globalThis.chrome = {
    i18n: {
      getMessage(key, substitutions) {
        callCount += 1;
        if (key === "with_value") {
          return "取得済みメッセージ";
        }
        if (key === "with_substitution") {
          if (Array.isArray(substitutions)) {
            return substitutions.join("/");
          }
          return substitutions ?? "";
        }
        return "";
      },
    },
  };

  const { translate } = await importFreshI18n();

  assert.equal(translate("missing_key", { fallback: "代替テキスト" }), "代替テキスト");
  assert.equal(translate("missing_empty", { fallback: "" }), "");
  assert.equal(translate("no_fallback"), "no_fallback");
  assert.equal(translate("with_value"), "取得済みメッセージ");
  assert.equal(
    translate("with_substitution", { substitutions: ["A", "B", "C"] }),
    "A/B/C",
  );
  assert.equal(callCount, 5);
});

test("translate: カスタムメッセージのプレースホルダーを置換する", async () => {
  const dom = new JSDOM("<html><body></body></html>", { url: "https://example.com" });
  const originalFetch = globalThis.fetch;

  try {
    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    globalThis.Node = dom.window.Node;

    const messages = {
      options_status_template: {
        message: "状態: $STATUS$ | 最終確認: $TIME$",
        placeholders: {
          STATUS: { content: "$1" },
          TIME: { content: "$2" },
        },
      },
    };

    let requestedUrl = null;

    globalThis.chrome = {
      runtime: {
        getURL(path) {
          return `https://example.com/${path}`;
        },
      },
      storage: {
        local: {
          async get(key) {
            if (key === "ankiWordAssistantConfig") {
              return {
                ankiWordAssistantConfig: {
                  language: "zh-CN",
                },
              };
            }
            return {};
          },
        },
      },
    };

    globalThis.fetch = async (url) => {
      requestedUrl = url;
      return {
        ok: true,
        async json() {
          return messages;
        },
      };
    };

    const { setPageLanguage, translate, resetLocaleCache } = await importFreshI18n();

    await setPageLanguage();

    assert.equal(
      requestedUrl,
      "https://example.com/_locales/zh_CN/messages.json",
    );

    const result = translate("options_status_template", {
      substitutions: ["OK", "2025-10-15"],
    });

    assert.equal(result, "状態: OK | 最終確認: 2025-10-15");

    resetLocaleCache();
  } finally {
    if (dom?.window) {
      dom.window.close();
    }
    Reflect.deleteProperty(globalThis, "document");
    Reflect.deleteProperty(globalThis, "window");
    Reflect.deleteProperty(globalThis, "Node");
    if (originalFetch === undefined) {
      Reflect.deleteProperty(globalThis, "fetch");
    } else {
      globalThis.fetch = originalFetch;
    }
  }
});

test("createI18nError: メタデータ付きのエラーを返す", async () => {
  globalThis.chrome = {
    i18n: {
      getMessage() {
        return "";
      },
    },
  };

  const { createI18nError } = await importFreshI18n();
  const error = createI18nError("error_key", { fallback: "エラー説明", substitutions: ["X"] });

  assert.equal(error.message, "エラー説明");
  assert.equal(error.i18nKey, "error_key");
  assert.deepEqual(error.i18nSubstitutions, ["X"]);
  assert(error instanceof Error);
});
