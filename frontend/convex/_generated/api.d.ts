/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";
import type * as _utils_internalUtils from "../_utils/internalUtils.js";
import type * as _utils_products from "../_utils/products.js";
import type * as _utils_slug from "../_utils/slug.js";
import type * as _utils_type from "../_utils/type.js";
import type * as brands from "../brands.js";
import type * as cart from "../cart.js";
import type * as convex from "../convex.js";
import type * as crons from "../crons.js";
import type * as order from "../order.js";
import type * as products from "../products.js";
import type * as recommendations from "../recommendations.js";
import type * as routine from "../routine.js";
import type * as users from "../users.js";
import type * as wishlist from "../wishlist.js";

/**
 * A utility for referencing Convex functions in your app's API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
declare const fullApi: ApiFromModules<{
  "_utils/internalUtils": typeof _utils_internalUtils;
  "_utils/products": typeof _utils_products;
  "_utils/slug": typeof _utils_slug;
  "_utils/type": typeof _utils_type;
  brands: typeof brands;
  cart: typeof cart;
  convex: typeof convex;
  crons: typeof crons;
  order: typeof order;
  products: typeof products;
  recommendations: typeof recommendations;
  routine: typeof routine;
  users: typeof users;
  wishlist: typeof wishlist;
}>;
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;
