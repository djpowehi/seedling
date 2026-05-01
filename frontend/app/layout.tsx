import type { Metadata } from "next";
import {
  Geist,
  Geist_Mono,
  Instrument_Serif,
  Inter,
  JetBrains_Mono,
} from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Landing-page typography (Claude Design brief). These ride alongside
// the Geist pair already used by the dashboard — coexist via CSS vars.
const instrumentSerif = Instrument_Serif({
  variable: "--font-instrument-serif",
  weight: "400",
  style: ["normal", "italic"],
  subsets: ["latin"],
});

const inter = Inter({
  variable: "--font-inter",
  weight: ["400", "500", "600"],
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  weight: ["400", "500"],
  subsets: ["latin"],
});

const SITE_URL = "https://seedlingsol.xyz";
const SITE_TITLE = "Seedling — allowance that grows";
const SITE_DESCRIPTION =
  "Programmable allowance for families on Solana. Money grows, habits grow, kids grow with both. Parents deposit USDC, the vault earns ~8% via Kamino, and the kid is paid on the 1st of every month plus a year-end annual bonus from accumulated yield.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: SITE_TITLE,
  description: SITE_DESCRIPTION,
  applicationName: "Seedling",
  authors: [{ name: "Vicenzo Tulio", url: "https://twitter.com/seedling_sol" }],
  keywords: [
    "solana",
    "allowance",
    "kids",
    "family finance",
    "kamino",
    "yield",
    "usdc",
  ],
  openGraph: {
    type: "website",
    url: SITE_URL,
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    siteName: "Seedling",
  },
  twitter: {
    card: "summary_large_image",
    site: "@seedling_sol",
    creator: "@seedling_sol",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${instrumentSerif.variable} ${inter.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-stone-50 text-stone-900">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
