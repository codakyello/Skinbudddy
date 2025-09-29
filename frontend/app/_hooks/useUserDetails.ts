"use client";

import { api } from "@/convex/_generated/api";
import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { User } from "@/app/_utils/types";

export default function useUserDetails(userId: string) {
  const { data, isPending, error } = useQuery(
    convexQuery(api.users.getUser, { userId })
  );

  const user = data?.user as User | undefined;

  return { user, isPending, error };
}
