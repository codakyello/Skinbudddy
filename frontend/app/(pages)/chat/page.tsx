/* eslint-disable react-hooks/exhaustive-deps */
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { ArrowUpRight } from "lucide-react";
import { useUser } from "@/app/_contexts/CreateConvexUser";
import ProductCard from "@/app/_components/ProductCard";
import type { Product, Size } from "@/app/_utils/types";
import { Box } from "@chakra-ui/react";

const TOPICS = ["Dry Skin", "Acne Care", "Anti-Aging", "SPF Routine"];

const SUGGESTIONS = [
  "Recommend a gentle cleanser for sensitive skin",
  "Which sunscreen works best under makeup?",
  "Help me build an evening routine for acne",
  "How do I layer vitamin C and retinol safely?",
];

type ChatRole = "assistant" | "user";

type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
  products?: Product[];
};

const MAX_INPUT_LENGTH = 600;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const coerceId = (value: unknown): string | undefined => {
  if (typeof value === "string") return value;
  if (isRecord(value)) {
    if (typeof value.id === "string") return value.id;
    if (typeof value._id === "string") return value._id;
  }
  return value != null ? String(value) : undefined;
};

const normalizeNumber = (value: unknown): number | undefined => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
};

const normalizeSize = (input: unknown): Size | null => {
  if (!isRecord(input)) return null;
  const id = coerceId(input.id ?? input._id ?? input.value);
  if (!id || id === "[object Object]") return null;
  const price = normalizeNumber(input.price) ?? 0;
  const sizeValue = normalizeNumber(input.size) ?? 0;
  const unit = typeof input.unit === "string" ? input.unit : "";
  const stock = normalizeNumber(input.stock);
  const discount = normalizeNumber(input.discount);
  const name =
    typeof input.name === "string"
      ? input.name
      : typeof input.label === "string"
        ? input.label
        : undefined;

  return {
    id,
    price,
    size: sizeValue,
    unit,
    stock,
    discount,
    name,
  };
};

const mapToolProductToProduct = (input: unknown): Product | null => {
  if (!isRecord(input)) return null;
  const source = isRecord(input.product) ? input.product : input;

  if (!isRecord(source)) return null;

  const _id = coerceId(source.id ?? source._id);
  if (!_id || _id === "[object Object]") return null;
  const slug = typeof source.slug === "string" ? source.slug : undefined;
  const name = typeof source.name === "string" ? source.name : undefined;
  const description =
    typeof source.description === "string" ? source.description : undefined;

  const images = Array.isArray(source.images)
    ? source.images.filter((img): img is string => typeof img === "string")
    : undefined;

  const sizes = Array.isArray(source.sizes)
    ? source.sizes
        .map((sizeItem) => normalizeSize(sizeItem))
        .filter((size): size is Size => Boolean(size))
    : undefined;

  const ingredients = Array.isArray(source.ingredients)
    ? source.ingredients.filter(
        (ingredient): ingredient is string => typeof ingredient === "string"
      )
    : undefined;

  const concerns = Array.isArray(source.concerns)
    ? source.concerns
        .map((concern) =>
          typeof concern === "string" ? concern : String(concern ?? "")
        )
        .filter((concern) => concern.length > 0)
    : undefined;

  const skinType = Array.isArray(source.skinType)
    ? source.skinType
        .map((type) => (typeof type === "string" ? type : String(type ?? "")))
        .filter((type) => type.length > 0)
    : undefined;

  return {
    _id,
    slug,
    name,
    description,
    images,
    sizes,
    ingredients,
    concerns,
    skinType,
  };
};

const normalizeProductArray = (items: unknown[]): Product[] => {
  const byId = new Map<string, Product>();
  items.forEach((raw, index) => {
    const product = mapToolProductToProduct(raw);
    if (!product) return;
    const key = String(product._id ?? product.slug ?? index);
    if (!key || key === "[object Object]" || byId.has(key)) return;
    byId.set(key, product);
  });
  return Array.from(byId.values());
};

