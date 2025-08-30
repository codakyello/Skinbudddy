import { ChangeEvent } from "react";

export default function Select({
  label,
  options,
  value,
  handleChange,
  // className,
  bgwhite = true
}: {
  label: string;
  options: { name: string; value: string | number  }[];
  value: string | number | undefined;
  className?: string;
  bgwhite?: boolean;
  handleChange: (event: ChangeEvent<HTMLSelectElement>) => void
}) {
  return (
    <>
      <span className={`${bgwhite ? "bg-white" : 'bg-[#fbf9f7]'} text-[1.1rem] z-[1] text-[#333] px-[.5rem] absolute top-0 left-[2rem] translate-y-[-50%]`}>
        {label}
      </span>
      <select
        value={value}
        onChange={handleChange}
        className={`${bgwhite ? "bg-white" : 'bg-[#fbf9f7]'} text-[1.4rem] cursor-pointer w-full relative pr-[1.8rem] pl-[1.25rem] text-[var(--color-primary)] h-[4.5rem] px-[1.2rem] border border-[#0a0a0a] font-medium`}
      >
        {options?.map((option) => (
          <option key={option.value} value={option.value}>{option.name}</option>
        ))}
      </select>
    </>
  );
}
