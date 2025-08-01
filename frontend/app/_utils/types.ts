import { Id } from "@/convex/_generated/dataModel";

type Size = {
  size: string;
  price?: number;
  stock?: number;
};

// type Filter = {
//   name: string;
//   count?: number;
// };
export type Brand = {
  name: string;
  logoUrl?: string;
  description?: string;
  count?: number;
  createdAt?: number;
};

export type Filter = {
  name: string;
  count?: number;
};

export type FilterObj = {
  title: string;
  type: string;
  filters: Filter[];
};

export type Product = {
  _id: Id<"products">; // or Id<"products"> if using Convex
  name: string;
  description: string;
  price: number;
  stock: number;
  brandId: Id<"brands">; // or Id<"brands">
  images: string[];
  promoImage?: string;
  createdAt: number;

  isNew?: boolean;
  isBestseller?: boolean;
  isTrending?: boolean;
  discount?: number;

  sizes?: Size[];
};

export type Cart = {
  _id: Id<"carts">; // or Id<"carts">
  userId: string;
  productId: Id<"products">; // or Id<"products">
  quantity: number;
  createdAt: number;

  // Optional populated product field, if you're including it via query
  product?: Product | null;
};

export type Announcement = {
  _id: number;
  title: string;
};

export interface User {
  _id?: string;
  userName?: string;
  name?: string;
  phone?: string;
  email?: string;
  accountType?: string;
  image: string;
  organisationId?: string;
  subscriptionStatus?: string;
}
