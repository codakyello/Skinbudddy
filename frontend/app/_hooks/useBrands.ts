import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/convex/_generated/api";
import type { Doc } from "@/convex/_generated/dataModel";

// export function useBrands() {
//   const brands = useQuery(api.brands.getAllBrands);
//   return { brands, isLoading: brands === undefined };
// }

export default function useBrands() {
  const { data, isPending, error } = useQuery(
    convexQuery(api.brands.getAllBrands, {})
  );

  const brands = data?.brands as Doc<"brands">[] | undefined;

  return { brands, isPending, error };
}
