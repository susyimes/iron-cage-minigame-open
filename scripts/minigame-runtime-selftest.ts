import assert from "node:assert/strict";
const callbacks: Record<string, () => void> = {};
let socketUrl = "", filePath = "", socketCloses = 0;
const socketEvents: Record<string, (e?: any) => void> = {};
const data = new ArrayBuffer(8);
class NativeCanvas {
  buffer = { width: 0, height: 0 };
  get width() { return this.buffer.width; }
  set width(value: number) { this.buffer.width = value; }
  get height() { return this.buffer.height; }
  set height(value: number) { this.buffer.height = value; }
  getContext() { return this.buffer; }
}
Object.assign(globalThis, { wx: {
  getWindowInfo: () => ({ windowWidth: 844, windowHeight: 390, pixelRatio: 2 }),
  createCanvas: () => new NativeCanvas(),
  getStorageSync() {}, setStorageSync() {},
  onHide: (fn: () => void) => { callbacks.hide = fn; }, onShow: (fn: () => void) => { callbacks.show = fn; },
  connectSocket: ({ url }: any) => {
    socketUrl = url;
    return { onOpen: (fn: any) => { socketEvents.open = fn; }, onMessage: (fn: any) => { socketEvents.message = fn; },
      onClose: (fn: any) => { socketEvents.close = fn; }, onError: (fn: any) => { socketEvents.error = fn; }, send() {}, close() { socketCloses++; } };
  },
  getFileSystemManager: () => ({ readFile: (options: any) => { filePath = options.filePath; options.success({ data }); } }),
} });
async function main() {
  const { installRuntime } = await import("../client/src/minigame/runtime.ts");
  const canvas = installRuntime();
  canvas.width = 1266; canvas.height = 585;
  assert.deepEqual(canvas.getContext(), { width: 1266, height: 585 }, "native canvas setters must resize the drawing buffer");
  assert.ok(canvas instanceof NativeCanvas, "native canvas prototype must survive adaptation");
  assert.ok(canvas instanceof HTMLCanvasElement, "Three.js must still recognize a canvas texture");
  assert.equal(location.host, "your-server.example.invalid");
  const visibility: boolean[] = [];
  document.addEventListener("visibilitychange", () => visibility.push(document.hidden));
  callbacks.hide!(); callbacks.show!();
  assert.deepEqual(visibility, [true, false], "hide/show must drive input reset and server resync");
  const socket = new WebSocket(`wss://${location.host}/ws`);
  assert.equal(socketUrl, "wss://your-server.example.invalid/ws");
  let opened = false; socket.addEventListener("open", () => { opened = true; }); socketEvents.open!({});
  assert.ok(opened); assert.equal(socket.readyState, WebSocket.OPEN);
  socket.close(); assert.equal(socket.readyState, WebSocket.CLOSING);
  socketEvents.close!({}); assert.equal(socket.readyState, WebSocket.CLOSED);
  const abandoned = new WebSocket(`wss://${location.host}/ws`);
  let reopened = false; abandoned.addEventListener("open", () => { reopened = true; });
  abandoned.close(); socketEvents.open!({});
  assert.equal(reopened, false, "late onOpen must not revive a connection after leaving the room");
  assert.equal(abandoned.readyState, WebSocket.CLOSING); assert.equal(socketCloses, 3);
  socketEvents.close!({}); assert.equal(abandoned.readyState, WebSocket.CLOSED);
  await assert.rejects(fetch("/music/jazz.mp3"));
  assert.equal(filePath, "", "removed music must not be read from the filesystem");
  await assert.rejects(fetch("https://unrelated.example/file"));
  console.log("PASS mini-game configured socket routing, foreground/background events and removed music isolation");
}
void main();
