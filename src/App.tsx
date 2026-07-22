import { useEffect, useMemo, useState } from "react";

type Category = "全部" | "原材料" | "医药化工" | "电子与电力" | "工业机械" | "工程设备" | "车辆零部件";
type TrendPoint = { year: string; china: number; world: number; share: number };

export type CommodityRecord = {
  id: string;
  hs: string;
  name: string;
  english: string;
  category: Exclude<Category, "全部">;
  completeYear: { period: "2025"; china: number; world: number; share: number; source: "UN Comtrade" };
  latestPulse: { period: "2026-01—05"; china: null; world: null; share: null; completeness: "已发布，待 HS4 复核"; source: "India TradeStat" };
  alternatives: string[];
  definition: string;
  sourcePublished: string;
  accessedAt: string;
  proxy?: boolean;
  controlled?: string;
  trend?: TrendPoint[];
};

export type ControlRecord = {
  code: string;
  referenceHs: string;
  item: string;
  parameters: string;
  effective: string;
  status: "现行" | "需逐项核验";
  source: string;
};

export type RouteSignal = {
  id: string;
  product: string;
  hs: string;
  hub: string;
  coverage: "2023→2024";
  cnToHub: [number, number];
  hubToIndia: [number, number];
  directToIndia: [number, number];
  source: string;
};

const SNAPSHOT_DATE = "2026-07-22";
const COMTRADE = "https://uncomtrade.org/docs/un-comtrade-api/";
const TRADESTAT = "https://tradestat.commerce.gov.in/meidb/commodity_wise_all_countries_import";
const TIA = "https://trade-analytics.commerce.gov.in/public";
const CONTROL_RULE = "https://xzfg.moj.gov.cn/front/law/detail?LawID=1735&Query=";
const CONTROL_CATALOG = "https://exportcontrol.mofcom.gov.cn/article/hgfw/lywxcx/gzqd/202601/1203.html";

const categories: Category[] = ["全部", "原材料", "医药化工", "电子与电力", "工业机械", "工程设备", "车辆零部件"];
const pulse = { period: "2026-01—05", china: null, world: null, share: null, completeness: "已发布，待 HS4 复核", source: "India TradeStat" } as const;
const annual = (china: number, world: number) => ({ period: "2025", china, world, share: china / world * 100, source: "UN Comtrade" } as const);

