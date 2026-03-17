import type { Metadata } from "next";
import { JetBrains_Mono } from "next/font/google";
import localFont from "next/font/local";
import { SessionProvider } from "@/components/session-provider";
import "./globals.css";

const happyFont = localFont({
  src: [
    {
      path: "../../public/fonts/Happiness-Sans-Regular.woff2",
      weight: "400",
      style: "normal",
    },
    {
      path: "../../public/fonts/Happiness-Sans-Bold.woff2",
      weight: "700",
      style: "normal",
    },
    {
      path: "../../public/fonts/Happiness-Sans-Title.woff2",
      weight: "900",
      style: "normal",
    },
  ],
  variable: "--font-app-sans",
});

const mono = JetBrains_Mono({
  variable: "--font-app-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Meeting Alignment AI",
  description: "Role-aware meeting briefing and live assist experience.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body className={`${happyFont.variable} ${mono.variable} antialiased`}>
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  );
}
