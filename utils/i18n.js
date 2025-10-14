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

if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    localizePage();
  });
}
