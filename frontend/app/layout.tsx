import type { Metadata } from "next";
import { Archivo } from "next/font/google";
import Footer from "@/components/Footer";
import SiteHeader from "@/components/SiteHeader";
import AuthProvider from "@/features/auth/providers/AuthProvider";
import "./globals.css";

const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "HumRahi hub",
  description: "HumRahi hub frontend",
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
          <SiteHeader />
          <div className="pt-24">{children}</div>
          <Footer />
        </AuthProvider>
      </body>
    </html>
  );
}
