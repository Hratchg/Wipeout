import {
  AdvancedDynamicTexture,
  Control,
  Rectangle,
  StackPanel,
  TextBlock,
} from "@babylonjs/gui";
import type { Action } from "../types";
import type { VoiceStatus } from "../input/voice";
import type { CvStatus } from "../input/cvSocket";
import { bindKey } from "../input/keyboard";

export type ScreenName = "title" | "select" | "hud" | "gameover" | "win";
export type MenuItemId = "voice" | "camera" | "motion" | "start";

const MENU_ITEMS: MenuItemId[] = ["voice", "camera", "motion", "start"];
const REDUCED_MOTION_KEY = "wipeout.reducedMotion";
const SAFE_X = 112;
const SAFE_Y = 60;
const LOWER_THIRD_DURATION_MS = 1200;
const COLORS = {
  ink: "#071326",
  panel: "rgba(4, 14, 34, 0.9)",
  panelSoft: "rgba(4, 14, 34, 0.78)",
  red: "#f02b43",
  yellow: "#ffd23e",
  blue: "#27a7ff",
  green: "#39e879",
  muted: "#b7c8e8",
};

const OVERLAY_SLOTS: Array<{ digit: string; action: Action }> = [
  { digit: "Digit1", action: "forward" },
  { digit: "Digit2", action: "back" },
  { digit: "Digit3", action: "left" },
  { digit: "Digit4", action: "right" },
  { digit: "Digit5", action: "jump" },
];

function text(
  value: string,
  size: number,
  color = "white",
  outline = 0,
  name = "",
): TextBlock {
  const tb = new TextBlock(name, value);
  tb.fontSize = size;
  tb.color = color;
  tb.fontFamily = "'Arial Black', Arial, sans-serif";
  if (outline > 0) {
    tb.outlineWidth = outline;
    tb.outlineColor = "black";
  }
  return tb;
}

export class Ui {
  private adt: AdvancedDynamicTexture;

  private screens: Record<ScreenName, Rectangle> = {} as Record<
    ScreenName,
    Rectangle
  >;

  // HUD elements
  private hearts!: TextBlock;
  private timer!: TextBlock;
  private score!: TextBlock;
  private voiceBadge!: TextBlock;
  private cvBadge!: TextBlock;
  private inputStatusPanel!: Rectangle;
  private actionFlashText!: TextBlock;
  private actionFlashPanel!: Rectangle;
  private checkpointLowerThird!: Rectangle;
  private lowerThirdEyebrow!: TextBlock;
  private lowerThirdDetail!: TextBlock;
  private flashTimeout: number | undefined;
  private milestoneTimeout: number | undefined;
  private milestoneAnimationFrame: number | undefined;
  private focusPulse = 0;

  // Select menu
  private menuLabels: Partial<Record<MenuItemId, TextBlock>> = {};
  private menuRows: Partial<Record<MenuItemId, Rectangle>> = {};
  private menuIcons: Partial<Record<MenuItemId, TextBlock>> = {};
  private focusIndex = 0;
  private voiceOn = false;
  private cameraOn = false;
  private reducedMotion = false;

  // End screens
  private gameoverStats!: TextBlock;
  private winStats!: TextBlock;

  // Key overlay
  private keyOverlay!: Rectangle;
  private keyOverlayText!: TextBlock;
  private pendingCode: string | null = null;
  keyOverlayVisible = false;

  constructor() {
    try {
      this.reducedMotion =
        window.localStorage.getItem(REDUCED_MOTION_KEY) === "true";
    } catch {
      this.reducedMotion = false;
    }
    this.adt = AdvancedDynamicTexture.CreateFullscreenUI("ui");
    this.adt.idealHeight = 1080;
    this.buildHud();
    this.buildTitle();
    this.buildSelect();
    this.buildEndScreens();
    this.buildKeyOverlay();
    this.adt.getScene()?.onBeforeRenderObservable.add(() => {
      this.animateFocusedRow();
    });
    this.showScreen("title");
  }

