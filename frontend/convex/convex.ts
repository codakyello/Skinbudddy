import { ConvexReactClient } from "convex/react";

export const convexClient = new ConvexReactClient(
  process.env.NEXT_PUBLIC_CONVEX_URL || "http://localhost:3000"
);
