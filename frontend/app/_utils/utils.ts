export const URL = "https://skin-buddy-lyart.vercel.app/api/v1";

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
