"use client";

import { ClerkProvider, useAuth } from "@clerk/nextjs";
import { useEffect, useState } from "react";
import Modal from "../_components/Modal";
import QueryProvider from "./QueryProvider";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { NavSticky } from "./Sticky";
import { FullPageLoader } from "./FullPageLoader";
import CartReminder from "../_components/CartReminder";
import { ConvexQueryClient } from "@convex-dev/react-query";
import ConvexUserProvider from "./CreateConvexUser";
import { convexClient } from "@/convex/convex";
import { GUEST_TOKEN_STORAGE_KEY } from "@/app/_lib/guestAuth";

const convexQueryClient = new ConvexQueryClient(convexClient);
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryKeyHashFn: convexQueryClient.hashFn(),
      queryFn: convexQueryClient.queryFn(),
    },
  },
});
convexQueryClient.connect(queryClient);
export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider
      publishableKey={process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY}
    >
      <InnerProviders>{children}</InnerProviders>
    </ClerkProvider>
  );
}

function InnerProviders({ children }: { children: React.ReactNode }) {
  return (
    <Modal>
      <QueryProvider>
        <ConvexProviderWithClerk client={convexClient} useAuth={useHybridAuth}>
          <QueryClientProvider client={queryClient}>
            <NavSticky defaultPosition={35}>
              <ConvexUserProvider>
                {/* <SmoothLayout> */}
                <FullPageLoader>
                  {/* <NavBar /> */}
                  <CartReminder />
                  {children}
                </FullPageLoader>
              </ConvexUserProvider>
              {/* </SmoothLayout> */}
            </NavSticky>
          </QueryClientProvider>
        </ConvexProviderWithClerk>
      </QueryProvider>
    </Modal>
  );
}

function useHybridAuth() {
  const auth = useAuth();
  const [guestToken, setGuestToken] = useState<string | null>(null);

  useEffect(() => {
    if (!auth.isSignedIn) {
      const token = localStorage.getItem(GUEST_TOKEN_STORAGE_KEY);
      setGuestToken(token ?? null);
    } else {
      setGuestToken(null);
    }
  }, [auth.isSignedIn]);

  return {
    ...auth,
    getToken: async (
      options?: Parameters<NonNullable<typeof auth.getToken>>[0]
    ) => {
      const token = auth.getToken ? await auth.getToken(options) : null;
      if (token) return token;

      return (
        guestToken ?? localStorage.getItem(GUEST_TOKEN_STORAGE_KEY) ?? null
      );
    },
  };
}
