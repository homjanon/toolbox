/* 老张工具箱 · 首页逻辑
   ── 2026-09-14 v0.7：底部四 Tab 框架 ──
   新闻：原生渲染（读 news-feed JSON）  资产：入口卡 → 原生容器全屏
   工具：现有全部模块                   我的：设置入口
   原生调用通道优先级（沿用 v0.6 已验证的顺序，不动）：
     ① window.AndroidToolbox（原生 @JavascriptInterface，最稳）
     ② 官方插件代理 registerPlugin（内部走桥，失败必须 catch 兜底）
     ③ location.href（网页预览 / 最终兜底） */
import { Capacitor, registerPlugin } from '@capacitor/core';
import { App } from '@capacitor/app';
import { StatusBar, Style } from '@capacitor/status-bar';
import { MODULES } from './modules.mjs';

const APP_VERSION = 'v0.7';
const NEWS_BASE = 'https://homjanon.github.io/news-feed/';
const INV_URL = 'https://inv.hellohopo.dpdns.org/';
const FINANCE_IDS = ['portfolio', 'market-live', 'xiaoxu-fear', 'cmb-tracker', 'douban-tracker', 'qdii-nav-tracker'];

const inApp = Capacitor.isNativePlatform();
const ModuleLauncher = registerPlugin('ModuleLauncher');

const $ = (id) => document.getElementById(id);

/* ───────────── 通用 ───────────── */
function tip(msg) {
  const el = $('nativeTip');
  if (!el) return;
  el.style.display = 'block';
  el.textContent = msg;
}

function diagText(extra) {
  return [
    '平台：' + Capacitor.getPlatform() + (inApp ? '（App 内）' : '（浏览器）'),
    '原生接口 AndroidToolbox：' + (window.AndroidToolbox ? '有' : '无'),
    '插件代理 ModuleLauncher：' + (ModuleLauncher && typeof ModuleLauncher.open === 'function' ? '有' : '无'),
    extra ? '备注：' + extra : '',
  ].filter(Boolean).join('\n');
}

function sheet(title, body) {
  $('sheetTitle').textContent = title;
  $('sheetBody').textContent = body;
  $('mask').classList.add('on');
}

async function getJSON(url, ms = 7000) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url + (url.includes('?') ? '&' : '?') + 't=' + Date.now(), { signal: ctl.signal });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.json();
  } finally {
    clearTimeout(timer);
  }
}

/* ───────────── 打开模块（原生容器） ───────────── */
async function openModule(url, name) {
  const n = window.AndroidToolbox;
  if (n && typeof n.openModule === 'function') {
    try { n.openModule(url, name); return true; } catch (e) { /* 落到下一条 */ }
  }
  try {
    await ModuleLauncher.open({ url, name });
    return true;
  } catch (err) {
    const msg = (err && (err.message || err.errorMessage || err.code)) || String(err);
    if (inApp) tip('⚠️ 原生容器调用失败：' + String(msg).slice(0, 80) + '，已改用内置浏览器打开。');
  }
  return false;
}

async function go(url, name) {
  if (await openModule(url, name)) return;
  window.location.href = url;
}

/* ───────────── Tab 切换 ───────────── */
const TITLES = { news: '新闻', asset: '资产', tools: '工具', mine: '我的' };

function setupTabs() {
  const tabs = Array.from(document.querySelectorAll('.tab'));
  tabs.forEach((t) => {
    t.addEventListener('click', () => {
      const key = t.getAttribute('data-pane');
      tabs.forEach((x) => x.classList.toggle('on', x === t));
      document.querySelectorAll('.pane').forEach((p) => p.classList.toggle('on', p.id === 'pane-' + key));
      $('title').textContent = TITLES[key];
      $('content').scrollTop = 0;
    });
  });
}

/* ───────────── 新闻（原生渲染） ───────────── */
let currentEdition = 'morning';

function newsItemHTML(it) {
  /* 「新」标放在 meta 行：放标题里遇到长标题会被挤到第二行，排版不整 */
  const tag = it.isNew ? '<span class="badge-new">新</span>' : '';
  const src = it.source ? it.source + ' · ' : '';
  return '<div class="nitem" data-url="' + (it.url || '') + '">'
    + '<h3 class="ntitle">' + escapeHTML(it.title || '') + '</h3>'
    + '<p class="nsum">' + escapeHTML(it.summary || '') + '</p>'
    + '<div class="nmeta">' + tag + '<span>' + escapeHTML(src + (it.pubTime || '')) + '</span>'
    + '<span class="go">原文 ›</span></div>'
    + '</div>';
}

function escapeHTML(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function beijingToday() {
  return new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);
}

async function loadNews(edition) {
  currentEdition = edition;
  const list = $('newsList');
  list.innerHTML = '<div class="empty">加载中…</div>';
  const today = beijingToday();
  let data = null, fallback = false;
  try {
    data = await getJSON(NEWS_BASE + 'news/' + today + '-' + edition + '.json');
  } catch (e) {
    /* 当天该场还没生成 → 退回最新一场，并明确标注 */
    try { data = await getJSON(NEWS_BASE + 'latest.json'); fallback = true; } catch (e2) { /* 下面统一处理 */ }
  }
  if (!data || !data.items || !data.items.length) {
    list.innerHTML = '<div class="empty">暂时取不到新闻，请稍后再试</div>';
    return;
  }
  const note = (fallback && data.edition !== edition)
    ? '<div class="empty" style="padding:12px 16px;text-align:left">今天这场还没更新，先看最近一场（' + escapeHTML(data.editionName || '') + ' · ' + escapeHTML((data.fetched_at || '').slice(5, 16)) + '）</div>'
    : '';
  list.innerHTML = note + data.items.map(newsItemHTML).join('');
  Array.from(list.querySelectorAll('.nitem')).forEach((el) => {
    el.addEventListener('click', () => {
      const url = el.getAttribute('data-url');
      const title = (el.querySelector('.ntitle') || {}).textContent || '新闻原文';
      if (url) go(url, title.slice(0, 20));
    });
  });
}

