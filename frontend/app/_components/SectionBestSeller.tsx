"use client";
import { Product } from "../_utils/types";
import useProducts from "../_hooks/useProducts";
import Section from "./Section";

export default function SectionBestSeller({
  initialProducts,
}: {
  initialProducts: Product[];
}) {
  const { products } = useProducts({
    filters: { isBestseller: true },

    sort: "",
  });

  // if (!initialProducts && loading) {
  //   // show loading
  // }

  // we first make sure no initialProducts was gotten from server
  // so it will be intuitive
  // useEffect(() => {
  //   console.log(error, "This is error");
  //   if (initialProducts.length < 1 && error) {
  //     //show error
  //     toast.error("Failed to fetch best sellers");
  //   }
  // }, [error]);
  return (
    <Section
      name="best sellers"
      initialProducts={initialProducts}
      products={products}
    />
  );
}
