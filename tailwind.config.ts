import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        "yuzu-main": "#CCFF00",
        "yuzu-accent": "#FF00E5",
        "yuzu-dark": "#0F0F0F",
        "off-white": "#F0F0F0"
      },
      fontFamily: {
        space: ["var(--font-space-grotesk)", "system-ui", "sans-serif"]
      },
      boxShadow: {
        neo: "6px 6px 0px 0px #000000",
        "neo-hover": "10px 10px 0px 0px #000000",
        "neo-sm": "3px 3px 0px 0px #000000"
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


