import { useQuery } from "@tanstack/react-query";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@/convex/_generated/api";
import AppError from "../_utils/appError";

export default function useUserCart(userId: string) {
  const {
    data,
    isPending,
    error: convexError,
  } = useQuery(convexQuery(api.cart.getUserCart, { userId }));

  // If Convex threw → pass that along
  if (convexError) {
    return { cart: [], isPending, error: convexError };
  }

  // If Convex returned a structured error
  if (data && !data.success) {
    return {
      cart: [],
      isPending,
      error: new AppError(data.message as string, data?.statusCode),
    };
  }

  return { cart: data?.cart ?? [], isPending, error: null };
}