  private makeScreen(name: ScreenName, bg: string): Rectangle {
    const rect = new Rectangle(`screen-${name}`);
    rect.width = 1;
    rect.height = 1;
    rect.thickness = 0;
    rect.background = bg;
    rect.isVisible = false;
    this.adt.addControl(rect);
    this.screens[name] = rect;
    return rect;
  }

  private makeBroadcastPanel(
    name: string,
    width: number,
    height: number,
    accent: string,
    background = COLORS.panelSoft,
  ): Rectangle {
    const panel = new Rectangle(name);
    panel.width = `${width}px`;
    panel.height = `${height}px`;
    panel.cornerRadius = 18;
    panel.thickness = 3;
    panel.color = "rgba(255,255,255,0.38)";
    panel.background = background;
    panel.isPointerBlocker = false;

    const accentBar = new Rectangle(`${name}-accent`);
    accentBar.width = "14px";
    accentBar.height = 0.72;
    accentBar.cornerRadius = 7;
    accentBar.thickness = 0;
    accentBar.background = accent;
    accentBar.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    accentBar.left = 14;
    accentBar.isPointerBlocker = false;
    panel.addControl(accentBar);
    return panel;
  }

  private addBroadcastHeader(
    screen: Rectangle,
    screenName: ScreenName,
    strapline: string,
  ): Rectangle {
    const header = new Rectangle(`broadcast-header-${screenName}`);
    header.width = "1696px";
    header.height = "118px";
    header.cornerRadius = 14;
    header.thickness = 0;
    header.background = COLORS.red;
    header.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    header.top = SAFE_Y;
    header.isPointerBlocker = false;

    const mark = text("SPLASH ARENA", 40, "white", 2);
    mark.width = "640px";
    mark.height = "64px";
    mark.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    mark.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    mark.left = 38;
    header.addControl(mark);

    const segment = new Rectangle();
    segment.width = "18px";
    segment.height = 0.62;
    segment.cornerRadius = 8;
    segment.thickness = 0;
    segment.background = COLORS.yellow;
    segment.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
    segment.left = -580;
    header.addControl(segment);

    const strap = text(strapline, 25, COLORS.ink);
    strap.width = "520px";
    strap.height = "76px";
    strap.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
    strap.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
    strap.left = -34;
    header.addControl(strap);

    const underline = new Rectangle();
    underline.width = 1;
    underline.height = "8px";
    underline.thickness = 0;
    underline.background = COLORS.yellow;
    underline.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
    header.addControl(underline);

    screen.addControl(header);
    return header;
  }

  private addPanelCopy(
    panel: Rectangle,
    label: string,
    value: TextBlock,
  ): void {
    const caption = text(label, 22, COLORS.muted);
    caption.width = 0.78;
    caption.height = "34px";
    caption.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    caption.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    caption.left = 46;
    caption.top = -28;
    panel.addControl(caption);

    value.width = 0.78;
    value.height = "68px";
    value.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    value.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    value.left = 46;
    value.top = 19;
    panel.addControl(value);
  }

