import type { Config } from "tailwindcss";

// SAMA brand palette
//  - Pomegranate Maroon #3B171B (primary)
//  - Sama Gold          #C5A04F (accent)
//  - Secondary Maroon   #841424
//  - Al-Jabal Green     #098E4B (success)
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        maroon: {
          50: "#faf5f5",
          100: "#f3e8e9",
          200: "#e3cbce",
          300: "#cda6ab",
          400: "#a96e75",
          500: "#84424b",
          600: "#5f2a31",
          700: "#4a1f24",
          800: "#3b171b",
          900: "#2e1215",
          950: "#1f0b0d",
          DEFAULT: "#3b171b",
        },
        gold: {
          50: "#fbf8f1",
          100: "#f5eedd",
          200: "#eadcb8",
          300: "#ddc68d",
          400: "#d1b36a",
          500: "#c5a04f",
          600: "#a98540",
          700: "#886a35",
          800: "#67502a",
          900: "#4a3a20",
          950: "#2b2213",
          DEFAULT: "#c5a04f",
        },
        crimson: {
          50: "#fdf3f4",
          100: "#fbe4e7",
          200: "#f6ccd2",
          300: "#eda3ad",
          400: "#e06e7f",
          500: "#cc4257",
          600: "#a92440",
          700: "#841424",
          800: "#6f1322",
          900: "#5f1421",
          DEFAULT: "#841424",
        },
        jabal: {
          50: "#effaf3",
          100: "#d8f3e2",
          200: "#b4e6c9",
          300: "#82d3a9",
          400: "#4eb884",
          500: "#2b9d68",
          600: "#098e4b",
          700: "#146541",
          800: "#125135",
          900: "#10432d",
          DEFAULT: "#098e4b",
        },
      },
      fontFamily: {
        sans: [
          "var(--font-nunito)",
          "var(--font-tajawal)",
          "ui-sans-serif",
          "system-ui",
          "sans-serif",
        ],
        arabic: ["var(--font-tajawal)", "var(--font-nunito)", "sans-serif"],
      },
      boxShadow: {
        card: "0 1px 3px 0 rgb(59 23 27 / 0.08), 0 1px 2px -1px rgb(59 23 27 / 0.08)",
      },
    },
  },
  plugins: [],
};
export default config;
