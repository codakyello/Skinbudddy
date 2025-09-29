import { Product } from "../_utils/types";
import Modal from "./Modal";
import Section from "./Section";

export default function SectionTrending({
  initialProducts,
}: {
  initialProducts: Product[];
}) {
  return (
    <Section
      products={initialProducts}
      name="Trending"
      initialProducts={initialProducts}
    />
  );
}
