"use client";

import { Box } from "@chakra-ui/react";
import { RefreshCw } from "lucide-react";

export function ErrorMessageBox({
  title = "Unable to complete request",
  message = "We encountered a temporary issue. Please try again.",
  onRetry,
  isRetrying = false,
}: {
  title?: string;
  message?: string;
  onRetry: () => void;
  isRetrying?: boolean;
}) {
  return (
    <Box className="w-[42rem] rounded-[1.2rem] border border-[#e5e7eb] bg-white p-[2rem] shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
      <Box className="flex gap-[1.6rem]">
        {/* Icon Container */}
        <Box className="flex-shrink-0 w-[4.4rem] h-[4.4rem] rounded-full bg-[#FEF2F2] flex items-center justify-center border border-[#FEE2E2]">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#DC2626"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
        </Box>

        {/* Content */}
        <Box className="flex-1 min-w-0 pt-[0.2rem]">
          <h3 className="text-[1.5rem] font-medium text-[#111827] mb-[0.6rem] leading-none">
            {title}
          </h3>
          <p className="text-[1.4rem] text-[#6B7280] leading-[1.5] mb-[1.8rem]">
            {message}
          </p>

          {/* Action Row */}
          <Box className="flex items-center gap-[1.2rem]">
            <button
              onClick={onRetry}
              disabled={isRetrying}
              className="inline-flex items-center gap-[0.8rem] px-[1.4rem] py-[0.8rem] bg-[#111827] hover:bg-black disabled:bg-[#9CA3AF] disabled:cursor-not-allowed text-white text-[1.3rem] font-medium rounded-[0.8rem] transition-all shadow-sm active:scale-95"
              type="button"
            >
              <RefreshCw
                className={`h-[1.4rem] w-[1.4rem] ${isRetrying ? "animate-spin" : ""}`}
              />
              {isRetrying ? "Retrying..." : "Try again"}
            </button>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
