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
import type {
  Product,
  Routine,
  RoutineStep,
  MessageSummary,
  ChatMessage,
  Message,
} from "@/app/_utils/types";
import { Box } from "@chakra-ui/react";
import Modal, { ModalWindow } from "./_components/Modal";
import Image from "next/image";
import {
  extractSuggestedActions,
  formatPrice,
  getRandomSuggestions,
  isChatMessage,
  isQuizMessage,
  MAX_INPUT_LENGTH,
  normalizeProductArray,
  normalizeRoutinePayload,
  normalizeSummary,
  SCROLL_THRESHOLD,
} from "./_utils/utils";
import { IoChevronDownOutline } from "react-icons/io5";
import RoutineCard from "./_components/RoutineCard";
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

type QuizQuestion = {
  header: string;
  question: string;
  options: string[];
  selected?: string;
  index: number;
};

type SkinQuizState = {
  role: "quiz";
  currentIndex: number;
  questions: QuizQuestion[];
};

const QUIZ_RESULTS_SENTINEL = "__QUIZ_RESULTS__";

const SKIN_QUIZ_TEMPLATES: Array<Omit<QuizQuestion, "selected">> = [
  {
    index: 0,
    header:
      "Let's get started! These quick questions will help me understand your skin type and top concerns.",
    question:
      "After washing your face with only water, how does your skin usually feel?",
    options: [
      "Tight and uncomfortable — needs moisture right away",
      "Comfortable, neither dry nor oily",
      "Shiny or oily within an hour",
      "Tight in some areas (like cheeks) but oily in others",
    ],
  },
  {
    index: 1,
    header:
      "Got it. Now let's see how your skin reacts to different conditions.",
    question:
      "When you try new skincare or when the weather changes, what happens most often?",
    options: [
      "No major change — my skin stays calm",
      "Slight redness or irritation sometimes",
      "Gets red, itchy, or breaks out easily",
    ],
  },
  {
    index: 2,
    header: "Let's talk about what you'd like to improve about your skin.",
    question:
      "Which of these describe your biggest skin concerns? (You may pick a few answers)",
    options: [
      "Breakouts or blackheads",
      "Dark spots or uneven tone",
      "Dryness or tight feeling",
      "Fine lines, wrinkles, or loss of firmness",
      "Redness, irritation, or sensitivity",
      "Visible pores or rough texture",
    ],
  },
  {
    index: 3,
    header: "Almost done!",
    question: "How does your skin feel by the middle of the day?",
    options: [
      "Still dry or flaky",
      "Balanced and normal",
      "Oily or shiny all over",
      "Oily only in the T-zone (forehead, nose, chin)",
    ],
  },
];

