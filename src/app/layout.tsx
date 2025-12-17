import type { Metadata } from "next";
import { Space_Grotesk } from "next/font/google";
import type { ReactNode } from "react";
import "./globals.css";

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space-grotesk",
  display: "swap"
});

export const metadata: Metadata = {
  title: "Yuzu Markets | Neobrutalist DeFi",
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
      <body className="font-space text-black antialiased selection:bg-black selection:text-yuzu-main">
        {children}
      </body>
    </html>
  );
}


