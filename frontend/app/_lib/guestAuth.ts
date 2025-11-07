import type { JWTPayload } from "jose";

// Constants for cookie & local storage keys
export const GUEST_COOKIE_NAME = "guest_token";
export const GUEST_TOKEN_STORAGE_KEY = "convex_guest_token";

// Default token claims
export const DEFAULT_ISSUER = "https://skinbuddy-guest";
export const DEFAULT_AUDIENCE = "convex";

// Define the token payload type
export type GuestTokenClaims = JWTPayload & {
  sub: string; // Guest ID
  iss: string; // Issuer
  aud: string | string[]; // Audience
  role?: string; // Optional custom claim
  azp?: string; // Authorized party
};

// ✅ Shared config (optional for other modules)
export const guestAuthConfig = {
  issuer: DEFAULT_ISSUER,
  audience: DEFAULT_AUDIENCE,
};
