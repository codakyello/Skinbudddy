// pages/api/index-products.ts (or app/api/index-products/route.ts for App Router)
import { algoliasearch } from "algoliasearch";
import { fetchQuery } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import { NextResponse } from "next/server";

export async function POST() {
  try {
    const client = algoliasearch(
      "FKAPFGEQJV",
      "eb348be70bc6d60481d357b1f0a06790"
    );

    const products = await fetchQuery(api.products.getAllProducts, {});

    console.log(products);

    await client.saveObjects({
      indexName: "products_index",
      objects: products,
    });

    return NextResponse.json({
      success: true,
      message: "Data imported successfully",
    });
  } catch (error: unknown) {
    console.error("Error in importing data to algolia ", error);

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

// // Fetch and index objects in Algolia
// const processRecords =

// processRecords()
//   .then(() => console.log("Successfully indexed objects!"))
//   .catch((err) => console.error(err));