  private buildHud(): void {
    const hud = this.makeScreen("hud", "transparent");
    hud.isPointerBlocker = false;

    const livesPanel = this.makeBroadcastPanel(
      "hud-lives-panel",
      360,
      118,
      COLORS.red,
    );
    livesPanel.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    livesPanel.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    livesPanel.left = SAFE_X;
    livesPanel.top = SAFE_Y;
    hud.addControl(livesPanel);
    this.hearts = text("\u2665\u2665\u2665", 55, COLORS.red, 2, "hud-hearts");
    this.addPanelCopy(livesPanel, "LIVES", this.hearts);

    const timerPanel = this.makeBroadcastPanel(
      "hud-timer-panel",
      340,
      118,
      COLORS.yellow,
    );
    timerPanel.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    timerPanel.top = SAFE_Y;
    hud.addControl(timerPanel);
    this.timer = text("0:00.0", 53, "white", 2, "hud-timer");
    this.addPanelCopy(timerPanel, "COURSE TIME", this.timer);

    const scorePanel = this.makeBroadcastPanel(
      "hud-score-panel",
      360,
      118,
      COLORS.blue,
    );
    scorePanel.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
    scorePanel.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    scorePanel.left = -SAFE_X;
    scorePanel.top = SAFE_Y;
    hud.addControl(scorePanel);
    this.score = text("0", 53, COLORS.yellow, 2, "hud-score");
    this.addPanelCopy(scorePanel, "SCORE", this.score);

    const inputPanel = this.makeBroadcastPanel(
      "hud-input-panel",
      570,
      132,
      COLORS.blue,
    );
    inputPanel.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    inputPanel.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
    inputPanel.left = SAFE_X;
    inputPanel.top = -SAFE_Y;
    hud.addControl(inputPanel);
    this.inputStatusPanel = inputPanel;

    const inputLabel = text("LIVE INPUT", 20, COLORS.muted);
    inputLabel.width = "470px";
    inputLabel.height = "28px";
    inputLabel.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    inputLabel.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    inputLabel.left = 50;
    inputLabel.top = -43;
    inputPanel.addControl(inputLabel);

    this.voiceBadge = text("", 28, "#aaf0b7", 1, "hud-voice-status");
    this.voiceBadge.width = "470px";
    this.voiceBadge.height = "42px";
    this.voiceBadge.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    this.voiceBadge.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    this.voiceBadge.left = 50;
    this.voiceBadge.top = -7;
    inputPanel.addControl(this.voiceBadge);

    this.cvBadge = text("", 28, "#9edaff", 1, "hud-camera-status");
    this.cvBadge.width = "470px";
    this.cvBadge.height = "42px";
    this.cvBadge.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    this.cvBadge.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    this.cvBadge.left = 50;
    this.cvBadge.top = 35;
    inputPanel.addControl(this.cvBadge);

    this.actionFlashPanel = this.makeBroadcastPanel(
      "action-flash-panel",
      460,
      92,
      COLORS.yellow,
      "rgba(4, 14, 34, 0.86)",
    );
    this.actionFlashPanel.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
    this.actionFlashPanel.top = -SAFE_Y;
    this.actionFlashPanel.isVisible = false;
    hud.addControl(this.actionFlashPanel);
    this.actionFlashText = text("", 48, "white", 2, "action-flash-text");
    this.actionFlashPanel.addControl(this.actionFlashText);

    this.checkpointLowerThird = this.makeBroadcastPanel(
      "checkpoint-lower-third",
      920,
      142,
      COLORS.yellow,
      "rgba(3, 12, 30, 0.94)",
    );
    this.checkpointLowerThird.verticalAlignment =
      Control.VERTICAL_ALIGNMENT_BOTTOM;
    this.checkpointLowerThird.top = -180;
    this.checkpointLowerThird.isVisible = false;
    this.checkpointLowerThird.alpha = 0;
    this.checkpointLowerThird.isPointerBlocker = false;
    hud.addControl(this.checkpointLowerThird);

    this.lowerThirdEyebrow = text(
      "",
      25,
      COLORS.yellow,
      0,
      "lower-third-eyebrow",
    );
    this.lowerThirdEyebrow.width = "810px";
    this.lowerThirdEyebrow.height = "38px";
    this.lowerThirdEyebrow.textHorizontalAlignment =
      Control.HORIZONTAL_ALIGNMENT_LEFT;
    this.lowerThirdEyebrow.left = 30;
    this.lowerThirdEyebrow.top = -34;
    this.checkpointLowerThird.addControl(this.lowerThirdEyebrow);

    this.lowerThirdDetail = text(
      "",
      50,
      "white",
      2,
      "lower-third-detail",
    );
    this.lowerThirdDetail.width = "810px";
    this.lowerThirdDetail.height = "68px";
    this.lowerThirdDetail.textHorizontalAlignment =
      Control.HORIZONTAL_ALIGNMENT_LEFT;
    this.lowerThirdDetail.left = 30;
    this.lowerThirdDetail.top = 21;
    this.checkpointLowerThird.addControl(this.lowerThirdDetail);
  }

