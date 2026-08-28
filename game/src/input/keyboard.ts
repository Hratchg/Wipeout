import { actionBus } from "./actionBus";
import type { Action } from "../types";

const STORAGE_KEY = "wipeout.keymap";

const DEFAULT_MAP: Record<string, Action> = {
  ArrowUp: "forward",
  ArrowDown: "back",
  ArrowLeft: "left",
  ArrowRight: "right",
  Enter: "jump",
  NumpadEnter: "jump",
  Space: "jump",
  // Common alternates so most HID remotes and keyboards work out of the box.
  KeyW: "forward",
  KeyS: "back",
  KeyA: "left",
  KeyD: "right",
  MediaPlayPause: "jump",
};

let keymap: Record<string, Action> = loadKeymap();

function loadKeymap(): Record<string, Action> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...DEFAULT_MAP, ...JSON.parse(raw) };
  } catch {
    // corrupted storage: fall through to defaults
  }
  return { ...DEFAULT_MAP };
}

export function bindKey(code: string, action: Action): void {
  keymap[code] = action;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const custom = raw ? JSON.parse(raw) : {};
    custom[code] = action;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(custom));
  } catch {
    // storage unavailable: binding still works for this session
  }
}

export function resetKeymap(): void {
  keymap = { ...DEFAULT_MAP };
  localStorage.removeItem(STORAGE_KEY);
}

export function actionForCode(code: string): Action | undefined {
  return keymap[code];
}

/**
 * Starts listening for key events. `onRawKey` fires for every keydown
 * (used by the keycode-discovery overlay), before action mapping.
 * If it returns true, the event is considered consumed and no action fires.
 */
export function initKeyboard(
  onRawKey?: (e: KeyboardEvent) => boolean | void,
): void {
  window.addEventListener("keydown", (e) => {
    if (e.repeat) return;
    if (onRawKey?.(e)) return;
    const action = keymap[e.code];
    if (action) {
      e.preventDefault();
      actionBus.emit(action, "remote");
    }
  });
}
