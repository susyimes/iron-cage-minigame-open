// @ts-nocheck
/**
 * 微信小游戏运行时适配层（runtime shim）
 *
 * 小游戏环境没有 DOM / BOM。这里为 Three.js Web 工程提供一套最小可用的
 * window / document / navigator / localStorage / WebSocket 等全局对象：
 *  - 主 canvas 来自 wx.createCanvas()（第一次创建即上屏画布）
 *  - document.createElement("canvas") 返回 wx 离屏画布（供贴图 2D 绘制）
 *  - 其余 HTML 元素是「虚拟元素」：classList / style / 事件都能用，但不渲染
 *    （HTML UI 在小游戏里不可见，画面全部由 WebGL canvas 承担）
 *
 * 只做最小模拟，够游戏逻辑跑起来即可；不追求浏览器兼容完整性。
 */

declare const wx: any;

/* ---------------------------------------------------------------- 系统信息 */

function readWindowInfo(): { width: number; height: number; dpr: number } {
  try {
    const i = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
    return {
      width: i.windowWidth || i.screenWidth || 375,
      height: i.windowHeight || i.screenHeight || 667,
      dpr: i.pixelRatio || 2,
    };
  } catch {
    return { width: 375, height: 667, dpr: 2 };
  }
}

const viewState = readWindowInfo();

/* ---------------------------------------------------------------- 事件骨架 */

class EventSink {
  __handlers: Record<string, { fn: (e: any) => void }[]> | undefined;

  addEventListener(type: string, fn: (e: any) => void): void {
    if (typeof fn !== "function") return;
    const handlers = (this.__handlers ??= {});
    const list = (handlers[type] ??= []);
    if (!list.some((h) => h.fn === fn)) list.push({ fn });
  }

  removeEventListener(type: string, fn: (e: any) => void): void {
    const list = this.__handlers?.[type];
    if (!list) return;
    const i = list.findIndex((h) => h.fn === fn);
    if (i >= 0) list.splice(i, 1);
  }

  __emit(type: string, e: any): void {
    const list = this.__handlers?.[type];
    if (!list) return;
    if (e && e.type === undefined) e.type = type;
    for (const h of [...list]) {
      try {
        h.fn(e);
      } catch (err) {
        console.error("[minigame] event handler error:", type, err);
      }
    }
  }
}

/* ---------------------------------------------------------------- 虚拟元素 */

class ClassList {
  private set = new Set<string>();
  constructor(private readonly owner: MiniElement) {}
  add(...names: string[]): void {
    for (const n of names) if (n) this.set.add(n);
    this.sync();
  }
  remove(...names: string[]): void {
    for (const n of names) this.set.delete(n);
    this.sync();
  }
  toggle(name: string, force?: boolean): boolean {
    const want = force === undefined ? !this.set.has(name) : !!force;
    if (want) this.set.add(name);
    else this.set.delete(name);
    this.sync();
    return want;
  }
  contains(name: string): boolean {
    return this.set.has(name);
  }
  private sync(): void {
    this.owner.className = [...this.set].join(" ");
  }
}

let elementSerial = 0;

class MiniElement extends EventSink {
  id = "";
  tagName = "DIV";
  className = "";
  value = "";
  disabled = false;
  type = "";
  children: MiniElement[] = [];
  private attrs: Record<string, string> = {};
  private __classList: ClassList | undefined;
  private __style: Record<string, any> | undefined;
  private __text = "";
  innerHTML = "";

  constructor(tag = "DIV") {
    super();
    this.tagName = tag.toUpperCase();
  }

  get classList(): ClassList {
    return (this.__classList ??= new ClassList(this));
  }
  get style(): Record<string, any> {
    // 写入即记录，永不生效于渲染（小游戏无 CSS 盒模型）
    return (this.__style ??= {});
  }
  private get _attrs(): Record<string, string> {
    // 原型换接的 wx 画布不走构造函数，字段一律懒初始化
    return ((this as any).attrs ??= {});
  }
  private get _children(): MiniElement[] {
    return ((this as any).children ??= []);
  }
  get textContent(): string {
    return this.__text ?? "";
  }
  set textContent(v: string) {
    this.__text = v == null ? "" : String(v);
    (this as any).children = [];
  }
  get childNodes(): MiniElement[] {
    return this._children;
  }
  get parentNode(): null {
    return null;
  }
  get dataset(): Record<string, string> {
    return {};
  }

