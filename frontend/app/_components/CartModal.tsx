/* eslint-disable @next/next/no-img-element */
import { Box } from "@chakra-ui/react";
import ClipLoader from "react-spinners/ClipLoader";
import { useNavSticky } from "../_contexts/Sticky";
import useUserCart from "../_hooks/useUserCart";
import { Cart } from "../_utils/types";
import { useUser } from "../_contexts/CreateConvexUser";
import { X, Minus, Plus } from "lucide-react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { toast } from "sonner";
import { formatPrice } from "../_utils/utils";

export default function CartModal() {
  const { user } = useUser();
  const { cart, isPending } = useUserCart(user.id as string);
  const { isSticky } = useNavSticky();

  const images = [
    "/images/product/good-molecules.webp",
    "/images/product/cerave-daily.png",
    "/images/product/larosh-moisturizer.png",
    "/images/product/facefacts-moisturising-gel-cream.webp",
    "/images/product/good-molecules.webp",
    "/images/product/cerave-daily.png",
    "/images/product/larosh-moisturizer.png",
    "/images/product/facefacts-moisturising-gel-cream.webp",
    "/images/product/good-molecules.webp",
    "/images/product/cerave-daily.png",
    "/images/product/larosh-moisturizer.png",
    "/images/product/facefacts-moisturising-gel-cream.webp",
  ];

  const updateCartQuantity = useMutation(api.cart.updateCartQuantity);

  const removeFromCart = useMutation(api.cart.removeFromCart);

  const handleUpdateCartQuantity = async function (
    quantity: number,
    cartId: Id<"carts">
  ) {
    try {
      await updateCartQuantity({ quantity, cartId });
      toast.success("Cart updated successfully");
    } catch (_err) {
      console.log(_err)
      toast.success("There was an issue updating cart");
    }
  };

  console.log(cart);

  return (
    <Box
      className={`bg-white z-20 overflow-y-auto w-[45.5rem] p-[20px] ${isSticky ? "h-[calc(100vh-8rem)]" : "h-[calc(100vh-11.5rem)]"} shadow-2xl `}
    >
      {isPending ? (
        <Box className="w-full h-full flex items-center justify-center bg-white">
          <ClipLoader color="#000" size={50} />
        </Box>
      ) : cart && cart?.length > 0 ? (
        cart.map((item: Cart, index: number) => (
          <div
            key={index}
            className="relative flex items-center gap-[1.6rem] mb-[1.6rem] pb-[16px] transition-all duration-300 border-b border-gray-200"
          >
            {/* Remove button */}
            <button
              className="absolute top-3 right-3 p-[0.8rem] rounded-full bg-gray-100 hover:bg-gray-200 transition"
              onClick={async () => {
                try {
                  await removeFromCart({ cartId: item._id });
                  toast.success("Successfully removed from cart");
                } catch (err) {
                  console.log(err)
                  toast.success("Failed to removed from cart");
                }
              }}
              type="button"
            >
              <X className="w-[1.6rem] h-[1.6rem] text-gray-500" />
            </button>
            {/* Product image */}
            <div className="w-[8rem] h-[8rem] overflow-hidden rounded-[1.2rem]flex items-center justify-center">
              {item?.product?.images ? (
                <img
                  src={images.at(index % images.length)}
                  alt={item?.product?.name || "Product"}
                  className="object-contain w-full h-full transition-transform duration-300 hover:scale-105"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-gray-300 text-[1.6rem] bg-gray-100">
                  {/* fallback image or icon */}
                  <span>—</span>
                </div>
              )}
            </div>
            {/* Product info and quantity controls */}
            <div className="flex-1 min-w-0 flex flex-col gap-[15px]">
              <div className="flex flex-col gap-[5px]">
              <div className="font-semibold text-gray-900 text-[1.6rem] truncate">
                {item?.product?.name}
              </div>

              <p>{item.product?.size + " " + item.product?.unit}</p>
              </div>
             
              

              <div className="flex gap-x-[2rem] items-center">
                <div className="flex items-center gap-[0.8rem] mt-[0.8rem]">
                  <button
                    className="p-[0.8rem] rounded-full border border-gray-300 hover:bg-gray-100"
                    onClick={() => {
                      handleUpdateCartQuantity(item.quantity - 1, item._id);
                    }}
                    disabled={item.quantity <= 1}
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
                    type="button"
                  >
                    <Plus className="w-[1.4rem] h-[1.4rem]" />
                  </button>
                </div>

                <div className="text-gray-500 text-[1.4rem] mt-1">
                {item?.product?.price && formatPrice.format(item.product.price * item.quantity)}
              </div>
              </div>
            </div>
          </div>
        ))
      ) : (
        <Box className="text-center text-black">Your cart is empty</Box>
      )}
    </Box>
  );
}
