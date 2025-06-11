import { useEffect, useState } from "react";

export default function useSticky(position: number) {
  const [isSticky, setIsSticky] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      const offset = window.scrollY;
      console.log(offset);

      setIsSticky(offset > position);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return { isSticky };
}
