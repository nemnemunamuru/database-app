import { createContext, useContext, useState, useCallback, ReactNode } from "react";

interface UndoContextValue {
  undoLabel: string;
  canUndo: boolean;
  registerUndo: (label: string, fn: () => Promise<void>) => void;
  executeUndo: () => Promise<void>;
}

const UndoContext = createContext<UndoContextValue>({
  undoLabel: "", canUndo: false,
  registerUndo: () => {},
  executeUndo: async () => {},
});

export function UndoProvider({ children }: { children: ReactNode }) {
  const [undoFn, setUndoFn]       = useState<(() => Promise<void>) | null>(null);
  const [undoLabel, setUndoLabel] = useState("");

  const registerUndo = useCallback((label: string, fn: () => Promise<void>) => {
    setUndoLabel(label);
    setUndoFn(() => fn);
  }, []);

  const executeUndo = useCallback(async () => {
    if (!undoFn) return;
    const fn = undoFn;
    setUndoFn(null);
    setUndoLabel("");
    await fn();
  }, [undoFn]);

  return (
    <UndoContext.Provider value={{ undoLabel, canUndo: !!undoFn, registerUndo, executeUndo }}>
      {children}
    </UndoContext.Provider>
  );
}

export const useUndo = () => useContext(UndoContext);
