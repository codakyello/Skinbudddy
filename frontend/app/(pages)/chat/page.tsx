/* eslint-disable react-hooks/exhaustive-deps */
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { ArrowUpRight, ChevronDown, Search } from "lucide-react";
import { useUser } from "@/app/_contexts/CreateConvexUser";

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
};

const MAX_INPUT_LENGTH = 600;

export default function ChatPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showTyping, setShowTyping] = useState(false);
  const scrollAnchorRef = useRef<HTMLDivElement | null>(null);

  const markdownComponents: Components = useMemo(
    () => ({
      h1: ({ children }) => (
        <h1 className="text-[20px] font-semibold text-slate-900">{children}</h1>
      ),
      h2: ({ children }) => (
        <h2 className="text-[18px] font-semibold text-slate-900">{children}</h2>
      ),
      h3: ({ children }) => (
        <h3 className="text-[17px] font-semibold text-slate-900">{children}</h3>
      ),
      p: ({ children }) => (
        <p className="text-[16px] leading-relaxed text-slate-700">{children}</p>
      ),
      ul: ({ children }) => (
        <ul className="ml-5 list-disc space-y-1 text-[16px] text-slate-700">
          {children}
        </ul>
      ),
      ol: ({ children }) => (
        <ol className="ml-5 list-decimal space-y-1 text-[16px] text-slate-700">
          {children}
        </ol>
      ),
      li: ({ children }) => <li>{children}</li>,
      strong: ({ children }) => (
        <strong className="font-semibold text-slate-900">{children}</strong>
      ),
      em: ({ children }) => (
        <em className="font-medium text-rose-500">{children}</em>
      ),
      a: ({ children, href }) => (
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className="text-rose-500 underline underline-offset-2 hover:text-rose-600"
        >
          {children}
        </a>
      ),
      code: ({ children }) => (
        <code className="rounded bg-slate-100 px-1.5 py-0.5 text-[14px]">
          {children}
        </code>
      ),
    }),
    []
  );
  const { user } = useUser();

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

      if (!response.ok) {
        throw new Error("Failed to reach the assistant.");
      }

      const data = await response.json();
      if (!data.success) {
        throw new Error(data.message ?? "Assistant could not respond.");
      }

      if (data.sessionId) {
        setSessionId(data.sessionId as string);
      }

      const reply: string | undefined = data.result?.reply;
      if (reply && reply.trim().length) {
        setMessages((prev) => [
          ...prev,
          {
            id: `assistant-${Date.now()}`,
            role: "assistant",
            content: reply.trim(),
          },
        ]);
      }
    } catch (err) {
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
    <main className="flex min-h-screen flex-col bg-[#f5f5f5]">
      <div className="flex flex-1 flex-col items-center px-6 pb-32 pt-24">
        <div className="w-full max-w-[78rem]">
          <header className="text-center">
            <h1 className="text-[36px] font-semibold text-slate-900 md:text-[42px]">
              How can I help you?
            </h1>
          </header>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            {TOPICS.map((topic) => (
              <button
                key={topic}
                className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-5 py-2.5 text-[16px] font-medium text-slate-700 transition hover:border-slate-300 hover:shadow-sm"
              >
                {topic}
              </button>
            ))}
          </div>

          {messages.length === 0 ? (
            <section className="mt-12 space-y-3 rounded-3xl border border-transparent bg-white/60 p-7 backdrop-blur-sm shadow-sm">
              {SUGGESTIONS.map((suggestion) => (
                <button
                  key={suggestion}
                  onClick={() => handleSuggestion(suggestion)}
                  className="flex w-full items-center justify-between rounded-2xl px-5 py-4 text-left text-slate-700 transition hover:bg-slate-100/80"
                >
                  <span className="text-[18px] font-medium">{suggestion}</span>
                  <ArrowUpRight className="h-5 w-5 text-slate-400" />
                </button>
              ))}
            </section>
          ) : (
            <section className="mt-12 space-y-4">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex ${
                    message.role === "user" ? "justify-end" : "justify-start"
                  }`}
                >
                  <div
                    className={`max-w-[78%] rounded-3xl px-5 py-4 text-[16px] leading-relaxed ${
                      message.role === "user"
                        ? "rounded-br-md bg-rose-400 text-white shadow-md"
                        : "rounded-bl-md bg-white text-slate-800 shadow-sm"
                    }`}
                  >
                    {message.role === "assistant" ? (
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={markdownComponents}
                        className="markdown space-y-3"
                      >
                        {message.content}
                      </ReactMarkdown>
                    ) : (
                      <p className="text-[16px] leading-relaxed text-white">
                        {message.content}
                      </p>
                    )}
                  </div>
                </div>
              ))}
              {showTyping && (
                <div className="flex justify-start">
                  <div className="flex items-center gap-3 rounded-3xl rounded-bl-md bg-white px-5 py-4 text-[16px] text-slate-500 shadow-sm">
                    {/* <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-rose-100">
                      <span className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-rose-300 border-t-rose-500/80 animate-spin" />
                    </span> */}
                    <div className="flex gap-2">
                      <span className="h-2.5 w-2.5 animate-bounce rounded-full bg-rose-400" />
                      <span className="h-2.5 w-2.5 animate-bounce rounded-full bg-rose-400 [animation-delay:0.18s]" />
                      <span className="h-2.5 w-2.5 animate-bounce rounded-full bg-rose-400 [animation-delay:0.36s]" />
                    </div>
                  </div>
                </div>
              )}
              <div ref={scrollAnchorRef} />
            </section>
          )}
        </div>
      </div>

      <footer className="sticky bottom-0 flex w-full justify-center bg-gradient-to-t from-white via-white to-transparent pb-8 pt-6">
        <div className="w-full max-w-3xl rounded-[28px] border border-slate-200 bg-white p-6 shadow-lg">
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <div className="flex items-start gap-3">
              <div className="flex-1">
                <input
                  type="text"
                  placeholder="Type your message here…"
                  value={inputValue}
                  onChange={(event) => {
                    const value = event.target.value;
                    if (value.length <= MAX_INPUT_LENGTH) {
                      setInputValue(value);
                      if (error) setError(null);
                    }
                  }}
                  className="h-14 w-full rounded-2xl border border-slate-200 px-5 text-[16px] text-slate-700 placeholder:text-slate-400 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
                  maxLength={MAX_INPUT_LENGTH}
                  aria-label="Message input"
                />
                <div className="mt-1 flex items-center justify-between text-[12px] text-slate-500">
                  <span>
                    {inputValue.trim().length} / {MAX_INPUT_LENGTH}
                  </span>
                  {error && <span className="text-rose-500">{error}</span>}
                </div>
              </div>

              <button
                type="submit"
                disabled={!canSubmit}
                className="flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-400 text-white transition hover:bg-rose-500 disabled:cursor-not-allowed disabled:bg-rose-200"
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
