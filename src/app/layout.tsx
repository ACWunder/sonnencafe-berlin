// src/app/layout.tsx

import type { Metadata, Viewport } from "next";
import { Analytics } from "@vercel/analytics/next";
import { ServiceWorkerRegistration } from "@/components/ServiceWorkerRegistration";
import "./globals.css";

export const viewport: Viewport = {
  themeColor: "#f59e0b",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export const metadata: Metadata = {
  title: "Sonnencafe Berlin – Sonnige Cafés entdecken",
  description:
    "Welches Café in Berlin liegt gerade in der Sonne? Sonnencafe zeigt dir in Echtzeit, wo du jetzt einen sonnigen Platz findest – für jeden Tag und jede Uhrzeit.",
  keywords: ["Berlin", "Café", "Sonne", "Sonnig", "Außengastronomie", "Kaffee", "Terrasse"],
  authors: [{ name: "Sonnencafe Berlin" }],
  creator: "Sonnencafe Berlin",
  applicationName: "Sonnencafe Berlin",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Sonnencafé",
  },
  formatDetection: {
    telephone: false,
  },
  openGraph: {
    title: "Sonnencafe Berlin – Sonnige Cafés entdecken",
    description: "Welches Café in Berlin liegt gerade in der Sonne? Echtzeit-Schattenberechnung für Berlin.",
    type: "website",
    locale: "de_DE",
    siteName: "Sonnencafe Berlin",
  },
  twitter: {
    card: "summary",
    title: "Sonnencafe Berlin",
    description: "Welches Café in Berlin liegt gerade in der Sonne?",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="de">
      <body>
        {children}
        <Analytics />
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}
