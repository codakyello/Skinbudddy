/* eslint-disable @next/next/no-img-element */
import { Box } from "@chakra-ui/react";
// import { Cart as CartType } from "../_utils/types";
import ClipLoader from "react-spinners/ClipLoader";
import { useNavSticky } from "../_contexts/Sticky";
import useUserCart from "../_hooks/useUserCart";
import { Cart } from "../_utils/types";
import { useUser } from "../_contexts/CreateConvexUser";

export default function CartModal() {
  const { userId } = useUser();
  const { cart, isPending } = useUserCart(userId as string);
  const { isSticky } = useNavSticky();

  return (
    <Box
      className={`bg-white w-[40rem] ${isSticky ? "h-[calc(100vh-8rem)]" : "h-[calc(100vh-11.5rem)]"} shadow-2xl flex flex-col justify-center items-center`}
    >
      {isPending ? (
        <Box className="w-full h-full flex items-center justify-center bg-white">
          <ClipLoader color="#000" size={50} />
        </Box>
      ) : cart && cart?.length > 0 ? (
        cart.map((item: Cart, index: number) => (
          <p className="text-black" key={index}>
            {item?.product?.name}
          </p>
        ))
      ) : (
        <Box className="text-center text-black">Your cart is empty</Box>
      )}
    </Box>
  );
}
