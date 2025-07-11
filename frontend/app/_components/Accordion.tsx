"use client";
import { Box } from "@chakra-ui/react";
import React, {
  createContext,
  useContext,
  useState,
  ReactElement,
  cloneElement,
  ReactNode,
  useEffect,
  useRef,
} from "react";
// import { ChevronDown, ChevronUp } from "lucide-react";

// Types
// interface AccordionState {
//   [accordionId: string]: {
//     [itemId: string]: boolean;
//   };
// }

interface AccordionContextValue {
  close: () => void;
  // openStates: { [key: string]: boolean };
  toggle: () => void;
  isOpen: boolean;
}

// Context
const AccordionContext = createContext<AccordionContextValue | undefined>(
  undefined
);

// Hook to use accordion context
export const useAccordion = () => {
  const context = useContext(AccordionContext);
  if (!context) {
    throw new Error("useAccordion must be used within an AccordionProvider");
  }
  return context;
};

// Provider Props
interface AccordionProviderProps {
  children: React.ReactNode;
  defaultOpen?: { [accordionId: string]: string[] };
}

// Provider Component
export const Accordion: React.FC<AccordionProviderProps> = ({ children }) => {
  const [isOpen, setOpen] = useState(false);
  // const [openStates, setOpenStates] = useState<{ [key: string]: boolean }>({});

  const open = setOpen;
  // const close = () => {
  //   setOpen("");
  // };
  // const toggle = (type: string) => {
  // setOpenStates((prev) => ({
  //   ...prev,
  //   [type]: !prev[type],
  // }));
  // };
  function toggle() {
    // //   if (isOpen !== name) open(name);
    // //   else close();
    // open((prev) => (prev === name ? "" : name));
    open((prev) => !prev);
  }

  const value: AccordionContextValue = {
    close,
    toggle,
    isOpen,
  };

  return (
    <AccordionContext.Provider value={value}>
      {children}
    </AccordionContext.Provider>
  );
};

// Accordion Component Props
// interface AccordionProps {
//   id: string;
//   children: React.ReactNode;
//   className?: string;
//   allowMultiple?: boolean;
// }

// interface AccordionItemProps {
//   id: string;
//   title: string;
//   children: React.ReactNode;
//   className?: string;
//   headerClassName?: string;
//   contentClassName?: string;
//   disabled?: boolean;
// }

export function AccordionOpen({ children }: { children: ReactElement }) {
  const context = useContext(AccordionContext);

  if (!context) return null;

  const { toggle } = context;

  return (
    <Box className="cursor-pointer">
      {cloneElement(children, {
        onClick: toggle,
      })}
    </Box>
  );
}

export function AccordionBody({ children }: { children: ReactNode }) {
  const contentRef = useRef<HTMLDivElement>(null);

  const { isOpen } = useAccordion();
  useEffect(() => {
    if (contentRef.current) {
      const el = contentRef.current;
      if (isOpen) {
        el.style.maxHeight = el.scrollHeight + "px";
      } else {
        el.style.maxHeight = "0px";
      }
    }
  });

  return (
    <div
      ref={contentRef}
      // style={{ height: isOpen ? "auto" : "0px" }}
      className={`overflow-hidden max-h-0 transition-max-height duration-[300ms] ease-in-out
      `}
    >
      {children}
    </div>
  );
}

export function AccordionIcon() {
  const { isOpen } = useAccordion();

  return (
    <button
      className={`transition-transform duration-500 ease-in-out ${
        isOpen ? "rotate-[360deg]" : "rotate-0"
      }`}
    >
      <svg
        width="20"
        height="20"
        viewBox="0 0 20 20"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="transition-transform duration-500 ease-in-out"
      >
        {/* Horizontal line - always visible */}
        <path
          fillRule="evenodd"
          clipRule="evenodd"
          d="M19 10.5H1V9.5H19V10.5Z"
          fill="#666666"
        />
        {/* Vertical line - animated to show/hide */}
        <path
          fillRule="evenodd"
          clipRule="evenodd"
          d="M10.5 1V19H9.5V1H10.5Z"
          fill="#666666"
          className={`transition-all duration-500 ease-in-out origin-center ${
            isOpen ? "scale-0 opacity-0" : "scale-100 opacity-100"
          }`}
        />
      </svg>
    </button>
  );
}
