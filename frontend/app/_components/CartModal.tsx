/* eslint-disable @next/next/no-img-element */
import { Box } from "@chakra-ui/react";
import ClipLoader from "react-spinners/ClipLoader";
import { useNavSticky } from "../_contexts/Sticky";
import useUserCart from "../_hooks/useUserCart";
import { Cart, Product } from "../_utils/types";
import { useUser } from "../_contexts/CreateConvexUser";
import { X, Minus, Plus } from "lucide-react";
import { useMutation } from "convex/react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { toast } from "sonner";
import { formatPrice, hasCategory } from "../_utils/utils";
import { useMemo, useState } from "react";
import AppError from "../_utils/appError";
import { convexQuery } from "@convex-dev/react-query";
import { useModal } from "./Modal";

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

export default function CartModal({ skipped = false }: { skipped?: boolean }) {
  const { user } = useUser();
  const { cart, isPending } = useUserCart(user._id as string);
  const { isSticky } = useNavSticky();
  const [isUpdating, setIsUpdating] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isInitiating, setIsInitiating] = useState(false);
  const { open } = useModal();
  const updateCartQuantity = useMutation(api.cart.updateCartQuantity);
  const removeFromCart = useMutation(api.cart.removeFromCart);
  const createOrder = useMutation(api.order.createOrder);
  // const generateOrderToken = useMutation(api.order.generateOrderToken);
  const [orderDiscrepancies, setOrderDiscrepancies] = useState<
    Record<string, string>
  >({});

  // Build a stable list of selected product IDs from the cart
  const selectedProductIds = useMemo(() => {
    return (cart || [])
      .map((item) => item.product?._id)
      .filter(Boolean) as Id<"products">[];
  }, [cart]);

  // Prefetch essentials whenever the cart changes (top-level reactive query)
  const { data: essentials } = useQuery(
    convexQuery(api.products.getEssentialProducts, {
      selectedProductIds,
      perCategory: 10,
      // fragranceFree: true, // uncomment if you want to force FF
    })
  );

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

  const handleOrder = async function () {
    // Before processing an order lets;

    // 1. We check if the user dosent have a routine
    // not implemented yet

    // 2. Check if at least one of the products can be included in a routine
    // if(cart.) {}
    console.log(cart);
    // if (c) {
    //   toast.error("can be included in routine");
    //   return;

    // }
    const products = cart
      .map((item) => item.product)
      .filter(Boolean) as Product[];
    if (cart.length < 1) return;

    const productCanBeInRoutine = cart.some(
      (item) => item.product?.canBeInRoutine
    );

    const hasCoreProducts = ["moisturiser", "cleanser", "sunscreen"].every(
      (cat) => hasCategory(products, cat)
    );

    const hasSuggestions = Array.isArray(essentials)
      ? essentials.length > 0
      : essentials &&
        Object.values(essentials).some(
          (list) => Array.isArray(list) && list.length > 0
        );

    if (!skipped && productCanBeInRoutine && !hasCoreProducts) {
      // We already prefetched essentials at the top via useQuery; use it here
      if (hasSuggestions) {
        console.log("recommend", essentials);
        // open a modal and pass `essentials` to suggest items for missing steps
        open("routine-suggestions");
        return;
      } else {
        // take them to checkout
      }
      // If essentials is still loading (undefined) or no suggestions (false), you could optionally fall back
      console.log("recommend: essentials not ready or none available");
      return;
    } else {
      console.log("checkout");
      try {
        setIsInitiating(true);
        const res = await createOrder({
          userId: user._id as string,
          email: "ruro@email.com",
          phone: "+2348163136350",
          address: "123 Main St",
          city: "Lagos",
          state: "Lagos",
          country: "Nigeria",
          firstName: user.name?.split(" ")[0] || "John",
          lastName: user.name?.split(" ")[1] || "Doe",
          companyName: "", // Optional, providing an empty string for dummy data
          streetAddress: "Apt 4B", // Optional
          deliveryNote: "Leave at door", // Optional
        });

        const orderId = res?.orderId;

        const discrepancies = res?.discrepancies;

        const obj: Record<string, string> = {};

        if (discrepancies)
          discrepancies.forEach((d: { cartId: string; reason: string }) => {
            obj[d.cartId] = d.reason;
          });

        if (Object.keys(obj).length > 0) setOrderDiscrepancies(obj);
        // console.log(discrepancies, "This are the discrepancies");

        if (!res.success) throw new AppError(res.message as string);

        if (!orderId) {
          throw new AppError("Order ID not found after creation");
        }

        const totalAmount = cart.reduce(
          (acc, item) =>
            (item.product?.price ?? 0) * (item.quantity ?? 0) + acc,
          0
        );

        //2. initiate the payment transaction and get the authorization url
        const paystackRes = await fetch("/api/paystack/init", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            orderId,
            userId: user._id,
            email: "ruro@email.com", // Use user's email for Paystack
            amount: totalAmount, // Total amount in Naira
            phone: "2348163136350",
            fullName: "Olaoluwa Olorede",
          }),
        });

        const paystackData = await paystackRes.json();

        if (!paystackRes.ok || !paystackData.success) {
          throw new AppError(
            paystackData.message || "Failed to initiate Paystack payment"
          );
        }

        //3. Redirect user to the authorization url
        window.location.href = paystackData.authorization_url;

        toast.success("order created successfully");
      } catch (err) {
        if (err instanceof AppError) toast.error(err.message);
        // else if (err instanceof Error) toast.error(err.message);
        else toast.error("Something went wrong");
      } finally {
        setIsInitiating(false);
      }
    }

    // we are checking if the products have moisturiser, clenser and sunscreen
    // a list of products that has

    // 3. Check if the products cannot complete a routine

    // 4. Show recommendations to help users complete their routine

    //1. initiate the order, get the orderId
  };

  const handleGenerateOrderToken = async function () {
    console.log("Called generate order token");
    try {
      setIsInitiating(true);
      const res = await createOrder({
        orderType: "pay_for_me",
        userId: user._id as string,
        email: "ruro@email.com",
        phone: "+2348163136350",
        address: "123 Main St",
        city: "Lagos",
        state: "Lagos",
        country: "Nigeria",
        firstName: user.name?.split(" ")[0] || "John",
        lastName: user.name?.split(" ")[1] || "Doe",
        companyName: "", // Optional, providing an empty string for dummy data
        streetAddress: "Apt 4B", // Optional
        deliveryNote: "Leave at door", // Optional
      });

      const discrepancies = res?.discrepancies;

      const obj: Record<string, string> = {};

      if (discrepancies)
        discrepancies.forEach((d: { cartId: string; reason: string }) => {
          obj[d.cartId] = d.reason;
        });

      console.log(res, "response");

      if (Object.keys(obj).length > 0) setOrderDiscrepancies(obj);

      if (!res.success) throw new AppError(res.message);

      toast.success("Token generated successfully");

      // Build a shareable URL from the returned token and show it to the user
      if (!res.token) throw new AppError("Token was not returned");

      const shareUrl = `${window.location.origin}/pay/${res.token}`;

      // Attempt to copy to clipboard for convenience
      try {
        await navigator.clipboard.writeText(shareUrl);
        toast.success("Link copied to clipboard");
      } catch {
        // Fallback: ignore clipboard errors and continue to prompt
      }

      // Show a prompt so the user can see/copy the link even if clipboard fails
      window.prompt(
        "Shareable payment link (press ⌘/Ctrl+C to copy)",
        shareUrl
      );
    } catch (err) {
      if (err instanceof AppError) toast.error(err.message);
      // else if (err instanceof Error) toast.error(err.message);
      else toast.error("Something went wrong");
    } finally {
      setIsInitiating(false);
    }
  };

  return (
    <Box
      className={`bg-white z-20 overflow-y-auto w-[45.5rem] p-[20px] ${isSticky ? "h-[calc(100vh-8rem)]" : "h-[calc(100vh-11.5rem)]"} shadow-2xl `}
    >
      {isPending ? (
        <Box className="w-full h-full flex items-center justify-center bg-white">
          <ClipLoader color="#000" size={50} />
        </Box>
      ) : cart && cart?.length > 0 ? (
        <>
          {cart.map((item: Cart, index: number) => (
            <Box
              key={index}
              className="relative flex items-center gap-[1.6rem] mb-[1.6rem] pb-[16px] transition-all duration-300 border-b border-gray-200"
            >
              {/* Remove button */}
              <button
                disabled={isDeleting}
                className="absolute top-3 right-3 p-[0.8rem] rounded-full bg-gray-100 hover:bg-gray-200 transition"
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
                    src={images.at(index % images.length)}
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
                  <Box className="font-semibold text-gray-900 text-[1.6rem] truncate">
                    {item?.product?.name}
                  </Box>

                  <p>{item.product?.size + " " + item.product?.unit}</p>

                  <p>{item.product?.stock}</p>
                </Box>
                <Box className="flex gap-x-[2rem] items-center">
                  <Box className="flex items-center gap-[0.8rem] mt-[0.8rem]">
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

                  <Box className="text-gray-500 text-[1.4rem] mt-1">
                    {item?.product?.price &&
                      formatPrice.format(item.product.price * item.quantity)}
                  </Box>
                </Box>
              </Box>

              <p className="text-red-500">{orderDiscrepancies[item._id]}</p>
            </Box>
          ))}

          <p>
            Total amount:{" "}
            {formatPrice.format(
              cart?.reduce(
                (acc, item) =>
                  (item.product?.price ?? 0) * (item.quantity ?? 0) + acc,
                0
              )
            )}
          </p>

          <button
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
          </button>
        </>
      ) : (
        <Box className="text-center text-black">Your cart is empty</Box>
      )}
    </Box>
  );
}
