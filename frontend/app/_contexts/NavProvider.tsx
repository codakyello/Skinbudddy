"use client";
import React, { createContext, useState, useContext, ReactNode } from "react";

// Define the shape of the context
interface NavContextType {
  isOpen: boolean;
  openNav: () => void;
  closeNav: () => void;
  toggleNav: () => void;
}

// Create the context with a default value
const NavContext = createContext<NavContextType | undefined>(undefined);

// Define the props for the provider
interface NavProviderProps {
  children: ReactNode;
}

// Provider component
export const NavProvider: React.FC<NavProviderProps> = ({ children }) => {
  const [isOpen, setOpen] = useState<boolean>(false);

  const openNav = () => {
    setOpen(true);

    document.body.classList.add("open");
  };
  const closeNav = () => {
    setOpen(false);

    document.body.classList.remove("open");
  };

  const toggleNav = () => {
    setOpen((prev) => !prev);

    document.body.classList.toggle("open");
  };

  return (
    <NavContext.Provider value={{ isOpen, openNav, closeNav, toggleNav }}>
      {children}
    </NavContext.Provider>
  );
};

// Custom hook to use the NavContext
export const useNav = (): NavContextType => {
  const context = useContext(NavContext);
  if (!context) {
    throw new Error("useNav must be used within a NavProvider");
  }
  return context;
};
