"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { ArrowUpRight } from "lucide-react";
import { useUser } from "@/app/_contexts/CreateConvexUser";
import ProductCard from "@/app/_components/ProductCard";
import type { Product, Size, Category } from "@/app/_utils/types";
import { Box } from "@chakra-ui/react";
import { IoIosArrowDown } from "react-icons/io";
import Modal, { ModalWindow } from "./_components/Modal";
import Image from "next/image";
import { formatPrice } from "./_utils/utils";
// import useProducts from "./_hooks/useProducts";

const SUGGESTIONS = [
  // Routine building
  "Build me a skincare routine for oily, acne-prone skin",
  "Create a simple morning routine with sunscreen",
  "Suggest a minimal routine for dry, sensitive skin",
  "Help me simplify my skincare — which steps can I skip?",
  "Add affordable alternatives to my current products",

  // Ingredient understanding
  "What does niacinamide actually do for my skin?",
  "Which ingredients should I avoid when using retinol?",
  "Can I combine vitamin C with hyaluronic acid?",
  "Explain the difference between AHAs and BHAs",
  "Is azelaic acid better than salicylic acid for acne?",

  // Product guidance
  "Compare La Roche-Posay and CeraVe cleansers for dry skin",
  "Which sunscreen works best for dark skin tones?",
  "Recommend a gentle exfoliant for sensitive skin",
  "Find fragrance-free moisturizers that hydrate well",
  "Which is better for wrinkles: retinol or peptides?",

  // Layering & timing
  "When should I apply toner in my routine?",
  "How long should I wait between serum and moisturizer?",
  "Can I use retinol and exfoliants on the same night?",
  "What’s the right morning and night skincare order?",
  "How do I safely start using actives like retinol?",

  // Skin issues & diagnosis
  "Help me understand why my skin feels tight after washing",
  "My skin is breaking out suddenly — what could be causing it?",
  "Why does my skincare peel under foundation?",
  "Suggest ways to reduce redness and irritation",
  "How can I fade acne scars and dark spots faster?",

  // Lifestyle & environment
  "How should I adjust my skincare for humid weather?",
  "What should I change for winter dryness?",
  "Recommend SPF options for everyday indoor use",
  "Help me protect my skin barrier after over-exfoliating",
  "Can stress or diet make acne worse?",
];

const getRandomSuggestions = (count: number) => {
  const shuffled = [...SUGGESTIONS].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, count);
};

type ChatRole = "assistant" | "user";

type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
  products?: Product[];
};

