// src/ai/tools/executor.ts

import { fetchMutation, fetchQuery } from "../convex/client";
import { api } from "../../convex/_generated/api";

export async function executeTool(
  toolName: string,
  toolInput: any
): Promise<any> {
  console.log(`Executing tool: ${toolName}`, toolInput);

  switch (toolName) {
    case "getUserCart":
      return await fetchQuery(api.cart.getUserCart, {});

  /*
  case "addToCart":
      return await fetchMutation(api.cart.createCart, {
        productId: toolInput.productId,
        sizeId: toolInput.sizeId,
        quantity: toolInput.quantity,
      });
  */

    case "updateCartQuantity":
      return await fetchMutation(api.cart.updateCartQuantity, {
        cartId: toolInput.cartId,
        quantity: toolInput.quantity,
      });

    case "removeFromCart":
      return await fetchMutation(api.cart.removeFromCart, {
        cartId: toolInput.cartId,
      });

    case "clearCart":
      return await fetchMutation(api.cart.clearCart, {});

    // working fine
    case "bulkAddCartItems":
      return await fetchMutation(api.cart.bulkAddCartItems, {
        items: toolInput.items,
      });

    // working fine
    case "getAllProducts":
      return await fetchQuery(api.products.getAllProducts, {
        filters: toolInput.filters,
        sort: toolInput.sort,
      });

    // not sure yet
    case "getProduct":
      return await fetchQuery(api.products.getProduct, {
        slug: toolInput.slug,
      });

    case "getUserRoutines":
      return await fetchQuery(api.routine.getUserRoutines, {});

    case "getUserRoutine":
      return await fetchQuery(api.routine.getUserRoutine, {
        routineId: toolInput.routineId,
      });

    // working fine
    case "getAllBrands":
      return await fetchQuery(api.brands.getAllBrands, {});

    // working fine
    case "getAllBrandProducts":
      return await fetchQuery(api.brands.getAllBrandProducts, {
        brandSlug: toolInput.brandSlug ?? undefined,
        brandId: toolInput.brandId ?? undefined,
      });
    default:
      throw new Error(`Unknown tool: ${toolName}`);
  }
}
