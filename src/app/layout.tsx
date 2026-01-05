import type { Metadata } from "next";
import { Space_Grotesk, Syne } from "next/font/google";
import type { ReactNode } from "react";
import "./globals.css";
import { ThemeScript } from "@/components/theme-script";

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space-grotesk",
  display: "swap"
});

const syne = Syne({
  subsets: ["latin"],
  variable: "--font-syne",
  display: "swap"
});

export const metadata: Metadata = {
  title: {
    default: "Acta",
    template: "%s | Acta"
  },
  description:
    "Earn upfront yield with up to 180% APY. Trustless on-chain options with zero liquidation risk."
};

export default function RootLayout({
  children
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="en" className={`${spaceGrotesk.variable} ${syne.variable}`}>
      <head>
        <ThemeScript />
      </head>
      <body className="font-space antialiased selection:bg-accent-primary selection:text-bg-primary text-content-primary">
        {children}
      </body>
    </html>
  );
}