  setAttribute(k: string, v: string): void {
    this._attrs[k] = String(v);
  }
  getAttribute(k: string): string | null {
    return k in this._attrs ? this._attrs[k] : null;
  }
  removeAttribute(k: string): void {
    delete this._attrs[k];
  }
  hasAttribute(k: string): boolean {
    return k in this._attrs;
  }

  appendChild<T extends MiniElement>(node: T): T {
    this._children.push(node);
    return node;
  }
  append(...nodes: (MiniElement | string)[]): void {
    for (const n of nodes) if (n instanceof MiniElement) this._children.push(n);
  }
  replaceChildren(...nodes: (MiniElement | string)[]): void {
    (this as any).children = nodes.filter((n): n is MiniElement => n instanceof MiniElement);
  }
  removeChild<T extends MiniElement>(node: T): T {
    const i = this._children.indexOf(node);
    if (i >= 0) this._children.splice(i, 1);
    return node;
  }
  remove(): void {}

  querySelector(): MiniElement {
    // 联机 HUD 才会用到；返回哑元素避免空指针，不保证内容正确
    return new MiniElement();
  }
  querySelectorAll(): MiniElement[] {
    return [];
  }
  closest(): null {
    return null;
  }
  contains(node: MiniElement): boolean {
    return this._children.includes(node);
  }

  getBoundingClientRect(): { left: number; top: number; right: number; bottom: number; width: number; height: number } {
    return { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 };
  }
  setPointerCapture(): void {}
  releasePointerCapture(): void {}
  hasPointerCapture(): boolean {
    return false;
  }
  requestFullscreen(): Promise<void> {
    return Promise.reject(new Error("minigame: no fullscreen"));
  }
  focus(): void {}
  blur(): void {}
  click(): void {
    this.__emit("click", { type: "click", target: this, preventDefault() {}, stopPropagation() {} });
  }
}

/* ---------------------------------------------------------------- canvas */

const adoptedCanvases = new WeakSet<object>();

/** Supply DOM identity without replacing the native canvas prototype. */
class HTMLCanvasElement extends MiniElement {
  static [Symbol.hasInstance](value: any): boolean {
    return !!value && adoptedCanvases.has(value);
  }
  constructor() {
    super("CANVAS");
  }
  getBoundingClientRect() {
    return {
      left: 0,
      top: 0,
      right: viewState.width,
      bottom: viewState.height,
      width: viewState.width,
      height: viewState.height,
    };
  }
}

/** Keep native width/height setters: losing them leaves the drawing buffer unscaled. */
function adoptCanvas(raw: any, id = ""): any {
  if (!raw) throw new Error("wx.createCanvas() failed");
  adoptedCanvases.add(raw);
  const events = new Set(["__emit", "addEventListener", "removeEventListener", "getBoundingClientRect", "setPointerCapture", "releasePointerCapture", "hasPointerCapture"]);
  for (const prototype of [HTMLCanvasElement.prototype, MiniElement.prototype, EventSink.prototype]) {
    for (const key of Object.getOwnPropertyNames(prototype)) {
      if (key === "constructor" || (key in raw && !events.has(key))) continue;
      Object.defineProperty(raw, key, Object.getOwnPropertyDescriptor(prototype, key)!);
    }
  }
  raw.__handlers = {};
  raw.id = id;
  if (raw.style === undefined) {
    try {
      raw.style = {};
    } catch {
      /* 某些基础库 canvas 的 style 只读，忽略 */
    }
  }
  return raw;
}

let mainCanvas: any = null;
/** 第一个 wx.createCanvas() 必须是上屏主画布，在装载适配层时立即创建。 */
function ensureMainCanvas(): any {
  if (!mainCanvas) mainCanvas = adoptCanvas(wx.createCanvas(), "view");
  return mainCanvas;
}

/* ---------------------------------------------------------------- document */

class MiniInputElement extends MiniElement {}
class MiniButtonElement extends MiniElement {}

const elementById = new Map<string, MiniElement>();

