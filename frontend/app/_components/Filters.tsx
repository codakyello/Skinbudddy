"use client";
import { Box } from "@chakra-ui/react";
import { FilterObj } from "../_utils/types";
import Filter from "./Filter";

export default function Filters({ filters }: { filters: FilterObj[] }) {
  return (
    <Box>
      {filters.map((filter: FilterObj, i) => (
        <Filter key={i} filter={filter} />
      ))}
    </Box>
  );
}
