import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // Primary brand: Amber/Pika yellow — warm, energetic, memorable
        pika: {
          50:  "#FFFBEB",
          100: "#FEF3C7",
          200: "#FDE68A",
          300: "#FCD34D",
          400: "#FBBF24", // ← Main accent
          500: "#F59E0B",
          600: "#D97706",
          700: "#B45309",
          800: "#92400E",
          900: "#78350F",
        },
        // Neutral base: Slate — clean, professional
        slate: {
          50:  "#F8FAFC",
          100: "#F1F5F9",
          200: "#E2E8F0",
          300: "#CBD5E1",
          400: "#94A3B8",
          500: "#64748B",
          600: "#475569",
          700: "#334155",
          800: "#1E293B",
          900: "#0F172A",
        },
        // Secondary accent: Purple — CTAs, primary actions
        accent: {
          400: "#A78BFA",
          500: "#8B5CF6",
          600: "#7C3AED",
          700: "#6D28D9",
        },
        // Status colors
        success: "#10B981",
        danger:  "#EF4444",
        info:    "#3B82F6",
        // Legacy brand tokens remapped so existing tool pages keep working.
        // brand-600 (primary buttons) now resolves to accent-500 purple.
        brand: {
          50:  "#FFFBEB",
          100: "#FEF3C7",
          200: "#FDE68A",
          300: "#FCD34D",
          400: "#FBBF24",
          500: "#F59E0B",
          600: "#8B5CF6",
          700: "#7C3AED",
          800: "#6D28D9",
          900: "#5B21B6",
        },
        surface: {
          DEFAULT: "#ffffff",
          secondary: "#F8FAFC",
          tertiary: "#F1F5F9",
          border: "#E2E8F0",
        },
        dark: {
          surface: "#1E293B",
          secondary: "#334155",
          tertiary: "#475569",
          border: "#64748B",
        },
      },
      fontFamily: {
        sans: ["var(--font-inter)", "Inter", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "JetBrains Mono", "monospace"],
      },
      maxWidth: {
        container: "1200px",
      },
    },
  },
  plugins: [require("@tailwindcss/typography")],
};

export default config;
