import { Box } from "@chakra-ui/react";
import Image from "next/image";
import Section from "./Section";

export default function SectionCategories() {
  return (
    <Section
      title="categories"
      description="Discover a variety of categories tailored to your unique skincare needs."
    >
      <CategoryCard />
      <CategoryCard />
      <CategoryCard />
      <CategoryCard />
      <CategoryCard />
    </Section>
  );
}

function CategoryCard() {
  return (
    <Box className="relative">
      <Box className="w-[42.5rem] bg-[#F4F4F4]">
        <Box className="w-full h-[35.2rem] object-cover">
          <Image
            width={420}
            height={350}
            className="w-full h-full object-cover"
            alt="category"
            src={"/images/bestseller--1.png"}
          />
        </Box>

        <Box className="py-[2.8rem] px-[2.4rem] flex flex-col gap-[2rem]">
          <h3 className="text-[#000] font-bold text-[2.4rem] leading-none">
            Cleanser
          </h3>

          <p className="text-[#000] text-[1.6rem] font-dmsans font-light leading-[2.8rem]">
            Application: After you shower, rub some on your face till it gets
            soapy, massage gently and rub off
          </p>
        </Box>
      </Box>
    </Box>
  );
}
