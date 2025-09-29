/* eslint-disable @next/next/no-img-element */
import SectionBestSeller from "./_components/SectionBestSeller";
import { fetchQuery } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import { Box } from "@chakra-ui/react";
import SectionTrending from "./_components/SectionTrending";

const section = [
  { bg: "#6c00b5" },
  { bg: "#000" },
  { bg: "#000" },
  { bg: "#0c8264" },
];

export default async function HomePage() {
  // const bestsellers = await fetchQuery(api.products.getAllProducts, {
  //   filters: { isBestseller: true },
  // });

  // const trending = await fetchQuery(api.products.getAllProducts, {
  //   filters: { isBestseller: true },
  // });

  // if it fails return empty list
  const [bestsellers, trending] = await Promise.all([
    fetchQuery(api.products.getAllProducts, {
      filters: { isBestseller: true },
    }).catch(() => []),
    fetchQuery(api.products.getAllProducts, {
      filters: { isTrending: true },
    }).catch(() => []),
  ]);

  return (
    <>
      <Box className="flex h-[49rem] mb-[96px] gap-[8px] pl-[16px] pt-[8px] overflow-auto">
        {section.map((s, index) => (
          <Box
            key={index}
            style={{ backgroundColor: s.bg }}
            className={`min-w-[54.5rem] h-full rounded-[5px]`}
          />
        ))}
      </Box>

      <Box className="flex flex-col gap-[48px]">
        <SectionBestSeller initialProducts={bestsellers} />

        <SectionTrending initialProducts={trending} />
      </Box>
    </>
  );
}
// export default async function HomePage() {
//   const products = await fetchQuery(api.products.getAllProducts, {
//     filters: { isBestseller: true },
//   });

//   return (
//     <Modal>
//       <Hero />
//       <SectionBestSeller initialProducts={products} />
//       <SectionCategories />
//       <SectionSets />
//       <Box className="px-[5.6rem] grid grid-cols-[370px_1fr] gap-[70px]">
//         <Box className="pt-[9.6rem]">
//           <h3 className="mb-[20px] w-[25rem] leading-[33px] font-bold text-[2.8rem] text-[#333]">
//             A new beginning for everyone.
//           </h3>
//           <p className="mb-[40px] text-[#686868]">
//             <span className="text-[1.6rem] font-bold text-[#333]">
//               Having Skin concerns?
//             </span>{" "}
//             We have trained our AI to recommend the perfect skin set for you to
//             reach your skin goal
//           </p>
//         </Box>

//         <Box className="w-full h-[60rem]">
//           <Image
//             alt="video"
//             width={958}
//             height={607}
//             className="h-full w-full object-cover"
//             src={"/images/video.png"}
//           />
//         </Box>
//       </Box>

//       <SectionSets />

//       <NewProductImageCarousel />

//       <SectionSets />

//       <Footer />
//     </Modal>
//   );
// }
