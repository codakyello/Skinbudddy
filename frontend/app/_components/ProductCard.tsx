/* eslint-disable jsx-a11y/alt-text */
/* eslint-disable @next/next/no-img-element */
"use client";
import { Box } from "@chakra-ui/react";
import { Product } from "../_utils/types";
import Tag from "./Tag";
import useCustomMutation from "../_hooks/useCustomMutation";
import { createCartItem } from "../_lib/data-service";
import { useAuth } from "../_contexts/AuthProvider";
import { toast } from "sonner";

export default function ProductCard({ product }: { product: Product }) {
  const { user } = useAuth();
  const { mutate: addToCart, isPending } = useCustomMutation(createCartItem);
  return (
    <Box className="relative">
      <Box className="group relative cursor-pointer w-full aspect-[4.5/5] overflow-hidden">
        <img className="object-cover w-full h-full" src={product.images[0]} />

        <button
          className="absolute text-[#fff] left-0 w-full transition-all duration-[100ms] bottom-[-50px] group-hover:bottom-[1.5rem] text-[1.2rem] py-[1rem] bg-[var(--color-primary)]"
          onClick={() => {
            if (user?._id)
              addToCart(
                { userId: user?._id, productId: product._id },
                {
                  onSuccess: () => {
                    toast.success("Product added to cart successfully!");
                  },
                  onError: (error) => {
                    toast.error(error.message);
                    console.log(error);
                  },
                }
              );
          }}
        >
          {isPending ? "...Adding" : "ADD TO CART"}
        </button>
      </Box>

      <p className="uppercase text-[1.2rem] font-medium text-[#999] mt-[1rem] mb-[.5rem]">
        Vita Naturals
      </p>

      <h2 className="text-[var(--color-primary)] leading-tight text-[1.6rem] mb-[.5rem] ">
        {product.name}
      </h2>

      <p className="font-medium">₦{product.price}</p>

      {/* Tag */}
      <Tag tag="Best seller" />
    </Box>
  );
}
