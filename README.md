# 老张工具箱（toolbox）

Android App 壳：把散在 `hellohopo.dpdns.org` 的个人项目收纳进一个手机 App。

- **技术栈**：Capacitor 7（WebView 壳），首页宫格 = 本地 `www/`，模块 = WebView 内打开
- **包名**：`com.homjanon.toolbox`（⚠️ 一经发布不可更改）
- **构建**：本机无 JDK/SDK → 全部由 GitHub Actions 云构建（`.github/workflows/android-build.yml`）
  - 推到 main → debug APK（Actions Artifacts 下载）
  - 推 tag `v*` → release 构建（产物挂 Releases；正式签名需先配 keystore Secrets）
- **模块清单**：与网页首页共用一份 [`modules.json`](https://hellohopo.dpdns.org/modules.json)
  - App 取数三级：直连 → Cloudflare 代理（`proxy.hellohopo.dpdns.org`，no-store）→ 内置兜底 `www/modules.js`
  - 新增模块：改 nav 仓的 `modules.json` 一处即可（App 端兜底清单建议同步）

## 本地开发

```bash
npm install
node cap.js sync android     # 同步 www/ 到 android 工程
node cap.js add android      # 首次已做过
```

> 注：`cap.js` 是 Capacitor CLI 的本地包装（绕开本机 bin 路径限制），等价于 `npx cap`。

## 路线

| 阶段 | 内容 | 状态 |
|---|---|---|
| 0 | PWA 地基（inv 图标 / nav 配置化） | ✅ 2026-09-12 |
| 1 | 独立新闻源 news-feed | ✅ 2026-09-12 |
| 2 | App 壳 + inv 移植（WebView + Gitee 同步，看为主改少量） | 🚧 本仓 |
| 3 | 云构建 APK + 原生通知 | 🚧 本仓 CI |
| 4 | 早/下午双时段打磨 + 收纳其余模块 | 待启动 |

免责声明：仅供个人研究使用，不构成投资建议。
