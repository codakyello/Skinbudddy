import { useQuery } from "@tanstack/react-query";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@/convex/_generated/api";
import AppError from "../_utils/appError";
import type { Doc } from "@/convex/_generated/dataModel";

type PopulatedProduct =
  | (Doc<"products"> & {
      originalPrice?: number;
      price?: number;
      size?: number;
      unit?: string;
      stock?: number;
      categories?: Array<Doc<"categories">>;
    })
  | null;

export type CartEntry = Doc<"carts"> & {
  product: PopulatedProduct;
};

export default function useUserCart() {
  const {
    data,
    isPending,
    error: convexError,
  } = useQuery(convexQuery(api.cart.getUserCart, {}));

  // If Convex threw → pass that along
  const emptyCart: CartEntry[] = [];

  if (convexError) {
    return { cart: emptyCart, isPending, error: convexError };
  }

  // If Convex returned a structured error
  if (data && !data.success) {
    return {
      cart: emptyCart,
      isPending,
      error: new AppError(data.message as string, data?.statusCode),
    };
  }

  const cart = (data?.cart ?? []) as CartEntry[];

  return { cart, isPending, error: null as Error | null };
}
