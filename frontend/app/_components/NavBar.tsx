"use client";
import { Box } from "@chakra-ui/react";
import { ModalOpen, ModalWindow, useModal } from "./Modal";
import CartModal from "./CartModal";
import AuthModal from "./AuthModal";
import Link from "next/link";
import useUserCart, { CartEntry } from "../_hooks/useUserCart";
// import Logo from "./Logo";
import NavModal from "./NavModal";
import Search from "./Search";
import { BsStars } from "react-icons/bs";
import { usePathname } from "next/navigation";

const nav = [
  { name: "home", link: "/" },
  { name: "shop", link: "/shop" },
  { name: "best sellers", link: "/" },
  { name: "brands", link: "/" },
  { name: "speak to an expert", link: "/" },
  { name: "more info", link: "/" },
];

export default function NavBar() {
  // const { isSticky } = useNavSticky();

  const { cart } = useUserCart();

  console.log(cart, "cart");
  // Fetch routines to optionally show direct link to latest

  const totalCartItems = cart.reduce<number>(
    (acc: number, item: CartEntry) => acc + (item.quantity ?? 0),
    0
  );

  const { open } = useModal();

  return (
    <Box className="fixed w-full z-[99]">
      <Box className=" bg-white flex px-[2rem] gap-[3.2rem] items-center justify-center border-b">
        <Box className="w-[1280px] flex items-center justify-between gap-x-[3.2rem] gap-y-[1.5rem]">
          <Box className="hidden md:block w-[400px]">
            <Search />
          </Box>

          {/* <Box className=" ml-[120px]">
            <Link href="/">
              <Logo />
            </Link>
          </Box> */}

          {/* Hamburger toggle */}
          <Box
            className="space-y-[4px] md:hidden cursor-pointer"
            onClick={() => open("mobile-nav")}
          >
            <span className="block w-[18px] h-[2px] rounded-lg bg-neutral-800"></span>
            <span className="block w-[18px] h-[2px] rounded-lg bg-neutral-800"></span>
            <span className="block w-[18px] h-[2px] rounded-lg bg-neutral-800"></span>
          </Box>

          <Box className="flex justify-end items-center text-[2.3rem]">
            <ModalOpen name="user">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                className="cursor-pointer h-[20px] w-[20px] mr-[18px] text-[#121212]"
                viewBox="0 0 18 19"
              >
                <path
                  fill="currentColor"
                  fill-rule="evenodd"
                  d="M6 4.5a3 3 0 1 1 6 0 3 3 0 0 1-6 0m3-4a4 4 0 1 0 0 8 4 4 0 0 0 0-8m5.58 12.15c1.12.82 1.83 2.24 1.91 4.85H1.51c.08-2.6.79-4.03 1.9-4.85C4.66 11.75 6.5 11.5 9 11.5s4.35.26 5.58 1.15M9 10.5c-2.5 0-4.65.24-6.17 1.35C1.27 12.98.5 14.93.5 18v.5h17V18c0-3.07-.77-5.02-2.33-6.15-1.52-1.1-3.67-1.35-6.17-1.35"
                  clip-rule="evenodd"
                ></path>
              </svg>
            </ModalOpen>

            <svg
              className="cursor-pointer text-[#121212] mr-[10px]"
              xmlns="http://www.w3.org/2000/svg"
              width="24px"
              height="24px"
              viewBox="0 0 24 24"
              fill="none"
            >
              <path
                d="M19.6706 5.4736C17.6806 3.8336 14.7206 4.1236 12.8906 5.9536L12.0006 6.8436L11.1106 5.9536C9.29063 4.1336 6.32064 3.8336 4.33064 5.4736C2.05064 7.3536 1.93063 10.7436 3.97063 12.7836L11.6406 20.4536C11.8406 20.6536 12.1506 20.6536 12.3506 20.4536L20.0206 12.7836C22.0706 10.7436 21.9506 7.3636 19.6706 5.4736Z"
                stroke="currentColor"
                stroke-miterlimit="10"
                stroke-linecap="round"
                stroke-linejoin="round"
              ></path>
            </svg>

            <ModalOpen name="cart">
              <Box className="relative cursor-pointer">
                {cart.length > 0 && (
                  <span
                    className={`absolute bottom-3 right-[3px] transition-all duration-500  rounded-full w-[17px] h-[17px] flex items-center justify-center text-[9px] group-hover:bg-[var(--color-primary)] bg-[var(--color-primary)] text-white`}
                  >
                    {totalCartItems}
                  </span>
                )}
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  className="h-[44px] w-[44px]"
                  viewBox="0 0 40 40"
                >
                  <path
                    fill="currentColor"
                    fill-rule="evenodd"
                    d="M20.5 6.5a4.75 4.75 0 0 0-4.75 4.75v.56h-3.16l-.77 11.6a5 5 0 0 0 4.99 5.34h7.38a5 5 0 0 0 4.99-5.33l-.77-11.6h-3.16v-.57A4.75 4.75 0 0 0 20.5 6.5m3.75 5.31v-.56a3.75 3.75 0 1 0-7.5 0v.56zm-7.5 1h7.5v.56a3.75 3.75 0 1 1-7.5 0zm-1 0v.56a4.75 4.75 0 1 0 9.5 0v-.56h2.22l.71 10.67a4 4 0 0 1-3.99 4.27h-7.38a4 4 0 0 1-4-4.27l.72-10.67z"
                  ></path>
                </svg>
              </Box>
            </ModalOpen>

            {/* <ModalHoverOpen
              openCondition={cart.length > 0}
              name="cart"
            >
              <Link href={"/cart"} className="relative cursor-pointer">
                {cart.length > 0 && (
                  <span
                    className={`absolute -top-2 -right-4 transition-all duration-500  rounded-full w-[2rem] h-[2rem] flex items-center justify-center text-[1rem] group-hover:bg-[var(--color-primary)] bg-[var(--color-primary)] text-white`}
                  >
                    <div>{totalCartItems}</div>
                  </span>
                )}
                <svg
                  className="cursor-pointer"
                  width="21"
                  height="20"
                  viewBox="0 0 21 20"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    fillRule="evenodd"
                    clipRule="evenodd"
                    d="M8.6307 5C8.74852 4.17776 8.9326 3.55439 9.1729 3.09564C9.38779 2.68539 9.64067 2.42048 9.92184 2.25433C10.204 2.0876 10.5491 2 10.98 2C11.4109 2 11.756 2.0876 12.0381 2.25433C12.3193 2.42048 12.5722 2.68539 12.7871 3.09564C13.0274 3.55439 13.2115 4.17776 13.3293 5H8.6307ZM7.52497 6C7.49468 6.46527 7.47998 6.96498 7.47998 7.5H8.47998C8.47998 6.95197 8.49611 6.45312 8.52737 6H13.4326C13.4639 6.45312 13.48 6.95197 13.48 7.5H14.48C14.48 6.96498 14.4653 6.46527 14.435 6H17.0489L17.906 18H4.05395L4.91105 6H7.52497ZM7.62124 5C7.74933 4.02758 7.96739 3.24191 8.28706 2.63163C8.57217 2.08734 8.94429 1.67043 9.41312 1.3934C9.88096 1.11695 10.4108 1 10.98 1C11.5491 1 12.079 1.11695 12.5469 1.3934C13.0157 1.67043 13.3878 2.08734 13.6729 2.63163C13.9926 3.24191 14.2106 4.02758 14.3387 5H17.98L18.98 19H2.97998L3.97993 5H7.62124Z"
                    fill="black"
                  />
                </svg>
              </Link>
            </ModalHoverOpen> */}
          </Box>
        </Box>
      </Box>

      <Box className="hidden md:block">
        {/* <Box className=" bg-black h-[4.4rem] flex items-center justify-center">
          <ul className="text-[#fff] flex uppercase text-[1.3rem]">
            {nav.map((item) => (
              <ModalHoverOpen key={item.name} name={""}>
                <li className="px-[2rem] cursor-pointer">
                  <Link href={item.link}>{item.name}</Link>
                </li>
              </ModalHoverOpen>
            ))}
            <li className="flex gap-2 px-[2rem]">
              <BsStars className="text-[1.6rem]" />
              <Link href={"/recommender"}>Recommendation</Link>
            </li>
          </ul>
        </Box> */}

        {/* Modal menu for nav menu */}
        <ModalWindow bgClassName="z-[999]" name="shop" openType="hover">
          <NavModal />
        </ModalWindow>
        <ModalWindow bgClassName="z-[999]" name="best sellers" openType="hover">
          <NavModal />
        </ModalWindow>
        <ModalWindow bgClassName="z-[999]" name="brands" openType="hover">
          <NavModal />
        </ModalWindow>

        <Box className="md:hidden">
          <ModalWindow
            name="mobile-nav"
            position="left"
            bgClassName="z-[999]"
            className=" w-full"
          >
            <SideBar />
          </ModalWindow>
        </Box>

        <ModalWindow
          bgClassName="z-[999]"
          name="speak to an expert"
          openType="hover"
        >
          <NavModal />
        </ModalWindow>
      </Box>

      <ModalWindow
        listenCapturing={true}
        bgClassName="bg-[var(--color-modal-bg)] z-[9999]"
        name="user"
        position="right"
        openType="click"
      >
        <AuthModal />
      </ModalWindow>

      <ModalWindow
        listenCapturing={true}
        bgClassName="bg-[var(--color-modal-bg)] z-[9999]"
        className="w-full md:w-[45.5rem]"
        name="cart"
        position="right"
      >
        <CartModal />
      </ModalWindow>
    </Box>
  );
}

