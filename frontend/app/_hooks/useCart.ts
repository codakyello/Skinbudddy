import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../_contexts/AuthProvider";
import { getUserCarts } from "../_lib/data-service";

export default function useCart() {
  const { user } = useAuth();
  const { data, isLoading, error } = useQuery({
    queryKey: ["userCart"],
    queryFn: () => getUserCarts(user?._id as string),
  });

  return { data, isLoading, error };
}
