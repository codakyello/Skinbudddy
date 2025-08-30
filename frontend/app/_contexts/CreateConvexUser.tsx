"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { useUser as useClerkUser } from "@clerk/clerk-react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";

const GUEST_ID_KEY = "convex_guest_id";

const generateGuestId = () => `guest_${crypto.randomUUID()}`;

type ConvexUserContextValue = {
  user: User;
};

const ConvexUserContext = createContext<ConvexUserContextValue>({
  user: {},
});

type User = {
  id?: string;

}

export default function ConvexUserProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  // clerk lets us know if the user is signed in using sessions
  const { user: clerkUser, isSignedIn } = useClerkUser();
  console.log(clerkUser)
  const createUser = useMutation(api.users.createUser);
  const [user, setConvexUser] = useState<User>({});

  useEffect(() => {
    (async () => {
      if (!isSignedIn || !user) {
        let guestId = localStorage.getItem(GUEST_ID_KEY);

        // If no guest ID exists, set an anonymous guest id and create a new user 
        if (!guestId) {
          guestId = generateGuestId();
          localStorage.setItem(GUEST_ID_KEY, guestId);

          await createUser({ userId: guestId });
        }

        setConvexUser({id: guestId});
      } else {
        // Optional: Clear guest ID since user is now signed in
        // before removing though, we should take all of the data from the guest user and moved it to the signed in user
        // await transferGuestDataToUser(guestId, user.id);
        localStorage.removeItem(GUEST_ID_KEY);
        // Set the user id from clerk on sign in or sign up
        setConvexUser(clerkUser);
      }
    })();
  }, [isSignedIn, clerkUser, createUser, user]);

  return (
    <ConvexUserContext.Provider value={{ user }}>
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
} 
