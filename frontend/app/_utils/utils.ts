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

export const formatPrice = new Intl.NumberFormat("en-NG", {
  style: "currency",
  currency: "NGN",
  minimumFractionDigits: 0,
});

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
