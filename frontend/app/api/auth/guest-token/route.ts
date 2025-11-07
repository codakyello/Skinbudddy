import { NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import { GUEST_COOKIE_NAME } from "@/app/_lib/guestAuth";
import { generateGuestToken } from "@/app/_lib/guestAuth.server";

type RequestBody = {
  guestId?: string;
};

const convexUrl =
  process.env.NEXT_PUBLIC_CONVEX_URL || "http://localhost:3000";
const convexClient = new ConvexHttpClient(convexUrl);

export async function POST(request: Request) {
  try {
    const body: RequestBody = await request.json().catch(() => ({}));
    const guestId = body.guestId?.trim();

    if (!guestId || !guestId.startsWith("guest_")) {
      return NextResponse.json(
        { error: "A valid guestId (starting with guest_) is required." },
        { status: 400 }
      );
    }

    const isAnon = await convexClient.query(api.users.isAnonGuest, {
      userId: guestId,
    });

    if (!isAnon) {
      return NextResponse.json(
        { error: "Guest tokens can only be issued for anonymous accounts." },
        { status: 403 }
      );
    }

    const token = await generateGuestToken(guestId);

    const response = NextResponse.json({ token });

    response.cookies.set({
      name: GUEST_COOKIE_NAME,
      value: token,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30, // 30 days
    });

    return response;
  } catch (error) {
    console.error("Failed to issue guest token", error);
    return NextResponse.json(
      { error: "Failed to issue guest token" },
      { status: 500 }
    );
  }
}
