export type Action = "jump" | "left" | "right" | "forward" | "back";

export type InputSource = "remote" | "voice" | "camera";

export type GameState =
  | "title"
  | "select"
  | "playing"
  | "respawning"
  | "gameover"
  | "win";
