"use client";

import { ClerkProvider, useAuth } from "@clerk/nextjs";
import Modal from "../_components/Modal";
import QueryProvider from "./QueryProvider";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { NavSticky } from "./Sticky";
import { FullPageLoader } from "./FullPageLoader";
import CartReminder from "../_components/CartReminder";
import { ConvexReactClient } from "convex/react";
import { ConvexQueryClient } from "@convex-dev/react-query";
import ConvexUserProvider from "./CreateConvexUser";
import AuthProvider from "./AuthProvider";

const convex = new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

const convexQueryClient = new ConvexQueryClient(convex);
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
    <Modal>
      <QueryProvider>
        <AuthProvider >
          <ClerkProvider>
            <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
              <QueryClientProvider client={queryClient}>
                <NavSticky defaultPosition={35}>
                  <ConvexUserProvider>
                    {/* <SmoothLayout> */}
                    <FullPageLoader>
                      <CartReminder />
                      {children}
                    </FullPageLoader>
                  </ConvexUserProvider>
                  {/* </SmoothLayout> */}
                </NavSticky>
              </QueryClientProvider>
            </ConvexProviderWithClerk>
          </ClerkProvider>
        </AuthProvider>
      </QueryProvider>
    </Modal>
  );
}
