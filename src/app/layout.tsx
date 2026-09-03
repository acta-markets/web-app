import type { Metadata, Viewport } from "next";
import { Space_Grotesk, JetBrains_Mono } from "next/font/google";
import { Suspense, type ReactNode } from "react";
import { RefCapture } from "@/components/referral/ref-capture";
import { WebMcpProvider } from "@/components/webmcp-provider";
import "./globals.css";
import "@fontsource/syne/400.css";
import "@fontsource/syne/600.css";
import "@fontsource/syne/700.css";
import "@fontsource/syne/800.css";

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space-grotesk",
  display: "swap"
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  display: "swap"
});

export const viewport: Viewport = {
  themeColor: "#121212",
};

export const metadata: Metadata = {
  title: {
    default: "Acta",
    template: "%s | Acta"
  },
  description:
    "Curated yield vaults for SOL and tokenized stocks. Weekly cash income from trading desks, no leverage, no liquidations."
};

export default function RootLayout({
  children
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="en" className={`${spaceGrotesk.variable} ${jetbrainsMono.variable}`}>
      <body className="font-mono antialiased selection:bg-accent-primary selection:text-bg-primary text-content-primary">
        <Suspense fallback={null}>
          <RefCapture />
        </Suspense>
        <WebMcpProvider />
        {children}
      </body>
    </html>
  );
}
