import { Box } from "@chakra-ui/react";

export default function Tag({ type, className }: { type: string | undefined, className?: string }) {
  if (type)
    return (
      <Box
        className={`${className} absolute bg-white font-semibold font-raleway text-[#333] text-[1.2rem] px-[8px] py-[5px]`}
      >
        {type === "isNew" && "New"}
        {type === "isBestseller" && "Bestseller"}
        {type === "isDiscount" && "Sale!"}
      </Box>
    );
}