  private buildTitle(): void {
    const screen = this.makeScreen("title", "rgba(3, 12, 32, 0.76)");
    this.addBroadcastHeader(screen, "title", "LIVE FROM YOUR LIVING ROOM");

    const card = new Rectangle("title-card");
    card.width = "1540px";
    card.height = "650px";
    card.cornerRadius = 30;
    card.thickness = 4;
    card.color = "rgba(255,255,255,0.28)";
    card.background = "rgba(3, 12, 30, 0.88)";
    card.top = 82;
    card.isPointerBlocker = false;
    screen.addControl(card);

    const panel = new StackPanel();
    panel.width = "1390px";
    panel.height = "540px";
    panel.spacing = 18;
    card.addControl(panel);

    const eyebrow = text("TONIGHT'S MAIN EVENT", 30, COLORS.blue);
    eyebrow.height = "42px";
    panel.addControl(eyebrow);

    const title = text("WIPEOUT!", 174, COLORS.red, 8);
    title.height = "205px";
    panel.addControl(title);

    const sub = text("THE LIVING ROOM OBSTACLE COURSE", 42, COLORS.yellow, 2);
    sub.height = "72px";
    panel.addControl(sub);

    const promptPanel = new Rectangle("title-prompt");
    promptPanel.width = "1100px";
    promptPanel.height = "94px";
    promptPanel.cornerRadius = 47;
    promptPanel.thickness = 0;
    promptPanel.background = COLORS.yellow;
    promptPanel.isPointerBlocker = false;
    const prompt = text("PRESS OK / SAY \"JUMP\" TO START", 42, COLORS.ink);
    promptPanel.addControl(prompt);
    panel.addControl(promptPanel);

    const hint = text("F2: remote button setup", 28, COLORS.muted, 0);
    hint.height = "42px";
    panel.addControl(hint);
  }

  private buildSelect(): void {
    const screen = this.makeScreen("select", "rgba(3, 12, 32, 0.82)");
    this.addBroadcastHeader(screen, "select", "CONTROL DESK");

    const card = new Rectangle("select-card");
    card.width = "1280px";
    card.height = "820px";
    card.cornerRadius = 28;
    card.thickness = 4;
    card.color = "rgba(255,255,255,0.26)";
    card.background = "rgba(3, 12, 30, 0.9)";
    card.top = 65;
    card.isPointerBlocker = false;
    screen.addControl(card);

    const panel = new StackPanel();
    panel.width = "1120px";
    panel.height = "730px";
    panel.spacing = 11;
    card.addControl(panel);

    const heading = text("CHOOSE YOUR CONTROLS", 58, COLORS.yellow, 3);
    heading.height = "86px";
    panel.addControl(heading);

    const remoteRow = this.makeMenuRow(
      "REMOTE / BUTTONS: ALWAYS ON",
      "remote",
      "\u25c6",
    );
    remoteRow.row.alpha = 0.65;
    panel.addControl(remoteRow.row);

    for (const id of MENU_ITEMS) {
      const label =
        id === "voice"
          ? "VOICE: OFF"
          : id === "camera"
            ? "CAMERA: OFF"
            : id === "motion"
              ? "MOTION: FULL"
            : "START GAME";
      const icon =
        id === "voice"
          ? "\u25cf"
          : id === "camera"
            ? "\u25a3"
            : id === "motion"
              ? "\u2248"
              : "\u25b6";
      const { row, tb, icon: iconControl } = this.makeMenuRow(label, id, icon);
      this.menuRows[id] = row;
      this.menuLabels[id] = tb;
      this.menuIcons[id] = iconControl;
      panel.addControl(row);
    }

    const hint = text(
      "UP / DOWN  CHOOSE     \u2022     OK  SELECT",
      28,
      COLORS.muted,
    );
    hint.height = "54px";
    panel.addControl(hint);

    this.refreshMenu();
  }