function inferElement(id: string): MiniElement {
  if (id === "online-name" || id === "online-room") {
    const input = new MiniInputElement("INPUT");
    input.id = id;
    return input;
  }
  if (id.startsWith("btn-") || id.startsWith("touch-")) {
    const btn = new MiniButtonElement("BUTTON");
    btn.id = id;
    return btn;
  }
  const div = new MiniElement(id === "view" ? "CANVAS" : "DIV");
  div.id = id;
  return div;
}

class MiniDocument extends EventSink {
  hidden = false;
  visibilityState = "visible";
  fullscreenElement = null;
  activeElement = null;
  readonly body = new MiniElement("BODY");
  readonly head = new MiniElement("HEAD");
  readonly documentElement = new MiniElement("HTML");
  readyState = "complete";

  getElementById(id: string): MiniElement | null {
    if (id === "view") return ensureMainCanvas();
    let el = elementById.get(id);
    if (!el) {
      el = inferElement(id);
      elementById.set(id, el);
    }
    return el;
  }
  createElement(tag: string): any {
    if (String(tag).toLowerCase() === "canvas") return adoptCanvas(wx.createCanvas());
    const t = String(tag).toUpperCase();
    if (t === "INPUT") return new MiniInputElement(t);
    if (t === "BUTTON") return new MiniButtonElement(t);
    return new MiniElement(t);
  }
  createElementNS(_ns: string, tag: string): any {
    return this.createElement(tag);
  }
  querySelector(): null {
    return null;
  }
  querySelectorAll(): MiniElement[] {
    return [];
  }
  getSelection(): { removeAllRanges(): void; toString(): string } {
    return { removeAllRanges() {}, toString: () => "" };
  }
}

/* ---------------------------------------------------------------- window 级对象 */

const windowSink = new EventSink();

const mediaQuery = (query: string) => ({
  matches: /coarse/i.test(query), // 手机触屏
  media: query,
  onchange: null,
  addEventListener() {},
  removeEventListener() {},
  addListener() {},
  removeListener() {},
  dispatchEvent: () => false,
});

const miniLocalStorage = {
  getItem(k: string): string | null {
    try {
      const v = wx.getStorageSync(k);
      return v === "" || v === undefined || v === null ? null : String(v);
    } catch {
      return null;
    }
  },
  setItem(k: string, v: string): void {
    try {
      wx.setStorageSync(k, String(v));
    } catch {
      /* 存储不可用时静默 */
    }
  },
  removeItem(k: string): void {
    try {
      wx.removeStorageSync(k);
    } catch {
      /* ignore */
    }
  },
  clear(): void {
    try {
      wx.clearStorageSync();
    } catch {
      /* ignore */
    }
  },
};

/** 万能空对象：任意属性访问 / 调用 / new 都返回自身，数值语境为 0。 */
function makeNullObject(): any {
  const fn = function () {};
  return new Proxy(fn, {
    get: (_t, p) => (p === Symbol.toPrimitive ? () => 0 : nullObject),
    set: () => true,
    apply: () => nullObject,
    construct: () => nullObject,
  });
}
const nullObject = makeNullObject();

function makeAudioContextCtor(): any {
  if (typeof wx.createWebAudioContext === "function") {
    return class MiniWebAudioContext {
      constructor() {
        return wx.createWebAudioContext();
      }
    };
  }
  // 基础库太老时退化为静音哑上下文，保证游戏逻辑不受影响
  return class SilentAudioContext {
    constructor() {
      return nullObject;
    }
  };
}

class MiniWebSocket extends EventSink {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  readonly CONNECTING = 0;
  readonly OPEN = 1;
  readonly CLOSING = 2;
  readonly CLOSED = 3;
  readyState = 0;
  onopen: ((e: any) => void) | null = null;
  onclose: ((e: any) => void) | null = null;
  onmessage: ((e: any) => void) | null = null;
  onerror: ((e: any) => void) | null = null;
  private task: any = null;

