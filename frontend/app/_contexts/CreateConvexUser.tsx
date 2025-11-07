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
import { convexClient } from "@/convex/convex";
import { GUEST_TOKEN_STORAGE_KEY } from "@/app/_lib/guestAuth";

type UserState = Omit<Partial<AppUser>, "_id"> & {
  _id?: string;
  image?: string;
};

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

  async function generateGuestToken(guestId: string): Promise<string | null> {
    const response = await fetch("/api/auth/guest-token", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ guestId }),
    });

    if (response.ok) {
      const data = (await response.json()) as { token?: string };
      const token = data.token;
      if (token) {
        localStorage.setItem(GUEST_TOKEN_STORAGE_KEY, token);
      }
      return token ?? null;
    }
    return null;
  }

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
        }

        if (guestId) {
          try {
            const storedToken = localStorage.getItem(GUEST_TOKEN_STORAGE_KEY);
            let token = storedToken;

            // failing here because the user is not created yet
            // we are generating userId cleint side, use the userId to generate the token and then pass in the token
            if (!token) {
              token = (await generateGuestToken(guestId)) ?? "";
            }

            if (token) {
              console.log("Setting Convex auth token", token.slice(0, 12));
              convexClient.setAuth(async () => token as string);

              try {
                await createUser({});
              } catch (err) {
                console.error("Failed to create guest user", err);
                convexClient.setAuth(async () => null);
                localStorage.removeItem(GUEST_TOKEN_STORAGE_KEY);

                // try again for expired token
                try {
                  const refreshedToken = await generateGuestToken(guestId);
                  if (refreshedToken) {
                    localStorage.setItem(
                      GUEST_TOKEN_STORAGE_KEY,
                      refreshedToken
                    );
                    convexClient.setAuth(async () => refreshedToken);
                    await createUser({});
                  }
                } catch (retryError) {
                  console.error("Retrying guest auth failed", retryError);
                }
              }
            } else {
              convexClient.setAuth(async () => null);
            }
          } catch (error) {
            console.error("Failed to initialize guest auth", error);
            convexClient.setAuth(async () => null);
          }

          setConvexUser({ _id: guestId, name: "Guest" });
        }
        // user is signed in and has a clerk user id
        // create a new user with the clerk user id for first time users
      } else if (clerkUser?.id) {
        const email = clerkUser.emailAddresses?.[0]?.emailAddress;
        const name = clerkUser.fullName || clerkUser.username || undefined;
        const imageUrl = clerkUser.imageUrl || undefined;

        await createUser({
          email,
          name,
          imageUrl,
          authType: "clerk",
        });

        const guestId = localStorage.getItem(GUEST_ID_KEY);
        if (guestId) {
          await transferGuestData({ guestId });
          localStorage.removeItem(GUEST_ID_KEY);
        }

        localStorage.removeItem(GUEST_TOKEN_STORAGE_KEY);
        convexClient.setAuth(async () => null);

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
