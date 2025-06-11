"use client";
import { Box } from "@chakra-ui/react";
import Filter from "./Filter";
import ProductList from "./ProductList";
import { useNavSticky } from "../_contexts/Sticky";
import {
  Accordion,
  AccordionBody,
  AccordionIcon,
  AccordionOpen,
} from "./Accordion";
import useSticky from "../_hooks/useSticky";

export default function Product({ brands }: { brands: any }) {
  const { isSticky: isNavSticky } = useNavSticky();
  const { isSticky } = useSticky(96);

  return (
    <Accordion>
      <Box
        className={`${isNavSticky && "!mt-[16.5rem]"} mx-[4rem] mt-[3rem] grid grid-cols-[31rem_1fr] gap-x-[1.5rem]`}
      >
        <Box
          className={`${isSticky ? "fixed top-[104px] w-[310px]  " : ""} mt-[32px] pr-[2rem] h-[450px] overflow-auto`}
        >
          <Sort />
          <Filter brands={brands} />
        </Box>
        <ProductList />
      </Box>
    </Accordion>
  );
}

export function Sort() {
  return (
    <Box className="py-[20px] border-b-[1px] border-[#e4e4e4]">
      <Box className="flex justify-between items-center">
        Sort
        <AccordionOpen name="sort">
          <AccordionIcon />
        </AccordionOpen>
      </Box>
      <AccordionBody name="sort">Sort</AccordionBody>
    </Box>
  );
}
