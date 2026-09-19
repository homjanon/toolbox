/* 老张工具箱 · 首页逻辑
   ── v0.8（2026-09-15）──
   ① 资产四格接入真实数据（market-live 行情/估值 + portfolio 的 QDII 溢价与额度）
   ② 四格内容可在「工具 → 资产板块设置」自己勾选（存本机；默认值＝与用户确认的清单）
   ③ 取数统一首选经 proxy.hellohopo.dpdns.org 代理，失败再试直连，都失败则显示空值（不显示假数字）
   原生调用通道优先级（沿用 v0.6 已验证顺序，不动）：
     ① window.AndroidToolbox（原生 @JavascriptInterface，最稳）
     ② 官方插件代理 registerPlugin（桥，失败必须 catch）
     ③ location.href（网页预览 / 最终兜底） */
import { Capacitor, registerPlugin } from '@capacitor/core';
import { App } from '@capacitor/app';
import { StatusBar, Style } from '@capacitor/status-bar';
import { Preferences } from '@capacitor/preferences';
import { MODULES } from './modules.mjs';

const APP_VERSION = 'v0.13';
const PROXY = 'https://proxy.hellohopo.dpdns.org/?url=';
const SRC_NEWS = 'https://raw.githubusercontent.com/homjanon/news-feed/main/docs/';
const SRC_MARKET = 'https://market-live.hellohopo.dpdns.org/api/data';
const SRC_QDII = 'https://raw.githubusercontent.com/homjanon/portfolio/main/qdii_prev.json';
const INV_URL = 'https://inv.hellohopo.dpdns.org/';
const FINANCE_IDS = ['portfolio', 'market-live', 'xiaoxu-fear', 'cmb-tracker', 'douban-tracker', 'qdii-nav-tracker'];

const inApp = Capacitor.isNativePlatform();
const ModuleLauncher = registerPlugin('ModuleLauncher');
const $ = (id) => document.getElementById(id);

/* ───────────── 主题（跟随系统 / 浅色 / 深色）───────────── */
const THEME_KEY = 'toolbox.theme';
let THEME = 'auto';                       // auto | light | dark
const mqDark = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

function effectiveTheme() {
  if (THEME === 'dark') return 'dark';
  if (THEME === 'light') return 'light';
  return (mqDark && mqDark.matches) ? 'dark' : 'light';
}

function applyTheme() {
  const eff = effectiveTheme();
  document.documentElement.setAttribute('data-theme', eff);
  if (inApp) {
    try { StatusBar.setStyle({ style: eff === 'dark' ? Style.Dark : Style.Light }); } catch (e) { /* 忽略 */ }
    try { StatusBar.setBackgroundColor({ color: eff === 'dark' ? '#171b22' : '#ffffff' }); } catch (e) { /* 忽略 */ }
  }
  const el = $('themeLabel');
  if (el) el.textContent = THEME === 'auto' ? '跟随系统' : (THEME === 'dark' ? '深色' : '浅色');
}

async function loadTheme() {
  try {
    if (inApp) {
      const { value } = await Preferences.get({ key: THEME_KEY });
      if (value) THEME = value;
    }
  } catch (e) { /* 忽略 */ }
  if (!['auto', 'light', 'dark'].includes(THEME)) THEME = 'auto';
  if (mqDark && mqDark.addEventListener) mqDark.addEventListener('change', applyTheme);
  applyTheme();
}

async function setTheme(mode) {
  THEME = mode;
  try { if (inApp) await Preferences.set({ key: THEME_KEY, value: mode }); } catch (e) { /* 忽略 */ }
  try { localStorage.setItem(THEME_KEY, mode); } catch (e) { /* 忽略 */ }
  applyTheme();
}

/* ───────────── 外观（三行可点选项）─────────────
   ⚠️ 不要写成"回复数字切换"—— App 里没有对话框，必须是可点元素。 */
const THEME_OPTS = [
  { k: 'auto', label: '跟随系统', sub: '随手机设置自动切换' },
  { k: 'light', label: '浅色', sub: '' },
  { k: 'dark', label: '深色', sub: '' },
];

function renderThemeDialog() {
  const box = $('themeList');
  if (!box) return;
  box.innerHTML = THEME_OPTS.map((o) => {
    const sel = THEME === o.k;
    const tail = sel ? '<span class="sub2">当前</span>'
      : (o.sub ? '<span class="sub2">' + o.sub + '</span>' : '');
    return '<div class="optrow' + (sel ? ' sel' : '') + '" data-theme-opt="' + o.k + '">'
      + '<span class="ck">' + (sel ? '✓' : '') + '</span>' + escapeHTML(o.label) + tail + '</div>';
  }).join('');
  Array.from(box.querySelectorAll('.optrow')).forEach((el) => {
    el.onclick = async () => {
      await setTheme(el.getAttribute('data-theme-opt'));
      renderThemeDialog();          // 重渲染以更新打勾与"当前"
    };
  });
}

function openThemeDialog() {
  renderThemeDialog();
  $('themeMask').classList.add('on');
}

/* ───────────── 四格配置 ───────────── */
const CFG_KEY = 'toolbox.assetBoards.v2';
const LIMITS = { market: 6, hold: 6, val: 4, overseas: 3 };
const DEFAULT_CFG = {
  market: ['上证指数', '沪深300', '恒生指数', '日经225', '德国DAX', '富时A50期指'],
  hold: ['红利低波', '纳斯达克100', '标普500', '30年国债ETF'],
  val: ['中证红利低波', '沪深300', '中概互联50'],
  overseas: ['标普500', '纳指100'],
};
/* 海外投资可选品类（数据源只覆盖这两个：各有场内 ETF 与场外 QDII 的溢价/额度） */
const OVERSEAS_POOL = [
  { key: '标普500', etf: ['513500', '513650', '159612'], od: ['007721', '007722', '008401', '096001', '017641'] },
  { key: '纳指100', etf: ['513100', '159941', '159659'], od: ['019736', '019737', '018043', '018044', '019441'] },
];
/* QDII 代码 → 显示名（27 只，2026-09-15 经公开接口逐一核对） */
const FUND_NAMES = {
  513100: '纳指ETF国泰', 159941: '纳指ETF广发', 159659: '纳指100ETF招商',
  513500: '标普500ETF博时', 513650: '标普500ETF南方', 159612: '标普500ETF国泰',
  '007721': '天弘标普500(FOF)A', '007722': '天弘标普500(FOF)C',
  '008401': '大成标普500C', '096001': '大成标普500A', '017641': '摩根标普500A',
  '019736': '宝盈纳指100A', '019737': '宝盈纳指100C', '018043': '天弘纳指100A',
  '018044': '天弘纳指100C', '019441': '万家纳指100A', '019442': '万家纳指100C',
  '017642': '摩根标普500美钞', '019305': '摩根标普500C', '160213': '国泰纳指100（场外）',
};

let CFG = { ...DEFAULT_CFG };
let MARKET = null;      // market-live 原始数据
let QDII = null;        // qdii_prev 原始数据
let QUOTES = {};        // 归一化行情池：name -> {chg, ytd, kind}
let VALS = {};          // 归一化估值池：name -> {pe, pe_pct, yield}

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
    '行情数据：' + (MARKET ? MARKET.generated_at + '（market-live）' : '未取到'),
    'QDII 数据：' + (QDII ? QDII.日期 + '（portfolio）' : '未取到'),
    '四格配置：' + JSON.stringify(CFG),
    extra ? '备注：' + extra : '',
  ].filter(Boolean).join('\n');
}

function sheet(title, body) {
  $('sheetTitle').textContent = title;
  $('sheetBody').textContent = body;
  $('mask').classList.add('on');
}

function beijingNow() { return new Date(Date.now() + 8 * 3600e3); }
function beijingToday() { return beijingNow().toISOString().slice(0, 10); }

/* 取数：一律先代理 → 失败直连 → 都失败抛错（调用方决定后续） */
async function fetchJSON(url, ms = 9000) {
  const tryOnce = async (u) => {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), ms);
    try {
      const r = await fetch(u + (u.includes('?') ? '&' : '?') + 't=' + Date.now(), { signal: ctl.signal });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return await r.json();
    } finally { clearTimeout(timer); }
  };
  try { return await tryOnce(PROXY + encodeURIComponent(url)); }
  catch (e) { return await tryOnce(url); }
}

/* ───────────── 新闻缓存（v0.9）─────────────
   设计要点：缓存失效【不看时钟，看"这一场是否已取过"】。
   缓存键 = toolbox.news.{场次}.{北京日期} → 同一场次同一天只请求一次；
   过了 15:20 / 22:30，"最近场次"变化 → 键变化 → 自然去取新的一场。
   另外单独存一份 latest（本场未生成时回退显示用）。 */
