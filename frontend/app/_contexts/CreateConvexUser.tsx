"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useUser as useClerkUser } from "@clerk/clerk-react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { User as AppUser } from "../_utils/types";

type UserState = Omit<Partial<AppUser>, "_id"> & { _id?: string; image?: string };

const GUEST_ID_KEY = "convex_guest_id";

const generateGuestId = () => `guest_${crypto.randomUUID()}`;

type ConvexUserContextValue = {
  user: UserState;
  triggerRerender: () => void;
};

const ConvexUserContext = createContext<ConvexUserContextValue>({
  user: {},
  triggerRerender: () => {},
});

export default function ConvexUserProvider({
  children,
}: {
  children: ReactNode;
}) {
  // clerk lets us know if the user is signed in using sessions
  const { user: clerkUser, isSignedIn } = useClerkUser();
  const createUser = useMutation(api.users.createUser);
  const transferGuestData = useMutation(api.users.transferGuestDataToUser);
  const [user, setConvexUser] = useState<UserState>({});
  const [state, setState] = useState(false);

  function triggerRerender() {
    console.log(state);
    setState((prev) => !prev);
  }

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

        if (guestId) {
          setConvexUser({ _id: guestId, name: "Guest" });
        }
      } else if (clerkUser?.id) {
        const email = clerkUser.emailAddresses?.[0]?.emailAddress;
        const name = clerkUser.fullName || clerkUser.username || undefined;
        const imageUrl = clerkUser.imageUrl || undefined;

        await createUser({
          userId: clerkUser.id,
          email,
          name,
          imageUrl,
          clerkId: clerkUser.id,
        });

        const guestId = localStorage.getItem(GUEST_ID_KEY);
        if (guestId) {
          await transferGuestData({ guestId, userId: clerkUser.id });
          localStorage.removeItem(GUEST_ID_KEY);
        }

        setConvexUser({
          _id: clerkUser.id,
          email,
          name,
          image: imageUrl,
        });
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
