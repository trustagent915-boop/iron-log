import { IBM_Plex_Mono, Manrope, Space_Grotesk } from "next/font/google";
import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import "./globals.css";

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap"
});

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap"
});

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-mono",
  display: "swap"
});

export const metadata: Metadata = {
  title: {
    default: "Iron Log",
    template: "%s | Iron Log"
  },
  description:
    "Iron Log e il training cockpit per tenere sotto controllo programma, sessioni custom e progressi direttamente dal telefono.",
  applicationName: "Iron Log",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Iron Log",
    statusBarStyle: "black-translucent"
  }
};

export const viewport: Viewport = {
  themeColor: "#11141a",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover"
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="it">
      <body className={`${manrope.variable} ${spaceGrotesk.variable} ${ibmPlexMono.variable}`}>
        {children}
      </body>
    </html>
  );
}