const CACHE_PREFIX = 'toolbox.news.';
const LATEST_KEY = CACHE_PREFIX + 'latest';
const EDITION_LABEL = { afternoon: '下午茶', night: '夜豆浆' };
/* 场次时刻（北京时间，分钟数）：下午茶 15:20、夜豆浆 22:30。
   ⚠️ 缓存的"日期"必须由这里反推，不能用"今天"——
   否则每天早上打开，键从昨晚的 night.{昨天} 变成 night.{今天}，必然未命中而重新请求。 */
const SLOT_AT = { afternoon: 15 * 60 + 20, night: 22 * 60 + 30 };
/* 本场还没生成时的缓存有效期（10 分钟）：既不再反复重查，又不会漏掉随后生成的新数据 */
const MISS_TTL = 10 * 60 * 1000;

/* 该场次【最近一次已发生】的日期：
   现在 07:32 → 今天的 15:20/22:30 都还没到 → 最近一场是【昨天 22:30 的夜豆浆】→ 返回昨天 */
function slotDateFor(edition) {
  const nb = beijingNow();
  const mins = nb.getUTCHours() * 60 + nb.getUTCMinutes();
  const today = nb.toISOString().slice(0, 10);
  if (mins >= (SLOT_AT[edition] || 0)) return today;
  return new Date(nb.getTime() - 86400e3).toISOString().slice(0, 10);
}

/* 当前该看哪一场（页签默认与缓存判定共用同一套边界）：
   ≥22:30 → night(今天) ; 15:20–22:29 → afternoon(今天) ; 其余 → night(昨天) */
function defaultEdition() {
  const nb = beijingNow();
  const mins = nb.getUTCHours() * 60 + nb.getUTCMinutes();
  if (mins >= SLOT_AT.night) return 'night';
  if (mins >= SLOT_AT.afternoon) return 'afternoon';
  return 'night';
}

async function kvGet(key) {
  try {
    if (inApp) {
      const { value } = await Preferences.get({ key });
      if (value) return JSON.parse(value);
    }
  } catch (e) { /* 落到 localStorage */ }
  try {
    const v = localStorage.getItem(key);
    return v ? JSON.parse(v) : null;
  } catch (e) { return null; }
}

async function kvSet(key, obj) {
  const s = JSON.stringify(obj);
  try { if (inApp) await Preferences.set({ key, value: s }); } catch (e) { /* 忽略 */ }
  try { localStorage.setItem(key, s); } catch (e) { /* 忽略 */ }
}

async function kvDel(key) {
  try { if (inApp) await Preferences.remove({ key }); } catch (e) { /* 忽略 */ }
  try { localStorage.removeItem(key); } catch (e) { /* 忽略 */ }
}

async function kvKeys() {
  try { if (inApp) { const { keys } = await Preferences.keys(); return keys || []; } } catch (e) { /* 落到 localStorage */ }
  try { return Object.keys(localStorage); } catch (e) { return []; }
}

