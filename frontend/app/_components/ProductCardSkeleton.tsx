import { Box } from "@chakra-ui/react";

const ProductCardSkeleton = () => {
  return (
    <Box>
      {/* Image skeleton */}
      <Box className="group relative cursor-pointer w-full aspect-[4/5] bg-gray-200 animate-pulse">
        <div className="object-cover w-full h-full bg-[#f4f4f4]"></div>

        {/* Tag skeleton */}
        <div className="absolute bottom-[10px] left-[10px] bg-gray-300 rounded-md w-16 h-6 animate-pulse"></div>

        {/* Heart button skeleton */}
        <div className="absolute top-4 right-4">
          <div className="w-[20px] h-[20px] bg-gray-300 rounded-full animate-pulse"></div>
        </div>
      </Box>

      {/* Title skeleton */}
      <div className="mt-[1.6rem] mb-[.5rem]">
        <div className="h-[1.3rem] bg-gray-300 rounded animate-pulse w-[50%]"></div>
      </div>

      {/* Price skeleton */}
      <Box className="flex gap-[15px] items-center text-[1.4rem]">
        <div className="h-[1.4rem] bg-gray-300 rounded animate-pulse w-20"></div>
        <div className="h-[1.4rem] bg-gray-300 rounded animate-pulse w-16"></div>
      </Box>
    </Box>
  );
};

export default ProductCardSkeleton;
