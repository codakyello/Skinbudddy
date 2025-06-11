"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

export function useFilters() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const params = new URLSearchParams(searchParams);

  const filters: Record<string, string[]> = {};

  Array.from(searchParams.entries()).forEach(([key, value]) => {
    if (filters[key]) {
      filters[key].push(value);
    } else {
      filters[key] = [value];
    }
  });

  // console.log(filters, "Before converting to activeFilters");

  const activeFilters = Object.entries(filters).flatMap(([key, value]) => {
    return value.map((v) => ({
      type: key,
      name: v,
    }));
  });

  console.log(activeFilters, "These are active filters");

  const handleAddFilter = (filterType: string, filter: string) => {
    const existing = params.getAll(filterType);
    if (!existing.includes(filter)) {
      params.append(filterType, filter);
    }

    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  const handleRemoveFilter = (filterType: string, filterValue: string) => {
    const params = new URLSearchParams(searchParams);

    // Collect all values of the filter type, except the one we want to remove
    const values = params
      .getAll(filterType)
      .filter((val) => val !== filterValue);

    // Delete all existing instances of the filter type
    params.delete(filterType);

    // Re-add remaining values (if any)
    values.forEach((val) => {
      params.append(filterType, val);
    });

    // Update the URL
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  const handleRemoveAllFilters = () => {
    router.replace(pathname, { scroll: false });
  };
  return {
    activeFilters,
    filters,
    handleAddFilter,
    handleRemoveFilter,
    handleRemoveAllFilters,
  };
}
