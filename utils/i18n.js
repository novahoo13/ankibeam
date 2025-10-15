// i18n.js - ページ共通のローカライズ補助ユーティリティ

const runtimeI18n = typeof chrome !== "undefined" && chrome?.i18n ? chrome.i18n : null;

const FALLBACK_LOCALE = "en-US";

const LOCALE_ALIAS_MAP = new Map([
  ["en", "en-US"],
  ["en-us", "en-US"],
  ["en-gb", "en-US"],
  ["en-au", "en-US"],
  ["en-ca", "en-US"],
  ["ja", "ja-JP"],
  ["ja-jp", "ja-JP"],
  ["zh", "zh-CN"],
  ["zh-cn", "zh-CN"],
  ["zh-sg", "zh-CN"],
  ["zh-hans", "zh-CN"],
  ["zh-tw", "zh-TW"],
  ["zh-hk", "zh-TW"],
  ["zh-mo", "zh-TW"],
  ["zh-hant", "zh-TW"],
]);

let cachedLocale = null;

function resolveMessage(key, substitutions) {
  if (!key) {
    return "";
  }
  if (!runtimeI18n) {
    return key;
  }
  return runtimeI18n.getMessage(key, substitutions);
}

function normalizeLocaleCandidate(candidate) {
  if (typeof candidate !== "string") {
    return null;
  }
  const trimmed = candidate.trim();
  if (!trimmed) {
    return null;
  }
  const normalized = trimmed.replace(/_/g, "-");
  const lower = normalized.toLowerCase();

  if (LOCALE_ALIAS_MAP.has(lower)) {
    return LOCALE_ALIAS_MAP.get(lower);
  }

  if (lower.startsWith("en")) {
    return "en-US";
  }
  if (lower.startsWith("ja")) {
    return "ja-JP";
  }
  if (
    lower.startsWith("zh-tw") ||
    lower.startsWith("zh-hk") ||
    lower.startsWith("zh-mo") ||
    lower.startsWith("zh-hant")
  ) {
    return "zh-TW";
  }
  if (lower.startsWith("zh")) {
    return "zh-CN";
  }

  return null;
}

function isSupportedLocale(locale) {
  if (!locale) {
    return false;
  }
  if (typeof Intl === "undefined" || typeof Intl.DateTimeFormat !== "function") {
    return true;
  }
  try {
    return Intl.DateTimeFormat.supportedLocalesOf([locale]).length > 0;
  } catch (error) {
    console.warn("Intl.DateTimeFormat.supportedLocalesOf failed:", error);
    return false;
  }
}

export function localizePage() {
  if (typeof document === "undefined") {
    return;
  }

  document.querySelectorAll("[data-i18n]").forEach((elem) => {
    const key = elem.getAttribute("data-i18n");
    const message = resolveMessage(key);
    if (message) {
      elem.textContent = message;
    }
  });

  document.querySelectorAll("[data-i18n-placeholder]").forEach((elem) => {
    const key = elem.getAttribute("data-i18n-placeholder");
    const message = resolveMessage(key);
    if (message) {
      elem.placeholder = message;
    }
  });

  document.querySelectorAll("[data-i18n-title]").forEach((elem) => {
    const key = elem.getAttribute("data-i18n-title");
    const message = resolveMessage(key);
    if (message) {
      elem.title = message;
    }
  });

  document.querySelectorAll("[data-i18n-value]").forEach((elem) => {
    const key = elem.getAttribute("data-i18n-value");
    const message = resolveMessage(key);
    if (message) {
      elem.value = message;
    }
  });

  document.querySelectorAll("[data-i18n-aria]").forEach((elem) => {
    const key = elem.getAttribute("data-i18n-aria");
    const message = resolveMessage(key);
    if (message) {
      elem.setAttribute("aria-label", message);
    }
  });
}

export function getLocale() {
  if (cachedLocale) {
    return cachedLocale;
  }

  const candidates = [];

  if (runtimeI18n?.getUILanguage) {
    try {
      const uiLang = runtimeI18n.getUILanguage();
      if (uiLang) {
        candidates.push(uiLang);
      }
    } catch (error) {
      console.warn("chrome.i18n.getUILanguage failed:", error);
    }
  }

  if (typeof navigator !== "undefined") {
    if (Array.isArray(navigator.languages)) {
      candidates.push(...navigator.languages);
    }
    if (typeof navigator.language === "string") {
      candidates.push(navigator.language);
    }
  }

  candidates.push(FALLBACK_LOCALE);

  for (const candidate of candidates) {
    const locale = normalizeLocaleCandidate(candidate);
    if (locale && isSupportedLocale(locale)) {
      cachedLocale = locale;
      break;
    }
  }

  if (!cachedLocale) {
    cachedLocale = FALLBACK_LOCALE;
  }

  return cachedLocale;
}

export function resetLocaleCache() {
  cachedLocale = null;
}

export function getMessage(key, substitutions) {
  return resolveMessage(key, substitutions);
}

export function translate(key, options = {}) {
  const { substitutions, fallback } = options || {};
  const message = resolveMessage(key, substitutions);
  if (typeof message === "string" && message.trim()) {
    return message;
  }
  if (typeof fallback === "string" && fallback.trim()) {
    return fallback;
  }
  if (fallback !== undefined && fallback !== null) {
    return fallback;
  }
  return key;
}

export function createI18nError(key, options = {}) {
  const error = new Error(translate(key, options));
  error.i18nKey = key;
  if (options?.substitutions !== undefined) {
    error.i18nSubstitutions = options.substitutions;
  }
  return error;
}

if (typeof document !== "undefined") {
  document.addEventListener("DOMContentLoaded", () => {
    localizePage();
  });
}
