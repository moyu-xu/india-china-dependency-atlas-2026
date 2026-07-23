import { useEffect, useMemo, useState } from "react";
import { MONTHLY_SOURCE_ACCESSED, MONTHLY_SOURCE_LABEL, MONTHLY_SOURCE_URL, monthlyTradeById, type MonthlyTradePoint } from "./data/monthlyTrade";

type Category = "全部" | "原材料" | "医药化工" | "电子与电力" | "工业机械" | "工程设备" | "车辆零部件";
type TrendPoint = { year: string; china: number; world: number; share: number };
type EvidenceLevel = "中等" | "中等偏低" | "低";
type AccuracyLevel = "高概率" | "低概率" | "推测";

type RoutePath = {
  nodes: string[];
  label: string;
  basis: string;
};

type CommodityReport = {
  title: string;
  evidence: EvidenceLevel;
  status: string;
  executive: string;
  dataPoints: string[];
  routes: RoutePath[];
  routeBoundary: string;
  analysis: string[];
  conclusion: string;
  monitoring: string[];
  references: string[];
};

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
const REPORT_DATE = "2026-07-23";
const COMTRADE = "https://uncomtrade.org/docs/un-comtrade-api/";
const TRADESTAT = "https://tradestat.commerce.gov.in/meidb/commodity_wise_all_countries_import";
const TIA = "https://trade-analytics.commerce.gov.in/public";
const CONTROL_RULE = "https://xzfg.moj.gov.cn/front/law/detail?LawID=1735&Query=";
const CONTROL_CATALOG = "https://exportcontrol.mofcom.gov.cn/article/hgfw/lywxcx/gzqd/202601/1203.html";

const categories: Category[] = ["全部", "原材料", "医药化工", "电子与电力", "工业机械", "工程设备", "车辆零部件"];
const pulse = { period: "2026-01—05", china: null, world: null, share: null, completeness: "已发布，待 HS4 复核", source: "India TradeStat" } as const;
const annual = (china: number, world: number) => ({ period: "2025", china, world, share: china / world * 100, source: "UN Comtrade" } as const);

const commodities: CommodityRecord[] = [
  { id: "ic", hs: "8542", name: "集成电路", english: "Electronic integrated circuits", category: "电子与电力", completeYear: annual(11.7102, 28.6165), latestPulse: pulse, alternatives: ["中国台湾", "韩国", "日本", "马来西亚"], definition: "处理器、存储器、放大器等宽口径品类；具体用途需下钻至 HS6/8。", sourcePublished: "2026-07", accessedAt: SNAPSHOT_DATE, trend: [{year:"2021",china:4.53,world:12.39,share:36.5},{year:"2022",china:5.06,world:16.12,share:31.4},{year:"2023",china:10.06,world:19.22,share:52.4},{year:"2024",china:10.54,world:23.45,share:45.0},{year:"2025",china:11.7102,world:28.6165,share:40.9}] },
  { id: "battery", hs: "8507", name: "蓄电池", english: "Electric accumulators", category: "电子与电力", completeYear: annual(4.3131, 4.9470), latestPulse: pulse, alternatives: ["越南", "日本", "韩国", "马来西亚"], definition: "覆盖锂离子及其他蓄电池；高占比反映进口来源集中，不等于国内消费完全依赖进口。", sourcePublished: "2026-07", accessedAt: SNAPSHOT_DATE, trend: [{year:"2021",china:1.22,world:2.09,share:58.3},{year:"2022",china:2.25,world:3.22,share:69.7},{year:"2023",china:3.11,world:3.82,share:81.4},{year:"2024",china:2.89,world:3.50,share:82.5},{year:"2025",china:4.3131,world:4.9470,share:87.2}] },
  { id: "transformers", hs: "8504", name: "变压器与电源设备", english: "Transformers and static converters", category: "电子与电力", completeYear: annual(2.5802, 4.0884), latestPulse: pulse, alternatives: ["德国", "日本", "韩国", "美国"], definition: "含变压器、静态变流器及电感器，是电网、工业自动化与消费电子的共同投入。", sourcePublished: "2026-07", accessedAt: SNAPSHOT_DATE },
  { id: "semiconductor", hs: "8541", name: "半导体器件", english: "Semiconductor devices", category: "电子与电力", completeYear: annual(3.9884, 6.1024), latestPulse: pulse, alternatives: ["越南", "马来西亚", "日本", "中国台湾"], definition: "包括二极管、晶体管、光伏电池等；不同子项的产业含义差异显著。", sourcePublished: "2026-07", accessedAt: SNAPSHOT_DATE },
  { id: "amino", hs: "2922", name: "含氧氨基化合物", english: "Oxygen-function amino-compounds", category: "医药化工", completeYear: annual(0.6214, 0.8446), latestPulse: pulse, alternatives: ["美国", "沙特阿拉伯", "日本", "意大利"], definition: "医药原料与精细化工的代理组，不应直接等同于全部原料药（API）。", sourcePublished: "2026-07", accessedAt: SNAPSHOT_DATE, proxy: true },
  { id: "heterocyclic", hs: "2933", name: "含氮杂环化合物", english: "Heterocyclic compounds with nitrogen", category: "医药化工", completeYear: annual(1.7991, 2.3497), latestPulse: pulse, alternatives: ["意大利", "日本", "美国", "德国"], definition: "覆盖大量药物中间体和精细化学品，是观察 API 供应链的宽口径窗口。", sourcePublished: "2026-07", accessedAt: SNAPSHOT_DATE, proxy: true },
  { id: "polymer", hs: "3907", name: "聚酯与工程塑料", english: "Polyacetals, polyethers and polyesters", category: "医药化工", completeYear: annual(0.9113, 2.7016), latestPulse: pulse, alternatives: ["韩国", "新加坡", "泰国", "日本"], definition: "用于汽车、电子、包装和工业零部件的基础材料。", sourcePublished: "2026-07", accessedAt: SNAPSHOT_DATE },
  { id: "graphite", hs: "2504", name: "天然石墨", english: "Natural graphite", category: "原材料", completeYear: annual(0.00378, 0.04108), latestPulse: pulse, alternatives: ["马达加斯加", "莫桑比克", "坦桑尼亚", "巴西"], definition: "HS4 为天然石墨宽口径；是否受控仍取决于纯度、粒度、形态等技术参数。", sourcePublished: "2026-07", accessedAt: SNAPSHOT_DATE, controlled: "部分石墨相关物项受控" },
  { id: "rareearth", hs: "2846", name: "稀土化合物", english: "Compounds of rare-earth metals", category: "原材料", completeYear: annual(0.00491, 0.01294), latestPulse: pulse, alternatives: ["日本", "韩国", "俄罗斯", "奥地利", "美国"], definition: "贸易税号仅作初筛；中重稀土物项须按管制清单与参数逐项核验。", sourcePublished: "2026-07", accessedAt: SNAPSHOT_DATE, controlled: "部分中重稀土物项受控" },
  { id: "pumps", hs: "8413", name: "液体泵", english: "Pumps for liquids", category: "工业机械", completeYear: annual(0.3156, 1.5732), latestPulse: pulse, alternatives: ["德国", "美国", "日本", "意大利"], definition: "覆盖工业、工程、水务与车辆用泵；零部件依赖可能高于整机口径。", sourcePublished: "2026-07", accessedAt: SNAPSHOT_DATE },
  { id: "valves", hs: "8481", name: "阀门与流体控制件", english: "Taps, cocks and valves", category: "工业机械", completeYear: annual(0.5806, 2.4093), latestPulse: pulse, alternatives: ["德国", "美国", "意大利", "日本"], definition: "用于能源、化工、工程机械及工厂自动化。", sourcePublished: "2026-07", accessedAt: SNAPSHOT_DATE },
  { id: "toolparts", hs: "8466", name: "机床零部件", english: "Parts and accessories for machine-tools", category: "工业机械", completeYear: annual(0.2140, 0.8307), latestPulse: pulse, alternatives: ["德国", "日本", "意大利", "中国台湾"], definition: "包括夹具、分度头和专用附件，是制造设备维护的重要投入。", sourcePublished: "2026-07", accessedAt: SNAPSHOT_DATE },
  { id: "machineparts", hs: "8431", name: "工程机械零部件", english: "Parts for machinery of headings 8425–8430", category: "工程设备", completeYear: annual(1.0636, 1.9446), latestPulse: pulse, alternatives: ["德国", "日本", "美国", "韩国"], definition: "覆盖起重、装卸、土方和隧道设备零件，比整机口径更能反映存量设备维保黏性。", sourcePublished: "2026-07", accessedAt: SNAPSHOT_DATE, trend: [{year:"2021",china:0.63,world:1.56,share:40.4},{year:"2022",china:0.69,world:1.53,share:44.9},{year:"2023",china:0.82,world:1.66,share:49.3},{year:"2024",china:0.94,world:1.76,share:53.1},{year:"2025",china:1.0636,world:1.9446,share:54.7}] },
  { id: "tunnel", hs: "8430", name: "隧道与土方机械", english: "Moving, grading and tunnelling machinery", category: "工程设备", completeYear: annual(0.2089, 0.4273), latestPulse: pulse, alternatives: ["德国", "美国", "日本", "意大利"], definition: "盾构机/隧道掘进机代理口径。HS 8430 还包含其他土方和采掘机械，不能视为盾构机专属值。", sourcePublished: "2026-07", accessedAt: SNAPSHOT_DATE, proxy: true, trend: [{year:"2021",china:0.11,world:0.38,share:30.2},{year:"2022",china:0.29,world:0.57,share:50.9},{year:"2023",china:0.16,world:0.33,share:48.4},{year:"2024",china:0.15,world:0.35,share:43.4},{year:"2025",china:0.2089,world:0.4273,share:48.9}] },
  { id: "earthmoving", hs: "8429", name: "自推进式工程车辆", english: "Bulldozers, excavators and loaders", category: "工程设备", completeYear: annual(0.2212, 0.4790), latestPulse: pulse, alternatives: ["日本", "韩国", "美国", "德国"], definition: "工程车代理口径，覆盖推土机、挖掘机、装载机和压路机等，不含全部专用车辆。", sourcePublished: "2026-07", accessedAt: SNAPSHOT_DATE, proxy: true },
  { id: "autoparts", hs: "8708", name: "机动车零部件", english: "Parts and accessories of motor vehicles", category: "车辆零部件", completeYear: annual(1.7536, 6.8000), latestPulse: pulse, alternatives: ["德国", "日本", "韩国", "美国"], definition: "宽口径汽车零部件组；电驱、底盘、车身与安全系统需在 HS6/8 层级进一步区分。", sourcePublished: "2026-07", accessedAt: SNAPSHOT_DATE },
];

