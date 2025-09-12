import { Product } from "./type";

export function generateToken() {
  return (
    Math.random().toString(36).slice(2) +
    Math.random().toString(36).slice(2) +
    Math.random().toString(36).slice(2)
  ).slice(0, 36);
}
export function hasCategory(products: Product[], categoryName: string) {
  const target = categoryName.toLowerCase();
  return products.some((product) =>
    product?.categories?.some((cat) => {
      if (!cat || typeof cat === "string") return false; // Ids can't match by name
      return cat.name?.toLowerCase() === target;
    })
  );
}
