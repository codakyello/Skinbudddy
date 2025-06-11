"use client";
import { Box } from "@chakra-ui/react";
import { AccordionBody, AccordionIcon, AccordionOpen } from "./Accordion";
import { useFilters } from "../_hooks/useFilters";
import { useState } from "react";
import CheckBox from "./CheckBox";
import { useLoadingTransition } from "../_contexts/FullPageLoader";
import { Brand } from "../_utils/types";

type Filter = {
  name: string;
  count: number;
};

type FilterObj = {
  title: string;
  type: string;
  filters: Filter[];
  showAll: boolean;
};

let filters = [
  {
    title: "Product Type",
    type: "category",
    filters: [
      { name: "Body lotion", count: 30 },
      { name: "Face cream", count: 10 },
      { name: "Cleansers", count: 5 },
      { name: "Serums", count: 5 },
      { name: "Face mask", count: 20 },
      { name: "Sunscreen SPF", count: 10 },
      { name: "Toner", count: 10 },
      { name: "Eye cream", count: 15 },
    ],
    showAll: false,
  },

  {
    title: "Size",
    type: "size",
    filters: [
      { name: "S", count: 49 },
      { name: "L", count: 45 },
    ],
    showAll: false,
  },
];

export default function Filter({ brands }: { brands: Brand[] | undefined }) {
  if (brands)
    filters = [
      ...filters,
      { title: "Brand", type: "brand", filters: brands, showAll: false },
    ];

  // using a state here because showAll variable will change
  //   const { filters, setFilters } = useState(filters);

  const [allFilters, setFilters] = useState(filters);

  const { handleAddFilter, activeFilters, handleRemoveFilter } = useFilters();

  const handleShowAll = function (type: string) {
    setFilters((filters) =>
      filters.map((filter) =>
        filter.type === type ? { ...filter, showAll: !filter.showAll } : filter
      )
    );
  };

  const { startNavigation } = useLoadingTransition();

  return (
    <Box>
      {allFilters.map((filter: FilterObj, i) => (
        <Box key={i} className="border-b-[1px] border-[#e4e4e4] py-[20px]">
          <Box className="flex justify-between">
            <h3 className="text-[1.4rem] font-medium">{filter.title}</h3>

            <AccordionOpen name={filter.type}>
              <AccordionIcon />
            </AccordionOpen>
          </Box>

          <AccordionBody name={filter.type}>
            <Box className="flex mt-[28px] items-start flex-col gap-[1.6rem]">
              {(() => {
                const displayedFilters = filter.showAll
                  ? filter.filters
                  : filter.filters.slice(0, 6);

                return displayedFilters.map((item: Filter, i: number) => {
                  const isActive = activeFilters.some((i) => {
                    return i.name === item.name && i.type === filter.type;
                  });

                  return (
                    <FilterItem
                      key={i}
                      type={filter.type}
                      filter={item}
                      handleFilter={() =>
                        isActive
                          ? startNavigation(() =>
                              handleRemoveFilter(filter.type, item.name)
                            )
                          : startNavigation(() =>
                              handleAddFilter(filter.type, item.name)
                            )
                      }
                      isActive={isActive}
                    />
                  );
                });
              })()}

              {filter.filters.length > 6 && (
                <button
                  onClick={() => handleShowAll(filter.type)}
                  className="underline font-medium text-[1.4rem]"
                >
                  {filter.showAll ? "Show less" : "Show more"}
                </button>
              )}
            </Box>
          </AccordionBody>
        </Box>
      ))}
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
  filter: { name: string; count: number };
  isActive: boolean;
}) {
  return (
    <Box
      onClick={handleFilter}
      className="flex cursor-pointer items-center gap-[8px] font-inter"
    >
      <CheckBox checked={isActive} name={filter.name} id={filter.name} />
      <Box className="flex items-end gap-[8.1px]">
        <span className="text-[1.4rem] ">{filter.name}</span>
        <span className=" text-[#666] text-[1rem]">({filter.count})</span>
      </Box>
    </Box>
  );
}
