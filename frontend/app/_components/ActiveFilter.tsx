import { Box } from "@chakra-ui/react";

export default function ActiveFilter({
  name,
  onRemove,
}: {
  name: string;
  onRemove: () => void;
}) {
  return (
    <Box className="bg-[#f4f4f4] font-inter text-[1.2rem] px-[1.2rem] py-[.6rem] rounded-full flex items-center gap-[8px]">
      <span>{name}</span>

      <button onClick={onRemove}>
        <svg
          className="cursor-pointer"
          width="7"
          height="8"
          viewBox="0 0 7 8"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M0.715113 7.42369C0.533345 7.42369 0.351578 7.35672 0.208077 7.21322C-0.0693588 6.93578 -0.0693588 6.47658 0.208077 6.19914L5.62285 0.784371C5.90029 0.506935 6.35949 0.506935 6.63692 0.784371C6.91436 1.06181 6.91436 1.52101 6.63692 1.79844L1.22215 7.21322C1.08822 7.35672 0.896881 7.42369 0.715113 7.42369Z"
            fill="black"
          />
          <path
            d="M6.12989 7.42369C5.94812 7.42369 5.76635 7.35672 5.62285 7.21322L0.208077 1.79844C-0.0693589 1.52101 -0.0693589 1.06181 0.208077 0.78437C0.485512 0.506935 0.944715 0.506935 1.22215 0.78437L6.63692 6.19914C6.91436 6.47658 6.91436 6.93578 6.63692 7.21322C6.49342 7.35672 6.31166 7.42369 6.12989 7.42369Z"
            fill="black"
          />
        </svg>
      </button>
    </Box>
  );
}
