import { v } from "convex/values";
import { internalQuery, mutation, query } from "./_generated/server";
import { slugify } from "./_utils/slug";
// import { captureSentryError } from "./_utils/sentry";

// export const addProduct = mutation(
//   async ({ db }, product: { name: string; price: number }) => {
//     const now = Date.now();
//     return await db.insert(products, {
//       name: product.name,
//       price: product.price,
//       createdAt: now,
//     });
//   }
// );

export const getAllBrands = query({
  args: {},
  handler: async (ctx) => {
    try {
      // const user = await ctx.auth.getUserIdentity();
      // console.log(user, "This is userId");
      // if (!user) {
      //   throw new Error("User is not authenticated");
      // }
      const brands = await ctx.db.query("brands").collect();

      return { success: true, brands };
    } catch (error) {
      console.log(error, "Error occured getting brands");
      // captureSentryError(ctx, error);
      throw error;
    }
  },
});

export const getAllBrandProducts = query({
  args: {
    brandSlug: v.optional(v.string()),
    brandId: v.optional(v.id("brands")),
  },
  handler: async (ctx, args) => {
    console.log("inside get all brand products");
    try {
      let brand;
      if (args.brandSlug) {
        brand = await ctx.db
          .query("brands")
          .withIndex("by_slug", (q) => q.eq("slug", args.brandSlug!))
          .unique();
      } else if (args.brandId) {
        brand = await ctx.db.get(args.brandId);
      }

      if (!brand) {
        return { success: false, message: "Brand not found" };
      }

      const products = await ctx.db
        .query("products")
        .filter((q) => q.eq(q.field("brandId"), brand._id))
        .collect();

      return { success: true, products };
    } catch (error) {
      // captureSentryError(ctx, error);
      throw error;
    }
  },
});

export const createBrand = mutation({
  args: {
    name: v.string(),
    logoUrl: v.optional(v.string()),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    try {
      const now = Date.now();
      const slug = slugify(args.name);
      return await ctx.db.insert("brands", {
        name: args.name,
        slug,
        logoUrl: args.logoUrl,
        description: args.description,
        createdAt: now,
      });
    } catch (error) {
      // captureSentryError(ctx, error);
      throw error;
    }
  },
});

export const editBrand = mutation({
  args: {
    id: v.id("brands"),
    name: v.optional(v.string()),
    logoUrl: v.optional(v.string()),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    try {
      const { id, name, logoUrl, description } = args;
      const updatedFields: Record<string, any> = { ...args };

      if (name !== undefined) {
        updatedFields.name = name;
        updatedFields.slug = slugify(name);
      }

      await ctx.db.patch(id, updatedFields);
      return ctx.db.get(id);
    } catch (error) {
      // captureSentryError(ctx, error);
      throw error;
    }
  },
});

export const deleteBrand = mutation({
  args: {
    id: v.id("brands"),
  },
  handler: async (ctx, args) => {
    try {
      await ctx.db.delete(args.id);
    } catch (error) {
      // captureSentryError(ctx, error);
      throw error;
    }
  },
});

const normalize = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, " ")
    .trim();
const tokens = (s: string) => new Set(normalize(s).split(" ").filter(Boolean));
const jaccard = (a: Set<string>, b: Set<string>) => {
  const aArr = Array.from(a);
  const inter = aArr.filter((x) => b.has(x)).length;
  const uni = new Set([...aArr, ...Array.from(b)]).size || 1;
  return inter / uni;
};

export const resolveBrandSlugs = internalQuery({
  args: {
    brandQuery: v.string(),
    threshold: v.optional(v.number()),
    maxOptions: v.optional(v.number()),
  },
  handler: async (ctx, { brandQuery, threshold = 0.5, maxOptions = 5 }) => {
    const brands = await ctx.db.query("brands").collect();
    const brandQuerySlug = brandQuery.trim().split(" ").join("-");

    const qTok = tokens(brandQuerySlug);

    const ranked = brands
      .map((b: any) => {
        // proper slug format
        const slugTok = tokens(String(b.slug || "").replace(/_/g, "-"));
        const nameTok = tokens(String(b.name || ""));
        const score =
          jaccard(qTok, slugTok) * 0.6 + jaccard(qTok, nameTok) * 0.4;
        return { slug: b.slug, name: b.name, score };
      })
      .sort((a, b) => b.score - a.score);

    if (!ranked.length || ranked[0].score < threshold) {
      return {
        slugs: [],
        options: ranked.slice(0, maxOptions).map((r) => ({
          slug: r.slug,
          name: r.name,
          score: +r.score.toFixed(3),
        })),
      };
    }

    const [top, ...rest] = ranked;
    const close = ranked
      .filter((r) => top.score - r.score < 0.08)
      .slice(0, maxOptions);
    if (close.length > 1) {
      return {
        slugs: [],
        options: close.map((r) => ({
          slug: r.slug,
          name: r.name,
          score: +r.score.toFixed(3),
        })),
      };
    }

    console.log("This is top brand", top.slug);

    return { slugs: [top.slug] };
  },
});
