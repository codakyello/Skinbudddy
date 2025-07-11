import { Box } from "@chakra-ui/react";
import {
  Accordion,
  AccordionBody,
  AccordionIcon,
  AccordionOpen,
} from "./Accordion";
import { useFilters } from "../_hooks/useFilters";
import { useLoadingTransition } from "../_contexts/FullPageLoader";
import { RadioButton } from "./RadioButton";

export function Sort({
  sortItems,
}: {
  sortItems: { title: string; value: string }[];
}) {
  return (
    <Accordion>
      <Box className="py-[20px] border-b-[1px] border-[#e4e4e4]">
        <AccordionOpen>
          <Box className="flex justify-between items-center">
            Sort
            <AccordionIcon />
          </Box>
        </AccordionOpen>
        <AccordionBody>
          <Box className="mt-[2.8rem] flex flex-col gap-[1.6rem]">
            {sortItems.map((item, i) => (
              <SortItem key={i} title={item.title} value={item.value} />
            ))}
          </Box>
        </AccordionBody>
      </Box>
    </Accordion>
  );
}

export function SortItem({ title, value }: { title: string; value: string }) {
  const { handleAddSort, activeSort } = useFilters();
  const { startNavigation } = useLoadingTransition();
  return (
    <Box
      className="cursor-pointer text-[1.4rem] gap-[8px] flex items-center"
      onClick={() => {
        startNavigation(() => handleAddSort(value));
      }}
    >
      <RadioButton isChecked={activeSort === value} />
      <span>{title}</span>
    </Box>
  );
}
