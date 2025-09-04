"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { useUser as useClerkUser } from "@clerk/clerk-react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { User } from "../_utils/types";

const GUEST_ID_KEY = "convex_guest_id";

const generateGuestId = () => `guest_${crypto.randomUUID()}`;

type ConvexUserContextValue = {
  user: User;
  triggerRerender: () => void;
};

const ConvexUserContext = createContext<ConvexUserContextValue>({
  user: {},
  triggerRerender: () => {},
});

export default function ConvexUserProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  // clerk lets us know if the user is signed in using sessions
  const { user: clerkUser, isSignedIn } = useClerkUser();
  const createUser = useMutation(api.users.createUser);
  const transferGuestData = useMutation(api.users.transferGuestDataToUser);
  const [user, setConvexUser] = useState<User>({});
  const [state, setState] = useState(false);

  function triggerRerender() {
    console.log(state);
    setState((prev) => !prev);
  }

  console.log("ConvexUserProvider is rendering"); // Add this line

  useEffect(() => {
    (async () => {
      if (!isSignedIn || !clerkUser) {
        let guestId = localStorage.getItem(GUEST_ID_KEY);

        // If not signed in and no guest ID exists, set an anonymous guest id and create a new user
        if (!guestId) {
          guestId = generateGuestId();
          localStorage.setItem(GUEST_ID_KEY, guestId);

          await createUser({ userId: guestId, email: "" });
        }

        setConvexUser({ _id: guestId });
      } else {
        // Ensure the Convex user exists for the signed-in Clerk user
        if (clerkUser?.id) {
          await createUser({
            userId: clerkUser.id,
            email: clerkUser.emailAddresses?.[0]?.emailAddress,
            name: clerkUser.fullName || clerkUser.username || undefined,
            imageUrl: clerkUser.imageUrl || undefined,
          });
        }

        const guestId = localStorage.getItem(GUEST_ID_KEY);
        if (guestId && clerkUser?.id) {
          await transferGuestData({ guestId, userId: clerkUser.id });
        }
        localStorage.removeItem(GUEST_ID_KEY);

        setConvexUser({ _id: clerkUser.id, ...clerkUser });
      }
    })();
  }, [isSignedIn, clerkUser, createUser, transferGuestData]);

  useEffect(() => {
    console.log("Running");
    // incase the guest id is mistakenly deleted from localstorage set it back
    if (!isSignedIn || !clerkUser) {
      const guestId = localStorage.getItem(GUEST_ID_KEY);
      if (!guestId && user._id) {
        console.log("ran here");
        localStorage.setItem(GUEST_ID_KEY, user._id);
      }
    }
  });

  return (
    <ConvexUserContext.Provider value={{ user, triggerRerender }}>
      {children}
    </ConvexUserContext.Provider>
  );
}

export const useUser = () => {
  const context = useContext(ConvexUserContext);
  if (!context) {
    throw new Error("useConvexUser must be used within a ConvexUserProvider");
  }
  return context;
};
