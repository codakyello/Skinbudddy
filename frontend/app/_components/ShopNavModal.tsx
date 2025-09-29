import { Box } from "@chakra-ui/react";

export default function ShopNavModal({
  onMouseEnter,
  onMouseLeave,
}: {
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  position?: "center" | "top" | "bottom" | "left" | "right";
}) {
  return (
    <Box
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className="absolute top-[133px] w-full h-[400px] bg-white"
    >
      sdsd
    </Box>
  );
}
