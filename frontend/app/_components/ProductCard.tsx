/* eslint-disable jsx-a11y/alt-text */
/* eslint-disable @next/next/no-img-element */
"use client";
import { Box } from "@chakra-ui/react";
import { Product } from "../_utils/types";
// import Tag from "./Tag";
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
import { ModalOpen, ModalWindow, useModal } from "./Modal";
import { ChangeEvent, useState } from "react";
import { IoCloseOutline } from "react-icons/io5";
import useUserCart from "../_hooks/useUserCart";
import Select from "./Select";

// import useCustomMutation from "../_hooks/useCustomMutation";
// import { createCartItem } from "../_lib/data-service";
// import { useAuth } from "../_contexts/AuthProvider";
// import { toast } from "sonner";

export default function ProductCard({
  className,
  product,
  selectClassName,
  bgwhite,
}: {
  product: Product;
  className?: string;
  selectClassName?: string;
  bgwhite?: boolean;
}) {
  // const { user } = useAuth();
  // const { mutate: addToCart, isPending } = useCustomMutation(createCartItem);
  const addToCart = useMutation(api.cart.createCart);
  const [isAdding, setIsAdding] = useState(false);
  const { user, triggerRerender } = useUser();
  const { cart } = useUserCart(user.id as string);
  const [selectedSize, setSelectedSize] = useState(product.sizes?.at(0));
  const { open } = useModal();
  const isInCart =
    cart?.some((item) => item.productId === product._id) || false;
  const isDiscounted = selectedSize?.discount;

  // we will hvae one product size product.sizes?.[0].id
  const handleAddToCart = async (
    e: React.MouseEvent<HTMLButtonElement>,
    qty = 1
  ) => {
    e.stopPropagation();
    e.preventDefault();
    triggerRerender();

    try {
      setIsAdding(true)
      console.log(user, "This is the user");

      if (!user.id) return;

      const cartId = await addToCart({
        sizeId: selectedSize?.id,
        userId: user.id,
        productId: product._id as Id<"products">,
        quantity: qty,
      });

      toast.success(`Added to cart with ID: ${cartId}`);
      // open the cart modal for confirmation
      open("cart");
    } catch (error) {
      if (error instanceof Error)
        toast.error(`Failed to add to cart: ${error.message}`);
    }finally {
      setIsAdding(false)
    }
  };

  // const imageUrl = product.images?.[0] || "/placeholder.png";

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

        {/* if (selectedProduct?.discount) return "isDiscount"; */}

        <Link href={`/products/${product.slug}`}>
          <img
            className="object-contain w-full h-full"
            src={product.images?.[0] || "/images/product-1.webp"}
            alt={product.name}
          />
        </Link>
        {/* ModalOpen with smooth hover animation */}
        <ModalOpen name={product.name || ""}>
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

      {/* {product.sizes && product.sizes.length > 0 && (
        <Box className="mb-[1.6rem]">
          <label className="block mb-2 text-[1.2rem] font-medium">
            Select Size:
          </label>
          <Box className="flex gap-2 flex-wrap">
            {product.sizes.map((s: Size) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setSelectedSize(s)}
                disabled={s.stock === 0}
                className={[
                  "px-4 py-2 rounded-md border text-[1.2rem] font-medium transition-all",
                  selectedSize?.id === s.id
                    ? "bg-black text-white border-black"
                    : "bg-white text-black border-[#e1ded9] hover:border-black",
                  s.stock === 0 ? "opacity-50 cursor-not-allowed" : "",
                ].join(" ")}
              >
                {`${s.size} ${s.unit}`}
                {typeof s.price === "number" && (
                  <span className="ml-2 text-[1rem] text-gray-500">
                    {formatPrice.format(s.price)}
                  </span>
                )}
              </button>
            ))}
          </Box>
        </Box>
      )} */}

      <button
        className="hover:bg-black shadow-[0_4px_8px_rgba(0,0,0,0.15)]  hover:text-white font-hostgrotesk capitalize w-full h-[44px] text-[1.4rem] flex items-center justify-center border border-[#e1ded9] font-medium rounded-md hover:border-black transition-all"
        onClick={handleAddToCart}
        disabled={isAdding}
      >
        {isInCart ? "Added to cart" : "Add to cart"}
      </button>

      {/* ModalWindow: fully functional Quick View */}
      <ModalWindow
        name={product.name || ""}
        position="center"
        listenCapturing={true}
        className="bg-black/25 z-[9999]"
      >
        <ProductPreviewModal
          product={product}
          isInCart={isInCart}
          handleAddToCart={handleAddToCart}
        />
      </ModalWindow>
    </Box>
  );
}

