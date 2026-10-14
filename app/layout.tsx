import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import { NavLinks } from "@/components/shell/nav-links";
import { ThemeControl } from "@/components/shell/theme-control";
import { THEME_SCRIPT } from "@/components/shell/theme";
import { isLocalOnlyEnabled } from "@/src/local";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "VerifAI",
  description: "Evaluating a customer-support agent for Volt & Case, a phone-accessories shop.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // The theme script changes the class and data-theme before hydration.
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} antialiased`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="flex min-h-dvh flex-col">
        <header className="border-b">
          {/* On a phone the navigation drops to its own row. */}
          <div className="mx-auto flex max-w-350 flex-wrap items-center gap-x-6 px-4 sm:h-11 sm:flex-nowrap">
            <Link href="/" className="flex h-11 items-center font-semibold text-foreground no-underline hover:no-underline">
              VerifAI
            </Link>
            <div className="order-last flex h-9 w-full sm:order-none sm:h-full sm:w-auto">
              <NavLinks showLocalOnly={isLocalOnlyEnabled()} />
            </div>
            <div className="ml-auto">
              <ThemeControl />
            </div>
          </div>
        </header>
        <main className="mx-auto flex w-full max-w-350 min-w-0 flex-1 flex-col px-4 py-4">{children}</main>
      </body>
    </html>
  );
}
