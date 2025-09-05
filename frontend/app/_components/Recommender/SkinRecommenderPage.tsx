"use client";
import { useMemo, useState } from "react";
import { Box } from "@chakra-ui/react";
import SkinQuiz, { QuizResult } from "./SkinQuiz";
import useProducts from "@/app/_hooks/useProducts";
import { Product } from "@/app/_utils/types";
import ProductCard from "@/app/_components/ProductCard";
import { buildRoutine, scoreProducts, ScoredProduct } from "@/app/_utils/recommender";

type Routine = ReturnType<typeof buildRoutine>;

export default function SkinRecommenderPage() {
  const [result, setResult] = useState<QuizResult | null>(null);
  const { products, isPending } = useProducts({ filters: {}, limit: 200 });

  const memo = useMemo<{ topProducts: ScoredProduct[]; routine: Routine | null }>(() => {
    if (!result || !products) return { topProducts: [], routine: null };
    const scored = scoreProducts((products as Product[]) || [], result);
    return { topProducts: scored.slice(0, 12), routine: buildRoutine(result) };
  }, [result, products]);
  const { topProducts, routine } = memo;

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
                  <h2 className="text-2xl font-semibold">Your Routine Outline</h2>
                  <p className="text-gray-600 mt-1">Tailored to your profile</p>
                </div>
                <button
                  onClick={() => setResult(null)}
                  className="px-4 py-2 rounded-md border hover:bg-gray-50 text-sm"
                >
                  Retake Quiz
                </button>
              </div>

              {routine && (
                <div className="mt-6 grid md:grid-cols-3 gap-6">
                  <div>
                    <h3 className="text-sm font-semibold text-gray-800 uppercase tracking-wide mb-3">
                      Steps
                    </h3>
                    <ul className="space-y-2">
                      {routine.steps.map((s, i: number) => (
                        <li key={i} className="text-sm flex items-start gap-2">
                          <span className="mt-1 w-1.5 h-1.5 bg-black rounded-full"></span>
                          <span>
                            <span className="font-medium">{s.step}</span>
                            {s.note && <span className="text-gray-600"> — {s.note}</span>}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-gray-800 uppercase tracking-wide mb-3">
                      Focus Ingredients
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {routine.highlight.map((h: string) => (
                        <span key={h} className="text-xs px-2 py-1 rounded-full border bg-gray-50">
                          {h}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-gray-800 uppercase tracking-wide mb-3">
                      Avoid
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {routine.avoid.length > 0 ? (
                        routine.avoid.map((a: string) => (
                          <span key={a} className="text-xs px-2 py-1 rounded-full border bg-red-50 text-red-700 border-red-200">
                            {a}
                          </span>
                        ))
                      ) : (
                        <span className="text-sm text-gray-600">None</span>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </Box>

            <Box>
              <h2 className="text-2xl font-semibold mb-4">Recommended Products</h2>
              {isPending && (
                <p className="text-gray-600">Loading products…</p>
              )}
              {!isPending && topProducts.length === 0 && (
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
