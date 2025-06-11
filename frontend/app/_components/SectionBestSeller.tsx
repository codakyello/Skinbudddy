"use client";
import ProductCard from "./ProductCard";
import { Product } from "../_utils/types";
import Section from "./Section";
import { Box } from "@chakra-ui/react";
import useProducts from "../_hooks/useProducts";
import ProductCardSkeleton from "./ProductCardSkeleton";
// import { getAllProducts } from "../_lib/actions";

export default function SectionBestSeller() {
  // const bestSellers = await getAllProducts({
  //   sortBy: "best-seller",
  //   limit: 8,
  //   page: 1,
  // });

  // const bestSellers = [
  //   {
  //     images: ["images/categories--1.png"],
  //     name: "FaceFacts face wash",
  //     price: 124400,
  //     _id: "1",
  //   },
  //   {
  //     images: ["images/categories--2.png"],
  //     name: "FaceFacts face wash",
  //     price: 130000,
  //     _id: "2",
  //   },
  //   {
  //     images: ["images/categories--3.png"],
  //     name: "FaceFacts face wash",
  //     price: 140000,
  //     _id: "3",
  //   },
  //   {
  //     images: ["images/categories--4.png"],
  //     name: "FaceFacts face wash",
  //     price: 140000,
  //     _id: "4",
  //   },
  //   {
  //     images: ["images/categories--3.png"],
  //     name: "FaceFacts face wash",
  //     price: 140000,
  //     _id: "5",
  //   },
  //   {
  //     images: ["images/categories--3.png"],
  //     name: "FaceFacts face wash",
  //     price: 140000,
  //     _id: "6",
  //   },
  // ];

  const {
    products: bestSellers,
    isPending,
    error,
  } = useProducts({ filters: { isBestseller: true }, sort: {} });

  if (!bestSellers && !isPending) return null;

  return (
    <Section
      title="bestsellers"
      description="Our most loved products handpicked by beauty enthusiasts like you"
    >
      {isPending &&
        Array.from({ length: 5 }).map((_, i) => (
          <Box className="min-w-[32rem]">
            <ProductCardSkeleton />
          </Box>
        ))}

      {!isPending &&
        !error &&
        bestSellers?.map((product: Product, i: number) => (
          <Box className="min-w-[32rem]">
            <ProductCard key={i} product={product} />
          </Box>
        ))}
    </Section>
  );
}
