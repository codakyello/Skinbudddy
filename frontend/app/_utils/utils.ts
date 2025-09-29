import { Product, Size } from "./types";

export const URL = "https://skinbudddy.vercel.app/api/v1";

export const DEV_URL = "http://localhost:5000/api/v1";

export function catchAsync<T>(fn: (...args: unknown[]) => Promise<T>) {
  return async (...args: unknown[]): Promise<unknown> => {
    return await fn(...args);
  };
}

export function wait(seconds: number) {
  return new Promise((resolve) => setTimeout(resolve, seconds * 1000));
}

export function validateEmail(email: string) {
  if (!email) return "Please enter an email address";

  // Simple email regex pattern
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (!emailPattern.test(email))
    return "Sorry, that doesn't look like an email address";

  return null;
}

export function validatePassword(
  password: string,
  options?: { signUp?: boolean }
) {
  if (!password) return "You need to fill in this field";

  if (options?.signUp && password.length < 8)
    return "Password must be at least 8 characters";

  return null;
}

export const formatPrice = (price: number | undefined) => {
  const numberFormat = new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    minimumFractionDigits: 0,
  });
  const formattedPrice = numberFormat.format(price || 0);

  return formattedPrice;
};

export function validatePhoneNo(
  phone: string,
  options?: { country?: "NG" | "INTL" } // default NG
) {
  if (!phone) return "You need to fill in this field";

  const country = options?.country ?? "NG";
  // Strip spaces, dashes, dots, and parentheses
  const cleaned = phone.trim().replace(/[\s\-().]/g, "");

  if (country === "INTL") {
    // Generic E.164: + followed by 7–15 digits (no leading zero after +)
    const e164 = /^\+[1-9]\d{6,14}$/;
    if (!e164.test(cleaned)) {
      return "Enter a valid phone number (e.g., +2348012345678)";
    }
    return null;
  }

  // NG formats:
  // - Local: 11 digits starting with 0 (e.g., 08012345678)
  // - International: +234 followed by 10 digits (no leading 0)
  // Accept bare 234… as well.
  const ngLocal = /^0\d{10}$/; // 11 digits
  const ngIntl = /^\+234\d{10}$/; // +234XXXXXXXXXX
  const ngBare = /^234\d{10}$/; // 234XXXXXXXXXX

  if (ngLocal.test(cleaned) || ngIntl.test(cleaned) || ngBare.test(cleaned)) {
    return null;
  }

  return "Enter a valid Nigerian phone number (e.g., 08012345678 or +2348012345678)";
}

export function getOrCreateAnonymousId(): string {
  const key = "anon_user_id";
  let id = localStorage.getItem(key);

  if (!id) {
    id = crypto.randomUUID(); // or use nanoid
    localStorage.setItem(key, id);
  }

  return id;
}

export function getTagType(product: Product) {
  if (product.isNew) return "isNew";
  if (product.isBestseller) return "isBestseller";
}

export function formatProductName(name: string) {
  let formattedName = "";
  name.split(" ").forEach((word) => {
    formattedName += word.slice(0, 1).toUpperCase() + word.slice(1) + " ";
  });
  return formattedName.trim();
}

export function getDiscountedType(products?: Size[]) {
  const isDiscount = products?.find((product) => product.discount);

  if (isDiscount) return "isDiscount";
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    const msg = error.message;

    // Case 1: developer-thrown error (Uncaught Error: ...)
    const uncaughtMatch = msg.match(/Uncaught Error:\s*(.*?)(?:\s+at|\n|$)/);
    if (uncaughtMatch && uncaughtMatch[1]) {
      return uncaughtMatch[1];
    }

    // Case 2: argument validation or other errors → grab first line after "Server Error"
    const serverErrorMatch = msg.split("Server Error")[1]?.trim();
    if (serverErrorMatch) {
      // Take only the first line, so you don't get the whole stack
      return serverErrorMatch.split("\n")[0].trim();
    }

    return "Something went wrong";
  }

  return "An unknown error occurred.";
}

export function hasCategory(products: Product[], categoryName: string) {
  const target = categoryName.toLowerCase();
  return products.some((product) =>
    product?.categories?.some((cat) => {
      // If it's an Id (string at runtime), we can't match by name
      if (!cat || typeof cat === "string") return false;
      const name = cat.name?.toLowerCase();
      return name === target;
    })
  );
}

export const generateGridTemplateColumns = (columns: string[]) => {
  const cols = columns
    .map((col: string) => col)
    .join(" ")
    .replaceAll(",", "");
  return cols;
};