/* 只保留【今天的两个场次】+ latest，其余（旧日期）删掉，避免无限增长 */
async function pruneNewsCache() {
  /* 保留【今天 + 昨天】两份：跨日时"昨天 22:30 的夜豆浆"正是今早该显示的那份，
     早期版本只留"今天"，导致每天早上都把昨晚的缓存删掉、必须重新请求。 */
  const nb = beijingNow();
  const today = nb.toISOString().slice(0, 10);
  const yest = new Date(nb.getTime() - 86400e3).toISOString().slice(0, 10);
  const keys = await kvKeys();
  for (const k of keys) {
    if (!k.startsWith(CACHE_PREFIX) || k === LATEST_KEY) continue;
    const m = k.match(/\.(afternoon|night)\.(\d{4}-\d{2}-\d{2})$/);
    if (m && m[2] !== today && m[2] !== yest) await kvDel(k);
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
let currentEdition = 'afternoon';

function syncSeg(edition) {
  const seg = $('seg');
  if (!seg) return;
  Array.from(seg.querySelectorAll('button')).forEach((b) => {
    b.classList.toggle('on', b.getAttribute('data-ed') === edition);
  });
}

function escapeHTML(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function newsItemHTML(it) {
  const tag = it.isNew ? '<span class="badge-new">新</span>' : '';
  const src = it.source ? it.source + ' · ' : '';
  return '<div class="nitem" data-url="' + (it.url || '') + '">'
    + '<h3 class="ntitle">' + escapeHTML(it.title || '') + '</h3>'
    + '<p class="nsum">' + escapeHTML(it.summary || '') + '</p>'
    + '<div class="nmeta">' + tag + '<span>' + escapeHTML(src + (it.pubTime || '')) + '</span>'
    + '<span class="go">原文 ›</span></div></div>';
}

function renderNews(data, kind, edition) {
  const list = $('newsList');
  list.innerHTML = (data.items || []).map(newsItemHTML).join('') || '<div class="empty">本场暂无条目</div>';
  Array.from(list.querySelectorAll('.nitem')).forEach((el) => {
    el.addEventListener('click', () => {
      const url = el.getAttribute('data-url');
      const title = (el.querySelector('.ntitle') || {}).textContent || '新闻原文';
      if (url) go(url, title.slice(0, 20));
    });
  });
  renderNewsMeta(kind, data, edition);
}

/* 顶部一行：数据时间 / 陈旧提示（kind: fresh | cached | fallback | offline） */
function renderNewsMeta(kind, data, edition) {
  const el = $('newsMeta');
  if (!el) return;
  const time = (data.fetched_at || '').slice(11, 16);
  const day = (data.date || '').slice(5);
  const when = (data.editionName || '') + ' ' + day + ' ' + time;
  if (kind === 'fallback') {
    el.className = 'newsmeta warn';
    el.textContent = '本场（' + (EDITION_LABEL[edition] || '') + '）还没更新 · 显示 ' + when + ' · 下拉可刷新';
  } else if (kind === 'offline') {
    el.className = 'newsmeta warn';
    el.textContent = '显示缓存 ' + when + ' · 下拉可刷新';
  } else {
    el.className = 'newsmeta';
    el.textContent = '已更新 ' + day + ' ' + time + (kind === 'cached' ? '' : '');
  }
}

/* force=true 时跳过缓存强制请求（下拉刷新用） */
async function loadNews(edition, force = false) {
  currentEdition = edition;
  const date = slotDateFor(edition);          /* ← 关键：该场次最近一次已发生的日期，不是"今天" */
  const key = CACHE_PREFIX + edition + '.' + date;

  /* ① 非强制且命中该场次的缓存 → 直接用，零请求
       · 正常缓存（本场已生成）→ 一直有效
       · miss 缓存（当时本场还没生成）→ 只在 MISS_TTL 内有效，过期后重查一次 */
  if (!force) {
    const c = await kvGet(key);
    if (c && c.items && c.items.length) {
      const fresh = !c.__miss || (Date.now() - (c.__ts || 0)) < MISS_TTL;
      if (fresh) {
        renderNews(c, c.__miss ? 'fallback' : 'cached', edition);
        return;
      }
    }
  }

  /* ② 未命中：先用【已有的最近缓存】立即渲染（秒开、不转圈），再后台取新的 */
  let stale = await kvGet(key);
  if (!stale) stale = await kvGet(LATEST_KEY);
  const hasStale = !!(stale && stale.items && stale.items.length);
  if (hasStale) renderNews(stale, 'offline', edition);
  else $('newsList').innerHTML = '<div class="empty">加载中…</div>';

  /* ③ 取数：目标场次 → latest → 退回本地缓存 */
  let data = null, kind = 'fresh';
  try {
    data = await fetchJSON(SRC_NEWS + 'news/' + date + '-' + edition + '.json');
    await kvSet(key, data);
    await pruneNewsCache();
  } catch (e1) {
    try {
      const latest = await fetchJSON(SRC_NEWS + 'latest.json');
      await kvSet(LATEST_KEY, latest);
      /* 给【本场次】也留一份带 miss 标记的缓存：下次同一场次直接命中（10 分钟内不重查），
         过期后会自动重查——既有缓存感，又不会漏掉随后生成的新数据。 */
      await kvSet(key, { ...latest, __miss: true, __ts: Date.now() });
      data = latest;
      kind = 'fallback';
    } catch (e2) {
      if (hasStale) { data = stale; kind = 'offline'; }
    }
  }

  if (!data || !data.items || !data.items.length) {
    $('newsList').innerHTML = '<div class="empty">暂时取不到新闻，请稍后再试（下拉可重试）</div>';
    const el = $('newsMeta');
    if (el) { el.className = 'newsmeta warn'; el.textContent = '未能取到数据'; }
    return;
  }
  renderNews(data, kind, edition);
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
  const bg = (m.accent || '#2563eb') + '1a';
  return '<div class="tcell" data-url="' + m.url + '" data-name="' + escapeHTML(m.name) + '">'
    + '<div class="tico" style="background:' + bg + '">' + m.icon + '</div>'
    + '<div class="tname">' + escapeHTML(m.name) + '</div></div>';
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

/* ───────────── 资产：数据 → 归一化池 ───────────── */
function buildPools() {
  QUOTES = {};
  VALS = {};
  if (!MARKET) return;
  Object.entries(MARKET.indices || {}).forEach(([k, v]) => {
    QUOTES[k] = { name: k, chg: v.chg, ytd: v.ytd, kind: 'index' };
  });
  (MARKET.us_quotes || []).forEach((q) => {
    QUOTES[q.name] = { name: q.name, chg: q.chg, ytd: q.ytd, kind: 'us' };
  });
  Object.entries(MARKET.commodities || {}).forEach(([k, v]) => {
    QUOTES[k] = { name: k, chg: v.chg, ytd: v.ytd, kind: 'cmd' };
  });
  Object.entries(MARKET.valuation || {}).forEach(([k, v]) => {
    VALS[k] = { name: k, pe: v.pe, pe_pct: v.pe_pct, yield: v.yield };
  });
}

/* 涨跌着色改用 class（CSS 变量控制），这样深色模式自动跟随 */
const clsOf = (v) => (v === null || v === undefined) ? 'flat' : (v > 0 ? 'up' : (v < 0 ? 'down' : 'flat'));
const pct = (v, d = 2) => (v === null || v === undefined) ? '—' : (v > 0 ? '+' : '') + v.toFixed(d) + '%';

function renderQuoteBoard(elId, names) {
  const el = $(elId);
  if (!el) return;
  if (!names || !names.length) { el.innerHTML = '<div class="ph">未选标的（工具 → 资产板块设置）</div>'; return; }
  el.innerHTML = names.map((n) => {
    const q = QUOTES[n];
    if (!q) return '<div class="r"><span class="nm">' + escapeHTML(n) + '</span><span class="ch">—</span></div>';
    return '<div class="r"><span class="nm">' + escapeHTML(n) + '</span>'
      + '<span class="ch ' + clsOf(q.chg) + '">' + pct(q.chg) + '</span></div>';
  }).join('');
}

function renderValBoard(names) {
  const el = $('gridVal');
  if (!el) return;
  if (!names || !names.length) { el.innerHTML = '<div class="ph">未选标的（工具 → 资产板块设置）</div>'; return; }
  el.innerHTML = names.map((n) => {
    const v = VALS[n];
    if (!v || v.pe_pct === null || v.pe_pct === undefined) {
      return '<div class="v"><span class="nm">' + escapeHTML(n) + '</span>'
        + '<span class="bar"><i style="width:0"></i></span><span class="pv">—</span></div>';
    }
    const pv = Math.round(v.pe_pct * 100);
    const lv = pv >= 80 ? 'lv-high' : (pv >= 60 ? 'lv-mid' : 'lv-low');
    /* 股息率（yield 为小数，如 0.0433 → 4.33%） */
    const yld = (v.yield === null || v.yield === undefined) ? ''
      : '<span class="yld">股息 ' + (v.yield * 100).toFixed(2) + '%</span>';
    return '<div class="v"><span class="nm">' + escapeHTML(n) + '</span>'
      + '<span class="bar"><i class="' + lv + '" style="width:' + pv + '%"></i></span>'
      + '<span class="pv ' + lv + '">' + pv + '%</span>' + yld + '</div>';
  }).join('');
}

/* 海外投资：场内取溢价最小 / 场外取额度最高 */
function renderOverseas() {
  const etfEl = $('gridEtf'), odEl = $('gridOd');
  if (!etfEl || !odEl) return;
  const picks = OVERSEAS_POOL.filter((o) => (CFG.overseas || []).includes(o.key));
  if (!picks.length || !QDII) {
    const m = '<div class="ph">' + (QDII ? '未选品类' : '数据加载中…') + '</div>';
    etfEl.innerHTML = m; odEl.innerHTML = m;
    return;
  }
  const etf = QDII['场内ETF'] || {}, od = QDII['场外QDII'] || {};
  const etfRows = [], odRows = [];
  picks.forEach((o) => {
    const es = o.etf.map((c) => ({ c, v: (etf[c] || {})['溢价率'] }))
      .filter((x) => x.v !== null && x.v !== undefined).sort((a, b) => a.v - b.v);
    if (es.length) {
      etfRows.push('<div class="r"><span class="nm">' + o.key + '</span>'
        + '<span class="ch ' + clsOf(es[0].v) + '">' + pct(es[0].v) + '</span></div>'
        + '<div class="nmx">' + escapeHTML(FUND_NAMES[es[0].c] || es[0].c) + '</div>');
    }
    const os = o.od.map((c) => ({ c, v: (od[c] || {})['日累计限定金额'] }))
      .filter((x) => x.v !== null && x.v !== undefined).sort((a, b) => b.v - a.v);
    if (os.length) {
      odRows.push('<div class="r"><span class="nm">' + o.key + '</span>'
        + '<span class="ch" style="color:var(--blue)">' + Math.round(os[0].v) + ' 元/日</span></div>'
        + '<div class="nmx">' + escapeHTML(FUND_NAMES[os[0].c] || os[0].c) + '</div>');
    }
  });
  etfEl.innerHTML = etfRows.join('') || '<div class="ph">无数据</div>';
  odEl.innerHTML = odRows.join('') || '<div class="ph">无数据</div>';
}

/* 四格点击目标：点哪格进哪个模块 */
const BOARD_LINK = {
  market: ['https://market-live.hellohopo.dpdns.org/', '实时市场看板'],
  hold: ['https://market-live.hellohopo.dpdns.org/', '实时市场看板'],
  val: ['https://market-live.hellohopo.dpdns.org/', '实时市场看板 · 估值'],
  overseas: ['https://qdii-nav-tracker.hellohopo.dpdns.org/', 'QDII 净值跟踪'],
};

function bindBoardLinks() {
  Object.keys(BOARD_LINK).forEach((k) => {
    const el = document.querySelector('[data-board="' + k + '"]');
    if (!el || el.__bound) return;
    el.__bound = true;
    el.addEventListener('click', () => {
      const [url, name] = BOARD_LINK[k];
      go(url, name);
    });
  });
}

function renderAssetBoards() {
  buildPools();
  bindBoardLinks();
  renderQuoteBoard('gridMarket', CFG.market);
  renderQuoteBoard('gridHold', CFG.hold);
  renderValBoard(CFG.val);
  renderOverseas();
  /* 海外投资：绑定【整张卡片】（原来只绑标题行 → 点内容没反应） */
  const odCard = document.querySelector('[data-qdii-detail]');
  if (odCard && !odCard.__bound) {
    odCard.__bound = true;
    odCard.style.cursor = 'pointer';
    odCard.addEventListener('click', showQdiiDetail);
  }
  const st = $('assetStamp');
  if (st) {
    const parts = [];
    if (MARKET) parts.push('行情 ' + String(MARKET.generated_at).slice(5, 16));
    if (QDII) parts.push('QDII ' + String(QDII['日期']).replace(/^(\d{4})(\d{2})(\d{2})$/, '$1-$2-$3'));
    st.textContent = parts.length ? (parts.join(' · ') + ' · 仅供参考') : '';
  }
}

async function loadAssetData() {
  await Promise.all([
    fetchJSON(SRC_MARKET).then((d) => { MARKET = d; }).catch(() => {}),
    fetchJSON(SRC_QDII).then((d) => { QDII = d; }).catch(() => {}),
  ]);
  renderAssetBoards();
}

/* ───────────── QDII 明细（表格化）───────────── */
function qdiiRowsHTML(obj, valKey, cls, fmt, asc) {
  const arr = Object.entries(obj)
    .map(([c, v]) => ({ c, v: v[valKey] }))
    .filter((x) => x.v !== null && x.v !== undefined);
  if (!arr.length) return '<div class="det-empty">暂无数据</div>';
  arr.sort((a, b) => (asc ? a.v - b.v : b.v - a.v));   /* 溢价升序(越小越好) / 额度降序(越大越好) */
  return arr.map((x, i) => '<div class="det-tr' + (i === 0 ? ' best' : '') + '">'
    + '<span class="nm">' + escapeHTML(FUND_NAMES[x.c] || (x.c + '（未收录名称）')) + '</span>'
    + '<span class="vv ' + cls + '">' + fmt(x.v) + '</span></div>').join('');
}

function showQdiiDetail() {
  if (!QDII) { sheet('QDII 明细', '数据还没加载完，请稍后再试。'); return; }
  const etf = QDII['场内ETF'] || {};
  const z = QDII['场外QDII'] || {};
  const za = QDII['场外QDII主动'] || {};
  const dateStr = String(QDII['日期'] || '').replace(/^(\d{4})(\d{2})(\d{2})$/, '$1-$2-$3');

  $('qdiiTitle').textContent = 'QDII 明细';
  $('qdiiSub').textContent = '数据日期 ' + dateStr + '（上一交易日）· 溢价为场内净值溢价率，额度为场外日申购上限';
  const head = (t2) => '<div class="det-tr head"><span class="nm">基金</span><span class="vv">' + t2 + '</span></div>';
  $('qdiiBody').innerHTML =
    '<div class="det-sec">场内 ETF 溢价率 <span class="note">越低越值得买 · 首行为最优</span></div>'
      + '<div class="det-tbl">' + head('溢价率') + qdiiRowsHTML(etf, '溢价率', 'prem', (v) => '+' + v.toFixed(2) + '%', true) + '</div>'
    + '<div class="det-sec">场外 QDII 日限额 <span class="note">纳指100 / 标普500 系 · 越多越好买</span></div>'
      + '<div class="det-tbl">' + head('日限额') + qdiiRowsHTML(z, '日累计限定金额', 'quota', (v) => Math.round(v) + ' 元', false) + '</div>'
    + '<div class="det-sec">场外主动型 QDII 日限额</div>'
      + '<div class="det-tbl">' + head('日限额') + qdiiRowsHTML(za, '日累计限定金额', 'quota', (v) => Math.round(v) + ' 元', false) + '</div>';
  $('qdiiMask').classList.add('on');
}

/* ───────────── 资产板块设置 ───────────── */
async function loadCfg() {
  try {
    if (inApp) {
      const { value } = await Preferences.get({ key: CFG_KEY });
      if (value) { CFG = { ...DEFAULT_CFG, ...JSON.parse(value) }; return; }
    }
  } catch (e) { /* 落到 localStorage */ }
  try {
    const v = localStorage.getItem(CFG_KEY);
    if (v) CFG = { ...DEFAULT_CFG, ...JSON.parse(v) };
  } catch (e) { /* 用默认值 */ }
}

async function saveCfg() {
  const s = JSON.stringify(CFG);
  try { if (inApp) await Preferences.set({ key: CFG_KEY, value: s }); } catch (e) { /* 忽略 */ }
  try { localStorage.setItem(CFG_KEY, s); } catch (e) { /* 忽略 */ }
}

/* 可选池：把 market-live 里有的都放进来 */
const poolFor = (section) => (section === 'val' ? Object.keys(VALS) : Object.keys(QUOTES));

function renderCfgPanel() {
  const body = $('cfgBody');
  if (!body) return;
  const SECS = [
    { k: 'market', label: 'A股大盘' },
    { k: 'hold', label: '我的持仓' },
    { k: 'val', label: '估值水位' },
  ];
  let html = '';
  SECS.forEach((s) => {
    const pool = poolFor(s.k);
    const sel = CFG[s.k] || [];
    const lim = LIMITS[s.k];
    html += '<div class="cfgsec"><div class="cfgtitle">' + s.label
      + '<span class="cnt' + (sel.length >= lim ? ' full' : '') + '">已选 ' + sel.length + ' / 最多 ' + lim + '</span></div><div class="chips">';
    if (!pool.length) html += '<span class="ph">数据加载中…</span>';
    pool.forEach((n) => {
      html += '<span class="chip' + (sel.includes(n) ? ' on' : '') + '" data-sec="' + s.k + '" data-name="' + escapeHTML(n) + '">' + escapeHTML(n) + '</span>';
    });
    html += '</div></div>';
  });
  html += '<div class="cfgsec"><div class="cfgtitle">海外投资<span class="cnt">已选 '
    + (CFG.overseas || []).length + ' / 最多 ' + LIMITS.overseas + '</span></div><div class="chips">'
    + OVERSEAS_POOL.map((o) => '<span class="chip' + ((CFG.overseas || []).includes(o.key) ? ' on' : '')
      + '" data-sec="overseas" data-name="' + escapeHTML(o.key) + '">' + escapeHTML(o.key) + '</span>').join('')
    + '</div><div class="cfgnote" style="margin:7px 0 0">口径固定：场内取溢价最小、场外取额度最高（不需选择）。目前数据源只覆盖标普500 与纳指100。</div></div>';
  body.innerHTML = html;

  Array.from(body.querySelectorAll('.chip')).forEach((chip) => {
    chip.addEventListener('click', async () => {
      const sec = chip.getAttribute('data-sec');
      const name = chip.getAttribute('data-name');
      const sel = (CFG[sec] || []).slice();
      const i = sel.indexOf(name);
      if (i >= 0) sel.splice(i, 1);
      else {
        if (sel.length >= LIMITS[sec]) {
          chip.animate([{ transform: 'translateX(-3px)' }, { transform: 'translateX(3px)' }, { transform: 'translateX(0)' }], 180);
          return;
        }
        sel.push(name);
      }
      CFG[sec] = sel;
      await saveCfg();
      renderCfgPanel();
      renderAssetBoards();
    });
  });
}

function setupDataMaint() {
  $('rowDataMaint').addEventListener('click', () => dmOpen());
  /* QDII 明细弹层 */
  $('qdiiClose').addEventListener('click', () => $('qdiiMask').classList.remove('on'));
  $('qdiiMask').addEventListener('click', (e) => { if (e.target === $('qdiiMask')) $('qdiiMask').classList.remove('on'); });
  $('qdiiGo').addEventListener('click', () => {
    $('qdiiMask').classList.remove('on');
    go('https://qdii-nav-tracker.hellohopo.dpdns.org/', 'QDII 净值跟踪');
  });
  $('editCancel').addEventListener('click', closeCellEdit);
  $('editMask').addEventListener('click', (e) => { if (e.target === $('editMask')) closeCellEdit(); });
  $('editOk').addEventListener('click', () => {
    const raw = $('editInput').value;
    const t2 = $('editInput').type;
    let val = raw;
    if (t2 === 'number') val = raw === '' ? 0 : Number(raw);
    else if (raw === 'true') val = true;
    else if (raw === 'false') val = false;
    /* ⚠️ 必须先取出回调再关闭弹层 —— closeCellEdit 会把 EditCb 置 null，
       早期写成「先 close 再 if (EditCb)」导致回调永不执行（改值不生效）。 */
    const cb = EditCb;
    closeCellEdit();
    if (typeof cb === 'function') cb(val);
  });
  $('patClear').addEventListener('click', async () => {
    await savePat('');
    $('patMask').classList.remove('on');
    dmRenderList();
  });
  $('patSave').addEventListener('click', async () => {
    const v = $('patInput').value.trim();
    if (!v) { $('patInput').placeholder = '请粘贴 PAT'; return; }
    await savePat(v);
    $('patMask').classList.remove('on');
    dmRenderList();
  });
  $('patMask').addEventListener('click', (e) => { if (e.target === $('patMask')) $('patMask').classList.remove('on'); });

  /* Secret 首次粘贴 */
  $('pasteCancel').addEventListener('click', () => $('pasteMask').classList.remove('on'));
  $('pasteMask').addEventListener('click', (e) => { if (e.target === $('pasteMask')) $('pasteMask').classList.remove('on'); });
  $('pasteOk').addEventListener('click', async () => {
    const raw = $('pasteInput').value.trim();
    if (!raw) { $('pasteHint').textContent = '请先粘贴内容（JSON）。'; return; }
    let obj;
    try { obj = JSON.parse(raw); } catch (e) {
      $('pasteHint').innerHTML = 'JSON 解析失败：' + escapeHTML(String(e.message).slice(0, 80)) + '<br>请检查内容是否为合法 JSON。';
      return;
    }
    const s = DATA_SOURCES.find((x) => x.id === 'cmb_secret');
    await secretCacheSet(s.secret, obj);
    $('pasteMask').classList.remove('on');
    DM = { src: s, data: obj, sha: null, path: [], dirty: false, isSecret: true, showHidden: false };
    dmOpenSource('cmb_secret');
  });
}

function setupCfgPanel() {
  $('rowAssetCfg').addEventListener('click', async () => {
    if (!MARKET) await loadAssetData();
    renderCfgPanel();
    $('cfgMask').classList.add('on');
  });
  $('cfgClose').addEventListener('click', () => $('cfgMask').classList.remove('on'));
  $('cfgMask').addEventListener('click', (e) => { if (e.target === $('cfgMask')) $('cfgMask').classList.remove('on'); });
  $('cfgReset').addEventListener('click', async () => {
    CFG = JSON.parse(JSON.stringify(DEFAULT_CFG));
    await saveCfg();
    renderCfgPanel();
    renderAssetBoards();
  });
}

/* ───────────── 我的 ───────────── */
function setupMine() {
  $('verLabel').textContent = APP_VERSION + ' ›';

  $('rowSync').addEventListener('click', () => go(INV_URL, '个人资产管理'));

  /* 外观：打开可点选项弹层 */
  $('rowTheme').addEventListener('click', openThemeDialog);
  $('themeClose').addEventListener('click', () => $('themeMask').classList.remove('on'));
  $('themeMask').addEventListener('click', (e) => { if (e.target === $('themeMask')) $('themeMask').classList.remove('on'); });

  /* 诊断信息（增强）：一键复制 + 连通性自检 */
  $('rowDiag').addEventListener('click', async () => {
    const lines = [
      '—— 环境 ——',
      diagText(),
      'WebView：' + (navigator.userAgent || '').slice(0, 90),
      '模块数：' + MODULES.length + ' 个',
      '主题：' + THEME + '（生效：' + effectiveTheme() + '）',
      '缓存键：' + (await kvKeys()).filter((k) => k.startsWith(CACHE_PREFIX)).join(' / '),
      '',
      '—— 连通性自检（点此按钮前已跑完）——',
    ];
    sheet('诊断信息', lines.join('\n') + '\n正在自检…');
    const checks = [
      ['行情 market-live', SRC_MARKET, () => (MARKET ? '✓ ' + MARKET.generated_at : '✗ 未取到')],
      ['QDII portfolio', SRC_QDII, () => (QDII ? '✓ ' + QDII['日期'] : '✗ 未取到')],
      ['新闻 news-feed', SRC_NEWS + 'latest.json', () => null],
    ];
    for (const [name, url, localCheck] of checks) {
      let line;
      const local = localCheck();
      if (local) {
        line = '  ' + name + '：' + local;
      } else {
        try {
          await fetchJSON(url, 8000);
          line = '  ' + name + '：✓ 可达';
        } catch (e) {
          line = '  ' + name + '：✗ ' + (e && e.message ? e.message.slice(0, 40) : '取数失败');
        }
      }
      lines.push(line);
      $('sheetBody').textContent = lines.join('\n') + '\n自检中…';
    }
    lines.push('');
    lines.push('—— 四格配置 ——');
    lines.push('  全球指数：' + (CFG.market || []).join('、'));
    lines.push('  我的持仓：' + (CFG.hold || []).join('、'));
    lines.push('  估值水位：' + (CFG.val || []).join('、'));
    lines.push('  海外投资：' + (CFG.overseas || []).join('、'));
    $('sheetBody').textContent = lines.join('\n');
    $('sheetCopy').style.display = 'block';
    $('sheetCopy').__text = lines.join('\n');
  });

  /* 清空本地缓存 */
  $('rowClear').addEventListener('click', () => {
    sheet('清空本地缓存',
      '将清掉：\n· 新闻缓存（含今天/昨天的场次数据）\n· 数据维护的离线草稿\n\n'
      + '不会动：四格配置、外观设置、新闻已读记录（本项未启用）。\n\n'
      + '清完后下次打开会重新联网取一次。');
    $('sheetCopy').style.display = 'block';
    $('sheetCopy').textContent = '确认清空';
    $('sheetCopy').__text = '__CLEAR__';
  });

  $('rowAbout').addEventListener('click', () => sheet('关于老张工具箱',
    '版本：' + APP_VERSION + '\n\n'
    + '· 新闻：下午茶 / 夜豆浆（谷歌 + 联合早报，AI 摘要）\n'
    + '· 资产：入口卡 + 四个数据格（标的可自定义）\n'
    + '· 工具：' + MODULES.length + ' 个自建站点 + 资产板块设置\n\n'
    + '技术栈：Capacitor 7 + Vite\n'
    + '数据：market-live（行情/估值）、portfolio（QDII 溢价与额度）、news-feed（新闻）\n'
    + '取数均经 proxy.hellohopo.dpdns.org 代理\n\n'
    + '仅供个人研究参考，不构成投资建议。'));

  /* 弹层按钮 */
  $('sheetClose').addEventListener('click', () => {
    $('mask').classList.remove('on');
    $('sheetCopy').style.display = 'none';
    $('sheetCopy').textContent = '复制';
    $('sheetCopy').__text = '';
  });
  $('sheetCopy').addEventListener('click', async () => {
    const txt = $('sheetCopy').__text || $('sheetBody').textContent;
    if (txt === '__CLEAR__') {
      await kvKeys().then(async (keys) => {
        for (const k of keys) if (k.startsWith(CACHE_PREFIX)) await kvDel(k);
      });
      $('sheetBody').textContent = '已清空新闻缓存。下次打开会重新联网取一次。';
      $('sheetCopy').style.display = 'none';
      $('sheetCopy').__text = '';
      renderNewsMeta('offline', { fetched_at: '', date: '', editionName: '（已清空）' }, currentEdition);
      return;
    }
    try {
      await navigator.clipboard.writeText(txt);
      $('sheetCopy').textContent = '已复制 ✓';
      setTimeout(() => { $('sheetCopy').textContent = '复制'; }, 1500);
    } catch (e) {
      $('sheetCopy').textContent = '复制失败（可手动长按选择）';
    }
  });
  $('mask').addEventListener('click', (e) => { if (e.target === $('mask')) { $('mask').classList.remove('on'); $('sheetCopy').style.display = 'none'; } });
}

/* ───────────── 下拉刷新（新闻 Tab） ───────────── */
function activeTab() {
  const on = document.querySelector('.pane.on');
  return on ? on.id.replace('pane-', '') : '';
}

function setupPullRefresh() {
  const box = $('content');
  const hint = $('pullHint');
  if (!box || !hint) return;
  let startY = 0, pulling = false, refreshing = false;

  box.addEventListener('touchstart', (e) => {
    const tb = activeTab();
    if ((tb !== 'news' && tb !== 'asset') || box.scrollTop > 0 || refreshing) return;
    startY = e.touches[0].clientY;
    pulling = true;
  }, { passive: true });

  box.addEventListener('touchmove', (e) => {
    if (!pulling) return;
    if (box.scrollTop > 0) { pulling = false; hint.style.height = '0px'; return; }
    const dy = e.touches[0].clientY - startY;
    if (dy <= 0) return;
    const d = Math.min(dy * 0.6, 78);
    hint.style.height = d + 'px';
    hint.textContent = d > 52 ? '松开刷新' : '下拉刷新';
  }, { passive: true });

  box.addEventListener('touchend', async () => {
    if (!pulling) return;
    pulling = false;
    const h = parseInt(hint.style.height || '0', 10);
    if (h > 52) {
      refreshing = true;
      hint.style.height = '34px';
      hint.textContent = '正在刷新…';
      try {
        /* 新闻页 → 强制重取新闻；资产页 → 重取行情与 QDII */
        if (activeTab() === 'news') await loadNews(currentEdition, true);
        else await loadAssetData();
      } finally {
        setTimeout(() => {
          hint.style.height = '0px';
          hint.textContent = '下拉刷新';
          refreshing = false;
        }, 500);
      }
    } else {
      hint.style.height = '0px';
    }
  });
}

/* ═════════════════ 数据维护（原生）═════════════════
   设计要点：
   · 数据源清单【配置化】—— 以后新增数据源只加一行，不写代码
   · 一个【通用 JSON 编辑器】覆盖所有 JSON 文件：
       数组 → 每项一行、字段自动成为列（列名取并集）
       对象 → 键值表；值若是对象/数组 → 点进去（路径栈导航）
       叶子值（字符串/数字/布尔/null）→ 点格子弹层编辑
   · 保存走 Contents API（带 sha）；【保存前重新 READ）校验 sha】
     —— 若仓库已被 CI 改过，会提示你，不会盲目覆盖
   · Secret 类数据源（需 libsodium 加密）不在原生处理，给"网页版"入口
   ⚠️ 不用 prompt()：Capacitor WebView 默认不实现 onJsPrompt，弹不出来 —— 一律用自定义弹层 */
const PAT_KEY = 'toolbox.ghPat';
const GH_BRANCH = 'main';
const DATA_SOURCES = [
  { id: 'qdii_funds', icon: '🪙', title: 'qdii 基金清单', repo: 'homjanon/qdii-nav-tracker',
    path: 'config/funds.json', desc: '场外 QDII 基金清单（新增/移除基金在此维护）',
    autoExpand: ['funds'] },
  { id: 'db_state', icon: '🎬', title: 'douban 状态', repo: 'homjanon/douban-tracker',
    path: 'state.json', desc: '昵称映射 + 持仓（人工确认制）',
    hide: ['_seen_ids', 'updated_at', 'last_cursor', 'total_archived'] },
  { id: 'xq_mentions', icon: '📈', title: 'xueqiu 标的提及', repo: 'homjanon/xueqiu-tracker',
    path: 'data/mentions.json', desc: '大V标的提及追踪表（增量合并，手改不被 CI 冲掉）',
    autoExpand: ['users'], hide: ['schema_version', 'updated_at'] },
  { id: 'cmb_secret', icon: '🏦', title: 'cmb 持仓成本', repo: 'homjanon/cmb-tracker',
    kind: 'secret', secret: 'HOLDINGS_JSON',
    desc: 'GitHub Secret · 加密写入，值只存本机（GitHub 不可回读）' },
];
const SECRET_CACHE_PREFIX = 'toolbox.secret.';

let PAT = '';
let DM = null;   /* { src, data, sha, path:[], dirty } */

/* ── GitHub API 封装 ── */
async function ghApi(path, opts) {
  if (!PAT) throw new Error('未配置 PAT');
  const o = opts || {};
  const res = await fetch('https://api.github.com' + path, {
    method: o.method || 'GET',
    headers: Object.assign({
      'Accept': 'application/vnd.github+json',
      'Authorization': 'Bearer ' + PAT,
      'X-GitHub-Api-Version': '2022-11-28',
    }, o.headers || {}),
    body: o.body,
  });
  if (res.status === 204) return null;
  let data = null;
  try { data = await res.json(); } catch (e) { /* 可能是空体 */ }
  if (!res.ok) {
    const msg = (data && data.message) ? data.message : ('HTTP ' + res.status);
    if (res.status === 401) throw new Error('PAT 无效或已过期（401）');
    if (res.status === 403) throw new Error('权限不足或触发限流（403）：' + msg);
    if (res.status === 404) throw new Error('找不到仓库/文件（404）：' + msg);
    if (res.status === 409) throw new Error('版本冲突（409）：仓库刚被改过，请重新加载');
    throw new Error(msg + '（' + res.status + '）');
  }
  return data;
}

/* UTF-8 安全的 base64 编解码（中文内容必须这样处理） */
function b64ToText(b64) {
  const bin = atob(String(b64).replace(/\s/g, ''));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder('utf-8').decode(bytes);
}
function textToB64(text) {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

async function ghRead(repo, path) {
  const j = await ghApi('/repos/' + repo + '/contents/' + path + '?ref=' + GH_BRANCH);
  return { text: b64ToText(j.content), sha: j.sha };
}
async function ghWrite(repo, path, text, sha, message) {
  return ghApi('/repos/' + repo + '/contents/' + path, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: message, content: textToB64(text), sha: sha, branch: GH_BRANCH }),
  });
}

/* ── Secret：加密写入（libsodium sealed box）──
   GitHub Secret 一经写入不可回读，所以值只能缓存本机；
   写入流程：取仓库公钥 → crypto_box_seal 加密 → PUT /actions/secrets/{name} */
async function ghWriteSecret(repo, name, value) {
  if (!window.sodium) throw new Error('加密库未加载（libsodium）');
  const pk = await ghApi('/repos/' + repo + '/actions/secrets/public-key');
  await sodium.ready;
  const pub = sodium.from_base64(pk.key, sodium.base64_variants.ORIGINAL);
  const sealed = sodium.crypto_box_seal(sodium.from_string(value), pub);
  const enc = sodium.to_base64(sealed, sodium.base64_variants.ORIGINAL);
  return ghApi('/repos/' + repo + '/actions/secrets/' + name, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ encrypted_value: enc, key_id: pk.key_id }),
  });
}

