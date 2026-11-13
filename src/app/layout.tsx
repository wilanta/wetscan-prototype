import type { Metadata } from "next";
import { DemoProvider } from "@/components/demo-provider";
import "./globals.css";
export const metadata: Metadata = {
  title: "WetScan — Your app, understood. Your next step, clear.",
  description:
    "A friendly application security workspace. Explore a clearly labeled, fully local interactive demo.",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <DemoProvider>{children}</DemoProvider>
      </body>
    </html>
  );
}