  private makeMenuRow(
    label: string,
    name: string,
    iconValue: string,
  ): { row: Rectangle; tb: TextBlock; icon: TextBlock } {
    const row = new Rectangle(`menu-row-${name}`);
    row.width = "1040px";
    row.height = "104px";
    row.cornerRadius = 18;
    row.thickness = 4;
    row.color = "transparent";
    row.background = "rgba(255,255,255,0.07)";
    row.isPointerBlocker = false;

    const iconPanel = new Rectangle();
    iconPanel.width = "66px";
    iconPanel.height = "66px";
    iconPanel.cornerRadius = 33;
    iconPanel.thickness = 2;
    iconPanel.color = "rgba(255,255,255,0.35)";
    iconPanel.background = "rgba(39,167,255,0.18)";
    iconPanel.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    iconPanel.left = 22;
    iconPanel.isPointerBlocker = false;
    const icon = text(iconValue, 32, COLORS.blue);
    iconPanel.addControl(icon);
    row.addControl(iconPanel);

    const tb = text(label, 39, "white", 1);
    tb.width = "710px";
    tb.height = "76px";
    tb.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    tb.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    tb.left = 112;
    row.addControl(tb);

    const cue = text(name === "remote" ? "READY" : "OK", 24, COLORS.muted);
    cue.width = "130px";
    cue.height = "50px";
    cue.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
    cue.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
    cue.left = -34;
    row.addControl(cue);

    return { row, tb, icon };
  }

  private buildEndScreens(): void {
    const gameover = this.makeScreen("gameover", "rgba(45, 4, 12, 0.68)");
    this.addBroadcastHeader(gameover, "gameover", "RESULTS DESK");
    this.gameoverStats = this.buildEndCard(
      gameover,
      "gameover",
      "RUN ENDED",
      "TOTAL WIPEOUT!",
      "PRESS OK TO TRY AGAIN",
      COLORS.red,
      false,
    );

    // Keep the global win wash light so 3D confetti and the finish gate stay
    // readable, while the local card remains opaque enough for statistics.
    const win = this.makeScreen("win", "rgba(3, 11, 28, 0.2)");
    this.addBroadcastHeader(win, "win", "FINISH LINE LIVE");
    this.winStats = this.buildEndCard(
      win,
      "win",
      "OFFICIAL RESULT",
      "YOU MADE IT!",
      "PRESS OK TO PLAY AGAIN",
      COLORS.green,
      true,
    );
  }

  private buildEndCard(
    screen: Rectangle,
    name: "gameover" | "win",
    eyebrowCopy: string,
    titleCopy: string,
    promptCopy: string,
    accent: string,
    leftAligned: boolean,
  ): TextBlock {
    const card = this.makeBroadcastPanel(
      `end-card-${name}`,
      leftAligned ? 860 : 1120,
      leftAligned ? 640 : 650,
      accent,
      "rgba(3, 12, 30, 0.92)",
    );
    card.top = 72;
    if (leftAligned) {
      card.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
      card.left = SAFE_X;
    }
    screen.addControl(card);

    const panel = new StackPanel();
    panel.width = leftAligned ? "730px" : "930px";
    panel.height = "520px";
    panel.spacing = 16;
    card.addControl(panel);

    const eyebrow = text(eyebrowCopy, 25, COLORS.blue);
    eyebrow.height = "40px";
    panel.addControl(eyebrow);

    const title = text(titleCopy, leftAligned ? 77 : 94, accent, 5);
    title.height = "140px";
    panel.addControl(title);

    const statFrame = new Rectangle(`end-stats-${name}`);
    statFrame.width = leftAligned ? "690px" : "860px";
    statFrame.height = "154px";
    statFrame.cornerRadius = 18;
    statFrame.thickness = 3;
    statFrame.color = "rgba(255,255,255,0.32)";
    statFrame.background = "rgba(0,0,0,0.54)";
    statFrame.isPointerBlocker = false;
    const stats = text("", leftAligned ? 37 : 45, "white", 2);
    stats.textWrapping = true;
    stats.paddingLeft = 28;
    stats.paddingRight = 28;
    statFrame.addControl(stats);
    panel.addControl(statFrame);

    const promptPanel = new Rectangle(`end-prompt-${name}`);
    promptPanel.width = leftAligned ? "680px" : "820px";
    promptPanel.height = "92px";
    promptPanel.cornerRadius = 46;
    promptPanel.thickness = 0;
    promptPanel.background = COLORS.yellow;
    promptPanel.isPointerBlocker = false;
    const prompt = text(promptCopy, leftAligned ? 28 : 34, COLORS.ink);
    promptPanel.addControl(prompt);
    panel.addControl(promptPanel);
    return stats;
  }

