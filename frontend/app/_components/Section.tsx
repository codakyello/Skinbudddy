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
    <Box className={`${className || ""} max-w-[1200px] mx-auto px-[5rem]`}>
      <h1 className="text-[12.8rem] uppercase pt-[6.4rem] font-hostgrotesk font-medium text-[#000] font- leading-none">
        {title}
      </h1>

      {description && (
        <p className="mb-[1.6rem] text-[1.2rem] text-[#999]">{description}</p>
      )}
{/* 
      <Box className="flex gap-x-[1.6rem] no-scrollbar overflow-x-auto gap-y-[4rem]">
        {children}
      </Box> */}
      {children}
    </Box>
  );
}
