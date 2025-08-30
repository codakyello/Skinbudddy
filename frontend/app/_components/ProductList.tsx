"use client";
import { Box } from "@chakra-ui/react";
import ProductCard from "./ProductCard";
import useProducts from "../_hooks/useProducts";
import ProductCardSkeleton from "./ProductCardSkeleton";
import useSticky from "../_hooks/useSticky";
import { useFilters } from "../_hooks/useFilters";

export default function ProductList() {
  const { filters } = useFilters();
  const { products, isPending, error } = useProducts({
    filters: {
      brand: filters.brand?.[0],
      category: filters.category,
      isBestseller: filters.bestseller?.[0] === "true",
      isDiscounted: filters.discount?.[0] === "true",
      isTrending: filters.discount?.[0] === "true",
      size: filters.size,
    },
    sort: filters.sort?.[0],
  });
  const { isSticky } = useSticky(96);

  return (
    <Box
      className={`flex flex-col gap-[30px] ${isSticky ? "col-start-2" : ""}`}
    >
      <Box className="flex items-center gap-[16px]">
        <h2 className="font-inter font-medium text-[2.2rem]">Shop</h2>

        {/* <input
          placeholder="Search..."
          className="rounded-[12px] px-[16px] bg-[#f4f4f4] w-[32rem] h-[4rem]"
        /> */}
      </Box>
      <Box className="grid gap-[1.3rem]  grid-cols-[repeat(auto-fill,minmax(250px,1fr))]">
        {isPending &&
          Array.from({ length: 15 }).map((_, i) => (
            <ProductCardSkeleton key={i} />
          ))}

        {!error &&
          !isPending &&
          products?.map((product, i) => (
            <ProductCard selectClassName="bg-[#fff]" key={i} product={product} />
          ))}

        {error && (
          <div className="col-span-full text-center py-8">
            <p>Failed to load products. Please try again.</p>
          </div>
        )}

        {!isPending && !error && products?.length === 0 && (
          <div className="col-span-full text-center py-8">
            <p>No products found.</p>
          </div>
        )}
      </Box>
    </Box>
  );
}