  private buildKeyOverlay(): void {
    this.keyOverlay = new Rectangle("key-overlay");
    this.keyOverlay.width = "1000px";
    this.keyOverlay.height = "560px";
    this.keyOverlay.cornerRadius = 26;
    this.keyOverlay.thickness = 5;
    this.keyOverlay.color = COLORS.yellow;
    this.keyOverlay.background = "rgba(3,12,30,0.96)";
    this.keyOverlay.isVisible = false;
    this.keyOverlay.isPointerBlocker = false;
    this.keyOverlay.zIndex = 100;

    const overlayMark = text("SPLASH ARENA  /  REMOTE CONTROL", 26, COLORS.yellow);
    overlayMark.height = "48px";
    overlayMark.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    overlayMark.top = 24;
    this.keyOverlay.addControl(overlayMark);

    const divider = new Rectangle();
    divider.width = "870px";
    divider.height = "5px";
    divider.thickness = 0;
    divider.background = COLORS.blue;
    divider.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    divider.top = 84;
    this.keyOverlay.addControl(divider);

    this.keyOverlayText = text("", 31, "white", 0);
    this.keyOverlayText.textWrapping = true;
    this.keyOverlayText.paddingLeft = 54;
    this.keyOverlayText.paddingRight = 54;
    this.keyOverlayText.paddingTop = 72;
    this.keyOverlayText.paddingBottom = 24;
    this.keyOverlay.addControl(this.keyOverlayText);
    this.adt.addControl(this.keyOverlay);
    this.updateOverlayText();
  }

  private updateOverlayText(message = ""): void {
    this.keyOverlayText.text =
      "REMOTE BUTTON SETUP   \u2022   F2 TO CLOSE\n\n" +
      `Last button pressed: ${this.pendingCode ?? "-"}\n\n` +
      "Press any remote button, then press:\n" +
      "1 = FORWARD   2 = BACK   3 = LEFT\n" +
      "4 = RIGHT   5 = JUMP\n\n" +
      message;
  }

  // ---- public API ----

  showScreen(name: ScreenName): void {
    if (name !== "hud") this.clearMilestone();
    const endScreen = name === "gameover" || name === "win";
    this.inputStatusPanel.isVisible = !endScreen;
    this.actionFlashPanel.isVisible = false;
    for (const key of Object.keys(this.screens) as ScreenName[]) {
      this.screens[key].isVisible = key === name;
    }
    // HUD stays visible under end screens for context.
    if (name === "gameover" || name === "win") {
      this.screens.hud.isVisible = true;
    }
  }

  menuMove(delta: number): void {
    this.focusIndex =
      (this.focusIndex + delta + MENU_ITEMS.length) % MENU_ITEMS.length;
    this.refreshMenu();
  }

  menuFocused(): MenuItemId {
    return MENU_ITEMS[this.focusIndex];
  }

