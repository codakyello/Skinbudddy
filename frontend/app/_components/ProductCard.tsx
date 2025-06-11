/* eslint-disable jsx-a11y/alt-text */
/* eslint-disable @next/next/no-img-element */
"use client";
import { Box } from "@chakra-ui/react";
import { Product } from "../_utils/types";
// import Tag from "./Tag";
import { formatNumber, getTagType } from "../_utils/utils";
import Tag from "./Tag";
import { CiHeart } from "react-icons/ci";
import { useUser } from "@clerk/nextjs";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { toast } from "sonner";

// import useCustomMutation from "../_hooks/useCustomMutation";
// import { createCartItem } from "../_lib/data-service";
// import { useAuth } from "../_contexts/AuthProvider";
// import { toast } from "sonner";

export default function ProductCard({
  product,
}: {
  product: Product;
  className?: string;
}) {
  // const { user } = useAuth();
  // const { mutate: addToCart, isPending } = useCustomMutation(createCartItem);
  const addToCart = useMutation(api.cart.createCart);
  const { user } = useUser();

  const handleAddToCart = async () => {
    if (user)
      try {
        const cartId = await addToCart({
          userId: user.id,
          productId: product._id,
          quantity: 1,
        });
        toast.success(`Added to cart with ID: ${cartId}`);
        // Optional: Show success message
      } catch (error) {
        if (error instanceof Error)
          toast.error(`Failed to add to cart: ${error.message}`);
        // Optional: Show error message
      }
  };

  const isDiscounted = product.discount;

  return (
    <Box>
      <Box className="group relative cursor-pointer w-full aspect-[4/5] ">
        <img className="object-cover w-full h-full" src={product.images[0]} />

        <Tag type={getTagType(product)} />

        <button className="absolute top-4 right-4" onClick={handleAddToCart}>
          <CiHeart className="w-[20px] h-[20px]" />
        </button>
      </Box>

      <h2 className="text-[#222222] font-inter mt-[1.6rem] tracking-[0.25px] leading-tight text-[1.3rem] mb-[.5rem] ">
        {product.name}
      </h2>

      <Box className="flex gap-[15px] items-center text-[1.4rem]">
        <p
          className={` font-dmsans ${isDiscounted && "line-through text-[#888]"}  text-[#222222]`}
        >
          {formatNumber.format(product.price)}
        </p>

        {isDiscounted ? (
          <p className="text-[var(--color-red)]">
            {formatNumber.format(product.price - (product.discount || 0))}
          </p>
        ) : (
          ""
        )}
      </Box>
    </Box>
  );
}
