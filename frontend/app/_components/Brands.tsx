"use client";

import { Box } from "@chakra-ui/react";
import useBrands from "../_hooks/useBrands";
import { toast } from "sonner";

export default function Brands() {
  const { brands, isPending: isLoading, error } = useBrands();

  console.log(brands);
  if (isLoading) return <div>Loading...</div>;
  if (error) toast.error(error.message);
  return <Box>{brands?.map((brand) => <div>{brand.name}</div>)}</Box>;
}
