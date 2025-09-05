import { NextRequest, NextResponse } from "next/server";
import { fetchMutation } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import crypto from "crypto";

export async function POST(req: NextRequest) {
  try {
    const secret = process.env.PAYSTACK_SECRET_KEY;
    if (!secret) {
      throw new Error("PAYSTACK_SECRET_KEY is not set");
    }

    const signature = req.headers.get("x-paystack-signature");
    if (!signature) {
      return NextResponse.json(
        { success: false, message: "No signature provided" },
        { status: 400 }
      );
    }

    const body = await req.text();

    const hash = crypto.createHmac("sha512", secret).update(body).digest("hex");

    if (hash !== signature) {
      return NextResponse.json(
        { success: false, message: "Invalid signature" },
        { status: 400 }
      );
    }

    const event = JSON.parse(body);

    // Handle only successful transactions
    if (event.event === "charge.success") {
      const { reference } = event.data;

      if (!reference) {
        return NextResponse.json(
          {
            success: false,
            message: "Missing reference in event data",
          },
          { status: 400 }
        );
      }

      // Call Convex mutation to complete the order by reference
      const completeOrderResponse = await fetchMutation(api.order.completeOrder, {
        reference,
      });

      if (!completeOrderResponse?.success) {
        console.error(
          "Convex completeOrder mutation failed:",
          completeOrderResponse
        );
        return NextResponse.json(
          {
            success: false,
            message:
              completeOrderResponse?.message || "Failed to complete order",
          },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        message: "Order completed successfully",
      });
    }

    return NextResponse.json({ success: true, message: "Event not handled" });
  } catch (error: unknown) {
    console.error("Error in Paystack webhook API:", error);
    return NextResponse.json(
      {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "An unexpected error occurred",
      },
      { status: 500 }
    );
  }
}
