// i18n.js - ページ共通のローカライズ補助ユーティリティ

const runtimeI18n = typeof chrome !== "undefined" && chrome?.i18n ? chrome.i18n : null;

const FALLBACK_LOCALE = "en-US";

let customMessages = null;
let customMessagesLocale = null;

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
let userConfiguredLocale = null;

let resolveI18nReady = () => {};
let i18nReadyResolved = false;
const i18nReadyPromise = new Promise((resolve) => {
  resolveI18nReady = () => {
    if (!i18nReadyResolved) {
      i18nReadyResolved = true;
      resolve();
    }
  };
});

function mapLocaleToFolderName(locale) {
  const normalized = locale.toLowerCase();

  if (normalized === 'en-us' || normalized === 'en') {
    return 'en';
  }
  if (normalized === 'ja-jp' || normalized === 'ja') {
    return 'ja';
  }
  if (normalized === 'zh-cn') {
    return 'zh_CN';
  }
  if (normalized === 'zh-tw') {
    return 'zh_TW';
  }

  return locale.replace('-', '_');
}

async function loadMessagesForLocale(locale) {
  if (!locale) {
    return null;
  }

  const folderName = mapLocaleToFolderName(locale);

  try {
    const url = chrome.runtime.getURL(`_locales/${folderName}/messages.json`);
    const response = await fetch(url);
    if (!response.ok) {
      console.warn(`Failed to load messages for locale ${locale} (folder: ${folderName})`);
      return null;
    }
    const messages = await response.json();
    return messages;
  } catch (error) {
    console.warn(`Error loading messages for locale ${locale} (folder: ${folderName}):`, error);
    return null;
  }
}

function normalizeSubstitutions(substitutions) {
  if (substitutions === undefined || substitutions === null) {
    return [];
  }
  if (Array.isArray(substitutions)) {
    return substitutions.map((value) => {
      if (value === undefined || value === null) {
        return "";
      }
      return String(value);
    });
  }
  return [String(substitutions)];
}

function applyCustomSubstitutions(entry, substitutions) {
  const messageEntry =
    entry && typeof entry === "object" && !Array.isArray(entry)
      ? entry
      : { message: entry };

  let message = typeof messageEntry.message === "string" ? messageEntry.message : "";
  if (!message) {
    return "";
  }

  const normalizedSubs = normalizeSubstitutions(substitutions);

  if (normalizedSubs.length > 0) {
    const namedPlaceholderMap = Object.create(null);
    const placeholders = messageEntry.placeholders;

    if (placeholders && typeof placeholders === "object") {
      for (const [name, descriptor] of Object.entries(placeholders)) {
        const content = descriptor?.content;
        if (typeof content !== "string") {
          continue;
        }
        const match = content.trim().match(/^\$([0-9]+)$/);
        if (!match) {
          continue;
        }
        const index = Number.parseInt(match[1], 10) - 1;
        if (Number.isNaN(index) || index < 0) {
          continue;
        }
        namedPlaceholderMap[name] = index;
      }
    }

    message = message.replace(/\$([A-Za-z0-9_@]+)\$/g, (fullMatch, placeholderName) => {
      if (Object.prototype.hasOwnProperty.call(namedPlaceholderMap, placeholderName)) {
        const index = namedPlaceholderMap[placeholderName];
        if (index >= 0 && index < normalizedSubs.length) {
          return normalizedSubs[index];
        }
        return "";
      }
      return fullMatch;
    });

    message = message.replace(/\$(\d+)\$/g, (fullMatch, rawIndex) => {
      const index = Number.parseInt(rawIndex, 10) - 1;
      if (!Number.isNaN(index) && index >= 0 && index < normalizedSubs.length) {
        return normalizedSubs[index];
      }
      return fullMatch;
    });

    normalizedSubs.forEach((substitution, index) => {
      const placeholder = `$${index + 1}`;
      message = message.replace(new RegExp(`\\${placeholder}`, "g"), substitution);
    });
  }

  return message.replace(/\$\$/g, "$");
}

function resolveMessage(key, substitutions) {
  if (!key) {
    return "";
  }

  if (customMessages && Object.prototype.hasOwnProperty.call(customMessages, key)) {
    return applyCustomSubstitutions(customMessages[key], substitutions);
  }

  if (!runtimeI18n) {
    return key;
  }
  return runtimeI18n.getMessage(key, substitutions);
}

async function loadUserLanguageSetting() {
  if (!chrome?.storage?.local) {
    return null;
  }

  try {
    const result = await chrome.storage.local.get("ankiWordAssistantConfig");
    const config = result?.ankiWordAssistantConfig;
    if (config && typeof config.language === "string" && config.language.trim()) {
      return config.language.trim();
    }
  } catch (error) {
    console.warn("Failed to load user language setting:", error);
  }
  return null;
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

export async function setPageLanguage() {
  if (typeof document === "undefined" || !document.documentElement) {
    return;
  }

  try {
    const userLang = await loadUserLanguageSetting();
    if (userLang) {
      const normalized = normalizeLocaleCandidate(userLang);
      if (normalized) {
        document.documentElement.lang = normalized;
        userConfiguredLocale = normalized;

        // Content script では chrome.i18n.getMessage() を使用するため、
        // messages.json の直接読み込みはスキップします
        if (typeof chrome !== "undefined" && chrome?.runtime?.getManifest) {
          // Extension context では chrome.i18n を使用
          console.log(`Using chrome.i18n for locale: ${normalized}`);
        } else {
          // 通常の Web ページコンテキストでのみ messages.json を読み込む
          const messages = await loadMessagesForLocale(normalized);
          if (messages) {
            customMessages = messages;
            customMessagesLocale = normalized;
            console.log(`Loaded custom messages for locale: ${normalized}`);
          }
        }
        return;
      }
    }

    if (runtimeI18n?.getUILanguage) {
      const uiLang = runtimeI18n.getUILanguage();
      if (uiLang) {
        document.documentElement.lang = uiLang;
      }
    }
  } catch (error) {
    console.warn("Failed to set page language:", error);
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
  if (userConfiguredLocale) {
    return userConfiguredLocale;
  }

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
  userConfiguredLocale = null;
  customMessages = null;
  customMessagesLocale = null;
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

function resolveI18nInitialization() {
  resolveI18nReady();
}

if (typeof document !== "undefined") {
  const runLocalizationLifecycle = async () => {
    try {
      await setPageLanguage();
      localizePage();
    } catch (error) {
      console.warn("Failed to initialize i18n:", error);
    } finally {
      resolveI18nInitialization();
    }
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", runLocalizationLifecycle, {
      once: true,
    });
  } else {
    Promise.resolve().then(runLocalizationLifecycle);
  }
} else {
  resolveI18nInitialization();
}

export function whenI18nReady() {
  return i18nReadyPromise;
}
