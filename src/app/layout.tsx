import type { Metadata } from "next";
import { Space_Grotesk } from "next/font/google";
import type { ReactNode } from "react";
import "./globals.css";
import { ThemeScript } from "@/components/theme-script";

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space-grotesk",
  display: "swap"
});

export const metadata: Metadata = {
  title: "Acta | Neobrutalist DeFi",
  description:
    "Upfront premiums with up to 180% APY. Trustless settlement with zero liquidation risk."
};

export default function RootLayout({
  children
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="en" className={spaceGrotesk.variable}>
      <head>
        <ThemeScript />
      </head>
      <body className="font-space antialiased selection:bg-black selection:text-yuzu-main text-black dark:text-white">
        {children}
      </body>
    </html>
  );
}


