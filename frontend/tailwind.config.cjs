/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: "class",
  content: [
    "./index.html",
    "./src/**/*.{ts,tsx,js,jsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      colors: {
        // [MỚI] Màu Primary động (Thay đổi theo Theme)
        primary: {
          DEFAULT: 'rgb(var(--primary) / <alpha-value>)',
          hover: 'rgb(var(--primary-hover) / <alpha-value>)',
          active: 'rgb(var(--primary-active) / <alpha-value>)',
        },
        // Các màu cũ của anh
        bg: {
          light: "#f8fafc",
          dark: "#0b0f14",
        },
        panel: {
          light: "#ffffff",
          dark: "#111827",
        },
        accent: {
          DEFAULT: "#22d3ee",
          soft: "#67e8f9",
        },
        danger: "#ef4444",
        warning: "#f59e0b",
        success: "#22c55e",
      },
      // [MỚI] Animation quay chậm (cho icon loading)
      animation: {
        'spin-slow': 'spin 3s linear infinite',
      }
    },
  },
  plugins: [],
};