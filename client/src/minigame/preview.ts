// Development-only harness. Production builds use minigame-entry.ts, never this file.
import { Game } from "../game/game.ts";
import { MiniUi } from "./ui.ts";
import { bindTouches } from "./touch.ts";

const canvas = document.getElementById("view") as HTMLCanvasElement;
const keyboard = document.getElementById("keyboard") as HTMLInputElement;
const listeners: Record<string, (event: any) => void> = {};
const nativeAddEventListener = window.addEventListener.bind(window);
const api: any = {
  getWindowInfo: () => ({ safeArea: { left: 0, top: 0, right: innerWidth, bottom: innerHeight } }),
  getMenuButtonBoundingClientRect: () => ({ bottom: 32 }),
  showKeyboard: ({ defaultValue, maxLength }: any) => { keyboard.value = defaultValue; keyboard.maxLength = maxLength; keyboard.hidden = false; keyboard.focus(); },
  hideKeyboard: () => { keyboard.hidden = true; keyboard.blur(); },
};
for (const name of ["TouchStart", "TouchMove", "TouchEnd", "TouchCancel", "KeyboardInput", "KeyboardConfirm", "KeyboardComplete", "Hide"]) api[`on${name}`] = (fn: (e: any) => void) => { listeners[name] = fn; };
(window as any).wx = api;
keyboard.addEventListener("input", () => listeners.KeyboardInput?.({ value: keyboard.value }));
keyboard.addEventListener("keydown", e => { if (e.key === "Enter") listeners.KeyboardConfirm?.({ value: keyboard.value }); });
// Translate real browser UI interactions to the same wx touch callbacks used on device.
for (const [type, name] of [["pointerdown", "TouchStart"], ["pointermove", "TouchMove"], ["pointerup", "TouchEnd"], ["pointercancel", "TouchCancel"]]) {
  nativeAddEventListener(type!, ((e: PointerEvent) => {
    if (!e.isTrusted || e.target !== canvas) return;
    e.stopImmediatePropagation();
    if (type === "pointerdown") canvas.setPointerCapture(e.pointerId);
    listeners[name!]?.({ changedTouches: [{ identifier: e.pointerId, clientX: e.clientX, clientY: e.clientY }] });
  }) as EventListener, true);
}
const game = new Game(canvas), ui = new MiniUi(game);
bindTouches(game, ui, api, (type, event) => {
  const pointer = new PointerEvent(type, { ...event, bubbles: false });
  (type === "pointerdown" ? canvas : window).dispatchEvent(pointer);
}, canvas);
game.onHud = () => ui.paint();
(window as any).__miniUi = ui;
(window as any).__miniLifecycle = listeners;
