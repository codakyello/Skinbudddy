import { Box } from "@chakra-ui/react";

export default function Tag({ type, className }: { type: string | undefined, className?: string }) {
  if (type)
    return (
      <Box
        className={`${className} font-semibold font-raleway text-[1.2rem] px-[8px] py-[5px] ${
          type === "isDiscount" ? "bg-red-500 text-white" :
          type === "isBestseller" ? "bg-yellow-400 text-[#333]" :
          type === "isNew" ? "bg-green-400 text-white" : ""
        }`}
      >
        {type === "isNew" && "New"}
        {type === "isBestseller" && "Bestseller"}
        {type === "isDiscount" && "Sale"}
      </Box>
    );
}
