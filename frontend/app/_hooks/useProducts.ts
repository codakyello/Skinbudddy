import { api } from "@/convex/_generated/api";
import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";

export default function useProducts({
  filters,
  sort,
  search,
  page,
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
  sort?: { order?: "asc" | "desc"; field?: string };
  search?: string;
  page?: number;
}) {
  // lets get the filter directly in this hook
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
    data: products,
    isPending,
    error,
  } = useQuery(
    convexQuery(api.products.getAllProducts, {
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
    })
  );

  return { products, isPending, error };
}