  constructor(private readonly url: string) {
    super();
    try {
      const task = wx.connectSocket({ url });
      this.task = task;
      task.onOpen((e: any) => {
        if (this.readyState !== MiniWebSocket.CONNECTING) { task.close({}); return; }
        this.readyState = 1;
        this.onopen?.(e);
        this.__emit("open", e ?? { type: "open" });
      });
      task.onMessage((e: any) => {
        const evt = { type: "message", data: e?.data };
        this.onmessage?.(evt);
        this.__emit("message", evt);
      });
      task.onClose((e: any) => {
        this.readyState = 3;
        const evt = { type: "close", code: e?.code ?? 1000, reason: e?.reason ?? "" };
        this.onclose?.(evt);
        this.__emit("close", evt);
      });
      task.onError((e: any) => {
        const evt = { type: "error", message: e?.errMsg ?? "socket error" };
        this.onerror?.(evt);
        this.__emit("error", evt);
      });
    } catch (err) {
      console.error("[minigame] WebSocket 创建失败:", err);
      this.readyState = 3;
    }
  }
  send(data: string): void {
    if (this.readyState !== 1 || !this.task) return;
    try {
      this.task.send({ data });
    } catch (err) {
      console.error("[minigame] WebSocket 发送失败:", err);
    }
  }
  close(): void {
    if (!this.task || this.readyState === MiniWebSocket.CLOSED) return;
    this.readyState = MiniWebSocket.CLOSING;
    try {
      this.task.close({});
    } catch {
      /* ignore */
    }
  }
}

/* ---------------------------------------------------------------- 装载 */

let installed = false;