function setupSeg() {
  const seg = $('seg');
  Array.from(seg.querySelectorAll('button')).forEach((b) => {
    b.addEventListener('click', () => {
      Array.from(seg.querySelectorAll('button')).forEach((x) => x.classList.toggle('on', x === b));
      loadNews(b.getAttribute('data-ed'));
    });
  });
}

/* ───────────── 工具（现有全部模块） ───────────── */
function toolCellHTML(m) {
  /* 图标加统一底色（用模块自身主色的浅色调），让 emoji 风格各异的格子看起来是一套 */
  const bg = (m.accent || '#2563eb') + '1a';
  return '<div class="tcell" data-url="' + m.url + '" data-name="' + escapeHTML(m.name) + '">'
    + '<div class="tico" style="background:' + bg + '">' + m.icon + '</div>'
    + '<div class="tname">' + escapeHTML(m.name) + '</div>'
    + '</div>';
}

function renderTools() {
  const fin = MODULES.filter((m) => FINANCE_IDS.includes(m.id));
  const other = MODULES.filter((m) => !FINANCE_IDS.includes(m.id));
  $('gridFinance').innerHTML = fin.map(toolCellHTML).join('');
  $('gridOther').innerHTML = other.map(toolCellHTML).join('');
  Array.from(document.querySelectorAll('.tcell')).forEach((el) => {
    el.addEventListener('click', () => go(el.getAttribute('data-url'), el.getAttribute('data-name')));
  });
}

/* ───────────── 我的（设置入口） ───────────── */
function setupMine() {
  $('verLabel').textContent = APP_VERSION + ' ›';

  $('rowSync').addEventListener('click', () => go(INV_URL, '个人资产管理'));
  $('rowNotify').addEventListener('click', () => sheet('新闻通知',
    '计划中的能力（下一版本）：\n\n· 早咖啡 07:00、下午茶 15:20 定时提醒\n· 用官方 @capacitor/local-notifications 实现，本地推送、不依赖第三方服务器\n\n说明：目前新闻抓取由云端定时任务完成（07:00 / 15:20），App 这端只是"到点提醒你来看"。'));
  $('rowRead').addEventListener('click', () => sheet('已读标记',
    '计划中的能力：\n\n· 记录哪些新闻看过，未读的显示"新"标\n· 数据存在手机本地（官方 @capacitor/preferences），不上传\n\n现在的"新"标来自抓取端（与上一场比对），不需要你自己操作。'));
  $('rowTheme').addEventListener('click', () => sheet('外观',
    '当前：跟随系统（浅色）。\n\n深色模式计划在后续版本支持——需要把整套配色做成变量（已预留 CSS 变量结构）。'));
  $('rowDiag').addEventListener('click', () => sheet('诊断信息',
    diagText() + '\n\n版本：' + APP_VERSION
    + '\nWebView：' + (navigator.userAgent || '').slice(0, 90)
    + '\n新闻源：' + NEWS_BASE
    + '\n模块数：' + MODULES.length + ' 个（见 src/modules.mjs）'));
  $('rowAbout').addEventListener('click', () => sheet('关于老张工具箱',
    '版本：' + APP_VERSION + '\n\n'
    + '收纳个人项目与日常信息的手机入口：\n'
    + '· 新闻：早咖啡 / 下午茶（谷歌 + 联合早报，AI 摘要）\n'
    + '· 资产：个人资产管理系统（持仓 / 盈亏 / 云端同步）\n'
    + '· 工具：其余自建站点\n\n'
    + '技术栈：Capacitor 7 + Vite\n'
    + '数据来源：news-feed（GitHub Actions 定时抓取）\n\n'
    + '仅供个人研究参考，不构成投资建议。'));

  $('sheetClose').addEventListener('click', () => $('mask').classList.remove('on'));
  $('mask').addEventListener('click', (e) => { if (e.target === $('mask')) $('mask').classList.remove('on'); });
}

/* ───────────── 原生增强（官方插件） ───────────── */
async function setupNative() {
  if (!inApp) return;
  try { await StatusBar.setStyle({ style: Style.Light }); } catch (e) { /* 忽略 */ }
  try { await StatusBar.setBackgroundColor({ color: '#ffffff' }); } catch (e) { /* 部分版本无效 */ }
  try {
    /* 回前台刷新新闻（比如 07:00 抓取完，切回 App 就能看到） */
    await App.addListener('appStateChange', ({ isActive }) => { if (isActive) loadNews(currentEdition); });
  } catch (e) { /* 忽略 */ }
}

/* ───────────── 资产入口卡 ───────────── */
function setupAsset() {
  $('cardInv').addEventListener('click', () => go(INV_URL, '个人资产管理'));
}

/* ───────────── 启动 ───────────── */
setupTabs();
setupSeg();
setupAsset();
setupMine();
renderTools();
loadNews('morning');
setupNative();

if (inApp && !window.AndroidToolbox && typeof ModuleLauncher.open !== 'function') {
  tip('⚠️ 未检测到原生通道，模块将以网页方式打开（无返回/首页按钮）。可在「我的 → 诊断信息」查看详情。');
}
