import type { Metadata } from "next";
import { DemoProvider } from "@/components/demo-provider";
import "./globals.css";

export const metadata: Metadata = {
  title: "WetScan — Application Security Intelligence Platform",
  description:
    "Unified application security platform connecting interactive architecture mapping (Canvas), pre-merge Guard scans & CI/CD gates, and Sentinel runtime detection.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body>
        <DemoProvider>{children}</DemoProvider>
      </body>
    </html>
  );
}
