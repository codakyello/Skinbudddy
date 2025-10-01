"use client";
import { Box } from "@chakra-ui/react";
import Image from "next/image";
import { algoliasearch } from "algoliasearch";
import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { Hit, SearchResponse } from "@algolia/client-search";
import { Size } from "../_utils/types";

interface ProductHit extends Hit<Record<string, unknown>> {
  objectID: string;
  _id?: string;
  name?: string;
  price?: number;
  images?: string[];
  sizes?: Size[];
}

const appID = process.env.NEXT_PUBLIC_ALGOLIA_APP_ID;
const apiKey = process.env.NEXT_PUBLIC_ALGOLIA_SEARCH_API_KEY;
const indexName = "products_index";

const priceFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "NGN",
  maximumFractionDigits: 0,
});

const fallbackImage = "/images/product.jpg";

export default function Search() {
  const client = useMemo(() => {
    if (!appID || !apiKey) {
      return null;
    }

    return algoliasearch(appID, apiKey);
  }, []);

  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<ProductHit[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const requestIdRef = useRef(0);

  function handleSearchInput(e: ChangeEvent<HTMLInputElement>) {
    setQuery(e.currentTarget.value);
  }

  useEffect(() => {
    const trimmedQuery = query.trim();

    if (!trimmedQuery) {
      setResults([]);
      setError(null);
      setLoading(false);
      setHasSearched(false);
      return;
    }

    if (!client) {
      setResults([]);
      setLoading(false);
      setHasSearched(true);
      setError("Search is unavailable right now.");
      return;
    }

    const requestId = ++requestIdRef.current;

    setHasSearched(true);
    setLoading(true);
    setError(null);

    const timer = setTimeout(() => {
      client
        .searchSingleIndex<ProductHit>({
          indexName,
          searchParams: {
            query: trimmedQuery,
            hitsPerPage: 12,
          },
        })
        .then((response: SearchResponse<ProductHit>) => {
          if (requestIdRef.current !== requestId) return;

          setResults(response.hits);
        })
        .catch((err: unknown) => {
          if (err instanceof Error)
            if (requestIdRef.current !== requestId) return;

          console.error("Search request failed", err);
          setResults([]);
          setError("We couldn't load results. Try again.");
        })
        .finally(() => {
          if (requestIdRef.current !== requestId) return;

          setLoading(false);
        });
    }, 350);

    return () => {
      clearTimeout(timer);
    };
  }, [client, query]);

  const showResultsPanel = loading || error || hasSearched;

  return (
    <Box className="relative w-full">
      <Box className="relative flex items-center">
        <span className="pointer-events-none absolute left-6 flex h-full items-center text-neutral-400">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth="1.5"
            stroke="currentColor"
            className="h-5 w-5"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M21 21l-4.35-4.35m0 0A7.5 7.5 0 1010.5 18a7.5 7.5 0 006.15-3.35z"
            />
          </svg>
        </span>
        <input
          type="search"
          value={query}
          onChange={handleSearchInput}
          placeholder="Search products, concerns, ingredients..."
          className="w-full h-[3.4rem] rounded-full border border-black/5 bg-[#F6F6F8] pl-14 pr-6 text-[1.6px] font-medium text-neutral-900 outline-none transition focus:border-black focus:bg-white focus:shadow-lg"
          aria-label="Search"
        />
      </Box>

      {showResultsPanel && (
        <Box className="absolute left-0 right-0 top-[4.4rem] z-50 mt-4 overflow-hidden rounded-3xl border border-black/5 bg-white/95 shadow-2xl backdrop-blur-lg">
          <Box className="px-6 py-5">
            {loading && (
              <Box className="flex flex-col items-center gap-4 py-8 text-neutral-500">
                <span className="h-10 w-10 animate-spin rounded-full border-4 border-black/10 border-t-black" />
                <span className="text-[1.4rem] font-medium">Searching…</span>
              </Box>
            )}

            {!loading && error && (
              <Box className="py-8 text-center text-[1.4rem] font-medium text-red-500">
                {error}
              </Box>
            )}

            {!loading && !error && results.length === 0 && hasSearched && (
              <Box className="py-8 text-center text-[1.4rem] text-neutral-500">
                No matches for
                <span className="font-semibold text-neutral-800">
                  {" "}
                  {query.trim()}
                </span>
                . Try a different term.
              </Box>
            )}

            {!loading && !error && results.length > 0 && (
              <Box className="grid gap-4 ">
                {results.map((product, index) => {
                  const imageSrc = product.images?.[0] || fallbackImage;
                  const priceLabel =
                    typeof product.sizes?.at(0)?.price === "number"
                      ? priceFormatter.format(product.sizes[0].price as number)
                      : null;
                  const sizeLabels =
                    product.sizes && product.sizes.length > 0
                      ? product.sizes
                          .map((size) => {
                            if (!size) return null;

                            return (
                              size.name ||
                              [size.size, size.unit]
                                .filter(
                                  (value) =>
                                    value !== undefined &&
                                    value !== null &&
                                    value !== ""
                                )
                                .join(" ")
                            );
                          })
                          .filter((value): value is string => Boolean(value))
                          .join(", ")
                      : null;

                  return (
                    <Box
                      key={
                        product.objectID ??
                        product._id ??
                        `${index}-${imageSrc}`
                      }
                      className="group flex gap-4 rounded-2xl border border-transparent bg-neutral-50/80 p-4 transition hover:border-black/10 hover:bg-white"
                    >
                      <Box className="relative h-20 w-20 flex-shrink-0 overflow-hidden rounded-2xl bg-neutral-200">
                        <Image
                          src={imageSrc}
                          alt={product.name ?? "Product"}
                          fill
                          unoptimized
                          className="object-cover transition duration-500 group-hover:scale-105"
                          sizes="80px"
                        />
                      </Box>

                      <Box className="flex min-w-0 flex-1 flex-col justify-center">
                        <span className="truncate text-[1.4rem] flex-wrap flex font-semibold text-neutral-900">
                          {product.name ?? "Untitled product"}
                        </span>
                        {priceLabel && (
                          <span className="text-[1.3rem] font-medium text-neutral-600">
                            {priceLabel}
                          </span>
                        )}
                        {sizeLabels && (
                          <span className="text-[1.2rem] text-neutral-500">
                            Sizes:
                            <span className="font-medium text-neutral-700">
                              {" "}
                              {sizeLabels}
                            </span>
                          </span>
                        )}
                      </Box>
                    </Box>
                  );
                })}
              </Box>
            )}
          </Box>
        </Box>
      )}
    </Box>
  );
}