async function secretCacheGet(name) { return kvGet(SECRET_CACHE_PREFIX + name); }
async function secretCacheSet(name, obj) { return kvSet(SECRET_CACHE_PREFIX + name, obj); }

/* ── PAT ── */
async function loadPat() {
  try {
    if (inApp) { const { value } = await Preferences.get({ key: PAT_KEY }); if (value) PAT = value; }
  } catch (e) { /* 忽略 */ }
  if (!PAT) { try { PAT = localStorage.getItem(PAT_KEY) || ''; } catch (e) { /* 忽略 */ } }
}
async function savePat(v) {
  PAT = v || '';
  try { if (inApp) await Preferences.set({ key: PAT_KEY, value: PAT }); } catch (e) { /* 忽略 */ }
  try { localStorage.setItem(PAT_KEY, PAT); } catch (e) { /* 忽略 */ }
}

/* ── 视图：打开 / 关闭 ── */
function dmOpen() {
  $('dm').classList.add('on');
  dmRenderList();
  $('dmBack').onclick = () => {
    if (DM) { DM = null; dmRenderList(); }
    else dmClose();
  };
  $('dmReload').onclick = () => {
    if (DM) dmOpenSource(DM.src.id, true);
    else dmRenderList();
  };
}
function dmClose() { $('dm').classList.remove('on'); }

