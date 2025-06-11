/* eslint-disable @next/next/no-img-element */
import SectionBestSeller from "./_components/SectionBestSeller";
import Modal from "./_components/Modal";
import Hero from "./_components/Hero";
import SectionCategories from "./_components/SectionCategories";
import { Box } from "@chakra-ui/react";
import SectionSets from "./_components/SectionSets";
import Image from "next/image";
import NewProductImageCarousel from "./_components/NewProductImageCarousel";
import { Footer } from "./_components/Footer";

export default async function HomePage() {
  return (
    <Modal>
      <Hero />
      <Box className="flex flex-col gap-[16rem] mt-[14.6rem] mb-[25rem]">
        <SectionBestSeller />
        <SectionCategories />
        <SectionSets />
        <Box className="px-[5.6rem] grid grid-cols-[370px_1fr] gap-[70px]">
          <Box className="pt-[9.6rem]">
            <h3 className="mb-[20px] w-[25rem] leading-[33px] font-bold text-[2.8rem] text-[#333]">
              A new beginning for everyone.
            </h3>
            <p className="mb-[40px] text-[#686868]">
              <span className="text-[1.6rem] font-bold text-[#333]">
                Having Skin concerns?
              </span>{" "}
              We have trained our AI to recommend the perfect skin set for you
              to reach your skin goal
            </p>
          </Box>

          <Box className="w-full h-[60rem]">
            <Image
              alt="video"
              width={958}
              height={607}
              className="h-full w-full object-cover"
              src={"/images/video.png"}
            />
          </Box>
        </Box>

        <SectionSets />

        <NewProductImageCarousel />

        <SectionSets />
      </Box>

      <Footer />
    </Modal>
  );
}
