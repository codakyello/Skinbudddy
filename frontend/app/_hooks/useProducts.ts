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
  sort?: string;
  search?: string;
  page?: number;
}) {
  console.log(filters, sort, "Filters and sort");
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
    })
  );

  return { products, isPending, error };
}
