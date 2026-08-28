import type { Action, InputSource } from "../types";

type Listener = (action: Action, source: InputSource) => void;

const enabledSources = new Set<InputSource>(["remote"]);
const listeners = new Set<Listener>();

export const actionBus = {
  emit(action: Action, source: InputSource): void {
    if (!enabledSources.has(source)) return;
    for (const listener of listeners) listener(action, source);
  },

  on(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  setEnabled(source: InputSource, on: boolean): void {
    if (on) enabledSources.add(source);
    else enabledSources.delete(source);
  },

  isEnabled(source: InputSource): boolean {
    return enabledSources.has(source);
  },
};
