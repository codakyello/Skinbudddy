import { fetchAction } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const body = await req.json();
  // console.log(body);
  // {
  //   skinConcern: body.skinConcern,
  //   skinType: "oily",
  //   ingredientsToAvoid: ["alcohol"],
  //   fragranceFree: true,
  // }
  try {
    const result = await fetchAction(api.products.recommend, body);
    // const result = await fetchQuery(api.products.getEssentialProducts, body);

    // const res = await fetchMutation(api.products.seedProductsFromFile);

    // const result = await fetchAction(api.routine.createRoutine, body);

    return NextResponse.json({
      success: true,
      message: "ran successfully",
      result: result,
    });
  } catch (error: unknown) {
    console.error("Error getting product recommendations ", error);

    return NextResponse.json(
      {
        success: false,
        message:
          error instanceof Error ? error.message : "Unexpected error occurred",
      },
      { status: 500 }
    );
  }
}
