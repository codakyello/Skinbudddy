// convex/categories.ts
import { v } from "convex/values";
import { internalQuery, query } from "./_generated/server";

const normalize = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, " ")
    .trim();

// naive singularizer for simple English plurals (e.g., moisturisers -> moisturiser)
const singularize = (s: string) => {
  const n = normalize(s);
  if (n.endsWith("ies")) return n.slice(0, -3) + "y";
  if (n.endsWith("ses")) return n.slice(0, -2); // coarse but ok for our use
  if (n.endsWith("s") && n.length > 4) return n.slice(0, -1);
  return n;
};
const eqLoose = (a: string, b: string) => {
  const na = singularize(a).replace(/\s+/g, " ");
  const nb = singularize(b).replace(/\s+/g, " ");
  return na === nb;
};

const tokens = (s: string) => new Set(normalize(s).split(" ").filter(Boolean));
const jaccard = (a: Set<string>, b: Set<string>) => {
  const aArr = Array.from(a);
  const bArr = Array.from(b);
  const inter = aArr.filter((x) => b.has(x)).length;
  const uni = new Set([...aArr, ...bArr]).size || 1;
  return inter / uni;
};

const SYNONYMS: Record<string, string[]> = {
  moisturizer: ["moisturiser", "cream", "face cream", "lotion", "hydrating"],
  moisturiser: ["moisturizer", "cream", "face cream", "lotion", "hydrating"],
  sunscreen: ["spf", "sun screen", "sunblock", "uv"],
  cleanser: ["face wash", "washing", "gel"],
};

// Expand a query into its base tokens plus singular and synonym variants so
// closely related spellings (e.g., moisturisers/moisturizers) still rank.
function expandTokens(q: string) {
  const base = tokens(q);
  const variants: Array<Set<string>> = [];
  const seen = new Set<string>();

  const pushVariant = (set: Set<string>) => {
    if (!set.size) return;
    const key = Array.from(set).sort().join("|");
    if (!seen.has(key)) {
      seen.add(key);
      variants.push(set);
    }
  };

  const pushSynonyms = (term: string) => {
    const alts = SYNONYMS[term] || [];
    alts.forEach((alt) => {
      const altTokens = tokens(alt);
      pushVariant(altTokens);

      const normalizedAlt = normalize(alt);
      const altSingular = singularize(alt);
      if (altSingular && altSingular !== normalizedAlt) {
        pushVariant(tokens(altSingular));
      }
    });
  };

  Array.from(base).forEach((word) => {
    const normalized = normalize(word);
    if (!normalized) return;

    const singular = singularize(normalized);
    if (singular && singular !== normalized) {
      pushVariant(tokens(singular));
    }

    pushSynonyms(normalized);
    if (singular && singular !== normalized) {
      pushSynonyms(singular);
    }
  });

  return { base, variants };
}

export const resolveCategorySlugs = internalQuery({
  args: {
    categoryQuery: v.string(),
    threshold: v.optional(v.number()),
    maxOptions: v.optional(v.number()),
  },

  handler: async (
    ctx,
    { categoryQuery, threshold = 0.35, maxOptions = 25 }
  ) => {
    console.log(categoryQuery);

    const categoryQuerySlug = categoryQuery.trim().split(" ").join("-");

    const cats = await ctx.db.query("categories").collect();
    const { base: qBase, variants: qVariants } =
      expandTokens(categoryQuerySlug);

    // should we convert the categoryQuery to a slug too

    const ranked = cats
      .map((c: any) => {
        const slugStr = String(c.slug || "").replace(/_/g, "-");
        const nameStr = String(c.name || "");
        const aliasStr = Array.isArray(c.aliases) ? c.aliases.join(" ") : "";

        // Early loose equality (handles plural/singular and spacing)
        const slugEq = eqLoose(slugStr, categoryQuerySlug);
        const nameEq = eqLoose(nameStr, categoryQuerySlug);

        const slugTok = tokens(slugStr);
        const nameTok = tokens(nameStr);
        const aliasTok = tokens(aliasStr);

        const maxJac = (target: Set<string>) => {
          let best = jaccard(qBase, target);
          for (const variant of qVariants) {
            const score = jaccard(variant, target);
            if (score > best) best = score;
          }
          return best;
        };

        const slugSim = slugEq ? 1 : maxJac(slugTok);
        const nameSim = nameEq ? 1 : maxJac(nameTok);
        const aliasSim = maxJac(aliasTok);

        const score = slugSim * 0.65 + nameSim * 0.25 + aliasSim * 0.15;
        return { slug: c.slug, name: c.name, score };
      })
      .sort((a, b) => b.score - a.score);

    // console.log(ranked);

    if (!ranked.length || ranked[0].score < threshold) {
      return {
        slugs: [],
        options: ranked
          .slice(0, maxOptions)
          .map((r) => ({
            slug: r.slug,
            name: r.name,
            score: +r.score.toFixed(3),
          }))
          .filter((r) => r.score > 0),
      };
    }

    const [top, ...rest] = ranked;

    // console.log(top, "This is the top result");

    console.log(top.slug, "This is top slug category");

    const close = ranked
      .filter((r) => top.score - r.score < 0.08)
      .slice(0, maxOptions);
    if (close.length > 1) {
      return {
        slugs: [],
        options: close
          .map((r) => ({
            slug: r.slug,
            name: r.name,
            score: +r.score.toFixed(3),
          }))
          .filter((r) => r.score > 0),
      };
    }
    return { slugs: [top.slug] };
  },
});
