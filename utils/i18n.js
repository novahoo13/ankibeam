// i18n.js - 国际化工具
// 一个简单的 i18n 实现

/**
 * (待实现) 根据 data-i18n 属性翻译页面上的所有元素
 */
export function localizePage() {
  const elements = document.querySelectorAll('[data-i18n]');
  elements.forEach(el => {
    const key = el.getAttribute('data-i18n');
    const translation = chrome.i18n.getMessage(key);
    if (translation) {
      // 根据元素类型，设置 content, value, placeholder 等
      if (el.placeholder) {
        el.placeholder = translation;
      } else {
        el.textContent = translation;
      }
    }
  });
}

/**
 * (待实现) 获取翻译字符串
 * @param {string} key - 语言包中的 key
 * @param {string|string[]} [substitutions] - 替换占位符
 * @returns {string}
 */
export function getMessage(key, substitutions) {
  return chrome.i18n.getMessage(key, substitutions);
}

// 在 popup.js 和 options.js 中，可以在 DOMContentLoaded 时调用 localizePage()
// document.addEventListener('DOMContentLoaded', localizePage);
