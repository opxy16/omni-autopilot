import type { Metadata, Viewport } from "next";
import { B612, Atkinson_Hyperlegible } from "next/font/google";
import "./globals.css";

// B612 was designed for Airbus cockpit displays; Atkinson Hyperlegible for maximum legibility.
const cockpit = B612({ subsets: ["latin"], weight: ["400", "700"], variable: "--font-cockpit", display: "swap" });
const body = Atkinson_Hyperlegible({ subsets: ["latin"], weight: ["400", "700"], variable: "--font-body", display: "swap" });

export const metadata: Metadata = {
  title: "Omni Autopilot",
  description:
    "A set-it-and-forget-it portfolio autopilot on Reactive Omni: tracks a wallet across Ethereum, Base and Unichain Sepolia, alerts on LP ranges and rebalances automatically.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#08131f" },
    { media: "(prefers-color-scheme: light)", color: "#e7edf2" },
  ],
};

// Applies the saved theme before paint so there is no flash.
const themeScript = `try{var t=localStorage.getItem("theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${cockpit.variable} ${body.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