function dmSetHead(title, sub) {
  $('dmTitle').textContent = title;
  $('dmSub').textContent = sub || '';
}
function dmTip(msg, isWarn) {
  const el = $('dmTip');
  if (!msg) { el.style.display = 'none'; return; }
  el.style.display = 'block';
  el.className = 'dm-tip' + (isWarn === false ? '' : '');
  el.style.background = isWarn === false ? 'var(--blue-l)' : '';
  el.style.borderColor = isWarn === false ? 'var(--blue-l)' : '';
  el.style.color = isWarn === false ? 'var(--blue)' : '';
  el.textContent = msg;
}

/* ── 列表页 ── */
function dmRenderList() {
  dmSetHead('数据维护', PAT ? ('PAT 已配置 · ' + DATA_SOURCES.length + ' 个数据源') : '未配置 PAT');
  $('dmFoot').classList.remove('on');
  if (!PAT) {
    dmTip('首次使用需要填一个 GitHub PAT（有目标仓库 Contents 读写权限即可）。只存在本机。');
  } else {
    dmTip('');
  }
  let html = '';
  if (!PAT) html += '<div class="addrow" id="dmPat">配置 PAT</div><div style="height:10px"></div>';
  DATA_SOURCES.forEach((s) => {
    const isSecret = s.kind === 'secret';
    html += '<div class="srcrow' + (isSecret ? ' locked' : '') + '" data-src="' + s.id + '">'
      + '<span class="si">' + s.icon + '</span>'
      + '<div class="stx"><div class="s1">' + escapeHTML(s.title) + '</div>'
      + '<div class="s2">' + escapeHTML(s.repo + (s.path ? ' · ' + s.path : ' · Secret（加密写入）')) + '</div></div>'
      + '<span class="ss">›</span></div>';
  });
  $('dmBody').innerHTML = html;

  if ($('dmPat')) $('dmPat').onclick = openPatDialog;
  Array.from($('dmBody').querySelectorAll('.srcrow')).forEach((el) => {
    el.onclick = () => dmOpenSource(el.getAttribute('data-src'));
  });
}

