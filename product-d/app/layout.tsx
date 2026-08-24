import type { Metadata } from "next";
import type { ReactNode } from "react";

import "./globals.css";

export const metadata: Metadata = {
  title: "Riverside Books | Marketing Content Generator",
  description:
    "A staff workspace for creating review-ready social content from trusted Riverside Books records.",
};

interface RootLayoutProps {
  children: ReactNode;
}

/**
 * Establishes the document shell shared by the Product D staff workspace.
 */
export default function RootLayout({ children }: Readonly<RootLayoutProps>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
