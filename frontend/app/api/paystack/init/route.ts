import { NextRequest, NextResponse } from "next/server";
import { fetchMutation } from "convex/nextjs";
import { api } from "@/convex/_generated/api";

export async function POST(req: NextRequest) {
  try {
    const { orderId, email, amount } = await req.json();

    if (!orderId || !email || !amount) {
      return NextResponse.json(
        { success: false, message: "Missing required fields" },
        { status: 400 }
      );
    }

    const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;

    if (!PAYSTACK_SECRET_KEY) {
      throw new Error(
        "PAYSTACK_SECRET_KEY is not set in environment variables"
      );
    }

    const paystackResponse = await fetch(
      "https://api.paystack.co/transaction/initialize",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email,
          amount: amount * 100, // Amount in kobo
          metadata: {
            orderId,
          },
          callback_url: "https://skinbudddy-frontend.vercel.app", // <-- redirect here after payment
        }),
      }
    );

    const paystackData = await paystackResponse.json();

    if (!paystackResponse.ok || !paystackData.status) {
      console.error("Paystack initialization failed:", paystackData);
      return NextResponse.json(
        {
          success: false,
          message: paystackData.message || "Paystack initialization failed",
        },
        { status: paystackResponse.status || 500 }
      );
    }

    const { authorization_url, reference } = paystackData.data;

    // Call Convex mutation to update the order with Paystack reference
    const updateOrderResponse = await fetchMutation(api.order.updateOrder, {
      orderId,
      reference,
    });

    if (!updateOrderResponse?.success) {
      console.error("Convex updateOrder mutation failed:", updateOrderResponse);
      return NextResponse.json(
        {
          success: false,
          message:
            updateOrderResponse?.message ||
            "Failed to update order with Paystack reference",
        },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, authorization_url });
  } catch (error: unknown) {
    console.error("Error in Paystack initialization API:", error);
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
