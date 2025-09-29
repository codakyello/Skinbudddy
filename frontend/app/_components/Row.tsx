"use client";
import { Box } from "@chakra-ui/react";
import { ReactNode } from "react";
import { useTable } from "./Table";
import { generateGridTemplateColumns } from "../_utils/utils";

export default function Row({ children }: { children: ReactNode }) {
  const { columns } = useTable();
  return (
    <Box
      style={{
        gridTemplateColumns: generateGridTemplateColumns(columns),
      }}
      className="grid border-b border-gray-200 py-[1.2rem]  gap-[2.4rem]"
    >
      {children}
    </Box>
  );
}
