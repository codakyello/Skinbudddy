"use client";
import { Box } from "@chakra-ui/react";
import { IoCloseOutline } from "react-icons/io5";
import { useUser } from "../_contexts/CreateConvexUser";
import useUserCart, { CartEntry } from "../_hooks/useUserCart";
import { useEffect, useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { useMutation } from "convex/react";
import { toast } from "sonner";
import AppError from "../_utils/appError";
import { formatPrice } from "../_utils/utils";
import { Product, Size, Brand } from "../_utils/types";

// type Essentials =
//   | false
//   | {
//       cleanser?: any[];
//       moisturizer?: any[];
//       sunscreen?: any[];
//     };

type EssentialsProduct = Product & { brand?: Brand | null };

// Type guard for EssentialsProduct
function isEssentialsProduct(
  product: Product | null | undefined
): product is EssentialsProduct {
  return (
    product !== null &&
    product !== undefined &&
    typeof product === "object" &&
    "canBeInRoutine" in product &&
    Boolean(product.canBeInRoutine)
  );
}

export function RoutineSuggestionsModal({
  onClose,
  handleSkip,
}: {
  onClose?: () => void;
  handleSkip?: () => void;
}) {
  const { user } = useUser();
  const { cart } = useUserCart(user._id as string);
  // Build a stable list of selected product IDs from the cart
  const selectedProductIds = useMemo<Id<"products">[]>(() => {
    return cart
      .map((item: CartEntry) => item.product?._id)
      .filter((id): id is Id<"products"> => Boolean(id));
  }, [cart]);

  // --- Routine message helpers ---
  type RoutineCategory = "cleanser" | "moisturizer" | "sunscreen";
  const SECTIONS: RoutineCategory[] = ["cleanser", "moisturizer", "sunscreen"];

  // Heuristic category inference from product data
  function inferRoutineCategory(
    p?: EssentialsProduct | null
  ): RoutineCategory | null {
    const hay = `${p?.name ?? ""} ${p?.category ?? ""}`.toLowerCase();
    if (/(cleanser|face wash|gel wash|micellar)/.test(hay)) return "cleanser";
    if (/(moistur|cream|lotion|hydrating)/.test(hay)) return "moisturizer";
    if (/(sunscreen|spf|sun screen|uv)/.test(hay)) return "sunscreen";
    return null;
  }

  function formatList(list: string[]) {
    if (list.length === 0) return "";
    if (list.length === 1) return list[0];
    return `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}`;
  }

  // Pull routine-capable items from cart
  const allProductsInCart = cart.map((item: CartEntry) => item.product);

  const routineCartProducts: EssentialsProduct[] = (
    allProductsInCart.filter((p) => p !== null && p !== undefined) as Product[]
  ).filter(isEssentialsProduct);

  // Track which routine categories are already present
  const presentCats = new Set<RoutineCategory>();
  routineCartProducts.forEach((p) => {
    const c = inferRoutineCategory(p);
    if (c) presentCats.add(c);
  });

  // Choose one headline product to mention
  const headline = routineCartProducts[0];
  const headlineCat = inferRoutineCategory(headline);
  const missing = SECTIONS.filter((c) => !presentCats.has(c));

  const pickedLabel = [headline?.brand?.name, headline?.name]
    .filter(Boolean)
    .join(" ")
    .trim();

  const message = headline
    ? pickedLabel
      ? `We noticed you picked ${pickedLabel}${headlineCat ? ` — a solid ${headlineCat}.` : "."} Add ${formatList(missing)} to complete a routine.`
      : `Nice pick for your routine. Add ${formatList(missing)} to complete it.`
    : `Build a simple, effective routine: ${formatList(SECTIONS)} — quick picks to get you started.`;

  type EssentialsResponse =
    | Record<RoutineCategory, EssentialsProduct[]>
    | false;
  const essentialsQuery = useQuery(
    convexQuery(api.products.getEssentialProducts, {
      selectedProductIds,
      perCategory: 10,
    })
  );
  const essentials = essentialsQuery.data as EssentialsResponse | undefined;

  const addToCart = useMutation(api.cart.createCart);
  const [selectedSizeByProduct, setSelectedSizeByProduct] = useState<
    Record<string, string | undefined>
  >({});
  const [addingId, setAddingId] = useState<string | null>(null);

  const resolveSelectedSizeId = (p: EssentialsProduct) => {
    const key = String(p?._id ?? "");
    const explicit = selectedSizeByProduct[key];
    if (explicit) return explicit;
    const first = Array.isArray(p?.sizes) ? p.sizes[0]?.id : undefined;
    return first;
  };

  const handleSizeChange = (pid: string, sid: string) => {
    setSelectedSizeByProduct((m) => ({ ...m, [pid]: sid }));
  };

  const handleAdd = async (p: EssentialsProduct) => {
    try {
      const productId = String(p?._id ?? "");
      const sizeId = resolveSelectedSizeId(p);
      if (!user?._id) throw new AppError("You need to be signed in");
      if (!productId || !sizeId) throw new AppError("Size unavailable");
      setAddingId(productId);
      const res = await addToCart({
        sizeId,
        userId: user._id,
        productId: p._id as Id<"products">,
        quantity: 1,
      });
      if (!res?.success) throw new AppError(res?.message as string);
      // toast.success("Added to cart");
    } catch (err) {
      if (err instanceof AppError) toast.error(err.message);
      else toast.error("Something went wrong");
    } finally {
      setAddingId(null);
    }
  };

  const sections = [
    { key: "cleanser", title: "Cleanser" },
    { key: "moisturizer", title: "Moisturizer" },
    { key: "sunscreen", title: "Sunscreen" },
  ] as const;

  useEffect(() => {
    if (!essentials) {
      onClose?.();
    }
  }, [essentials, onClose]);

  if (essentials === false) return null;
  if (!essentials) return null;

  return (
    <Box className="relative flex flex-col z-[20] w-full h-full bg-white rounded-[1.2rem] shadow-2xl overflow-hidden">
      <button
        onClick={() => {
          handleSkip?.();
          onClose?.();
        }}
        className="absolute top-[1.2rem] right-[1.2rem] p-[0.6rem] rounded hover:bg-gray-100"
        aria-label="Close"
      >
        <IoCloseOutline className="h-[3rem] w-[3rem]" />
      </button>

      <Box className="h-auto p-[2rem] border-b border-gray-200">
        <h3 className="text-[2rem] font-semibold">Complete your routine</h3>
        <p className="text-[1.4rem] text-gray-600 mt-[0.6rem]">{message}</p>
      </Box>

      <Box className="h-full overflow-auto p-[2rem] grid gap-[2rem]">
        {sections.map((s) => {
          const raw = essentials?.[s.key];
          const items: EssentialsProduct[] = Array.isArray(raw) ? raw : [];
          if (items.length === 0) return null;

          return (
            <Box key={s.key} className="">
              <h4 className="text-[1.6rem] font-medium mb-[1.2rem]">
                {s.title}
              </h4>
              <Box className="grid gap-[1.6rem] sm:grid-cols-2 md:grid-cols-3">
                {items.slice(0, 6).map((p: EssentialsProduct) => {
                  const pid = String(p?._id ?? "");
                  const sizes: Size[] = Array.isArray(p?.sizes) ? p.sizes : [];
                  const selId = resolveSelectedSizeId(p);
                  const sel = sizes.find((s: Size) => s?.id === selId);
                  const basePrice = sel?.price ?? 0;
                  const discount = sel?.discount ?? 0;
                  const isDiscounted = discount > 0;
                  const finalPrice = basePrice - discount;
                  return (
                    <Box
                      key={pid}
                      className="flex flex-col rounded-[1.2rem] overflow-hidden border border-gray-200 bg-white"
                    >
                      <div className="w-full aspect-square bg-gray-50 flex items-center justify-center overflow-hidden">
                        {Array.isArray(p?.images) && p.images[0] ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={p.images[0]}
                            alt={p?.name ?? "Product"}
                            className="w-full h-full object-contain"
                          />
                        ) : (
                          <span className="text-gray-300 text-[1.6rem]">—</span>
                        )}
                      </div>
                      <div className="p-[1.2rem] flex flex-col gap-[0.8rem]">
                        <p className="text-[1.4rem] font-semibold line-clamp-2 min-h-[3.6rem]">
                          {p?.name ?? "Unnamed"}
                        </p>
                        <p className="text-[1.2rem] text-gray-500">
                          {p?.brand?.name ?? ""}
                        </p>
                        {sizes.length > 1 ? (
                          <select
                            className="h-[3.6rem] border border-gray-300 rounded-md px-[0.8rem] text-[1.3rem]"
                            value={selId}
                            onChange={(e) =>
                              handleSizeChange(pid, e.target.value)
                            }
                          >
                            {sizes.map((s: Size) => (
                              <option key={s.id} value={s.id}>
                                {s.size} {s.unit}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <p className="text-[1.2rem] text-gray-600">
                            {sizes[0]?.size} {sizes[0]?.unit}
                          </p>
                        )}
                        <div className="flex items-center gap-[0.8rem] text-[1.3rem]">
                          <span
                            className={`${isDiscounted ? "line-through text-gray-400" : "text-gray-900"}`}
                          >
                            {formatPrice(basePrice)}
                          </span>
                          {isDiscounted && (
                            <>
                              <span className="text-gray-900 font-semibold">
                                {formatPrice(finalPrice)}
                              </span>
                              <span className="text-red-500 font-medium">
                                {Math.round((discount / basePrice) * 100)}% off
                              </span>
                            </>
                          )}
                        </div>
                        <button
                          onClick={() => handleAdd(p)}
                          disabled={addingId === pid}
                          className="mt-[0.4rem] h-[3.6rem] rounded-md border border-gray-300 hover:border-black hover:bg-black hover:text-white transition-colors text-[1.3rem]"
                        >
                          {addingId === pid ? "Adding…" : "Add to cart"}
                        </button>
                      </div>
                    </Box>
                  );
                })}
              </Box>
            </Box>
          );
        })}
      </Box>

      <Box className="p-[2rem] h-auto  border-t border-gray-200 flex gap-[1rem] justify-end">
        <button
          onClick={() => {
            handleSkip?.();
            onClose?.();
          }}
          className="px-[1.6rem] py-[0.8rem] rounded-md border border-gray-300 hover:border-black hover:bg-black hover:text-white text-[1.4rem]"
        >
          Skip and checkout
        </button>
        <button
          onClick={onClose}
          className="px-[1.6rem] py-[0.8rem] rounded-md border border-gray-300 hover:bg-gray-100 text-[1.4rem]"
        >
          Close
        </button>
      </Box>
    </Box>
  );
}