const commodities: CommodityRecord[] = [
  { id: "ic", hs: "8542", name: "集成电路", english: "Electronic integrated circuits", category: "电子与电力", completeYear: annual(11.7102, 28.6165), latestPulse: pulse, alternatives: ["新加坡", "中国香港", "韩国", "马来西亚"], definition: "处理器、存储器、放大器等宽口径品类；具体用途需下钻至 HS6/8。", sourcePublished: "2026-07", accessedAt: SNAPSHOT_DATE, trend: [{year:"2021",china:4.53,world:12.39,share:36.5},{year:"2022",china:5.06,world:16.12,share:31.4},{year:"2023",china:10.06,world:19.22,share:52.4},{year:"2024",china:10.54,world:23.45,share:45.0},{year:"2025",china:11.7102,world:28.6165,share:40.9}] },
  { id: "battery", hs: "8507", name: "蓄电池", english: "Electric accumulators", category: "电子与电力", completeYear: annual(4.3131, 4.9470), latestPulse: pulse, alternatives: ["韩国", "日本", "越南", "美国"], definition: "覆盖锂离子及其他蓄电池；高占比反映进口来源集中，不等于国内消费完全依赖进口。", sourcePublished: "2026-07", accessedAt: SNAPSHOT_DATE, trend: [{year:"2021",china:1.22,world:2.09,share:58.3},{year:"2022",china:2.25,world:3.22,share:69.7},{year:"2023",china:3.11,world:3.82,share:81.4},{year:"2024",china:2.89,world:3.50,share:82.5},{year:"2025",china:4.3131,world:4.9470,share:87.2}] },
  { id: "transformers", hs: "8504", name: "变压器与电源设备", english: "Transformers and static converters", category: "电子与电力", completeYear: annual(2.5802, 4.0884), latestPulse: pulse, alternatives: ["德国", "日本", "韩国", "美国"], definition: "含变压器、静态变流器及电感器，是电网、工业自动化与消费电子的共同投入。", sourcePublished: "2026-07", accessedAt: SNAPSHOT_DATE },
  { id: "semiconductor", hs: "8541", name: "半导体器件", english: "Semiconductor devices", category: "电子与电力", completeYear: annual(3.9884, 6.1024), latestPulse: pulse, alternatives: ["马来西亚", "越南", "新加坡", "韩国"], definition: "包括二极管、晶体管、光伏电池等；不同子项的产业含义差异显著。", sourcePublished: "2026-07", accessedAt: SNAPSHOT_DATE },
  { id: "amino", hs: "2922", name: "含氧氨基化合物", english: "Oxygen-function amino-compounds", category: "医药化工", completeYear: annual(0.6214, 0.8446), latestPulse: pulse, alternatives: ["美国", "德国", "瑞士", "意大利"], definition: "医药原料与精细化工的代理组，不应直接等同于全部原料药（API）。", sourcePublished: "2026-07", accessedAt: SNAPSHOT_DATE, proxy: true },
  { id: "heterocyclic", hs: "2933", name: "含氮杂环化合物", english: "Heterocyclic compounds with nitrogen", category: "医药化工", completeYear: annual(1.7991, 2.3497), latestPulse: pulse, alternatives: ["瑞士", "美国", "爱尔兰", "德国"], definition: "覆盖大量药物中间体和精细化学品，是观察 API 供应链的宽口径窗口。", sourcePublished: "2026-07", accessedAt: SNAPSHOT_DATE, proxy: true },
  { id: "polymer", hs: "3907", name: "聚酯与工程塑料", english: "Polyacetals, polyethers and polyesters", category: "医药化工", completeYear: annual(0.9113, 2.7016), latestPulse: pulse, alternatives: ["韩国", "新加坡", "泰国", "日本"], definition: "用于汽车、电子、包装和工业零部件的基础材料。", sourcePublished: "2026-07", accessedAt: SNAPSHOT_DATE },
  { id: "graphite", hs: "2504", name: "天然石墨", english: "Natural graphite", category: "原材料", completeYear: annual(0.00378, 0.04108), latestPulse: pulse, alternatives: ["马达加斯加", "莫桑比克", "坦桑尼亚", "巴西"], definition: "HS4 为天然石墨宽口径；是否受控仍取决于纯度、粒度、形态等技术参数。", sourcePublished: "2026-07", accessedAt: SNAPSHOT_DATE, controlled: "部分石墨相关物项受控" },
  { id: "rareearth", hs: "2846", name: "稀土化合物", english: "Compounds of rare-earth metals", category: "原材料", completeYear: annual(0.00491, 0.01294), latestPulse: pulse, alternatives: ["日本", "马来西亚", "爱沙尼亚", "法国"], definition: "贸易税号仅作初筛；中重稀土物项须按管制清单与参数逐项核验。", sourcePublished: "2026-07", accessedAt: SNAPSHOT_DATE, controlled: "部分中重稀土物项受控" },
  { id: "pumps", hs: "8413", name: "液体泵", english: "Pumps for liquids", category: "工业机械", completeYear: annual(0.3156, 1.5732), latestPulse: pulse, alternatives: ["德国", "美国", "日本", "意大利"], definition: "覆盖工业、工程、水务与车辆用泵；零部件依赖可能高于整机口径。", sourcePublished: "2026-07", accessedAt: SNAPSHOT_DATE },
  { id: "valves", hs: "8481", name: "阀门与流体控制件", english: "Taps, cocks and valves", category: "工业机械", completeYear: annual(0.5806, 2.4093), latestPulse: pulse, alternatives: ["德国", "美国", "意大利", "日本"], definition: "用于能源、化工、工程机械及工厂自动化。", sourcePublished: "2026-07", accessedAt: SNAPSHOT_DATE },
  { id: "toolparts", hs: "8466", name: "机床零部件", english: "Parts and accessories for machine-tools", category: "工业机械", completeYear: annual(0.2140, 0.8307), latestPulse: pulse, alternatives: ["德国", "日本", "意大利", "中国台湾"], definition: "包括夹具、分度头和专用附件，是制造设备维护的重要投入。", sourcePublished: "2026-07", accessedAt: SNAPSHOT_DATE },
  { id: "machineparts", hs: "8431", name: "工程机械零部件", english: "Parts for machinery of headings 8425–8430", category: "工程设备", completeYear: annual(1.0636, 1.9446), latestPulse: pulse, alternatives: ["德国", "日本", "美国", "韩国"], definition: "覆盖起重、装卸、土方和隧道设备零件，比整机口径更能反映存量设备维保黏性。", sourcePublished: "2026-07", accessedAt: SNAPSHOT_DATE, trend: [{year:"2021",china:0.63,world:1.56,share:40.4},{year:"2022",china:0.69,world:1.53,share:44.9},{year:"2023",china:0.82,world:1.66,share:49.3},{year:"2024",china:0.94,world:1.76,share:53.1},{year:"2025",china:1.0636,world:1.9446,share:54.7}] },
  { id: "tunnel", hs: "8430", name: "隧道与土方机械", english: "Moving, grading and tunnelling machinery", category: "工程设备", completeYear: annual(0.2089, 0.4273), latestPulse: pulse, alternatives: ["德国", "美国", "日本", "意大利"], definition: "盾构机/隧道掘进机代理口径。HS 8430 还包含其他土方和采掘机械，不能视为盾构机专属值。", sourcePublished: "2026-07", accessedAt: SNAPSHOT_DATE, proxy: true, trend: [{year:"2021",china:0.11,world:0.38,share:30.2},{year:"2022",china:0.29,world:0.57,share:50.9},{year:"2023",china:0.16,world:0.33,share:48.4},{year:"2024",china:0.15,world:0.35,share:43.4},{year:"2025",china:0.2089,world:0.4273,share:48.9}] },
  { id: "earthmoving", hs: "8429", name: "自推进式工程车辆", english: "Bulldozers, excavators and loaders", category: "工程设备", completeYear: annual(0.2212, 0.4790), latestPulse: pulse, alternatives: ["日本", "韩国", "美国", "德国"], definition: "工程车代理口径，覆盖推土机、挖掘机、装载机和压路机等，不含全部专用车辆。", sourcePublished: "2026-07", accessedAt: SNAPSHOT_DATE, proxy: true },
  { id: "autoparts", hs: "8708", name: "机动车零部件", english: "Parts and accessories of motor vehicles", category: "车辆零部件", completeYear: annual(1.7536, 6.8000), latestPulse: pulse, alternatives: ["德国", "日本", "韩国", "美国"], definition: "宽口径汽车零部件组；电驱、底盘、车身与安全系统需在 HS6/8 层级进一步区分。", sourcePublished: "2026-07", accessedAt: SNAPSHOT_DATE },
];

