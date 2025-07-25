import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import Announcement from "./_components/Announcement";
import { Toaster } from "sonner";
import Providers from "./_contexts/Providers";
// import SmoothLayout from "./_components/SmoothLayout";
const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});

const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});

export const metadata: Metadata = {
  title: "Skin Buddy",
  description:
    "Skin Buddy is a skin care app that helps you track your skin care routine and products.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} min-h-screen ${geistMono.variable} antialiased`}
      >
        <Announcement />
        <Providers>{children}</Providers>
        <Toaster
          richColors
          closeButton
          position="top-right"
          toastOptions={{
            style: {
              borderRadius: "0px",
              width: "fit-content",
              maxWidth: "350px",
              wordWrap: "break-word",
            },
          }}
        />
      </body>
    </html>
  );
}
