import { defineConfig } from 'vite';

/* 方案 A：引入打包器。
   - 源码在 src/，构建产物输出到 www/（Capacitor 的 webDir）
   - 这样就能用官方推荐的 `import { registerPlugin } from '@capacitor/core'`，
     不再依赖底层 nativePromise 手工调用
   构建：npm run build  →  同步：npm run sync（build + cap sync android） */
export default defineConfig({
  base: './',   // 相对路径：Capacitor 与任意部署路径都能正确加载 assets
  root: 'src',
  publicDir: 'public',   // src/public/ 原样复制到 www/（存放 modules.js 兜底清单）
  build: {
    outDir: '../www',
    emptyOutDir: true,
    target: 'es2020',
    assetsDir: 'assets',
    sourcemap: false,
  },
});
