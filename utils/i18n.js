/**
 * @file i18n.js
 * @description 页面通用的本地化辅助工具。
 * 该模块负责根据用户设置或浏览器环境来确定和应用正确的语言，
 * 并提供获取翻译文本、本地化整个页面等功能。
 * 支持从用户设置中加载自定义语言，如果未设置，则回退到浏览器的语言。
 */

// 安全地获取 chrome.i18n API，如果环境不支持则为 null
const runtimeI18n =
  typeof chrome !== "undefined" && chrome?.i18n ? chrome.i18n : null;

// 默认的回退语言区域
const FALLBACK_LOCALE = "en-US";

// 用于存储用户自定义语言的翻译消息
let customMessages = null;
// 存储当前加载的自定义消息的语言区域
let customMessagesLocale = null;

/**
 * @description 语言区域别名映射。
 * 用于将常见的、非标准的语言代码规范化为标准的语言区域代码。
 * @type {Map<string, string>}
 */
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

// 缓存已解析的语言区域，避免重复计算
let cachedLocale = null;
// 存储用户在设置中明确配置的语言区域
let userConfiguredLocale = null;

// i18n 初始化完成的 Promise 解析函数
let resolveI18nReady = () => {};
let i18nReadyResolved = false;
/**
 * @description 一个 Promise，当 i18n 初始化完成后变为 resolved 状态。
 * 其他模块可以等待此 Promise 以确保在访问本地化资源之前 i18n 已准备就绪。
 * @type {Promise<void>}
 */
const i18nReadyPromise = new Promise((resolve) => {
  resolveI18nReady = () => {
    if (!i18nReadyResolved) {
      i18nReadyResolved = true;
      resolve();
    }
  };
});

/**
 * 将语言区域代码映射到 `_locales` 目录下的文件夹名称。
 * @param {string} locale - 语言区域代码 (例如 "en-US", "zh-CN")。
 * @returns {string} 对应的文件夹名称 (例如 "en", "zh_CN")。
 */
function mapLocaleToFolderName(locale) {
  const normalized = locale.toLowerCase();

  if (normalized === "en-us" || normalized === "en") {
    return "en";
  }
  if (normalized === "ja-jp" || normalized === "ja") {
    return "ja";
  }
  if (normalized === "zh-cn") {
    return "zh_CN";
  }
  if (normalized === "zh-tw") {
    return "zh_TW";
  }
  // 对于其他语言，默认将连字符替换为下划线
  return locale.replace("-", "_");
}

/**
 * 为指定的语言区域异步加载 `messages.json` 文件。
 * @param {string} locale - 要加载消息的语言区域。
 * @returns {Promise<object|null>} 如果加载成功，返回消息对象；否则返回 null。
 */
async function loadMessagesForLocale(locale) {
  if (!locale) {
    return null;
  }

  const folderName = mapLocaleToFolderName(locale);

  try {
    const url = chrome.runtime.getURL(`_locales/${folderName}/messages.json`);
    const response = await fetch(url);
    if (!response.ok) {
      console.warn(`为语言区域 ${locale} (文件夹: ${folderName}) 加载消息失败`);
      return null;
    }
    const messages = await response.json();
    return messages;
  } catch (error) {
    console.warn(
      `为语言区域 ${locale} (文件夹: ${folderName}) 加载消息时出错:`,
      error
    );
    return null;
  }
}

/**
 * 规范化替代内容，确保其为字符串数组。
 * @param {any} substitutions - 一个或多个替代内容。
 * @returns {string[]} 规范化后的字符串数组。
 */
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

/**
 * 将替代内容手动应用到自定义消息条目中。
 * 这是为自定义加载的消息实现的 `getMessage` 的替代逻辑。
 * @param {object|string} entry - 消息条目，可以是字符串或包含 message 和 placeholders 的对象。
 * @param {string|string[]} substitutions - 一个或多个替代内容。
 * @returns {string} 应用替代内容后的消息字符串。
 */
