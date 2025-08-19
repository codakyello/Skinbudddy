import { api } from "@/convex/_generated/api";
import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { Product } from "../_utils/types";

export default function useProducts({
  filters,
  sort,
  search,
  page,
  limit = 10,
  initialProducts = [],
}: {
  filters: {
    isNew?: boolean;
    isTrending?: boolean;
    isBestseller?: boolean;
    isDiscounted?: boolean;
    category?: string[];
    brand?: string;
    size?: string[];
    price?: { minPrice: string; maxPrice: string };
  };
  sort?: string;
  search?: string;
  page?: number;
  initialProducts?: Product[];
  limit?: number;
}) {
  const {
    category = [],
    size = [],
    brand,
    isNew,
    isTrending,
    isBestseller,
    isDiscounted,
  } = filters;
  const {
    data: products = initialProducts,
    isPending,
    error,
  } = useQuery(
    convexQuery(api.products.getAllProducts, {
      // best practice so we dont send undefined values to backend
      filters: {
        ...(isNew && { isNew }),
        ...(isTrending && { isTrending }),
        ...(isBestseller && { isBestseller }),
        ...(isDiscounted && { isDiscounted }),
        ...(category.length > 0 && { category }),
        ...(size.length > 0 && { size }),
        ...(brand && { brand }),
      },
      sort,
      page,
      search,
      limit,
    })
  );

  return { products, isPending, error };
}
