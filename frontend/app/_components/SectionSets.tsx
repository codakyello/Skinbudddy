"use client";
import ProductCard from "./ProductCard";
import { Product } from "../_utils/types";
import Section from "./Section";
import { Box } from "@chakra-ui/react";
import useProducts from "../_hooks/useProducts";
// import { getAllProducts } from "../_lib/actions";

export default function SectionSets() {
  // const bestSellers = await getAllProducts({
  //   sortBy: "best-seller",
  //   limit: 8,
  //   page: 1,
  // });

  const { products: sets, isPending } = useProducts({
    filters: { isBestseller: true },
    sort: '-createdAt',
  });

  if (!sets && !isPending) return null;

  return (
    <Section
      title="sets"
      description="Our most loved products handpicked by beauty enthusiasts like you"
    >
      {sets?.map((product: Product, i: number) => (
        <Box key={i} className="min-w-[32rem]">
          <ProductCard product={product} />
        </Box>
      ))}
    </Section>
  );
}
