"use client";
import { Box } from "@chakra-ui/react";
import { useState, useEffect, useRef } from "react";
// import { FaArrowLeft, FaArrowRight } from "react-icons/fa";
import Image from "next/image";

export default function Carousel({
  className,
  images,
}: {
  className?: string;
  images: string[];
}) {
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

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

  return (
    <Box
      className={`relative h-[65rem] animate-fade-in object-cover bg-center ${
        className
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
      {/* <Box
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
      </Box> */}

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