const commodityReports: Record<string, CommodityReport> = {
  ic: {
    title: "集成电路进口依赖与区域供应网络分析",
    evidence: "中等",
    status: "区域加工网络可观察",
    executive: "印度对华集成电路进口规模居 16 项样本首位；越南、台湾地区及马来西亚—菲律宾链条构成主要第三国监测网络，但公开证据更符合封测、组装和区域分工，而非已证实的简单转口。",
    dataPoints: [
      "2025 年印度自中国进口 117.10 亿美元，全球进口 286.17 亿美元，对华来源占比 40.9%。",
      "OEC 2024 数据显示，印度主要来源包括中国 102 亿美元、台湾地区 54.9 亿美元、韩国 29.9 亿美元、日本 5.45 亿美元、马来西亚 5.31 亿美元。",
      "Volza 近 12 个月可见样本中，中国、越南、台湾地区对印 shipment 份额约为 31%、20%、12%；常见节点包括河内、胡志明、海防、克拉克港和马尼拉。",
    ],
    routes: [
      { nodes: ["中国", "越南", "印度"], label: "上游供货—封测/组装—对印出口", basis: "越南在对印可见 shipment 来源中约占 20%，同时是成熟电子制造节点。" },
      { nodes: ["中国", "马来西亚", "菲律宾", "印度"], label: "两级区域封测网络", basis: "报告将马来西亚/菲律宾识别为次级链条；该多节点序列是监测模型，不是逐票货物流向认定。" },
      { nodes: ["中国", "香港", "台湾地区", "印度"], label: "贸易分销—设计/代工网络", basis: "香港是中国集成电路出口首要目的地，台湾地区是印度重要来源；两节点串联仅表示需核验的区域网络上限。" },
    ],
    routeBoundary: "路径中的一国、两国或三国节点表示需要联合核验的供应网络；现有公开数据不能证明每批货物依次经过全部节点，也不能据此认定规避关税或管制。",
    analysis: [
      "集成电路的跨境流动通常伴随晶圆制造、封装测试、模组化和分销等实质性环节。仅凭发票国与贸易额重叠，无法区分合法区域加工与简单转运。",
      "印度自中国直接进口仍占最大单一来源，但台湾、韩国及东盟制造节点共同形成较强的供应分散表象。风险识别应下钻至 HS6/8、料号、晶圆原产地和封测地点。",
    ],
    conclusion: "集成电路属于“直接依赖显著、第三国网络可观察、规避性质未证实”的重点品类。应优先审计越南—马来西亚—菲律宾—香港/台湾网络中的前序原产地与实质性转型记录。",
    monitoring: ["HS6/8 与具体芯片料号", "晶圆制造地、封测地与最终发票国", "河内、海防、胡志明、马尼拉等节点的口岸数据"],
    references: ["研究报告第 5—7 页：电子与电力品类及路径汇总", "OEC 2024 印度集成电路来源结构", "Volza HS 8542 对印 shipment/port 开放摘要"],
  },
  battery: {
    title: "蓄电池高集中度与多节点组装路径分析",
    evidence: "中等偏低",
    status: "越南路径最突出",
    executive: "蓄电池是样本中对华来源占比最高的商品。越南具备最强的第三国路径上限证据，香港、印度尼西亚、日本、马来西亚和韩国为次级节点，但必须区分电芯、模组与 PACK 的实质加工。",
    dataPoints: [
      "2025 年印度自中国进口 43.13 亿美元，全球进口 49.47 亿美元，对华来源占比 87.2%。",
      "OEC 显示越南 2024 年对印度出口电池约 1.25 亿美元，同时自中国进口电池约 49.4 亿美元。",
      "Volza 可见样本中，中国和越南对印 shipment 份额约为 44% 和 28%；印度自香港、印尼、日本的电池进口增量亦可观察。",
    ],
    routes: [
      { nodes: ["中国", "越南", "印度"], label: "电芯—模组/PACK—对印出口", basis: "两端贸易规模与 shipment 来源结构均指向越南为首要监测节点。" },
      { nodes: ["中国", "香港", "印度尼西亚", "印度"], label: "分销—区域组装复合网络", basis: "香港和印尼均出现次级增量信号；连续经过两地尚无逐票证据，仅用于多节点筛查。" },
      { nodes: ["中国", "马来西亚", "韩国", "印度"], label: "东亚—东盟电池供应网络", basis: "马来西亚、韩国均为报告列示的次级节点；该组合表示需核验的供应网络，不是确认路线。" },
    ],
    routeBoundary: "电池跨国贸易经常包含电芯生产、模组集成和 PACK 组装。第三国出口额只能作为中国成分暴露的上限，不等同于转口额。",
    analysis: [
      "87.2% 的对华来源占比意味着短期替代弹性有限，尤其在锂离子电芯、BMS 和关键材料层面可能高于 HS4 表面值。",
      "越南具备规模和产业能力的双重信号，较香港等纯贸易节点更可能发生实质加工。合规判断应审查 BOM、工序、增值比例和原产地证书。",
    ],
    conclusion: "蓄电池应被列为最高优先级供应安全品类。越南是首要路径节点，但现有证据不足以认定大规模非法转口；企业应按电芯—模组—PACK 三层拆分来源。",
    monitoring: ["电芯、模组、PACK 的 HS8 与料号映射", "越南工厂工序与区域增值比例", "香港、印尼、日本等次级来源的月度异常增量"],
    references: ["研究报告第 6—7 页：HS 8507 路径证据", "OEC 2024 电池双边贸易结构", "Volza HS 8507 对印 shipment 开放摘要"],
  },
  transformers: {
    title: "变压器与电源设备直接依赖分析",
    evidence: "低",
    status: "未见稳定第三国路径",
    executive: "该品类对华来源占比较高，但公开数据主要显示中国直供继续强化，尚不足以对新加坡、阿联酋或其他贸易中枢建立可量化的转口链条。",
    dataPoints: [
      "2025 年印度自中国进口 25.80 亿美元，全球进口 40.88 亿美元，对华来源占比 63.1%。",
      "OEC 显示 2023—2024 年中国是印度该类进口增长最快的来源，增量约 4.06 亿美元。",
      "公开来源未提供可稳定重建“中国—第三国—印度”金额链条或口岸链条的数据。",
    ],
    routes: [],
    routeBoundary: "没有量化路径不代表不存在中转；仅表示当前公开来源无法达到金额、时间和产品口径三项一致的证据标准。",
    analysis: ["变压器、静态变流器和电感器用途差异较大，HS4 汇总值容易掩盖子项差异。", "现阶段风险主要来自中国供货能力和价格竞争力，而不是已被统计识别的第三国分流。"],
    conclusion: "该品类应判定为“直接依赖高、转口证据低”。优先工作是建立 HS6/8 子项与关键设备 BOM 的映射，而非对中转国作确定性排序。",
    monitoring: ["静态变流器与电力变压器分项", "中国来源月度增量", "新加坡、阿联酋等枢纽的异常重开票与仓储分拨"],
    references: ["研究报告第 6—8 页：HS 8504 分析", "OEC 2024 Electrical Transformers 来源结构"],
  },
  semiconductor: {
    title: "半导体器件区域加工与再出口上限分析",
    evidence: "中等偏低",
    status: "东盟加工节点可观察",
    executive: "印度对华半导体器件依赖显著，越南和马来西亚是最值得监测的第三国节点，泰国、台湾地区、日本、韩国和香港构成次级网络；现有数据只能给出区域加工再出口的上限。",
    dataPoints: [
      "2025 年印度自中国进口 39.88 亿美元，全球进口 61.02 亿美元，对华来源占比 65.4%。",
      "OEC 2024 数据显示，印度自中国、越南、泰国进口约 43.6 亿、5.61 亿和 1.72 亿美元。",
      "Volza 可见样本中，越南、马来西亚、日本、台湾地区、泰国和韩国份额约为 12%、8%、7%、6%、4% 和 4%。",
    ],
    routes: [
      { nodes: ["中国", "越南", "印度"], label: "器件制造/组装外溢", basis: "越南在官方来源额和 shipment 来源中均为最大第三国节点。" },
      { nodes: ["中国", "马来西亚", "泰国", "印度"], label: "两级东盟加工网络", basis: "两国均具有器件制造与组装能力；连续两节点为监测假设，尚无逐票闭环。" },
      { nodes: ["中国", "香港", "印度"], label: "贸易与分销节点", basis: "香港为增长较快来源之一，但实体加工与贸易分拨需进一步区分。" },
    ],
    routeBoundary: "第三国进口规模不等于其中全部含中国原产成分。多节点序列用于表达供应链可能跨越两至三个经济体，不代表事实认定。",
    analysis: ["HS 8541 包含二极管、晶体管、光伏电池等差异显著的子类，聚合分析只能反映总体暴露。", "与集成电路相比，该品类的制造和组装外溢更明显，因此应把工序与原产地证明放在金额筛查之前。"],
    conclusion: "半导体器件属于“直接依赖高、区域加工网络存在上限证据”的品类。越南优先级最高，马来西亚次之；其余节点应作为辅助核验对象。",
    monitoring: ["光伏器件与分立器件分项", "越南、马来西亚的实质加工工序", "河内、海防、胡志明及东南亚港口的提单链"],
    references: ["研究报告第 6—7 页：HS 8541 路径分析", "OEC 2024 Semiconductor Devices 来源结构", "Volza HS 8541 shipment/port 开放摘要"],
  },
  amino: {
    title: "含氧氨基化合物直接依赖与转口证据评估",
    evidence: "低",
    status: "无公开量化转口数据",
    executive: "该代理编码对华来源占比高，但公开证据反映的是中国直接供货与美国、沙特、日本、意大利等替代来源并存，未形成可量化的第三国转口链。",
    dataPoints: ["2025 年印度自中国进口 6.21 亿美元，全球进口 8.45 亿美元，对华来源占比 73.6%。", "OEC 可比数据中，中国约 6.90 亿美元，美国 4460 万美元、沙特 3740 万美元、日本 3470 万美元、意大利 3450 万美元。", "网站默认路径筛查未触发信号，公开来源无法给出“中转国—金额—通道”三元组。"],
    routes: [],
    routeBoundary: "替代来源国不是中转国。没有企业级提单、原产地和工序数据时，不将来源重叠推定为转口。",
    analysis: ["HS 2922 是医药原料与精细化工代理口径，不能直接等同于全部 API。", "依赖风险主要来自中国在规模化中间体和成本方面的直接优势，短期替代能力可能低于名义来源国数量所示。"],
    conclusion: "应判定为“直接依赖高、转口证据不足”。后续应下钻至具体化合物、纯度和药用/工业用途。",
    monitoring: ["HS6/8 具体化合物与 CAS 号", "药用与工业用途拆分", "企业级提单及原产地证书"],
    references: ["研究报告第 8 页：医药化工品类", "OEC/UN Comtrade 可比来源国数据"],
  },
  heterocyclic: {
    title: "含氮杂环化合物供应集中与证据边界分析",
    evidence: "低",
    status: "无公开量化转口数据",
    executive: "含氮杂环化合物对华来源占比仅次于蓄电池，现有数据支持中国直接供货优势，但不支持香港、新加坡或阿联酋构成稳定中转通道的结论。",
    dataPoints: ["2025 年印度自中国进口 17.99 亿美元，全球进口 23.50 亿美元，对华来源占比 76.6%。", "OEC 2024 来源中，中国约 5.47 亿美元、意大利 4210 万美元、日本 3280 万美元。", "已检索的官方门户、OEC/UN Comtrade 与开放 shipment 页面均未形成可重建的两段金额链。"],
    routes: [],
    routeBoundary: "该 HS4 覆盖大量药物中间体与精细化学品；产品不完全同质使镜像贸易的路径推断尤其容易产生误判。",
    analysis: ["进口集中度高表明供应链对中国的价格、产能和交付稳定性较敏感。", "意大利、日本等来源更适合作为高端或特定品种的替代参照，不能自动视为中国商品的中转地。"],
    conclusion: "该品类的主要风险是直接来源集中，而非已证实的第三国转口。建议以具体分子、用途和企业供应商为审计单元。",
    monitoring: ["具体药物中间体及 CAS 号", "高端替代来源的产能与交期", "供应商实际生产地与发票地一致性"],
    references: ["研究报告第 8 页：HS 2933 分析", "OEC 2024 Heterocyclic Compounds 来源结构"],
  },
  polymer: {
    title: "聚酯与工程塑料来源结构分析",
    evidence: "低",
    status: "无公开量化转口数据",
    executive: "印度对华依赖处于中等水平，公开资料可见多来源供应，但没有足够数据识别中国经第三国进入印度的金额、港口和占比。",
    dataPoints: ["2025 年印度自中国进口 9.11 亿美元，全球进口 27.02 亿美元，对华来源占比 33.7%。", "报告将该品类与 HS 2933、2922 一并评为“无公开量化转口数据”。", "网站默认两段同步增长筛查未触发路径信号。"],
    routes: [],
    routeBoundary: "工程塑料可能经历改性、配混和制粒等实质加工；在牌号和工艺未知时，不能把第三国出口直接归为转口。",
    analysis: ["33.7% 的来源占比低于医药中间体，但汽车、电子和包装用途对具体牌号认证可能形成更高的实际黏性。", "替代评估应同时比较树脂体系、认证周期、加工性能和长期供货能力。"],
    conclusion: "总体依赖度中等，当前不宜对中转国排序。供应安全重点应放在牌号级替代和终端认证，而非宽口径贸易流猜测。",
    monitoring: ["树脂牌号与改性工序", "汽车/电子客户认证周期", "HS6/8 月度来源异常"],
    references: ["研究报告第 8 页：医药化工品类", "2025 HS4 依赖矩阵"],
  },
  graphite: {
    title: "天然石墨统计口径与出口管制风险分析",
    evidence: "低",
    status: "管制风险高于转口证据",
    executive: "天然石墨对华直接进口金额与占比均不高，但公开资料在“出口是否停止”上存在口径冲突；核心问题是 HS4、HS8 与受控参数是否一致，而不是已证实的绕路补货。",
    dataPoints: ["2025 年印度自中国进口约 378 万美元，全球进口约 4110 万美元，对华来源占比 9.2%。", "基于 UN Comtrade 的公开页面显示，2024 年印度自中国进口约 448 万美元，2025 年约 378 万美元。", "另有研究摘要称管制后相关出口停止，可能仅覆盖天然鳞片石墨或特定参数物项，与 HS 2504 全口径不一致。"],
    routes: [],
    routeBoundary: "报告未发现足以证明经第三国补货的公开序列。任何多国路径判断均需以 HS8、控制编码和企业发票为基础。",
    analysis: ["金额较小不等于风险较低；受控范围取决于纯度、粒径、形态、密度和用途。", "互相冲突的公开数据提示：宽税号与受控物项并非同一分析对象，不能用一个口径替代另一个口径。"],
    conclusion: "天然石墨应判定为“贸易依赖低、定义风险高、转口证据不足”。优先建立受控参数与印度进口子目的精确映射。",
    monitoring: ["HS8 与控制编码对应", "纯度、粒径、形态及最终用途", "企业级发票、许可证与最终用户文件"],
    references: ["研究报告第 9—10 页：HS 2504 分析", "UN Comtrade 2024—2025 公开统计", "中国两用物项出口管制目录"],
  },
  rareearth: {
    title: "稀土化合物供应替代与出口管制分析",
    evidence: "低",
    status: "供应替代风险高",
    executive: "稀土化合物的直接贸易金额较小，但中国在印度来源结构中长期居首，且部分 284690 子目已纳入出口管制；公开数据未证明经贸易中枢大规模转口。",
    dataPoints: ["2025 年印度自中国进口约 491 万美元，全球进口约 1294 万美元，对华来源占比 37.9%。", "印度官方数量表显示，HS 2846 总进口量由 2019—20 年度 1375 吨降至 2023—24 年度 1086 吨。", "中国在 2020—21 至 2023—24 年连续保持主要来源国；日本、韩国、俄罗斯、奥地利、美国等为可观察替代来源。"],
    routes: [
      { nodes: ["中国", "日本", "印度"], label: "替代采购/加工链监测", basis: "日本是可观察替代来源，但公开数据未证明其中包含中国原产成分。" },
      { nodes: ["中国", "韩国", "印度"], label: "替代采购/加工链监测", basis: "韩国同属可观察来源；该路径仅用于前序原产地核验。" },
    ],
    routeBoundary: "两条路径均是风险网络而非转口事实。对于受控物项，技术参数、最终用户和最终用途优先于 HS4 与发票国。",
    analysis: ["政策敏感度远高于金额本身。部分钐、钆、铽、镝、镥、钪、钇相关物项须依法申请出口许可。", "通过第三国采购不当然绕开中国规则，也不当然意味着违法；关键是原产、加工和再出口义务。"],
    conclusion: "稀土化合物的首要风险是管制与许可不确定性，而非已被公开统计识别的转口。采购审计应前移至元素、化合物形态和最终用途。",
    monitoring: ["284690 子目与控制参数", "日本、韩国等来源的前序原产地", "许可证、最终用户与最终用途声明"],
    references: ["研究报告第 9—10 页：HS 2846 分析", "印度 PIB 议会答复数量表", "中国商务部、海关总署 2025 年 4 月公告"],
  },
  pumps: {
    title: "液体泵进口来源与转口证据评估",
    evidence: "低",
    status: "无公开量化转口数据",
    executive: "液体泵对华来源占比约两成，公开资料显示多来源竞争格局，但不足以重建中国经第三国进入印度的金额链和口岸链。",
    dataPoints: ["2025 年印度自中国进口 3.16 亿美元，全球进口 15.73 亿美元，对华来源占比 20.1%。", "报告将 HS 8413 列入无法量化第三国转口的机械类商品。", "德国、美国、日本、意大利为主要替代来源参照，不代表其承担中转功能。"],
    routes: [],
    routeBoundary: "整泵、泵组与零部件可能使用不同税号，公开 HS4 数据无法验证多节点流转。",
    analysis: ["总体来源集中度不高，但特定工业泵、密封件和控制组件可能存在更高的中国依赖。", "供应替代应结合介质、压力、材料和认证要求，不能只比较贸易额。"],
    conclusion: "液体泵属于“总体依赖较低、细分依赖待核验、转口证据不足”的品类。",
    monitoring: ["整泵与零部件拆分", "关键材料和工况参数", "新加坡、阿联酋仓储分拨的企业级提单"],
    references: ["研究报告第 8—9 页：工业机械类分析", "2025 HS4 依赖矩阵"],
  },
  valves: {
    title: "阀门与流体控制件多来源结构分析",
    evidence: "低",
    status: "替代来源清晰、转口链不清晰",
    executive: "阀门进口呈多来源结构，中国是最大单一来源，但德国、美国、日本和意大利均具备显著供给；公开证据不能将这些来源解释为中转国。",
    dataPoints: ["2025 年印度自中国进口 5.81 亿美元，全球进口 24.09 亿美元，对华来源占比 24.1%。", "OEC 2024 数据显示，印度主要来源约为中国 5.29 亿美元、德国 3.32 亿美元、美国 2.52 亿美元、日本 1.49 亿美元、意大利 1.46 亿美元。", "未找到可稳定重建中转额、港口和占比的公开证据链。"],
    routes: [],
    routeBoundary: "多来源竞争不等于多国转口；阀门材质、压力等级和行业认证差异会造成产品不可比。",
    analysis: ["对华依赖度处于低至中等区间，名义替代来源较多。", "高压、耐腐蚀或核级等细分产品的供应集中度可能显著高于 HS4 平均值。"],
    conclusion: "该品类不存在公开可量化的第三国路径，供应策略应按技术等级和认证体系建立替代清单。",
    monitoring: ["压力等级、材质与行业认证", "高端阀门子目来源集中度", "供应商生产地与贸易商发票地"],
    references: ["研究报告第 8 页：HS 8481 来源结构", "OEC 2024 Valves 来源国数据"],
  },
  toolparts: {
    title: "机床零部件维保依赖与路径评估",
    evidence: "低",
    status: "无公开量化转口数据",
    executive: "机床零部件总体对华来源占比约四分之一，德国、日本、意大利和台湾地区可构成替代来源，但公开数据不足以识别多国转口。",
    dataPoints: ["2025 年印度自中国进口 2.14 亿美元，全球进口 8.31 亿美元，对华来源占比 25.8%。", "报告将 HS 8466 列为公开来源只能观察多来源并存、无法重建路径的商品。", "夹具、分度头和专用附件的兼容性可能造成高于贸易占比的维保黏性。"],
    routes: [],
    routeBoundary: "通用贸易额不能替代设备型号、原厂授权与备件序列号层面的来源核验。",
    analysis: ["零部件替代受机床存量、接口和精度要求约束，短期替换难度可能高于金额指标所示。", "贸易中枢的重开票、拼箱和仓储再分拨存在可能，但本报告无法做金额级排序。"],
    conclusion: "机床零部件应按设备平台建立关键备件清单；当前不应对中转国作确定性判断。",
    monitoring: ["设备型号与备件序列号", "原厂授权与实际制造地", "新加坡、阿联酋等枢纽的提单一致性"],
    references: ["研究报告第 8—9 页：工业机械类分析", "2025 HS4 依赖矩阵"],
  },
  machineparts: {
    title: "工程机械零部件高黏性依赖分析",
    evidence: "低",
    status: "直接依赖为主",
    executive: "工程机械零部件对华来源占比超过一半，且五年趋势总体上升；风险主要来自存量设备维保和总成配套黏性，而不是已识别的第三国转口。",
    dataPoints: ["2025 年印度自中国进口 10.64 亿美元，全球进口 19.45 亿美元，对华来源占比 54.7%。", "对华来源占比由 2021 年 40.4% 上升至 2025 年 54.7%。", "公开来源未提供足以重建中国—第三国—印度金额链的路径证据。"],
    routes: [],
    routeBoundary: "HS 8431 覆盖多类起重、装卸、土方和隧道设备零件，宽口径同步增长不构成转口认定。",
    analysis: ["存量中国设备会持续产生原厂或兼容零部件需求，形成售后维保的路径依赖。", "德国、日本、美国、韩国等来源可能提供替代，但兼容性、交期和成本需按设备平台验证。"],
    conclusion: "该品类属于“直接依赖高、维保黏性强、转口证据低”。风险缓释重点是关键备件库存、国产化和多供应商认证。",
    monitoring: ["设备平台与关键备件清单", "原厂/兼容件占比", "售后供应商实际制造地"],
    references: ["研究报告第 8—9 页：HS 8431 分析", "2021—2025 HS4 趋势数据"],
  },
  tunnel: {
    title: "隧道与土方机械代理口径分析",
    evidence: "低",
    status: "直接供应优势为主",
    executive: "HS 8430 对华来源占比接近一半，但该税号并非盾构机专属；公开数据未显示可量化的第三国转口链。",
    dataPoints: ["2025 年印度自中国进口 2.09 亿美元，全球进口 4.27 亿美元，对华来源占比 48.9%。", "2021—2025 年占比在 30.2%—50.9% 区间波动，未呈单向持续上升。", "该商品属于报告列明的“代理编码”和“无公开量化转口数据”品类。"],
    routes: [],
    routeBoundary: "HS 8430 同时覆盖多类土方、采掘和隧道设备，不能将全部贸易额归因于盾构机，也不能据此推断设备经第三国转运。",
    analysis: ["项目型设备贸易容易受单笔大额合同影响，年度波动不宜直接解释为结构变化。", "替代评估需结合设备类型、施工工法、备件体系和服务能力。"],
    conclusion: "当前结论是中国直供竞争力较强，但多国路径未被公开数据证实。应在项目和设备序列号层面核验。",
    monitoring: ["盾构机与其他土方设备拆分", "大额项目合同与交付批次", "设备序列号、制造商与装运港"],
    references: ["研究报告第 8—9 页：HS 8430 分析", "2021—2025 HS4 趋势数据"],
  },
  earthmoving: {
    title: "自推进式工程车辆来源依赖分析",
    evidence: "低",
    status: "无公开量化转口数据",
    executive: "该代理编码对华来源占比为 46.2%，中国直供具有明显价格与产能优势，但现有公开来源无法识别经两国或三国中转的金额链。",
    dataPoints: ["2025 年印度自中国进口 2.21 亿美元，全球进口 4.79 亿美元，对华来源占比 46.2%。", "HS 8429 覆盖推土机、挖掘机、装载机和压路机等，不等同于单一车型。", "日本、韩国、美国、德国为替代供应来源，未被报告认定为中转节点。"],
    routes: [],
    routeBoundary: "整机可能在第三国进行附件加装或本地化配置，但公开 HS4 贸易数据不足以证明连续多节点流转。",
    analysis: ["工程车辆采购具有项目周期和品牌服务网络特征，年度金额容易受大单影响。", "实际依赖需同时考察整机、发动机、液压系统、电子控制和售后零件。"],
    conclusion: "应判定为“中高直接依赖、转口证据不足”。替代策略应从车型与关键总成层面展开。",
    monitoring: ["车型与关键总成拆分", "项目采购和融资来源", "制造地、加装地与最终装运地"],
    references: ["研究报告第 8—9 页：HS 8429 分析", "2025 HS4 依赖矩阵"],
  },
  autoparts: {
    title: "机动车零部件多来源供应与路径评估",
    evidence: "低",
    status: "多来源并存、转口证据不足",
    executive: "机动车零部件对华来源占比约四分之一，德国、日本、韩国、美国等来源共同供给；公开数据未形成可量化的第三国转口路径。",
    dataPoints: ["2025 年印度自中国进口 17.54 亿美元，全球进口 68.00 亿美元，对华来源占比 25.8%。", "印度官方议会答复将汽车零部件列为对华进口结构中的关键中间品。", "报告检索未能稳定重建中转额、港口和占比。"],
    routes: [],
    routeBoundary: "HS 8708 覆盖电驱、底盘、车身与安全系统等大量子类，供应商国别与零件原产地必须分开判断。",
    analysis: ["总体依赖度不高，但电驱、电控和特定电子零件可能存在显著的中国成分暴露。", "印度本地装配与跨国车企供应体系会产生多国采购，不应将区域分工自动视为转口。"],
    conclusion: "该品类的风险集中在关键子系统而非 HS4 总量。建议按车型、一级供应商和 BOM 层级开展原产地审计。",
    monitoring: ["电驱、电控、底盘和安全系统拆分", "一级供应商及 BOM 原产地", "区域装配与 FTA 原产地合规"],
    references: ["研究报告第 8—9 页：HS 8708 分析", "印度议会答复 4023/2025"],
  },
};

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

