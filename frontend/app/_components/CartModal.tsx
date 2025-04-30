/* eslint-disable @next/next/no-img-element */
import { Box } from "@chakra-ui/react";
import { Cart as CartType } from "../_utils/types";
import useCart from "../_hooks/useCart";
import ClipLoader from "react-spinners/ClipLoader";

export default function CartModal() {
  const { data: cart, isLoading } = useCart();

  return (
    <Box className="bg-white w-[40rem] h-[calc(100vh-12rem)] shadow-2xl flex flex-col justify-center items-center">
      {isLoading ? (
        <Box className="w-full h-full flex items-center justify-center bg-white">
          <ClipLoader color="#000" size={50} />
        </Box>
      ) : cart?.length > 0 ? (
        cart.map((item: CartType, index: number) => (
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
