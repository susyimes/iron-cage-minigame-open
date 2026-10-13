import type { Game } from "../game/game.ts";
import { dispatchPointer, getView } from "./runtime.ts";
import { MiniUi } from "./ui.ts";
import { bindTouches } from "./touch.ts";

declare const wx: any;

export function bootMinigame(game: Game): MiniUi {
  const ui = new MiniUi(game);
  bindTouches(game, ui, wx, dispatchPointer, getView());
  game.onHud = () => ui.paint();
  game.audio.onChange = () => ui.paint();
  ui.paint();
  return ui;
}
