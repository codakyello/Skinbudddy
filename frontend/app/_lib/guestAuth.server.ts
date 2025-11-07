import fs from "node:fs";
import {
  SignJWT,
  importPKCS8,
  importSPKI,
  jwtVerify,
} from "jose";

import {
  DEFAULT_AUDIENCE,
  DEFAULT_ISSUER,
  type GuestTokenClaims,
} from "./guestAuth";

const privatePem = fs.readFileSync("./private.pem", "utf8");
const publicPem = fs.readFileSync("./public.pem", "utf8");

export async function generateGuestToken(guestId: string): Promise<string> {
  if (!guestId || !guestId.startsWith("guest_")) {
    throw new Error("Invalid guest user ID supplied when generating token");
  }

  const privateKey = await importPKCS8(privatePem, "RS256");

  return new SignJWT({
    role: "guest",
    azp: "guest-auth",
  })
    .setProtectedHeader({ alg: "RS256", kid: "main-key" })
    .setSubject(guestId)
    .setIssuer(DEFAULT_ISSUER)
    .setAudience(DEFAULT_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(privateKey);
}

export async function verifyGuestToken(
  token: string
): Promise<GuestTokenClaims | null> {
  if (!token) return null;

  try {
    const publicKey = await importSPKI(publicPem, "RS256");
    const { payload } = await jwtVerify(token, publicKey, {
      issuer: DEFAULT_ISSUER,
      audience: DEFAULT_AUDIENCE,
    });

    return payload as GuestTokenClaims;
  } catch (error) {
    console.warn("Failed to verify guest token:", error);
    return null;
  }
}
