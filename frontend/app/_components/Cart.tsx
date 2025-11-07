"use client";
import { Box } from "@chakra-ui/react";
import useUserCart, { CartEntry } from "../_hooks/useUserCart";
import useTabs, { Tab, TabHeader, TabWindow } from "./Tabs";
import CartTable from "./CartTable";
import { formatPrice } from "../_utils/utils";
import { CheckoutForm } from "./CheckoutForm";
import useUserDetails from "../_hooks/useUserDetails";
import { User } from "../_utils/types";

const tabs = [
  { name: "cart", title: "Shopping cart" },
  { name: "checkout", title: "Checkout" },
  { name: "complete", title: "Order complete" },
];

export default function Cart() {
  const { cart, isPending, error } = useUserCart();
  const totalPrice = (cart ?? []).reduce<number>(
    (acc: number, item: CartEntry) => {
      const itemTotal = (item.product?.price ?? 0) * (item.quantity ?? 0);
      return acc + itemTotal;
    },
    0
  );
  const { userDetail } = useUserDetails();
  const { handleTabClick } = useTabs();

  // error state the same as empty state
  if ((!isPending && (cart?.length ?? 0) < 1) || error)
    return (
      <Box className="font-semibold py-[2rem] px-[2rem]">
        Your cart is currently empty
      </Box>
    );

  if (isPending)
    return (
      <Box className="font-semibold py-[2rem] px-[2rem]">
        ...Loading cart items
      </Box>
    );

  return (
    <Box className="overflow-hidden mx-auto max-w-[1100px] ">
      <Box className="hidden md:flex gap-[10rem] mt-[6rem] py-[3rem] justify-center border-t border-b border-gray-200">
        {tabs.map((tab, index) => (
          <Tab key={tab.name} tab={tab.name}>
            <TabHeader number={index + 1} title={tab.title} />
          </Tab>
        ))}
      </Box>

      <Box className="pl-[2rem]">
        <TabWindow tab="cart">
          <Box className=" flex flex-col ">
            <CartTable cart={cart} />

            <Box className="mt-[5rem] pr-[2rem] flex flex-col items-end">
              <Box className="flex gap-[2rem] items-center mb-[2rem]">
                <p className="text-[1.2rem] font-semibold">TOTAL</p>
                <p className="font-semibold text-[1.4rem]">
                  {formatPrice(totalPrice)}
                </p>
              </Box>

              <button
                onClick={() => {
                  handleTabClick("checkout");
                }}
                className="text-[1.1rem] mb-[2rem] font-semibold  bg-black text-white px-[1.5rem] py-[1.2rem]"
              >
                PROCEED TO CHECKOUT
              </button>
            </Box>
          </Box>
        </TabWindow>

        <TabWindow tab="checkout">
          <Box className="pr-[2rem]">
            <CheckoutForm userDetail={userDetail as User} />
          </Box>
        </TabWindow>
      </Box>
    </Box>
  );
}