  setVoiceEnabled(on: boolean): void {
    this.voiceOn = on;
    this.refreshMenu();
    if (!on) this.voiceBadge.text = "";
  }

  setCameraEnabled(on: boolean): void {
    this.cameraOn = on;
    this.refreshMenu();
    if (!on) this.cvBadge.text = "";
  }

  setReducedMotion(on: boolean): void {
    this.reducedMotion = on;
    try {
      window.localStorage.setItem(REDUCED_MOTION_KEY, String(on));
    } catch {
      // The current session still honors the setting when storage is blocked.
    }
    this.refreshMenu();
  }

  isReducedMotion(): boolean {
    return this.reducedMotion;
  }

  private refreshMenu(): void {
    for (let i = 0; i < MENU_ITEMS.length; i++) {
      const id = MENU_ITEMS[i];
      const row = this.menuRows[id];
      const label = this.menuLabels[id];
      if (!row || !label) continue;
      const focused = i === this.focusIndex;
      row.color = focused ? "#ffd23e" : "transparent";
      row.background = focused
        ? "rgba(255, 210, 62, 0.22)"
        : "rgba(255,255,255,0.08)";
      if (id === "voice") label.text = `VOICE: ${this.voiceOn ? "ON" : "OFF"}`;
      if (id === "camera")
        label.text = `CAMERA: ${this.cameraOn ? "ON" : "OFF"}`;
      if (id === "motion")
        label.text = `MOTION: ${this.reducedMotion ? "REDUCED" : "FULL"}`;
      const icon = this.menuIcons[id];
      if (icon) {
        icon.color =
          id === "voice" && this.voiceOn
            ? COLORS.green
            : id === "camera" && this.cameraOn
              ? COLORS.green
              : id === "motion" && this.reducedMotion
                ? COLORS.yellow
                : id === "start"
                  ? COLORS.yellow
                  : COLORS.blue;
      }
    }
  }

  private animateFocusedRow(): void {
    const dt = Math.min(
      (this.adt.getScene()?.getEngine().getDeltaTime() ?? 16) / 1000,
      0.05,
    );
    this.focusPulse += dt;
    for (let i = 0; i < MENU_ITEMS.length; i++) {
      const row = this.menuRows[MENU_ITEMS[i]];
      if (!row) continue;
      if (i !== this.focusIndex) {
        row.thickness = 4;
        continue;
      }
      row.thickness = this.reducedMotion
        ? 6
        : 5.5 + Math.sin(this.focusPulse * 5) * 1.5;
    }
  }

  setHearts(lives: number): void {
    this.hearts.text = "\u2665".repeat(Math.max(0, lives));
  }

  setTimer(seconds: number): void {
    const m = Math.floor(seconds / 60);
    const s = (seconds % 60).toFixed(1).padStart(4, "0");
    this.timer.text = `${m}:${s}`;
  }

  setScore(score: number): void {
    this.score.text = String(score);
  }

  setEndStats(screen: "gameover" | "win", statsLine: string): void {
    if (screen === "gameover") this.gameoverStats.text = statsLine;
    else this.winStats.text = statsLine;
  }

  showCheckpoint(row: number): void {
    this.showMilestone("CHECKPOINT REACHED", `CHECKPOINT ${row}`);
  }

  showFinalRun(): void {
    this.showMilestone("FINAL RUN", "LAST LEAP TO GLORY");
  }

