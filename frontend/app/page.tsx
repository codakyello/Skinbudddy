/* eslint-disable @next/next/no-img-element */
import { Box } from "@chakra-ui/react";
import SectionBestSeller from "./_components/SectionBestSeller";
import Modal from "./_components/Modal";

export default async function HomePage() {
  // const cart = await getUserCarts("67ec1c0dd0a01f1d47a6e49e");

  // console.log(cart);

  // This page should contain banners of our products, advertising popular brands we are selling, promotions, etc.

  return (
    <Modal>
      <Box>
        <header>
          <Box
            className="relative h-[65rem] bg-cover bg-center"
            style={{
              backgroundImage:
                "linear-gradient(to bottom, rgba(0, 0, 0, 0), rgba(0, 0, 0, 0.8)), url(/images/hero.jpg)",
            }}
          >
            {/* Nav */}

            <Box className="bottom-[15rem] absolute w-[70rem] ml-[5rem] flex flex-col gap-[2rem]">
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
            </Box>
          </Box>
        </header>

        <SectionBestSeller />
      </Box>
    </Modal>
  );
}
