import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { Toaster } from "sonner";
import Providers from "./_contexts/Providers";
import PendingActions from "./_components/PendingActions";
import * as Sentry from "@sentry/nextjs";
import NavBar from "./_components/NavBar";
import { Box } from "@chakra-ui/react";

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
  other: {
    ...Sentry.getTraceData(),
  },
};

// Add or edit your "generateMetadata" to include the Sentry trace data:
// export function generateMetadata(): Metadata {
//   return {
//     // ... your existing metadata
//   };
// }

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
        <Providers>
          {/* <Announcement /> */}
          <NavBar />
          <Box className="pt-[138px]">{children}</Box>
          <PendingActions />
        </Providers>
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
