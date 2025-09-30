"use client";
import { Box } from "@chakra-ui/react";
import ProductList from "./ProductList";
import { useNavSticky } from "../_contexts/Sticky";
import useSticky from "../_hooks/useSticky";
import { Brand, FilterObj } from "../_utils/types";
import { Sort } from "./Sort";
import Filters from "./Filters";

const sortItems = [
  { title: "sort by popularity", value: "popularity" },
  { title: "sort by ratings", value: "ratings" },
  { title: "sort by latest", value: "latest" },
  { title: "sort by price: low to high ", value: "price-asc" },
  { title: "sort by price: high to low ", value: "price-desc" },
];

let filters: FilterObj[] = [
  {
    title: "Product Type",
    type: "category",
    filters: [
      { name: "Body lotion", count: 30 },
      { name: "Face cream", count: 10 },
      { name: "Cleansers", count: 5 },
      { name: "Serums", count: 5 },
      { name: "Face mask", count: 20 },
      { name: "Sunscreen SPF", count: 10 },
      { name: "Toner", count: 10 },
      { name: "Eye cream", count: 15 },
    ],
  },

  {
    title: "Size",
    type: "size",
    filters: [
      { name: "S", count: 49 },
      { name: "L", count: 45 },
    ],
  },
];

export default function Products({ brands }: { brands: Brand[] | undefined }) {
  const { isSticky: isNavSticky } = useNavSticky();
  const { isSticky } = useSticky(96);

  const hasBrandFilter = filters.some((filter) => filter.type === "brand");

  if (brands && !hasBrandFilter)
    filters = [...filters, { title: "Brand", type: "brand", filters: brands }];

  return (
    <Box
      className={`${isNavSticky && "!mt-[16.5rem]"} mx-[4rem] mt-[3rem] grid grid-cols-[31rem_1fr] gap-x-[1.5rem]`}
    >
      <Box
        className={`${isSticky ? "fixed top-[180px] w-[310px] h-[550px] " : "h-[450px]"} pr-[2rem]  overflow-auto`}
      >
        <Sort sortItems={sortItems} />
        <Filters filters={filters} />
      </Box>
      <ProductList />
    </Box>
  );
}