const reportAccuracyById: Record<string,{level:AccuracyLevel;reason:string}> = {
  ic: { level:"低概率", reason:"直接进口依赖有数据支撑，但多节点网络排序仍缺少逐票货物流闭环。" },
  battery: { level:"低概率", reason:"高集中度结论明确；越南及其他路径节点的优先级仍需 BOM、工序与原产地单证验证。" },
  semiconductor: { level:"低概率", reason:"直接依赖可复核，但东盟加工节点与中国投入之间尚未形成货物级对应。" },
  graphite: { level:"推测", reason:"HS4 无法识别纯度、粒径和形态等受控参数，需以产品规格与许可证材料复核。" },
  rareearth: { level:"推测", reason:"宽税号无法区分具体元素、化合物形态与最终用途，当前仅作风险假设。" },
  tunnel: { level:"推测", reason:"HS 8430 是盾构及隧道设备的代理口径，不能替代设备型号和项目级业务数据。" },
};

const defaultReportAccuracy = { level:"高概率", reason:"结论主要基于可复核的 HS4 进口规模、来源占比和审慎的证据边界表述。" } as const;

const formatMonthlyValue = (value:number|null) => value === null ? "—" : value.toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2});

function MonthlyTrend({points}:{points:MonthlyTradePoint[]}) {
  const [metric,setMetric] = useState<"value"|"share">("value");
  const available = points.filter(point=>point.status==="available" && point.world!==null);
  const latest = available.at(-1);
  const width = 720;
  const height = 270;
  const plot = { left:56, right:18, top:24, bottom:45 };
  const plotWidth = width-plot.left-plot.right;
  const plotHeight = height-plot.top-plot.bottom;
  const maxValue = metric==="share" ? 100 : Math.max(1,...available.flatMap(point=>[point.china??0,point.world??0]));
  const x = (index:number) => plot.left+(points.length===1?0:index/(points.length-1)*plotWidth);
  const y = (value:number) => plot.top+plotHeight-(value/maxValue)*plotHeight;
  const pathFor = (key:"china"|"world"|"share") => points.map((point,index)=>({value:point[key],index})).filter(item=>item.value!==null).map((item,index)=>`${index===0?"M":"L"}${x(item.index).toFixed(1)},${y(item.value as number).toFixed(1)}`).join(" ");
  const pendingIndex = points.findIndex(point=>point.status==="pending");
  const gridValues = metric==="share" ? [0,25,50,75,100] : [0,.25,.5,.75,1].map(ratio=>maxValue*ratio);

  return <div className="monthly-module">
    <div className="monthly-summary">
      <div><span>最新可用月份</span><strong>{latest?.period??"待发布"}</strong></div>
      <div><span>自中国进口</span><strong>{latest?`$${formatMonthlyValue(latest.china)}M`:"—"}</strong></div>
      <div><span>全球进口</span><strong>{latest?`$${formatMonthlyValue(latest.world)}M`:"—"}</strong></div>
      <div><span>对华来源占比</span><strong>{latest?.share===null||latest?.share===undefined?"—":`${latest.share.toFixed(1)}%`}</strong></div>
    </div>
    <div className="monthly-toolbar">
      <div className="monthly-toggle" aria-label="趋势图指标">
        <button className={metric==="value"?"active":""} onClick={()=>setMetric("value")}>进口额</button>
        <button className={metric==="share"?"active":""} onClick={()=>setMetric("share")}>对华占比</button>
      </div>
      <span>单位：{metric==="value"?"US$ million":"%"}</span>
    </div>
    <div className="monthly-chart-wrap">
      <svg className="monthly-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`2024年12月至2026年6月${metric==="value"?"进口额":"对华占比"}趋势图`}>
        {pendingIndex>=0&&<rect className="pending-zone" x={Math.max(plot.left,x(pendingIndex)-12)} y={plot.top} width={width-Math.max(plot.left,x(pendingIndex)-12)-plot.right} height={plotHeight}/>}
        {gridValues.map(value=><g key={value}><line className="chart-grid" x1={plot.left} x2={width-plot.right} y1={y(value)} y2={y(value)}/><text className="chart-y-label" x={plot.left-10} y={y(value)+4} textAnchor="end">{metric==="share"?`${value.toFixed(0)}%`:value.toFixed(maxValue<10?1:0)}</text></g>)}
        {metric==="value"?<><path className="monthly-line world" d={pathFor("world")}/><path className="monthly-line china" d={pathFor("china")}/></>:<path className="monthly-line share" d={pathFor("share")}/>}
        {points.map((point,index)=>(index%3===0||index===points.length-1)?<text className="chart-x-label" key={point.period} x={x(index)} y={height-14} textAnchor={index===0?"start":index===points.length-1?"end":"middle"}>{point.period}</text>:null)}
        {pendingIndex>=0&&<text className="pending-label" x={(x(pendingIndex)+width-plot.right)/2} y={plot.top+42} textAnchor="middle">待发布 / 待核验</text>}
      </svg>
      <div className="monthly-legend">{metric==="value"?<><span><i className="legend-world"/>全球进口</span><span><i className="legend-china"/>自中国进口</span></>:<span><i className="legend-share"/>对华来源占比</span>}</div>
    </div>
    <div className="monthly-table-wrap">
      <table className="monthly-table">
        <thead><tr><th>月份</th><th>自中国进口</th><th>全球进口</th><th>对华占比</th><th>状态</th></tr></thead>
        <tbody>{points.map(point=><tr key={point.period} className={point.status==="pending"?"pending":""}><td>{point.period}</td><td>{point.china===null?"—":`$${formatMonthlyValue(point.china)}M`}</td><td>{point.world===null?"—":`$${formatMonthlyValue(point.world)}M`}</td><td>{point.share===null?"—":`${point.share.toFixed(1)}%`}</td><td>{point.status==="available"?"已发布":"待发布/核验"}</td></tr>)}</tbody>
      </table>
    </div>
    <p className="monthly-note">月度序列来源：<a href={MONTHLY_SOURCE_URL} target="_blank" rel="noreferrer">{MONTHLY_SOURCE_LABEL}</a>，访问 {MONTHLY_SOURCE_ACCESSED}。印度 TradeStat 声明已更新至 2026-05，但本快照仅展示可由 UN Comtrade API 逐月复核的数值；其余月份不作估算。</p>
  </div>;
}

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
  const selectedReport = selected ? commodityReports[selected.id] : null;
  const selectedMonthly = selected ? monthlyTradeById[selected.id]??[] : [];
  const selectedAccuracy = selectedReport && selected ? reportAccuracyById[selected.id]??defaultReportAccuracy : null;

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
        <h1>中国-印度<br/><em>供应链依赖图谱</em></h1>
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
      <div className="section-heading"><div><p>DEPENDENCY MATRIX / 2025</p><h2>重点商品依赖矩阵</h2></div><p>基于 2025 完整自然年、统一 HS4 口径。点击任一商品查看包含数据、路径分析、专业判断与结论的专项报告。</p></div>
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

    {selected&&selectedReport&&<div className="drawer-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setSelected(null)}}>
      <aside className="detail-drawer" role="dialog" aria-modal="true" aria-labelledby="drawer-title">
        <button className="drawer-close" onClick={()=>setSelected(null)} aria-label="关闭详情">×</button>
        <p className="eyebrow">COMMODITY REPORT / {REPORT_DATE}</p>
        <h2 id="drawer-title">{selected.name}</h2>
        <p className="drawer-english">{selected.english}</p>
        <div className="drawer-tags"><code>HS {selected.hs}</code><span>{selected.category}</span>{selected.proxy&&<span>代理编码</span>}{selected.controlled&&<span className="risk">管制筛查</span>}</div>
        <div className="report-status"><span className={`evidence-level evidence-${selectedReport.evidence.replace("中等偏低","medium-low").replace("中等","medium").replace("低","low")}`}>证据等级 · {selectedReport.evidence}</span><span>{selectedReport.status}</span></div>
        <div className="drawer-report-cover"><small>专项分析报告</small><h3>{selectedReport.title}</h3><p>{selectedReport.executive}</p></div>
        <div className="drawer-metrics"><div><span>印度自中国进口</span><strong>{formatB(selected.completeYear.china)}</strong></div><div><span>印度全球进口</span><strong>{formatB(selected.completeYear.world)}</strong></div><div><span>对华来源占比</span><strong>{selected.completeYear.share.toFixed(1)}%</strong></div></div>
        <a className="drawer-source" href={COMTRADE} target="_blank" rel="noreferrer">UN Comtrade · 2025 · HS 2017 · 访问 {selected.accessedAt} ↗</a>

        <section>
          <div className="drawer-section-title"><h3>一、数据事实</h3><span>完整年主口径</span></div>
          <ol className="report-facts">{selectedReport.dataPoints.map((point,index)=><li key={point}><span>{String(index+1).padStart(2,"0")}</span><p>{point}</p></li>)}</ol>
        </section>

        <section>
          <div className="drawer-section-title"><h3>二、第三国路径与多节点网络</h3><span>筛查用途 · 非事实认定</span></div>
          {selectedReport.routes.length>0?<div className="route-network-list">{selectedReport.routes.map((route,index)=><article className="route-network" key={`${route.label}-${index}`}><div className="route-network-head"><span>PATH {String(index+1).padStart(2,"0")}</span><strong>{route.label}</strong></div><div className="route-nodes">{route.nodes.map((node,nodeIndex)=><span key={`${node}-${nodeIndex}`}><b className={nodeIndex===0?"origin":nodeIndex===route.nodes.length-1?"destination":"transit"}>{node}</b>{nodeIndex<route.nodes.length-1&&<i>→</i>}</span>)}</div><p>{route.basis}</p></article>)}</div>:<div className="no-route-report"><span>∅</span><div><strong>无公开量化转口路径</strong><p>现有来源未形成可复核的“中国—第三国—印度”金额、时间与产品口径闭环，因此不虚构中转国排序。</p></div></div>}
          <p className="route-boundary"><strong>判读边界：</strong>{selectedReport.routeBoundary}</p>
        </section>

        <section>
          <h3>三、分析</h3>
          <div className="report-analysis">{selectedReport.analysis.map(paragraph=><p key={paragraph}>{paragraph}</p>)}</div>
        </section>

        <section className="report-conclusion">
          <div className="conclusion-heading"><div><span>CONCLUSION</span><h3>四、结论</h3></div>{selectedAccuracy&&<strong className={`accuracy ${selectedAccuracy.level==="高概率"?"accuracy-high":selectedAccuracy.level==="低概率"?"accuracy-low":"accuracy-inference"}`}>准确度 · {selectedAccuracy.level}</strong>}</div>
          <p>{selectedReport.conclusion}</p>
          {selectedAccuracy&&<small className="accuracy-reason">判定依据：{selectedAccuracy.reason}</small>}
        </section>

        <section>
          <h3>五、后续监测重点</h3>
          <div className="monitor-grid">{selectedReport.monitoring.map((item,index)=><div key={item}><span>0{index+1}</span><p>{item}</p></div>)}</div>
        </section>

        <section><h3>商品定义与口径</h3><p>{selected.definition}</p></section>
        <section><div className="drawer-section-title"><h3>月度数据与趋势</h3><span>2024-12—2026-06 · HS4</span></div><MonthlyTrend points={selectedMonthly}/></section>
        <section><div className="drawer-section-title"><h3>五年趋势</h3><span>2021—2025 · 对华来源占比</span></div>{selected.trend?<div className="trend-chart">{selected.trend.map(point=><div className="trend-year" key={point.year}><span>{point.share.toFixed(1)}%</span><div><i style={{height:`${Math.max(6,point.share)}%`}}/></div><small>{point.year}</small></div>)}</div>:<div className="trend-unavailable"><strong>未跨期合并</strong><p>该商品未完成可靠的五年编码对照，因此仅展示 2025 完整年。</p></div>}</section>
        <section><h3>主要替代供应国</h3><div className="alternatives">{selected.alternatives.map(country=><span key={country}>{country}</span>)}</div><p>按可比双边数据识别，表示其他来源，不代表短期内具备等量替代能力，也不自动构成中转国。</p></section>
        <section className="report-references"><h3>证据来源</h3><ul>{selectedReport.references.map(reference=><li key={reference}>{reference}</li>)}</ul><p>报告研究日期：{REPORT_DATE}。路径证据用于风险筛查，不构成违法转口、规避关税或规避管制的认定。</p></section>
        <section className="pulse-box"><h3>2026 最新脉冲</h3><p>TradeStat 已发布 2026 年 1—5 月数据；该 HS4 细项处于复核队列，本快照不以缺失值推算或替代完整年度数值。</p><a href={TRADESTAT} target="_blank" rel="noreferrer">India TradeStat · 更新 2026-07-15 ↗</a></section>
        {selected.controlled&&<section className="control-box"><h3>{selected.controlled}</h3><p>参考 HS 只能用于初筛；是否受控仍取决于技术参数、最终用户、最终用途与当前有效政策。</p><a href={CONTROL_CATALOG} target="_blank" rel="noreferrer">核对 2026 年许可证管理目录 ↗</a></section>}
        <p className="fineprint">数据单位为现价美元；数值经过十亿美元换算和显示舍入，比例使用未舍入值计算。报告结论基于公开来源，须结合 HS6/8、BOM、原产地与企业级单证复核。</p>
      </aside>
    </div>}
  </main>;
}