function applyCustomSubstitutions(entry, substitutions) {
  const messageEntry =
    entry && typeof entry === "object" && !Array.isArray(entry)
      ? entry
      : { message: entry };

  let message =
    typeof messageEntry.message === "string" ? messageEntry.message : "";
  if (!message) {
    return "";
  }

  const normalizedSubs = normalizeSubstitutions(substitutions);

  if (normalizedSubs.length > 0) {
    const namedPlaceholderMap = Object.create(null);
    const placeholders = messageEntry.placeholders;

    // 解析命名占位符 (例如 "name": { "content": "$1" })
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

    // 替换命名占位符 (例如 $NAME$)
    message = message.replace(
      /\$([A-Za-z0-9_@]+)\$/g,
      (fullMatch, placeholderName) => {
        if (
          Object.prototype.hasOwnProperty.call(
            namedPlaceholderMap,
            placeholderName
          )
        ) {
          const index = namedPlaceholderMap[placeholderName];
          if (index >= 0 && index < normalizedSubs.length) {
            return normalizedSubs[index];
          }
          return "";
        }
        return fullMatch;
      }
    );

    // 替换数字占位符 (例如 $1, $2)
    message = message.replace(/\$(\d+)\$/g, (fullMatch, rawIndex) => {
      const index = Number.parseInt(rawIndex, 10) - 1;
      if (!Number.isNaN(index) && index >= 0 && index < normalizedSubs.length) {
        return normalizedSubs[index];
      }
      return fullMatch;
    });

    // 兼容旧的 $N 格式
    normalizedSubs.forEach((substitution, index) => {
      const placeholder = `$${index + 1}`;
      message = message.replace(
        new RegExp(`\\${placeholder}`, "g"),
        substitution
      );
    });
  }

  // 处理转义的美元符号 ($$)
  return message.replace(/\$\$/g, "$");
}

/**
 * 解析并返回最终的翻译消息。
 * 优先使用自定义加载的消息，如果找不到，则回退到 `chrome.i18n.getMessage`。
 * @param {string} key - 消息的键。
 * @param {string|string[]} substitutions - 替代内容。
 * @returns {string} 解析后的消息字符串。
 */
function resolveMessage(key, substitutions) {
  if (!key) {
    return "";
  }

  // 如果存在自定义消息，并且包含指定的键，则使用自定义的替换逻辑
  if (
    customMessages &&
    Object.prototype.hasOwnProperty.call(customMessages, key)
  ) {
    return applyCustomSubstitutions(customMessages[key], substitutions);
  }

  // 如果 Chrome i18n API 不可用，则直接返回键
  if (!runtimeI18n) {
    return key;
  }
  // 使用标准的 Chrome i18n API 获取消息
  return runtimeI18n.getMessage(key, substitutions);
}

/**
 * 从 `chrome.storage.local` 异步加载用户配置的语言设置。
 * @returns {Promise<string|null>} 如果找到设置，则返回语言字符串；否则返回 null。
 */
async function loadUserLanguageSetting() {
  if (!chrome?.storage?.local) {
    return null;
  }

  try {
    const result = await chrome.storage.local.get("ankiWordAssistantConfig");
    const config = result?.ankiWordAssistantConfig;
    if (
      config &&
      typeof config.language === "string" &&
      config.language.trim()
    ) {
      return config.language.trim();
    }
  } catch (error) {
    console.warn("加载用户语言设置失败:", error);
  }
  return null;
}

/**
 * 将一个可能是语言区域的字符串规范化为标准的、受支持的语言区域代码。
 * @param {string} candidate - 候选的语言区域字符串。
 * @returns {string|null} 规范化后的语言区域代码，如果无法规范化则返回 null。
 */
