import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        bg: {
          primary: "var(--bg-primary)",
          secondary: "var(--bg-secondary)",
          tertiary: "var(--bg-tertiary)",
          border: "var(--bg-border)",
          "border-active": "var(--bg-border-active)"
        },
        content: {
          primary: "var(--content-primary)",
          secondary: "var(--content-secondary)",
          tertiary: "var(--content-tertiary)"
        },
        accent: {
          primary: "rgb(var(--accent-primary-rgb) / <alpha-value>)",
          secondary: "var(--accent-secondary)",
          deep: "var(--accent-primary-deep)"
        },
        action: {
          primary: "var(--action-primary)",
          secondary: "var(--action-secondary)",
          tertiary: "var(--action-tertiary)"
        },
        additional: {
          red: {
            primary: "var(--additional-red-primary)",
            "primary-deep": "var(--additional-red-primary-deep)",
            secondary: "var(--additional-red-secondary)"
          },
          orange: {
            primary: "var(--additional-orange-primary)",
            "primary-deep": "var(--additional-orange-primary-deep)",
            secondary: "var(--additional-orange-secondary)"
          },
          gold: {
            primary: "var(--additional-gold-primary)",
            "primary-deep": "var(--additional-gold-primary-deep)",
            secondary: "var(--additional-gold-secondary)"
          },
          green: {
            primary: "var(--additional-green-primary)",
            "primary-deep": "var(--additional-green-primary-deep)",
            secondary: "var(--additional-green-secondary)"
          },
          blue: {
            primary: "var(--additional-blue-primary)",
            "primary-deep": "var(--additional-blue-primary-deep)",
            secondary: "var(--additional-blue-secondary)"
          },
          violet: {
            primary: "var(--additional-violet-primary)",
            "primary-deep": "var(--additional-violet-primary-deep)",
            secondary: "var(--additional-violet-secondary)"
          }
        },
        error: "var(--error)",
        // Legacy alias for opacity support (rgb format)
        "yuzu-main": "rgb(var(--accent-primary-rgb) / <alpha-value>)"
      },
      fontFamily: {
        space: ["var(--font-space-grotesk)", "system-ui", "sans-serif"],
        mono: ["var(--font-jetbrains-mono)", "monospace"]
      },
      keyframes: {
        marquee: {
          "0%": { transform: "translateX(0)" },
          "100%": { transform: "translateX(-50%)" }
        }
      },
      animation: {
        marquee: "marquee 20s linear infinite"
      }
    }
  },
  plugins: []
};

export default config;
