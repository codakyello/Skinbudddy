import { Id } from "../_generated/dataModel";

export type Size = {
  unit: string;
  id: string;
  size: number;
  price: number;
  stock?: number;
  name?: string;
  discount?: number;
};

export type Category = {
  _id?: Id<"categories"> | string;
  name: string;
  description?: string;
  createdAt?: number;
  slug?: string;
  image?: string;
};

export type Brand = {
  name: string;
  logoUrl?: string;
  description?: string;
  count?: number;
  createdAt?: number;
};

export type Filter = {
  // ... existing code ...
};

export type Cart = {
  _id: Id<"carts">; // or Id<"carts">
  userId: string;
  productId: Id<"products">; // or Id<"products">
  quantity: number;
  createdAt: number;
  variantId?: string; // Optional for products with variants
  sizeId?: string; // Optional for size variants
  size?: Size | null; // Optional populated size field, if you're including it via query

  // Optional populated product field, if you're including it via query
  product: Product | null;
};

export type Product = {
  _id?: Id<"products"> | string; // or Id<"products"> if using Convex
  name?: string;
  description?: string;
  price?: number;
  stock?: number;
  brandId?: Id<"brands">; // or Id<"brands">
  images?: string[];
  promoImage?: string;
  createdAt?: number;
  isNew?: boolean;
  isBestseller?: boolean;
  isTrending?: boolean;
  discount?: number;
  size?: number;
  sizes: Size[];
  slug?: string;
  unit?: string;
  // DB holds Ids but some queries populate docs; allow both shapes.
  categories?: (Id<"categories"> | Category | null)[];
};
