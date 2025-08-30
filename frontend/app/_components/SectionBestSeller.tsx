"use client";
import ProductCard from "./ProductCard";
import { Product } from "../_utils/types";
// import Section from "./Section";
import { Box } from "@chakra-ui/react";
import useProducts from "../_hooks/useProducts";
import Link from "next/link";
// import useUserCart from "../_hooks/useUserCart";
// import { useUser } from "../_contexts/CreateConvexUser";
import { useEffect, useState, } from "react";
import { FaChevronLeft, FaChevronRight } from "react-icons/fa";
import useDeviceDetection from "../_hooks/useDeviceDetection";
// import { getAllProducts } from "../_lib/actions";

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

export default function SectionBestSeller({
  initialProducts,
}: {
  initialProducts: Product[];
}) {
  // #FBF9F7

  // const { cart } = useUserCart(user.id as string);

  const { products, error, isPending } = useProducts({
    filters: { isBestseller: true },
    sort: "",
  });

  console.log(products, "products now availabele");

  console.log(error, isPending);

  const bestSellers = products || initialProducts;

  // reorder the product size array smaller comes first in the list

  const [offset, setOffset] = useState(0);

  const [paused, setPaused] = useState(false);

  const [cardWidth, setCardWidth] = useState(300);

  const { isMobile, isTablet } = useDeviceDetection();

  const [displayLimit, setDisplayLimit] = useState(4);

  useEffect(() => {
    if (isMobile) setDisplayLimit(2);
    else if (isTablet) setDisplayLimit(3);
    else setDisplayLimit(4);
  }, [isMobile, isTablet]);

  // const displayLimit = isMobile ? 2 : isTablet ? 3 : 4;


  useEffect(() => {
    function updateCardWidth() {
      const card = document.querySelector(".product-card");
      if (card) {
        const width = card.clientWidth + 40;
        setCardWidth(width);
      }
    }
    updateCardWidth();
    window.addEventListener("resize", updateCardWidth);
    return () => window.removeEventListener("resize", updateCardWidth);
  }, [displayLimit]);

  // function handleNext() {
  //   setOffset((prev) => (prev + 1) % (bestSellers.length - 3));
  // }

  function handlePrev() {
    console.log("prev");

    if (offset >= 0) return;
    setOffset((prev) => prev + cardWidth);
  }

  console.log(bestSellers.length);

  function handleNext() {
    console.log("next");
    // If the last item is in view (i.e., offset has reached the maximum negative scroll),
    // reset offset to 0 to start from the beginning. Otherwise, move to the next item.
    const maxOffset = -cardWidth * (bestSellers.length - displayLimit);
    if (offset <= maxOffset) {
      setOffset(0);
    } else {
      setOffset((prev) => prev - cardWidth);
    }
  }


  useEffect(() => {
    if (paused) return;

    const interval = setInterval(() => {
      const maxOffset = -cardWidth * (bestSellers.length - displayLimit);
      setOffset((prev) => {
        if (prev <= maxOffset) {
          return 0;
        } else {
          return prev - cardWidth;
        }
      });
    }, 5000);

    return () => clearInterval(interval);
  }, [bestSellers.length, displayLimit, paused, offset, cardWidth]);

  if (!bestSellers) return null;

  console.log(isMobile, "mobile", isTablet, 'tablet')

  return (
    // <Section title="Best sellers" className=" bg-[#FBF9F7] py-[120px]">
    <section className="py-[120px] relative px-[2rem]">
      <Box className={`overflow-hidden max-w-[1200px] mx-auto relative`}>
        <h1 className="text-[12.8rem] uppercase pt-[6.4rem] font-hostgrotesk font-medium text-[#000] font- leading-none">
          Best sellers
        </h1>

        <button
          onClick={handlePrev}
          className="absolute z-[1] left-[50px] top-[50%] -translate-y-1/2 bg-white rounded-full p-4 border border-gray-200 text-gray-700 hover:text-black hover:bg-gray-50 transition-all duration-200 hover:scale-105 disabled:opacity-50 -translate-x-1/2"
        >
          <FaChevronLeft className="w-5 h-5" />
        </button>
        <button
          onClick={handleNext}
          className="absolute z-[1] right-[50px] top-[50%] -translate-y-1/2 bg-white rounded-full p-4 border border-gray-200 text-gray-700 hover:text-black hover:bg-gray-50 transition-all duration-200 hover:scale-105 disabled:opacity-50 translate-x-1/2"
        >
          <FaChevronRight className="w-5 h-5" />
        </button>

        <Box
        key={displayLimit}
          className="flex gap-x-[4rem] mt-[7.2rem] no-scrollbar transition-transform duration-300 ease-out"
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
          style={{ transform: `translateX(${offset}px)` }}
        >
          {bestSellers.map((product: Product, i: number) => (
            <Box
                key={`${i}-${displayLimit}`} // 👈 force re-render when displayLimit changes
              className="product-card"
              style={{ flex: `0 0 calc(${100 / displayLimit}% - 4rem)` }}
            >
              <ProductCard
                key={i}
                product={{ ...product, images: [images[i]] }}
              />
            </Box>
          ))}
        </Box>
        {bestSellers.length && (
          <Box className="flex justify-end mt-[25px]">
            <Link
              className="flex items-center uppercase font-hostgrotesk group"
              href="/shop"
            >
              <svg
                width="13"
                height="12"
                viewBox="0 0 13 12"
                xmlns="http://www.w3.org/2000/svg"
                className="fill-current mr-3 transition-transform duration-300 group-hover:translate-x-2 group-hover:scale-110 group-hover:opacity-80"
              >
                <path d="M0 4.8H8.5L5.5 1.7L7.2 0L13 6L7.2 12L5.5 10.3L8.5 7.2H0V4.8Z"></path>
              </svg>
              <span className="text-[14px] font-medium">View all</span>
            </Link>
          </Box>
        )}
      </Box>
    </section>
  );
}
