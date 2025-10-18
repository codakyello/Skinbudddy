// "use client";
// import { useEffect, useState } from "react";
// import { Box } from "@chakra-ui/react";
// import SkinQuiz, { QuizResult } from "./SkinQuiz";
// import ProductCard from "@/app/_components/ProductCard";
// import { useAction, useMutation } from "convex/react";
// import { api } from "@/convex/_generated/api";
// import { useUser } from "@/app/_contexts/CreateConvexUser";
// import type { Product } from "@/app/_utils/types";
// import type { Id } from "@/convex/_generated/dataModel";
// import { toast } from "sonner";
// import { useModal } from "@/app/_components/Modal";

// const STEP_ORDER: Record<string, number> = {
//   cleanser: 1,
//   toner: 2,
//   serum: 3,
//   moisturizer: 4,
//   sunscreen: 5,
// };

// const normalizeCategory = (value: string | undefined | null) => {
//   if (!value) return "";
//   const normalized = value.toLowerCase().trim();
//   if (normalized === "moisturiser") return "moisturizer";
//   if (normalized === "serums") return "serum";
//   return normalized;
// };

// const formatCategoryTitle = (category: string) =>
//   category
//     .split("-")
//     .map((part) =>
//       part.length ? part[0].toUpperCase() + part.slice(1) : part
//     )
//     .join(" ");

// export default function SkinRecommenderPage() {
//   const [result, setResult] = useState<QuizResult | null>(null);
//   const { user } = useUser();
//   const recommend = useAction(api.products.recommend);
//   const bulkAdd = useMutation(api.cart.bulkAddCartItems);
//   const [loading, setLoading] = useState(false);
//   const [error, setError] = useState<string | null>(null);
//   const [routineSteps, setRoutineSteps] = useState<RoutineStep[]>([]);
//   const [notes, setNotes] = useState<string>("");
//   const [addingAll, setAddingAll] = useState(false);
//   const { open } = useModal();

//   // Backend arg/response types
//   type BackendSkinType =
//     | "normal"
//     | "oily"
//     | "dry"
//     | "combination"
//     | "sensitive"
//     | "mature"
//     | "acne-prone"
//     | "all";
//   type BackendSkinConcern =
//     | "acne"
//     | "blackheads"
//     | "hyperpigmentation"
//     | "uneven-tone"
//     | "dryness"
//     | "oiliness"
//     | "redness"
//     | "sensitivity"
//     | "fine-lines"
//     | "wrinkles"
//     | "loss-of-firmness"
//     | "dullness"
//     | "sun-damage"
//     | "all";
//   type BackendIngredientSensitivity =
//     | "alcohol"
//     | "retinoids"
//     | "retinol"
//     | "niacinamide"
//     | "ahas-bhas"
//     | "vitamin-c"
//     | "essential-oils"
//     | "mandelic acid";
//   type RecommendArgs = {
//     userId: string;
//     skinType: BackendSkinType;
//     skinConcern: BackendSkinConcern[];
//     ingredientsToAvoid?: BackendIngredientSensitivity[];
//     fragranceFree?: boolean;
//   };
//   type RoutineRecommendation = {
//     category: string;
//     description: string;
//     productId: string;
//     product: Product;
//     order?: number;
//   };
//   type RoutineStep = {
//     step: number;
//     category: string;
//     title: string;
//     description: string;
//     productId: string;
//     product: Product;
//   };
//   type RecommendResponse =
//     | {
//         recommendations: RoutineRecommendation[];
//         notes: string;
//         routineId?: string;
//       }
//     | { success: false; message: string };

//   // Map quiz result to backend args
//   const buildArgs = (r: QuizResult): RecommendArgs => {
//     const mapConcern = (c: string): BackendSkinConcern | null => {
//       const map: Record<string, BackendSkinConcern> = {
//         acne: "acne",
//         blackheads: "blackheads",
//         hyperpigmentation: "hyperpigmentation",
//         uneven_tone: "uneven-tone",
//         redness: "redness",
//         dullness: "dullness",
//         dehydration: "dryness",
//         wrinkles: "wrinkles",
//         sun_damage: "sun-damage",
//         congestion: "acne",
//         eczema: "sensitivity",
//         texture: "uneven-tone",
//       };
//       return map[c] ?? null;
//     };
//     const mapSensitivity = (s: string): BackendIngredientSensitivity | null => {
//       const map: Record<string, BackendIngredientSensitivity> = {
//         essential_oils: "essential-oils",
//         ahas_bhas: "ahas-bhas",
//         vitamin_c: "vitamin-c",
//         alcohol: "alcohol",
//         retinoids: "retinoids",
//         niacinamide: "niacinamide",
//       };
//       return map[s] ?? null;
//     };
//     const skinConcern = r.concerns
//       .map((c) => mapConcern(c))
//       .filter((x): x is BackendSkinConcern => Boolean(x));
//     const ingredientsToAvoid = r.sensitivities
//       .map((s) => mapSensitivity(s))
//       .filter((x): x is BackendIngredientSensitivity => Boolean(x));

