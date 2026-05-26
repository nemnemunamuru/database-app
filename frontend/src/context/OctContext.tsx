import { createContext, useContext, useState } from "react";
import type { ReactNode } from "react";

interface OctContextValue {
  isOctWaiting: boolean;
  setOctWaiting: (v: boolean) => void;
}

const OctContext = createContext<OctContextValue>({
  isOctWaiting: false,
  setOctWaiting: () => {},
});

export function OctProvider({ children }: { children: ReactNode }) {
  const [isOctWaiting, setOctWaiting] = useState(false);
  return (
    <OctContext.Provider value={{ isOctWaiting, setOctWaiting }}>
      {children}
    </OctContext.Provider>
  );
}

export const useOct = () => useContext(OctContext);
