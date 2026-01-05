import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // Background colors
        bg: {
          primary: "var(--bg-primary)",
          secondary: "var(--bg-secondary)",
          tertiary: "var(--bg-tertiary)",
          border: "var(--bg-border)",
          "border-active": "var(--bg-border-active)"
        },
        // Content/text colors
        content: {
          primary: "var(--content-primary)",
          secondary: "var(--content-secondary)",
          tertiary: "var(--content-tertiary)"
        },
        // Accent colors (primary brand green)
        accent: {
          primary: "var(--accent-primary)",
          secondary: "var(--accent-secondary)",
          deep: "var(--accent-primary-deep)"
        },
        // Action/interactive surface colors
        action: {
          primary: "var(--action-primary)",
          secondary: "var(--action-secondary)",
          tertiary: "var(--action-tertiary)"
        },
        // Semantic/additional colors
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
        // Legacy aliases for backward compatibility (using rgb for opacity support)
        "yuzu-main": "rgb(var(--accent-primary-rgb) / <alpha-value>)",
        "yuzu-accent": "var(--additional-violet-primary)",
        "yuzu-dark": "var(--bg-primary)",
        "off-white": "var(--bg-tertiary)"
      },
      fontFamily: {
        space: ["var(--font-space-grotesk)", "system-ui", "sans-serif"],
        syne: ["var(--font-syne)", "system-ui", "sans-serif"]
      },
      boxShadow: {
        neo: "6px 6px 0px 0px var(--bg-border)",
        "neo-hover": "10px 10px 0px 0px var(--bg-border)",
        "neo-sm": "3px 3px 0px 0px var(--bg-border)"
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
