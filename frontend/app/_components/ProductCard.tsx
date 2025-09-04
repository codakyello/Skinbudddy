/* eslint-disable jsx-a11y/alt-text */
/* eslint-disable @next/next/no-img-element */
"use client";
import { Box } from "@chakra-ui/react";
import { Product } from "../_utils/types";
import { formatPrice, getDiscountedType, getTagType } from "../_utils/utils";
import Tag from "./Tag";
import { CiHeart } from "react-icons/ci";
import { FiEye } from "react-icons/fi";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { toast } from "sonner";
import { useUser } from "../_contexts/CreateConvexUser";
import Link from "next/link";
import { Id } from "@/convex/_generated/dataModel";
import { ModalOpen, useModal } from "./Modal";
import { ChangeEvent, useState } from "react";
import Select from "./Select";
import AppError from "../_utils/appError";

export default function ProductCard({
  className,
  product,
  selectClassName,
  bgwhite,
  handleProductToPreview,
}: {
  product: Product;
  className?: string;
  selectClassName?: string;
  bgwhite?: boolean;
  handleProductToPreview?: (product: Product) => void;
}) {
  const addToCart = useMutation(api.cart.createCart);
  const [isAdding, setIsAdding] = useState(false);
  const { user } = useUser();
  const [selectedSize, setSelectedSize] = useState(product.sizes?.at(0));
  const { open } = useModal();
  const isDiscounted = selectedSize?.discount;

  const handleAddToCart = async () => {
    try {
      setIsAdding(true);
      console.log(user, "This is the user");

      if (!user._id) return;

      const res = await addToCart({
        sizeId: selectedSize?.id,
        userId: user._id,
        productId: product._id as Id<"products">,
        quantity: 1,
      });

      console.log(res, "This is the response");

      if (!res?.success) throw new AppError(res?.message as string);

      toast.success(`Added to cart`);
      // open the cart modal for confirmation
      open("cart");
    } catch (error) {
      console.log(error, "This is the error");
      if (error instanceof AppError) toast.error(error.message);
      else {
        toast.error("Something went wrong");
      }
    } finally {
      setIsAdding(false);
    }
  };

  const handleSizeChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const value = event.currentTarget.value;
    setSelectedSize(product.sizes?.find((s) => s.id === value));
  };

  return (
    <Box
      className={`relative ${className || ""} overflow-hidden h-full flex flex-col`}
    >
      <Box className="group aspect-square overflow-hidden cursor-pointer w-full relative">
        <button
          className="absolute top-[15px] right-[15px]"
          onClick={handleAddToCart}
        >
          <CiHeart className="w-[20px] h-[20px]" />
        </button>
        <Box className="absolute top-[15px] left-[15px] flex flex-col items-start gap-[.5rem]">
          <Tag type={getTagType(product)} />
          <Tag type={getDiscountedType(product?.sizes)} />
        </Box>

        <Link href={`/products/${product.slug}`}>
          <img
            className="object-contain w-full h-full"
            src={product.images?.[0] || "/images/product-1.webp"}
            alt={product.name}
          />
        </Link>
        {/* ModalOpen with smooth hover animation */}
        <ModalOpen
          name="product-preview"
          handler={() => handleProductToPreview?.(product)}
        >
          <button className="absolute bottom-0 left-0 w-full opacity-0 group-hover:opacity-100 translate-y-4 group-hover:translate-y-0 transition-all duration-300 bg-black text-white text-[1.2rem] px-[1.6rem] py-[1.2rem] flex items-center justify-center gap-[0.8rem] border-t border-gray-900">
            <FiEye className="w-[1.4rem] h-[1.4rem]" />
            Quick View
          </button>
        </ModalOpen>
      </Box>

      <Link href={`/products/${product.slug}`}>
        <Box className="text-[1.4rem] font-[montserrat] flex flex-col gap-[8px mt-[2rem]">
          <h2 className="min-h-[4.8rem] mb-[8px] text-[#000] text-[1.6rem] font-semibold capitalize  tracking-[0.25px] leading-tight  ">
            {product.name}
          </h2>
          <p className="mb-[2rem] text-[#333]">{product.description}</p>
        </Box>
      </Link>

      {/* Size selection UI */}
      <Box className="relative mt-auto mb-[20px]">
        {product.sizes && product.sizes.length < 2 ? (
          <Box className="flex flex-col text-[1.4rem] min-h-[4.5rem] ">
            <span>One size only</span>
            <span>
              {selectedSize && selectedSize?.size + selectedSize?.unit}
            </span>
          </Box>
        ) : (
          product.sizes && (
            <Select
              className={selectClassName}
              bgwhite={bgwhite}
              handleChange={handleSizeChange}
              value={selectedSize?.id}
              label="Select a size"
              options={product.sizes.map((s) => ({
                name: s.size + " " + s.unit,
                value: s.id,
              }))}
            />
          )
        )}
      </Box>

      <Box className="flex flex-wrap gap-[8px] items-center font-[montserrat] text-[1.4rem] mb-[2rem] font-semibold">
        <p className={` ${isDiscounted ? "line-through text-[#888]" : ""} `}>
          {selectedSize && formatPrice.format(selectedSize.price)}
        </p>
        {selectedSize?.discount ? (
          <>
            <p>
              {formatPrice.format(selectedSize.price - selectedSize.discount)}
            </p>
            <span className="text-red-500 font-semibold text-[1.3rem]">
              {Math.round((selectedSize.discount / selectedSize.price) * 100)}%
              off
            </span>
          </>
        ) : (
          ""
        )}
      </Box>

      <button
        className="hover:bg-black shadow-[0_4px_8px_rgba(0,0,0,0.15)] hover:text-white font-hostgrotesk capitalize w-full h-[44px] text-[1.4rem] flex items-center justify-center border border-[#e1ded9] font-medium rounded-md hover:border-black transition-all"
        onClick={handleAddToCart}
        disabled={isAdding}
      >
        Add to cart
      </button>
    </Box>
  );
}
