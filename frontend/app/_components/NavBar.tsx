"use client";
import { Box } from "@chakra-ui/react";
import { ModalOpen, ModalWindow } from "./Modal";
import CartModal from "./CartModal";
import { RoutineSuggestionsModal } from "./RoutineSuggestionsModal";
import AuthModal from "./AuthModal";
import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import useUserCart from "../_hooks/useUserCart";
import { useNavSticky } from "../_contexts/Sticky";
import { useUser } from "../_contexts/CreateConvexUser";
import { useState } from "react";

export default function NavBar() {
  const { isSticky } = useNavSticky();
  const [skipped, SetSkipped] = useState(false);

  const { user } = useUser();

  // Ensure a string is passed to the hook even before user is ready
  const userId = user?._id ?? "";
  const { cart } = useUserCart(userId);
  // Fetch routines to optionally show direct link to latest
  const routinesRes = useQuery(api.routine.getUserRoutines, { userId });
  const routines = (routinesRes as any)?.routines || [];
  const latestRoutineId = routines.length ? String(routines[0]?._id) : null;

  const totalCartItems =
    cart?.reduce((acc, item) => {
      return acc + item.quantity;
    }, 0) || 0;

  const handleSkip = function () {
    SetSkipped(true);
  };

  return (
    <>
      <nav
        className={`group h-[8rem] hover:bg-white w-[100%] top-0 left-0 z-[9] px-[5.6rem] grid grid-cols-3 gap-x-[1.5rem] items-center transition-all duration-500 text-[#000] ${
          isSticky
            ? " fixed top-0 left-0 w-full bg-white text-black"
            : "absolute"
        }`}
      >
        <ul className="flex text-[1.5rem] font-dmsans gap-[2.4rem] ">
          <li className=" hover:text-red-600 cursor-pointer">
            <Link
              // className={isActive("/") ? "underline font-bold" : ""}
              href={"/"}
            >
              Women
            </Link>
          </li>
          <li className=" hover:text-red-600 cursor-pointer">Men</li>
          <li className=" hover:text-red-600 cursor-pointer">
            <Link
              // className={isActive("/shop") ? "underline font-bold" : ""}
              href={"/shop"}
            >
              Kids
            </Link>
          </li>
          <li className=" hover:text-red-600 cursor-pointer">Summer Sale</li>
          <li className=" hover:text-red-600 cursor-pointer">
            <Link href={"/recommender"}>Recommender</Link>
          </li>
          <li className=" hover:text-red-600 cursor-pointer">
            <Link href={"/routine"}>Routines</Link>
          </li>
          {latestRoutineId && (
            <li className=" hover:text-red-600 cursor-pointer">
              <Link href={`/routine/${latestRoutineId}`}>My Routine</Link>
            </li>
          )}
        </ul>

        <Link
          href="/"
          className="justify-self-center text-[2rem] font-dmSans font-semibold"
        >
          <svg
            className="Icon_Icon__qPZ8O Icon_regular__MbCqv"
            data-testid="brand-logo-svg"
            width="115"
            height="19"
            viewBox="0 0 115 19"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              fillRule="evenodd"
              clipRule="evenodd"
              d="M82.8954 18.2007H84.708V0.61412H82.8954V18.2007ZM71.4005 12.7452L73.5803 10.2821L79.5685 18.2008H81.8628L74.9567 8.74004L81.8628 0.9365H79.4767L71.4005 10.144V0.9365H69.4046V18.2008H71.4005V12.7452ZM48.4799 18.2007H50.2925V6.0926H48.4799V18.2007ZM48.457 3.9749H50.3155V1.8572H48.457V3.9749ZM54.3074 18.2008H52.4951V6.0926H54.3074V8.11832C54.5369 7.45088 55.5924 5.81648 58.0931 5.81648C61.4658 5.81648 63.0489 8.30246 63.0489 11.3641V18.2008H61.2136V11.4102C61.2136 9.13118 59.9975 7.54286 57.7949 7.54286C55.6153 7.54286 54.3074 9.17726 54.3074 11.5021V18.2008ZM96.6614 10.9956H88.3789C88.6772 9.26924 90.1914 7.49696 92.5316 7.49696C94.9407 7.49696 96.2943 9.17726 96.6614 10.9956ZM86.4287 12.1467C86.4287 15.7377 89.0443 18.477 92.5775 18.477C96.2024 18.477 97.9922 15.9678 98.4511 14.3105H96.6384C96.1565 15.3234 94.9866 16.7736 92.5775 16.7736C90.1684 16.7736 88.4018 14.9319 88.264 12.607H98.6115C98.7034 8.64788 96.065 5.81648 92.5316 5.81648C89.0672 5.81648 86.4287 8.57876 86.4287 12.1467ZM100.379 18.2007H102.191V6.0926H100.379V18.2007ZM100.356 3.9749H102.214V1.8572H100.356V3.9749ZM104.394 18.2008H106.206V11.5021C106.206 9.17726 107.514 7.54286 109.693 7.54286C111.896 7.54286 113.112 9.13118 113.112 11.4102V18.2008H114.947V11.3641C114.947 8.30246 113.364 5.81648 109.992 5.81648C107.491 5.81648 106.435 7.45088 106.206 8.11832V6.0926H104.394V18.2008ZM2.06498 9.59162C2.06498 13.6198 4.95576 16.6354 8.74144 16.6354C12.2747 16.6354 14.0183 14.4486 14.5691 13.3668H16.5652C16.0604 15.024 13.6742 18.5 8.74144 18.5C3.76271 18.5 0 14.7249 0 9.56858C0 4.48142 3.80863 0.63716 8.74144 0.63716C13.6742 0.63716 16.0604 4.04402 16.611 5.81648H14.5462C13.9267 4.6886 12.2058 2.50178 8.74144 2.50178C4.95576 2.50178 2.06498 5.51732 2.06498 9.59162ZM23.8156 7.54286C26.3163 7.54286 28.1519 9.54554 28.1519 12.1467C28.1519 14.7479 26.3163 16.7506 23.8156 16.7506C21.2919 16.7506 19.4564 14.7479 19.4564 12.1467C19.4564 9.5225 21.2919 7.54286 23.8156 7.54286ZM17.598 12.1467C17.598 15.7608 20.3053 18.477 23.7467 18.477C26.4771 18.477 27.7389 16.7506 28.1289 15.9217V18.2008H29.9414V6.0926H28.1289V8.37158C27.7618 7.5659 26.4771 5.81648 23.7467 5.81648C20.3053 5.81648 17.598 8.53268 17.598 12.1467ZM32.1444 18.2007H33.9568V0.61412H32.1444V18.2007ZM44.9924 6.0926L41.1608 16.3362L37.3292 6.0926H35.3333L40.0137 18.201H42.3082L46.9885 6.0926H44.9924Z"
              fill="#1A1919"
            ></path>
          </svg>
        </Link>

        <Box className="flex justify-end gap-[2rem] items-center text-[2.3rem] ">
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
              d="M16.98 9C16.98 12.866 13.846 16 9.97998 16C6.11399 16 2.97998 12.866 2.97998 9C2.97998 5.13401 6.11399 2 9.97998 2C13.846 2 16.98 5.13401 16.98 9ZM15.2722 14.9995C13.8619 16.2445 12.0092 17 9.97998 17C5.5617 17 1.97998 13.4183 1.97998 9C1.97998 4.58172 5.5617 1 9.97998 1C14.3983 1 17.98 4.58172 17.98 9C17.98 11.0293 17.2244 12.8821 15.9793 14.2924L20.3332 18.6464L19.6261 19.3535L15.2722 14.9995Z"
              fill="black"
            />
          </svg>

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

          {/* <ModalHoverOpen openCondition={cart && cart?.length > 0} name="cart">
            <Link href={"/cart"} className="relative cursor-pointer">
              {cart && cart?.length > 0 && (
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
              {cart && cart?.length > 0 && (
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

      {/* <ModalWindow
        className="z-[9]"
        name="cart"
        position="right"
        openType="hover"
      >
        <CartModal />
      </ModalWindow> */}

      <ModalWindow
        listenCapturing={true}
        className="z-[9]"
        name="cart"
        position="right"
      >
        <CartModal skipped={skipped} />
      </ModalWindow>

      <ModalWindow
        listenCapturing={true}
        className="bg-black/25 z-[9]"
        name="routine-suggestions"
        position="center"
      >
        <RoutineSuggestionsModal handleSkip={handleSkip} />
      </ModalWindow>
    </>
  );
}
