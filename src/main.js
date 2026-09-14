/* 老张工具箱 · 首页
   ── 方案 A（2026-09-14）──
   引入 Vite 打包 + 官方插件：
     · 模块容器调用改用官方 `registerPlugin('ModuleLauncher')` 代理（不再手工调 nativePromise）
     · 状态栏样式交给官方 `@capacitor/status-bar`
     · 回前台自动刷新新闻状态用官方 `@capacitor/app`
   通道优先级保持"最稳优先"：① 原生 JS 接口 → ② 官方插件代理 → ③ 内置浏览器兜底 */
import { Capacitor, registerPlugin } from '@capacitor/core';
import { App } from '@capacitor/app';
import { StatusBar, Style } from '@capacitor/status-bar';

const inApp = Capacitor.isNativePlatform();
/* 自研原生容器（Java 侧 @CapacitorPlugin(name="ModuleLauncher")），这里用官方方式注册代理 */
const ModuleLauncher = registerPlugin('ModuleLauncher');

const NEWS_BASE = 'https://homjanon.github.io/news-feed/';

/* ───────────────── 工具函数 ───────────────── */
const $ = (id) => document.getElementById(id);

function tip(msg) {
  const el = $('nativeTip');
  if (!el) return;
  el.style.display = 'block';
  el.textContent = msg;
}

function diag(extra) {
  return '〔诊断：原生接口=' + (window.AndroidToolbox ? '有' : '无')
    + '，插件代理=' + (ModuleLauncher && typeof ModuleLauncher.open === 'function' ? '有' : '无')
    + (extra ? '，' + extra : '') + '〕';
}

function getJSON(url, ms = 6000) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  return fetch(url + (url.includes('?') ? '&' : '?') + 't=' + Date.now(), { signal: ctl.signal })
    .then((r) => { clearTimeout(timer); if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .finally(() => clearTimeout(timer));
}

/* ───────────────── 1. 顶部问候与日期 ───────────────── */
function paintHeader() {
  const d = new Date(Date.now() + 8 * 3600e3);
  const h = d.getUTCHours();
  const w = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][d.getUTCDay()];
  $('today').textContent = d.toISOString().slice(0, 10).replace(/-/g, ' / ') + ' ' + w;
  $('hello').textContent =
    h < 6 ? '夜深了，老张' : h < 11 ? '早上好，老张' : h < 14 ? '中午好，老张'
      : h < 18 ? '下午好，老张' : '晚上好，老张';
}

/* ───────────────── 2. 打开模块（原生容器） ───────────────── */
async function openModule(url, name) {
  /* ① 原生 JS 接口：不依赖 Capacitor 内部实现，最稳 */
  const n = window.AndroidToolbox;
  if (n && typeof n.openModule === 'function') {
    try { n.openModule(url, name); return true; } catch (e) { /* 落到下一条 */ }
  }
  /* ② 官方插件代理（内部仍走桥，但失败会 reject，必须兜住） */
  try {
    await ModuleLauncher.open({ url, name });
    return true;
  } catch (err) {
    const msg = (err && (err.message || err.errorMessage || err.code)) || String(err);
    if (inApp) tip('⚠️ 原生容器调用失败：' + String(msg).slice(0, 90) + ' 已改用内置浏览器打开。' + diag());
  }
  return false;
}

function bindCards() {
  const map = { cardNews: '早咖啡 · 下午茶', cardInv: '个人资产管理' };
  Object.keys(map).forEach((id) => {
    const el = $(id);
    if (!el) return;
    el.addEventListener('click', async (ev) => {
      ev.preventDefault();
      const url = el.getAttribute('data-url');
      if (await openModule(url, map[id])) return;
      window.location.href = url;   // ③ 网页预览 / 最终兜底
    });
  });
}

/* ───────────────── 3. 新闻卡实时状态 ───────────────── */
async function refreshNews() {
  const d = new Date(Date.now() + 8 * 3600e3);
  const today = d.toISOString().slice(0, 10);
  const paint = (pillId, timeId, j) => {
    const pill = $(pillId), timeEl = $(timeId);
    if (!pill || !timeEl || !j) return;
    const t = (j.fetched_at || '').slice(11, 16);
    timeEl.textContent = t ? t + ' · ' + (j.counts ? j.counts.total : '?') + ' 条' : '已更新';
    const dot = pill.querySelector('.dot');
    if (dot) dot.className = 'dot';
    pill.classList.add('done');
  };
  try { paint('pillAm', 'amTime', await getJSON(NEWS_BASE + 'news/' + today + '-morning.json')); } catch (e) { /* 未更新 */ }
  try { paint('pillPm', 'pmTime', await getJSON(NEWS_BASE + 'news/' + today + '-afternoon.json')); } catch (e) { /* 未更新 */ }
  try {
    const j = await getJSON(NEWS_BASE + 'latest.json');
    const t = (j.fetched_at || '').slice(11, 16);
    $('newsSub').textContent = (j.editionName || '新闻') + '已更新 · ' + t
      + ' · ' + (j.counts ? j.counts.total : 20) + ' 条';
  } catch (e) { /* 保留默认文案 */ }
}

/* ───────────────── 4. 原生增强（官方插件） ───────────────── */
async function setupNative() {
  if (!inApp) return;
  /* 状态栏：浅色背景 + 深色图标（避让仍由原生 insets 负责，这里不碰 overlaysWebView） */
  try { await StatusBar.setStyle({ style: Style.Light }); } catch (e) { /* 忽略 */ }
  try { await StatusBar.setBackgroundColor({ color: '#f4f6f9' }); } catch (e) { /* 部分版本无效 */ }
  /* 回到前台时刷新新闻状态（比如早上 7 点抓取完，切回 App 就能看到已更新） */
  try {
    await App.addListener('appStateChange', ({ isActive }) => { if (isActive) refreshNews(); });
  } catch (e) { /* 忽略 */ }
}

/* ───────────────── 启动 ───────────────── */
paintHeader();
bindCards();
refreshNews();
setupNative();

/* 启动即自检：在 App 内却一个通道都没有，立刻提示（便于当场发现） */
if (inApp && !window.AndroidToolbox && typeof ModuleLauncher.open !== 'function') {
  tip('⚠️ 未检测到任何原生通道，模块将以网页方式打开（无返回/首页按钮）。' + diag());
}
