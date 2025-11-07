import fs from "node:fs";
import path from "node:path";
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

const normalizePem = (value: string): string =>
  value.replace(/\\n/g, "\n").trim();

const resolveKey = (envName: string, fallbackFile: string): string => {
  const fromEnv = process.env[envName];
  if (fromEnv && fromEnv.trim().length) {
    return normalizePem(fromEnv);
  }

  const absolutePath = path.resolve(process.cwd(), fallbackFile);
  if (fs.existsSync(absolutePath)) {
    return fs.readFileSync(absolutePath, "utf8");
  }

  throw new Error(
    `Missing ${envName} and fallback file ${fallbackFile}. Configure the PEM via environment variable or add the file to the project.`
  );
};

const privatePem = resolveKey("GUEST_JWT_PRIVATE_KEY", "./private.pem");
const publicPem = resolveKey("GUEST_JWT_PUBLIC_KEY", "./public.pem");

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