  private showMilestone(eyebrow: string, detail: string): void {
    this.clearMilestone();
    this.lowerThirdEyebrow.text = eyebrow;
    this.lowerThirdDetail.text = detail;
    this.checkpointLowerThird.isVisible = true;
    this.checkpointLowerThird.alpha = 0;
    this.checkpointLowerThird.top = this.reducedMotion ? -180 : -30;
    const startedAt = performance.now();

    const animate = (now: number): void => {
      const elapsed = now - startedAt;
      const entrance = Math.min(elapsed / 220, 1);
      const exit = Math.min(
        Math.max((LOWER_THIRD_DURATION_MS - elapsed) / 240, 0),
        1,
      );
      const easedEntrance = 1 - Math.pow(1 - entrance, 3);
      this.checkpointLowerThird.alpha = Math.min(easedEntrance, exit);
      if (!this.reducedMotion) {
        this.checkpointLowerThird.top = -30 - easedEntrance * 150;
      }
      if (elapsed < LOWER_THIRD_DURATION_MS) {
        this.milestoneAnimationFrame = requestAnimationFrame(animate);
      }
    };
    this.milestoneAnimationFrame = requestAnimationFrame(animate);
    this.milestoneTimeout = window.setTimeout(() => {
      this.clearMilestone();
    }, LOWER_THIRD_DURATION_MS);
  }

  private clearMilestone(): void {
    if (this.milestoneTimeout !== undefined) {
      clearTimeout(this.milestoneTimeout);
      this.milestoneTimeout = undefined;
    }
    if (this.milestoneAnimationFrame !== undefined) {
      cancelAnimationFrame(this.milestoneAnimationFrame);
      this.milestoneAnimationFrame = undefined;
    }
    if (!this.checkpointLowerThird) return;
    this.checkpointLowerThird.isVisible = false;
    this.checkpointLowerThird.alpha = 0;
    this.checkpointLowerThird.top = -180;
    this.lowerThirdEyebrow.text = "";
    this.lowerThirdDetail.text = "";
  }

  voiceFeedback(status: VoiceStatus): void {
    switch (status.state) {
      case "off":
        this.voiceBadge.text = "";
        break;
      case "starting":
        this.voiceBadge.text = "VOICE: starting...";
        break;
      case "listening":
        this.voiceBadge.text = status.lastWord
          ? `VOICE: heard "${status.lastWord}"`
          : "VOICE: listening";
        break;
      case "error":
      case "unsupported":
        this.voiceBadge.text = `VOICE: ${status.message ?? "error"}`;
        break;
    }
  }

  cvFeedback(status: CvStatus): void {
    switch (status.state) {
      case "off":
        this.cvBadge.text = "";
        break;
      case "connecting":
        this.cvBadge.text = "CAMERA: connecting to input service...";
        break;
      case "connected":
        this.cvBadge.text = "CAMERA: connected";
        break;
      case "tracking":
        this.cvBadge.text = "CAMERA: tracking you";
        break;
      case "no-person":
        this.cvBadge.text = "CAMERA: step into view";
        break;
      case "calibrating":
        this.cvBadge.text = "CAMERA: hold still, calibrating...";
        break;
    }
  }

  actionFlash(action: Action): void {
    this.actionFlashText.text = action.toUpperCase();
    this.actionFlashText.alpha = 1;
    this.actionFlashPanel.isVisible = true;
    if (this.flashTimeout !== undefined) clearTimeout(this.flashTimeout);
    this.flashTimeout = window.setTimeout(() => {
      this.actionFlashText.text = "";
      this.actionFlashPanel.isVisible = false;
    }, 450);
  }

  toggleKeyOverlay(): void {
    this.keyOverlayVisible = !this.keyOverlayVisible;
    this.keyOverlay.isVisible = this.keyOverlayVisible;
    if (this.keyOverlayVisible) {
      this.pendingCode = null;
      this.updateOverlayText();
    }
  }

  /** Returns true when the key event was consumed by the overlay. */
  handleOverlayKey(e: KeyboardEvent): boolean {
    if (!this.keyOverlayVisible) return false;
    const slot = OVERLAY_SLOTS.find((s) => s.digit === e.code);
    if (slot && this.pendingCode) {
      bindKey(this.pendingCode, slot.action);
      this.updateOverlayText(
        `Bound "${this.pendingCode}" to ${slot.action.toUpperCase()}`,
      );
      this.pendingCode = null;
    } else {
      this.pendingCode = e.code;
      this.updateOverlayText();
    }
    return true;
  }
}
