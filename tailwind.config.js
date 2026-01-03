/**
 * Tailwind CSS 設定（拡張用）。
 * - content は popup / options / utils 配下の HTML/JS を対象
 * - safelist は現状不要（静的クラス中心）。必要時に追加。
 */
module.exports = {
	content: [
		"./popup/**/*.{html,js}",
		"./options/**/*.{html,js}",
		"./utils/**/*.js",
		"./content/**/*.js",
	],
	theme: {
		extend: {
			colors: {
				primary: {
					50: "rgb(var(--primary-50) / <alpha-value>)",
					100: "rgb(var(--primary-100) / <alpha-value>)",
					200: "rgb(var(--primary-200) / <alpha-value>)",
					300: "rgb(var(--primary-300) / <alpha-value>)",
					400: "rgb(var(--primary-400) / <alpha-value>)",
					DEFAULT: "rgb(var(--primary-500) / <alpha-value>)",
					500: "rgb(var(--primary-500) / <alpha-value>)",
					600: "rgb(var(--primary-600) / <alpha-value>)",
					700: "rgb(var(--primary-700) / <alpha-value>)",
				},
				page: "rgb(var(--bg-page) / <alpha-value>)",
				card: {
					DEFAULT: "rgb(var(--bg-card) / <alpha-value>)",
					hover: "rgb(var(--bg-card-hover) / <alpha-value>)",
				},
				main: "rgb(var(--text-main) / <alpha-value>)",
				secondary: "rgb(var(--text-secondary) / <alpha-value>)",
				tertiary: "rgb(var(--text-tertiary) / <alpha-value>)",
				border: {
					light: "rgb(var(--border-light) / <alpha-value>)",
					hover: "rgb(var(--border-hover) / <alpha-value>)",
				},
			},
			borderRadius: {
				"lg": "var(--radius-lg)",
				"xl": "var(--radius-xl)",
				"2xl": "var(--radius-2xl)",
			},
			boxShadow: {
				subtle: "var(--shadow-subtle)",
				card: "var(--shadow-card)",
				float: "var(--shadow-float)",
			},
		},
	},
	plugins: [],
};
