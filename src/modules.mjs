/* 工具 Tab 的模块清单（单一数据源：改这里即可。新闻与资产已是独立 Tab，不在此列）
   注：图标已做 App 侧兼容替换（部分新 emoji 在旧 Android 字体上是空方块） */
export const MODULES = [
  {
    "id": "portfolio",
    "name": "全球金融市场日报",
    "url": "https://portfolio.hellohopo.dpdns.org/",
    "icon": "📈",
    "accent": "#2563eb",
    "desc": "A/港/美/全球指数、商品、汇率 · 每日更新",
    "group": "finance"
  },
  {
    "id": "market-live",
    "name": "实时市场看板",
    "url": "https://market-live.hellohopo.dpdns.org/",
    "icon": "📊",
    "accent": "#0ea5e9",
    "desc": "XXFI 恐惧指数 · A股冰点 · 实时行情",
    "group": "finance"
  },
  {
    "id": "xiaoxu-fear",
    "name": "小旭恐惧指数",
    "url": "https://xiaoxu-fear.hellohopo.dpdns.org/",
    "icon": "😱",
    "accent": "#6366f1",
    "desc": "XXFI 反向情绪指标 · 恐慌/贪婪判断",
    "group": "finance"
  },
  {
    "id": "cmb-tracker",
    "name": "招招五维 · 银行追踪",
    "url": "https://cmb-tracker.hellohopo.dpdns.org/",
    "icon": "🏦",
    "accent": "#e6a23c",
    "desc": "五大行五维评分 · 价值投资追踪",
    "group": "finance"
  },
  {
    "id": "douban-tracker",
    "name": "豆瓣楼主发言追踪",
    "url": "https://douban-tracker.hellohopo.dpdns.org/",
    "icon": "🎬",
    "accent": "#00b51d",
    "desc": "楼主发言 · 持仓动态 · 每日报告",
    "group": "finance"
  },
  {
    "id": "qdii-nav-tracker",
    "name": "QDII 净值跟踪",
    "url": "https://qdii-nav-tracker.hellohopo.dpdns.org/",
    "icon": "💹",
    "accent": "#0891b2",
    "desc": "每日净值 · 溢价率追踪",
    "group": "finance"
  },
  {
    "id": "delivery-ocr",
    "name": "快递单 OCR 识别",
    "url": "https://delivery-ocr.hellohopo.dpdns.org/",
    "icon": "📄",
    "accent": "#7c3aed",
    "desc": "拍照识别快递单 · 物流信息提取",
    "group": "tools"
  },
  {
    "id": "blog",
    "name": "老张随笔",
    "url": "https://blog.hellohopo.dpdns.org/",
    "icon": "✍️",
    "accent": "#f59e0b",
    "desc": "投资思考 · 生活记录 · 写文章",
    "group": "life"
  },
  {
    "id": "jingjishi",
    "name": "经济师刷题站",
    "url": "https://jingjishi.hellohopo.dpdns.org/",
    "icon": "📚",
    "accent": "#059669",
    "desc": "1929 题 · 错题库 · 艾宾浩斯复习",
    "group": "study"
  }
];