// const extractProductsFromToolOutputs = (outputs: unknown): Product[] => {
//   if (!Array.isArray(outputs)) return [];
//   const candidateKeys = ["products", "results", "items", "recommendations"];
//   const collected: Product[] = [];

//   outputs.forEach((output) => {
//     if (!isRecord(output)) return;
//     const result = isRecord(output.result) ? output.result : null;
//     if (!result) return;

//     candidateKeys.forEach((key) => {
//       const value = result[key as keyof typeof result];
//       if (!Array.isArray(value)) return;
//       collected.push(...normalizeProductArray(value));
//     });
//   });

//   return normalizeProductArray(collected);
// };

export default function ChatPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showTyping, setShowTyping] = useState(false);
  const scrollAnchorRef = useRef<HTMLDivElement | null>(null);
  const { user } = useUser();

  // console.log(messages, "This are the mark ups");

  const markdownComponents: Components = useMemo(
    () => ({
      h1: ({ children }) => (
        <h1 className="text-[18px] font-semibold text-[#311d60]">{children}</h1>
      ),
      h2: ({ children }) => (
        <h2 className="text-[16px] font-semibold text-[#311d60]">{children}</h2>
      ),
      h3: ({ children }) => (
        <h3 className="text-[15px] font-semibold text-[#311d60]">{children}</h3>
      ),
      p: ({ children }) => (
        <p className="text-[14px] leading-relaxed text-[#453174]">{children}</p>
      ),
      ul: ({ children }) => (
        <ul className="ml-5 list-disc space-y-1 text-[14px] text-[#453174]">
          {children}
        </ul>
      ),
      ol: ({ children }) => (
        <ol className="ml-5 list-decimal space-y-1 text-[14px] text-[#453174]">
          {children}
        </ol>
      ),
      li: ({ children }) => <li>{children}</li>,
      strong: ({ children }) => (
        <strong className="font-semibold text-[#2b1958]">{children}</strong>
      ),
      em: ({ children }) => (
        <em className="font-medium text-[#af51d6]">{children}</em>
      ),
      a: ({ children, href }) => (
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className="text-[#b266ff] underline underline-offset-2 hover:text-[#9c4ae6]"
        >
          {children}
        </a>
      ),
      code: ({ children }) => (
        <code className="rounded bg-[#efe6ff] px-1.5 py-0.5 text-[14px] text-[#3a2763]">
          {children}
        </code>
      ),
    }),
    []
  );

  useEffect(() => {
    scrollAnchorRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isSending, showTyping]);

  const canSubmit = useMemo(() => {
    const trimmed = inputValue.trim();
    return (
      !isSending && trimmed.length > 0 && trimmed.length <= MAX_INPUT_LENGTH
    );
  }, [inputValue, isSending]);

  const sendMessage = async (rawMessage: string) => {
    const trimmed = rawMessage.trim();
    if (!trimmed || trimmed.length > MAX_INPUT_LENGTH) {
      setError(
        trimmed.length > MAX_INPUT_LENGTH
          ? `Messages are limited to ${MAX_INPUT_LENGTH} characters.`
          : "Please enter a message."
      );
      return;
    }

    setError(null);
    setIsSending(true);
    setShowTyping(true);
    setInputValue("");

    const optimisticId = `user-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      { id: optimisticId, role: "user", content: trimmed },
    ]);

    let assistantId: string | null = null;

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: trimmed,
          sessionId: sessionId ?? undefined,
          userId: user._id,
        }),
      });

      if (!response.ok || !response.body) {
        throw new Error("Failed to reach the assistant.");
      }

      const newAssistantId = `assistant-${Date.now()}`;
      assistantId = newAssistantId;
      setMessages((prev) => [
        ...prev,
        { id: newAssistantId, role: "assistant", content: "" },
      ]);

      const updateAssistant = (patch: Partial<ChatMessage>) => {
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === newAssistantId
              ? {
                  ...msg,
                  ...patch,
                }
              : msg
          )
        );
      };

      const decoder = new TextDecoder();
      const reader = response.body.getReader();
      let buffer = "";
      let accumulated = "";
      let finalReply = "";
      let finalSessionId: string | null = null;
      let finalProducts: Product[] = [];

      const processPayload = (line: string) => {
        const trimmed = line.trim();
        if (!trimmed) return;
        const payload = JSON.parse(trimmed) as {
          type: string;
          token?: string;
          reply?: string;
          products?: unknown[];
          sessionId?: string;
          message?: string;
        };

        if (payload.type === "delta" && typeof payload.token === "string") {
          accumulated += payload.token;
          updateAssistant({ content: accumulated });
          return;
        }

        if (payload.type === "final") {
          if (typeof payload.reply === "string") {
            finalReply = payload.reply.trim();
          }
          if (Array.isArray(payload.products)) {
            finalProducts = normalizeProductArray(payload.products);
          }
          if (typeof payload.sessionId === "string") {
            finalSessionId = payload.sessionId;
          }
          return;
        }

        if (payload.type === "error") {
          throw new Error(
            typeof payload.message === "string"
              ? payload.message
              : "Assistant could not respond."
          );
        }
      };

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          processPayload(line);
        }
      }

      if (buffer.trim().length) {
        processPayload(buffer);
      }

      const resolvedContent = finalReply.length ? finalReply : accumulated;

      const hasProducts = finalProducts.length > 0;

      updateAssistant({
        content: resolvedContent.length
          ? resolvedContent
          : "I rounded up a few options—let me know if anything catches your eye!",
        products: hasProducts ? finalProducts : undefined,
      });

      if (finalSessionId) {
        setSessionId(finalSessionId);
      }
    } catch (err) {
      if (assistantId) {
        setMessages((prev) => prev.filter((msg) => msg.id !== assistantId));
      }
      setError(
        err instanceof Error ? err.message : "Something went wrong. Try again."
      );
    } finally {
      setIsSending(false);
      setShowTyping(false);
    }
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await sendMessage(inputValue);
  };

  const handleSuggestion = async (suggestion: string) => {
    await sendMessage(suggestion);
  };

  return (
    <main className="flex min-h-screen flex-col font-['Inter'] text-[#2f1f53]">
      <div className="flex flex-1 flex-col items-center px-8 pb-36 pt-24">
        <div className="w-full max-w-[78rem]">
          <header className="text-center">
            <h1 className="text-[38px] font-semibold tracking-[-0.02em] text-[#331d62] md:text-[46px]">
              How can I help you?
            </h1>
          </header>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            {TOPICS.map((topic) => (
              <button
                key={topic}
                className="flex items-center gap-2 rounded-full border border-[#e2d7ff] bg-white px-5 py-2 text-[15px] font-medium text-[#5e3fb0] shadow-sm transition hover:border-[#d0bfff] hover:bg-[#f6f0ff]"
              >
                {topic}
              </button>
            ))}
          </div>

          {messages.length === 0 ? (
            <section className="mt-12 space-y-3 rounded-3xl border border-transparent bg-white/80 p-7 backdrop-blur-md shadow-[0_24px_50px_-28px_rgba(73,41,132,0.35)]">
              {SUGGESTIONS.map((suggestion) => (
                <button
                  key={suggestion}
                  onClick={() => handleSuggestion(suggestion)}
                  className="flex w-full items-center justify-between rounded-[22px] px-5 py-4 text-left transition hover:bg-[#f1eaff]"
                >
                  <span className="text-[16px] font-medium tracking-[-0.01em]">
                    {suggestion}
                  </span>
                  <ArrowUpRight className="h-5 w-5 text-[#b79dff]" />
                </button>
              ))}
            </section>
          ) : (
            <section className="mt-12 space-y-10">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex ${
                    message.role === "user" ? "justify-end" : "justify-start"
                  }`}
                >
                  {message.role === "assistant" ? (
                    <div className="w-full ">
                      {message.products?.length ? (
                        <div className="mt-6 flex gap-[2rem] overflow-auto">
                          {message.products.map((product, index) => {
                            const productKey = `${message.id}-${String(
                              product._id ?? product.slug ?? index
                            )}`;
                            return (
                              <Box key={productKey} className="min-w-[25rem]">
                                <ProductCard product={product} />
                              </Box>
                            );
                          })}
                        </div>
                      ) : null}

                      {message.content ? (
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm]}
                          components={markdownComponents}
                          className="markdown space-y-4 text-[14px] leading-relaxed tracking-[-0.008em]"
                        >
                          {message.content}
                        </ReactMarkdown>
                      ) : null}
                    </div>
                  ) : (
                    <div className="max-w-[72%] rounded-[22px] bg-[#1b1f26] py-[7px] px-[14px] text-[14px] leading-[2] text-white ">
                      {message.content}
                    </div>
                  )}
                </div>
              ))}
              {showTyping && (
                <div className="flex justify-start">
                  <div className="flex items-center gap-4 rounded-[26px] ">
                    {/* <span className="flex h-11 w-11 items-center justify-center rounded-[18px] bg-[#f3ebff]">
                      <span className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-[#d2c0ff] border-t-[#8e70da] animate-spin" />
                    </span> */}
                    <div className="flex gap-2">
                      <span className="h-2.5 w-2.5 animate-bounce rounded-full bg-[#bfa4ff]" />
                      <span className="h-2.5 w-2.5 animate-bounce rounded-full bg-[#bfa4ff] [animation-delay:0.18s]" />
                      <span className="h-2.5 w-2.5 animate-bounce rounded-full bg-[#bfa4ff] [animation-delay:0.36s]" />
                    </div>
                  </div>
                </div>
              )}
              <div ref={scrollAnchorRef} />
            </section>
          )}
        </div>
      </div>

      <footer className="sticky bottom-0 z-[999] flex w-full justify-center pt-8 px-4">
        <div className="w-full max-w-[80rem] rounded-t-[10px] border border-[#e5d9ff] bg-white/95 p-6 shadow-[0_32px_70px_-38px_rgba(70,47,128,0.55)] backdrop-blur">
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="relative flex items-end gap-4">
              <div className="flex-1">
                <textarea
                  rows={2}
                  placeholder="Type your message here…"
                  value={inputValue}
                  onChange={(event) => {
                    const value = event.target.value;
                    if (value.length <= MAX_INPUT_LENGTH) {
                      setInputValue(value);
                      if (error) setError(null);
                    }
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      if (canSubmit) {
                        event.preventDefault();
                        void sendMessage(inputValue);
                      }
                    }
                  }}
                  className="w-full  resize-none rounded-[22px] border border-[#dfcdfc] bg-[#faf7ff] px-5 py-4 text-[16px] leading-relaxed text-[#36255a] placeholder:text-[#b39fdd] focus:border-[#ccb4ff] focus:outline-none focus:ring-2 focus:ring-[#d8c6ff]"
                  maxLength={MAX_INPUT_LENGTH}
                  aria-label="Message input"
                />
                <div className="mt-2 flex items-center justify-between text-[12px] text-[#9578da]">
                  <span>
                    {inputValue.trim().length} / {MAX_INPUT_LENGTH}
                  </span>
                  {error && <span className="text-[#ff3e73]">{error}</span>}
                </div>
              </div>

              <button
                type="submit"
                disabled={!canSubmit}
                className="flex h-14 w-14 items-center justify-center rounded-[18px] bg-gradient-to-r from-[#f882b0] to-[#f15e99] text-white shadow-lg shadow-[#f882b0]/35 transition hover:brightness-110 disabled:cursor-not-allowed disabled:from-[#f2b5c9] disabled:to-[#f2b5c9]"
              >
                <ArrowUpRight className="h-6 w-6" />
                <span className="sr-only">Send message</span>
              </button>
            </div>
          </form>
        </div>
      </footer>
    </main>
  );
}
