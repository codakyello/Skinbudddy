/* eslint-disable jsx-a11y/alt-text */
/* eslint-disable @next/next/no-img-element */
"use client";
import { Box } from "@chakra-ui/react";
import { Product } from "../_utils/types";
// import Tag from "./Tag";
import { formatPrice, getTagType } from "../_utils/utils";
import Tag from "./Tag";
import { CiHeart } from "react-icons/ci";
import { FiEye } from "react-icons/fi";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { toast } from "sonner";
import { useConvexUser as useUser } from "../_contexts/CreateConvexUser";
import Link from "next/link";
import { Id } from "@/convex/_generated/dataModel";

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
  const { userId } = useUser();

  const handleAddToCart = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    e.preventDefault();
    if (userId)
      try {
        const cartId = await addToCart({
          userId,
          productId: product._id as Id<"products">,
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
  // const imageUrl = product.images?.[0] || "/placeholder.png";

  const randomImageNumber = Math.floor(Math.random() * 3) + 2;

  return (
    <Box className="relative overflow-hidden min-h-[580px] h-full flex flex-col">
      <Link href={`/products/${product._id}`}>
        <Box className="group aspect-[4/5] bg-[#f4f4f2] cursor-pointer w-full relative">
          <Tag className="top-[15px] left-[15px]" type={getTagType(product)} />
          <button
            className="absolute bottom-0 left-0 w-full opacity-0 group-hover:opacity-100 transition-all duration-300 bg-black text-white text-[1.2rem] px-[1.6rem] py-[1.2rem] flex items-center justify-center gap-[0.8rem] z-10 border-t border-gray-900"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              console.log('Quick View clicked for product:', product.name);
            }}
          >
            <FiEye className="w-[1.4rem] h-[1.4rem]" />
            Quick View
          </button>
          <img
            className="object-contain w-full h-full"
            // 2 3 4
            
            src={`images/product/product-${randomImageNumber}.jpg`}
            alt={product.name}
          />
        </Box>
      

      <button
        className="absolute top-[15px] right-[15px]"
        onClick={handleAddToCart}
      >
        <CiHeart className="w-[24px] h-[24px]" />
      </button>

      <Box className="text-[1.4rem]">
        <h2 className="text-[#000] capitalize font-medium mt-[1.6rem] tracking-[0.25px] leading-tight  ">
          {product.name}
        </h2>

        <p className="font-dmsans mb-[.5rem]">{product.description}</p>
      </Box>

      <Box className="flex gap-[15px] items-center text-[1.5rem] mb-[2rem]">
        <p className={` ${isDiscounted ? "line-through text-[#888]" : ""} `}>
          {formatPrice.format(product.price)}
        </p>
        {product.discount && (
          <p className="text-[var(--color-red)]">
            {formatPrice.format(product.price - product.discount)}
          </p>
        )}
      </Box>
      </Link>
      <button
        className="hover:bg-black hover:text-white mt-auto font-hostgrotesk capitalize w-full h-[50px] text-[1.4rem] flex items-center justify-center border border-[#e1ded9] font-medium rounded-md hover:border-black transition-all"
        onClick={handleAddToCart}
      >
        Add to cart
      </button>
    </Box>
  );
}
