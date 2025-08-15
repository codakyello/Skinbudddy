"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { useUser } from "@clerk/clerk-react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";

const GUEST_ID_KEY = "convex_guest_id";

const generateGuestId = () => `guest_${crypto.randomUUID()}`;

type ConvexUserContextValue = {
  userId: string | undefined | null;
};

const ConvexUserContext = createContext<ConvexUserContextValue>({
  userId: undefined,
});

export default function ConvexUserProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, isSignedIn } = useUser();
  const createUser = useMutation(api.users.createUser);
  const [userId, setConvexUserId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      if (!isSignedIn || !user) {
        let guestId = localStorage.getItem(GUEST_ID_KEY);

        if (!guestId) {
          guestId = generateGuestId();
          localStorage.setItem(GUEST_ID_KEY, guestId);

          await createUser({ userId: guestId });
        }

        setConvexUserId(guestId);
      } else {
        // Optional: Clear guest ID since user is now signed in
        localStorage.removeItem(GUEST_ID_KEY);
        // Set the user id from clerk
        setConvexUserId(user.id);
      }
    })();
  }, [isSignedIn, user, createUser]);

  return (
    <ConvexUserContext.Provider value={{ userId }}>
      {children}
    </ConvexUserContext.Provider>
  );
}

export const useConvexUser = () => {
  const context = useContext(ConvexUserContext);
  if (!context) {
    throw new Error("useConvexUser must be used within a ConvexUserProvider");
  }
  return context;
} 