const controls: ControlRecord[] = [
  { code: "参考清单逐项核验", referenceHs: "2504 / 3801", item: "部分石墨材料", parameters: "纯度、粒径、形态、密度及用途", effective: "现行目录", status: "需逐项核验", source: CONTROL_CATALOG },
  { code: "参考清单逐项核验", referenceHs: "2846", item: "部分中重稀土化合物", parameters: "元素、化合物形态、含量和用途", effective: "2025-04 起", status: "现行", source: CONTROL_CATALOG },
];

const routes: RouteSignal[] = [
  { id:"my-graphite", product:"天然石墨", hs:"2504", hub:"马来西亚", coverage:"2023→2024", cnToHub:[0.402,0.622], hubToIndia:[0.0146,0.647], directToIndia:[15.18,4.48], source:COMTRADE },
  { id:"vn-artificial", product:"人造石墨", hs:"3801", hub:"越南", coverage:"2023→2024", cnToHub:[12.87,24.08], hubToIndia:[0,0.213], directToIndia:[79.59,60.84], source:COMTRADE },
  { id:"sg-rareearth", product:"稀土化合物", hs:"2846", hub:"新加坡", coverage:"2023→2024", cnToHub:[0.057,2.134], hubToIndia:[0.0107,0.0102], directToIndia:[5.20,4.32], source:COMTRADE },
  { id:"ae-tungsten", product:"钨及其制品", hs:"8101", hub:"阿联酋", coverage:"2023→2024", cnToHub:[1.232,0.628], hubToIndia:[0.00073,0.00001], directToIndia:[17.96,18.69], source:COMTRADE },
];

