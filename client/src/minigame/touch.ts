import type { Game } from "../game/game.ts";
import type { MiniButton, MiniUi, HoldAction } from "./ui.ts";

type Touch = { identifier: number; clientX: number; clientY: number };
type TouchEvent = { changedTouches?: Touch[] };
type Owner = { button?: MiniButton; table: boolean; mode: string; x: number; y: number };

export function bindTouches(game: Game, ui: MiniUi, api: any, dispatch: (type: string, event: any) => void, canvas: unknown) {
  const owners = new Map<number, Owner>();
  const event = (type: string, t: Touch) => ({ type, pointerId: t.identifier, pointerType: "touch", button: 0,
    clientX: t.clientX, clientY: t.clientY, target: canvas, preventDefault() {}, stopPropagation() {} });
  const setHold = (hold: HoldAction, down: boolean) => {
    if (hold === "charge") { game.input.chargeHeld = down; if (down) game.input.chargePressed = true; }
    if (hold === "left") game.input.nudgeLeft = down;
    if (hold === "right") game.input.nudgeRight = down;
    if (hold === "up") game.input.loftUp = down;
    if (hold === "down") game.input.loftDown = down;
  };
  const cancel = () => { owners.clear(); game.input.reset(); };
  api.onTouchStart((e: TouchEvent) => {
    for (const t of e.changedTouches ?? []) {
      void game.audio.unlock();
      const button = ui.hit(t.clientX, t.clientY);
      const owner = { button, table: !button && !ui.blocksTable, mode: ui.mode, x: t.clientX, y: t.clientY };
      owners.set(t.identifier, owner);
      if (button?.hold && !button.disabled) {
        if ([...owners].some(([id, o]) => id !== t.identifier && o.button?.hold === button.hold)) { owners.delete(t.identifier); continue; }
        setHold(button.hold, true);
      } else if (owner.table) dispatch("pointerdown", event("pointerdown", t));
    }
  });
  api.onTouchMove((e: TouchEvent) => {
    for (const t of e.changedTouches ?? []) {
      const o = owners.get(t.identifier); if (!o) continue;
      if (o.mode !== ui.mode) { cancel(); continue; }
      if (o.button?.hold && ui.hit(t.clientX, t.clientY)?.id !== o.button.id) {
        setHold(o.button.hold, false);
        if (o.button.hold === "charge") game.input.cancelled = true;
        owners.delete(t.identifier);
      } else if (o.table) dispatch("pointermove", event("pointermove", t));
    }
  });
  const finish = (e: TouchEvent, cancelled: boolean) => {
    if (cancelled) { cancel(); return; }
    for (const t of e.changedTouches ?? []) {
      const o = owners.get(t.identifier); owners.delete(t.identifier); if (!o) continue;
      if (o.mode !== ui.mode) { cancel(); continue; }
      if (o.button?.hold) setHold(o.button.hold, false);
      else if (o.button && !o.button.disabled && ui.hit(t.clientX, t.clientY)?.id === o.button.id && Math.hypot(t.clientX - o.x, t.clientY - o.y) < 24) {
        cancel(); ui.activate(o.button.id);
      } else if (o.table) dispatch("pointerup", event("pointerup", t));
    }
  };
  api.onTouchEnd((e: TouchEvent) => finish(e, false));
  api.onTouchCancel((e: TouchEvent) => finish(e, true));
  api.onHide?.(() => {
    cancel(); ui.cancel(); game.audio.stopCharge();
    if (!game.online && game.screen === "play") game.togglePause();
  });
  return { cancel };
}
