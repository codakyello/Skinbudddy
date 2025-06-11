import { useEffect, useState } from "react";
import { getOrCreateAnonymousId } from "../_utils/utils";

export function useAnonymousId() {
  const [anonId, setAnonId] = useState<string | null>(null);

  useEffect(() => {
    const id = getOrCreateAnonymousId();
    setAnonId(id);
  }, []);

  return anonId;
}
