import type { Metadata, Viewport } from "next";
import { Space_Grotesk, JetBrains_Mono } from "next/font/google";
import { Suspense, type ReactNode } from "react";
import { RefCapture } from "@/components/referral/ref-capture";
import { WebMcpProvider } from "@/components/webmcp-provider";
import { SITE_DESCRIPTION, SITE_LINE, SITE_NAME, describe, previewImage, siteOrigin } from "@/lib/site-metadata";
import "./globals.css";

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
  metadataBase: new URL(siteOrigin()),
  title: {
    default: `${SITE_NAME}: ${SITE_LINE}`,
    template: `%s | ${SITE_NAME}`
  },
  description: describe(SITE_DESCRIPTION),
  applicationName: SITE_NAME,
  appleWebApp: { title: SITE_NAME },
  // a price or a date on the page is not a phone number or an appointment to tap
  formatDetection: { telephone: false, date: false, address: false, email: false },
  // the picture of any page that states no preview of its own (the guide, a wrong address)
  openGraph: { siteName: SITE_NAME, type: "website", images: [previewImage("site")] }
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
