import { Box } from "@chakra-ui/react";
import CheckBox from "./CheckBox";
import { FilterObj } from "../_utils/types";
import { useFilters } from "../_hooks/useFilters";
import { useState } from "react";
import { useLoadingTransition } from "../_contexts/FullPageLoader";
import {
  Accordion,
  AccordionBody,
  AccordionIcon,
  AccordionOpen,
} from "./Accordion";
import { Filter as FilterType } from "../_utils/types";

export default function Filter({ filter }: { filter: FilterObj }) {
  const { handleAddFilter, activeFilters, handleRemoveFilter } = useFilters();
  const [showAll, setShowAll] = useState(false);

  const handleShowAll = function () {
    setShowAll((prev) => !prev);
  };

  const { startNavigation } = useLoadingTransition();

  return (
    <Box className="border-b-[1px] border-[#e4e4e4] py-[20px]">
      <Accordion>
        <AccordionOpen>
          <Box className="flex justify-between">
            <h3 className="text-[1.4rem] font-medium">{filter.title}</h3>
            <AccordionIcon />
          </Box>
        </AccordionOpen>

        <AccordionBody>
          <Box className="flex mt-[28px] items-start flex-col gap-[1.6rem]">
            {(() => {
              const displayedFilters = showAll
                ? filter.filters
                : filter.filters.slice(0, 6);

              return displayedFilters.map((item: FilterType, i: number) => {
                const isActive = activeFilters.some((i) => {
                  return i.name === item.name && i.type === filter.type;
                });

                return (
                  <FilterItem
                    key={i}
                    type={filter.type}
                    filter={item}
                    handleFilter={() =>
                      startNavigation(() =>
                        isActive
                          ? handleRemoveFilter(filter.type, item.name)
                          : handleAddFilter(filter.type, item.name)
                      )
                    }
                    isActive={isActive}
                  />
                );
              });
            })()}

            {filter.filters.length > 6 && (
              <button
                onClick={() => handleShowAll()}
                className="underline font-medium text-[1.4rem]"
              >
                {showAll ? "Show less" : "Show more"}
              </button>
            )}
          </Box>
        </AccordionBody>
      </Accordion>
    </Box>
  );
}

export function FilterItem({
  handleFilter,
  filter,
  isActive,
}: {
  handleFilter: () => void;
  type: string;
  filter: FilterType;
  isActive: boolean;
}) {
  return (
    <Box
      onClick={handleFilter}
      className="flex cursor-pointer items-center gap-[8px]"
    >
      <CheckBox
        className="!h-[20px]"
        checked={isActive}
        name={filter.name}
        id={filter.name}
      />
      <Box className="flex items-end gap-[8.1px]">
        <span className="text-[1.4rem] ">{filter.name}</span>
        <span className=" text-[#666] text-[1rem]">({filter.count})</span>
      </Box>
    </Box>
  );
}
