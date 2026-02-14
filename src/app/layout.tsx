import type { Metadata } from "next";
import "./globals.css";
import { env } from "@/config/env";

export const metadata: Metadata = {
  title: "StartdueValley",
  description: "Long-running autonomous coding harness demo app"
};

type RootLayoutProps = Readonly<{
  children: React.ReactNode;
}>;

export default function RootLayout({ children }: RootLayoutProps) {
  const appEnv = env.NODE_ENV;

  return (
    <html lang="en">
      <body data-app-env={appEnv}>{children}</body>
    </html>
  );
}
