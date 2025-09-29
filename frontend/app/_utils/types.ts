import { Id } from "@/convex/_generated/dataModel";
import { v } from "convex/values";
import { ActionTypes } from "@/convex/schema";

export type Size = {
  unit: string;
  id: string;
  size: number;
  price: number;
  stock?: number;
  name?: string;
  discount?: number;
};

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

export type Category = {
  _id?: Id<"categories"> | string;
  name: string;
  description?: string;
  createdAt?: number;
  slug?: string;
  image?: string;
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
  sizes?: Size[];
  slug?: string;
  unit?: string;
  // Convex returns category ids in DB docs, but queries often populate them.
  // Allow both to avoid assignment errors at boundaries.
  categories?: (Id<"categories"> | Category | null)[];
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

export type Announcement = {
  _id: number;
  title: string;
};

export type PendingAction = {
  id: string;
  prompt: string;
  status: "pending" | "completed" | "dismissed";
  type: typeof ActionTypes;
  data: unknown; // TODO: Refine this type if possible based on ActionTypes
  createdAt: number;
  expiresAt?: number;
};

export type User = {
  _id: Id<"users">; // Convex document ID
  _creationTime: number; // Convex creation timestamp
  userId: string;
  email?: string;
  clerkId?: string;
  name?: string;
  phone?: string;
  pendingActions?: PendingAction[];
  address?: string;
  streetAddress?: string;
  additionalAddress?: string;
  fullAddress?: string;
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
  companyName?: string;
  firstName?: string;
  lastName?: string;
  createdAt: number;
  hasUsedRecommender?: boolean;
  aiBuilderUsed?: boolean;
};

export type FormError = {
  email?: string | null;
  password?: string | null;
  phone?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  country?: string | null;
  state?: string | null;
  city?: string | null;
  streetAddress?: string | null;
  additionalAddress?: string | null;
  companyName?: string | null;
};
