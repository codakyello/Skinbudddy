"use client";

import { api } from "@/convex/_generated/api";
import { useQuery } from "convex/react";
import { useUser } from "../_contexts/CreateConvexUser";
import { Box } from "@chakra-ui/react";
import ProductCard from "./ProductCard";
import { Product } from "../_utils/types";

type WishlistItem = {
  _id: string;
  product: Product;
};

export default function WishList() {
  const { user } = useUser();
  const res = useQuery(
    user._id ? api.wishlist.getUserWishLists : undefined
  );

  const wishlistItems = Array.isArray(res)
    ? (res as WishlistItem[])
    : [];

  return (
    <Box className="grid grid-cols-4 gap-4">
      {wishlistItems.map((item) => (
        <ProductCard key={item._id} product={item.product} />
      ))}
    </Box>
  );
}
