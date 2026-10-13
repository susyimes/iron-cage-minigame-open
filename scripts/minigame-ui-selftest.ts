import assert from "node:assert/strict";
import { MiniUi } from "../client/src/minigame/ui.ts";
import { VERSUS_CARDS, emptyMods, emptyCurses } from "../client/src/game/upgrades.ts";
import { newPoolRules } from "../client/src/game/rules.ts";
import type { Game } from "../client/src/game/game.ts";

let clock = 0, picked = "", replay = 0, keyboard: any;
const labels: string[] = [], listeners: Record<string, (e: any) => void> = {};
const context = { setTransform() {}, clearRect() { labels.length = 0; }, fillRect() {}, strokeRect() {}, fillText(text: string) { labels.push(text); }, measureText: (s: string) => ({ width: [...s].length * 8 }) };
Object.assign(globalThis, {
  document: { createElement: () => ({ width: 0, height: 0, getContext: () => context }) },
  window: { innerWidth: 844, innerHeight: 390, devicePixelRatio: 2 }, performance: { now: () => (clock += 50) },
  localStorage: { getItem: () => null, setItem() {} },
  wx: { getWindowInfo: () => ({ safeArea: { left: 40, top: 0, right: window.innerWidth - 40, bottom: window.innerHeight - 12 } }),
    getMenuButtonBoundingClientRect: () => ({ bottom: 32 }),
    onKeyboardInput: (fn: any) => { listeners.input = fn; }, onKeyboardConfirm: (fn: any) => { listeners.confirm = fn; }, onKeyboardComplete() {},
    showKeyboard: (o: any) => { keyboard = o; }, hideKeyboard() {},
  },
});
const game: any = {
  screen: "title", phase: "aim", settingsOpen: false, quality: "high", online: false, myTurn: true,
  offerSerial: 0, offer: null, onlineState: null, score: 0, onNetRematch: () => { replay++; return true; },
  renderer: { autoClear: true, clearDepth() {}, render() {} }, input: { reset() {} },
  audio: { isMuted: false, unlock() {}, click() {}, toggleMute() { this.isMuted = !this.isMuted; } },
  startRun() { this.screen = "play"; }, openSettings() { this.settingsOpen = true; }, closeSettings() { this.settingsOpen = false; },
  setQuality(q: string) { this.quality = q; }, togglePause() { this.screen = this.screen === "pause" ? "play" : "pause"; },
  pickUpgrade(id: string) { picked = id; this.offer = null; this.screen = "play"; },
  playAgain() { if (this.online) this.onNetRematch?.(); else this.startRun(); }, exitToTitle() { this.screen = "title"; this.online = false; },
  hud() { return { ...this, muted: this.audio.isMuted, network: this.onlineState, best: 0, remaining: 15, status: "轮到你", power: 0,
    charging: false, canShoot: this.screen === "play" && !this.settingsOpen, mods: emptyMods(), curses: emptyCurses(),
    rules: newPoolRules(), notices: [], history: [], overTitle: "本局结束", overLead: "比分 100 : 0" }; },
};
const ui = new MiniUi(game as Game);
const paint = () => { ui.paint(); assert.equal(game.renderer.autoClear, true); };
paint(); assert.equal(game.screen, "title"); assert.ok(ui.targets.some(b => b.id === "solo")); assert.ok(ui.targets.some(b => b.id === "online"));
ui.activate("settings"); paint(); assert.ok(ui.blocksTable);
ui.activate("quality:smooth"); paint(); assert.equal(game.quality, "smooth"); assert.ok(labels.includes("✓ 流畅"));
ui.activate("sound"); assert.ok(game.audio.isMuted); ui.activate("settings-back");
ui.activate("online"); paint(); ui.activate("room"); assert.equal(keyboard.maxLength, 4);
listeners.input!({ value: "xy" }); listeners.confirm!({ value: "xy" }); ui.activate("join"); paint();
assert.ok(labels.some(s => s.includes("4 位字母")), "invalid codes must be visible and not connect");
ui.activate("exit"); ui.activate("solo"); paint(); assert.equal(game.screen, "play");
assert.ok(ui.targets.some(b => b.hold === "charge")); assert.ok(!ui.blocksTable);
game.screen = "upgrade"; game.offer = VERSUS_CARDS.slice(0, 3); game.offerSerial++; paint();
for (let i = 0; i < 30; i++) paint();
assert.equal(picked, "", "drawing the offer must never auto-pick a card");
assert.equal(ui.targets.filter(b => b.id.startsWith("card:")).length, 3);
ui.activate(`card:${game.offer[1].id}`); assert.equal(picked, VERSUS_CARDS[1]!.id);
game.screen = "over"; game.online = true;
game.onlineState = { game: 1, you: 0, revision: 1, canRematch: true, rematchReady: [false, false] }; paint();
ui.activate("again"); assert.equal(replay, 1); assert.ok(game.online && game.screen === "over");
game.onlineState.rematchReady = [true, false]; game.onlineState.revision++; paint();
assert.ok(ui.targets.find(b => b.id === "again")!.disabled); assert.ok(labels.includes("等待对手…"));
game.onlineState.canRematch = false; game.onlineState.rematchReady = [false, false]; game.onlineState.revision++; paint();
assert.ok(ui.targets.find(b => b.id === "again")!.disabled); assert.ok(labels.includes("对手已离开"));
for (const [width, height] of [[667, 375], [844, 390], [1024, 768]]) {
  Object.assign(window, { innerWidth: width, innerHeight: height });
  game.online = false; game.screen = "title"; game.onlineState = null; paint();
  const scale = Math.min(1, width! / 700, height! / 360);
  for (const button of ui.targets) {
    assert.ok(button.x * scale >= 40 && (button.x + button.w) * scale <= width! - 40, "buttons must fit safe-area width");
    assert.ok(button.y * scale >= 32 && (button.y + button.h) * scale <= height! - 12, "buttons must avoid capsule and bottom inset");
    assert.equal(ui.hit((button.x + button.w / 2) * scale, (button.y + button.h / 2) * scale)?.id, button.id);
  }
}
console.log("PASS mini-game visible menus, persisted preset actions, keyboard validation, manual cards, rematch state and safe-area hit targets");
