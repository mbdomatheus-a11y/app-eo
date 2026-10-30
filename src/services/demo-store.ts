import { initialState, type DemoState } from "../core/domain";

const KEY = "app-eo:demo:v1";
export function loadDemo(): DemoState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return initialState();
    const value = JSON.parse(raw);
    if (
      value.schema !== 1 ||
      !Array.isArray(value.notices) ||
      !Array.isArray(value.receipts) ||
      !Array.isArray(value.events) ||
      !Array.isArray(value.completed) ||
      !Array.isArray(value.disabledModules) ||
      typeof value.logo !== "string"
    )
      return initialState();
    return value as DemoState;
  } catch {
    return initialState();
  }
}
export function saveDemo(value: DemoState): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}
