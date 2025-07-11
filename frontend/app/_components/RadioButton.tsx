import { Box } from "@chakra-ui/react";

export function RadioButton({ isChecked }: { isChecked: boolean }) {
  return (
    <Box
      className={`w-[20px] flex items-center justify-center h-[20px] rounded-full border-[1px] border-[#000]`}
    >
      {isChecked ? (
        <Box className="w-[10px] h-[10px] bg-black rounded-full"></Box>
      ) : null}
    </Box>
  );
}
