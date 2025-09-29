"use client";

import { Box } from "@chakra-ui/react";
import { ChangeEvent, useId } from "react";
import { MdKeyboardArrowDown } from "react-icons/md";

export default function Select({
  options,
  value,
  handleChange,
  // className,
  bgwhite = true,
  label,
  id,
}: {
  options: { name: string; value: string | number }[];
  value: string | number | undefined;
  className?: string;
  bgwhite?: boolean;
  id?: string;
  handleChange: (event: ChangeEvent<HTMLSelectElement>) => void;
  label: string;
}) {
  const selectId = id ?? useId();

  return (
    <Box className="relative">
      <span
        className={`pointer-events-none ${bgwhite ? "bg-white" : "bg-[#fbf9f7]"} text-[1.1rem] z-[1] text-[#333] px-[.5rem] absolute top-0 left-[2rem] translate-y-[-50%]`}
      >
        {label}
      </span>

      <Box className="relative">
        <select
          id={selectId}
          value={value}
          onChange={handleChange}
          className={`${bgwhite ? "bg-white" : "bg-[#fbf9f7]"} text-[1.4rem] cursor-pointer w-full relative pr-[1.8rem] pl-[1.25rem] text-[var(--color-primary)] h-[4rem] px-[1.2rem] border border-[#0a0a0a] font-medium`}
        >
          {options?.map((option) => (
            <option key={option.value} value={option.value}>
              {option.name}
            </option>
          ))}
        </select>

        <span
          aria-hidden
          className="pointer-events-none absolute z-[0] top-0 bottom-0 right-[10px] w-[2.4rem] flex items-center justify-center"
        >
          <MdKeyboardArrowDown className="w-[2rem] h-[2rem]" />
        </span>
      </Box>
    </Box>
  );
}

{
  /* <Input />; */
}
