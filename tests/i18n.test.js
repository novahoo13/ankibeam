import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

const importFreshI18n = async () => {
  const moduleUrl = new URL("../utils/i18n.js", import.meta.url);
  moduleUrl.searchParams.set("t", `${Date.now()}${Math.random()}`);
  return import(moduleUrl.href);
};

let originalChrome;
let originalNavigator;

beforeEach(() => {
  originalChrome = globalThis.chrome;
  originalNavigator = globalThis.navigator;
  // 各テストで初期状態を明示するため一旦削除
  Reflect.deleteProperty(globalThis, "chrome");
  Reflect.deleteProperty(globalThis, "navigator");
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
});

test("getLocale 正常化: Chrome UI 言語をロケールに変換する", async () => {
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

test("getLocale 正常化: 繁体字バリアントを zh-TW に揃える", async () => {
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
