"use client";

import { Box } from "@chakra-ui/react";
import useBrands from "../_hooks/useBrands";
import { toast } from "sonner";
import type { Doc } from "@/convex/_generated/dataModel";

export default function Brands() {
  const { brands, isPending: isLoading, error } = useBrands();

  console.log(brands);
  if (isLoading) return <div>Loading...</div>;
  if (error) toast.error(error.message);
  const safeBrands = (brands ?? []) as Array<Doc<"brands">>;
  return (
    <Box>
      {safeBrands.map((brand) => (
        <div key={brand._id}>{brand.name}</div>
      ))}
    </Box>
  );
}
