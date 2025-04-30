import { useQuery } from "@tanstack/react-query";
import { getCartSummary } from "../_lib/data-service";

export default function useCartSummary({
  userId,
}: {
  userId: string | undefined;
}) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["userCartSummary"],
    queryFn: () => getCartSummary(userId),
  });

  return { data, isLoading, error };
}
