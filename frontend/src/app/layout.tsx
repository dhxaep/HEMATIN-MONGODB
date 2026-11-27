import type { Metadata, Viewport } from "next";
import { Inter, Nunito } from "next/font/google";
import Script from "next/script";
import "./globals.css";

const interFont = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-inter",
  display: "swap",
});

const nunitoFont = Nunito({
  subsets: ["latin"],
  weight: ["700", "800", "900"],
  style: ["normal", "italic"],
  variable: "--font-nunito",
  display: "swap",
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export const metadata: Metadata = {
  title: "Hematin — Personal Finance Tracker (MongoDB & Express API)",
  description:
    "Aplikasi pengatur keuangan pribadi berbasis Next.js, Node.js, ExpressJS REST API, dan MongoDB dengan fitur OCR scan struk.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Hematin",
  },
  icons: {
    icon: [
      { url: "/favicon.png", type: "image/png" },
      { url: "/icon.png", type: "image/png" },
    ],
    shortcut: "/favicon.png",
    apple: "/favicon.png",
  },
};

const SAKUGA_SCRIPTS = [
  "/sakuga/button.js?v=7",
  "/sakuga/toggle.js?v=4",
  "/sakuga/tabs.js?v=4",
  "/sakuga/progress.js?v=7",
  "/sakuga/toast.js?v=4",
  "/sakuga/tooltip.js?v=4",
  "/sakuga/input.js?v=4",
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="id"
      className={`${interFont.variable} ${nunitoFont.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        {SAKUGA_SCRIPTS.map((src) => (
          <Script key={src} src={src} strategy="afterInteractive" />
        ))}
      </body>
    </html>
  );
}
