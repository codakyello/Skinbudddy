/* eslint-disable @next/next/no-img-element */
import { Box } from "@chakra-ui/react";
import ClipLoader from "react-spinners/ClipLoader";
import useUserCart from "../_hooks/useUserCart";
import { Cart } from "../_utils/types";
import { useUser } from "../_contexts/CreateConvexUser";
import { X, Minus, Plus } from "lucide-react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { toast } from "sonner";
import { formatPrice } from "../_utils/utils";
import { useState } from "react";
import AppError from "../_utils/appError";
import TransitionLink from "./TransitionLink";

// const images = [
//   "/images/product/good-molecules.webp",
//   "/images/product/cerave-daily.png",
//   "/images/product/larosh-moisturizer.png",
//   "/images/product/facefacts-moisturising-gel-cream.webp",
//   "/images/product/good-molecules.webp",
//   "/images/product/cerave-daily.png",
//   "/images/product/larosh-moisturizer.png",
//   "/images/product/facefacts-moisturising-gel-cream.webp",
//   "/images/product/good-molecules.webp",
//   "/images/product/cerave-daily.png",
//   "/images/product/larosh-moisturizer.png",
//   "/images/product/facefacts-moisturising-gel-cream.webp",
// ];

export default function CartModal() {
  const { user } = useUser();
  const { cart, isPending } = useUserCart(user._id as string);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const updateCartQuantity = useMutation(api.cart.updateCartQuantity);
  const removeFromCart = useMutation(api.cart.removeFromCart);
  // const generateOrderToken = useMutation(api.order.generateOrderToken);
  const [orderDiscrepancies] = useState<Record<string, string>>({});

  console.log(cart, "This are cart");

  const handleUpdateCartQuantity = async function (
    quantity: number,
    cartId: Id<"carts">
  ) {
    try {
      setIsUpdating(true);
      const res = await updateCartQuantity({ quantity, cartId });
      if (!res.success) throw new AppError(res.message as string);
      toast.success("Cart updated successfully");
    } catch (err) {
      if (err instanceof AppError) toast.error(err.message);
      else toast.error("Something went wrong");
    } finally {
      setIsUpdating(false);
    }
  };

  const totalPrice = cart?.reduce(
    (acc, item) => (item.product?.price ?? 0) * (item.quantity ?? 0) + acc,
    0
  );

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
    <Box
      className={`bg-white z-20 overflow-y-auto w-[45.5rem] p-[30px] h-screen shadow-2xl `}
    >
      {isPending ? (
        <Box className="w-full h-full flex items-center justify-center bg-white">
          <ClipLoader color="#000" size={50} />
        </Box>
      ) : (
        <Box className="flex flex-col h-full">
          <Box>
            <p className="uppercase text-[1.3rem] font-semibold pb-[2rem] border-b border-gray-200">
              Shopping Bag
            </p>
          </Box>
          {cart && cart.length > 0 ? (
            <>
              <Box className="flex-1 overflow-auto">
                {cart.map((item: Cart) => (
                  <Box
                    key={item._id}
                    className="relative flex items-center gap-[1.6rem] py-[16px] transition-all duration-300 border-b border-gray-200"
                  >
                    {/* Remove button */}
                    <button
                      disabled={isDeleting}
                      className="absolute top-0 right-3 p-[0.8rem] rounded-full bg-gray-100 hover:bg-gray-200 transition"
                      onClick={() => {
                        handleDeleteCartItem(item._id);
                      }}
                      type="button"
                    >
                      <X className="w-[1.6rem] h-[1.6rem] text-gray-500" />
                    </button>
                    {/* Product image */}
                    <Box className="w-[8rem] h-[8rem] overflow-hidden rounded-[1.2rem]flex items-center justify-center">
                      {item?.product?.images ? (
                        <img
                          src={item.product.images.at(0)}
                          alt={item?.product?.name || "Product"}
                          className="object-contain w-full h-full transition-transform duration-300 hover:scale-105"
                        />
                      ) : (
                        <Box className="w-full h-full flex items-center justify-center text-gray-300 text-[1.6rem] bg-gray-100">
                          {/* fallback image or icon */}
                          <span>—</span>
                        </Box>
                      )}
                    </Box>
                    {/* Product info and quantity controls */}
                    <Box className="flex-1 min-w-0 flex flex-col gap-[15px]">
                      <Box className="flex flex-col gap-[5px]">
                        <Box className="font-semibold uppercase text-gray-900 text-[1.3rem] truncate">
                          {item?.product?.name}
                        </Box>

                        <p className="text-[1.3rem]">
                          {item.product?.size + "" + item.product?.unit}
                        </p>

                        {/* <p>{item.product?.stock}</p> */}
                      </Box>
                      <Box className="flex gap-x-[2rem] items-center">
                        <Box className="flex items-center gap-[0.8rem]">
                          <button
                            className="p-[0.8rem] rounded-full border border-gray-300 hover:bg-gray-100"
                            onClick={() => {
                              handleUpdateCartQuantity(
                                item.quantity - 1,
                                item._id
                              );
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
                              handleUpdateCartQuantity(
                                item.quantity + 1,
                                item._id
                              );
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

                        <Box className="text-gray-900 text-[1.4rem] mt-1">
                          {item?.product?.price &&
                            formatPrice(item.product.price * item.quantity)}
                        </Box>
                      </Box>
                    </Box>

                    <p className="text-red-500">
                      {orderDiscrepancies[item._id]}
                    </p>
                  </Box>
                ))}
              </Box>

              {/* Total box */}
              <Box className="pt-[20px] mt-[20px] border-t border-gray-200 text-[1.3rem] font-semibold">
                <Box className="flex items-center justify-between mb-[20px]">
                  <p> SUBTOTAL:</p>
                  <p>{formatPrice(totalPrice)}</p>
                </Box>

                <Box className="flex gap-[1.5rem] ">
                  <TransitionLink
                    href={"/cart"}
                    className="flex-1 flex justify-center items-center rounded-[2px] h-[4.5rem] uppercase text-[1.3rem] bg-[#eaedf0]"
                  >
                    View basket
                  </TransitionLink>
                  <TransitionLink
                    href={"/cart?tab=checkout"}
                    className="flex-1 h-[4.5rem] flex justify-center items-center rounded-[2px] uppercase text-[1.3rem] text-[#fff] bg-[#212529]"
                  >
                    Checkout
                  </TransitionLink>
                </Box>
                {/* <button
                disabled={isInitiating}
                onClick={handleOrder}
                className="bg-blue-600 text-white font-semibold py-2 px-6 rounded-md hover:bg-blue-700 transition"
              >
                Order
              </button>

              <button
                className="ml-4 bg-black text-white font-semibold py-2 px-6 rounded-md transition"
                onClick={handleGenerateOrderToken}
              >
                Generate link
              </button> */}
              </Box>
            </>
          ) : (
            <p className="mt-[2rem] font-semibold text-[1.4rem]">
              No products in cart.
            </p>
          )}
        </Box>
      )}
    </Box>
  );
}
