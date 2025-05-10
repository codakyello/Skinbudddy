"use client";
import { Box } from "@chakra-ui/react";
import { ModalHoverOpen, ModalOpen, ModalWindow, useModal } from "./Modal";
import { useEffect } from "react";
import CartModal from "./CartModal";
import { CiHeart, CiSearch, CiUser } from "react-icons/ci";
import { PiHandbagLight } from "react-icons/pi";
import useCartSummary from "../_hooks/useCartSummary";
import TransitionLink from "./TransitionLink";
import AuthModal from "./AuthModal";
import { useAuth } from "../_contexts/AuthProvider";
import { useQueryClient } from "@tanstack/react-query";
import useSticky from "../_hooks/useSticky";

export default function NavBar() {
  const { isSticky } = useSticky(40);

  console.log(isSticky);

  const { isOpen } = useModal();

  const { user } = useAuth();

  const queryClient = useQueryClient();

  if (user) queryClient.invalidateQueries({ queryKey: ["userCartSummary"] });

  const { data: cartSummary } = useCartSummary({ userId: user?._id });

  console.log(cartSummary);

  useEffect(() => {
    if (isOpen === "user") {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "auto";
    }
  }, [isOpen]);

  return (
    <>
      <nav
        className={`group h-[8rem] z-[99] px-[2rem] justify-between flex gap-16 items-center transition-all duration-500 bg-white text-[#000] ${
          isSticky ? " fixed top-0 left-0 w-full" : "relative"
        }`}
      >
        <ul className="flex text-[1.4rem]  gap-[2.5rem] ">
          <li className=" hover:text-red-600 cursor-pointer">Shop</li>
          <li className=" hover:text-red-600 cursor-pointer">Brands</li>
          <li className=" hover:text-red-600 cursor-pointer">Offers</li>
          <li className=" hover:text-red-600 cursor-pointer">Blog</li>
          <li className=" hover:text-red-600 cursor-pointer">About</li>
        </ul>

        <TransitionLink
          href="/"
          className=" text-[2.8rem] translate-x-[-50%] font-dmSans font-light"
        >
          Skinbuddy
        </TransitionLink>

        <Box className="flex gap-[1.6rem] items-center text-[2.3rem] ">
          <ModalOpen name="cart-reminder">
            <CiSearch className="cursor-pointer" />
          </ModalOpen>

          <ModalOpen name="user">
            <CiUser className="cursor-pointer" />
          </ModalOpen>

          <CiHeart className="text-[2.6rem]" />

          <ModalHoverOpen
            openCondition={cartSummary?.cartCount > 0}
            name="cart"
          >
            <Box>
              <TransitionLink href="/cart" className="relative">
                {cartSummary?.cartCount > 0 && (
                  <span
                    className={`absolute -top-2 -right-4 transition-all duration-500  rounded-full w-[2rem] h-[2rem] flex items-center justify-center text-[1rem] group-hover:bg-[var(--color-primary)] bg-[var(--color-primary)] text-white`}
                  >
                    {cartSummary?.cartCount}
                  </span>
                )}
                <PiHandbagLight />
              </TransitionLink>
            </Box>
          </ModalHoverOpen>
        </Box>
      </nav>

      <ModalWindow
        listenCapturing={true}
        className="bg-[var(--color-modal-bg)] z-[1000]"
        name="user"
        position="right"
        openType="click"
      >
        <AuthModal />
      </ModalWindow>

      <ModalWindow
        className="z-[9]"
        name="cart"
        position="right"
        openType="hover"
      >
        <Box>
          <CartModal />
        </Box>
      </ModalWindow>

      {/* <ModalWindow
        name="cart-reminder"
        className="bg-red-700 z-[99999]"
        position="right"
      >
        <Box>
          <Box className="w-[33rem] h-[14rem] p-[1rem] shadow bg-white">
            Cart Reminder
          </Box>
        </Box>
      </ModalWindow> */}
    </>
  );
}