const sources = [
  { tag:"IN", title:"印度 DGCI&S TradeStat", detail:"月度库已更新至 2026 年 5 月，最后更新 2026-07-15；2026 年 4 月起部分 ITC HS 编码调整。", period:"2018-01—2026-05", url:TRADESTAT },
  { tag:"TIA", title:"印度贸易情报与分析门户", detail:"FY2025–26 对华进口 1,316.3 亿美元、出口 194.7 亿美元；来源为 DGCIS。", period:"FY2025–26", url:TIA },
  { tag:"UN", title:"UN Comtrade API", detail:"2025 HS4 依赖矩阵、精选五年趋势与第三国路径样本的可复核双边贸易值。", period:"2021—2025 / 路径 2023—2024", url:COMTRADE },
  { tag:"GOI", title:"印度议会答复 4023/2025", detail:"说明对华进口以原材料、中间品、资本品、电子零件、机械及零件等为主。", period:"2025-03-25", url:"https://www.commerce.gov.in/wp-content/uploads/2025/03/LS-USQ-No.4023-dated.-25.03.2025.pdf" },
  { tag:"CN", title:"两用物项出口管制条例与 2026 目录", detail:"管制编码和技术参数优先于 HS 参考编码；最终用户与最终用途同样影响判定。", period:"现行", url:CONTROL_CATALOG },
];

const policies = [
  { date:"2024.12", title:"统一两用物项出口管制框架生效", body:"条例覆盖出口、过境、转运、通运、再出口以及特定境外再转移情形。", url:CONTROL_RULE },
  { date:"2025.02", title:"钨、碲、铋、钼、铟相关物项", body:"部分战略矿产、化合物及相关技术纳入许可管理；应按参数而非仅按 HS 识别。", url:"https://www.mofcom.gov.cn/zfxxgk/gkml/art/2025/art_084ded0609404b2d81c746b31c9a03a6.html" },
  { date:"2025.04", title:"部分中重稀土相关物项", body:"钐、钆、铽、镝、镥、钪、钇等相关物项按公告参数实施出口管制。", url:"https://www.mofcom.gov.cn/zwgk/zcfb/art/2025/art_9c2108ccaf754f22a34abab2fedaa944.html" },
  { date:"2026.01", title:"年度许可证管理目录更新", body:"按 2026 年进出口税则调整年度许可目录；历史编码通过显式对照处理。", url:CONTROL_CATALOG },
];

const formatB = (v:number) => v >= 1 ? `$${v.toFixed(v >= 10 ? 1 : 2)}B` : `$${(v*1000).toFixed(v < .01 ? 1 : 0)}M`;
const formatM = (v:number) => v >= 1 ? `$${v.toFixed(v >= 10 ? 1 : 2)}M` : `$${(v*1000).toFixed(0)}K`;
const growth = (a:number,b:number) => b === 0 ? (a > 0 ? Infinity : 0) : (a-b)/b*100;
const signed = (v:number) => Number.isFinite(v) ? `${v >= 0 ? "+" : ""}${v.toFixed(0)}%` : "新增";

