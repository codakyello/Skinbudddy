"use client";
import { useEffect, useMemo, useState } from "react";
import { Box } from "@chakra-ui/react";
import SkinQuiz, { QuizResult } from "./SkinQuiz";
import ProductCard from "@/app/_components/ProductCard";
import { useAction, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useUser } from "@/app/_contexts/CreateConvexUser";
import type { Product } from "@/app/_utils/types";
import type { Id } from "@/convex/_generated/dataModel";
import { toast } from "sonner";
import { useModal } from "@/app/_components/Modal";

export default function SkinRecommenderPage() {
  const [result, setResult] = useState<QuizResult | null>(null);
  const { user } = useUser();
  const recommend = useAction(api.products.recommend);
  const bulkAdd = useMutation(api.cart.bulkAddCartItems);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [topProducts, setTopProducts] = useState<Product[]>([]);
  const [notes, setNotes] = useState<string>("");
  const [addingAll, setAddingAll] = useState(false);
  const { open } = useModal();

  // Map quiz result to backend args
  const buildArgs = (r: QuizResult) => {
    const mapConcern = (c: string): string | null => {
      // Map frontend concerns to backend schema values
      const map: Record<string, string> = {
        acne: "acne",
        blackheads: "blackheads",
        hyperpigmentation: "hyperpigmentation",
        uneven_tone: "uneven-tone",
        redness: "redness",
        dullness: "dullness",
        dehydration: "dryness",
        wrinkles: "wrinkles",
        sun_damage: "sun-damage",
        congestion: "acne",
        eczema: "sensitivity",
        texture: "uneven-tone",
      };
      return map[c] ?? null;
    };
    const mapSensitivity = (s: string): string | null => {
      const map: Record<string, string> = {
        essential_oils: "essential-oils",
        ahas_bhas: "ahas-bhas",
        vitamin_c: "vitamin-c",
        alcohol: "alcohol",
        retinoids: "retinoids",
        niacinamide: "niacinamide",
        // fragrance handled via fragranceFree flag
      };
      return map[s] ?? null;
    };
    const skinConcern = r.concerns
      .map((c) => mapConcern(c))
      .filter(Boolean) as string[];
    const ingredientsToAvoid = r.sensitivities
      .map((s) => mapSensitivity(s))
      .filter(Boolean) as string[];

    return {
      userId: String(user?._id || "guest"),
      skinType: r.skinType as any,
      skinConcern: skinConcern as any,
      ingredientsToAvoid: ingredientsToAvoid as any,
      fragranceFree: Boolean(r.preferences?.fragranceFree),
    };
  };

  useEffect(() => {
    const run = async () => {
      if (!result) return;
      try {
        setLoading(true);
        setError(null);
        const args = buildArgs(result);
        const resp: any = await recommend(args as any);
        const recs: Product[] = Array.isArray(resp?.recommendations)
          ? (resp.recommendations as Product[])
          : [];
        setTopProducts(recs);
        setNotes(typeof resp?.notes === "string" ? resp.notes : "");
      } catch (e: any) {
        setError(e?.message || "Failed to get recommendations");
        setTopProducts([]);
        setNotes("");
      } finally {
        setLoading(false);
      }
    };
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result]);

  const handleAddAllToCart = async () => {
    try {
      if (!user?._id) {
        toast.error("Please sign in to add items to cart.");
        return;
      }
      if (!topProducts.length) return;
      setAddingAll(true);
      const items = topProducts
        .map((p) => {
          const sizes = Array.isArray(p.sizes) ? p.sizes : [];
          const size = sizes.find((s) => (s?.stock ?? 0) > 0) || sizes[0];
          if (!size?.id) return null;
          return {
            productId: p._id as Id<"products">,
            sizeId: String(size.id),
            quantity: 1,
          };
        })
        .filter(Boolean) as { productId: Id<"products">; sizeId: string; quantity: number }[];
      if (!items.length) {
        toast.error("No valid sizes found for these products.");
        return;
      }
      const res: any = await bulkAdd({ userId: String(user._id), items });
      if (!res?.success) {
        const msg = res?.message || "Some items could not be added";
        toast.error(msg);
      } else {
        const created = Array.isArray(res?.createdIds) ? res.createdIds.length : 0;
        const updated = Array.isArray(res?.updatedIds) ? res.updatedIds.length : 0;
        toast.success(`Added ${created + updated} item(s) to your cart.`);
        open("cart");
      }
    } catch (e: any) {
      toast.error(e?.message || "Failed to add items to cart");
    } finally {
      setAddingAll(false);
    }
  };

  return (
    <Box className="px-[2rem] md:px-[5.6rem] py-10 md:py-16 min-h-[70vh] bg-[#fafafa]">
      <Box className="max-w-[1100px] mx-auto">
        <header className="mb-10 text-center">
          <h1 className="text-3xl md:text-4xl font-bold font-dmSans">Find Your Perfect Routine</h1>
          <p className="text-gray-600 mt-2 max-w-[680px] mx-auto">
            Answer a few quick questions about your skin and goals. We’ll recommend products that fit your skin type, concerns, and lifestyle.
          </p>
        </header>

        {!result && <SkinQuiz onComplete={setResult} />}

        {result && (
          <Box className="space-y-8">
            <Box className="rounded-lg border border-gray-200 bg-white p-6 md:p-8 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-semibold">Your Recommendations</h2>
                  <p className="text-gray-600 mt-1">Tailored by SkinBuddy AI</p>
                </div>
                <button
                  onClick={() => setResult(null)}
                  className="px-4 py-2 rounded-md border hover:bg-gray-50 text-sm"
                >
                  Retake Quiz
                </button>
              </div>
              {notes && (
                <p className="mt-4 text-sm text-gray-700 whitespace-pre-wrap">{notes}</p>
              )}
            </Box>

            <Box>
              <div className="flex items-center justify-between mb-4 gap-4">
                <h2 className="text-2xl font-semibold">Recommended Products</h2>
                {topProducts.length > 0 && (
                  <button
                    onClick={handleAddAllToCart}
                    disabled={addingAll}
                    className={`px-4 py-2 rounded-md border text-sm ${
                      addingAll ? "opacity-50 cursor-not-allowed" : "hover:bg-gray-50"
                    }`}
                  >
                    {addingAll ? "Adding…" : "Add All to Cart"}
                  </button>
                )}
              </div>
              {loading && <p className="text-gray-600">Getting recommendations…</p>}
              {error && !loading && (
                <p className="text-red-600">{error}</p>
              )}
              {!loading && !error && topProducts.length === 0 && (
                <p className="text-gray-600">We couldn’t match products yet. Try adjusting your answers.</p>
              )}
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                {topProducts.map((p) => (
                  <ProductCard key={String(p._id ?? p.slug ?? p.name)} product={p} />
                ))}
              </div>
            </Box>
          </Box>
        )}
      </Box>
    </Box>
  );
}
