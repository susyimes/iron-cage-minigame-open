import * as THREE from "three";
import type { Game, Hud } from "../game/game.ts";
import { Online } from "../net.ts";
import { QUALITY_LEVELS, QUALITY_PRESETS } from "../game/quality.ts";
import { groupName } from "../game/rules.ts";
import { VERSUS_CARDS, type UpgradeId } from "../game/upgrades.ts";

declare const wx: any;
export type HoldAction = "charge" | "left" | "right" | "up" | "down";
export type MiniButton = { id: string; x: number; y: number; w: number; h: number; disabled: boolean; hold?: HoldAction };
const ink = "#f1ead8", gold = "#d9bd81", dim = "#b3bcae";

/** A reused canvas overlay. Only visible state changes upload a new texture. */
export class MiniUi {
  readonly canvas = document.createElement("canvas");
  private readonly ctx = this.canvas.getContext("2d")!;
  private readonly texture = new THREE.CanvasTexture(this.canvas);
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 2);
  private buttons: MiniButton[] = [];
  private net: Online | null = null;
  private page = "home";
  private name = "玩家";
  private room = "";
  private editing: "name" | "room" | null = null;
  private error = "";
  private key = "";
  private scale = 1;
  private width = 0;
  private height = 0;
  private left = 12;
  private right = 12;
  private top = 12;
  private bottom = 12;
  private lastDraw = 0;
  private lastMode = "";

  constructor(private readonly game: Game) {
    try { this.name = localStorage.getItem("iron-cage.name") || "玩家"; } catch { /* optional */ }
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.generateMipmaps = false;
    this.scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial({
      map: this.texture, transparent: true, depthTest: false, depthWrite: false, toneMapped: false,
    })));
    this.camera.position.z = 1;
    wx.onKeyboardInput?.(({ value }: { value: string }) => this.keyboardValue(value));
    wx.onKeyboardConfirm?.(({ value }: { value: string }) => { this.keyboardValue(value); this.finishKeyboard(); });
    wx.onKeyboardComplete?.(() => { this.editing = null; });
  }

  get mode(): string { return `${this.game.screen}:${this.game.settingsOpen}:${this.page}:${this.game.onlineState?.game}:${this.game.offerSerial}`; }
  get blocksTable(): boolean { return this.game.screen !== "play" || this.game.settingsOpen; }
  get targets(): readonly MiniButton[] { return this.buttons; }
  hit(x: number, y: number): MiniButton | undefined {
    return this.buttons.find(b => x / this.scale >= b.x && x / this.scale <= b.x + b.w && y / this.scale >= b.y && y / this.scale <= b.y + b.h);
  }

  activate(id: string): void {
    const g = this.game;
    void g.audio.unlock(); g.audio.click();
    if (id === "solo") { this.net?.disconnect(); this.net = null; g.startRun(); }
    else if (id === "online") { this.page = "online"; this.error = ""; }
    else if (id === "help") this.page = "help";
    else if (id === "back") { this.finishKeyboard(); this.page = "home"; }
    else if (id === "name" || id === "room") this.editField(id);
    else if (id === "join") {
      this.finishKeyboard(); this.room = this.room.trim().toUpperCase();
      if (this.room && !/^[A-Z0-9]{4}$/.test(this.room)) { this.error = "请输入 4 位字母或数字，留空可创建随机房间。"; return; }
      this.name = this.name.trim().slice(0, 12) || "玩家";
      try { localStorage.setItem("iron-cage.name", this.name); } catch { /* optional */ }
      this.net?.disconnect(); this.net = new Online(g); this.net.connect(this.room, this.name); this.error = "";
    } else if (id === "exit") {
      this.finishKeyboard(); this.net?.disconnect(); this.net = null;
      g.closeSettings(); g.exitToTitle(); this.page = "home";
    } else if (id === "again") g.playAgain();
    else if (id === "pause" || id === "resume") g.togglePause();
    else if (id === "settings") g.openSettings();
    else if (id === "settings-back") g.closeSettings();
    else if (id === "sound") g.audio.toggleMute();
    else if (id === "view") g.toggleView();
    else if (id.startsWith("quality:")) {
      const level = QUALITY_LEVELS.find(v => v === id.slice(8)); if (level) g.setQuality(level);
    } else if (id.startsWith("card:")) g.pickUpgrade(id.slice(5) as UpgradeId);
    g.input.reset();
  }

  cancel(): void { this.finishKeyboard(); this.game.input.reset(); }
  private keyboardValue(value: string): void {
    if (this.editing === "room") this.room = value.toUpperCase().slice(0, 4);
    if (this.editing === "name") this.name = value.slice(0, 12);
  }
  private finishKeyboard(): void {
    if (!this.editing) return;
    this.editing = null; wx.hideKeyboard?.({});
  }
  private editField(field: "name" | "room"): void {
    if (this.editing) this.finishKeyboard();
    this.editing = field;
    try {
      wx.showKeyboard({ defaultValue: this[field], maxLength: field === "room" ? 4 : 12, multiple: false, confirmHold: false, confirmType: "done",
        fail: () => { this.editing = null; this.error = "键盘未能打开，请重试。"; } });
    } catch { this.editing = null; this.error = "键盘未能打开，请重试。"; }
  }

  paint(): void {
    const h = this.game.hud(), w = window.innerWidth, height = window.innerHeight;
    const key = JSON.stringify([w, height, this.mode, this.name, this.room, this.editing, this.error,
      h.quality, h.muted, h.score, h.best, h.remaining, h.status, h.canShoot, h.myTurn, h.surveying,
      Math.round(h.power * 50), h.charging, h.mods, h.curses, h.rules.groups, h.overTitle, h.overLead,
      h.offerSerial, h.offer?.map(c => c.id), h.network?.revision, h.network?.names, !!this.game.onNetRematch,
      h.notices.map(n => n.id), h.history]);
    const now = performance.now();
    if (key !== this.key && (this.mode !== this.lastMode || now - this.lastDraw >= 32)) {
      this.key = key; this.lastMode = this.mode; this.lastDraw = now;
      this.layout(w, height); this.draw(h); this.texture.needsUpdate = true;
    }
    const renderer = this.game.renderer, autoClear = renderer.autoClear;
    renderer.autoClear = false; renderer.clearDepth(); renderer.render(this.scene, this.camera); renderer.autoClear = autoClear;
  }
  private layout(w: number, h: number): void {
    this.scale = Math.min(1, w / 700, h / 360);
    this.width = w / this.scale; this.height = h / this.scale;
    const ratio = Math.min(window.devicePixelRatio || 1, 1.5, 1536 / w);
    const pw = Math.round(w * ratio), ph = Math.round(h * ratio);
    if (this.canvas.width !== pw || this.canvas.height !== ph) { this.canvas.width = pw; this.canvas.height = ph; }
    this.ctx.setTransform(pw / this.width, 0, 0, ph / this.height, 0, 0);
    let safe: any, capsule: any;
    try { safe = wx.getWindowInfo?.().safeArea; capsule = wx.getMenuButtonBoundingClientRect?.(); } catch { /* old runtime */ }
    this.left = Math.max(12, (safe?.left ?? 0) / this.scale + 10);
    this.right = this.width - Math.max(12, (w - (safe?.right ?? w)) / this.scale + 10);
    this.top = Math.max(12, (safe?.top ?? 0) / this.scale + 8, (capsule?.bottom ?? 0) / this.scale + 8);
    this.bottom = this.height - Math.max(12, (h - (safe?.bottom ?? h)) / this.scale + 10);
  }
  private text(value: string, x: number, y: number, size = 15, color = ink, align: CanvasTextAlign = "left", max?: number): void {
    const c = this.ctx; c.fillStyle = color; c.font = `${size >= 22 ? "bold " : ""}${size}px sans-serif`;
    c.textAlign = align; c.textBaseline = "middle";
    if (max === undefined) c.fillText(value, x, y); else c.fillText(value, x, y, max);
  }
  private box(x: number, y: number, w: number, h: number, fill = "rgba(9,25,19,.94)", stroke = "#756848"): void {
    const c = this.ctx; c.fillStyle = fill; c.fillRect(x, y, w, h); c.strokeStyle = stroke; c.lineWidth = 1; c.strokeRect(x + .5, y + .5, w - 1, h - 1);
  }
  private button(id: string, label: string, x: number, y: number, w: number, height = 44, disabled = false, active = false, hold?: HoldAction): void {
    this.buttons.push({ id, x, y, w, h: height, disabled, hold });
    this.box(x, y, w, height, disabled ? "rgba(25,35,30,.85)" : active ? "#784836" : "rgba(18,39,29,.96)", active ? gold : "#726648");
    this.text(label, x + w / 2, y + height / 2, 15, disabled ? "#8b9389" : ink, "center", w - 16);
  }
  private wrap(value: string, x: number, y: number, width: number, size = 14, limit = 4): void {
    this.ctx.font = `${size}px sans-serif`;
    let line = "", row = 0;
    for (const char of value) {
      if (this.ctx.measureText(line + char).width > width) {
        this.text(line, x, y + row * (size + 8), size, dim); line = ""; row++;
        if (row >= limit) return;
      }
      line += char;
    }
    if (line) this.text(line, x, y + row * (size + 8), size, dim);
  }
  private draw(h: Hud): void {
    const c = this.ctx; c.clearRect(0, 0, this.width, this.height); this.buttons = [];
    const available = this.right - this.left, center = (this.left + this.right) / 2;
    if (h.screen === "play" && !h.settingsOpen) { this.drawHud(h); return; }
    c.fillStyle = "rgba(2,10,7,.58)"; c.fillRect(0, 0, this.width, this.height);
    const w = Math.min(660, available), x = center - w / 2;
    const height = Math.min(410, this.bottom - this.top), y = this.top + (this.bottom - this.top - height) / 2;
    this.box(x, y, w, height);
    const bx = x + 22, bw = w - 44, bottom = y + height - 58;
    if (h.settingsOpen) {
      this.text("画质与声音", bx, y + 31, 26);
      this.wrap("手动选择，立即生效并记住本机设置。不会自动切换画质。", bx, y + 67, bw);
      QUALITY_LEVELS.forEach((level, i) => this.button(`quality:${level}`, `${h.quality === level ? "✓ " : ""}${QUALITY_PRESETS[level].label}`, bx + i * (bw + 10) / 3, y + 105, (bw - 20) / 3, 48, false, h.quality === level));
      this.text(h.online ? "联机对局继续进行，请留意回合。" : "单人对局已暂停。", bx, y + 180, 14, dim);
      this.button("sound", h.muted ? "声音：关闭" : "声音：开启", bx, bottom, bw / 2 - 6);
      this.button("settings-back", "返回", bx + bw / 2 + 6, bottom, bw / 2 - 6);
    } else if (h.screen === "title") {
      if (this.page === "online") {
        this.text("联机对战", bx, y + 31, 26);
        this.text("相同的 4 位房间码即可同桌，留空创建随机房间。", bx, y + 66, 14, dim, "left", bw);
        this.button("name", `名字：${this.name || "玩家"}`, bx, y + 91, bw);
        this.button("room", `房间码：${this.room || "留空随机创建"}`, bx, y + 145, bw);
        this.wrap(this.error || (h.online ? h.status : "可与网页版玩家联机，无需登录。"), bx, y + 211, bw, 14, 2);
        this.button("join", h.online ? "重新连接" : "进入房间", bx, bottom, bw / 2 - 6, 44, this.editing !== null, true);
        this.button("exit", "返回主界面", bx + bw / 2 + 6, bottom, bw / 2 - 6);
      } else if (this.page === "help") {
        this.text("怎么玩", bx, y + 31, 26);
        ["单指左右拖动瞄准，上下拖动调节抬杆。", "按住「蓄力」按钮，松手出杆；滑出按钮取消。", "双指拖动转镜头，捏合缩放；「全桌」切换视角。", "先清空自己的全色或花色球，再合法打进黑 8。", "单人犯规白球自动复位；联机犯规给对手自由球。", "抽卡由你选择；联机结束后双方确认可原房重开。"].forEach((line, i) => this.text(line, bx, y + 76 + i * 25, 14, dim, "left", bw));
        this.button("back", "知道了", bx, bottom, bw, 44, false, true);
      } else {
        this.text("EIGHT BALL · CLUB EDITION", bx, y + 29, 12, gold);
        this.text("暴走台球", bx, y + 80, 44);
        this.wrap("娱乐八球 · 进球连杆 · 增强与使坏卡", bx, y + 122, bw, 16);
        this.text(h.best ? `最高得分 ${h.best}` : "与朋友同桌，打出你的下一杆。", bx, y + 159, 14, dim);
        this.button("solo", "单人练习", bx, bottom - 56, bw / 2 - 6, 46, false, true);
        this.button("online", "联机对战", bx + bw / 2 + 6, bottom - 56, bw / 2 - 6, 46);
        this.button("settings", "设置", bx, bottom, bw / 2 - 6);
        this.button("help", "玩法说明", bx + bw / 2 + 6, bottom, bw / 2 - 6);
      }
    } else if (h.screen === "upgrade" && h.offer) {
      this.text("选择本次卡牌", bx, y + 29, 25);
      this.text(h.online ? "增强只在自己出杆时生效，使坏只在对手出杆时生效。" : "选一张增强，继续本局练习。", bx, y + 63, 13, dim, "left", bw);
      const cw = (bw - 20) / 3, cy = y + 87, ch = bottom - cy - 10;
      h.offer.forEach((card, i) => {
        const cx = bx + i * (cw + 10);
        this.buttons.push({ id: `card:${card.id}`, x: cx, y: cy, w: cw, h: ch, disabled: false });
        this.box(cx, cy, cw, ch, card.target === "foe" ? "#30241e" : "#192e23", gold);
        this.text(card.target === "foe" ? "使坏 · 对手生效" : "增强 · 自己生效", cx + 12, cy + 23, 12, gold);
        this.text(card.name, cx + 12, cy + 53, 20, ink, "left", cw - 24);
        this.wrap(card.desc, cx + 12, cy + 78, cw - 24, 12, Math.max(1, Math.floor((ch - 86) / 20) + 1));
      });
      this.button("exit", "返回主界面", bx, bottom, bw);
    } else if (h.screen === "pause") {
      this.text(h.online ? "对局菜单" : "已暂停", bx, y + 38, 30);
      this.wrap(h.online ? "联机对局仍在继续。返回球台查看当前回合。" : "准备好了就继续这一杆。", bx, y + 86, bw, 16);
      this.button("resume", "继续对局", bx, bottom - 110, bw, 44, false, true);
      this.button("settings", "设置", bx, bottom - 55, bw / 2 - 6);
      this.button("sound", h.muted ? "开启声音" : "关闭声音", bx + bw / 2 + 6, bottom - 55, bw / 2 - 6);
      this.button("exit", "退出并返回主界面", bx, bottom, bw);
    } else if (h.screen === "over") {
      this.text(h.overTitle || "本局结束", bx, y + 40, 34);
      this.wrap(h.overLead, bx, y + 89, bw, 16, 2);
      this.wrap(h.history.join(" · "), bx, y + 137, bw, 13, 2);
      const s = h.network, ready = s?.rematchReady[s.you];
      const disabled = h.online && (!this.game.onNetRematch || !s?.canRematch || !!ready);
      const label = !h.online ? "再来一局" : !this.game.onNetRematch ? "连接已断开" : !s?.canRematch ? "对手已离开" : ready ? "等待对手…" : s.rematchReady[1 - s.you] ? "接受再来一局" : "再来一局";
      this.wrap(!h.online ? "再练一局，重新摆球。" : disabled && !ready ? "请返回主界面重新联机。" : ready ? "你已准备，等待对手确认后在原房间重开。" : "双方确认后在原房间重开，下一局轮换开球。", bx, bottom - 42, bw, 14, 2);
      this.button("again", label, bx, bottom, bw / 2 - 6, 44, disabled, true);
      this.button("exit", "返回主界面", bx + bw / 2 + 6, bottom, bw / 2 - 6);
    }
  }

  private drawHud(h: Hud): void {
    const x = this.left, r = this.right, y = this.top, b = this.bottom, s = h.network;
    const w = Math.min(360, r - x - 124);
    this.box(x, y, w, 74, "rgba(8,24,17,.80)");
    this.text(s ? `房间 ${s.room} · 第 ${s.round} 杆` : "单人练习", x + 12, y + 18, 13, gold);
    if (s) {
      this.text(`你 · ${s.names[s.you]}  ${s.scores[s.you]} 分 · ${groupName(h.rules.groups[s.you] ?? null)}`, x + 12, y + 41, 14, ink, "left", w - 24);
      this.text(`对手 · ${s.names[1 - s.you]}  ${s.scores[1 - s.you]} 分 · ${groupName(h.rules.groups[1 - s.you] ?? null)}`, x + 12, y + 61, 13, dim, "left", w - 24);
    } else this.text(`${h.score} 分   ·   ${h.remaining} 球   ·   ${groupName(h.rules.groups[0])}`, x + 12, y + 48, 17, ink, "left", w - 24);
    this.button("pause", "菜单", r - 102, y, 102);
    this.button("view", h.surveying ? "击球位" : "全桌", r - 102, y + 54, 102, 40, this.game.phase === "rolling" || h.placing);
    this.box(x, y + 84, Math.min(r - x, 570), 33, "rgba(8,24,17,.8)");
    this.text(h.status, x + 12, y + 101, 13, ink, "left", Math.min(r - x, 570) - 24);
    const cardText = VERSUS_CARDS.filter(card => ((h.mods as any)[card.id] || (h.curses as any)[card.id])).map(card => `${card.name}×${(h.mods as any)[card.id] || (h.curses as any)[card.id]}`).join(" · ");
    if (cardText) this.text(cardText, x + 10, y + 132, 12, gold, "left", r - x - 20);
    const notice = h.notices.at(-1);
    if (notice) {
      this.box(x + 165, b - 100, Math.max(230, r - x - 330), 36, "rgba(8,24,17,.9)");
      this.text(`${notice.title} · ${notice.detail}`, (x + r) / 2, b - 82, 13, notice.kind === "bad" ? "#f2b296" : gold, "center", Math.max(210, r - x - 350));
    }
    this.button("left", "◀ 微调", x, b - 46, 80, 46, !h.canShoot, false, "left");
    this.button("right", "微调 ▶", x + 88, b - 46, 80, 46, !h.canShoot, false, "right");
    this.button("up", "抬高", r - 228, b - 46, 60, 46, !h.canShoot, false, "up");
    this.button("down", "压低", r - 160, b - 46, 60, 46, !h.canShoot, false, "down");
    this.button("charge", h.charging ? "松手出杆" : h.placing ? "摆白球" : h.canShoot ? "按住蓄力" : "等待", r - 92, b - 58, 92, 58, !h.canShoot, true, "charge");
    if (h.charging) {
      this.box(x + 190, b - 37, Math.max(90, r - x - 450), 20);
      this.ctx.fillStyle = gold; this.ctx.fillRect(x + 192, b - 35, Math.max(86, r - x - 454) * h.power, 16);
    }
  }
}