//     return {
//       userId: String(user?._id || "guest"),
//       skinType: r.skinType as BackendSkinType,
//       skinConcern,
//       ingredientsToAvoid,
//       fragranceFree: Boolean(r.preferences?.fragranceFree),
//     };
//   };

//   useEffect(() => {
//     const run = async () => {
//       if (!result) return;
//       // emptty previous array first
//       setRoutineSteps([]);
//       try {
//         setLoading(true);
//         setError(null);
//         const args = buildArgs(result);
//         const resp = (await recommend(args)) as RecommendResponse;
//         if ("success" in resp && resp.success === false) {
//           setError(resp.message || "Unable to generate recommendations.");
//           setRoutineSteps([]);
//           setNotes("");
//           return;
//         }

//         const recommendations = Array.isArray(resp.recommendations)
//           ? resp.recommendations
//           : [];

//         const ordered = recommendations
//           .slice()
//           .filter(
//             (rec): rec is RoutineRecommendation =>
//               Boolean(rec?.product) &&
//               Boolean(rec?.productId) &&
//               Boolean(normalizeCategory(rec?.category))
//           )
//           .sort((a, b) => {
//             const aCategory = normalizeCategory(a.category);
//             const bCategory = normalizeCategory(b.category);
//             const aOrder =
//               a.order ??
//               STEP_ORDER[aCategory] ??
//               (aCategory === "serum" ? STEP_ORDER.serum : 99);
//             const bOrder =
//               b.order ??
//               STEP_ORDER[bCategory] ??
//               (bCategory === "serum" ? STEP_ORDER.serum : 99);
//             return aOrder - bOrder;
//           });

//         const steps: RoutineStep[] = ordered.map((rec, index) => {
//           const category = normalizeCategory(rec.category);
//           const product = rec.product as Product;
//           const description =
//             typeof rec.description === "string" ? rec.description : "";
//           return {
//             step: index + 1,
//             category,
//             title: formatCategoryTitle(category),
//             description,
//             productId: rec.productId,
//             product,
//           };
//         });

//         setRoutineSteps(steps);
//         setNotes(
//           typeof resp.notes === "string" ? resp.notes.trim() : ""
//         );
//       } catch (e) {
//         const msg =
//           e instanceof Error ? e.message : "Failed to get recommendations";
//         setError(msg);
//         setRoutineSteps([]);
//         setNotes("");
//       } finally {
//         setLoading(false);
//       }
//     };
//     run();
//     // eslint-disable-next-line react-hooks/exhaustive-deps
//   }, [result]);

//   const handleAddAllToCart = async () => {
//     try {
//       if (!user?._id) {
//         toast.error("Please sign in to add items to cart.");
//         return;
//       }
//       if (!routineSteps.length) return;
//       setAddingAll(true);
//       const items = routineSteps
//         .map((step) => {
//           const product = step.product;
//           const sizes = Array.isArray(product.sizes) ? product.sizes : [];
//           const size = sizes.find((s) => (s?.stock ?? 0) > 0) || sizes[0];
//           if (!size?.id) return null;
//           return {
//             productId: product._id as Id<"products">,
//             sizeId: String(size.id),
//             quantity: 1,
//           };
//         })
//         .filter(Boolean) as {
//         productId: Id<"products">;
//         sizeId: string;
//         quantity: number;
//       }[];
//       if (!items.length) {
//         toast.error("No valid sizes found for these products.");
//         return;
//       }
//       type BulkAddResponse =
//         | {
//             success: true;
//             statusCode: 200;
//             message: string;
//             createdIds: string[];
//             updatedIds: string[];
//           }
//         | {
//             success: false;
//             statusCode: number;
//             message: string;
//             errors?: unknown[];
//           };
//       const res = (await bulkAdd({
//         userId: String(user._id),
//         items,
//       })) as BulkAddResponse;
//       if (!res.success) {
//         const msg = res.message || "Some items could not be added";
//         toast.error(msg);
//       } else {
//         const created = Array.isArray(res.createdIds)
//           ? res.createdIds.length
//           : 0;
//         const updated = Array.isArray(res.updatedIds)
//           ? res.updatedIds.length
//           : 0;
//         toast.success(`Added ${created + updated} item(s) to your cart.`);
//         open("cart");
//       }
//     } catch (e) {
//       const msg =
//         e instanceof Error ? e.message : "Failed to add items to cart";
//       toast.error(msg);
//     } finally {
//       setAddingAll(false);
//     }
//   };

