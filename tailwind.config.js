/**
 * Tailwind CSS 設定（拡張用）。
 * - content は popup / options / utils 配下の HTML/JS を対象
 * - safelist は現状不要（静的クラス中心）。必要時に追加。
 */
module.exports = {
  content: [
    './popup/**/*.{html,js}',
    './options/**/*.{html,js}',
    './utils/**/*.js',
  ],
  theme: {
    extend: {},
  },
  plugins: [],
};

