/* 内置兜底模块清单（与 nav/modules.json 同步维护；线上清单可达时优先用线上） */
window.FALLBACK_MODULES = {
  "version": "20260912",
  "updated": "2026-09-12",
  "note": "老张工具箱 · 模块配置单一数据源。首页 nav 与后续 Android App 共用此文件；新增模块只需在此加一条。",
  "groups": [
    {
      "id": "finance",
      "name": "金融"
    },
    {
      "id": "tools",
      "name": "工具"
    },
    {
      "id": "study",
      "name": "学习"
    },
    {
      "id": "life",
      "name": "生活"
    }
  ],
  "modules": [
    {
      "id": "news-daily",
      "name": "早咖啡 / 下午茶",
      "desc": "谷歌+联合早报 各10条 · AI摘要 · 每天 07:00 / 15:20",
      "url": "https://homjanon.github.io/news-feed/",
      "icon": "☕",
      "accent": "#0d9488",
      "group": "finance",
      "nav": false,
      "app": {
        "phase": 1,
        "mode": "webview",
        "note": "一期内置新闻页（独立新闻源 news-feed）"
      }
    },
    {
      "id": "portfolio",
      "name": "全球金融市场日报",
      "desc": "A/港/美/全球指数、商品、汇率 · 每日更新",
      "url": "https://portfolio.hellohopo.dpdns.org/",
      "icon": "📈",
      "accent": "#2563eb",
      "group": "finance",
      "nav": true,
      "app": {
        "phase": 1,
        "mode": "webview",
        "note": "完整图文日报（网页同源）"
      }
    },
    {
      "id": "market-live",
      "name": "实时市场看板",
      "desc": "XXFI 恐惧指数 · A股冰点 · 实时行情",
      "url": "https://market-live.hellohopo.dpdns.org/",
      "icon": "📊",
      "accent": "#0ea5e9",
      "group": "finance",
      "nav": true,
      "app": {
        "phase": 4,
        "mode": "webview"
      }
    },
    {
      "id": "inv",
      "name": "个人投资管理系统",
      "desc": "持仓 · 盈亏 · 云端同步",
      "url": "https://inv.hellohopo.dpdns.org/",
      "icon": "💼",
      "accent": "#2563eb",
      "group": "finance",
      "nav": true,
      "app": {
        "phase": 2,
        "mode": "webview",
        "note": "云同步沿用 Gitee 快照，与网页共用同一后端"
      }
    },
    {
      "id": "xiaoxu-fear",
      "name": "小旭恐惧指数",
      "desc": "XXFI 反向情绪指标 · 恐慌/贪婪判断",
      "url": "https://xiaoxu-fear.hellohopo.dpdns.org/",
      "icon": "🧊",
      "accent": "#6366f1",
      "group": "finance",
      "nav": true,
      "app": {
        "phase": 4,
        "mode": "webview"
      }
    },
    {
      "id": "cmb-tracker",
      "name": "招招五维 · 银行追踪",
      "desc": "五大行五维评分 · 价值投资追踪",
      "url": "https://cmb-tracker.hellohopo.dpdns.org/",
      "icon": "🏦",
      "accent": "#e6a23c",
      "group": "finance",
      "nav": true,
      "app": {
        "phase": 4,
        "mode": "webview"
      }
    },
    {
      "id": "douban-tracker",
      "name": "豆瓣楼主发言追踪",
      "desc": "楼主发言 · 持仓动态 · 每日报告",
      "url": "https://douban-tracker.hellohopo.dpdns.org/",
      "icon": "🎬",
      "accent": "#00b51d",
      "group": "finance",
      "nav": true,
      "app": {
        "phase": 4,
        "mode": "webview"
      }
    },
    {
      "id": "qdii-nav-tracker",
      "name": "QDII 净值跟踪",
      "desc": "每日净值 · 溢价率追踪",
      "url": "https://qdii-nav-tracker.hellohopo.dpdns.org/",
      "icon": "🪙",
      "accent": "#0891b2",
      "group": "finance",
      "nav": true,
      "app": {
        "phase": 4,
        "mode": "webview"
      }
    },
    {
      "id": "delivery-ocr",
      "name": "快递单 OCR 识别",
      "desc": "拍照识别快递单 · 物流信息提取",
      "url": "https://delivery-ocr.hellohopo.dpdns.org/",
      "icon": "📄",
      "accent": "#7c3aed",
      "group": "tools",
      "nav": true,
      "app": {
        "phase": 4,
        "mode": "webview"
      }
    },
    {
      "id": "blog",
      "name": "老张随笔",
      "desc": "投资思考 · 生活记录 · 写文章",
      "url": "https://blog.hellohopo.dpdns.org/",
      "icon": "✍️",
      "accent": "#f59e0b",
      "group": "life",
      "nav": true,
      "app": {
        "phase": 4,
        "mode": "webview"
      }
    },
    {
      "id": "jingjishi",
      "name": "经济师刷题站",
      "desc": "1929 题 · 错题库 · 艾宾浩斯复习",
      "url": "https://jingjishi.hellohopo.dpdns.org/",
      "icon": "📚",
      "accent": "#059669",
      "group": "study",
      "nav": false,
      "app": {
        "phase": 4,
        "mode": "webview"
      }
    }
  ]
};