function SideBar({ onClose }: { onClose?: () => void }) {
  const pathname = usePathname();
  return (
    <Box className=" w-full flex h-screen flex-col gap-4 p-[2rem]">
      {/* {isOpen && (
        <Box
          onClick={onClose}
          className="cursor-pointer fixed inset-0 bg-[var(--color-modal-bg)]"
        ></Box>
      )} */}

      <Box className="flex">
        <Box
          className="font-medium text-[2.2rem] h-14 aspect-square grid place-items-center bg-black text-white rounded-full cursor-pointer"
          onClick={onClose}
        >
          ×
        </Box>
      </Box>

      <Box className="flex flex-col gap-3">
        <Search />

        <div className="p-4">
          <ul className="flex flex-col text-black uppercase text-[1.3rem] divide-y divide-neutral-200">
            {nav.map((item) => (
              <li key={item.name}>
                <Link
                  onClick={() => {
                    // close immediately because there is no navigation
                    if (pathname === item.link) onClose?.();
                  }}
                  href={item.link}
                  className="flex py-6 cursor-pointer w-full"
                >
                  {item.name}
                </Link>
              </li>
            ))}
            <li>
              <Link
                className="flex gap-2 py-6 cursor-pointer w-full"
                href={"/recommender"}
              >
                <BsStars className="text-[1.6rem]" />
                Recommendation
              </Link>
            </li>
          </ul>
        </div>
      </Box>
    </Box>
  );
}
