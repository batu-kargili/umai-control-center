import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "rgb(var(--ink) / <alpha-value>)",
        sand: "rgb(var(--sand) / <alpha-value>)",
        slate: "rgb(var(--slate) / <alpha-value>)",
        accent: "rgb(var(--accent) / <alpha-value>)",
        secondary: "rgb(var(--secondary) / <alpha-value>)",
        mint: "rgb(var(--mint) / <alpha-value>)",
        danger: "rgb(var(--danger) / <alpha-value>)",
      },
      borderRadius: {
        xl: "14px",
        "2xl": "18px",
      },
      fontFamily: {
        sans: ["var(--font-inter)", "sans-serif"],
        display: ["var(--font-inter)", "sans-serif"],
      },

      boxShadow: {
        lift: "0 18px 60px rgba(0, 0, 0, 0.12)",
        soft: "0 12px 30px rgba(0, 0, 0, 0.08)",
        accent: "0 16px 36px rgba(15, 98, 254, 0.18)",
      },
    },
  },
  plugins: [],
};

export default config;
