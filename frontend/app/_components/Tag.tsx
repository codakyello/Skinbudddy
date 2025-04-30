import { Box } from "@chakra-ui/react";

export default function Tag({ tag }: { tag: string }) {
  return (
    <Box className="absolute top-[1rem] uppercase right-[1rem] text-[.9rem] px-[.8rem] py-[.2rem] rounded-full border border-[var(--color-primary)]">
      {tag}
    </Box>
  );
}
