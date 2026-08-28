import { actionBus } from "./actionBus";
import type { Action } from "../types";
import {
  classifyForwardTap,
  FORWARD_DOUBLE_TAP_MS,
} from "../game/collision";

const STORAGE_KEY = "wipeout.keymap";

const DEFAULT_MAP: Record<string, Action> = {
  ArrowUp: "forward",
  ArrowDown: "back",
  ArrowLeft: "left",
  ArrowRight: "right",
  Space: "jump",
  // Common alternates so most HID remotes and keyboards work out of the box.
  KeyW: "forward",
  KeyS: "back",
  KeyA: "left",
  KeyD: "right",
  MediaPlayPause: "jump",
};

let keymap: Record<string, Action> = loadKeymap();
let pendingForwardAt: number | null = null;
let pendingForwardTimer: number | null = null;

function loadKeymap(): Record<string, Action> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const merged = { ...DEFAULT_MAP, ...JSON.parse(raw) };
      // Leap is double-tap up now; don't keep a leftover Enter binding.
      if (merged.Enter === "jump") delete merged.Enter;
      if (merged.NumpadEnter === "jump") delete merged.NumpadEnter;
      return merged;
    }
  } catch {
    // corrupted storage: fall through to defaults
  }
  return { ...DEFAULT_MAP };
}

function clearPendingForward(): void {
  if (pendingForwardTimer !== null) {
    window.clearTimeout(pendingForwardTimer);
    pendingForwardTimer = null;
  }
  pendingForwardAt = null;
}

function emitForward(): void {
  pendingForwardTimer = null;
  pendingForwardAt = null;
  actionBus.emit("forward", "remote");
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
  isPlaying?: () => boolean,
): void {
  window.addEventListener("keydown", (e) => {
    if (e.repeat) return;
    if (onRawKey?.(e)) return;

    if (e.code === "Enter" || e.code === "NumpadEnter") {
      e.preventDefault();
      // Menus still use OK/Enter. During a run, leap is double-tap up.
      if (!isPlaying?.()) {
        clearPendingForward();
        actionBus.emit("jump", "remote");
      }
      return;
    }

    const action = keymap[e.code];
    if (!action) return;
    e.preventDefault();

    if (action === "forward" && isPlaying?.()) {
      const now = performance.now();
      if (classifyForwardTap(now, pendingForwardAt) === "jump") {
        clearPendingForward();
        actionBus.emit("jump", "remote");
        return;
      }
      pendingForwardAt = now;
      if (pendingForwardTimer !== null) window.clearTimeout(pendingForwardTimer);
      pendingForwardTimer = window.setTimeout(emitForward, FORWARD_DOUBLE_TAP_MS);
      return;
    }

    clearPendingForward();
    actionBus.emit(action, "remote");
  });
}
