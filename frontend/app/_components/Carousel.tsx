"use client";
import { Box } from "@chakra-ui/react";
import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import Link from "next/link";

//  const images = [
//     "/images/hero/hero--1.webp",
//     "/images/hero/hero--2.webp",
//     "/images/hero/hero--3.webp",
//   ];

  const content = [
    {
      title: "Essential hydration",
      description: "Our routines with the 9-ingredient moisturizer for soft skin all summer",
      image: "/images/hero/hero--1.webp",
      link: "/products/essential-hydration",
    },
    {
      title: "Protect & soothe",
      description: "The essential routine to shield your skin from UV and soothe it",
      image: "/images/hero/hero--2.webp",
      link: "/products/nourish-your-skin",
    },
    {
      title: "Diagnostic",
      description: "Get your personalized routine in under 4 minutes",
      image: "/images/hero/hero--3.webp",
      link: "/products/transform-your-routine",
    },
    {
      image: "/images/hero/hero--4.png",
      link: "/products/new-arrivals",
    },
    {
      image: "/images/hero/hero--5.webp",
      link: "/products/best-sellers",
    },
    {
      image: "/images/hero/hero--6.webp",
      link: "/products/special-offers",
    },
    
    {
      image: "/images/hero/hero--7.webp",
      link: "/products/skin-care-tips",
    },
  ];

export default function Carousel({
  className,
}: {
  className?: string;
}) {
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const [index, setIndex] = useState(0);


  useEffect(() => {
    intervalRef.current = setInterval(() => {
      goNext();
    }, 8000);
    return () => {
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
      }
    };
  }, [index]);

  const goNext = () => {
    setIndex((prev) => (prev + 1) % content.length);
  };

  // const goBack = () => {
  //   setIndex((prev) => (prev - 1 + images.length) % images.length);
  // };

  const goTo = (i: number) => {
    if (i >= 0 && i < content.length) {
      setIndex(i);
    }
  };


  return (
    <Box className={`cursor-pointer relative w-screen overflow-hidden h-[55vw] ${className}`}>
      <Box
        className="flex h-full transition-transform duration-700 ease-in-out"
        style={{ transform: `translateX(-${index * 100}vw)` }}
      >
        {content.map((item, i) => (
          <Box key={i} className="relative w-screen h-full flex-shrink-0">
            <Link href={"#"}>
            <Image
              src={item.image}
              alt={`Slide ${i}`}
              fill
              className="object-cover h-full w-full"
            />
            </Link>
            
            <Box className="absolute top-[50%] translate-y-[-50%] left-[12%] z-10 font-hostgrotesk">
              <h2 className="text-[6.2rem] leading-[9rem] uppercase font-bold">{item.title}</h2>
              <p className="text-[2rem]">{item.description}</p>
            </Box>
          </Box>
        ))}
      </Box>

      <Box>
        <Box className="absolute bottom-[5rem] right-[5rem] flex justify-center items-center gap-[.5rem] p-4">
          {content.map((_, i) => (
            <p
            className={`${index === i ? "text-[#000]" : "text-[#CECDC9]"} cursor-pointer text-[1.6rem] font-medium flex items-center justify-center`}
              key={i}
              onClick={() => goTo(i)}
            >
              {i + 1 > 10 ? i + 1 : `0${i + 1}`}
            </p>
          ))}
        </Box>
      </Box>
    </Box>
  );
}
