"use client";

import { api } from "@/convex/_generated/api";
import { useQuery } from "convex/react";
import { useUser } from "../_contexts/CreateConvexUser";
import { Box } from "@chakra-ui/react";
import ProductCard from "./ProductCard";
import { Product } from "../_utils/types";

export default function WishList() {
  const { user } = useUser();
  const res = useQuery(api.wishlist.getUserWishLists, {
    userId: user._id as string,
  });

  return (
    <Box className="grid grid-cols-4 gap-4">
      {res?.map((item) => (
        <ProductCard key={item._id} product={item.product as Product} />
      ))}
    </Box>
  );
}
