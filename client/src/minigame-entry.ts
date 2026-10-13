// @ts-nocheck
/**
 * 小游戏构建入口（vite.minigame.config.ts 的 lib entry）。
 *
 * 顺序很重要：
 *  1. 先装适配层（创建主画布、挂 window/document 等全局对象）
 *  2. 加载与 Web 共享的 Game，使用小游戏可见的 canvas UI。
 *  3. 保留首页，单人、联机和卡牌都由玩家主动选择。
 */
import { installRuntime } from "./minigame/runtime";

installRuntime();

import("./game/game.ts")
  .then(async ({ Game }) => {
    const { bootMinigame } = await import("./minigame/bootstrap.ts");
    const game = new Game(document.getElementById("view") as HTMLCanvasElement);
    bootMinigame(game);
    console.log("[minigame] 暴走台球小游戏包已启动");
  })
  .catch((err) => {
    console.error("[minigame] 启动失败:", err);
  });
