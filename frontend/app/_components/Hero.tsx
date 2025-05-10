"use client";
import { Box, Icon } from "@chakra-ui/react";
import useSticky from "../_hooks/useSticky";
import { useState, useEffect, useRef } from "react";
import { FaArrowLeft, FaArrowRight } from "react-icons/fa";
import useDeviceDetection from "../_hooks/useDeviceDetection";
import Image from "next/image";
export default function Hero() {
  const { isSticky } = useSticky(40);

  const { isMobile, isTablet, isDesktop } = useDeviceDetection();

  console.log(isMobile, isTablet, isDesktop);

  //   const [interval, setInterval] = useState<NodeJS.Timeout | null>(null);

  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const images = [
    "/images/Acwell-Banner.png",
    "/images/COSRX-Banner.png",
    "/images/Facefacts-Banner.png",
    "/images/Lipkiss-Banner.png",
    "/images/Medicube-Banner.png",
  ];

  const [index, setIndex] = useState(0);

  useEffect(() => {
    intervalRef.current = setInterval(() => {
      setIndex((prev) => (prev + 1) % images.length);
    }, 8000);
    return () => {
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
      }
    };
  }, [index, images.length]);

  const handleNext = () => {
    setIndex((prev) => (prev + 1) % images.length);

    // when a button is clicked, clear the interval
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
    }
  };

  const handlePrev = () => {
    setIndex((prev) => (prev - 1 + images.length) % images.length);

    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
    }
  };

  return (
    <Box
      className={`relative h-[55rem] animate-fade-in bg-cover bg-center ${
        isSticky ? "mt-[80px]" : ""
      }`}
      //   style={{
      //     backgroundImage: `linear-gradient(to bottom, rgba(0, 0, 0, 0), rgba(0, 0, 0, 0.8)), url(${images[index]})`,
      //   }}
    >
      <Image
        fill
        src={images[index]}
        alt="hero"
        className="object-cover w-full h-full"
      />
      <Box
        onClick={handlePrev}
        className="absolute top-[50%] left-[10px] translate-y-[-50%] text-[#fff] flex items-center justify-center h-[4.4rem] w-[4.4rem] rounded-full bg-[rgba(0,0,0,0.4)]"
      >
        <Icon as={FaArrowLeft} />
      </Box>

      <Box
        onClick={handleNext}
        className="absolute top-[50%] right-[10px] translate-y-[-50%] text-[#fff] flex items-center justify-center h-[4.4rem] w-[4.4rem] rounded-full bg-[rgba(0,0,0,0.4)]"
      >
        <Icon as={FaArrowRight} />
      </Box>

      {/* <Box className="bottom-[15rem] absolute w-[70rem] ml-[5rem] flex flex-col gap-[2rem]">
              <h1 className="text-[8rem] text-[#fff] leading-[8rem] font-['Playfair_Display']">
                <span>
                  Explore Our <br />
                </span>
                Curated Collections
              </h1>
              <p className="w-[40rem] text-[#ffffffa1]">
                From skincare essentials to beauty must-haves, discover
                everything you need to elevate your routine.
              </p>

              <button className="uppercase w-[11rem] h-[4rem] flex items-center justify-center mt-6  border text-[#000] text-[1.5rem] bg-[#fff] border-white rounded-full transition-all duration-300">
                Shop Now
              </button>
            </Box> */}
    </Box>
  );
}
