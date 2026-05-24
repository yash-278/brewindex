import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Header } from "@/components/header";
import { getCasksCount } from "@/lib/queries";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "BrewIndex",
  description: "Discover and install macOS apps available via Homebrew",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  let caskCount = 0;
  try {
    caskCount = await getCasksCount();
  } catch {
    // DB unavailable (cold-start, quota, network) — render without count
    // rather than crashing all pages. The header treats 0 as a loading state.
  }

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <Header caskCount={caskCount} />
        {children}
      </body>
    </html>
  );
}
