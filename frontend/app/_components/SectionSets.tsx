"use client";
import ProductCard from "./ProductCard";
import { Product } from "../_utils/types";
import Section from "./Section";
import { Box } from "@chakra-ui/react";
// import { getAllProducts } from "../_lib/actions";

export default function SectionSets() {
  // const bestSellers = await getAllProducts({
  //   sortBy: "best-seller",
  //   limit: 8,
  //   page: 1,
  // });

  const sets = [
    {
      images: ["images/categories--1.png"],
      name: "FaceFacts face wash",
      price: 124400,
      _id: "1",
      isBestseller: true,
    },
    {
      images: ["images/categories--2.png"],
      name: "FaceFacts face wash",
      price: 130000,
      _id: "2",
      discount: 2000,
    },
    {
      images: ["images/categories--3.png"],
      name: "FaceFacts face wash",
      price: 140000,
      isNew: true,
      _id: "3",
    },
    {
      images: ["images/categories--4.png"],
      name: "FaceFacts face wash",
      price: 140000,
      discount: 2000,
      _id: "4",
    },
    {
      images: ["images/categories--3.png"],
      name: "FaceFacts face wash",
      price: 140000,
      isBestseller: true,
      _id: "5",
    },
    {
      images: ["images/categories--3.png"],
      name: "FaceFacts face wash",
      price: 140000,
      isNew: true,
      _id: "6",
    },
  ];

  if (!sets) return null;

  return (
    <Section
      title="sets"
      description="Our most loved products handpicked by beauty enthusiasts like you"
    >
      {sets.map((product: Product, i: number) => (
        <Box className="min-w-[32rem]">
          <ProductCard key={i} product={product} />
        </Box>
      ))}
    </Section>
  );
}
