import { Id } from "@/convex/_generated/dataModel";

export type Product = {
  _id: Id<"products">;
  name: string;
  description: string;
  price: number;
  stock: number;
  brandId: string;
  images: string[];
  promoImage?: string;
  createdAt: number;
  isNew?: boolean;
  isBestseller?: boolean;
  isTrending?: boolean;
  discount?: number;
  sizes?: {
    size: string;
    price?: number;
    stock?: number;
  }[];
};

export type Cart = {
  product: Product;
  quantity: number;
  addToRoutine: boolean;
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
