// create a context for the tabs
"use client";
import { Box } from "@chakra-ui/react";
import { useRouter, useSearchParams } from "next/navigation";
import type React from "react";
import { cloneElement, createContext, useContext, useState } from "react";
// Define the type for the context value
interface TabsContextType {
  activeTab: string;
  handleTabClick: (tab: string) => void;
}

const TabsContext = createContext<TabsContextType | undefined>(undefined);

export const Tabs = ({
  children,
  defaultTab = "",
  state = "url",
  name = "tab",
}: {
  children: React.ReactNode;
  defaultTab?: string;
  state?: "url" | "local";
  name?: string;
}) => {
  // const [activeTab, setActiveTab] = useState(defaultTab)

  const searchParams = useSearchParams();

  const [activeTabLocal, setActiveTab] = useState(defaultTab);

  const activeTab =
    state === "url"
      ? searchParams.get(name || "") || defaultTab
      : activeTabLocal;

  const router = useRouter();

  const handleTabClick = (tab: string) => {
    if (state === "url") {
      const params = new URLSearchParams(searchParams);
      params.set("tab", tab);
      const pathname = window.location.pathname;
      router.push(`${pathname}?${params.toString()}`);
    } else {
      setActiveTab(tab);
    }
  };

  // useEffect(() => {
  //   setActiveTab(defaultTab);
  // }, [defaultTab]);

  return (
    <TabsContext.Provider value={{ activeTab, handleTabClick }}>
      {children}
    </TabsContext.Provider>
  );
};

export const TabWindow = ({
  children,
  tab,
}: {
  children: React.ReactNode;
  tab: string;
}) => {
  const { activeTab } = useTabs();

  if (activeTab !== tab) {
    return null;
  }
  return children;
};

export const Tab = ({
  title,
  tab,
  number,
  type = "bg",
  className,
  children,
}: {
  title?: string;
  tab: string;
  number?: number;
  type?: "no-bg" | "bg";
  className?: string;
  children?: React.ReactElement;
}) => {
  const { activeTab, handleTabClick } = useTabs();

  return children ? (
    cloneElement(
      children as React.ReactElement<{
        onClick?: () => void;
        active?: boolean;
      }>,
      {
        onClick: () => handleTabClick(tab),
        active: activeTab === tab,
      }
    )
  ) : (
    <button
      type="button"
      className={`whitespace-nowrap text-[12px] rounded-[5px]  px-[15px] py-[10.5px] ${number !== undefined ? "flex" : ""} items-center justify-between gap-[5px] ${activeTab === tab ? "!bg-primary !text-white" : type === "bg" ? "bg-secondary border border-[#72B13A]/50" : "text-[#797979]"} ${className}`}
      onClick={() => handleTabClick(tab)}
    >
      <span className="">{title}</span>
      {number !== undefined ? (
        <span
          className={` flex items-center justify-center ${activeTab === tab ? "bg-white text-black" : "bg-primary text-white"} rounded-[1000px] w-[30px] h-[22px] px-2 py-1`}
        >
          {number}
        </span>
      ) : null}
    </button>
  );
};

export function TabHeader({
  number,
  title,
  active,
  onClick,
}: {
  number?: number;
  title?: string;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <Box
      onClick={onClick}
      className="cursor-pointer flex items-center gap-[1.5rem]"
    >
      <Box
        className={`text-[1.4rem] font-semibold w-[4rem] h-[4rem] flex items-center justify-center  rounded-full ${active ? "bg-black text-white" : "bg-[#eaedf0] text-black"}`}
      >
        {number}
      </Box>
      <p className="uppercase font-semibold text-[1.4rem]">{title}</p>
    </Box>
  );
}

export default function useTabs() {
  const context = useContext(TabsContext);
  if (!context) {
    throw new Error("useTabs must be used within a TabsProvider");
  }
  return context;
}
