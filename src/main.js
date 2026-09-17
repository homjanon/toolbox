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

const APP_VERSION = 'v0.9';
const PROXY = 'https://proxy.hellohopo.dpdns.org/?url=';
const SRC_NEWS = 'https://raw.githubusercontent.com/homjanon/news-feed/main/docs/';
const SRC_MARKET = 'https://market-live.hellohopo.dpdns.org/api/data';
const SRC_QDII = 'https://raw.githubusercontent.com/homjanon/portfolio/main/qdii_prev.json';
const INV_URL = 'https://inv.hellohopo.dpdns.org/';
const FINANCE_IDS = ['portfolio', 'market-live', 'xiaoxu-fear', 'cmb-tracker', 'douban-tracker', 'qdii-nav-tracker'];

const inApp = Capacitor.isNativePlatform();
const ModuleLauncher = registerPlugin('ModuleLauncher');
const $ = (id) => document.getElementById(id);

/* ───────────── 四格配置 ───────────── */
const CFG_KEY = 'toolbox.assetBoards.v1';
const LIMITS = { market: 3, hold: 6, val: 4, overseas: 3 };
const DEFAULT_CFG = {
  market: ['上证指数', '沪深300', '创业板指'],
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
  '018044': '天弘纳指100C', '019441': '万家纳指100A',
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
async function pruneNewsCache(today) {
  const keys = await kvKeys();
  for (const k of keys) {
    if (!k.startsWith(CACHE_PREFIX) || k === LATEST_KEY) continue;
    const m = k.match(/\.(afternoon|night)\.(\d{4}-\d{2}-\d{2})$/);
    if (m && m[2] !== today) await kvDel(k);
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

/* 最近一场：15:00–22:29 看「下午茶」，其余时间看「夜豆浆」（与抓取时刻一致） */
function defaultEdition() {
  const nb = beijingNow(), h = nb.getUTCHours(), mi = nb.getUTCMinutes();
  return (h >= 15 && (h < 22 || (h === 22 && mi < 30))) ? 'afternoon' : 'night';
}

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
    el.textContent = '网络异常 · 显示缓存（' + when + '）· 下拉可刷新';
  } else {
    el.className = 'newsmeta';
    el.textContent = '已更新 ' + day + ' ' + time + (kind === 'cached' ? '' : '');
  }
}

/* force=true 时跳过缓存强制请求（下拉刷新用） */
async function loadNews(edition, force = false) {
  currentEdition = edition;
  const today = beijingToday();
  const key = CACHE_PREFIX + edition + '.' + today;

  /* ① 非强制且命中今天这一场的缓存 → 直接用，零请求 */
  if (!force) {
    const c = await kvGet(key);
    if (c && c.date === today && c.edition === edition) {
      renderNews(c, 'cached', edition);
      return;
    }
  }

  const list = $('newsList');
  list.innerHTML = '<div class="empty">加载中…</div>';

  let data = null, kind = 'fresh';
  try {
    data = await fetchJSON(SRC_NEWS + 'news/' + today + '-' + edition + '.json');
    await kvSet(key, data);
    await pruneNewsCache(today);
  } catch (e1) {
    /* 本场未生成 or 网络失败 → 试最近一份 */
    try {
      const latest = await fetchJSON(SRC_NEWS + 'latest.json');
      await kvSet(LATEST_KEY, latest);
      data = latest;
      kind = 'fallback';
    } catch (e2) {
      /* 网络彻底不通 → 用本地缓存兜底 */
      const c = (await kvGet(key)) || (await kvGet(LATEST_KEY));
      if (c) { data = c; kind = 'offline'; }
    }
  }

  if (!data || !data.items || !data.items.length) {
    list.innerHTML = '<div class="empty">暂时取不到新闻，请稍后再试（下拉可重试）</div>';
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

const colorOf = (v) => (v === null || v === undefined) ? '#94a0ae' : (v > 0 ? '#dc2626' : (v < 0 ? '#16a34a' : '#5d6875'));
const pct = (v, d = 2) => (v === null || v === undefined) ? '—' : (v > 0 ? '+' : '') + v.toFixed(d) + '%';

function renderQuoteBoard(elId, names) {
  const el = $(elId);
  if (!el) return;
  if (!names || !names.length) { el.innerHTML = '<div class="ph">未选标的（工具 → 资产板块设置）</div>'; return; }
  el.innerHTML = names.map((n) => {
    const q = QUOTES[n];
    if (!q) return '<div class="r"><span class="nm">' + escapeHTML(n) + '</span><span class="ch">—</span></div>';
    return '<div class="r"><span class="nm">' + escapeHTML(n) + '</span>'
      + '<span class="ch" style="color:' + colorOf(q.chg) + '">' + pct(q.chg) + '</span></div>';
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
    const c = pv >= 80 ? '#dc2626' : (pv >= 60 ? '#f59e0b' : '#16a34a');
    return '<div class="v"><span class="nm">' + escapeHTML(n) + '</span>'
      + '<span class="bar"><i style="width:' + pv + '%;background:' + c + '"></i></span>'
      + '<span class="pv" style="color:' + c + '">' + pv + '%</span></div>';
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
        + '<span class="ch" style="color:' + colorOf(es[0].v) + '">' + pct(es[0].v) + '</span></div>'
        + '<div class="nmx">' + escapeHTML(FUND_NAMES[es[0].c] || es[0].c) + '</div>');
    }
    const os = o.od.map((c) => ({ c, v: (od[c] || {})['日累计限定金额'] }))
      .filter((x) => x.v !== null && x.v !== undefined).sort((a, b) => b.v - a.v);
    if (os.length) {
      odRows.push('<div class="r"><span class="nm">' + o.key + '</span>'
        + '<span class="ch" style="color:#2563eb">' + Math.round(os[0].v) + ' 元/日</span></div>'
        + '<div class="nmx">' + escapeHTML(FUND_NAMES[os[0].c] || os[0].c) + '</div>');
    }
  });
  etfEl.innerHTML = etfRows.join('') || '<div class="ph">无数据</div>';
  odEl.innerHTML = odRows.join('') || '<div class="ph">无数据</div>';
}

function renderAssetBoards() {
  buildPools();
  renderQuoteBoard('gridMarket', CFG.market);
  renderQuoteBoard('gridHold', CFG.hold);
  renderValBoard(CFG.val);
  renderOverseas();
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
  $('rowNotify').addEventListener('click', () => sheet('新闻通知',
    '计划中的能力（下一版本）：\n\n· 下午茶 15:20、夜豆浆 22:30 定时提醒\n· 用官方 @capacitor/local-notifications 实现，本地推送\n\n说明：新闻抓取由 Cloudflare 定时触发云端任务（15:20 / 22:30），App 这端只负责"到点提醒你来看"。'));
  $('rowRead').addEventListener('click', () => sheet('已读标记',
    '计划中的能力：\n\n· 记录哪些新闻看过，未读显示"新"标\n· 数据存在手机本地（@capacitor/preferences），不上传\n\n现在的"新"标来自抓取端（与上一场比对），不需要手动操作。'));
  $('rowTheme').addEventListener('click', () => sheet('外观', '当前：跟随系统（浅色）。\n\n深色模式计划后续支持——配色已做成 CSS 变量，改动成本低。'));
  $('rowDiag').addEventListener('click', () => sheet('诊断信息',
    diagText() + '\n\n版本：' + APP_VERSION
    + '\nWebView：' + (navigator.userAgent || '').slice(0, 88)
    + '\n模块数：' + MODULES.length + ' 个'));
  $('rowAbout').addEventListener('click', () => sheet('关于老张工具箱',
    '版本：' + APP_VERSION + '\n\n'
    + '· 新闻：下午茶 / 夜豆浆（谷歌 + 联合早报，AI 摘要）\n'
    + '· 资产：入口卡 + 四个数据格（标的可自定义）\n'
    + '· 工具：' + MODULES.length + ' 个自建站点 + 资产板块设置\n\n'
    + '技术栈：Capacitor 7 + Vite\n'
    + '数据：market-live（行情/估值）、portfolio（QDII 溢价与额度）、news-feed（新闻）\n'
    + '取数均经 proxy.hellohopo.dpdns.org 代理\n\n'
    + '仅供个人研究参考，不构成投资建议。'));
  $('sheetClose').addEventListener('click', () => $('mask').classList.remove('on'));
  $('mask').addEventListener('click', (e) => { if (e.target === $('mask')) $('mask').classList.remove('on'); });
}

/* ───────────── 下拉刷新（新闻 Tab） ───────────── */
function isNewsTab() {
  const p = $('pane-news');
  return p && p.classList.contains('on');
}

function setupPullRefresh() {
  const box = $('content');
  const hint = $('pullHint');
  if (!box || !hint) return;
  let startY = 0, pulling = false, refreshing = false;

  box.addEventListener('touchstart', (e) => {
    if (!isNewsTab() || box.scrollTop > 0 || refreshing) return;
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
      try { await loadNews(currentEdition, true); } finally {
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
  await loadCfg();            // 先读配置，再按配置渲染
  setupCfgPanel();
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
