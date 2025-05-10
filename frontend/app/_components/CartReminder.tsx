"use client";
import { useEffect, useRef } from "react";

import { Box, Button } from "@chakra-ui/react";
import { useAuth } from "../_contexts/AuthProvider";
import useCartSummary from "../_hooks/useCartSummary";
import { useState } from "react";
import { TfiClose } from "react-icons/tfi";
import TransitionLink from "./TransitionLink";
import { usePathname } from "next/navigation";
export default function CartReminder() {
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(true);
  const pathname = usePathname();
  const hasMounted = useRef(false);

  console.log(pathname);

  const { data: cartSummary } = useCartSummary({
    userId: user?._id,
  });

  // This is running on initial render and i dont want it to run on initial render

  useEffect(() => {
    if (!hasMounted.current) {
      hasMounted.current = true;
      return;
    }

    // Only close if it's currently open
    if (isOpen) {
      console.log("closing cart reminder due to route change");
      setIsOpen(false);
    }
  }, [pathname, isOpen]);

  console.log(isOpen);

  if (cartSummary?.cartCount > 0)
    return (
      <Box
        className={`fixed shadow-sm flex top-[8rem] gap-[16px] right-[4.5rem] p-[16px] bg-white z-[9999]  ${
          isOpen ? "cart-reminder-enter" : "cart-reminder-exit"
        }`}
      >
        <Box className="w-[10rem] h-[12rem] ">
          <img
            className="w-full h-full object-cover"
            src={cartSummary?.cart?.product?.images[0]}
            alt="cart-reminder"
          />
        </Box>

        <Box className="flex flex-col">
          <p className="text-[2rem] w-[16.8rem]">
            Hey you left something in your bag.
          </p>

          <TransitionLink
            href="/cart"
            className="mt-auto underline text-[1.6rem] font-medium"
          >
            View Shopping Bag
          </TransitionLink>
        </Box>

        <Box>
          <Button onClick={() => setIsOpen(false)}>
            <TfiClose className="text-[2rem]" />
          </Button>
        </Box>
      </Box>
    );
}