const createInitialQuizState = (): SkinQuizState => ({
  role: "quiz",
  currentIndex: 0,
  questions: SKIN_QUIZ_TEMPLATES.map((question) => ({
    ...question,
    options: [...question.options],
    selected: undefined,
  })),
});

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [hasSent, setHasSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isTyping, setShowTyping] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const { user } = useUser();
  const [displayedSuggestions] = useState(() =>
    getRandomSuggestions(3, SUGGESTIONS)
  );
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
  const [pendingSkinTypeQuiz, setPendingSkinTypeQuiz] = useState(false);
  // const { products } = useProducts({ filters: {} });
  const [skinQuiz, setSkinQuiz] = useState<SkinQuizState>(() =>
    createInitialQuizState()
  );
  const [userHasScrolled, setUserHasScrolled] = useState(false);
  const userMessagePositionedRef = useRef<string | null>(null);
  const assistantScrolledRef = useRef<string | null>(null);
  const [assistantWithMinHeight, setAssistantWithMinHeight] = useState<
    string | null
  >(null);

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
    if (!container) return;

    const handleScroll = () => {
      const distanceFromBottom = updateScrollButtonVisibility();
      const isNearBottom = distanceFromBottom <= SCROLL_THRESHOLD;

      // Mark that user has scrolled away from bottom
      if (!isNearBottom) {
        setUserHasScrolled(true);
      } else {
        setUserHasScrolled(false);
      }
    };

    container.addEventListener("scroll", handleScroll);
    handleScroll();

    return () => {
      container.removeEventListener("scroll", handleScroll);
    };
  }, [updateScrollButtonVisibility]);

  useLayoutEffect(() => {
    const container = conversationRef.current;
    if (!container) return;

    const distanceFromBottom = updateScrollButtonVisibility();
    const isNearBottom = distanceFromBottom <= SCROLL_THRESHOLD;

    const lastMessage = messages.at(-1);
    const isLastMessageUser =
      lastMessage && isChatMessage(lastMessage) && lastMessage.role === "user";

    // Skip auto-scroll entirely when waiting for or receiving assistant response
    // This allows free scrolling during the entire response period
    if (isTyping || isLastMessageUser) {
      return;
    }

    // Only auto-scroll if user hasn't manually scrolled away
    if (isNearBottom && !userHasScrolled) {
      container.scrollTop = container.scrollHeight;
      requestAnimationFrame(() => {
        updateScrollButtonVisibility();
      });
    }
  }, [isTyping, messages, updateScrollButtonVisibility, userHasScrolled]);

  // Update which assistant message should have min-height when a new one appears
  useEffect(() => {
    const lastMessage = messages.at(-1);
    const secondLastMessage = messages.at(-2);

    // When a new assistant message appears, transfer the min-height to it
    if (
      lastMessage &&
      isChatMessage(lastMessage) &&
      lastMessage.role === "assistant"
    ) {
      setAssistantWithMinHeight(lastMessage.id);

      // Only scroll once per assistant message (when it first appears)
      if (assistantScrolledRef.current === lastMessage.id) {
        return;
      }

      // Scroll the user message (second to last) to top after height is applied
      if (
        secondLastMessage &&
        isChatMessage(secondLastMessage) &&
        secondLastMessage.role === "user"
      ) {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            // Find the user message element
            const userMessageElements = document.querySelectorAll(
              '[data-message-role="user"]'
            );
            const lastUserMessage = userMessageElements[
              userMessageElements.length - 1
            ] as HTMLElement;

            if (lastUserMessage) {
              lastUserMessage.scrollIntoView({
                behavior: "auto",
                block: "start",
                inline: "nearest",
              });
              setUserHasScrolled(true);

              // Mark this assistant message as scrolled
              assistantScrolledRef.current = lastMessage.id;
            }
          });
        });
      }
    }
  }, [messages]);

  const markdownComponents: Components = useMemo(
    () => ({
      h1: ({ children }) => (
        <h1 className="text-[2rem] leading-[2.4rem] font-medium text-[#1B1F26]">
          {children}
        </h1>
      ),
      h2: ({ children }) => (
        <h2 className="text-[1.6rem] leading-[2.4rem] tracking-[-0.64px] font-semibold text-[#1B1F26]">
          {children}
        </h2>
      ),
      h3: ({ children }) => (
        <h3 className="text-[1.5rem]  font-semibold text-[#1B1F26] leading-[2.4rem]">
          {children}
        </h3>
      ),
      p: ({ children }) => (
        <p className="text-[1.4rem] leading-[20px] text-[#1B1F26]">
          {children}
        </p>
      ),
      ul: ({ children }) => (
        <ul className="ml-8 list-disc mt space-y-[16px] text-[1.4rem] text-[#1B1F26]">
          {children}
        </ul>
      ),
      ol: ({ children }) => (
        <ol className="ml-8 list-decimal space-y-[16px] text-[1.4rem] text-[#1B1F26]">
          {children}
        </ol>
      ),
      li: ({ children }) => <li>{children}</li>,
      strong: ({ children }) => (
        <strong className="font-semibold text-[#1B1F26]]">{children}</strong>
      ),
      em: ({ children }) => (
        <em className="font-medium text-[#1B1F26]">{children}</em>
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
        <code className="rounded bg-[#efe6ff] px-1.5 py-0.5 text-[1.4rem] text-[#3a2763]">
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

  const sendMessage = async (rawMessage?: string, { silent = false } = {}) => {
    const trimmed = (rawMessage ?? inputValue).trim();
    if (!trimmed || trimmed.length > MAX_INPUT_LENGTH) {
      setError(
        trimmed.length > MAX_INPUT_LENGTH
          ? `Messages are limited to ${MAX_INPUT_LENGTH} characters.`
          : "Please enter a message."
      );
      return;
    }

    setError(null);
    setPendingSkinTypeQuiz(false);
    setIsSending(true);
    // Reset scroll tracking when sending new message
    setUserHasScrolled(false);

    if (rawMessage === undefined) {
      setInputValue("");
    }

    const optimisticId = `user-${Date.now()}`;
    if (!silent) {
      setMessages((prev) => [
        ...prev,
        { id: optimisticId, role: "user", content: trimmed },
      ]);
    }

    let assistantId: string | null = null;

    const newAssistantId = `assistant-${Date.now()}`;
    assistantId = newAssistantId;
    setMessages((prev) => [
      ...prev,
      { id: newAssistantId, role: "assistant", content: "" },
    ]);

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

      const updateAssistant = (patch: Partial<ChatMessage>) => {
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === newAssistantId
              ? {
                  ...(msg as ChatMessage),
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
      let finalRoutine: Routine | null = null;
      let finalResultType: string | null = null;
      let finalSummary: MessageSummary | null = null;

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
          resultType?: string;
          routine?: unknown;
          headline?: string;
          summary?: unknown;
        };

        if (payload.type === "delta" && typeof payload.token === "string") {
          accumulated += payload.token;
          updateAssistant({ content: accumulated });
          return;
        }

        if (payload.type === "summary" && payload.summary) {
          const normalizedSummary = normalizeSummary(payload.summary);
          if (normalizedSummary) {
            finalSummary = normalizedSummary;
            updateAssistant({ summary: normalizedSummary });
          }
          return;
        }

        if (payload.type === "products" && Array.isArray(payload.products)) {
          const normalizedProducts = normalizeProductArray(payload.products);
          if (normalizedProducts.length) {
            finalProducts = normalizedProducts;
            finalRoutine = null;
            finalResultType = null;
            updateAssistant({
              products: normalizedProducts,
              routine: undefined,
              resultType: undefined,
            });
          }
          return;
        }

        if (payload.type === "routine" && payload.routine) {
          const normalizedRoutine = normalizeRoutinePayload(payload.routine);
          if (normalizedRoutine) {
            finalRoutine = normalizedRoutine;
            finalResultType = "routine";
            finalProducts = [];
            updateAssistant({
              routine: normalizedRoutine,
              resultType: "routine",
              products: undefined,
            });
          }
          return;
        }

        if (payload.type === "skin_survey.start") {
          const freshQuiz = createInitialQuizState();
          setSkinQuiz(freshQuiz);
          setPendingSkinTypeQuiz(true);

          const firstQuestion = freshQuiz.questions.at(0);
          if (firstQuestion) {
            setMessages((prev) => [
              ...prev,
              {
                ...firstQuestion,
                id: `quiz-${Date.now()}`,
                role: freshQuiz.role,
              },
            ]);
          }
          // push quiz message to chat

          if (typeof payload.sessionId === "string") {
            finalSessionId = payload.sessionId;
          }
          if (assistantId) {
            setMessages((prev) => prev.filter((msg) => msg.id !== assistantId));
            assistantId = null;
          }
          return;
        }

        if (payload.type === "final") {
          if (typeof payload.reply === "string") {
            finalReply = payload.reply.trim();
          }
          if (payload.resultType === "routine" && payload.routine) {
            const normalizedRoutine = normalizeRoutinePayload(payload.routine);
            if (normalizedRoutine) {
              finalRoutine = normalizedRoutine;
              finalResultType = "routine";
              finalProducts = [];
            }
          } else if (Array.isArray(payload.products)) {
            finalProducts = normalizeProductArray(payload.products);
          }
          if (payload.summary) {
            const normalizedSummary = normalizeSummary(payload.summary);
            if (normalizedSummary) {
              finalSummary = normalizedSummary;
            }
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
      const routineResult = finalResultType === "routine" ? finalRoutine : null;
      const summary = finalSummary ?? undefined;

      updateAssistant({
        content: resolvedContent.length
          ? resolvedContent
          : finalResultType === "routine"
            ? "I pulled together a full routine—let me know if you want to tweak any step!"
            : "",
        products: hasProducts ? finalProducts : undefined,
        resultType: routineResult ? "routine" : undefined,
        routine: routineResult ?? undefined,
        summary,
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
    await sendMessage();
  };

  const handleSuggestion = async (suggestion: string) => {
    await sendMessage(suggestion);
  };

  const handleProductToPreview = (product: Product) => {
    setProductToPreview(product);
  };

  const lastAssistantMessageId = useMemo(() => {
    const reversed = [...messages].reverse();
    const found = reversed.find(
      (msg) => isChatMessage(msg) && msg.role === "assistant"
    );
    return found?.id;
  }, [messages]);

  // console.log(pendingSkinTypeQuiz, "This is pending skin type quiz");

  return (
    <Modal>
      <main className="flex h-[calc(100vh-45px)] overflow-hidden  flex-col font-['Inter'] text-[#2f1f53]">
        <Box
          className={`flex relative flex-1 min-h-0 w-full flex-col items-center ${!hasMessages && "justify-center"} px-8 `}
        >
          {/* conversation container */}
          <Box
            ref={conversationRef}
            className="w-full relative max-w-[67rem] flex-1 overflow-y-auto min-h-0 scroll-smooth no-scrollbar"
            // style={{ maxHeight: "calc(100vh - 220px)" }}
          >
            {/* {pendingSkinTypeQuiz && (
              <Box className="mb-6 rounded-3xl border border-[#d6c7ff] bg-[#f4edff] p-5 text-left text-[#2f1f53] shadow-sm">
                <h2 className="text-[1.6rem] font-semibold flex items-center gap-2">
                  <span role="img" aria-label="idea">
                    💡
                  </span>
                  Ready for a quick skin type quiz?
                </h2>
                <p className="mt-2 text-[1.4rem] leading-relaxed">
                  SkinBuddy can guide you through a short survey to understand
                  your skin type. (Photo-based analysis is coming soon!)
                </p>
                <div className="mt-4 flex gap-3">
                  <button
                    className="rounded-full bg-[#4b2fbf] px-4 py-2 text-[1.4rem] font-semibold text-white shadow-sm hover:bg-[#3f27a7] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#cbb6ff]"
                    onClick={() => {
                      // TODO: trigger quiz flow
                      setPendingSkinTypeQuiz(false);
                    }}
                  >
                    Start survey (coming soon)
                  </button>
                  <button
                    className="rounded-full border border-[#cbb6ff] px-4 py-2 text-[1.4rem] font-semibold text-[#4b2fbf] hover:bg-[#ede5ff] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#cbb6ff]"
                    onClick={() => setPendingSkinTypeQuiz(false)}
                  >
                    Dismiss
                  </button>
                </div>
              </Box>
            )} */}

            {!hasMessages && (
              <Box className="absolute top-[50%] w-full translate-y-[-50%]">
                {/* {products && products.length > 0 && (
                <ProductCard
                  onProductToPreview={handleProductToPreview}
                    inChat={true}
                    product={products[1]}
                  />
                )} */}

                <header className="text-center">
                  <h1 className="text-[3.8rem] mb-[20px] font-semibold tracking-[-0.02em] text-[#331d62] md:text-[4.6rem]">
                    How can I help you?
                  </h1>
                </header>

                <section className="space-y-3 rounded-3xl border border-transparent bg-white/80 backdrop-blur-md ">
                  {displayedSuggestions.map((suggestion) => (
                    <button
                      key={suggestion}
                      onClick={() => handleSuggestion(suggestion)}
                      className="flex w-full items-center justify-between rounded-[22px] px-5 py-4 text-left transition hover:bg-[#f2f2f2]"
                    >
                      <span className="font-medium tracking-[-0.01em]">
                        {suggestion}
                      </span>
                      <ArrowUpRight className="h-7 w-7 text-[#aaa]" />
                    </button>
                  ))}
                </section>
              </Box>
            )}

            <section className="mt-8 space-y-10">
              {messages.map((message, index) => (
                <Box
                  key={message.id}
                  className={` ${
                    message.role === "user"
                      ? "flex justify-end items-start"
                      : message.role === "assistant"
                        ? " flex justify-start"
                        : ""
                  }`}
                >
                  {isChatMessage(message) && message.role === "assistant" ? (
                    <Box
                      className={`w-full ${
                        message.id === assistantWithMinHeight
                          ? "min-h-[calc(100vh-200px)]"
                          : "h-auto"
                      }`}
                    >
                      {isChatMessage(message) &&
                      message.resultType === "routine" &&
                      message.routine?.steps?.length ? (
                        <Box className="mt-6 flex flex-col mb-[24px]">
                          {isChatMessage(message) &&
                          message.summary?.headline ? (
                            <Box className="mb-[0.8rem] flex flex-col gap-[1.6rem]">
                              <h3 className="text-[2rem] leading-[2.4rem] font-semibold text-[#1b1f26] flex gap-[0.6rem]">
                                {message.summary?.icon ? (
                                  <span>{message.summary.icon}</span>
                                ) : null}
                                {message.summary.headline}
                              </h3>
                            </Box>
                          ) : null}
                          <Box className="flex flex-col gap-[16px]">
                            {message.routine.steps.map(
                              (routine: RoutineStep) => {
                                const productKey = `${message.id}-routine-${routine.productId ?? routine.step}`;
                                return (
                                  <RoutineCard
                                    key={productKey}
                                    routine={routine}
                                    onProductToPreview={handleProductToPreview}
                                  />
                                );
                              }
                            )}
                          </Box>
                        </Box>
                      ) : isChatMessage(message) && message.products?.length ? (
                        <Box>
                          {isChatMessage(message) &&
                          message.summary?.headline ? (
                            <Box className="mb-[0.8rem] flex flex-col gap-[1.6rem]">
                              <h3 className="text-[2rem] leading-[2.4rem] font-medium text-[#1b1f26] flex gap-[0.6rem]">
                                {message.summary?.icon ? (
                                  <span>{message.summary.icon}</span>
                                ) : null}
                                {(() => {
                                  const heading =
                                    message.summary.headline.split(" ");
                                  const first =
                                    (heading.at(0)?.charAt(0)?.toUpperCase() ||
                                      "") +
                                    (heading.at(0)?.slice(1) || "") +
                                    " ";
                                  const remaining = heading.slice(1).join(" ");
                                  return first + remaining;
                                })()}
                              </h3>
                              {message.summary.subheading ? (
                                <p className="text-[1.4rem] text-[#1b1f26]">
                                  {message.summary.subheading}
                                </p>
                              ) : null}
                            </Box>
                          ) : null}

                          <Box className="mt-6 flex items-stretch gap-[1rem] overflow-auto mb-[20px]">
                            {message.products.map(
                              (product: Product, index: number) => {
                                const productKey = `${message.id}-${String(
                                  product._id ?? product.slug ?? index
                                )}`;
                                return (
                                  <Box
                                    key={productKey}
                                    className="min-w-[90%] md:min-w-[75%] flex"
                                  >
                                    <ProductCard
                                      onProductToPreview={
                                        handleProductToPreview
                                      }
                                      inChat={true}
                                      product={product}
                                    />
                                  </Box>
                                );
                              }
                            )}
                          </Box>
                        </Box>
                      ) : null}

                      {(() => {
                        const { body, suggestions } = extractSuggestedActions(
                          isChatMessage(message) ? message.content : ""
                        );
                        const markdownSource = body;
                        const isLastMessage = index + 1 === messages.length;
                        return (
                          <>
                            {markdownSource.length ? (
                              <ReactMarkdown
                                remarkPlugins={[remarkGfm]}
                                components={markdownComponents}
                                className="markdown space-y-[16px] text-[1.4rem] leading-relaxed tracking-[-0.008em]"
                              >
                                {markdownSource}
                              </ReactMarkdown>
                            ) : isTyping && isLastMessage ? (
                              <Box className="flex items-center gap-4">
                                <Box className="flex gap-2">
                                  <span className="h-2.5 w-2.5 animate-bounce rounded-full bg-[#1b1f26]" />
                                  <span className="h-2.5 w-2.5 animate-bounce rounded-full bg-[#1b1f26] [animation-delay:0.18s]" />
                                  <span className="h-2.5 w-2.5 animate-bounce rounded-full bg-[#1b1f26] [animation-delay:0.36s]" />
                                </Box>
                              </Box>
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
                                      className="text-start rounded-[8px] border-none focus-visible:border-none px-[16px] py-[10px] text-[1.4rem] bg-[#eef3ff] text-[#1b1f26] transition hover:bg-[#5377E1] hover:text-white disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-[#eef3ff] disabled:hover:text-[#1b1f26]"
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
                  ) : isChatMessage(message) && message.role === "user" ? (
                    (() => {
                      const msgAtIndex = messages.at(index);
                      const isSending =
                        index + 1 === messages.length &&
                        msgAtIndex !== undefined &&
                        isChatMessage(msgAtIndex) &&
                        msgAtIndex.role === "user" &&
                        !hasSent;
                      return (
                        <Box
                          ref={(el) => {
                            if (!el) return;
                            const lastMessage = messages.at(-1);
                            if (
                              index + 1 !== messages.length ||
                              lastMessage === undefined ||
                              !isChatMessage(lastMessage) ||
                              lastMessage.role !== "user"
                            ) {
                              return;
                            }

                            // Only position once per message ID
                            if (
                              userMessagePositionedRef.current === message.id
                            ) {
                              return;
                            }

                            // Scroll is now handled by the useEffect when assistant message appears
                            // Just mark this message as positioned
                            userMessagePositionedRef.current = message.id;
                          }}
                          data-message-role="user"
                          className={`max-w-[72%] rounded-[18px] ${isSending ? "bg-[#494c51]" : "bg-[#1b1f26]"} py-[8px] px-[16px] text-[1.4rem] leading-[1.5] text-white `}
                        >
                          {message.content}
                        </Box>
                      );
                    })()
                  ) : isQuizMessage(message) ? (
                    <Box>
                      <Box className="-tracking-[0.0175rem]">
                        <h4 className="text-[1.4rem] font-semibold leading-[1.8rem] ">
                          {/* {message.questions[message.index].header} */}
                          {message.header}
                        </h4>
                        <p className="text-[1.4rem] leading-relaxed">
                          {message.question}
                        </p>
                      </Box>

                      <div className="mt-4 flex flex-col gap-3">
                        {message.options.map((option) => {
                          const isSelected = message.selected === option;
                          const isLocked =
                            message.index < skinQuiz.currentIndex ||
                            !pendingSkinTypeQuiz;
                          const baseClasses =
                            "rounded-[8px] text-start px-[1.6rem] py-[2rem] text-[1.4rem]";
                          const activeClasses = isSelected
                            ? "bg-[#2159D9] text-white"
                            : "bg-[#EFF3FF] text-black";
                          const hoverClasses =
                            !isLocked && !isSelected
                              ? "hover:bg-[#4D78E1] hover:text-white"
                              : "";
                          return (
                            <button
                              key={option}
                              type="button"
                              disabled={isLocked}
                              className={`${baseClasses} ${activeClasses} ${hoverClasses} ${
                                isLocked ? "cursor-not-allowed opacity-70" : ""
                              }`}
                              onClick={() => {
                                if (isLocked) return;
                                setSkinQuiz((quiz) => ({
                                  ...quiz,
                                  questions: quiz.questions.map((q) =>
                                    q.index === message.index
                                      ? { ...q, selected: option }
                                      : q
                                  ),
                                }));

                                setMessages((prev) =>
                                  prev.map((msg) =>
                                    isQuizMessage(msg) && msg.id === message.id
                                      ? { ...msg, selected: option }
                                      : msg
                                  )
                                );
                              }}
                            >
                              {option}
                            </button>
                          );
                        })}
                      </div>
                    </Box>
                  ) : (
                    <Box>Unknown Message Type</Box>
                  )}
                </Box>
              ))}
            </section>
          </Box>
        </Box>
        <footer className="sticky bottom-0 z-[999] flex w-full justify-center px-4 bg-[linear-gradient(180deg,rgba(255,255,255,0)_0,rgba(255,255,255,1)_1rem,rgba(255,255,255,1))]">
          <Box className="w-full max-w-[80rem] rounded-t-[10px]  bg-white/95 px-6 shadow-[0_32px_70px_-38px_rgba(70,47,128,0.55)] backdrop-blur">
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <Box className="relative gap-4">
                <Box className="flex-1 ">
                  <Box className="relative">
                    {pendingSkinTypeQuiz ? (
                      <button
                        className="w-[58.33%] min-h-[40px] rounded-[20px] font-medium text-[14px] py-[10px] px-[24px] hover:bg-[#4876DE] bg-[#2958D9] disabled:bg-[#a5baef] text-white"
                        disabled={
                          !skinQuiz.questions[skinQuiz.currentIndex]?.selected
                        }
                        onClick={async () => {
                          const currentQuestion =
                            skinQuiz.questions[skinQuiz.currentIndex];
                          const answer = currentQuestion?.selected;
                          if (!currentQuestion || !answer) return;

                          setMessages((prev) => [
                            ...prev,
                            {
                              role: "user",
                              id: `quiz-answer-${currentQuestion.index}-${Date.now()}`,
                              content: answer,
                            },
                          ]);

                          if (
                            skinQuiz.currentIndex <
                            skinQuiz.questions.length - 1
                          ) {
                            const nextIndex = skinQuiz.currentIndex + 1;
                            const nextQuestion = skinQuiz.questions[nextIndex];

                            setSkinQuiz((prev) => ({
                              ...prev,
                              currentIndex: nextIndex,
                            }));

                            if (nextQuestion) {
                              setMessages((prev) => [
                                ...prev,
                                {
                                  ...nextQuestion,
                                  selected: nextQuestion.selected ?? undefined,
                                  id: `quiz-${Date.now()}`,
                                  role: skinQuiz.role,
                                },
                              ]);
                            }
                          } else {
                            const answers = skinQuiz.questions
                              .filter((question) => question.selected)
                              .map((question) => ({
                                question: question.question,
                                answer: question.selected as string,
                              }));

                            if (!answers.length) {
                              setPendingSkinTypeQuiz(false);
                              setSkinQuiz(createInitialQuizState());
                              return;
                            }

                            const promptPayload = JSON.stringify({
                              answers,
                            });

                            const prompt = `${QUIZ_RESULTS_SENTINEL}\n${promptPayload}`;

                            setPendingSkinTypeQuiz(false);
                            await sendMessage(prompt, { silent: true });
                            setSkinQuiz(createInitialQuizState());
                          }
                        }}
                      >
                        Send
                      </button>
                    ) : (
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
                              void sendMessage();
                            }
                          }
                        }}
                        ref={textareaRef}
                        className="resize-none rounded-[25px] py-[10px] pr-[40px] pl-[12px] bg-[#f2f2f2] leading-relaxed text-[#36255a] focus-visible:border-none"
                        maxLength={MAX_INPUT_LENGTH}
                        aria-label="Message input"
                        style={{ minHeight: "48px", maxHeight: "240px" }}
                      />
                    )}

                    <button
                      type="submit"
                      disabled={!canSubmit}
                      className="absolute right-[7px] bottom-[8.5px] flex h-12 w-12 items-center justify-center rounded-[18px] disabled:bg-[#dcdcdd] disabled:text-[#888]  bg-[#1b1f26] text-white shadow-lg shadow-[#f882b0]/35 transition hover:brightness-110 disabled:cursor-not-allowed disabled:from-[#f2b5c9] disabled:to-[#f2b5c9]"
                    >
                      <ArrowUpRight className="h-6 w-6 " />
                      <span className="sr-only">Send message</span>
                    </button>
                  </Box>

                  <Box className="mt-2 flex items-center justify-between text-[1.2rem] text-[#888]">
                    <span>
                      {!pendingSkinTypeQuiz &&
                        `${inputValue.trim().length} / ${MAX_INPUT_LENGTH}`}
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
              setUserHasScrolled(false);
            }}
            className="fixed text-white bottom-[90px] left-1/2 z-[1000] -translate-x-1/2 bg-[#1b1f26] h-[32px] w-[32px] flex items-center justify-center rounded-full shadow-lg shadow-[#f882b0]/35 cursor-pointer transition hover:brightness-110"
          >
            <IoChevronDownOutline className="text-[#fff] w-[20px] h-[20px]" />
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
                <h2 className="text-[#1b1f26] text-[2rem] font-medium my-[16px] ">
                  {product?.name}
                </h2>
                <p className="text-[2rem] font-medium leading-[24px] mb-[24px]">
                  {formatPrice(product?.sizes?.[0]?.price)}
                </p>
                <article className="gap-[16px] flex flex-col">
                  <p className="text-[1.4rem]">{product?.description}</p>
                  <ul className="gap-[16px] flex flex-col text-[1.4rem] list-disc ml-5">
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
                <button className="w-[95%] bg-[#1454d4] rounded-[20px] p-[10px] text-[1.4rem] flex items-center justify-center text-[#fff]">
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
