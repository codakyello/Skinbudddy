"use client";
import ProductCard from "./ProductCard";
import { Product } from "../_utils/types";
import Section from "./Section";
import { Box } from "@chakra-ui/react";
import useProducts from "../_hooks/useProducts";
import Link from "next/link";
import useUserCart from "../_hooks/useUserCart";
import { useUser } from "../_contexts/CreateConvexUser";
import { useEffect, useState } from "react";
import { FaChevronLeft, FaChevronRight } from "react-icons/fa";
// import { getAllProducts } from "../_lib/actions";

export default function SectionBestSeller({
  initialProducts,
}: {
  initialProducts?: Product[];
}) {
  // #FBF9F7
  const limit = 10;

  const { userId } = useUser();

  const { cart } = useUserCart(userId as string);

  const { products: bestSellers } = useProducts({
    filters: { isBestseller: true },
    limit,
    sort: "",
    initialProducts,
  });
  const [offset, setOffset] = useState(0);
  const [paused, setPaused] = useState(false);

  function handleNext() {
    setOffset((prev) => (prev + 1) % (bestSellers.length - 3));
  }

  function handlePrev() {
    if (offset === 0) {
      setOffset(bestSellers.length - 3);
    } else {
      setOffset((prev) => prev - 1);
    }
  }

  useEffect(() => {
    if (paused) return;
    const interval = setInterval(() => {
      setOffset((prev) => (prev + 1) % (bestSellers.length - 3));
    }, 5000);

    return () => clearInterval(interval);
  }, [bestSellers.length, offset, paused]);

  if (!bestSellers) return null;

  return (
    <Box className="bg-[#FBF9F7] pt-[120px] pb-[120px] ">
      <Section title="Best sellers">
        {/* {isPending &&
          Array.from({ length: limit }).map((_, i) => (
            <Box key={i} className="min-w-[32rem]">
              <ProductCardSkeleton />
            </Box>
          ))} */}

        <Box
          className="flex  mt-[7.2rem] no-scrollbar relative h-[800px] overflow-x-auto gap-y-[4rem]"
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
        >
          {bestSellers.slice(0, limit)?.map((product: Product, i: number) => (
            <Box
              key={i}
              className={`absolute top-0 w-[350px] transition-all duration-500 ease-in-out`}
              style={{ left: `${370 * (i - offset)}px` }}
            >
              <ProductCard
                // className={`min-w-[35rem]`}
                key={i}
                product={product}
                isInCart={cart?.some((item) => item.productId === product._id)}
              />
            </Box>
          ))}
          <button
            onClick={handlePrev}
            className="absolute left-[-10px] top-[30%] -translate-y-1/2 rounded-full p-3 shadow-md text-gray-700 hover:text-gray-900 transition-colors"
          >
            <FaChevronLeft className="w-6 h-6" />
          </button>
          <button
            onClick={handleNext}
            className="absolute right-[-10px] top-[30%] -translate-y-1/2 rounded-full p-3 shadow-md text-gray-700 hover:text-gray-900 transition-colors"
          >
            <FaChevronRight className="w-6 h-6" />
          </button>
        </Box>

        {bestSellers.length > limit && (
          <Box className="flex justify-end mt-[25px]">
            <Link
              className="flex items-center uppercase font-hostgrotesk group"
              href="/shop"
            >
              <svg
                width="13"
                height="12"
                viewBox="0 0 13 12"
                xmlns="http://www.w3.org/2000/svg"
                className="fill-current mr-3 transition-transform duration-300 group-hover:translate-x-2 group-hover:scale-110 group-hover:opacity-80"
              >
                <path d="M0 4.8H8.5L5.5 1.7L7.2 0L13 6L7.2 12L5.5 10.3L8.5 7.2H0V4.8Z"></path>
              </svg>
              <span className="text-[14px] font-medium">View all</span>
            </Link>
          </Box>
        )}
      </Section>
    </Box>
  );
}
