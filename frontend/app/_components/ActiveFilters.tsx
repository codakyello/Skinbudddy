"use client";
import { Box } from "@chakra-ui/react";
import ActiveFilter from "./ActiveFilter";
import { useNavSticky } from "../_contexts/Sticky";
import { useFilters } from "../_hooks/useFilters";
import { useLoadingTransition } from "../_contexts/FullPageLoader";

export default function ActiveFilters() {
  const { isSticky } = useNavSticky();
  const { activeFilters, handleRemoveAllFilters, handleRemoveFilter } =
    useFilters();
  const { startNavigation } = useLoadingTransition();

  return (
    <Box
      className={`${isSticky && "fixed z-10 left-0 right-0 top-[108px]"} grid border-y-[1px] border-[#e4e4e4] grid-cols-[31rem_1fr] gap-x-[1.5rem] px-[4.5rem] py-[1.2rem] min-h-[60px] items-center bg-white`}
    >
      <Box className="flex items-center gap-2">
        <svg
          width="14"
          height="14"
          viewBox="0 0 14 14"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M6.23023 12.7243C5.97223 12.7243 5.7196 12.6598 5.4831 12.5308C5.0101 12.2675 4.72523 11.7891 4.72523 11.2516V8.40283C4.72523 8.13408 4.54785 7.73095 4.38123 7.5267L2.37098 5.3982C2.03235 5.05958 1.77435 4.47907 1.77435 4.0437V2.80745C1.77435 1.94745 2.42473 1.27557 3.25248 1.27557H10.3475C11.1645 1.27557 11.8256 1.9367 11.8256 2.7537V3.9362C11.8256 4.50058 11.487 5.1402 11.1699 5.45733L8.84248 7.51595C8.61673 7.70408 8.43936 8.11795 8.43936 8.4512V10.7625C8.43936 11.2408 8.13836 11.7945 7.76211 12.0202L7.02036 12.4986C6.77848 12.6491 6.50435 12.7243 6.23023 12.7243ZM3.25248 2.08182C2.87623 2.08182 2.5806 2.39895 2.5806 2.80745V4.0437C2.5806 4.24257 2.74185 4.62958 2.9461 4.83383L4.99398 6.9892C5.2681 7.32783 5.53685 7.8922 5.53685 8.39745V11.2462C5.53685 11.5956 5.77873 11.7676 5.88086 11.8213C6.10661 11.945 6.38073 11.945 6.59035 11.816L7.33748 11.3376C7.48798 11.2462 7.63848 10.956 7.63848 10.7625V8.4512C7.63848 7.87608 7.91798 7.24183 8.32111 6.9032L10.6216 4.86608C10.8044 4.68332 11.0247 4.24795 11.0247 3.93082V2.7537C11.0247 2.38282 10.7237 2.08182 10.3529 2.08182H3.25248Z"
            fill="black"
          />
          <path
            d="M3.57503 6.32811C3.49978 6.32811 3.42991 6.30661 3.36003 6.26898C3.17191 6.15073 3.11278 5.89811 3.23103 5.70998L5.88091 1.46373C5.99916 1.27561 6.24641 1.21648 6.43454 1.33473C6.62266 1.45298 6.68179 1.70023 6.56354 1.88836L3.91366 6.13461C3.83841 6.25823 3.70941 6.32811 3.57503 6.32811Z"
            fill="black"
          />
        </svg>

        <span className="text-[1.2rem]">Filter:</span>
      </Box>
      <Box className="grid grid-cols-[1fr_max-content] gap-[8px] items-center">
        <Box className="flex flex-wrap gap-[8px]">
          {activeFilters.map((filter, i) => (
            <ActiveFilter
              key={i}
              onRemove={() =>
                startNavigation(() =>
                  handleRemoveFilter(filter.type, filter.name)
                )
              }
              name={filter.name}
            />
          ))}
        </Box>
        <p
          onClick={() => {
            startNavigation(() => handleRemoveAllFilters());
          }}
          className="underline cursor-pointer font-bold text-[1.2rem]"
        >
          Reset all
        </p>
      </Box>
    </Box>
  );
}
