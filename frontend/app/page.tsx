/* eslint-disable @next/next/no-img-element */
import SectionBestSeller from "./_components/SectionBestSeller";
import { fetchQuery } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import { Box } from "@chakra-ui/react";
import Link from "next/link";
import SectionTrending from "./_components/SectionTrending";

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
    }).catch(() => ({ products: [] })),
    fetchQuery(api.products.getAllProducts, {
      filters: { isTrending: true },
    }).catch(() => ({ products: [] })),
  ]);

  return (
    <>
      <Box className="mx-auto mb-[96px] flex w-full max-w-[1200px] flex-col gap-[24px] px-[16px] pt-[24px] md:flex-row md:items-center">
        <Box className="flex-1 rounded-[24px] bg-[#f5f7ff] p-[32px] shadow-md md:p-[48px]">
          <p className="mb-[16px] inline-block rounded-full bg-[#e8edff] px-[16px] py-[6px] text-[1.3rem] font-medium text-[#3c4cc5] uppercase tracking-[0.2em]">
            Personalized Skincare
          </p>
          <h1 className="mb-[20px] max-w-[36rem] text-[3.8rem] font-semibold leading-[1.1] text-[#1f2537] md:text-[4.6rem]">
            Better Skin,
            <span className="text-[#5a6bff]"> Proven Care</span>
          </h1>
          <p className="mb-[28px] max-w-[40rem] text-[1.6rem] text-[#4a4f63]">
            Clinically guided routines tailored to Nigeria’s climate, pollution
            and busy lifestyles. Answer a few questions and SkinBuddy builds the
            exact plan your skin needs.
          </p>
          <div className="flex flex-col gap-[12px] sm:flex-row sm:items-center">
            <Link
              href="/recommender"
              className="inline-flex items-center justify-center rounded-full bg-[#1f2537] px-[28px] py-[12px] text-[1.5rem] font-semibold text-white transition hover:bg-[#111522]"
            >
              Start Skin Quiz
            </Link>
            <span className="text-[1.4rem] text-[#6b7288]">
              Takes less than 5 minutes • Free recommendations
            </span>
          </div>
        </Box>
        <Box className="relative mt-[32px] flex-1 md:mt-0">
          <Box className="absolute -left-[18px] top-[24px] hidden h-[120px] w-[120px] rounded-full bg-[#dfe4ff] md:block" />
          <Box className="absolute -right-[24px] bottom-[36px] hidden h-[160px] w-[160px] rounded-[32px] bg-[#f0f2ff] md:block" />
          <img
            src="/images/hero/hero--6.webp"
            alt="SkinBuddy skincare assortment"
            className="relative z-[2] w-full max-w-[480px] rounded-[32px] object-cover shadow-xl"
          />
        </Box>
      </Box>

      <Box className="flex flex-col gap-[48px]">
        <SectionBestSeller initialProducts={bestsellers.products} />

        <SectionTrending initialProducts={trending.products} />
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
