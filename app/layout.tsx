import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Forkcast — every fork in your decision, mapped",
  description:
    "Paste any written decision or SOP. Forkcast turns it into a decision-grade flowchart: every gate, actor, loop and gap made explicit.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700&family=Source+Sans+3:ital,wght@0,400;0,600;1,400&display=swap"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
