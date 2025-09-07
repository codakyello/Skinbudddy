import { fetchAction } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import { NextResponse } from "next/server";

export async function POST() {
  try {
    await fetchAction(api.order.verifyPendingPaymentsSwee, {});

    return NextResponse.json({
      success: true,
      message: "ran successfully",
    });
  } catch (error: unknown) {
    console.error("Error running verifypendingsweep ", error);

    return NextResponse.json(
      {
        success: true,
        message:
          error instanceof Error ? error.message : "Unexpected error occurred",
      },
      { status: 500 }
    );
  }
}