export default function Home() {
  const [category,setCategory] = useState<Category>("全部");
  const [search,setSearch] = useState("");
  const [minShare,setMinShare] = useState(0);
  const [minValue,setMinValue] = useState(0);
  const [selected,setSelected] = useState<CommodityRecord|null>(null);
  const [routeValue,setRouteValue] = useState(1);
  const [routeGrowth,setRouteGrowth] = useState(25);
  const [period,setPeriod] = useState<"annual"|"pulse">("annual");

  useEffect(() => {
    const onKey = (event:KeyboardEvent) => { if (event.key === "Escape") setSelected(null); };
    window.addEventListener("keydown",onKey);
    return () => window.removeEventListener("keydown",onKey);
  },[]);

  const filtered = useMemo(() => commodities.filter(item => {
    const q = search.trim().toLowerCase();
    return (category === "全部" || item.category === category) && (!q || `${item.name} ${item.english} ${item.hs}`.toLowerCase().includes(q)) && item.completeYear.share >= minShare && item.completeYear.china >= minValue;
  }).sort((a,b)=>b.completeYear.share-a.completeYear.share),[category,search,minShare,minValue]);

  const activeRoutes = routes.filter(route => route.cnToHub[1] >= routeValue && route.hubToIndia[1] >= routeValue && growth(route.cnToHub[1],route.cnToHub[0]) >= routeGrowth && growth(route.hubToIndia[1],route.hubToIndia[0]) >= routeGrowth);
  const chinaTotal = commodities.reduce((sum,item)=>sum+item.completeYear.china,0);
  const worldTotal = commodities.reduce((sum,item)=>sum+item.completeYear.world,0);
  const weightedShare = chinaTotal/worldTotal*100;
  const highCount = commodities.filter(item=>item.completeYear.share>=50).length;
  const reset = () => { setCategory("全部"); setSearch(""); setMinShare(0); setMinValue(0); };

  return <main>
    <header className="topbar">
      <a className="brand" href="#top" aria-label="返回首页"><span className="brand-mark">依</span><span>中印供应链依赖图谱<small>INDIA × CHINA SUPPLY ATLAS</small></span></a>
      <nav aria-label="主要导航"><a href="#matrix">依赖矩阵</a><a href="#routes">路径信号</a><a href="#policy">政策时间线</a><a href="#sources">来源中心</a></nav>
      <span className="snapshot"><i/> PUBLIC · 快照 {SNAPSHOT_DATE}</span>
    </header>

    <section className="hero" id="top">
      <div className="hero-grid" aria-hidden="true"/>
      <div className="hero-copy">
        <p className="eyebrow"><span>RESEARCH BRIEF / 02</span> 可审计供应链情报</p>
        <h1>读懂印度制造的<br/><em>中国投入品底座</em></h1>
        <p className="dek">从原材料、药物中间体到电力设备、工程机械与零配件，观察进口来源集中度、替代供应国，以及受管制物项的第三国路径信号。</p>
        <div className="hero-actions"><a className="primary-btn" href="#matrix">进入依赖矩阵 <span>↗</span></a><a className="text-btn" href="#method">先读方法口径</a></div>
      </div>
      <div className="hero-panel">
        <div className="period-toggle" role="group" aria-label="数据时期"><button className={period==="annual"?"active":""} onClick={()=>setPeriod("annual")}>2025 完整年</button><button className={period==="pulse"?"active":""} onClick={()=>setPeriod("pulse")}>2026 最新脉冲</button></div>
        {period === "annual" ? <>
          <div className="hero-metric"><span>16 个重点 HS4 · 加权对华来源占比</span><strong>{weightedShare.toFixed(1)}<small>%</small></strong><p>中国进口额之和 ÷ 全球进口额之和；不是印度全经济总体依赖率。</p></div>
          <div className="metric-quads"><div><span>自中国进口</span><strong>{formatB(chinaTotal)}</strong></div><div><span>样本全球进口</span><strong>{formatB(worldTotal)}</strong></div><div><span>占比 ≥ 50%</span><strong>{highCount}<small> 组</small></strong></div><div><span>最高集中度</span><strong>87.2%</strong></div></div>
          <a className="panel-source" href={COMTRADE} target="_blank" rel="noreferrer"><span>SOURCE 01</span> UN Comtrade · 2025 · HS 2017 ↗</a>
        </> : <>
          <div className="hero-metric pulse"><span>印度对华进口 · FY2025–26</span><strong>$131.63<small>B</small></strong><p>完整财年官方总量；与 2025 自然年 HS4 矩阵分开展示。</p></div>
          <div className="metric-quads"><div><span>对华出口</span><strong>$19.47B</strong></div><div><span>进口同比</span><strong>+16.03%</strong></div><div><span>2026 年 4 月进口同比</span><strong>+20.85%</strong></div><div><span>月度库可用至</span><strong>2026.05</strong></div></div>
          <a className="panel-source" href={TIA} target="_blank" rel="noreferrer"><span>SOURCE 02</span> India TIA / DGCI&S · 访问 {SNAPSHOT_DATE} ↗</a>
        </>}
      </div>
    </section>

    <section className="definition-strip" id="method"><span>01</span><div><strong>“依赖”指什么？</strong><p>同一时期、同一 HS 编码下，印度自中国进口额 ÷ 印度全球进口额。它衡量的是<strong>进口来源依赖</strong>，不等于印度国内消费或生产的总体依赖。</p></div><a href="#sources">查看完整口径 ↘</a></section>

    <section className="section matrix-section" id="matrix">
      <div className="section-heading"><div><p>DEPENDENCY MATRIX / 2025</p><h2>重点商品依赖矩阵</h2></div><p>基于 2025 完整自然年、统一 HS4 口径。点击任一商品查看五年趋势、替代供应国、代理口径与管制提示。</p></div>
      <div className="filter-shell">
        <div className="category-tabs" role="tablist" aria-label="行业筛选">{categories.map(item=><button key={item} role="tab" aria-selected={category===item} className={category===item?"active":""} onClick={()=>setCategory(item)}>{item}</button>)}</div>
        <div className="filters"><label className="search"><span>搜索商品 / 英文 / HS</span><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="例如：盾构、battery、8430"/></label><label><span>最低对华占比 <b>{minShare}%</b></span><input type="range" min="0" max="90" step="5" value={minShare} onChange={e=>setMinShare(Number(e.target.value))}/></label><label><span>最低自华进口额 <b>{minValue===0?"不限":formatB(minValue)}</b></span><input type="range" min="0" max="5" step="0.25" value={minValue} onChange={e=>setMinValue(Number(e.target.value))}/></label><button className="reset" onClick={reset}>重置筛选</button></div>
      </div>
      <div className="matrix-meta" aria-live="polite"><span>显示 {filtered.length} / {commodities.length} 个商品组 · 按依赖度排序</span><a href={COMTRADE} target="_blank" rel="noreferrer">UN Comtrade · 2025 · 访问 {SNAPSHOT_DATE} ↗</a></div>
      <div className="commodity-table"><div className="table-head"><span>商品 / HS</span><span>印度自中国进口</span><span>印度全球进口</span><span>对华来源占比</span><span>判读</span></div>{filtered.map(item=><button className="commodity-row" key={item.id} onClick={()=>setSelected(item)} aria-label={`查看 ${item.name} 详情`}><span className="commodity-name"><b>{item.name}</b><small>{item.english}</small><code>HS {item.hs}{item.proxy?" · 代理编码":""}</code></span><span className="value-cell"><b>{formatB(item.completeYear.china)}</b><small>2025 · CIF</small></span><span className="value-cell"><b>{formatB(item.completeYear.world)}</b><small>2025 · 全球</small></span><span className="share-cell"><b>{item.completeYear.share.toFixed(1)}%</b><i><em style={{width:`${item.completeYear.share}%`}}/></i></span><span className="tag-cell">{item.controlled&&<i className="risk">管制筛查</i>}{item.proxy&&<i>代理口径</i>}<small>详情 ↗</small></span></button>)}{filtered.length===0&&<div className="empty-state"><strong>没有符合条件的商品</strong><p>降低阈值或清除搜索词后再试。</p><button onClick={reset}>恢复全部</button></div>}</div>
      <p className="data-note">单位：十亿美元，现价美元，进口通常按 CIF 计。由于四位税号会覆盖多个用途，任何产业或管制判断都应继续下钻。2026 年月度库已发布至 5 月，但本矩阵不混入未完成的自然年。</p>
    </section>

    <section className="pulse-ribbon" aria-label="最新脉冲"><div><span>LIVE DATA PULSE</span><strong>2026.05</strong></div><p>印度 TradeStat 月度库已更新至 2026 年 5 月；2026 年 4 月起部分 ITC HS 编码被撤销或重新分配。本版保留 2025 完整年作为可比矩阵，月度细项通过下次审核后再进入快照。</p><a href={TRADESTAT} target="_blank" rel="noreferrer">打开官方月度库 ↗</a></section>

    <section className="section spotlight"><div className="section-heading"><div><p>EQUIPMENT FOCUS</p><h2>工程设备专题</h2></div><p>把整机、土方车辆与维保零件分开阅读，避免用一个宽泛税号替代具体设备判断。</p></div><div className="spotlight-grid">{["tunnel","earthmoving","machineparts"].map((id,index)=>{const item=commodities.find(x=>x.id===id)!;return <button className="spotlight-card" key={id} onClick={()=>setSelected(item)}><span className="card-index">0{index+1} / HS {item.hs}</span><div className={`equipment-visual v${index+1}`} aria-hidden="true"><i/><i/><i/></div><p>{item.english}</p><h3>{item.name}</h3><strong className="big-share">{item.completeYear.share.toFixed(1)}<small>%</small></strong><span className="card-link">查看证据卡片 ↗</span></button>})}</div></section>

    <section className="section route-section" id="routes">
      <div className="section-heading inverse"><div><p>ROUTE SIGNALS / SCREENING ONLY</p><h2>可能的第三国路径信号</h2></div><p>同一 HS 组中“中国→第三国”与“第三国→印度”同步上升，并同时展示“中国→印度”变化。仅用于筛查，不认定实际转口或违法。</p></div>
      <div className="route-controls"><label><span>两段贸易额下限 <b>{formatM(routeValue)}</b></span><input type="range" min="0" max="3" step="0.1" value={routeValue} onChange={e=>setRouteValue(Number(e.target.value))}/></label><label><span>两段增幅下限 <b>{routeGrowth}%</b></span><input type="range" min="0" max="100" step="5" value={routeGrowth} onChange={e=>setRouteGrowth(Number(e.target.value))}/></label><div><strong>{activeRoutes.length}</strong><span>条路径信号</span></div></div>
      <div className="route-list">{activeRoutes.map(route=><article className="route-card" key={route.id}><div className="route-title"><div><span>HS {route.hs} · {route.coverage}</span><h3>{route.product} / {route.hub}</h3></div><a href={route.source} target="_blank" rel="noreferrer">UN ↗</a></div><div className="route-flow"><div className="node china"><small>起点</small><strong>中国</strong><span>{formatM(route.cnToHub[1])}</span></div><div className="edge"><b>{signed(growth(route.cnToHub[1],route.cnToHub[0]))}</b><i/></div><div className="node hub"><small>第三国</small><strong>{route.hub}</strong><span>{formatM(route.hubToIndia[1])}</span></div><div className="edge"><b>{signed(growth(route.hubToIndia[1],route.hubToIndia[0]))}</b><i/></div><div className="node india"><small>终点</small><strong>印度</strong><span>直接流 {formatM(route.directToIndia[1])}</span></div></div><p>中国→印度直接流：{formatM(route.directToIndia[0])} → {formatM(route.directToIndia[1])}（{signed(growth(route.directToIndia[1],route.directToIndia[0]))}）</p></article>)}</div>
      {activeRoutes.length===0&&<div className="route-empty"><span>∅</span><div><strong>当前阈值下没有路径信号</strong><p>这不代表不存在转口。默认阈值要求两段贸易额均不低于 100 万美元、可比期增幅均不低于 25%；尝试降低金额阈值可查看弱信号。</p><button onClick={()=>{setRouteValue(.2);setRouteGrowth(25)}}>查看弱信号</button></div></div>}
      <div className="route-warning"><strong>判读边界</strong><p>同步上升可能由产业扩张、库存、加工贸易、价格变化或统计差异造成。信号不是规避管制、非法转口或个案事实的认定；缺失月份不插值，不完整国家不进入排名。</p></div>
    </section>

    <section className="section" id="policy"><div className="section-heading"><div><p>CONTROL TIMELINE</p><h2>政策与管制时间线</h2></div><p>HS 编码只是筛查入口。是否受控取决于管制编码、技术参数、最终用户、最终用途以及查询时有效的政策。</p></div><div className="timeline">{policies.map((item,index)=><a className="timeline-item" href={item.url} target="_blank" rel="noreferrer" key={item.date}><span>{item.date}</span><i>{String(index+1).padStart(2,"0")}</i><div><h3>{item.title} ↗</h3><p>{item.body}</p></div></a>)}</div><div className="control-ledger"><h3>可观察管制筛查表</h3>{controls.map(item=><a href={item.source} target="_blank" rel="noreferrer" key={item.referenceHs}><span>{item.referenceHs}</span><strong>{item.item}</strong><p>{item.parameters}</p><em>{item.status} ↗</em></a>)}</div></section>

    <section className="section sources-section" id="sources"><div className="section-heading"><div><p>SOURCE CENTER</p><h2>来源、口径与可复核性</h2></div><p>每组数据保留来源发布日期、访问日期、HS 版本、完整年度/月度口径及限制说明。</p></div><div className="source-grid">{sources.map(source=><a className="source-card" href={source.url} target="_blank" rel="noreferrer" key={source.tag}><span>{source.tag}</span><div><h3>{source.title} ↗</h3><p>{source.detail}</p></div><small>{source.period} · 访问 {SNAPSHOT_DATE}</small></a>)}</div><div className="method-grid"><div><span>M01</span><h3>计算</h3><p>同一时期、同一 HS 编码：印度自中国进口额 ÷ 印度全球进口额。</p></div><div><span>M02</span><h3>时间</h3><p>2025 自然年作为完整基准；2026 年 1—5 月仅作最新脉冲，不与完整年混算。</p></div><div><span>M03</span><h3>编码</h3><p>年度矩阵使用 HS 2017。2026 ITC HS 调整需显式对照，无法可靠对应则不跨期合并。</p></div><div><span>M04</span><h3>限制</h3><p>镜像贸易、估算值、CIF/FOB 差异和宽税号都会影响判读。本工具不构成法律意见。</p></div></div></section>

    <footer><div><strong>中印供应链依赖图谱</strong><p>公开研究工具 · 静态数据快照 · 无需登录</p></div><div><span>快照生成</span><b>{SNAPSHOT_DATE}</b></div><a href="#top">回到顶部 ↑</a></footer>

    {selected&&<div className="drawer-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setSelected(null)}}><aside className="detail-drawer" role="dialog" aria-modal="true" aria-labelledby="drawer-title"><button className="drawer-close" onClick={()=>setSelected(null)} aria-label="关闭详情">×</button><p className="eyebrow">EVIDENCE CARD / HS {selected.hs}</p><h2 id="drawer-title">{selected.name}</h2><p className="drawer-english">{selected.english}</p><div className="drawer-tags"><code>HS {selected.hs}</code><span>{selected.category}</span>{selected.proxy&&<span>代理编码</span>}{selected.controlled&&<span className="risk">管制筛查</span>}</div><div className="drawer-metrics"><div><span>印度自中国进口</span><strong>{formatB(selected.completeYear.china)}</strong></div><div><span>印度全球进口</span><strong>{formatB(selected.completeYear.world)}</strong></div><div><span>对华来源占比</span><strong>{selected.completeYear.share.toFixed(1)}%</strong></div></div><a className="drawer-source" href={COMTRADE} target="_blank" rel="noreferrer">UN Comtrade · 2025 · HS 2017 · 访问 {selected.accessedAt} ↗</a><section><h3>商品定义与口径</h3><p>{selected.definition}</p></section><section><div className="drawer-section-title"><h3>五年趋势</h3><span>2021—2025 · 对华来源占比</span></div>{selected.trend?<div className="trend-chart">{selected.trend.map(point=><div className="trend-year" key={point.year}><span>{point.share.toFixed(1)}%</span><div><i style={{height:`${Math.max(6,point.share)}%`}}/></div><small>{point.year}</small></div>)}</div>:<div className="trend-unavailable"><strong>未跨期合并</strong><p>该商品未完成可靠的五年编码对照，因此仅展示 2025 完整年。</p></div>}</section><section><h3>主要替代供应国</h3><div className="alternatives">{selected.alternatives.map(country=><span key={country}>{country}</span>)}</div><p>按可比双边数据识别，表示其他来源，不代表短期内具备等量替代能力。</p></section><section className="pulse-box"><h3>2026 最新脉冲</h3><p>TradeStat 已发布 2026 年 1—5 月数据；该 HS4 细项处于复核队列，本快照不以缺失值推算或替代完整年度数值。</p><a href={TRADESTAT} target="_blank" rel="noreferrer">India TradeStat · 更新 2026-07-15 ↗</a></section>{selected.controlled&&<section className="control-box"><h3>{selected.controlled}</h3><p>参考 HS 只能用于初筛；是否受控仍取决于技术参数、最终用户、最终用途与当前有效政策。</p><a href={CONTROL_CATALOG} target="_blank" rel="noreferrer">核对 2026 年许可证管理目录 ↗</a></section>}<p className="fineprint">数据单位为现价美元；数值经过十亿美元换算和显示舍入，比例使用未舍入值计算。</p></aside></div>}
  </main>;
}
