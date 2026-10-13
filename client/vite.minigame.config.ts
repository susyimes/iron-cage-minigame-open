import { resolve } from "node:path";
import { defineConfig } from "vite";

/**
 * 微信小游戏构建配置：
 * 把 Three.js 客户端连同适配层打成单个 IIFE 文件 minigame/js/game-bundle.js，
 * 由 minigame/game.js 通过 require() 加载执行。
 */
export default defineConfig({
  // No external music recording is bundled in the public distribution.
  publicDir: false,
  build: {
    target: "es2019",
    outDir: "../minigame/js",
    emptyOutDir: true,
    minify: "esbuild",
    sourcemap: false,
    lib: {
      entry: resolve(__dirname, "src/minigame-entry.ts"),
      formats: ["iife"],
      name: "IronCageMinigame",
      fileName: () => "game-bundle.js",
    },
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
      },
    },
  },
});
