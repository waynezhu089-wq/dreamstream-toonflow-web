import { fileURLToPath, URL } from "node:url";
import { realpathSync } from "node:fs";
import { execFileSync } from 'node:child_process';
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import AutoImport from "unplugin-auto-import/vite";
import Components from "unplugin-vue-components/vite";
import { TDesignResolver } from "@tdesign-vue-next/auto-import-resolver";
import { viteSingleFile } from "vite-plugin-singlefile";
import postcsspxtoviewport from "postcss-px-to-viewport";
function experimentalCommit() {
  try { return execFileSync('git',['-c',`safe.directory=${process.cwd()}`,'rev-parse','HEAD'],{encoding:'utf8',windowsHide:true}).trim(); }
  catch { return null; }
}

export default defineConfig({
  define: { 'import.meta.env.VITE_EXPERIMENTAL_COMMIT': JSON.stringify(experimentalCommit()) },
  base: "./",
  cacheDir: ".v04-vite-cache",
  build: {
    assetsInlineLimit: Infinity,
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
      },
    },
  },
  plugins: [
    vue(),
    AutoImport({
      dts: "src/types/auto-imports.d.ts",
      imports: ["vue", "pinia", "vue-router"],
      resolvers: [
        TDesignResolver({
          library: "vue-next",
        }),
        TDesignResolver({
          library: "chat",
        }),
      ],
    }),
    Components({
      dts: "src/types/components.d.ts",
      resolvers: [
        TDesignResolver({
          library: "vue-next",
        }),
        TDesignResolver({
          library: "chat",
        }),
      ],
    }),
    viteSingleFile(),
  ],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  css: {
    preprocessorOptions: {
      scss: {
        api: "modern-compiler",
      },
    },
    postcss: {
      plugins: [
        postcsspxtoviewport({
          // 要转化的单位
          unitToConvert: "px",
          // UI设计稿的大小
          viewportWidth: 1600,
          // 转换后的精度
          unitPrecision: 4,
          // 转换后的单位
          viewportUnit: "rem",
          // 字体转换后的单位
          fontViewportUnit: "rem",
          // 能转换的属性，*表示所有属性，!border表示border不转
          propList: ["*"],
          // 指定不转换为视窗单位的类名，
          selectorBlackList: ["ignore"],
          // 最小转换的值，小于等于1不转
          minPixelValue: 1,
          // 是否在媒体查询的css代码中也进行转换，默认false
          mediaQuery: true,
          // 是否转换后直接更换属性值
          replace: true,
          // 忽略某些文件夹下的文件或特定文件，例如 'node_modules' 下的文件
          exclude: [],
          // 包含那些文件或者特定文件
          include: [],
          // 是否处理横屏情况
          landscape: false,
        }),
      ],
    },
  },
  server: {
    port: 50189,
    // This experimental checkout reuses installed packages through a local
    // junction. Vite must be allowed to read the junction's exact real path.
    fs: { allow: [process.cwd(), realpathSync(fileURLToPath(new URL("./node_modules", import.meta.url)))] },
  },
});