export function installRuntime(): any {
  if (installed) return mainCanvas;
  installed = true;

  const canvas = ensureMainCanvas();
  const g = globalThis as any;

  /**
   * 写对象字段。真机环境没有 window/document，直接新建；
   * 开发者工具沙箱里 window/document 是不可替换的内建对象，只能就地修补。
   */
  const setProp = (obj: any, key: string, value: any): void => {
    try {
      Object.defineProperty(obj, key, { configurable: true, writable: true, value });
    } catch {
      try {
        obj[key] = value;
      } catch {
        console.warn("[minigame] 无法修补字段:", key);
      }
    }
  };
  const setGetter = (obj: any, key: string, getter: () => any): void => {
    try {
      Object.defineProperty(obj, key, { configurable: true, get: getter });
    } catch {
      /* 内建只读属性则跳过（沙箱一般已提供正确值） */
    }
  };

  const win: any = g.window && typeof g.window === "object" ? g.window : g;
  setProp(g, "window", win);
  setProp(g, "self", g);

  const miniDoc = new MiniDocument();
  const existingDoc: any = g.document && typeof g.document === "object" ? g.document : null;
  if (!existingDoc) {
    setProp(g, "document", miniDoc);
  } else if (typeof existingDoc.getElementById !== "function") {
    // 沙箱 document 缺方法：把 MiniDocument 的能力逐个补进去
    for (const name of ["getElementById", "createElement", "createElementNS", "querySelector", "querySelectorAll", "getSelection", "addEventListener", "removeEventListener"]) {
      const fn = (miniDoc as any)[name];
      if (typeof fn === "function") setProp(existingDoc, name, fn.bind(miniDoc));
    }
    for (const name of ["body", "head", "documentElement", "activeElement", "hidden", "visibilityState", "fullscreenElement", "readyState"]) {
      setProp(existingDoc, name, (miniDoc as any)[name]);
    }
  }

  const audioCtor = makeAudioContextCtor();
  const valuePatches: Record<string, any> = {
    navigator: {
      maxTouchPoints: 10,
      userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 MicroMessenger MiniGame",
      platform: "minigame",
      language: "zh-CN",
      onLine: true,
    },
    screen: {
      width: viewState.width,
      height: viewState.height,
      orientation: {
        type: "landscape-primary",
        angle: 90,
        lock: () => Promise.resolve(),
        unlock() {},
        addEventListener() {},
        removeEventListener() {},
      },
    },
    location: {
      protocol: "https:",
      host: "your-server.example.invalid",
      hostname: "your-server.example.invalid",
      port: "",
      href: "https://your-server.example.invalid/",
      pathname: "/",
      search: "",
      hash: "",
    },
    localStorage: miniLocalStorage,
    AudioContext: audioCtor,
    webkitAudioContext: audioCtor,
    WebSocket: MiniWebSocket,
    HTMLElement: MiniElement,
    HTMLCanvasElement,
    HTMLInputElement: MiniInputElement,
    HTMLButtonElement: MiniButtonElement,
    Image: class MiniImage extends MiniElement {
      constructor() {
        super("IMG");
      }
    },
    matchMedia: mediaQuery,
    getSelection: () => null,
    visualViewport: {
      get width() {
        return viewState.width;
      },
      get height() {
        return viewState.height;
      },
      scale: 1,
      offsetLeft: 0,
      offsetTop: 0,
      addEventListener() {},
      removeEventListener() {},
    },
    addEventListener: windowSink.addEventListener.bind(windowSink),
    removeEventListener: windowSink.removeEventListener.bind(windowSink),
    dispatchEvent: (e: any): boolean => {
      if (e && e.type) windowSink.__emit(e.type, e);
      return true;
    },
  };
  for (const [key, value] of Object.entries(valuePatches)) {
    setProp(g, key, value);
    if (win !== g) setProp(win, key, value);
  }
  const getterPatches: Record<string, () => any> = {
    innerWidth: () => viewState.width,
    innerHeight: () => viewState.height,
    outerWidth: () => viewState.width,
    outerHeight: () => viewState.height,
    devicePixelRatio: () => viewState.dpr,
  };
  for (const [key, getter] of Object.entries(getterPatches)) {
    setGetter(g, key, getter);
    if (win !== g) setGetter(win, key, getter);
  }

  if (typeof g.requestAnimationFrame !== "function") {
    if (typeof canvas.requestAnimationFrame === "function") {
      g.requestAnimationFrame = canvas.requestAnimationFrame.bind(canvas);
      g.cancelAnimationFrame = canvas.cancelAnimationFrame
        ? canvas.cancelAnimationFrame.bind(canvas)
        : (id: number) => clearTimeout(id);
    } else {
      g.requestAnimationFrame = (cb: (t: number) => void) => setTimeout(() => cb(Date.now()), 16);
      g.cancelAnimationFrame = (id: any) => clearTimeout(id);
    }
  }
  if (typeof g.performance !== "object" || typeof g.performance?.now !== "function") {
    try {
      const perf = typeof wx.getPerformance === "function" ? wx.getPerformance() : null;
      g.performance = perf && typeof perf.now === "function" ? { now: () => perf.now() } : { now: () => Date.now() };
    } catch {
      g.performance = { now: () => Date.now() };
    }
  }
  // The public build has no packaged music recording or generic network fetch adapter.
  const localFetch = (_url: string) => Promise.reject(new Error("No packaged fetch assets"));
  setProp(g, "fetch", localFetch);
  if (win !== g) setProp(win, "fetch", localFetch);

  // 窗口尺寸变化（横竖屏切换等）→ 同步 viewState 并派发 resize
  if (typeof wx.onWindowResize === "function") {
    wx.onWindowResize((res: any) => {
      const w = res?.size?.windowWidth;
      const h = res?.size?.windowHeight;
      if (w && h) {
        viewState.width = w;
        viewState.height = h;
      }
      windowSink.__emit("resize", { type: "resize" });
    });
  }
  if (typeof wx.onHide === "function") {
    wx.onHide(() => {
      miniDoc.hidden = true; miniDoc.visibilityState = "hidden";
      if (existingDoc) { setProp(existingDoc, "hidden", true); setProp(existingDoc, "visibilityState", "hidden"); }
      windowSink.__emit("blur", { type: "blur" });
      miniDoc.__emit("visibilitychange", { type: "visibilitychange" });
    });
  }
  wx.onShow?.(() => {
    miniDoc.hidden = false; miniDoc.visibilityState = "visible";
    if (existingDoc) { setProp(existingDoc, "hidden", false); setProp(existingDoc, "visibilityState", "visible"); }
    miniDoc.__emit("visibilitychange", { type: "visibilitychange" });
  });

  return canvas;
}

/** 主画布（Input 的指针事件目标）。 */
export function getView(): any {
  return ensureMainCanvas();
}

/** 触摸合成指针事件分发：canvas（down/move/up/cancel）+ window（move/up/cancel）。 */
export function dispatchPointer(type: string, e: any): void {
  const canvas = ensureMainCanvas();
  if (type === "pointerdown") canvas.__emit(type, e);
  windowSink.__emit(type, e);
  if (type !== "pointerdown") canvas.__emit(type, e);
}
