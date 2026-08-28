import { actionBus } from "./actionBus";
import type { Action } from "../types";

export interface CvStatus {
  state: "off" | "connecting" | "connected" | "tracking" | "no-person" | "calibrating";
  message?: string;
}

const VALID_ACTIONS = new Set<Action>([
  "jump",
  "left",
  "right",
  "forward",
  "back",
]);

const RECONNECT_MS = 2000;

type StatusCallback = (status: CvStatus) => void;

let socket: WebSocket | null = null;
let active = false;
let statusCb: StatusCallback = () => {};

function wsUrl(): string {
  // The input service runs on the same machine that serves/displays the game.
  return `ws://${location.hostname || "localhost"}:8765`;
}

export function onCvStatus(cb: StatusCallback): void {
  statusCb = cb;
}

function connect(): void {
  if (!active) return;
  statusCb({ state: "connecting" });
  socket = new WebSocket(wsUrl());

  socket.onopen = () => statusCb({ state: "connected" });

  socket.onmessage = (event) => {
    let msg: { type?: string; action?: string; status?: string; detail?: string };
    try {
      msg = JSON.parse(event.data);
    } catch {
      return;
    }
    if (msg.type === "action" && msg.action && VALID_ACTIONS.has(msg.action as Action)) {
      actionBus.emit(msg.action as Action, "camera");
    } else if (msg.type === "status") {
      if (msg.status === "tracking") statusCb({ state: "tracking" });
      else if (msg.status === "no-person")
        statusCb({ state: "no-person", message: msg.detail });
      else if (msg.status === "calibrating") statusCb({ state: "calibrating" });
    }
  };

  socket.onclose = () => {
    socket = null;
    if (active) setTimeout(connect, RECONNECT_MS);
  };

  socket.onerror = () => socket?.close();
}

export function startCv(): void {
  if (active) return;
  active = true;
  connect();
}

export function stopCv(): void {
  active = false;
  socket?.close();
  socket = null;
  statusCb({ state: "off" });
}