function normalizeLocaleCandidate(candidate) {
  if (typeof candidate !== "string") {
    return null;
  }
  const trimmed = candidate.trim();
  if (!trimmed) {
    return null;
  }
  // 将下划线统一替换为连字符
  const normalized = trimmed.replace(/_/g, "-");
  const lower = normalized.toLowerCase();

  // 检查别名映射
  if (LOCALE_ALIAS_MAP.has(lower)) {
    return LOCALE_ALIAS_MAP.get(lower);
  }

  // 根据前缀进行通用匹配
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

/**
 * 检查给定的语言区域是否受当前环境的 `Intl` API 支持。
 * @param {string} locale - 要检查的语言区域代码。
 * @returns {boolean} 如果受支持则返回 true，否则返回 false。
 */
function isSupportedLocale(locale) {
  if (!locale) {
    return false;
  }
  // 如果 Intl API 不可用，则假定为支持，以提供最大兼容性
  if (
    typeof Intl === "undefined" ||
    typeof Intl.DateTimeFormat !== "function"
  ) {
    return true;
  }
  try {
    return Intl.DateTimeFormat.supportedLocalesOf([locale]).length > 0;
  } catch (error) {
    console.warn("Intl.DateTimeFormat.supportedLocalesOf 调用失败:", error);
    return false;
  }
}

/**
 * @summary 设置页面的显示语言。
 * @description 此函数会检测用户在扩展设置中指定的语言。如果设置了有效语言，
 * 则会加载对应的 `messages.json` 文件，并将其应用于页面，同时设置 `<html>` 标签的 `lang` 属性。
 * 如果用户未设置语言，则会回退到 `chrome.i18n.getUILanguage()` 提供的浏览器界面语言。
 * @export
 * @returns {Promise<void>}
 */
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

        // 加载自定义语言文件
        const messages = await loadMessagesForLocale(normalized);
        if (messages) {
          customMessages = messages;
          customMessagesLocale = normalized;
          console.log(`已为语言区域加载自定义消息: ${normalized}`);
        } else {
          customMessages = null;
          customMessagesLocale = null;
          console.warn(
            `未找到语言区域 ${normalized} 的 messages.json 文件，将回退到 chrome.i18n`
          );
        }
        return;
      }
    }

    // 如果没有用户设置，则回退到浏览器UI语言
    if (runtimeI18n?.getUILanguage) {
      const uiLang = runtimeI18n.getUILanguage();
      if (uiLang) {
        document.documentElement.lang = uiLang;
      }
    }
  } catch (error) {
    console.warn("设置页面语言失败:", error);
  }
}

/**
 * @summary 本地化页面上的所有元素。
 * @description 遍历 DOM，查找带有 `data-i18n-*` 属性的元素，
 * 并使用 `resolveMessage` 函数获取的翻译文本来更新其内容或属性。
 * @export
 */
export function localizePage() {
  if (typeof document === "undefined") {
    return;
  }

  // 更新元素的 textContent
  document.querySelectorAll("[data-i18n]").forEach((elem) => {
    const key = elem.getAttribute("data-i18n");
    const message = resolveMessage(key);
    if (message) {
      elem.textContent = message;
    }
  });

  // 更新输入框的 placeholder
  document.querySelectorAll("[data-i18n-placeholder]").forEach((elem) => {
    const key = elem.getAttribute("data-i18n-placeholder");
    const message = resolveMessage(key);
    if (message) {
      elem.placeholder = message;
    }
  });

  // 更新元素的 title 属性
  document.querySelectorAll("[data-i18n-title]").forEach((elem) => {
    const key = elem.getAttribute("data-i18n-title");
    const message = resolveMessage(key);
    if (message) {
      elem.title = message;
    }
  });

  // 更新表单元素的 value 属性
  document.querySelectorAll("[data-i18n-value]").forEach((elem) => {
    const key = elem.getAttribute("data-i18n-value");
    const message = resolveMessage(key);
    if (message) {
      elem.value = message;
    }
  });

  // 更新元素的 aria-label 属性
  document.querySelectorAll("[data-i18n-aria]").forEach((elem) => {
    const key = elem.getAttribute("data-i18n-aria");
    const message = resolveMessage(key);
    if (message) {
      elem.setAttribute("aria-label", message);
    }
  });
}

/**
 * @summary 获取当前应用的语言区域。
 * @description 按以下顺序确定语言区域：
 * 1. 用户在设置中明确配置的语言。
 * 2. 缓存的语言区域。
 * 3. 从 `chrome.i18n.getUILanguage()` 或 `navigator.languages` 检测到的语言。
 * 4. 默认的回退语言 (`en-US`)。
 * @export
 * @returns {string} 解析后的语言区域代码。
 */
