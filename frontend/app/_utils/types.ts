export type Product = {
  imageUrl: string | undefined;
  _id: string;
  name: string;
  price: number;
  images: string[];
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
