// // create a context for the filters

// import { createContext, useContext, useState } from "react";

// export type FilterType =
//   | "genres"
//   | "releaseYear"
//   | "ratings"
//   | "whereToWatch"
//   | "language"
//   | "duration"
//   | "pgRatings"
//   | "gender";

// export type Filters = {
//   [K in FilterType]: string[];
// };

// type FilterContextType = {
//   filters: Filters;
//   setFilters: React.Dispatch<React.SetStateAction<Filters>>;
//   sort: { sortBy: string };
//   handleSort: (sortBy: string) => void;
//   handleAddFilter: (filter: FilterType, value: string) => void;
//   handleRemoveFilter: (filter: FilterType, value: string) => void;
// };

// export const FilterContext = createContext<FilterContextType>(
//   {} as FilterContextType
// );

// // create a provider for the filters

// export const FilterProvider = ({ children }: { children: React.ReactNode }) => {
//   const [filters, setFilters] = useState<Filters>({
//     genres: [],
//     releaseYear: [],
//     ratings: [],
//     whereToWatch: [],
//     language: [],
//     duration: [],
//     pgRatings: [],
//     gender: [],
//   });
//   const [sort, setSort] = useState({
//     sortBy: "",
//   });

//   const handleSort = (sortBy: string) => {
//     setSort({ sortBy });
//   };

//   const handleAddFilter = (filter: FilterType, value: string) => {
//     if (filters[filter]?.includes(value)) {
//       setFilters({
//         ...filters,
//         [filter]: filters[filter]?.filter((v) => v !== value),
//       });
//     } else {
//       setFilters({ ...filters, [filter]: [...filters[filter], value] });
//     }
//   };

//   const handleRemoveFilter = (filter: FilterType, value: string) => {
//     setFilters({
//       ...filters,
//       [filter]: filters[filter]?.filter((v) => v !== value),
//     });
//   };

//   return (
//     <FilterContext.Provider
//       value={{
//         filters,
//         setFilters,
//         sort,
//         handleSort,
//         handleAddFilter,
//         handleRemoveFilter,
//       }}
//     >
//       {children}
//     </FilterContext.Provider>
//   );
// };

// // create a hook for the filters
// export const useFilter = () => {
//   const context = useContext(FilterContext);
//   if (!context) {
//     throw new Error("useFilter must be used within a FilterProvider");
//   }
//   return context;
// };
