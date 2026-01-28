/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        // Matching AnkiBeam Extension Colors (Emerald)
        primary: {
          50: "#ecfdf5",
          100: "#d1fae5",
          200: "#a7f3d0",
          300: "#6ee7b7",
          400: "#34d399",
          500: "#10b981", // Main Brand Color
          600: "#059669",
          700: "#047857",
          800: "#065f46",
          900: "#064e3b",
          950: "#022c22",
        },
        slate: {
          50: "#f8fafc", // bg-page
          100: "#f1f5f9", // bg-card-hover
          200: "#e2e8f0", // border-light
          300: "#cbd5e1", // border-hover
          400: "#94a3b8", // text-tertiary
          500: "#64748b",
          600: "#475569", // text-secondary
          700: "#334155",
          800: "#1e293b",
          900: "#0f172a", // text-main
          950: "#020617",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
      },
      boxShadow: {
        soft: "0 4px 6px -1px rgba(0, 0, 0, 0.02), 0 2px 4px -2px rgba(0, 0, 0, 0.02)",
        card: "0 10px 15px -3px rgba(0, 0, 0, 0.03), 0 4px 6px -2px rgba(0, 0, 0, 0.02)",
        glow: "0 20px 25px -5px rgba(16, 185, 129, 0.15), 0 8px 10px -6px rgba(16, 185, 129, 0.1)",
      },
    },
  },
  plugins: [],
};
