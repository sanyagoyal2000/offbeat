import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans, Unbounded } from "next/font/google";
import "./globals.css";
import { AppShell } from "@/components/AppShell";
import { exploreLocation } from "@/lib/server/identity";

const unbounded = Unbounded({
  variable: "--font-unbounded",
  subsets: ["latin"],
  weight: ["700"],
});

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Offbeat",
  description: "Find experiences that fit your taste, wherever you are and help organizers discover demand for their next event.",
};

// Pages depend on cookies (location, visitor id) and live inventory, so render per request.
export const dynamic = "force-dynamic";

export const viewport: Viewport = {
  themeColor: "#10110F",
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const explore = await exploreLocation();
  return (
    <html lang="en" className={`${unbounded.variable} ${jakarta.variable}`}>
      <body>
        <div className="flex min-h-dvh flex-col">
          <AppShell explore={explore}>{children}</AppShell>
        </div>
      </body>
    </html>
  );
}
