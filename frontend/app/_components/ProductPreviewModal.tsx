import { useState } from "react";
import Image from "next/image";
import { Product } from "../_utils/types";
import { IoCloseOutline } from "react-icons/io5";
import { Box } from "@chakra-ui/react";
import { formatPrice } from "../_utils/utils";
import { useUser } from "../_contexts/CreateConvexUser";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import { useMutation } from "convex/react";
import { Id } from "@/convex/_generated/dataModel";
import { useModal } from "./Modal";
import AppError from "../_utils/appError";
import useOutsideClick from "../_hooks/useOutsideClick";
import ModalWrapper from "./ModalWrapper";

export function ProductPreviewModal({
  product,
  onClose,
  position,
  listenCapturing,
}: {
  product: Product;
  onClose?: () => void;
  listenCapturing?: boolean;
  position?: "center" | "top" | "bottom" | "left" | "right";
}) {
  const [selectedSize, setSelectedSize] = useState(product.sizes?.at(0));
  const [isAdding, setIsAdding] = useState(false);
  const { user } = useUser();
  const addToCart = useMutation(api.cart.createCart);
  const { open } = useModal();
  const [quantity, setQuantity] = useState(1);

  const handleIncrement = function () {
    setQuantity((q) => q + 1);
  };
  const handleDecrement = function () {
    setQuantity((q) => (q > 1 ? q - 1 : 1));
  };

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
        quantity,
      });

      if (!res?.success) throw new AppError(res?.message as string);

      toast.success(`Added to cart`);
      // open the cart modal for confirmation
      open("cart");
    } catch (error) {
      if (error instanceof AppError) toast.error(error.message);
      else {
        toast.error("An unknown error occured");
      }
    } finally {
      setIsAdding(false);
    }
  };

  return (
    <ModalWrapper
      listenCapturing={listenCapturing}
      position={position}
      onClose={onClose}
    >
      <Box className="relative max-w-[110rem] h-[60rem] overflow-hidden w-[100%] grid grid-cols-2 bg-white md:flex-row">
        <button onClick={onClose} className="absolute top-[2rem] right-[2rem]">
          <IoCloseOutline className="h-[3.5rem] w-[3.5rem]" />
        </button>
        <Box className="bg-[#f4f4f2] relative">
          {/* src={product.images?.[0] || "/images/product-1.webp"}
        alt={product.name} */}
          <Image
            src={product.images?.at(0) || "/images/product-1.webp"}
            alt={product.name || "Product image"}
            fill
            className="object-contain"
            sizes="(max-width: 768px) 100vw, 50vw"
            priority
          />
        </Box>
        <Box className="flex flex-col h-[45rem] my-auto mx-[7rem] overflow-auto ">
          <h2 className="text-[2.4rem] font-bold mb-[1.6rem]">
            {product.name} {selectedSize?.stock}
          </h2>
          <Box className="mb-[2rem]">
            <p className="text-[1.4rem]">{product.description}</p>
          </Box>
          <Box className="flex flex-col gap-[1rem] mb-[2rem]">
            <p className="text-[1.4rem] font-medium">Select Size:</p>
            <Box className="flex gap-[1rem] flex-wrap">
              {product.sizes?.map((size) => (
                <button
                  key={size.id}
                  onClick={() => {
                    setQuantity(1);
                    setSelectedSize(size);
                  }}
                  className={`px-[1.2rem] py-[0.6rem] border rounded-md text-[1.4rem] transition-all ${
                    selectedSize?.id === size.id
                      ? "bg-black text-white border-black"
                      : "bg-white text-black border-[#e1ded9] hover:border-black"
                  }`}
                >
                  {size.size + " " + size.unit}
                </button>
              ))}
            </Box>
          </Box>
          <Box className="flex gap-[15px] items-center text-[1.5rem] mb-[2rem]">
            <p
              className={`${selectedSize?.discount ? "line-through text-[#888]" : ""} `}
            >
              {formatPrice(selectedSize?.price || 0)}
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
              <p className="text-[1.4rem] min-w-[2rem] text-center">
                {quantity}
              </p>
              <button
                disabled={quantity >= (selectedSize?.stock ?? 0)}
                className="w-[3rem] h-[3rem] flex items-center justify-center border border-[#e1ded9] font-medium rounded-md hover:border-black transition-all"
                onClick={handleIncrement}
                aria-label="Increase quantity"
              >
                +
              </button>
            </Box>
          </Box>
          <button
            disabled={isAdding}
            className="hover:bg-black flex-shrink-0 hover:text-white font-hostgrotesk capitalize w-full h-[5rem] border border-[#e1ded9] font-medium rounded-md hover:border-black transition-all"
            onClick={handleAddToCart}
          >
            Add to cart
          </button>

          <p className="mt-[2rem] text-[1.4rem]">
            Cocos nucifera (Coconut) Oil, De-ionized Water, Sodium Hydroxide,
            Fragrance, Kojic Acid, Glycerin, Aqua (and) Xanthan Gum (and)
            Caprylyl Glycol (and) Glucose (and) Chondrus crispus (Carrageenan)
            (and) Phenoxyethanol (and) Ethylhexylglycerine, Cocodiethanolmide,
            Mineral Oil, Melaleuca alternifolia (Tea Tree) Oil, Cl 15985, Cl
            19140, BHT Directioons Lather soap and apply to treatment areas.
            Leave the soap on for up to 30 seconds. Apply once per day and
            increase to twice a day if well tolerated. If dryness occurs follow
            with a moisturizing cream.
          </p>

          <p className="mt-[2rem] text-[1.4rem]">
            Cocos nucifera (Coconut) Oil, De-ionized Water, Sodium Hydroxide,
            Fragrance, Kojic Acid, Glycerin, Aqua (and) Xanthan Gum (and)
            Caprylyl Glycol (and) Glucose (and) Chondrus crispus (Carrageenan)
            (and) Phenoxyethanol (and) Ethylhexylglycerine, Cocodiethanolamide,
            Mineral Oil, Melaleuca alternifolia (Tea Tree) Oil, Cl 15985, Cl
            19140, BHT Directioons Lather soap and apply to treatment areas.
            Leave the soap on for up to 30 seconds. Apply once per day and
            increase to twice a day if well tolerated. If dryness occurs follow
            with a moisturizing cream.
          </p>

          <p className="mt-[2rem] text-[1.4rem]">
            Cocos nucifera (Coconut) Oil, De-ionized Water, Sodium Hydroxide,
            Fragrance, Kojic Acid, Glycerin, Aqua (and) Xanthan Gum (and)
            Caprylyl Glycol (and) Glucose (and) Chondrus crispus (Carrageenan)
            (and) Phenoxyethanol (and) Ethylhexylglycerine, Cocodiethanolamide,
            Mineral Oil, Melaleuca alternifolia (Tea Tree) Oil, Cl 15985, Cl
            19140, BHT Directioons Lather soap and apply to treatment areas.
            Leave the soap on for up to 30 seconds. Apply once per day and
            increase to twice a day if well tolerated. If dryness occurs follow
            with a moisturizing cream.
          </p>

          <p className="mt-[2rem] text-[1.4rem]">
            Cocos nucifera (Coconut) Oil, De-ionized Water, Sodium Hydroxide,
            Fragrance, Kojic Acid, Glycerin, Aqua (and) Xanthan Gum (and)
            Caprylyl Glycol (and) Glucose (and) Chondrus crispus (Carrageenan)
            (and) Phenoxyethanol (and) Ethylhexylglycerine, Cocodiethanolamide,
            Mineral Oil, Melaleuca alternifolia (Tea Tree) Oil, Cl 15985, Cl
            19140, BHT Directioons Lather soap and apply to treatment areas.
            Leave the soap on for up to 30 seconds. Apply once per day and
            increase to twice a day if well tolerated. If dryness occurs follow
            with a moisturizing cream.
          </p>

          <p className="mt-[2rem] text-[1.4rem]">
            Cocos nucifera (Coconut) Oil, De-ionized Water, Sodium Hydroxide,
            Fragrance, Kojic Acid, Glycerin, Aqua (and) Xanthan Gum (and)
            Caprylyl Glycol (and) Glucose (and) Chondrus crispus (Carrageenan)
            (and) Phenoxyethanol (and) Ethylhexylglycerine, Cocodiethanolamide,
            Mineral Oil, Melaleuca alternifolia (Tea Tree) Oil, Cl 15985, Cl
            19140, BHT Directioons Lather soap and apply to treatment areas.
            Leave the soap on for up to 30 seconds. Apply once per day and
            increase to twice a day if well tolerated. If dryness occurs follow
            with a moisturizing cream.
          </p>
        </Box>
      </Box>
    </ModalWrapper>
  );
}
