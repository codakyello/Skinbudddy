"use client";
import ProductCard from "./ProductCard";
import { Product } from "../_utils/types";
// import Section from "./Section";
import { Box } from "@chakra-ui/react";
import useProducts from "../_hooks/useProducts";
import Link from "next/link";
import { useEffect, useState } from "react";
import { FaChevronLeft, FaChevronRight } from "react-icons/fa";
import useDeviceDetection from "../_hooks/useDeviceDetection";
import { ModalWindow } from "./Modal";
import { ProductPreviewModal } from "./ProductPreviewModal";

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

export default function Section({
  initialProducts,
  name,
  products,
}: {
  initialProducts: Product[];
  products: Product[] | undefined;
  name: string;
}) {
  // const { products } = useProducts({
  //   filters: { isBestseller: true },
  //   sort: "",
  // });

  const displayedProducts = products || initialProducts;

  const [offset, setOffset] = useState(0);

  const [paused, setPaused] = useState(false);

  const [cardWidth, setCardWidth] = useState(300);

  const { isMobile, isTablet } = useDeviceDetection();

  const [displayLimit, setDisplayLimit] = useState(4);

  const [productToPreview, setProductToPreview] = useState<
    Product | undefined
  >();

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

  function handleNext() {
    console.log("next");
    // If the last item is in view (i.e., offset has reached the maximum negative scroll),
    // reset offset to 0 to start from the beginning. Otherwise, move to the next item.
    const maxOffset = -cardWidth * (displayedProducts.length - displayLimit);
    if (offset <= maxOffset) {
      setOffset(0);
    } else {
      setOffset((prev) => prev - cardWidth);
    }
  }

  function handleProductToPreview(product: Product) {
    console.log("set product to it");
    setProductToPreview(product);
  }

  // useEffect(() => {
  //   if (paused) return;

  //   const interval = setInterval(() => {
  //     const maxOffset = -cardWidth * (bestSellers.length - displayLimit);
  //     setOffset((prev) => {
  //       if (prev <= maxOffset) {
  //         return 0;
  //       } else {
  //         return prev - cardWidth;
  //       }
  //     });
  //   }, 5000);

  //   return () => clearInterval(interval);
  // }, [bestSellers.length, displayLimit, paused, offset, cardWidth]);

  if (displayedProducts.length < 1) return null;

  return (
    // <Section title="Best sellers" className=" bg-[#FBF9F7] py-[120px]">
    <section className="relative px-[2rem]">
      <button
        onClick={handlePrev}
        className="absolute z-[1] left-[100px] top-[50%] -translate-y-1/2 bg-white rounded-full p-4 border border-gray-200 text-gray-700 hover:text-black hover:bg-gray-50 transition-all duration-200 hover:scale-105 disabled:opacity-50 -translate-x-1/2"
      >
        <FaChevronLeft className="w-5 h-5" />
      </button>
      <button
        onClick={handleNext}
        className="absolute z-[1] right-[150px] top-[50%] -translate-y-1/2 bg-white rounded-full p-4 border border-gray-200 text-gray-700 hover:text-black hover:bg-gray-50 transition-all duration-200 hover:scale-105 disabled:opacity-50 translate-x-1/2"
      >
        <FaChevronRight className="w-5 h-5" />
      </button>

      <Box className={`overflow-hidden max-w-[1200px] mx-auto relative`}>
        <h1 className="text-[1.8rem] pb-[1.6rem] font-semibold uppercase text-[#000] leading-none">
          {name}
        </h1>

        <Box
          key={displayLimit}
          className="flex gap-x-[4rem]  no-scrollbar transition-transform duration-300 ease-out"
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
          style={{ transform: `translateX(${offset}px)` }}
        >
          {displayedProducts.map((product: Product, i: number) => (
            <Box
              key={`${i}-${displayLimit}`} // 👈 force re-render when displayLimit changes
              className="product-card"
              style={{ flex: `0 0 calc(${100 / displayLimit}% - 4rem)` }}
            >
              <ProductCard
                sectionName={name}
                handleProductToPreview={handleProductToPreview}
                product={{ ...product, images: [images[i]] }}
              />
            </Box>
          ))}
        </Box>

        {displayedProducts.length && (
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

      <ModalWindow
        name={name}
        position="center"
        listenCapturing={false}
        bgClassName="bg-[var(--color-modal-bg)] z-[999999]"
      >
        {productToPreview ? (
          <ProductPreviewModal product={productToPreview} />
        ) : (
          <div></div>
        )}
      </ModalWindow>
    </section>
  );
}