export function getLocale() {
  if (userConfiguredLocale) {
    return userConfiguredLocale;
  }

  if (cachedLocale) {
    return cachedLocale;
  }

  const candidates = [];

  // 从 Chrome API 获取
  if (runtimeI18n?.getUILanguage) {
    try {
      const uiLang = runtimeI18n.getUILanguage();
      if (uiLang) {
        candidates.push(uiLang);
      }
    } catch (error) {
      console.warn("chrome.i18n.getUILanguage 调用失败:", error);
    }
  }

  // 从 navigator 获取
  if (typeof navigator !== "undefined") {
    if (Array.isArray(navigator.languages)) {
      candidates.push(...navigator.languages);
    }
    if (typeof navigator.language === "string") {
      candidates.push(navigator.language);
    }
  }

  // 添加最终的回退选项
  candidates.push(FALLBACK_LOCALE);

  // 遍历候选列表，找到第一个受支持的语言区域
  for (const candidate of candidates) {
    const locale = normalizeLocaleCandidate(candidate);
    if (locale && isSupportedLocale(locale)) {
      cachedLocale = locale;
      break;
    }
  }

  // 如果循环结束后仍未找到，则强制使用回退语言
  if (!cachedLocale) {
    cachedLocale = FALLBACK_LOCALE;
  }

  return cachedLocale;
}

/**
 * @summary 重置所有缓存的语言区域信息。
 * @description 当语言设置发生变化时调用此函数，以强制重新计算语言区域。
 * @export
 */
export function resetLocaleCache() {
  cachedLocale = null;
  userConfiguredLocale = null;
  customMessages = null;
  customMessagesLocale = null;
}

/**
 * @summary 获取指定键的翻译消息。
 * @description 这是 `resolveMessage` 的一个简单导出封装。
 * @param {string} key - 消息的键。
 * @param {string|string[]} [substitutions] - 一个或多个替代内容。
 * @returns {string} 翻译后的消息。
 * @export
 */
export function getMessage(key, substitutions) {
  return resolveMessage(key, substitutions);
}

/**
 * @summary 获取翻译文本，支持回退值。
 * @description 尝试获取一个键的翻译。如果翻译结果为空或无效，则返回提供的回退值。
 * 如果没有提供回退值，则返回原始的键。
 * @param {string} key - 消息的键。
 * @param {object} [options] - 选项对象。
 * @param {string|string[]} [options.substitutions] - 替代内容。
 * @param {any} [options.fallback] - 当翻译失败时返回的回退值。
 * @returns {string|any} 翻译后的字符串或回退值。
 * @export
 */
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

/**
 * @summary 创建一个带有本地化错误消息的 Error 对象。
 * @param {string} key - 用于错误消息的 i18n 键。
 * @param {object} [options] - 传递给 `translate` 函数的选项。
 * @returns {Error} 一个包含 i18n 信息的 Error 对象。
 * @export
 */
export function createI18nError(key, options = {}) {
  const error = new Error(translate(key, options));
  error.i18nKey = key;
  if (options?.substitutions !== undefined) {
    error.i18nSubstitutions = options.substitutions;
  }
  return error;
}

/**
 * 解析 i18nReadyPromise，表示初始化已完成。
 */
function resolveI18nInitialization() {
  resolveI18nReady();
}

// --- i18n 初始化生命周期 ---
if (typeof document !== "undefined") {
  const runLocalizationLifecycle = async () => {
    try {
      await setPageLanguage();
      localizePage();
    } catch (error) {
      console.warn("i18n 初始化失败:", error);
    } finally {
      // 无论成功与否，都表示 i18n 流程已结束
      resolveI18nInitialization();
    }
  };

  // 根据文档加载状态，在合适的时机运行本地化生命周期
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", runLocalizationLifecycle, {
      once: true,
    });
  } else {
    // 如果 DOM 已加载，则异步执行
    Promise.resolve().then(runLocalizationLifecycle);
  }
} else {
  // 如果不在文档环境中（例如，在 background script 中），立即解析
  resolveI18nInitialization();
}

/**
 * @summary 返回一个在 i18n 初始化完成后解析的 Promise。
 * @description 其他模块可以使用此函数来等待本地化过程完成，
 * 以确保在执行依赖翻译文本的代码之前，所有内容都已准备就绪。
 * @example
 * import { whenI18nReady } from './i18n.js';
 *
 * async function main() {
 *   await whenI18nReady();
 *   // 在这里可以安全地使用 getMessage 或操作已本地化的 DOM
 * }
 * main();
 * @export
 * @returns {Promise<void>}
 */
export function whenI18nReady() {
  return i18nReadyPromise;
}