//   return (
//     <Box className="px-[2rem] md:px-[5.6rem] py-10 md:py-16 min-h-[70vh] bg-[#fafafa]">
//       <Box className="max-w-[1100px] mx-auto">
//         <header className="mb-10 text-center">
//           <h1 className="text-4xl md:text-5xl font-bold font-dmSans">
//             Find Your Perfect Routine
//           </h1>
//           <p className="text-gray-600 mt-2 max-w-[680px] mx-auto">
//             Answer a few quick questions about your skin and goals. We’ll
//             recommend products that fit your skin type, concerns, and lifestyle.
//           </p>
//         </header>

//         {!result && <SkinQuiz onComplete={setResult} />}

//         {result && !loading && (
//           <Box className="space-y-8">
//             <Box className="rounded-lg border border-gray-200 bg-white p-6 md:p-8 shadow-sm">
//               <div className="flex items-start justify-between gap-4">
//                 <div>
//                   <h2 className="text-3xl md:text-4xl font-semibold">
//                     Your Recommendations
//                   </h2>
//                   <p className="text-gray-600 mt-1">Tailored by SkinBuddy AI</p>
//                 </div>
//                 <button
//                   onClick={() => setResult(null)}
//                   className="px-4 py-2 rounded-md border hover:bg-gray-50 text-2xl"
//                 >
//                   Retake Quiz
//                 </button>
//               </div>
//               {notes && (
//                 <p className="mt-8 text-2xl text-gray-700 whitespace-pre-wrap leading-relaxed">
//                   {notes}
//                 </p>
//               )}
//             </Box>

//             <Box>
//               <div className="flex items-center justify-between mb-4 gap-4">
//                 <h2 className="text-2xl font-semibold">Routine Steps</h2>
//                 {routineSteps.length > 0 && (
//                   <button
//                     onClick={handleAddAllToCart}
//                     disabled={addingAll}
//                     className={`px-4 py-2 rounded-md border text-2xl ${
//                       addingAll
//                         ? "opacity-50 cursor-not-allowed"
//                         : "hover:bg-gray-50"
//                     }`}
//                   >
//                     {addingAll ? "Adding…" : "Add All to Cart"}
//                   </button>
//                 )}
//               </div>

//               {error && !loading && <p className="text-red-600">{error}</p>}
//               {!loading && !error && routineSteps.length === 0 && (
//                 <p className="text-gray-600">
//                   We couldn’t match products yet. Try adjusting your answers.
//                 </p>
//               )}
//               <div className="flex flex-col gap-6">
//                 {routineSteps.map((step) => (
//                   <Box
//                     key={step.productId}
//                     className="rounded-2xl border border-gray-200 bg-white p-6 md:p-8 shadow-sm space-y-5"
//                   >
//                     <div className="flex flex-col gap-2">
//                       <span className="text-sm font-semibold uppercase tracking-wide text-[#5b4dbc]">
//                         Step {step.step}
//                       </span>
//                       <h3 className="text-2xl font-semibold text-[#1b1f26]">
//                         {step.title}
//                       </h3>
//                       {step.product?.name && (
//                         <p className="text-sm font-medium text-gray-500">
//                           Featured: {step.product.name}
//                         </p>
//                       )}
//                     </div>
//                     {step.description && (
//                       <p className="text-gray-600 text-lg leading-relaxed">
//                         {step.description}
//                       </p>
//                     )}
//                     <ProductCard product={step.product} inChat />
//                   </Box>
//                 ))}
//               </div>
//             </Box>
//           </Box>
//         )}

//         {loading && <p className="text-gray-600">Getting recommendations…</p>}
//       </Box>
//     </Box>
//   );
// }

export default function Page() {
  return <div></div>;
}
