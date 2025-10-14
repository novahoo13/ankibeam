// i18n.js - ページ内のローカライズ要素を処理

const runtimeI18n = typeof chrome !== 'undefined' && chrome?.i18n ? chrome.i18n : null;

// メッセージ取得の共通処理
function resolveMessage(key, substitutions) {
  if (!key) {
    return '';
  }
  if (!runtimeI18n) {
    return key;
  }
  return runtimeI18n.getMessage(key, substitutions);
}

/**
 * data-i18n* 属性に基づいて文言を設定する。
 */
export function localizePage() {
  if (typeof document === 'undefined') {
    return;
  }

  document.querySelectorAll('[data-i18n]').forEach(elem => {
    const key = elem.getAttribute('data-i18n');
    const message = resolveMessage(key);
    if (message) {
      elem.textContent = message;
    }
  });

  document.querySelectorAll('[data-i18n-placeholder]').forEach(elem => {
    const key = elem.getAttribute('data-i18n-placeholder');
    const message = resolveMessage(key);
    if (message) {
      elem.placeholder = message;
    }
  });

  document.querySelectorAll('[data-i18n-title]').forEach(elem => {
    const key = elem.getAttribute('data-i18n-title');
    const message = resolveMessage(key);
    if (message) {
      elem.title = message;
    }
  });

  document.querySelectorAll('[data-i18n-value]').forEach(elem => {
    const key = elem.getAttribute('data-i18n-value');
    const message = resolveMessage(key);
    if (message) {
      elem.value = message;
    }
  });

  document.querySelectorAll('[data-i18n-aria]').forEach(elem => {
    const key = elem.getAttribute('data-i18n-aria');
    const message = resolveMessage(key);
    if (message) {
      elem.setAttribute('aria-label', message);
    }
  });
}

/**
 * 任意キーのメッセージを取得する。
 * @param {string} key - メッセージキー
 * @param {string|string[]} [substitutions] - 差し込み文字列
 * @returns {string}
 */
export function getMessage(key, substitutions) {
 return resolveMessage(key, substitutions);
}

/**
 * 指定キーに対する翻訳文字列を返す。取得できない場合はフォールバックを用いる。
 * @param {string} key - メッセージキー
 * @param {{substitutions?: string|string[], fallback?: string}} [options] - 代入値とフォールバック
 * @returns {string}
 */
export function translate(key, options = {}) {
  const { substitutions, fallback } = options || {};
  const message = resolveMessage(key, substitutions);
  if (typeof message === 'string' && message.trim()) {
    return message;
  }
  if (typeof fallback === 'string' && fallback.trim()) {
    return fallback;
  }
  if (fallback !== undefined && fallback !== null) {
    return fallback;
  }
  return key;
}

/**
 * i18n 対応の Error オブジェクトを生成する。
 * @param {string} key - メッセージキー
 * @param {{substitutions?: string|string[], fallback?: string}} [options] - 代入値とフォールバック
 * @returns {Error}
 */
export function createI18nError(key, options = {}) {
  const error = new Error(translate(key, options));
  error.i18nKey = key;
  if (options?.substitutions !== undefined) {
    error.i18nSubstitutions = options.substitutions;
  }
  return error;
}

if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    localizePage();
  });
}
