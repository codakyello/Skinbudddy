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
      jwks: "data:text/plain;charset=utf-8;base64,ewogICJrZXlzIjogWwogICAgewogICAgICAia3R5IjogIlJTQSIsCiAgICAgICJuIjogIml0cHA1emcxUW1TeFBzVXQyWTdLYlYxUDBmNTFTMUFCM2pOTVNUeEROWV9qUTdoSzN1dFNCdVV1VVBoLVNsT0pEQ29FWk4yXzVqY0w4QTYxZk5WNEtQbl9fLWZBTS1mNnA5ZERZdi0wN3RHZTF2Qy1SR1JGanJKellFNWpwN2tucXZ4cmpkOXg1R1BVUHNfbjQwd3RDLTdvekowcXZWN3NjYU5TaGMyVUU0WS1zYlZBN2phUS1ad2s5eXAyVm5xN203VHFEN2FWOHFjbXJabkNVaHBpNTRCaXhiem5yTUhtU1p4NUhYVFdJMGhHN1FfbTdiWXpTVFgyQnU0TU5YbkVsVDFjZmNtcE8wdGJCbjdkQUJCbGJwVVlEdkxlZkRQTGUxTm9WWWhGaWJnam1QcEJFdGpqX08yTHA4UWxpVkRGbTNEV0lyS0Nsb0VfYzdvelRseHRldyIsCiAgICAgICJlIjogIkFRQUIiLAogICAgICAia2lkIjogIm1haW4ta2V5IiwKICAgICAgInVzZSI6ICJzaWciLAogICAgICAiYWxnIjogIlJTMjU2IgogICAgfQogIF0KfQ==",
      algorithm: "RS256",
    },
  ],
};

export default authConfig;
