"use client";

import { api } from "@/convex/_generated/api";
import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { User } from "@/app/_utils/types";

export default function useUserDetails(userId?: string | null) {
  const canQuery =
    typeof userId === "string" &&
    userId.trim().length > 0 &&
    !userId.startsWith("guest_");

  const baseQuery = convexQuery(api.users.getUser);
  const { data, isPending, error } = useQuery({
    ...baseQuery,
    queryKey: [...baseQuery.queryKey, userId ?? ""],
    enabled: canQuery,
  });

  const user = data?.user as User | undefined;

  return { user, isPending, error };
}
