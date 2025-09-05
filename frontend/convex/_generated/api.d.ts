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
import type * as _utils_slug from "../_utils/slug.js";
import type * as _utils_utils from "../_utils/utils.js";
import type * as brands from "../brands.js";
import type * as cart from "../cart.js";
import type * as convex from "../convex.js";
import type * as cron from "../cron.js";
import type * as order from "../order.js";
import type * as products from "../products.js";
import type * as users from "../users.js";

/**
 * A utility for referencing Convex functions in your app's API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
declare const fullApi: ApiFromModules<{
  "_utils/slug": typeof _utils_slug;
  "_utils/utils": typeof _utils_utils;
  brands: typeof brands;
  cart: typeof cart;
  convex: typeof convex;
  cron: typeof cron;
  order: typeof order;
  products: typeof products;
  users: typeof users;
}>;
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;
