import { Box } from "@chakra-ui/react";

export default function Tag({ type }: { type: string | undefined }) {
  if (type)
    return (
      <Box
        className={`absolute bg-white text-black bottom-[10px] left-[10px] text-[1.2rem] px-[8px] py-[5px] font-medium font-inter`}
      >
        {type === "isNew" && "New"}
        {type === "isBestseller" && "Bestseller"}
        {type === "isDiscount" && "Sale!"}
      </Box>
    );
}
