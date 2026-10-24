import type { Config } from "tailwindcss";

// Token-mapped theme from replica/design/tokens.json — no raw hex in components.
export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "var(--color-bg)",
        surface: { DEFAULT: "var(--color-surface)", raised: "var(--color-surface-raised)" },
        border: { DEFAULT: "var(--color-border)", input: "var(--color-border-input)" },
        text: { DEFAULT: "var(--color-text)", muted: "var(--color-text-muted)" },
        accent: {
          DEFAULT: "var(--color-accent)",
          strong: "var(--color-accent-strong)",
          soft: "var(--color-accent-soft)",
        },
        "on-accent": "var(--color-on-accent)",
        danger: "var(--color-danger)",
        success: "var(--color-success)",
        warning: "var(--color-warning)",
        board: { light: "var(--color-board-light)", dark: "var(--color-board-dark)" },
        "last-move": "var(--color-last-move)",
        "move-hint": "var(--color-move-hint)",
        check: "var(--color-check)",
      },
      gridTemplateRows: { "8": "repeat(8, minmax(0, 1fr))" },
        fontFamily: {
        sans: ["Inter", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      borderRadius: { sm: "6px", md: "10px", lg: "16px", pill: "999px" },
      boxShadow: { card: "var(--shadow-card)", pop: "var(--shadow-pop)" },
      transitionDuration: { fast: "120ms", base: "200ms" },
      transitionTimingFunction: { ease: "cubic-bezier(.2,.8,.2,1)" },
    },
  },
  plugins: [],
} satisfies Config;
