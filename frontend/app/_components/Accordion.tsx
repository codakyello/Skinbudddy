"use client";
import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  ReactElement,
  cloneElement,
  ReactNode,
  useEffect,
  useRef,
} from "react";
// import { ChevronDown, ChevronUp } from "lucide-react";

// Types
interface AccordionState {
  [accordionId: string]: {
    [itemId: string]: boolean;
  };
}

interface AccordionContextValue {
  open: (name: string) => void;
  close: () => void;
  isOpen: string;
  toggle: (name: string) => void;
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
  const [isOpen, setOpen] = useState("");

  const open = setOpen;
  const close = () => {
    setOpen("");
  };

  function toggle(name: string) {
    //   if (isOpen !== name) open(name);
    //   else close();
    open((prev) => (prev === name ? "" : name));
  }

  const value: AccordionContextValue = {
    open,
    close,
    isOpen,
    toggle,
  };

  return (
    <AccordionContext.Provider value={value}>
      {children}
    </AccordionContext.Provider>
  );
};

// Accordion Component Props
interface AccordionProps {
  id: string;
  children: React.ReactNode;
  className?: string;
  allowMultiple?: boolean;
}

interface AccordionItemProps {
  id: string;
  title: string;
  children: React.ReactNode;
  className?: string;
  headerClassName?: string;
  contentClassName?: string;
  disabled?: boolean;
}

export function AccordionOpen({
  children,
  name,
}: {
  children: ReactElement;
  name: string;
}) {
  const context = useContext(AccordionContext);

  if (!context) return null;

  const { toggle } = context;

  return cloneElement(children, {
    onClick: () => {
      toggle(name);
    },
    openName: name,
  });
}

export function AccordionBody({
  name,
  children,
}: {
  name: string;
  children: ReactNode;
}) {
  const contentRef = useRef<HTMLDivElement>(null);

  const { isOpen } = useAccordion();
  useEffect(() => {
    if (contentRef.current) {
      const el = contentRef.current;
      if (isOpen === name) {
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

export function AccordionIcon({
  onClick,
  openName,
}: {
  onClick?: () => void;
  openName?: string;
}) {
  const { isOpen } = useAccordion();

  return (
    <button
      onClick={onClick}
      className={`transition-transform duration-500 ease-in-out ${
        openName === isOpen ? "rotate-[360deg]" : "rotate-0"
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
            openName === isOpen ? "scale-0 opacity-0" : "scale-100 opacity-100"
          }`}
        />
      </svg>
    </button>
  );
}
