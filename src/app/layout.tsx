import type { Metadata } from "next";
import { Inter } from "next/font/google";

import "./globals.css";
import Providers from "./providers";
import {
  CONTROL_CENTER_DESCRIPTION,
  CONTROL_CENTER_NAME,
} from "src/lib/branding";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});


export const metadata: Metadata = {
  title: CONTROL_CENTER_NAME,
  description: CONTROL_CENTER_DESCRIPTION,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${inter.variable} font-sans`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
