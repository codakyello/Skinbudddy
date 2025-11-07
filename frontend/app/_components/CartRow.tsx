import { Box } from "@chakra-ui/react";
import { Cart } from "../_utils/types";
import Row from "./Row";
import Image from "next/image";
import { formatPrice } from "../_utils/utils";
import { Id } from "@/convex/_generated/dataModel";
import { useState } from "react";
import { toast } from "sonner";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Minus, Plus, X } from "lucide-react";
import AppError from "../_utils/appError";

export default function CartRow({ item }: { item: Cart }) {
  const [isUpdating, setIsUpdating] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const updateCartQuantity = useMutation(api.cart.updateCartQuantity);
  const removeFromCart = useMutation(api.cart.removeFromCart);

  const handleUpdateCartQuantity = async function (
    quantity: number,
    cartId: Id<"carts">
  ) {
    try {
      setIsUpdating(true);
      const res = await updateCartQuantity({
        quantity,
        cartId,
      });
      if (!res.success) throw new AppError(res.message as string);
      toast.success("Cart updated successfully");
    } catch (err) {
      if (err instanceof AppError) toast.error(err.message);
      else toast.error("Something went wrong");
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDeleteCartItem = async function (cartId: Id<"carts">) {
    try {
      setIsDeleting(true);
      const res = await removeFromCart({ cartId });
      if (!res.success) throw new AppError(res.message as string);
      toast.success("Cart item deleted successfully");
    } catch (err) {
      if (err instanceof AppError) toast.error(err.message);
      else toast.error("Something went wrong");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <Row>
      <Box className="flex gap-[2rem]">
        <Box className="relative w-[12rem] aspect-square">
          <Image
            alt="cart-image"
            src={item?.product?.images?.[0] || ""}
            fill
            className="object-contain"
          />
        </Box>

        <Box className="flex flex-col gap-2">
          <p>{item.product?.name}</p>
          <p>{(item.product?.size || "") + (item.product?.unit || "")}</p>
        </Box>
      </Box>
      <Box className="font-semibold">{formatPrice(item.product?.price)}</Box>
      <Box className="text-black font-semibold">
        <Box className="flex items-center gap-[0.8rem]">
          <button
            className="p-[0.8rem] rounded-full border border-gray-300 hover:bg-gray-100"
            onClick={() => {
              handleUpdateCartQuantity(item.quantity - 1, item._id);
            }}
            disabled={item.quantity <= 1 || isUpdating}
            type="button"
          >
            <Minus className="w-[1.4rem] h-[1.4rem]" />
          </button>
          <span className="font-medium text-[1.4rem] text-gray-900">
            {item.quantity}
          </span>
          <button
            className="p-[0.8rem] rounded-full border border-gray-300 hover:bg-gray-100"
            onClick={() => {
              handleUpdateCartQuantity(item.quantity + 1, item._id);
            }}
            // disabled={
            //   isUpdating ||
            //   (item.product?.stock !== undefined &&
            //     item.quantity >= item.product.stock)
            // }
            type="button"
          >
            <Plus className="w-[1.4rem] h-[1.4rem]" />
          </button>
        </Box>
      </Box>
      <Box className="font-semibold">
        {formatPrice((item.product?.price || 0) * item.quantity)}
      </Box>
      <Box>
        <button
          className="p-[0.8rem] rounded-full bg-gray-100 hover:bg-gray-200 transition disabled:opacity-50 disabled:cursor-not-allowed"
          onClick={() => handleDeleteCartItem(item._id)}
          disabled={isDeleting}
          type="button"
          aria-label="Remove item from cart"
        >
          <X className="w-[1.6rem] h-[1.6rem] text-gray-500" />
        </button>
      </Box>
    </Row>
  );
}