/* ── 读取并进入编辑器 ── */
async function dmOpenSource(id, forceReload) {
  const s = DATA_SOURCES.find((x) => x.id === id);
  if (!s) return;
  if (!PAT) { openPatDialog(); return; }

  /* Secret 类：值只在本机缓存里（GitHub 不可回读） */
  if (s.kind === 'secret') {
    dmSetHead(s.title, s.repo + ' · Secret ' + s.secret);
    dmTip('');
    const cached = await secretCacheGet(s.secret);
    if (cached && cached !== undefined) {
      DM = { src: s, data: cached, sha: null, path: [], dirty: false, isSecret: true, showHidden: false };
      dmRenderEditor();
      return;
    }
    /* 首次：引导粘贴当前值 */
    $('dmBody').innerHTML = '<div class="dmsec">这个 Secret 还没有本机副本。</div>'
      + '<div class="addrow" id="dmPaste">粘贴当前值（首次必做）</div>'
      + '<div class="dmsec" style="line-height:1.7">说明：GitHub Secret 写入后<b>不可回读</b>（这是 GitHub 的设计，任何人都读不出来）。'
      + '所以需要你把当前值粘贴一次，之后 App 会记住它，你就能随时编辑并重新写入了。</div>';
    $('dmFoot').classList.remove('on');
    if ($('dmPaste')) $('dmPaste').onclick = () => openPasteDialog(s);
    return;
  }
  if (!forceReload && DM && DM.src.id === id) { dmRenderEditor(); return; }
  dmSetHead(s.title, s.repo + ' · ' + s.path);
  dmTip('读取中…', false);
  $('dmBody').innerHTML = '<div class="dmsec">正在从 GitHub 读取…</div>';
  try {
    const { text, sha } = await ghRead(s.repo, s.path);
    let data;
    try { data = JSON.parse(text); } catch (e) {
      dmTip('这个文件不是合法 JSON，无法用表格编辑：' + String(e.message).slice(0, 60));
      $('dmBody').innerHTML = '<div class="dmsec">解析失败，请在网页版处理。</div>';
      return;
    }
    /* 若根对象只有"一个键、值又是对象/数组"，自动展开它 —— 省掉一次无意义点击
       （如 qdii 的 {funds:[...]}、xueqiu 的 {users:{...}}） */
    const path0 = [];
    let probe = data;
    while (probe && typeof probe === 'object' && !Array.isArray(probe)
           && s.autoExpand && s.autoExpand.indexOf(path0.length === 0 ? s.autoExpand[0] : '') >= 0) {
      const keys = Object.keys(probe);
      if (keys.length !== 1) break;
      const only = keys[0];
      const v = probe[only];
      if (!v || typeof v !== 'object') break;
      /* autoExpand[0] 是白名单键名：只在键名匹配时展开一层 */
      if (path0.length === 0 && s.autoExpand.indexOf(only) < 0) break;
      path0.push(only);
      probe = v;
      break;   /* 只自动展开一层，避免误入深处 */
    }
    DM = { src: s, data: data, sha: sha, path: path0, dirty: false, raw: text, showHidden: false };
    dmTip('');
    dmRenderEditor();
  } catch (e) {
    /* 读取/渲染失败：保留一个可读的错误提示，不静默清空 */
    const msg = String(e && e.message ? e.message : e);
    dmTip('读取失败：' + msg.slice(0, 110));
    $('dmBody').innerHTML = '<div class="dmsec">出错了（已显示在上方提示里）。可点右上角 ↻ 重试；'
      + '若反复失败，请到网页版处理。</div><pre style="margin:0 13px;font-size:11px;color:var(--ink3);white-space:pre-wrap">'
      + escapeHTML(msg).slice(0, 300) + '</pre>';
    $('dmFoot').classList.remove('on');
  }
}

