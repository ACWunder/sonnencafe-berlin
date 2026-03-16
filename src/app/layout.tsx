// src/app/layout.tsx

import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SonnenCafé Wien – Sonnige Cafés in Wien entdecken",
  description:
    "Finde Cafés und Spots in Wien, die genau jetzt oder zur gewünschten Uhrzeit in der Sonne liegen.",
  keywords: ["Wien", "Café", "Sonne", "Sonnig", "Schanigarten", "Vienna"],
  openGraph: {
    title: "SonnenCafé Wien",
    description: "Sonnige Cafés in Wien – jetzt und zu jeder Uhrzeit",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="de">
      <body>{children}</body>
    </html>
  );
}
