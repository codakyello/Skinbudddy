"use client";

import { Box } from "@chakra-ui/react";
import { RefreshCw } from "lucide-react";

export function ErrorMessageBox({
  title = "Something went wrong",
  message = "Please try again later",
  onRetry,
  isRetrying = false,
}: {
  title?: string;
  message?: string;
  onRetry: () => void;
  isRetrying?: boolean;
}) {
  return (
    <Box className="w-fit rounded-[2rem] bg-[#FFF0F0] border border-[#FECACA] p-[1.6rem] pr-[3.2rem]">
      <Box className="flex flex-col items-start gap-[0.4rem]">
        <h3 className="text-[1.5rem] font-semibold text-[#111827] leading-tight tracking-tight">
          {title}
        </h3>
        <p className="text-[1.4rem] text-[#6B7280] leading-[1.4] opacity-90">
          {message}
        </p>

        <button
          onClick={onRetry}
          disabled={isRetrying}
          className="mt-[0.8rem] inline-flex items-center gap-[0.6rem] px-[1.4rem] py-[0.8rem] bg-[#0000000D] hover:bg-[#00000015] active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed text-[#1F2937] text-[1.3rem] font-medium rounded-full transition-all"
          type="button"
        >
          <RefreshCw
            className={`h-[1.4rem] w-[1.4rem] ${isRetrying ? "animate-spin" : ""}`}
            strokeWidth={2}
          />
          {isRetrying ? "Retrying..." : "Retry"}
        </button>
      </Box>
    </Box>
  );
}
