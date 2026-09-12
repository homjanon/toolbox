/* 本地运行 Capacitor CLI 的包装（WorkBuddy 环境里 bin/capacitor 直跑有路径限制）。
   用法：node cap.js add android / node cap.js sync android */
process.argv = [process.argv[0], 'capacitor'].concat(process.argv.slice(2));
require('@capacitor/cli/dist/index.js').run();