/* ── 编辑器渲染 ── */
function dmNode() { return DM ? DM.path.reduce((o, k) => (o == null ? o : o[k]), DM.data) : null; }
function dmIsLeaf(v) { return v === null || typeof v !== 'object'; }
function dmShow(v) {
  if (v === null) return '（空）';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'string') return v === '' ? '（空字符串）' : v;
  return '';
}

function dmRenderEditor() {
  const s = DM.src;
  const node = dmNode();
  const loc = DM.isSecret
    ? ('Secret ' + s.secret)
    : (DM.path.length ? DM.path.join(' › ') : s.path);
  dmSetHead(s.title, s.repo + ' · ' + loc + (DM.dirty ? ' · 未保存' : ''));
  dmTip('');
  const body = $('dmBody');
  let html = '';

  if (Array.isArray(node)) {
    /* 表格：列 = 各元素键的并集 */
    const cols = [];
    node.forEach((it) => {
      if (it && typeof it === 'object' && !Array.isArray(it)) {
        Object.keys(it).forEach((k) => { if (cols.indexOf(k) < 0) cols.push(k); });
      }
    });
    const objRows = node.filter((it) => it && typeof it === 'object' && !Array.isArray(it)).length;
    if (!cols.length) {
      /* 纯值数组（如 ["a","b"]）→ 单列表格 */
      html += '<div class="dmsec">' + node.length + ' 项（值数组）</div><div class="tblwrap">';
      node.forEach((v, i) => {
        html += '<div class="tblrow"><span class="cell" data-idx="' + i + '" data-leaf="1">'
          + escapeHTML(dmShow(v)) + '</span><span class="del" data-del="' + i + '">✕</span></div>';
      });
      html += '</div>';
    } else {
      html += '<div class="dmsec">' + node.length + ' 行 · 点格子改值，点 ✕ 删行</div>';
      html += '<div class="tblwrap"><div class="tblhead">'
        + cols.map((c) => '<span class="cell">' + escapeHTML(c) + '</span>').join('')
        + '<span class="del"></span></div>';
      node.forEach((row, i) => {
        const isObj = row && typeof row === 'object' && !Array.isArray(row);
        html += '<div class="tblrow">'
          + cols.map((c) => {
            const v = isObj ? row[c] : undefined;
            const cls = (v === undefined || v === null) ? ' vnull' : (typeof v === 'number' ? ' vnum' : '');
            return '<span class="cell' + cls + '" data-idx="' + i + '" data-key="' + escapeHTML(c) + '">'
              + escapeHTML(v === undefined ? '—' : dmShow(v)) + '</span>';
          }).join('')
          + '<span class="del" data-del="' + i + '">✕</span></div>';
      });
      html += '</div>';
    }
    html += '<div class="addrow" id="dmAdd">＋ 新增一行</div>';
  } else if (node && typeof node === 'object') {
    /* 键值表；嵌套值可点进去。内部字段（CI 自己维护的）默认收起，避免误改 */
    const hide = (DM.path.length === 0 && s.hide) ? s.hide : [];
    const allKeys = Object.keys(node);
    const shownKeys = DM.showHidden ? allKeys : allKeys.filter((k) => hide.indexOf(k) < 0);
    const hiddenCount = allKeys.length - shownKeys.length;
    const keys = shownKeys;
    html += '<div class="dmsec">' + keys.length + ' 个字段 · 点行编辑，嵌套结构可进入'
      + (hide.length ? '（内部字段已收起）' : '') + '</div><div class="tblwrap">';
    keys.forEach((k) => {
      const v = node[k];
      const nested = (v && typeof v === 'object');
      const extra = Array.isArray(v) ? ('数组 ' + v.length + ' 项') : (nested ? ('对象 ' + Object.keys(v).length + ' 键') : '');
      html += '<div class="kvrow" data-key="' + escapeHTML(k) + '" data-nested="' + (nested ? '1' : '0') + '">'
        + '<span class="k">' + escapeHTML(k) + '</span>'
        + '<span class="v' + (nested ? ' nested' : (v === null ? ' vnull' : '')) + '">'
        + escapeHTML(nested ? (extra + ' ›') : dmShow(v)) + '</span></div>';
    });
    html += '</div>';
    if (hiddenCount > 0 || (DM.showHidden && hide.length)) {
      html += '<div class="addrow" id="dmToggleHidden">'
        + (DM.showHidden ? '收起内部字段（' + hide.length + ' 个）' : '显示内部字段（' + hiddenCount + ' 个，一般不用改）')
        + '</div>';
    }
  } else {
    html += '<div class="dmsec">当前节点是单个值，请返回上一层通过格子编辑。</div>';
  }

  /* 路径面包屑（可点返回） */
  if (DM.path.length) {
    html = '<div class="dmsec" id="dmUp" style="color:var(--blue);font-weight:600">‹ 返回上一层（' + escapeHTML(DM.path.join(' › ')) + '）</div>' + html;
  }
  body.innerHTML = html;
  dmBindEditor();
  $('dmFoot').classList.add('on');
  const btn = $('dmSaveBtn');
  btn.textContent = DM.dirty
    ? (DM.isSecret ? '加密写入 Secret（有未保存改动）' : '保存到仓库（有未保存改动）')
    : (DM.isSecret ? '加密写入 Secret' : '保存到仓库');
  btn.disabled = !DM.dirty;
  btn.onclick = dmSave;
}

