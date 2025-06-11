import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/convex/_generated/api";

// export function useBrands() {
//   const brands = useQuery(api.brands.getAllBrands);
//   return { brands, isLoading: brands === undefined };
// }

export default function useBrands() {
  const {
    data: brands,
    isPending,
    error,
  } = useQuery(convexQuery(api.brands.getAllBrands, {}));

  return { brands, isPending, error };
}
