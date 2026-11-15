import { createContext, type ReactNode } from "react";
import type { ModuleIconOverrides } from "./app-icons";

export const IconOverridesContext = createContext<ModuleIconOverrides>({});
export function IconOverridesProvider({
  value,
  children,
}: {
  value: ModuleIconOverrides;
  children: ReactNode;
}) {
  return (
    <IconOverridesContext.Provider value={value}>
      {children}
    </IconOverridesContext.Provider>
  );
}
