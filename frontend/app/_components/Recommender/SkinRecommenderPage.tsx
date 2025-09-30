"use client";
import { useEffect, useState } from "react";
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

  console.log(topProducts);

  // Backend arg/response types
  type BackendSkinType =
    | "normal"
    | "oily"
    | "dry"
    | "combination"
    | "sensitive"
    | "mature"
    | "acne-prone"
    | "all";
  type BackendSkinConcern =
    | "acne"
    | "blackheads"
    | "hyperpigmentation"
    | "uneven-tone"
    | "dryness"
    | "oiliness"
    | "redness"
    | "sensitivity"
    | "fine-lines"
    | "wrinkles"
    | "loss-of-firmness"
    | "dullness"
    | "sun-damage"
    | "all";
  type BackendIngredientSensitivity =
    | "alcohol"
    | "retinoids"
    | "retinol"
    | "niacinamide"
    | "ahas-bhas"
    | "vitamin-c"
    | "essential-oils"
    | "mandelic acid";
  type RecommendArgs = {
    userId: string;
    skinType: BackendSkinType;
    skinConcern: BackendSkinConcern[];
    ingredientsToAvoid?: BackendIngredientSensitivity[];
    fragranceFree?: boolean;
  };
  type RecommendResponse =
    | { recommendations: Product[]; notes: string; routineId?: string }
    | { success: false; message: string };

  // Map quiz result to backend args
  const buildArgs = (r: QuizResult): RecommendArgs => {
    const mapConcern = (c: string): BackendSkinConcern | null => {
      const map: Record<string, BackendSkinConcern> = {
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
    const mapSensitivity = (s: string): BackendIngredientSensitivity | null => {
      const map: Record<string, BackendIngredientSensitivity> = {
        essential_oils: "essential-oils",
        ahas_bhas: "ahas-bhas",
        vitamin_c: "vitamin-c",
        alcohol: "alcohol",
        retinoids: "retinoids",
        niacinamide: "niacinamide",
      };
      return map[s] ?? null;
    };
    const skinConcern = r.concerns
      .map((c) => mapConcern(c))
      .filter((x): x is BackendSkinConcern => Boolean(x));
    const ingredientsToAvoid = r.sensitivities
      .map((s) => mapSensitivity(s))
      .filter((x): x is BackendIngredientSensitivity => Boolean(x));

    return {
      userId: String(user?._id || "guest"),
      skinType: r.skinType as BackendSkinType,
      skinConcern,
      ingredientsToAvoid,
      fragranceFree: Boolean(r.preferences?.fragranceFree),
    };
  };

  useEffect(() => {
    const run = async () => {
      if (!result) return;
      // emptty previous array first
      setTopProducts([]);
      try {
        setLoading(true);
        setError(null);
        const args = buildArgs(result);
        const resp = (await recommend(args)) as RecommendResponse;
        const recs: Product[] =
          resp &&
          "recommendations" in resp &&
          Array.isArray(resp.recommendations)
            ? resp.recommendations
            : [];
        setTopProducts(recs);
        setNotes(
          resp && "notes" in resp && typeof resp.notes === "string"
            ? resp.notes
            : ""
        );
      } catch (e) {
        const msg =
          e instanceof Error ? e.message : "Failed to get recommendations";
        setError(msg);
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
        .filter(Boolean) as {
        productId: Id<"products">;
        sizeId: string;
        quantity: number;
      }[];
      if (!items.length) {
        toast.error("No valid sizes found for these products.");
        return;
      }
      type BulkAddResponse =
        | {
            success: true;
            statusCode: 200;
            message: string;
            createdIds: string[];
            updatedIds: string[];
          }
        | {
            success: false;
            statusCode: number;
            message: string;
            errors?: unknown[];
          };
      const res = (await bulkAdd({
        userId: String(user._id),
        items,
      })) as BulkAddResponse;
      if (!res.success) {
        const msg = res.message || "Some items could not be added";
        toast.error(msg);
      } else {
        const created = Array.isArray(res.createdIds)
          ? res.createdIds.length
          : 0;
        const updated = Array.isArray(res.updatedIds)
          ? res.updatedIds.length
          : 0;
        toast.success(`Added ${created + updated} item(s) to your cart.`);
        open("cart");
      }
    } catch (e) {
      const msg =
        e instanceof Error ? e.message : "Failed to add items to cart";
      toast.error(msg);
    } finally {
      setAddingAll(false);
    }
  };

  return (
    <Box className="px-[2rem] md:px-[5.6rem] py-10 md:py-16 min-h-[70vh] bg-[#fafafa]">
      <Box className="max-w-[1100px] mx-auto">
        <header className="mb-10 text-center">
          <h1 className="text-4xl md:text-5xl font-bold font-dmSans">
            Find Your Perfect Routine
          </h1>
          <p className="text-gray-600 mt-2 max-w-[680px] mx-auto">
            Answer a few quick questions about your skin and goals. We’ll
            recommend products that fit your skin type, concerns, and lifestyle.
          </p>
        </header>

        {!result && <SkinQuiz onComplete={setResult} />}

        {result && !loading && (
          <Box className="space-y-8">
            <Box className="rounded-lg border border-gray-200 bg-white p-6 md:p-8 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-3xl md:text-4xl font-semibold">
                    Your Recommendations
                  </h2>
                  <p className="text-gray-600 mt-1">Tailored by SkinBuddy AI</p>
                </div>
                <button
                  onClick={() => setResult(null)}
                  className="px-4 py-2 rounded-md border hover:bg-gray-50 text-2xl"
                >
                  Retake Quiz
                </button>
              </div>
              {notes && (
                <p className="mt-8 text-2xl text-gray-700 whitespace-pre-wrap leading-relaxed">
                  {notes}
                </p>
              )}
            </Box>

            <Box>
              <div className="flex items-center justify-between mb-4 gap-4">
                <h2 className="text-2xl font-semibold">Recommended Products</h2>
                {topProducts.length > 0 && (
                  <button
                    onClick={handleAddAllToCart}
                    disabled={addingAll}
                    className={`px-4 py-2 rounded-md border text-2xl ${
                      addingAll
                        ? "opacity-50 cursor-not-allowed"
                        : "hover:bg-gray-50"
                    }`}
                  >
                    {addingAll ? "Adding…" : "Add All to Cart"}
                  </button>
                )}
              </div>

              {error && !loading && <p className="text-red-600">{error}</p>}
              {!loading && !error && topProducts.length === 0 && (
                <p className="text-gray-600">
                  We couldn’t match products yet. Try adjusting your answers.
                </p>
              )}
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                {topProducts.map((p) => (
                  <ProductCard
                    key={String(p._id ?? p.slug ?? p.name)}
                    product={p}
                  />
                ))}
              </div>
            </Box>
          </Box>
        )}

        {loading && <p className="text-gray-600">Getting recommendations…</p>}
      </Box>
    </Box>
  );
}
