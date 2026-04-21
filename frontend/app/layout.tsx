import type { Metadata, Viewport } from "next";
import { Archivo } from "next/font/google";
import Footer from "@/components/Footer";
import SiteHeader from "@/components/SiteHeader";
import AuthProvider from "@/features/auth/providers/AuthProvider";
import { HomeShellProvider } from "@/features/home/context/HomeShellContext";
import "./globals.css";

const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin"],
  display: "swap",
});

const siteDescription =
  "HumRahi Hub connects communities around civic issues: report local problems, fund transparent fixes, and volunteer with clear accountability and progress you can follow.";

function defaultMetadataBase(): URL {
  const explicit = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  if (explicit) return new URL(explicit);
  const v = process.env.VERCEL_URL?.trim();
  if (v) return new URL(`https://${v}`);
  return new URL("http://localhost:3000");
}

export const metadata: Metadata = {
  metadataBase: defaultMetadataBase(),
  applicationName: "HumRahi Hub",
  title: {
    default: "HumRahi Hub | Civic issues, transparent funding, community action",
    template: "%s | HumRahi Hub",
  },
  description: siteDescription,
  keywords: [
    "HumRahi Hub",
    "civic tech",
    "community issues",
    "social impact",
    "transparent funding",
    "volunteering",
    "local issues",
    "civic engagement",
  ],
  authors: [{ name: "HumRahi Hub" }],
  creator: "HumRahi Hub",
  openGraph: {
    type: "website",
    locale: "en_US",
    siteName: "HumRahi Hub",
    title: "HumRahi Hub | See a problem. Share it. Solve it together.",
    description: siteDescription,
  },
  twitter: {
    card: "summary_large_image",
    title: "HumRahi Hub",
    description: siteDescription,
  },
  category: "social",
};

export const viewport: Viewport = {
  themeColor: "#afff6f",
  colorScheme: "light",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${archivo.variable} h-full antialiased`}>
      <body className={`${archivo.className} min-h-full flex flex-col`}>
        <AuthProvider>
          <HomeShellProvider>
            <SiteHeader />
            <div className="pt-24">{children}</div>
            <Footer />
          </HomeShellProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
