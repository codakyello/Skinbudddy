/* eslint-disable jsx-a11y/alt-text */
/* eslint-disable @next/next/no-img-element */
"use client";
import { Box } from "@chakra-ui/react";
import { Product } from "../_utils/types";
import { formatPrice } from "../_utils/utils";
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
import Image from "next/image";
import { Category } from "../_utils/types";

export default function ProductCard({
  className,
  product,
  selectClassName,
  bgwhite,
  sectionName,
  inChat = false,
  onProductToPreview,
}: {
  product: Product;
  className?: string;
  selectClassName?: string;
  sectionName?: string;
  bgwhite?: boolean;
  inChat?: boolean;
  onProductToPreview?: (product: Product) => void;
}) {
  const addToCart = useMutation(api.cart.createCart);
  const addToWishList = useMutation(api.wishlist.createWishList);
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
      if (!selectedSize?.id) return;

      const res = await addToCart({
        sizeId: selectedSize.id,
        userId: user._id,
        productId: product._id as Id<"products">,
        quantity: 1,
      });

      if (!res?.success) throw new AppError(res?.message as string);

      // toast.success(`Added to cart`);
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

  const handleAddToWishList = async () => {
    if (!product._id || !user._id) return;
    try {
      console.log("clicked");
      await addToWishList({
        userId: user._id as string,
        productId: product._id as Id<"products">,
      });

      toast.success("Added to wishlist successfully");
    } catch (err) {
      if (err instanceof Error) toast.error("Failed to add to wishlist");
    }
  };

  const handleSizeChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const value = event.currentTarget.value;
    setSelectedSize(product.sizes?.find((s) => s.id === value));
  };

  if (inChat)
    return (
      <Box
        className={`${className || ""} border-[1px] w-full p-[8px] grid grid-cols-[13rem_1fr] gap-[12px] border-[#1b1f2614] rounded-[24px] min-h-[176px] `}
      >
        <Box className="bg-[#E8E9E9] rounded-[16px] overflow-hidden relative">
          <Image
            src={product.images?.[0] || "/images/product-1.webp"}
            alt={product.name || ""}
            width={400}
            height={400}
            className="object-contain w-full h-full overflow-hidden"
          />

          <button className="text-[12px] absolute h-[28px] flex items-center justify-center w-[28px] rounded-[8px] bg-[#fff] top-[8px] end-[8px]">
            <svg
              className="w-[20px] h-[20px] text-[#1b1f2666]"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
            >
              <path
                d="M19.5 13.57 12 21l-7.5-7.43A5 5 0 1 1 12 7.01a5 5 0 1 1 7.5 6.57"
                stroke="currentColor"
                stroke-width="1.75"
                stroke-linecap="round"
                stroke-linejoin="round"
              ></path>
            </svg>
          </button>
        </Box>
        <Box className="pb-[12px] pt-[12px] gap-[12px] flex flex-col items-start">
          <Box className="flex flex-col gap-[4px] font-medium">
            <h6 className="text-[12px] capitalize text-[#1b1f26b3]">
              {(product.categories?.at(0) as Category)?.name}
            </h6>
            <ModalOpen
              handler={() => onProductToPreview?.(product)}
              name="product-detail"
            >
              <button className="capitalize text-start leading-[20px]">
                {product.name}
              </button>
            </ModalOpen>
          </Box>

          <Box className="flex flex-wrap gap-[8px] text-[1.4rem] mb-[2rem] font-semibold">
            <p
              className={` ${isDiscounted ? "line-through text-[#888]" : ""} `}
            >
              {selectedSize && formatPrice(selectedSize.price)}
            </p>
            {selectedSize?.discount ? (
              <>
                <p>{formatPrice(selectedSize.price - selectedSize.discount)}</p>
                <span className="text-red-500 font-semibold text-[1.3rem]">
                  {Math.round(
                    (selectedSize.discount / selectedSize.price) * 100
                  )}
                  % off
                </span>
              </>
            ) : (
              ""
            )}
          </Box>

          <button
            onClick={handleAddToCart}
            className="mt-auto rounded-[16px]  bg-[#1454d4] hover:bg-opacity-80 enabled:hover:bg-opacity-100 disabled:bg-opacity-40 text-[#fff] font-medium text-[14px] leading-[20px] min-h-[20px] flex text-center justify-center py-[6px] px-[16px] "
          >
            Add to Cart
          </button>

          {/* <button></button> */}
        </Box>
      </Box>
    );

  return (
    <Box
      className={`relative ${className || ""} overflow-hidden text-center h-full flex flex-col`}
    >
      <Box className="group aspect-square overflow-hidden cursor-pointer w-full relative">
        <button
          className="absolute top-[15px] right-[15px]"
          onClick={handleAddToWishList}
        >
          <CiHeart className="w-[20px] h-[20px]" />
        </button>
        <Box className="absolute top-[15px] left-[15px] flex flex-col items-start gap-[.5rem]">
          {/* <Tag type={getTagType(product)} />
          <Tag type={getDiscountedType(product?.sizes)} /> */}
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
          name={sectionName || ""}
          handler={() => onProductToPreview?.(product)}
        >
          <button className="absolute bottom-0 left-0 w-full opacity-0 group-hover:opacity-100 translate-y-4 group-hover:translate-y-0 transition-all duration-300 bg-black text-white text-[1.2rem] px-[1.6rem] py-[1.2rem] flex items-center justify-center gap-[0.8rem] border-t border-gray-900">
            <FiEye className="w-[1.4rem] h-[1.4rem]" />
            Quick View
          </button>
        </ModalOpen>
      </Box>

      <Link href={`/products/${product.slug}`}>
        <Box className="text-[1.4rem] flex flex-col gap-[8px] mt-[2rem]">
          <h2 className="min-h-[4.8rem] font-medium mb-[8px] text-[#000] text-[1.4rem] capitalize  tracking-[0.25px] leading-tight">
            {product.name}
          </h2>
          <p className="mb-[1rem] text-[1.2rem] text-[#333]">
            {product.description}
          </p>
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
              label="Select a size"
              className={selectClassName}
              bgwhite={bgwhite}
              handleChange={handleSizeChange}
              value={selectedSize?.id}
              options={product.sizes.map((s) => ({
                name: s.size + " " + s.unit,
                value: s.id,
              }))}
            />
          )
        )}
      </Box>

      <Box className="flex flex-wrap gap-[8px] justify-center items-center text-[1.4rem] mb-[2rem] font-semibold">
        <p className={` ${isDiscounted ? "line-through text-[#888]" : ""} `}>
          {selectedSize && formatPrice(selectedSize.price)}
        </p>
        {selectedSize?.discount ? (
          <>
            <p>{formatPrice(selectedSize.price - selectedSize.discount)}</p>
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
        className="bg-black uppercase shadow-[0_4px_8px_rgba(0,0,0,0.15)] text-white font-hostgrotesk w-full h-[35px] text-[1.2rem] flex items-center justify-center border border-[#e1ded9] font-medium rounded-md hover:border-black transition-all"
        onClick={handleAddToCart}
        disabled={isAdding}
      >
        {isAdding ? "..Adding" : "Add to Bag"}
      </button>
    </Box>
  );
}
