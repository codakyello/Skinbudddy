"use client";
import { useUser } from "@clerk/clerk-react";
import { useEffect } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";

export function CreateConvexUser() {
  const { user, isSignedIn } = useUser();
  const createUser = useMutation(api.users.createUser); // 👈 Convex mutation

  useEffect(() => {
    if (!isSignedIn || !user) return;
    console.log(user, "User from clerk");

    // Call your Convex mutation with Clerk user data
    createUser({
      userId: user.id,
      email: user.emailAddresses[0]?.emailAddress,
      name: user.fullName || "",
      imageUrl: user.imageUrl,
    });
  }, [isSignedIn, user]);

  return null;
}
