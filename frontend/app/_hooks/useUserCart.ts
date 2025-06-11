import { useQuery } from "@tanstack/react-query";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@/convex/_generated/api";

// export default function useCart() {
//   const { user } = useAuth();
//   const { data, isLoading, error } = useQuery({
//     queryKey: ["userCart"],
//     queryFn: () => getUserCarts(user?._id as string),
//   });

//   return { data, isLoading, error };
// }

export default function useUserCart(userId: string | undefined) {
  const {
    data: cart,
    isPending,
    error,
  } = useQuery(
    convexQuery(api.cart.getUserCart, {
      userId,
    })
  );
  return { cart, isPending, error };
}