function dmBindEditor() {
  const body = $('dmBody');
  if ($('dmUp')) $('dmUp').onclick = () => { DM.path.pop(); dmRenderEditor(); };
  if ($('dmAdd')) $('dmAdd').onclick = dmAddRow;
  if ($('dmToggleHidden')) $('dmToggleHidden').onclick = () => { DM.showHidden = !DM.showHidden; dmRenderEditor(); };
  Array.from(body.querySelectorAll('.cell')).forEach((el) => {
    const idx = el.getAttribute('data-idx');
    if (idx === null) return;
    const key = el.getAttribute('data-key');
    el.onclick = () => {
      const arr = dmNode();
      const cur = key === null ? arr[Number(idx)] : (arr[Number(idx)] || {})[key];
      if (cur !== null && typeof cur === 'object') {
        /* 数组里的嵌套字段 → 进入该节点（仅对象元素支持） */
        dmTip('该字段是嵌套结构，暂不支持在此直接编辑（可在网页版处理）。');
        return;
      }
      openCellEdit(key === null ? ('第 ' + (Number(idx) + 1) + ' 项') : key, cur, (val) => {
        if (key === null) arr[Number(idx)] = val;
        else {
          if (!arr[Number(idx)] || typeof arr[Number(idx)] !== 'object') arr[Number(idx)] = {};
          arr[Number(idx)][key] = val;
        }
        DM.dirty = true;
        dmRenderEditor();
      });
    };
  });
  Array.from(body.querySelectorAll('.del')).forEach((el) => {
    const i = el.getAttribute('data-del');
    if (i === null) return;
    el.onclick = (e) => {
      e.stopPropagation();
      const arr = dmNode();
      arr.splice(Number(i), 1);
      DM.dirty = true;
      dmRenderEditor();
    };
  });
  Array.from(body.querySelectorAll('.kvrow')).forEach((el) => {
    const k = el.getAttribute('data-key');
    const nested = el.getAttribute('data-nested') === '1';
    el.onclick = () => {
      if (nested) { DM.path.push(k); dmRenderEditor(); return; }
      openCellEdit(k, dmNode()[k], (val) => { dmNode()[k] = val; DM.dirty = true; dmRenderEditor(); });
    };
  });
}

function dmAddRow() {
  const node = dmNode();
  if (!Array.isArray(node)) return;
  /* 以最后一行的字段做模板（空值），便于快速填 */
  const tpl = {};
  for (let i = node.length - 1; i >= 0; i--) {
    if (node[i] && typeof node[i] === 'object' && !Array.isArray(node[i])) {
      Object.keys(node[i]).forEach((k) => { tpl[k] = (typeof node[i][k] === 'number') ? 0 : ''; });
      break;
    }
  }
  node.push(Object.keys(tpl).length ? tpl : '');
  DM.dirty = true;
  dmRenderEditor();
}

/* ── 保存（含 sha 校验）── */
async function dmSave() {
  if (!DM) return;
  const btn = $('dmSaveBtn');
  btn.disabled = true;
  btn.textContent = '保存中…';
  const s = DM.src;
  try {
    /* ── Secret 类：加密写入（GitHub Secret 不可回读，故无 sha 校验）── */
    if (DM.isSecret) {
      await ghWriteSecret(s.repo, s.secret, JSON.stringify(DM.data));
      await secretCacheSet(s.secret, DM.data);
      DM.dirty = false;
      dmTip('✓ 已加密写入 GitHub Secret ' + s.secret + '（值只存本机，GitHub 端不可回读）', false);
      dmRenderEditor();
      return;
    }
    /* ── 普通文件：保存前重新读一次，若远端 sha 变了（多半是 CI 改的）就不盲目覆盖 ── */
    const fresh = await ghRead(s.repo, s.path);
    if (fresh.sha !== DM.sha) {
      DM.sha = fresh.sha;
      DM.raw = fresh.text;
      dmTip('⚠️ 仓库里这个文件刚被改动过（可能是 CI 自动更新）。你手上这份是基于旧版本编辑的，'
        + '继续保存会覆盖掉那次改动。若要保留对方改动，请点右上角 ↻ 重新加载后再改。');
      btn.disabled = false;
      btn.textContent = '仍要覆盖保存';
      btn.onclick = dmSaveForce;
      return;
    }
    await ghWrite(s.repo, s.path, JSON.stringify(DM.data, null, 2) + '\n', DM.sha,
      'chore(data): 维护 ' + s.path + '（App 数据维护）');
    await dmAfterSave();
  } catch (e) {
    dmTip('保存失败：' + String(e.message || e).slice(0, 120));
    btn.disabled = false;
    btn.textContent = '重试保存';
  }
}

async function dmSaveForce() {
  const btn = $('dmSaveBtn');
  btn.disabled = true;
  btn.textContent = '覆盖保存中…';
  const s = DM.src;
  try {
    await ghWrite(s.repo, s.path, JSON.stringify(DM.data, null, 2) + '\n', DM.sha,
      'chore(data): 维护 ' + s.path + '（App 数据维护·覆盖）');
    await dmAfterSave();
  } catch (e) {
    dmTip('覆盖保存失败：' + String(e.message || e).slice(0, 120));
    btn.disabled = false;
    btn.textContent = '重试保存';
  }
}

async function dmAfterSave() {
  /* 保存成功后重新读回 sha（下次保存要用新的） */
  try {
    const fresh = await ghRead(DM.src.repo, DM.src.path);
    DM.sha = fresh.sha;
  } catch (e) { /* 忽略 */ }
  DM.dirty = false;
  dmTip('✓ 已保存到 ' + DM.src.repo + '（' + DM.src.path + '）', false);
  dmRenderEditor();
}

/* ── 单元格 / 键值编辑弹层 ── */
let EditCb = null;
function openCellEdit(label, cur, cb) {
  EditCb = cb;
  $('editTitle').textContent = '编辑：' + label;
  const isNum = typeof cur === 'number';
  const isBool = typeof cur === 'boolean';
  $('editHint').innerHTML = isBool
    ? '布尔值：填 <b>true</b> 或 <b>false</b>'
    : (isNum ? '数字（可含小数）' : '直接输入文本；留空表示空字符串');
  const inp = $('editInput');
  inp.type = isNum ? 'number' : 'text';
  inp.value = cur === null || cur === undefined ? '' : String(cur);
  $('editMask').classList.add('on');
  setTimeout(() => { try { inp.focus(); } catch (e) { /* 忽略 */ } }, 120);
}
function closeCellEdit() { $('editMask').classList.remove('on'); EditCb = null; }

function openPasteDialog(s) {
  $('pasteHint').innerHTML = 'GitHub Secret 写入后<b>不可回读</b>，所以首次使用要粘贴一次当前值。'
    + '粘贴后只存在本机，之后可随时编辑并重新写入。<br>内容是 JSON（数组或对象）。';
  $('pasteInput').value = '';
  $('pasteMask').classList.add('on');
  setTimeout(() => { try { $('pasteInput').focus(); } catch (e) { /* 忽略 */ } }, 120);
}

function openPatDialog() {
  $('patInput').value = PAT || '';
  $('patMask').classList.add('on');
  setTimeout(() => { try { $('patInput').focus(); } catch (e) { /* 忽略 */ } }, 120);
}

/* ───────────── 原生增强 ───────────── */

async function setupNative() {
  if (!inApp) return;
  try { await StatusBar.setStyle({ style: Style.Light }); } catch (e) { /* 忽略 */ }
  try { await StatusBar.setBackgroundColor({ color: '#ffffff' }); } catch (e) { /* 忽略 */ }
  try {
    await App.addListener('appStateChange', ({ isActive }) => {
      if (!isActive) return;
      /* 新闻：非强制刷新 —— 命中缓存则零请求，只有"这一场还没取过"才会发请求 */
      const ed = defaultEdition();
      syncSeg(ed);
      loadNews(ed);
      /* 资产行情：需要实时，仍每次刷新 */
      loadAssetData();
    });
  } catch (e) { /* 忽略 */ }
}

/* ───────────── 启动 ───────────── */
async function boot() {
  setupTabs();
  setupSeg();
  setupMine();
  await loadTheme();          // 主题（跟随系统/浅色/深色）
  await loadPat();            // GitHub PAT（数据维护用）
  await loadCfg();            // 先读配置，再按配置渲染
  setupCfgPanel();
  setupDataMaint();
  renderTools();
  setupPullRefresh();
  const ed = defaultEdition();
  syncSeg(ed);
  loadNews(ed);        // 非强制：命中今天这一场的缓存则零请求，秒开
  loadAssetData();
  $('cardInv').addEventListener('click', () => go(INV_URL, '个人资产管理'));
  setupNative();
  if (inApp && !window.AndroidToolbox && typeof ModuleLauncher.open !== 'function') {
    tip('⚠️ 未检测到原生通道，模块将以网页方式打开（无返回/首页按钮）。可在「我的 → 诊断信息」查看详情。');
  }
}

boot();
