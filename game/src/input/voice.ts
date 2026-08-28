import { actionBus } from "./actionBus";
import type { Action } from "../types";

export interface VoiceStatus {
  state: "off" | "starting" | "listening" | "error" | "unsupported";
  lastWord?: string;
  message?: string;
}

const KEYWORDS: Array<[RegExp, Action]> = [
  [/\b(jump|hop)\b/i, "jump"],
  [/\bleft\b/i, "left"],
  [/\bright\b/i, "right"],
  [/\b(straight|forward|ahead|go)\b/i, "forward"],
  [/\b(back|backward|backwards|reverse)\b/i, "back"],
];

const ACTION_COOLDOWN_MS = 700;

type StatusCallback = (status: VoiceStatus) => void;

let recognition: SpeechRecognition | null = null;
let active = false;
let statusCb: StatusCallback = () => {};
const lastEmit: Partial<Record<Action, number>> = {};

function getRecognitionCtor(): (new () => SpeechRecognition) | null {
  const w = window as unknown as Record<string, unknown>;
  return (w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null) as
    | (new () => SpeechRecognition)
    | null;
}

export function isVoiceSupported(): boolean {
  return getRecognitionCtor() !== null;
}

export function onVoiceStatus(cb: StatusCallback): void {
  statusCb = cb;
}

function handleTranscript(transcript: string): void {
  const now = performance.now();
  for (const [pattern, action] of KEYWORDS) {
    if (!pattern.test(transcript)) continue;
    const last = lastEmit[action] ?? 0;
    if (now - last < ACTION_COOLDOWN_MS) continue;
    lastEmit[action] = now;
    statusCb({ state: "listening", lastWord: action.toUpperCase() });
    actionBus.emit(action, "voice");
  }
}

export function startVoice(): void {
  const Ctor = getRecognitionCtor();
  if (!Ctor) {
    statusCb({ state: "unsupported", message: "Speech API not available" });
    return;
  }
  if (active) return;
  active = true;
  statusCb({ state: "starting" });

  recognition = new Ctor();
  recognition.continuous = true;
  recognition.interimResults = true; // interim results give much lower latency
  recognition.lang = "en-US";
  recognition.maxAlternatives = 1;

  recognition.onstart = () => statusCb({ state: "listening" });

  recognition.onresult = (event: SpeechRecognitionEvent) => {
    // Only look at the most recent result chunk to avoid re-firing old words.
    const result = event.results[event.results.length - 1];
    if (result && result[0]) handleTranscript(result[0].transcript);
  };

  recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
    if (event.error === "not-allowed" || event.error === "service-not-allowed") {
      active = false;
      statusCb({ state: "error", message: "Mic permission denied" });
    }
    // "no-speech"/"aborted" are routine; onend handles the restart.
  };

  // Chrome stops continuous recognition periodically; restart while active.
  recognition.onend = () => {
    if (active) {
      try {
        recognition?.start();
      } catch {
        setTimeout(() => {
          if (active) recognition?.start();
        }, 300);
      }
    }
  };

  try {
    recognition.start();
  } catch {
    statusCb({ state: "error", message: "Could not start recognition" });
    active = false;
  }
}

export function stopVoice(): void {
  active = false;
  recognition?.stop();
  recognition = null;
  statusCb({ state: "off" });
}
