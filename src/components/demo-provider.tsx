"use client";
import {
  createContext,
  useContext,
  useReducer,
  useEffect,
  useState,
  useCallback,
  type Dispatch,
  type ReactNode,
} from "react";
import { Toaster, toast } from "sonner";
import {
  resetGuardDemo,
  onGuardDemoCompleted,
} from "@/features/guard/demo-session";
import { initialState } from "@/data/demo";
import { demoReducer } from "@/domain/demo";
import type { DemoAction, DemoState } from "@/domain/types";
const Context = createContext<{
  state: DemoState;
  dispatch: Dispatch<DemoAction>;
  resetVersion: number;
  dark: boolean;
  setDark: (value: boolean) => void;
} | null>(null);
export function DemoProvider({ children }: { children: ReactNode }) {
  const [state, reducerDispatch] = useReducer(
    demoReducer,
    undefined,
    initialState,
  );
  const [resetVersion, setResetVersion] = useState(0);
  const dispatch = useCallback<Dispatch<DemoAction>>((action) => {
    if (action.type === "reset") {
      resetGuardDemo();
      setResetVersion((version) => version + 1);
    }
    reducerDispatch(action);
  }, []);
  useEffect(
    () => onGuardDemoCompleted(() => reducerDispatch({ type: "scan" })),
    [],
  );
  const [dark, setDark] = useState(false);
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
  }, [dark]);
  return (
    <Context.Provider value={{ state, dispatch, resetVersion, dark, setDark }}>
      {children}
      <Toaster
        position="bottom-right"
        theme={dark ? "dark" : "light"}
        richColors
        closeButton
      />
    </Context.Provider>
  );
}
export function useDemo() {
  const context = useContext(Context);
  if (!context) throw new Error("DemoProvider required");
  return context;
}
export { toast };
