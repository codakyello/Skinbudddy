import { NextRequest, NextResponse } from "next/server";
import { fetchAction } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import crypto from "crypto";

export async function POST(req: NextRequest) {
  console.log("Webhook called");
  try {
    const secret = process.env.PAYSTACK_SECRET_KEY;
    if (!secret) {
      throw new Error("PAYSTACK_SECRET_KEY is not set");
    }

    const signature = req.headers.get("x-paystack-signature");
    if (!signature) {
      return NextResponse.json(
        { success: false, message: "No signature provided" },
        { status: 400 } // let Paystack retry
      );
    }

    const body = await req.text();

    const hash = crypto.createHmac("sha512", secret).update(body).digest("hex");
    if (hash !== signature) {
      return NextResponse.json(
        { success: false, message: "Invalid signature" },
        { status: 400 } // let Paystack retry
      );
    }

    const event = JSON.parse(body);

    if (event.event === "charge.success") {
      const { reference } = event.data;

      if (!reference) {
        return NextResponse.json(
          { success: false, message: "Missing reference in event data" },
          { status: 400 } // let Paystack retry
        );
      }

      // ✅ Acknowledge Paystack immediately
      const res = NextResponse.json(
        { success: true, message: "Webhook received" },
        { status: 200 }
      );

      // ⏳ Do business logic in background
      // lets see if it will run if we dont await it
      (() => {
        try {
          fetchAction(api.order.verifyAndCompleteByReference, {
            reference,
          });
        } catch (err) {
          console.error("Failed to complete order:", err);
          // Save to DB or trigger retry logic in your own system
        }
      })();

      return res;
    }

    // Ignore unrelated events, still return 200
    return NextResponse.json(
      { success: true, message: "Event ignored" },
      { status: 200 }
    );
  } catch (error: unknown) {
    console.error("Error in Paystack webhook API:", error);

    // ❌ Only return 400 if the webhook itself is invalid
    // ✅ For app-side failures, always return 200 to stop retries
    return NextResponse.json(
      {
        success: true,
        message:
          error instanceof Error ? error.message : "Unexpected error occurred",
      },
      { status: 200 }
    );
  }
}
