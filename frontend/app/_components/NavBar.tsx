"use client";
import { Box } from "@chakra-ui/react";
import { ModalHoverOpen, ModalOpen, ModalWindow, useModal } from "./Modal";
import CartModal from "./CartModal";
import AuthModal from "./AuthModal";
import Link from "next/link";
import useUserCart, { CartEntry } from "../_hooks/useUserCart";
import { useUser } from "../_contexts/CreateConvexUser";
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
  const { user } = useUser();

  // Ensure a string is passed to the hook even before user is ready
  const userId = user?._id ?? "";
  const { cart } = useUserCart(userId);
  // Fetch routines to optionally show direct link to latest

  const totalCartItems = cart.reduce<number>(
    (acc: number, item: CartEntry) => acc + (item.quantity ?? 0),
    0
  );

  const { open } = useModal();

  return (
    <Box className="fixed w-full z-[99]">
      <Box className="py-[1.5rem] bg-white flex px-[2rem] gap-[3.2rem] items-center justify-center border-b">
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

          <Box className="flex justify-end gap-[2.5rem] items-center text-[2.3rem]">
            <ModalOpen name="user">
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
                  d="M13.98 5C13.98 6.65685 12.6369 8 10.98 8C9.32313 8 7.97998 6.65685 7.97998 5C7.97998 3.34315 9.32313 2 10.98 2C12.6369 2 13.98 3.34315 13.98 5ZM14.98 5C14.98 7.20914 13.1891 9 10.98 9C8.77084 9 6.97998 7.20914 6.97998 5C6.97998 2.79086 8.77084 1 10.98 1C13.1891 1 14.98 2.79086 14.98 5ZM4.03527 17C4.2358 15.2327 4.9683 13.8412 6.01179 12.8501C7.25274 11.6715 8.99676 11 10.98 11C12.9632 11 14.7072 11.6715 15.9482 12.8501C16.9917 13.8412 17.7242 15.2327 17.9247 17H4.03527ZM10.98 10C15.0953 10 18.4849 12.6027 18.9304 17C18.9632 17.3237 18.98 17.6572 18.98 18H2.97998C2.97998 17.6572 2.99682 17.3237 3.02962 17C3.4751 12.6027 6.86466 10 10.98 10Z"
                  fill="black"
                />
              </svg>
            </ModalOpen>

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
                d="M10.98 19C10.98 19 17.1073 13.0047 17.98 12C19.2435 10.5454 19.98 8.82402 19.98 7.31616C19.98 5.92056 19.4876 4.60896 18.5911 3.62418C17.6391 2.57857 16.3128 2 14.8696 2C13.6335 2 12.559 2.42022 11.6722 3.20533C11.4269 3.42247 11.196 3.66753 10.98 3.93932C10.764 3.66753 10.5331 3.42247 10.2878 3.20533C9.40095 2.42022 8.32643 2 7.09042 2C5.64725 2 4.32094 2.57858 3.36892 3.62419C2.47238 4.60896 1.97998 5.92056 1.97998 7.31616C1.97998 8.82404 2.71647 10.5454 3.97998 12C4.85268 13.0047 10.98 19 10.98 19ZM4.10838 4.29739C4.86637 3.46491 5.92195 3 7.09042 3C8.33809 3 9.3735 3.52518 10.1971 4.5615L10.98 5.54657L11.7629 4.56151C12.5865 3.52518 13.6219 3 14.8696 3C16.0381 3 17.0937 3.46491 17.8516 4.29739M4.10838 4.29739C3.38864 5.08798 2.97998 6.15567 2.97998 7.31616C2.97998 8.52146 3.58373 10.0189 4.73493 11.3442C5.13941 11.8099 6.85101 13.523 8.51077 15.1661C9.33004 15.9771 10.1223 16.757 10.7098 17.3342C10.8056 17.4283 10.8959 17.517 10.98 17.5996C11.0641 17.517 11.1544 17.4283 11.2502 17.3342C11.8377 16.757 12.6299 15.9771 13.4492 15.1661C15.109 13.523 16.8206 11.8099 17.225 11.3442C18.3762 10.0189 18.98 8.52143 18.98 7.31616C18.98 6.15566 18.5713 5.08798 17.8516 4.29739"
                fill="black"
              />
            </svg>

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

            <ModalOpen name="cart">
              <Box className="relative cursor-pointer">
                {cart.length > 0 && (
                  <span
                    className={`absolute -top-2 -right-4 transition-all duration-500  rounded-full w-[2rem] h-[2rem] flex items-center justify-center text-[1rem] group-hover:bg-[var(--color-primary)] bg-[var(--color-primary)] text-white`}
                  >
                    {totalCartItems}
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
              </Box>
            </ModalOpen>
          </Box>
        </Box>
      </Box>

      <Box className="hidden md:block">
        <Box className=" bg-black h-[4.4rem] flex items-center justify-center">
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
        </Box>

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
        listenCapturing={false}
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