export function ProductPreviewModal({
  isInCart,
  product,
  handleAddToCart,
  onClose,
}: {
  product: Product;
  isInCart: boolean;
  handleAddToCart: (
    e: React.MouseEvent<HTMLButtonElement>,
    customQty?: number
  ) => void;
  onClose?: () => void;
}) {
  const [quantity, setQuantity] = useState(1);
  const handleIncrement = () => setQuantity((q) => q + 1);
  const handleDecrement = () => setQuantity((q) => (q > 1 ? q - 1 : 1));

  return (
    <Box className="relative max-w-[110rem] h-[60rem] overflow-hidden w-[100%] grid grid-cols-2 bg-white md:flex-row">
      <button onClick={onClose} className="absolute top-[2rem] right-[2rem]">
        <IoCloseOutline className="h-[3.5rem] w-[3.5rem]" />
      </button>
      <Box className="bg-[#f4f4f2]">
        <img
          className="w-full h-full object-contain"
          src={`images/product/product-${4}.jpg`}
          alt={product.name}
        />
      </Box>
      <Box className="flex flex-col h-[45rem] my-auto mx-[7rem] overflow-auto ">
        <h2 className="text-[2.4rem] font-bold mb-[1.6rem]">{product.name}</h2>
        <Box className="mb-[2rem]">
          <p className="text-[1.4rem]">{product.description}</p>
        </Box>
        <Box className="flex gap-[15px] items-center text-[1.5rem] mb-[2rem]">
          <p
            className={` ${product.discount ? "line-through text-[#888]" : ""} `}
          >
            {formatPrice.format(product.price || 0)}
          </p>
          {product.discount ? (
            <p className="text-[var(--color-red)]">
              {formatPrice.format((product.price || 0) - product.discount)}
            </p>
          ) : (
            ""
          )}
        </Box>
        <Box className="flex gap-[15px] items-center text-[1.5rem] mb-[2rem]">
          <p className="text-[1.4rem]">Quantity:</p>
          <Box className="flex gap-[1rem] items-center">
            <button
              className="w-[3rem] h-[3rem] flex items-center justify-center border border-[#e1ded9] font-medium rounded-md hover:border-black transition-all"
              onClick={handleDecrement}
              aria-label="Decrease quantity"
            >
              -
            </button>
            <p className="text-[1.4rem] min-w-[2rem] text-center">{quantity}</p>
            <button
              className="w-[3rem] h-[3rem] flex items-center justify-center border border-[#e1ded9] font-medium rounded-md hover:border-black transition-all"
              onClick={handleIncrement}
              aria-label="Increase quantity"
            >
              +
            </button>
          </Box>
        </Box>
        <button
          className="hover:bg-black hover:text-white font-hostgrotesk capitalize w-full h-[8rem] text-[1.4rem] flex items-center justify-center border border-[#e1ded9] font-medium rounded-md hover:border-black transition-all"
          onClick={(e) => handleAddToCart(e, quantity)}
        >
          {isInCart ? "Added to cart" : "Add to cart"}
        </button>

        <p className="mt-[2rem] text-[1.4rem]">
          Cocos nucifera (Coconut) Oil, De-ionized Water, Sodium Hydroxide,
          Fragrance, Kojic Acid, Glycerin, Aqua (and) Xanthan Gum (and) Caprylyl
          Glycol (and) Glucose (and) Chondrus crispus (Carrageenan) (and)
          Phenoxyethanol (and) Ethylhexylglycerine, Cocodiethanolmide, Mineral
          Oil, Melaleuca alternifolia (Tea Tree) Oil, Cl 15985, Cl 19140, BHT
          Directioons Lather soap and apply to treatment areas. Leave the soap
          on for up to 30 seconds. Apply once per day and increase to twice a
          day if well tolerated. If dryness occurs follow with a moisturizing
          cream.
        </p>

        <p className="mt-[2rem] text-[1.4rem]">
          Cocos nucifera (Coconut) Oil, De-ionized Water, Sodium Hydroxide,
          Fragrance, Kojic Acid, Glycerin, Aqua (and) Xanthan Gum (and) Caprylyl
          Glycol (and) Glucose (and) Chondrus crispus (Carrageenan) (and)
          Phenoxyethanol (and) Ethylhexylglycerine, Cocodiethanolamide, Mineral
          Oil, Melaleuca alternifolia (Tea Tree) Oil, Cl 15985, Cl 19140, BHT
          Directioons Lather soap and apply to treatment areas. Leave the soap
          on for up to 30 seconds. Apply once per day and increase to twice a
          day if well tolerated. If dryness occurs follow with a moisturizing
          cream.
        </p>

        <p className="mt-[2rem] text-[1.4rem]">
          Cocos nucifera (Coconut) Oil, De-ionized Water, Sodium Hydroxide,
          Fragrance, Kojic Acid, Glycerin, Aqua (and) Xanthan Gum (and) Caprylyl
          Glycol (and) Glucose (and) Chondrus crispus (Carrageenan) (and)
          Phenoxyethanol (and) Ethylhexylglycerine, Cocodiethanolamide, Mineral
          Oil, Melaleuca alternifolia (Tea Tree) Oil, Cl 15985, Cl 19140, BHT
          Directioons Lather soap and apply to treatment areas. Leave the soap
          on for up to 30 seconds. Apply once per day and increase to twice a
          day if well tolerated. If dryness occurs follow with a moisturizing
          cream.
        </p>

        <p className="mt-[2rem] text-[1.4rem]">
          Cocos nucifera (Coconut) Oil, De-ionized Water, Sodium Hydroxide,
          Fragrance, Kojic Acid, Glycerin, Aqua (and) Xanthan Gum (and) Caprylyl
          Glycol (and) Glucose (and) Chondrus crispus (Carrageenan) (and)
          Phenoxyethanol (and) Ethylhexylglycerine, Cocodiethanolamide, Mineral
          Oil, Melaleuca alternifolia (Tea Tree) Oil, Cl 15985, Cl 19140, BHT
          Directioons Lather soap and apply to treatment areas. Leave the soap
          on for up to 30 seconds. Apply once per day and increase to twice a
          day if well tolerated. If dryness occurs follow with a moisturizing
          cream.
        </p>

        <p className="mt-[2rem] text-[1.4rem]">
          Cocos nucifera (Coconut) Oil, De-ionized Water, Sodium Hydroxide,
          Fragrance, Kojic Acid, Glycerin, Aqua (and) Xanthan Gum (and) Caprylyl
          Glycol (and) Glucose (and) Chondrus crispus (Carrageenan) (and)
          Phenoxyethanol (and) Ethylhexylglycerine, Cocodiethanolamide, Mineral
          Oil, Melaleuca alternifolia (Tea Tree) Oil, Cl 15985, Cl 19140, BHT
          Directioons Lather soap and apply to treatment areas. Leave the soap
          on for up to 30 seconds. Apply once per day and increase to twice a
          day if well tolerated. If dryness occurs follow with a moisturizing
          cream.
        </p>
      </Box>
    </Box>
  );
}
