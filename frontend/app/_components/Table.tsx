"use client";
import { Box } from "@chakra-ui/react";
import { createContext, ReactElement, ReactNode, useContext } from "react";
// import { Booking, Cabin } from "../utils/types";
import { generateGridTemplateColumns } from "../_utils/utils";

type TableContextType = { columns: string[] } | undefined;

const TableContext = createContext<TableContextType>(undefined);

export default function Table({
  columns,
  children,
}: {
  columns: string[];
  children: ReactNode;
}) {
  return (
    <TableContext.Provider value={{ columns }}>
      <Box className=" overflow-hidden">
        <Box className="overflow-x-scroll no-scrollbar rounded-[var(--border-radius-md)] bg-[var(--color-grey-0)] text-[1.4rem]">
          {children}
        </Box>
      </Box>
    </TableContext.Provider>
  );
}

export function useTable() {
  const context = useContext(TableContext);
  if (!context)
    throw new Error("Cannot use table context outside its provider");

  return context;
}

export function Header({ headers }: { headers: string[] | ReactNode[] }) {
  const { columns } = useTable();

  return (
    <header
      style={{
        display: "grid",
        gridTemplateColumns: generateGridTemplateColumns(columns),
      }}
      className="min-w-[100%] w-fit gap-[2.4rem] py-[1.6rem] border-b-[1px] border-gray-200"
    >
      {headers.map((header, index) => (
        <div key={index} className="uppercase font-semibold text-[1.4rem]">
          {header}
        </div>
      ))}
    </header>
  );
}

export function Body<T>({
  data,
  render,
  children,
}: {
  data?: T[] | null;
  render?: (item: T) => ReactNode;
  children?: ReactNode;
}) {
  return (
    <Box className="no-scrollbar min-w-[100%] w-fit">
      {data?.map(render || (() => null)) || children}
    </Box>
  );
}

export function Footer({ children }: { children: ReactElement | string }) {
  return <footer>{children}</footer>;
}
