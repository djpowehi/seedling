import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
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

const SITE_URL = "https://seedlingsol.xyz";
const SITE_TITLE = "Seedling — allowance that grows";
const SITE_DESCRIPTION =
  "Parents deposit USDC. Kamino lends it at ~8% APY. The kid gets paid on the 1st of every month, plus a yield bonus when the year ends.";

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
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-stone-50 text-stone-900">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
