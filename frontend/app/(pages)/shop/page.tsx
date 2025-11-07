import ActiveFilters from "@/app/_components/ActiveFilters";
import Products from "@/app/_components/Products";
import { api } from "@/convex/_generated/api";
import { fetchQuery } from "@/ai/convex/client";
import { Suspense } from "react";

export default async function Page() {
  let result;
  try {
    result = await fetchQuery(api.brands.getAllBrands, {});
  } catch (err) {
    if (err instanceof Error) {
      console.log("Failed to fetch brands", err.message);
    } else {
      console.log("Unknown error occurred");
    }
  }

  const brands = result?.brands;

  return (
    <Suspense fallback={"...loading"}>
      <ActiveFilters />
      <Products brands={brands} />
    </Suspense>
  );
}
