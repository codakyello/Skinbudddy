import ActiveFilters from "@/app/_components/ActiveFilters";
import Product from "@/app/_components/Product";
import { api } from "@/convex/_generated/api";
import { fetchQuery } from "convex/nextjs";

export default async function Page() {
  let brands;
  try {
    brands = await fetchQuery(api.brands.getAllBrands);
  } catch (err) {
    if (err instanceof Error) {
      console.log("Failed to fetch brands", err.message);
    } else {
      console.log("Unknown error occurred");
    }
  }

  return (
    <>
      <ActiveFilters />
      <Product brands={brands} />
    </>
  );
}
