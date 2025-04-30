/* eslint-disable jsx-a11y/alt-text */
/* eslint-disable @next/next/no-img-element */
import { Box } from "@chakra-ui/react";
import ProductCard from "./ProductCard";
import { Product } from "../_utils/types";
import { getAllProducts } from "../_lib/actions";

export default async function SectionBestSeller() {
  const bestSellers = await getAllProducts({
    sortBy: "best-seller",
    limit: 8,
    page: 1,
  });

  if (!bestSellers) return null;

  return (
    <Box className="my-[10rem] max-w-[120rem] mx-auto px-[2rem] pb-[40rem]">
      <h1 className="text-[4rem] text-[var(--color-primary)] font-playfair ">
        Explore Our Best Seller
      </h1>

      <p className=" mb-[3rem] text-[1.2rem]  text-[#999]">
        Our most-loved products handpicked by beauty enthusiasts like you.
      </p>

      <Box className="grid grid-cols-[repeat(auto-fill,minmax(25rem,1fr))] gap-x-[1rem] gap-y-[4rem]">
        {bestSellers.map((product: Product, i: number) => (
          <ProductCard key={i} product={product} />
        ))}
      </Box>
    </Box>
  );
}
