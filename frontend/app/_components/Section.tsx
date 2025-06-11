// components/Section.tsx or Section.jsx
import { Box } from "@chakra-ui/react";
import { ReactNode } from "react";

interface SectionProps {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}

export default function Section({
  title,
  description,
  children,
  className,
}: SectionProps) {
  return (
    <Box className={`pl-[5.6rem] ${className ?? ""}`}>
      <h1 className="text-[2.8rem] text-[#000] leading-none">
        {title[0].toUpperCase() + title.slice(1)}
      </h1>

      {description && (
        <p className="mb-[1.6rem] text-[1.2rem] text-[#999]">{description}</p>
      )}

      <Box className="flex gap-x-[1.6rem] no-scrollbar overflow-x-auto gap-y-[4rem]">
        {children}
      </Box>
    </Box>
  );
}