const normalizeHeader = (line: string) =>
  line
    .toLowerCase()
    .replace(/[\*`_~>#:\-]/g, "")
    .replace(/\s+/g, " ")
    .trim();

const extractSuggestedActions = (
  content: string
): { body: string; suggestions: string[] } => {
  if (!content) return { body: "", suggestions: [] };
  const lines = content.split(/\r?\n/);
  const headerIndex = lines.findIndex((line) => {
    const normalized = normalizeHeader(line);
    return normalized === "suggested actions";
  });

  if (headerIndex === -1) {
    return { body: content, suggestions: [] };
  }

  const body = lines.slice(0, headerIndex).join("\n").trimEnd();
  const sanitizeSuggestion = (line: string) => {
    let sanitized = line.trim();
    sanitized = sanitized.replace(/^[-*•●◦▪]+\s*/, "");
    sanitized = sanitized.replace(/^(\d+)[\).:\-]?\s*/, "");
    sanitized = sanitized.replace(/^[-*•●◦▪]+\s*/, "");
    return sanitized.trim();
  };

  const suggestionLines = lines.slice(headerIndex + 1);
  const suggestions = suggestionLines
    .map(sanitizeSuggestion)
    .filter(
      (line) => line.length > 0 && normalizeHeader(line) !== "suggested actions"
    )
    .slice(0, 3);

  return {
    body: body.trim().length ? body : "",
    suggestions,
  };
};

const MAX_INPUT_LENGTH = 600;
const SCROLL_THRESHOLD = 80;

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
  const currency =
    typeof input.currency === "string" ? input.currency : undefined;
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
    currency,
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

  const categories = Array.isArray(source.categories)
    ? source.categories
        .map((category) => {
          if (!category) return null;
          if (typeof category === "string") {
            return { name: category } as Category;
          }
          if (isRecord(category)) {
            if (typeof category.name === "string") {
              const payload: Category = {
                name: category.name,
              };
              if (typeof category.slug === "string") {
                payload.slug = category.slug;
              }
              return payload;
            }
            return null;
          }
          return null;
        })
        .filter((category): category is Category => Boolean(category))
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
    categories,
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

export default function ChatPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [hasSent, setHasSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isTyping, setShowTyping] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const { user } = useUser();
  const [displayedSuggestions] = useState(() => getRandomSuggestions(3));
  const usedSuggestionKeysRef = useRef(new Set<string>());
  const adjustTextareaHeight = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    const maxHeight = 240;
    const newHeight = Math.min(textarea.scrollHeight, maxHeight);
    textarea.style.height = `${Math.max(newHeight, 48)}px`;
    textarea.style.overflowY =
      textarea.scrollHeight > maxHeight ? "auto" : "hidden";
  }, []);
  const conversationRef = useRef<HTMLDivElement | null>(null);
  const [showScrollDownButton, setShowScrollDownButton] = useState(false);
  const [product, setProductToPreview] = useState<Product | null>();
  // const { products } = useProducts({ filters: {} });

  const updateScrollButtonVisibility = useCallback(() => {
    const container = conversationRef.current;
    if (!container) return 0;

    const distanceFromBottom = Math.max(
      container.scrollHeight - container.scrollTop - container.clientHeight,
      0
    );

    setShowScrollDownButton(distanceFromBottom > SCROLL_THRESHOLD);
    return distanceFromBottom;
  }, []);

  useEffect(() => {
    adjustTextareaHeight();
  }, [inputValue, adjustTextareaHeight]);

  useLayoutEffect(() => {
    const container = conversationRef.current;
    console.log("scrolling");
    if (!container) return;

    const handleScroll = () => {
      console.log("scrolling");
      updateScrollButtonVisibility();
    };

    handleScroll();
    container.addEventListener("scroll", handleScroll);

    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver === "function") {
      resizeObserver = new ResizeObserver(() => {
        updateScrollButtonVisibility();
      });
      resizeObserver.observe(container);
    }

    return () => {
      container.removeEventListener("scroll", handleScroll);
      resizeObserver?.disconnect();
    };
  }, [updateScrollButtonVisibility]);

  useLayoutEffect(() => {
    const container = conversationRef.current;
    if (!container) return;

    const distanceFromBottom = updateScrollButtonVisibility();
    const isNearBottom = distanceFromBottom <= SCROLL_THRESHOLD;

    if (isNearBottom) {
      container.scrollTo({
        top: container.scrollHeight,
        behavior: messages.length <= 1 ? "auto" : "smooth",
      });
      requestAnimationFrame(() => {
        updateScrollButtonVisibility();
      });
    }
  }, [messages, updateScrollButtonVisibility]);

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
        <ul className="ml-6 list-disc space-y-4 text-[14px] text-[#453174]">
          {children}
        </ul>
      ),
      ol: ({ children }) => (
        <ol className="ml-6 list-decimal space-y-4 text-[14px] text-[#453174]">
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

  const hasMessages = messages.length > 0;

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
    setInputValue("");

    const optimisticId = `user-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      { id: optimisticId, role: "user", content: trimmed },
    ]);

    let assistantId: string | null = null;

    // if no network we can stop them from calling
    try {
      setShowTyping(true);

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

      // successfully sent
      setHasSent(true);
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

      // message received and is responding

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
      setHasSent(false);
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

  const handleProductToPreview = (product: Product) => {
    setProductToPreview(product);
  };

  const lastAssistantMessageId = useMemo(() => {
    const reversed = [...messages].reverse();
    const found = reversed.find((msg) => msg.role === "assistant");
    return found?.id;
  }, [messages]);

  return (
    <Modal>
      <main className="flex min-h-screen  md:min-h-[calc(100vh-100px)]  flex-col font-['Inter'] text-[#2f1f53]">
        <Box
          className={`flex flex-1 min-h-0 w-full flex-col items-center ${!hasMessages && "justify-center"} px-8 pb-36 pt-[6rem] md:pt-0`}
        >
          {/* conversation container */}
          <Box
            ref={conversationRef}
            className="w-full max-w-[70rem] flex-1 overflow-y-auto min-h-0"
            // style={{ maxHeight: "calc(100vh - 220px)" }}
          >
            {!hasMessages && (
              <Box className="mt-[100px]">
                {/* {products && products.length > 0 && (
                  <ProductCard
                    onProductToPreview={handleProductToPreview}
                    inChat={true}
                    product={products[1]}
                  />
                )} */}

                <header className="text-center">
                  <h1 className="text-[38px] font-semibold tracking-[-0.02em] text-[#331d62] md:text-[46px]">
                    How can I help you?
                  </h1>
                </header>

                <section className="space-y-3 rounded-3xl border border-transparent bg-white/80 p-7 backdrop-blur-md ">
                  {displayedSuggestions.map((suggestion) => (
                    <button
                      key={suggestion}
                      onClick={() => handleSuggestion(suggestion)}
                      className="flex w-full items-center justify-between rounded-[22px] px-5 py-4 text-left transition hover:bg-[#f2f2f2]"
                    >
                      <span className="text-[16px] font-medium tracking-[-0.01em]">
                        {suggestion}
                      </span>
                      <ArrowUpRight className="h-7 w-7 text-[#aaa]" />
                    </button>
                  ))}
                </section>
              </Box>
            )}

            <section className="mt-12 space-y-10">
              {messages.map((message, index) => (
                <Box
                  id={`message-${message.id}`}
                  key={message.id}
                  className={`flex ${
                    message.role === "user" ? "justify-end" : "justify-start"
                  }`}
                >
                  {message.role === "assistant" ? (
                    <Box className="w-full ">
                      {message.products?.length ? (
                        <Box className="mt-6 flex items-stretch gap-[1rem] overflow-auto mb-[20px]">
                          {message.products.map((product, index) => {
                            const productKey = `${message.id}-${String(
                              product._id ?? product.slug ?? index
                            )}`;
                            return (
                              <Box
                                key={productKey}
                                className="min-w-[90%] md:min-w-[75%] flex"
                              >
                                <ProductCard
                                  onProductToPreview={handleProductToPreview}
                                  inChat={true}
                                  product={product}
                                />
                              </Box>
                            );
                          })}
                        </Box>
                      ) : null}

                      {(() => {
                        const { body, suggestions } = extractSuggestedActions(
                          message.content
                        );
                        const markdownSource = body;
                        return (
                          <>
                            {markdownSource.length ? (
                              <ReactMarkdown
                                remarkPlugins={[remarkGfm]}
                                components={markdownComponents}
                                className="markdown space-y-4 text-[14px] leading-relaxed tracking-[-0.008em]"
                              >
                                {markdownSource}
                              </ReactMarkdown>
                            ) : null}
                            {suggestions.length ? (
                              <Box className="mt-4 flex flex-col gap-2">
                                {suggestions.map((suggestion, index) => {
                                  const key = `${message.id}-suggestion-${index}`;
                                  const alreadyUsed =
                                    usedSuggestionKeysRef.current.has(key);
                                  const isLatestAssistant =
                                    message.id === lastAssistantMessageId;
                                  const isDisabled =
                                    alreadyUsed || !isLatestAssistant;
                                  return (
                                    <button
                                      key={key}
                                      type="button"
                                      onClick={() => {
                                        if (isDisabled) return;
                                        usedSuggestionKeysRef.current.add(key);
                                        setError(null);
                                        sendMessage(suggestion);
                                      }}
                                      disabled={isDisabled || isTyping}
                                      className="text-start rounded-[8px] border-none focus-visible:border-none px-[16px] py-[10px] text-[14px] bg-[#eef3ff] text-[#1b1f26] transition hover:bg-[#5377E1] hover:text-white disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-[#eef3ff] disabled:hover:text-[#1b1f26]"
                                    >
                                      {suggestion}
                                    </button>
                                  );
                                })}
                              </Box>
                            ) : null}
                          </>
                        );
                      })()}
                    </Box>
                  ) : (
                    (() => {
                      const isSending =
                        index + 1 === messages.length &&
                        messages.at(index)?.role === "user" &&
                        !hasSent;
                      return (
                        <Box
                          className={`max-w-[72%] rounded-[18px] ${isSending ? "bg-[#494c51]" : "bg-[#1b1f26]"} py-[8px] px-[16px] text-[14px] leading-[1.5] text-white `}
                        >
                          {message.content}
                        </Box>
                      );
                    })()
                  )}
                </Box>
              ))}
              {isTyping && (
                <Box className="flex justify-start">
                  <Box className="flex items-center gap-4 rounded-[26px] ">
                    {/* <span className="flex h-11 w-11 items-center justify-center rounded-[18px] bg-[#f3ebff]">
                      <span className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-[#d2c0ff] border-t-[#8e70da] animate-spin" />
                    </span> */}
                    <Box className="flex gap-2">
                      <span className="h-2.5 w-2.5 animate-bounce rounded-full bg-[#1b1f26]" />
                      <span className="h-2.5 w-2.5 animate-bounce rounded-full bg-[#1b1f26] [animation-delay:0.18s]" />
                      <span className="h-2.5 w-2.5 animate-bounce rounded-full bg-[#1b1f26] [animation-delay:0.36s]" />
                    </Box>
                  </Box>
                </Box>
              )}
            </section>
          </Box>
        </Box>
        <footer className="sticky bottom-0 z-[999] flex w-full justify-center pt-8 px-4 bg-[linear-gradient(180deg,rgba(255,255,255,0)_0,rgba(255,255,255,1)_1rem,rgba(255,255,255,1))]">
          <Box className="w-full max-w-[80rem] rounded-t-[10px]  bg-white/95 px-6 shadow-[0_32px_70px_-38px_rgba(70,47,128,0.55)] backdrop-blur">
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <Box className="relative gap-4">
                <Box className="flex-1 ">
                  <Box className="relative">
                    <textarea
                      rows={1}
                      placeholder="Ask anything"
                      value={inputValue}
                      onChange={(event) => {
                        const value = event.target.value;
                        if (value.length <= MAX_INPUT_LENGTH) {
                          setInputValue(value);
                          if (error) setError(null);
                          adjustTextareaHeight();
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
                      ref={textareaRef}
                      className="resize-none rounded-[25px] py-[10px] pr-[40px] pl-[12px] bg-[#f2f2f2] leading-relaxed text-[#36255a] focus-visible:border-none"
                      maxLength={MAX_INPUT_LENGTH}
                      aria-label="Message input"
                      style={{ minHeight: "48px", maxHeight: "240px" }}
                    />

                    <button
                      type="submit"
                      disabled={!canSubmit}
                      className="absolute right-[7px] bottom-[8.5px] flex h-12 w-12 items-center justify-center rounded-[18px] disabled:bg-[#dcdcdd] disabled:text-[#888]  bg-[#1b1f26] text-white shadow-lg shadow-[#f882b0]/35 transition hover:brightness-110 disabled:cursor-not-allowed disabled:from-[#f2b5c9] disabled:to-[#f2b5c9]"
                    >
                      <ArrowUpRight className="h-6 w-6 " />
                      <span className="sr-only">Send message</span>
                    </button>
                  </Box>

                  <Box className="mt-2 flex items-center justify-between text-[12px] text-[#888]">
                    <span>
                      {inputValue.trim().length} / {MAX_INPUT_LENGTH}
                    </span>
                    {error && <span className="text-[#ff3e73]">{error}</span>}
                  </Box>
                </Box>
              </Box>
            </form>
          </Box>
        </footer>

        {showScrollDownButton ? (
          <Box
            onClick={() => {
              const container = conversationRef.current;
              if (!container) return;
              container.scrollTo({
                top: container.scrollHeight,
                behavior: "smooth",
              });
              setShowScrollDownButton(false);
            }}
            className="fixed bottom-[90px] left-1/2 z-[1000] -translate-x-1/2 bg-[#1b1f26] h-[42px] w-[42px] flex items-center justify-center rounded-full shadow-lg shadow-[#f882b0]/35 cursor-pointer transition hover:brightness-110"
          >
            <IoIosArrowDown className="text-[#fff] w-[22px] h-[22px]" />
          </Box>
        ) : null}

        <ModalWindow
          position="center"
          name="product-detail"
          bgClassName="z-[9999] px-[2rem] h-[calc(100vh-75px)] overflow-auto mt-auto top-auto bottom-0 !items-start"
          className="h-[calc(100vh-75px)] max-w-[77rem] w-full overflow-auto relative"
          animate={false}
        >
          <Box className=" w-full mx-auto h-full pt-[20px]">
            <Box className="flex flex-col h-full">
              <p className=" text-[1.4rem] pb-[20px]">&larr; Back</p>
              <Box className="bg-[#F4F4F4] w-[95%] mx-auto aspect-[2.1/1] rounded-[20px] overflow-hidden">
                {product?.images && product.images.length > 0 && (
                  <Image
                    src={product.images[0]}
                    alt={product.name || "Product image"}
                    width={500}
                    height={500}
                    className="h-full w-full object-contain overflow-hidden"
                  />
                )}
              </Box>
              <Box className=" rounded-t-[20px]">
                <h2 className="text-[#1b1f26] text-[20px] font-medium my-[16px] ">
                  {product?.name}
                </h2>
                <p className="text-[20px] font-medium leading-[24px] mb-[24px]">
                  {formatPrice(product?.sizes?.[0]?.price)}
                </p>
                <article className="gap-[16px] flex flex-col">
                  <p className="text-[14px]">{product?.description}</p>
                  <ul className="gap-[16px] flex flex-col text-[14px] list-disc ml-5">
                    <li>2% BHA unclogs large pores & smooths texture</li>
                    <li>15% vitamin C improves radiance & tone</li>
                    <li>1% retinol visibly reduces wrinkles & roughness</li>
                  </ul>
                </article>
              </Box>

              <footer className="p-[16px] bg-[linear-gradient(180deg,rgba(255,255,255,0)_0,rgba(255,255,255,1)_1rem,rgba(255,255,255,1))] flex gap-[4px] bottom-0 left-0 absolute w-full ">
                <button className="flex items-center justify-center bg-[#1b1f260f] p-[10px] rounded-[20px] w-[15%]">
                  <svg
                    className="w-[20px] h-[20px]"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                  >
                    <path
                      d="M19.5 13.57 12 21l-7.5-7.43A5 5 0 1 1 12 7.01a5 5 0 1 1 7.5 6.57"
                      stroke="currentColor"
                      stroke-width="1.75"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    ></path>
                  </svg>
                </button>
                <button className="w-[95%] bg-[#1454d4] rounded-[20px] p-[10px] text-[14px] flex items-center justify-center text-[#fff]">
                  Add to Cart
                </button>
              </footer>
            </Box>
          </Box>
        </ModalWindow>
      </main>
    </Modal>
  );
}

// import SectionBestSeller from "./_components/SectionBestSeller";
// import { fetchQuery } from "convex/nextjs";
// import { api } from "@/convex/_generated/api";
// import { Box } from "@chakra-ui/react";
// import Link from "next/link";
// import SectionTrending from "./_components/SectionTrending";

// export default async function HomePage() {
//   // const bestsellers = await fetchQuery(api.products.getAllProducts, {
//   //   filters: { isBestseller: true },
//   // });

//   // const trending = await fetchQuery(api.products.getAllProducts, {
//   //   filters: { isBestseller: true },
//   // });

//   // if it fails return empty list
//   const [bestsellers, trending] = await Promise.all([
//     fetchQuery(api.products.getAllProducts, {
//       filters: { isBestseller: true },
//     }).catch(() => ({ products: [] })),
//     fetchQuery(api.products.getAllProducts, {
//       filters: { isTrending: true },
//     }).catch(() => ({ products: [] })),
//   ]);

//   return (
//     <>
//       <Box className="mx-auto mb-[96px] flex w-full max-w-[1200px] flex-col gap-[24px] px-[16px] pt-[24px] md:flex-row md:items-center">
//         <Box className="flex-1 rounded-[24px] bg-[#f5f7ff] p-[32px] shadow-md md:p-[48px]">
//           <p className="mb-[16px] inline-block rounded-full bg-[#e8edff] px-[16px] py-[6px] text-[1.3rem] font-medium text-[#3c4cc5] uppercase tracking-[0.2em]">
//             Personalized Skincare
//           </p>
//           <h1 className="mb-[20px] max-w-[36rem] text-[3.8rem] font-semibold leading-[1.1] text-[#1f2537] md:text-[4.6rem]">
//             Better Skin,
//             <span className="text-[#5a6bff]"> Proven Care</span>
//           </h1>
//           <p className="mb-[28px] max-w-[40rem] text-[1.6rem] text-[#4a4f63]">
//             Clinically guided routines tailored to Nigeria’s climate, pollution
//             and busy lifestyles. Answer a few questions and SkinBuddy builds the
//             exact plan your skin needs.
//           </p>
//           <Box className="flex flex-col gap-[12px] sm:flex-row sm:items-center">
//             <Link
//               href="/recommender"
//               className="inline-flex items-center justify-center rounded-full bg-[#1f2537] px-[28px] py-[12px] text-[1.5rem] font-semibold text-white transition hover:bg-[#111522]"
//             >
//               Start Skin Quiz
//             </Link>
//             <span className="text-[1.4rem] text-[#6b7288]">
//               Takes less than 5 minutes • Free recommendations
//             </span>
//           </Box>
//         </Box>
//         <Box className="relative mt-[32px] flex-1 md:mt-0">
//           <Box className="absolute -left-[18px] top-[24px] hidden h-[120px] w-[120px] rounded-full bg-[#dfe4ff] md:block" />
//           <Box className="absolute -right-[24px] bottom-[36px] hidden h-[160px] w-[160px] rounded-[32px] bg-[#f0f2ff] md:block" />
//           <img
//             src="/images/hero/hero--6.webp"
//             alt="SkinBuddy skincare assortment"
//             className="relative z-[2] w-full max-w-[480px] rounded-[32px] object-cover shadow-xl"
//           />
//         </Box>
//       </Box>

//       <Box className="flex flex-col gap-[48px]">
//         <SectionBestSeller initialProducts={bestsellers.products} />

//         <SectionTrending initialProducts={trending.products} />
//       </Box>
//     </>
//   );
// }
// // export default async function HomePage() {
// //   const products = await fetchQuery(api.products.getAllProducts, {
// //     filters: { isBestseller: true },
// //   });

// //   return (
// //     <Modal>
// //       <Hero />
// //       <SectionBestSeller initialProducts={products} />
// //       <SectionCategories />
// //       <SectionSets />
// //       <Box className="px-[5.6rem] grid grid-cols-[370px_1fr] gap-[70px]">
// //         <Box className="pt-[9.6rem]">
// //           <h3 className="mb-[20px] w-[25rem] leading-[33px] font-bold text-[2.8rem] text-[#333]">
// //             A new beginning for everyone.
// //           </h3>
// //           <p className="mb-[40px] text-[#686868]">
// //             <span className="text-[1.6rem] font-bold text-[#333]">
// //               Having Skin concerns?
// //             </span>{" "}
// //             We have trained our AI to recommend the perfect skin set for you to
// //             reach your skin goal
// //           </p>
// //         </Box>

// //         <Box className="w-full h-[60rem]">
// //           <Image
// //             alt="video"
// //             width={958}
// //             height={607}
// //             className="h-full w-full object-cover"
// //             src={"/images/video.png"}
// //           />
// //         </Box>
// //       </Box>

// //       <SectionSets />

// //       <NewProductImageCarousel />

// //       <SectionSets />

// //       <Footer />
// //     </Modal>
// //   );
// // }
