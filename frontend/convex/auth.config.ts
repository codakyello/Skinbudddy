type ClerkAuthProvider = {
  domain: string;
  applicationID: string;
  audience?: string;
};

type CustomJwtAuthProvider = {
  type: "customJwt";
  applicationID: string;
  issuer: string;
  jwks: string;
  algorithm: "RS256" | "HS256";
};

type ConvexAuthConfig = {
  providers: (ClerkAuthProvider | CustomJwtAuthProvider)[];
};

const authConfig: ConvexAuthConfig = {
  providers: [
    // ✅ Clerk Provider (you can keep this if you use Clerk too)
    {
      domain: process.env.CLERK_JWT_ISSUER_DOMAIN!,
      applicationID: "convex",
    },

    // ✅ Your custom JWT provider (SkinBuddy guest tokens)
    {
      type: "customJwt",
      applicationID: "convex",
      issuer: "https://skinbuddy-guest",
      jwks: "data:text/plain;charset=utf-8;base64,ewogICJrZXlzIjogWwogICAgewogICAgICAiZSI6ICJBUUFCIiwKICAgICAgImt0eSI6ICJSU0EiLAogICAgICAibiI6ICJpdHBwNXpnMVFtU3hQc1V0Mlk3S2JWMVAwZjUxUzFBQjNqTk1TVHhETllfalE3aEszdXRTQnVVdVVQaC1TbE9KRENvRVpOMl81amNMOEE2MWZOVjRLUG5fXy1mQU0tZjZwOWREWXYtMDd0R2UxdkMtUkdSRmpySnpZRTVqcDdrbnF2eHJqZDl4NUdQVVBzX240MHd0Qy03b3pKMHF2VjdzY2FOU2hjMlVFNFktc2JWQTdqYVEtWndrOXlwMlZucTdtN1RxRDdhVjhxY21yWm5DVWhwaTU0Qml4Ynpuck1IbVNaeDVIWFRXSTBoRzdRX203Yll6U1RYMkJ1NE1OWG5FbFQxY2ZjbXBPMHRiQm43ZEFCQmxicFVZRHZMZWZEUExlMU5vVlloRmliZ2ptUHBCRXRqal9PMkxwOFFsaVZERm0zRFdJcktDbG9FX2M3b3pUbHh0ZXciLAogICAgICAidXNlIjogInNpZyIsCiAgICAgICJhbGciOiAiUlMyNTYiLAogICAgICAia2lkIjogIm1haW4ta2V5IgogICAgfQogIF0KfQ==",
      algorithm: "RS256",
    },
  ],
};

export default authConfig;
