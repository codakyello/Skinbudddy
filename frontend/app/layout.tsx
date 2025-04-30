import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import AuthProvider from "./_contexts/AuthProvider";
import { authenticate } from "./_lib/data-service";
import QueryProvider from "./_contexts/QueryProvider";
import Announcement from "./_components/Announcement";
import { FullPageLoader } from "./_contexts/FullPageLoader";
import { Toaster } from "sonner";
import NavBar from "./_components/NavBar";
import Modal from "./_components/Modal";
import CartReminder from "./_components/CartReminder";
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
        <Modal>
          <QueryProvider>
            <AuthProvider authenticateFn={authenticate}>
              <FullPageLoader>
                <CartReminder />
                <Announcement />
                <NavBar />
                {children}
              </FullPageLoader>
            </AuthProvider>
          </QueryProvider>
        </Modal>

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
