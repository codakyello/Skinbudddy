import { Box } from "@chakra-ui/react";

export default function NavModal({
  onClose,
}: {
  onClose?: () => void;

  position?: "center" | "top" | "bottom" | "left" | "right";
}) {
  return (
    <Box className="absolute top-[133px] w-screen h-[400px] bg-white">sdsd</Box>
  );
}
