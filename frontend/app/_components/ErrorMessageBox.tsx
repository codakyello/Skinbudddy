"use client";

import { Box } from "@chakra-ui/react";
import { RefreshCw } from "lucide-react";

export function ErrorMessageBox({
  onRetry,
  isRetrying = false,
}: {
  onRetry: () => void;
  isRetrying?: boolean;
}) {
  return (
    <Box className="w-full max-w-[48rem] rounded-[1.6rem] border border-[#e5e7eb] bg-[#fafafa] p-[2rem] shadow-sm">
      <Box className="flex items-start gap-[1.6rem]">
        {/* Icon */}
        <Box className="flex-shrink-0 w-[4rem] h-[4rem] rounded-full bg-[#fee2e2] flex items-center justify-center">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#dc2626"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        </Box>

        {/* Content */}
        <Box className="flex-1 min-w-0">
          <h3 className="text-[1.6rem] font-semibold text-[#1b1f26] mb-[0.8rem]">
            Something went wrong
          </h3>
          <p className="text-[1.4rem] text-[#6b7280] leading-[1.6] mb-[1.6rem]">
            We couldn&apos;t process your request. Please try again.
          </p>

          {/* Retry Button */}
          <button
            onClick={onRetry}
            disabled={isRetrying}
            className="inline-flex items-center gap-[0.8rem] px-[1.6rem] py-[0.8rem] bg-[#1454d4] hover:bg-[#0f3da8] disabled:bg-[#9ca3af] disabled:cursor-not-allowed text-white text-[1.4rem] font-medium rounded-[0.8rem] transition-colors"
            type="button"
          >
            <RefreshCw
              className={`h-[1.6rem] w-[1.6rem] ${isRetrying ? "animate-spin" : ""}`}
            />
            {isRetrying ? "Retrying..." : "Retry"}
          </button>
        </Box>
      </Box>
    </Box>
  );
}
