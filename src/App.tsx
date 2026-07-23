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
  hs8?: string;
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
  searchTerms?: string;
  children?: string[];
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

const SNAPSHOT_DATE = "2026-07-23";
const REPORT_DATE = "2026-07-23";
const CURRENT_HS_VERSION = "HS 2022";
const CROSSWALK_HS_VERSION = "HS 2017→2022 对照";
const COMTRADE = "https://uncomtrade.org/docs/un-comtrade-api/";
const TRADESTAT = "https://tradestat.commerce.gov.in/meidb/commodity_wise_all_countries_import";
const TIA = "https://trade-analytics.commerce.gov.in/public";
const CONTROL_RULE = "https://xzfg.moj.gov.cn/front/law/detail?LawID=1735&Query=";
const CONTROL_CATALOG = "https://exportcontrol.mofcom.gov.cn/article/hgfw/lywxcx/gzqd/202601/1203.html";

const categories: Category[] = ["全部", "原材料", "医药化工", "电子与电力", "工业机械", "工程设备", "车辆零部件"];
const pulse = { period: "2026-01—05", china: null, world: null, share: null, completeness: "已发布，待 HS4 复核", source: "India TradeStat" } as const;
const annual = (china: number, world: number) => ({ period: "2025", china, world, share: china / world * 100, source: "UN Comtrade" } as const);
const toHs8 = (code: string) => code.split("/").map(part => part.padEnd(8, "0")).join("/");
const hs8Of = (item: Pick<CommodityRecord, "hs" | "hs8">) => item.hs8 ?? toHs8(item.hs);
const statLevelOf = (item: CommodityRecord) => item.id === "fertilizer" ? "统计口径 HS31" : item.children ? "统计口径 HS6 合并" : item.hs.length <= 4 ? "统计口径 HS4" : item.hs.includes("/") ? "统计口径 HS6 合并" : "统计口径 HS6";
const reportHref = (id: string) => `${import.meta.env.BASE_URL}reports/${id}.docx`;

const commodities: CommodityRecord[] = [
  { id: "ic", hs: "8542", name: "集成电路", english: "Electronic integrated circuits", category: "电子与电力", completeYear: annual(11.7102, 28.6165), latestPulse: pulse, alternatives: ["中国台湾", "韩国", "日本", "马来西亚"], definition: "处理器、存储器、放大器等宽口径品类；具体用途需下钻至 HS6/8。", sourcePublished: "2026-07", accessedAt: SNAPSHOT_DATE, trend: [{year:"2021",china:4.53,world:12.39,share:36.5},{year:"2022",china:5.06,world:16.12,share:31.4},{year:"2023",china:10.06,world:19.22,share:52.4},{year:"2024",china:10.54,world:23.45,share:45.0},{year:"2025",china:11.7102,world:28.6165,share:40.9}] },
  { id: "battery", hs: "8507", name: "蓄电池", english: "Electric accumulators", category: "电子与电力", completeYear: annual(4.3131, 4.9470), latestPulse: pulse, alternatives: ["越南", "日本", "韩国", "马来西亚"], definition: "覆盖锂离子及其他蓄电池；高占比反映进口来源集中，不等于国内消费完全依赖进口。", sourcePublished: "2026-07", accessedAt: SNAPSHOT_DATE, trend: [{year:"2021",china:1.22,world:2.09,share:58.3},{year:"2022",china:2.25,world:3.22,share:69.7},{year:"2023",china:3.11,world:3.82,share:81.4},{year:"2024",china:2.89,world:3.50,share:82.5},{year:"2025",china:4.3131,world:4.9470,share:87.2}] },
  { id: "transformers", hs: "8504", name: "变压器与电源设备", english: "Transformers and static converters", category: "电子与电力", completeYear: annual(2.5802, 4.0884), latestPulse: pulse, alternatives: ["德国", "日本", "韩国", "美国"], definition: "含变压器、静态变流器及电感器，是电网、工业自动化与消费电子的共同投入。", sourcePublished: "2026-07", accessedAt: SNAPSHOT_DATE },
  { id: "semiconductor", hs: "8541", name: "半导体器件", english: "Semiconductor devices", category: "电子与电力", completeYear: annual(3.9884, 6.1024), latestPulse: pulse, alternatives: ["越南", "马来西亚", "日本", "中国台湾"], definition: "包括二极管、晶体管、光伏电池等；不同子项的产业含义差异显著。", sourcePublished: "2026-07", accessedAt: SNAPSHOT_DATE },
  { id: "fertilizer", hs: "31", name: "化肥", english: "Fertilizers", category: "医药化工", completeYear: annual(2.160695784, 14.171272537), latestPulse: pulse, alternatives: ["俄罗斯", "沙特阿拉伯", "摩洛哥", "阿曼", "加拿大"], definition: "HS 31 化肥总项；详情下钻至尿素、磷酸二铵（DAP）、氯化钾（MOP）与 NPK 四个 HS6 子项。总项用于观察整体来源暴露，不能替代分品类判断。", sourcePublished: "2026-07", accessedAt: "2026-07-23", searchTerms: "尿素 DAP 磷酸二铵 MOP 氯化钾 NPK 310210 310530 310420 310520", children: ["fertilizer_urea","fertilizer_dap","fertilizer_mop","fertilizer_npk"], trend: [{year:"2021",china:2.6875,world:9.1168,share:29.5},{year:"2022",china:2.3375,world:17.2598,share:13.5},{year:"2023",china:2.6069,world:10.4229,share:25.0},{year:"2024",china:0.8541,world:7.7090,share:11.1},{year:"2025",china:2.1607,world:14.1713,share:15.2}] },
  { id: "polymer", hs: "3907", name: "聚酯与工程塑料", english: "Polyacetals, polyethers and polyesters", category: "医药化工", completeYear: annual(0.9113, 2.7016), latestPulse: pulse, alternatives: ["韩国", "新加坡", "泰国", "日本"], definition: "用于汽车、电子、包装和工业零部件的基础材料。", sourcePublished: "2026-07", accessedAt: SNAPSHOT_DATE },
  { id: "graphite", hs: "2504", name: "天然石墨", english: "Natural graphite", category: "原材料", completeYear: annual(0.00378, 0.04108), latestPulse: pulse, alternatives: ["马达加斯加", "莫桑比克", "坦桑尼亚", "巴西"], definition: "HS4 为天然石墨宽口径；是否受控仍取决于纯度、粒度、形态等技术参数。", sourcePublished: "2026-07", accessedAt: SNAPSHOT_DATE, controlled: "部分石墨相关物项受控" },
  { id: "rareearth", hs: "2846", name: "稀土化合物", english: "Compounds of rare-earth metals", category: "原材料", completeYear: annual(0.00491, 0.01294), latestPulse: pulse, alternatives: ["日本", "韩国", "俄罗斯", "奥地利", "美国"], definition: "贸易税号仅作初筛；中重稀土物项须按管制清单与参数逐项核验。", sourcePublished: "2026-07", accessedAt: SNAPSHOT_DATE, controlled: "部分中重稀土物项受控" },
  { id: "pumps", hs: "8413", name: "液体泵", english: "Pumps for liquids", category: "工业机械", completeYear: annual(0.3156, 1.5732), latestPulse: pulse, alternatives: ["德国", "美国", "日本", "意大利"], definition: "覆盖工业、工程、水务与车辆用泵；零部件依赖可能高于整机口径。", sourcePublished: "2026-07", accessedAt: SNAPSHOT_DATE },
  { id: "valves", hs: "8481", name: "阀门与流体控制件", english: "Taps, cocks and valves", category: "工业机械", completeYear: annual(0.5806, 2.4093), latestPulse: pulse, alternatives: ["德国", "美国", "意大利", "日本"], definition: "用于能源、化工、工程机械及工厂自动化。", sourcePublished: "2026-07", accessedAt: SNAPSHOT_DATE },
  { id: "toolparts", hs: "8466", name: "机床零部件", english: "Parts and accessories for machine-tools", category: "工业机械", completeYear: annual(0.2140, 0.8307), latestPulse: pulse, alternatives: ["德国", "日本", "意大利", "中国台湾"], definition: "包括夹具、分度头和专用附件，是制造设备维护的重要投入。", sourcePublished: "2026-07", accessedAt: SNAPSHOT_DATE },
  { id: "machineparts", hs: "8431", name: "工程机械零部件", english: "Parts for machinery of headings 8425–8430", category: "工程设备", completeYear: annual(1.0636, 1.9446), latestPulse: pulse, alternatives: ["德国", "日本", "美国", "韩国"], definition: "覆盖起重、装卸、土方和隧道设备零件，比整机口径更能反映存量设备维保黏性。", sourcePublished: "2026-07", accessedAt: SNAPSHOT_DATE, trend: [{year:"2021",china:0.63,world:1.56,share:40.4},{year:"2022",china:0.69,world:1.53,share:44.9},{year:"2023",china:0.82,world:1.66,share:49.3},{year:"2024",china:0.94,world:1.76,share:53.1},{year:"2025",china:1.0636,world:1.9446,share:54.7}] },
  { id: "tunnel", hs: "843031/843039", name: "盾构机", english: "Tunnel boring machines", category: "工程设备", completeYear: annual(0.042488353, 0.108409376), latestPulse: pulse, alternatives: ["欧盟", "芬兰", "美国", "新加坡", "南非"], definition: "土压平衡盾构机、泥水平衡盾构机与硬岩 TBM 的项目级观察项。HS 843031 与 843039 同时混入采煤机、截岩机和其他掘进设备，只能作为整机贸易筛查池，不能把合计金额等同于盾构机成交额或台数。", sourcePublished: "2026-07", accessedAt: SNAPSHOT_DATE, proxy: true, searchTerms: "盾构 TBM 隧道掘进机 土压平衡 泥水平衡 硬岩 843031 843039", children: ["tunnel_843031","tunnel_843039"] },
  { id: "earthmoving", hs: "870410/870510/870540", name: "工程车", english: "Special-purpose construction vehicles", category: "工程设备", completeYear: annual(0.022815544, 0.059909220), latestPulse: pulse, alternatives: ["德国", "日本", "美国", "芬兰", "印度尼西亚"], definition: "工程车整车筛查项，合并非公路用自卸车、汽车起重机和混凝土搅拌车三个 HS6 子项。未纳入混合消防、医疗等多类专用车辆的 HS 870590，也不包含一般挖掘机、装载机或零部件。", sourcePublished: "2026-07", accessedAt: SNAPSHOT_DATE, searchTerms: "工程车 矿用自卸车 汽车起重机 混凝土搅拌车 870410 870510 870540", children: ["earthmoving_dumptruck","earthmoving_crane","earthmoving_mixer"] },
  { id: "autoparts", hs: "8708", name: "机动车零部件", english: "Parts and accessories of motor vehicles", category: "车辆零部件", completeYear: annual(1.7536, 6.8000), latestPulse: pulse, alternatives: ["德国", "日本", "韩国", "美国"], definition: "宽口径汽车零部件组；电驱、底盘、车身与安全系统需在 HS6/8 层级进一步区分。", sourcePublished: "2026-07", accessedAt: SNAPSHOT_DATE },
];

const fertilizerSubitems: CommodityRecord[] = [
  { id: "fertilizer_urea", hs: "310210", name: "尿素", english: "Urea", category: "医药化工", completeYear: annual(0.878822312, 4.694018868), latestPulse: pulse, alternatives: ["阿曼", "俄罗斯", "卡塔尔", "沙特阿拉伯", "阿联酋"], definition: "HS 310210 尿素。贸易价值使用自然年，印度化肥部国别数量使用财政年度；两个时间窗口必须分开阅读。", sourcePublished: "2026-07", accessedAt: "2026-07-23" },
  { id: "fertilizer_dap", hs: "310530", name: "磷酸二铵（DAP）", english: "Diammonium phosphate", category: "医药化工", completeYear: annual(0.450036058, 4.909200456), latestPulse: pulse, alternatives: ["沙特阿拉伯", "摩洛哥", "俄罗斯", "约旦"], definition: "HS 310530 磷酸氢二铵（DAP）。该品类对中国出口政策和印度采购节奏敏感，年度份额波动较大。", sourcePublished: "2026-07", accessedAt: "2026-07-23" },
  { id: "fertilizer_mop", hs: "310420", name: "氯化钾（MOP）", english: "Potassium chloride", category: "医药化工", completeYear: annual(0.000025641, 1.251671655), latestPulse: pulse, alternatives: ["俄罗斯", "加拿大", "约旦", "白俄罗斯"], definition: "HS 310420 氯化钾（MOP）。印度几乎完全依赖进口，但中国在该品类中不是关键直接来源。", sourcePublished: "2026-07", accessedAt: "2026-07-23" },
  { id: "fertilizer_npk", hs: "310520", name: "NPK 复合肥", english: "NPK fertilizers", category: "医药化工", completeYear: annual(0.009068417, 1.209994350), latestPulse: pulse, alternatives: ["沙特阿拉伯", "俄罗斯", "摩洛哥", "约旦"], definition: "HS 310520 为含氮、磷、钾三种肥效元素的矿物或化学肥料。印度官方 NPK/NPKS 财年统计可能覆盖更宽子目，与 HS 310520 价值口径不能直接互换。", sourcePublished: "2026-07", accessedAt: "2026-07-23", proxy: true },
];

const tunnelSubitems: CommodityRecord[] = [
  { id: "tunnel_843031", hs: "843031", name: "自推进掘进机筛查池", english: "Self-propelled tunnelling machinery screening pool", category: "工程设备", completeYear: annual(0.040596479, 0.102945050), latestPulse: pulse, alternatives: ["欧盟", "芬兰", "美国", "新加坡", "南非"], definition: "HS 843031 为自推进的采煤机、截岩机及隧道掘进机械筛查池，包含但不专属于盾构机或 TBM。金额只能反映宽口径来源结构，不能直接换算整机台数。", sourcePublished: "2026-07", accessedAt: SNAPSHOT_DATE, proxy: true },
  { id: "tunnel_843039", hs: "843039", name: "其他掘进设备筛查池", english: "Other tunnelling machinery screening pool", category: "工程设备", completeYear: annual(0.001891874, 0.005464327), latestPulse: pulse, alternatives: ["新加坡", "德国", "美国", "芬兰"], definition: "HS 843039 为其他非自推进采煤机、截岩机及隧道掘进机械筛查池。报告所示数量与价值明显不匹配，作为盾构机代理的杂质较高，只用于发现异常线索。", sourcePublished: "2026-07", accessedAt: SNAPSHOT_DATE, proxy: true },
];

const earthmovingSubitems: CommodityRecord[] = [
  { id: "earthmoving_dumptruck", hs: "870410", name: "非公路用自卸车", english: "Off-highway dump trucks", category: "工程设备", completeYear: annual(0.022185146, 0.057239066), latestPulse: pulse, alternatives: ["印度尼西亚", "德国", "日本", "美国"], definition: "HS 870410 为非公路用自卸车，主要包括矿山、采石场等封闭场景使用的整车；不包含一般道路货车和零部件。", sourcePublished: "2026-07", accessedAt: SNAPSHOT_DATE },
  { id: "earthmoving_crane", hs: "870510", name: "汽车起重机", english: "Mobile cranes", category: "工程设备", completeYear: annual(0.000400126, 0.000606105), latestPulse: pulse, alternatives: ["德国", "日本", "美国", "芬兰"], definition: "HS 870510 为装在汽车底盘上的起重机整车。印度进口申报与中国出口镜像金额存在巨大差异，必须分开列示，不能互相替代。", sourcePublished: "2026-07", accessedAt: SNAPSHOT_DATE },
  { id: "earthmoving_mixer", hs: "870540", name: "混凝土搅拌车", english: "Concrete mixer trucks", category: "工程设备", completeYear: annual(0.000230272, 0.002064049), latestPulse: pulse, alternatives: ["德国", "日本", "韩国", "意大利"], definition: "HS 870540 为混凝土搅拌运输车整车。公开贸易规模小、订单稀疏，单月或单年波动可能主要由少数车辆交付造成。", sourcePublished: "2026-07", accessedAt: SNAPSHOT_DATE },
];

const commoditySubitemsByParent: Record<string,CommodityRecord[]> = {
  fertilizer: fertilizerSubitems,
  tunnel: tunnelSubitems,
  earthmoving: earthmovingSubitems,
};
const allCommodityRecords = [...commodities, ...fertilizerSubitems, ...tunnelSubitems, ...earthmovingSubitems];
const fertilizerFocusIds = ["fertilizer", "fertilizer_urea", "fertilizer_dap", "fertilizer_mop", "fertilizer_npk"];

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
  fertilizer: {
    title: "印度化肥对华结构性依赖与第三国路径分析",
    evidence: "中等",
    status: "直接贸易为主 · 分品类管理",
    executive: "印度对中国化肥的依赖并非覆盖全部品类，而是集中在阶段性尿素、DAP 与部分 NPK。2025 年 HS31 总项自中国进口约 21.61 亿美元，占印度化肥进口额约 15.2%；官方财年数量同样显示份额大幅波动。公开证据不支持大规模第三国再出口已成为主导模式。",
    dataPoints: [
      "UN Comtrade 显示，2025 年印度化肥总进口约 141.71 亿美元，其中自中国约 21.61 亿美元，对华来源占比 15.2%。",
      "印度化肥部附件显示，四类主要化肥自中国直接进口量合计占比由 2023-24 财年的 23.3% 降至 2024-25 的 6.4%，2025-26 截至 2026 年 2 月回升至 16.3%。",
      "印度 DGCI&S 对 2021-22 年 4—2 月的官方样本显示，中国原产化肥 99.9% 直接自中国装运，原产国为中国但经其他国家装运仅 0.1%。",
    ],
    routes: [
      { nodes: ["中国", "越南", "印度"], label: "尿素路径 · 个别批次存在可能", basis: "2023 年中国对越南出口尿素 7790.58 万千克，越南对印度出口 4704.10 万千克；越南同时从多个国家进口，数据只能支持弱到中等的路径可能性。" },
      { nodes: ["中国", "新加坡/科伦坡/杰贝阿里", "印度"], label: "海运换船 · 物流中转", basis: "这些港口是南亚常见换船节点，但物流中转不等于货物以第三国原产或第三国出口身份进入印度。" },
      { nodes: ["中国", "阿联酋", "印度"], label: "尿素路径 · 强反证", basis: "2024 年印度自阿联酋进口尿素 5.81892 亿千克，而中国对阿联酋仅出口 22.488 万千克，数量级不支持大规模中国转口。" },
    ],
    routeBoundary: "路径卡片同时呈现可能路线、物流中转和反证路线。它们用于说明证据强弱，不代表逐票货物依次经过全部节点；海运换船也不会自动改变原产地。",
    analysis: [
      "总项占比会掩盖品类差异：尿素和 DAP 受中国出口窗口、印度招标及价格影响最明显；MOP 的关键来源主要在俄罗斯、加拿大等非中国供应国；NPK 还存在统计子目差异。",
      "真正的系统性风险是“供给国切换、出口政策和物流咽喉”叠加。印度虽已通过沙特长期协议、海湾采购和库存缓冲进行对冲，但红海及霍尔木兹海峡扰动仍可能迅速推高运费与补贴压力。",
      "第三国监测应比较同一 HS6、同一时间窗口的中国→第三国和第三国→印度数量，并结合原产地、装运国和企业级提单；仅凭第三国来源标签不能认定转口。",
    ],
    conclusion: "印度对中国化肥存在结构性、阶段性依赖，但不存在“所有化肥统一依赖中国”的事实基础。近五年公开证据显示直接贸易仍是主体，大规模第三国再出口不是主导模式；应按尿素、DAP、MOP、NPK 分项管理，并把出口政策和海运咽喉列为高优先级风险。",
    monitoring: ["四类化肥的月度 HS6 价值、数量与对华份额", "中国出口检验、配额与磷肥外销窗口", "越南、阿联酋及海湾节点的镜像数量与原产地单证", "红海—霍尔木兹—印度港口的到港和库存节奏"],
    references: ["《印度对中国化肥依赖及第三国转口情况分析报告》执行摘要及进口依赖总表", "印度化肥部 Lok Sabha UQ 2527、UQ 5699 附件", "印度 DGCI&S：中国对印直接或经其他国家出口专题（2021-22 年 4—2 月）", "UN Comtrade / WITS：HS31 与 HS6 双边贸易记录"],
  },
  fertilizer_urea: {
    title: "尿素对华依赖波动与越南路径核验",
    evidence: "中等",
    status: "直接份额快速回升",
    executive: "尿素对华依赖在 2024-25 财年降至低位后，于 2025-26 前 11 个月明显回升。2025 自然年价值口径下中国占印度尿素进口约 18.7%；第三国路线中，阿联酋存在强反证，越南仅能支持个别批次的可能性。",
    dataPoints: ["2025 年印度自中国进口尿素约 8.79 亿美元，全球进口约 46.94 亿美元，对华来源占比 18.7%。", "印度官方数量显示，中国份额由 2023-24 财年的 26.5%降至 2024-25 的 1.8%，2025-26 截至 2026 年 2 月回升到 21.7%。", "2024 年印度自阿联酋进口尿素 5.81892 亿千克，而中国对阿联酋出口仅 22.488 万千克，基本排除该批量主要来自中国再出口。"],
    routes: [
      { nodes: ["中国", "越南", "印度"], label: "越南路径 · 弱到中等证据", basis: "2023 年两段数量具备理论承接空间，但越南尿素来源包括文莱、印尼、马来西亚和中国，无法证明中国货占主导。" },
      { nodes: ["中国", "阿联酋", "印度"], label: "阿联酋路径 · 强反证", basis: "2024 年前段数量仅为后段的约 0.04%，明显不满足大规模转口的物量条件。" },
    ],
    routeBoundary: "镜像数量只能检验路线是否具备物量上限，不能证明具体批次；财政年度数量与自然年价值不得直接相加。",
    analysis: ["尿素来源正向阿曼、俄罗斯、卡塔尔、沙特和阿联酋等海湾/远洋供应国切换，中国则更多表现为政策窗口打开时的弹性来源。", "对印风险并不只来自中国。霍尔木兹或红海受扰时，替代中国的海湾来源也可能同步承压，造成招标价格、航程和财政补贴上升。"],
    conclusion: "尿素的对华依赖属于高波动、可切换但受物流约束的依赖。中国直接供应已在 2025-26 明显恢复；阿联酋大规模转口可基本排除，越南路线仅应列为低优先级核验对象。",
    monitoring: ["中国尿素出口政策与港口滞留量", "印度招标中标来源、报价与到港节奏", "越南对华进口与对印出口的同月数量", "阿曼—霍尔木兹—印度航线风险"],
    references: ["化肥专题报告：尿素国别—品类官方数量表", "WITS 2023 越南尿素镜像贸易", "WITS 2024 阿联酋尿素镜像贸易", "UN Comtrade 2025 HS 310210"],
  },
  fertilizer_dap: {
    title: "DAP 对华依赖回落与替代来源重组",
    evidence: "中等",
    status: "中国份额显著回落",
    executive: "DAP 曾是印度对中国依赖最明显的化肥品类之一，但来源已向沙特、摩洛哥和俄罗斯分散。2025 自然年价值口径下，中国占印度 DAP 进口约 9.2%；长期协议正在形成制度性替代。",
    dataPoints: ["2025 年印度自中国进口 DAP 约 4.50 亿美元，全球进口约 49.09 亿美元，对华来源占比 9.2%。", "印度官方数量显示，中国份额由 2023-24 财年的 40.0%降至 2024-25 的 18.5%，2025-26 截至 2026 年 2 月进一步降至 8.3%。", "KRIBHCO、IPL、CIL 与沙特 Maaden 的长期协议约定 2025-26 至 2029-30 每年供应 31 LMT DAP/NPK。"],
    routes: [
      { nodes: ["中国", "新加坡", "印度"], label: "新加坡路径 · 规模极小", basis: "报告核验显示新加坡 2023 年 DAP 世界进口总量仅 9.173 万千克，不具备支撑大宗对印转口的规模。" },
      { nodes: ["中国", "香港", "印度"], label: "香港路径 · 可忽略", basis: "2023 年中国对香港 DAP 出口仅 5 万千克，印度自香港化肥进口在研究期内接近零。" },
    ],
    routeBoundary: "沙特、摩洛哥、俄罗斯和约旦是替代供应来源，不应因其份额上升而被自动视为中国转口节点。",
    analysis: ["DAP 的核心脆弱性来自磷肥出口政策、国际原料价格和海运到港节奏。中国份额下降降低了单一来源暴露，但并未消除印度对进口 DAP、磷酸和磷矿石的总体依赖。", "长期协议提高了供应可预见性；然而红海绕航、港口拥堵和补贴机制仍可能把外部冲击传导至政府财政与国内库存。"],
    conclusion: "DAP 对中国的直接依赖已从高位明显下降，第三国大宗转口证据不足。当前更应关注沙特长期协议兑现、摩洛哥与俄罗斯供货稳定性，以及中国磷肥出口窗口变化。",
    monitoring: ["中国磷肥出口窗口与检验政策", "Maaden 长期协议的月度兑现量", "摩洛哥、俄罗斯、约旦到港与价格", "印度 DAP 库存、磷酸与磷矿石进口"],
    references: ["化肥专题报告：DAP 来源变化与官方数量表", "印度化肥部 UQ 5699 / Maaden 长期协议", "WITS 香港、新加坡 DAP 镜像记录", "UN Comtrade 2025 HS 310530"],
  },
  fertilizer_mop: {
    title: "MOP 高进口依赖与低中国暴露分析",
    evidence: "中等",
    status: "中国不是关键来源",
    executive: "印度 MOP 几乎完全依赖进口，但这种总体进口依赖不能等同于对中国依赖。2025 年中国在 HS 310420 价值口径中占比接近零，风险主要集中在俄罗斯、加拿大等供应来源。",
    dataPoints: ["2025 年印度 MOP 全球进口约 12.52 亿美元，自中国进口仅约 2.56 万美元，对华来源占比约 0.002%。", "印度官方数量附件显示，2020-21 至 2024-25 中国直接供应均为零；2025-26 截至 2026 年 2 月为 0.28 LMT，占 1.0%。", "议会常设委员会指出，印度 MOP 几乎 100% 依赖进口，说明风险是总体外部依赖而非中国集中度。"],
    routes: [],
    routeBoundary: "现有数量与价值数据均不支持为中国 MOP 设计主要转口路径；俄罗斯、加拿大等来源属于实际替代供应，不是中转国标签。",
    analysis: ["MOP 的供应安全评估应从“对华依赖”切换为“外部资源与制裁/航运暴露”。即便中国风险很低，单一矿源、结算和航线波动仍会影响印度。", "中国在 2025-26 出现少量供应，不改变长期来源结构；后续只有在月度份额持续上升时才有必要提高中国路径监测优先级。"],
    conclusion: "MOP 是“总体进口依赖极高、对中国直接依赖极低”的典型品类。当前没有充分依据认定存在重要的中国第三国转口链。",
    monitoring: ["俄罗斯、加拿大与白俄罗斯供应稳定性", "制裁、结算与航运保险风险", "中国月度份额是否持续高于历史低位"],
    references: ["化肥专题报告：MOP 国别—品类数量表", "印度议会常设委员会化肥自给率报告", "UN Comtrade 2025 HS 310420"],
  },
  fertilizer_npk: {
    title: "NPK 阶段性上升与统计口径差异分析",
    evidence: "中等偏低",
    status: "财年数量与 HS6 价值分化",
    executive: "NPK 的对华暴露在 2025-26 官方财年数量中显著上升，但 HS 310520 自然年价值占比仍低。两者可能源于时间窗口、NPK/NPKS 定义和子目覆盖差异，不能简单判定为数据冲突。",
    dataPoints: ["2025 年 HS 310520 口径下，印度自中国进口约 907 万美元，全球进口约 12.10 亿美元，对华来源占比 0.7%。", "印度官方 NPK 数量显示，中国份额由 2024-25 财年的 3.4%升至 2025-26 截至 2026 年 2 月的 27.1%。", "官方长期协议将 DAP/NPK 合并安排，且部分统计使用 NPKS 宽口径；因此需要 HS8 和产品配方才能解释差异。"],
    routes: [],
    routeBoundary: "现有公开数据尚不能把 NPK 财年数量上升分配到具体 HS6/8，更不能据此推定第三国路径。",
    analysis: ["NPK 的产品配方、养分比例与税号归类差异较大。企业验证时应先统一 NPK、NPKS 和 HS 310520/其他 3105 子目，再比较来源份额。", "中国份额的阶段性上升值得跟踪，但沙特长期供货和印度国内复合肥生产会共同影响未来结构，当前不宜外推为长期趋势。"],
    conclusion: "NPK 是需要优先做口径校准的品类。官方财年数量提示中国暴露上升，但 HS 310520 价值数据尚未给出同等强度信号；现阶段应标记为低概率结论并等待 HS8、配方和企业采购数据验证。",
    monitoring: ["NPK/NPKS 与 HS6/8 的编码映射", "中国来源月度数量、价值与单价", "Maaden DAP/NPK 长协兑现", "印度国内复合肥产量与配方切换"],
    references: ["化肥专题报告：NPK 国别—品类官方数量表", "印度化肥部 UQ 5699 与 Maaden 协议", "UN Comtrade 2025 HS 310520"],
  },
  polymer: {
    title: "聚酯与工程塑料来源结构分析",
    evidence: "低",
    status: "无公开量化转口数据",
    executive: "印度对华依赖处于中等水平，公开资料可见多来源供应，但没有足够数据识别中国经第三国进入印度的金额、港口和占比。",
    dataPoints: ["2025 年印度自中国进口 9.11 亿美元，全球进口 27.02 亿美元，对华来源占比 33.7%。", "公开来源未形成可复核的“中国—第三国—印度”同口径金额链。", "网站默认两段同步增长筛查未触发路径信号。"],
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
    title: "印度盾构机项目依赖与转口链审查",
    evidence: "中等",
    status: "项目型依赖 · 税号仅作筛查",
    executive: "公开项目证据可以确认中国厂商向印度重大隧道工程直接交付盾构机，但 HS 843031/843039 不是盾构机专属税号。2025 年合并筛查池的对华来源占比为 39.2%，只能用于观察来源暴露，不能当作盾构机成交额或台数。",
    dataPoints: ["2025 年 HS 843031 与 843039 合并口径下，印度自中国进口约 4248.84 万美元，全球进口约 1.0841 亿美元，对华来源占比 39.2%。", "报告整理的 2024 年印度进口数据显示：HS 843031 自中国进口 654.49 万美元、43 件；HS 843039 自中国进口 14.89 万美元、558 件，后者的低价值与高件数说明其作为盾构机代理的杂质很高。", "中国铁建重工官方项目资料显示，至少有 5 台泥水平衡盾构机用于孟买沿海公路和班加罗尔两个项目；孟买设备于 2020 年 3 月从上海直接发往孟买。"],
    routes: [
      { nodes:["中国","印度"], label:"上海—孟买项目直运", basis:"中国铁建重工官方项目资料明确记载设备在长沙制造、从上海装船并直接发往孟买，是项目级直供证据。" },
      { nodes:["中国","新加坡","印度"], label:"HS 843031 新加坡中转强线索", basis:"2024 年印度自新加坡进口 827.9 万美元，同期新加坡自中国进口 9661.4 万美元；两端规模支持筛查，但未闭合原产地与逐票流向。" },
      { nodes:["中国","新加坡","印度"], label:"HS 843039 新加坡中转一般线索", basis:"印度自新加坡进口约 37.4 万美元，但缺少新加坡进口端的中国原产对应闭环，证据弱于 HS 843031。" },
    ],
    routeBoundary: "报告没有取得任何 A 级“同一货物由中国出口、第三国再出口、最终进入印度项目”的闭环单证。新加坡路径只能视为贸易重叠线索；已知孟买项目反而有直接运输证据。",
    analysis: ["盾构机是低频、大额、按项目定制的资本品，年度贸易值极易被少数合同左右。项目合同、设备序列号、制造商交付记录比宽税号占比更能说明真实依赖。", "印度对中国的依赖主要体现在大直径泥水平衡盾构机的制造、交付、备件与现场服务能力。芬兰、欧洲、美国等来源可构成替代，但工法适配、直径、地质条件和服务体系决定了替代并非同质。"],
    conclusion: "高可信结论是中国厂商已形成对印度重大隧道项目的直接供货能力；39.2% 仅代表两个 HS6 筛查池的来源占比。第三国转口尚未证实，新加坡只应列入后续单证核验名单。",
    monitoring: ["项目合同、设备序列号与制造商交付记录", "盾构直径、工法、地质适配及备件服务", "新加坡贸易商的原产地证书、提单与再出口申报"],
    references: ["《印度对中国盾构机与工程车依赖及转口链审查》", "UN Comtrade / WITS：HS 843031、843039", "中国国资委：中国铁建重工孟买沿海公路盾构机项目资料"],
  },
  tunnel_843031: {
    title: "HS 843031 自推进掘进机械筛查报告", evidence: "中等偏低", status: "盾构相关筛查池 · 新加坡强线索",
    executive: "该税号是盾构机最重要的公开贸易筛查池之一，但同时包含自推进采煤机和截岩机。2025 年中国占比约 39.4%；数值能反映来源暴露，不能独立证明盾构整机数量。",
    dataPoints: ["2025 年印度自中国进口约 4059.65 万美元，全球进口约 1.0295 亿美元，对华来源占比 39.4%。", "2024 年报告口径下，中国金额 654.49 万美元、43 件，在欧盟、芬兰、美国、新加坡、南非之后，宽税号层面并非中国主导。", "2024 年印度自新加坡进口 827.9 万美元，而新加坡自中国进口 9661.4 万美元、2772 件，形成较强但未闭环的转口筛查线索。"],
    routes: [{nodes:["中国","新加坡","印度"],label:"新加坡贸易重叠筛查",basis:"两端贸易规模同时可见，但没有同一设备的序列号、原产地证书和再出口单证，不能认定实际转口。"}],
    routeBoundary: "HS 843031 产品构成复杂；即便两段贸易同年重叠，也可能是不同设备或零部件。", analysis: ["2024—2025 数值变化可能来自少数项目交付，也可能来自采矿机械，不能直接解释为盾构需求突然上升。", "验证时应优先用设备名称、刀盘直径、工法和序列号把真正 TBM 从税号池中剥离。"],
    conclusion: "中国来源暴露值得关注，新加坡是首要核验节点；但“印度约四成盾构机来自中国”这一表述不成立，准确说法应是 HS 843031 筛查池约四成来自中国。", monitoring:["设备品名与序列号","新加坡再出口原产地","项目交付月份与单笔金额"], references:["专题报告 HS 843031 附表","UN Comtrade 2025 HS 843031","WITS 2024 双边贸易数据"],
  },
  tunnel_843039: {
    title: "HS 843039 其他掘进设备筛查报告", evidence: "低", status: "高杂质筛查池",
    executive: "该税号对盾构机的指向性较弱。2025 年中国占比约 34.6%，但 2024 年出现低金额、高件数组合，说明大量申报很可能不是完整盾构机。",
    dataPoints:["2025 年印度自中国进口约 189.19 万美元，全球进口约 546.43 万美元，对华来源占比 34.6%。","2024 年中国金额仅 14.89 万美元却申报 558 件，无法按完整盾构机理解。","2024 年印度自新加坡进口约 37.4 万美元、11 件；新加坡全球出口约 346.8 万美元，但缺少中国原产入口闭环。"],
    routes:[{nodes:["中国","新加坡","印度"],label:"新加坡弱线索",basis:"只有印度进口端和新加坡全球出口端可比，缺少对应中国来源数据，因此仅作假设。"}], routeBoundary:"数量、单价和货物定义均不足，不能由该税号推断盾构机台数或转口比例。", analysis:["该税号更适合发现异常申报和项目交付时间，而不适合测量整机依赖。","若业务数据能提供型号和净重，可先排除配件、小型截岩设备及非自推进装置。"], conclusion:"目前只能推测其中存在少量盾构相关设备；中国依赖程度和新加坡路径均需业务数据验证。", monitoring:["单价、净重与设备型号","完整整机/部件申报区分","新加坡进口来源与再出口提单"], references:["专题报告 HS 843039 附表","UN Comtrade 2025 HS 843039","WITS 2024 双边贸易数据"],
  },
  earthmoving: {
    title: "印度工程车整车依赖与转口链审查", evidence: "中等", status: "车型依赖显著分化",
    executive: "工程车不能用一个宽税号概括。2025 年三个严格整车子项合并后中国占比约 38.1%；其中汽车起重机占比最高，非公路用自卸车贡献绝大多数金额，混凝土搅拌车依赖较低。",
    dataPoints:["2025 年 HS 870410、870510、870540 合并口径下，印度自中国进口约 2281.55 万美元，全球进口约 5990.92 万美元，对华来源占比 38.1%。","报告显示 2024 年非公路用自卸车中国份额为 43.3%；汽车起重机的中国出口镜像金额为 2.2969 亿美元，超过其后四国合计 56 倍以上；混凝土搅拌车总贸易规模很小。","不同报告方向存在显著镜像差异，尤其是汽车起重机和自卸车，不能把中国出口统计与印度进口统计直接混为一列。"],
    routes:[{nodes:["中国","印度尼西亚","印度"],label:"非公路用自卸车的印尼强线索",basis:"2024 年印度自印尼进口 848.8 万美元，同期中国对印尼出口 2.6847 亿美元；缺少原产地闭环，仍不能认定转口。"},{nodes:["中国","新加坡","印度"],label:"运输设备分拨背景",basis:"DGCI&S 宽口径运输设备样本显示约 5.9% 经新加坡装运；该比例不能直接外推到任何单一工程车型。"}],
    routeBoundary:"报告没有取得工程车的逐票闭环转口证据。印尼、新加坡和香港只能作为单证审计的优先节点，不能被标注为已确认中转国。", analysis:["中国依赖呈车型分化：自卸车决定金额规模，起重机体现高集中度信号，搅拌车则是低规模、低稳定性市场。合并值只能用于总览，采购判断必须进入子项。","镜像差异可能来自 FOB/CIF、时间错配、转口、退运、分类差异或漏报。差异本身是审计触发器，不是转口证据。"], conclusion:"可确认中国是印度工程车的重要整车来源，但依赖程度必须分车型描述。印尼转口线索值得优先核验，尚不能认定存在稳定的中国—第三国—印度转口链。", monitoring:["车型、底盘号与设备序列号","印度进口与中国出口镜像差异","印尼/新加坡原产地证书与提单"], references:["《印度对中国盾构机与工程车依赖及转口链审查》","UN Comtrade / WITS：HS 870410、870510、870540","DGCI&S 原产国/装运国专题"],
  },
  earthmoving_dumptruck: {
    title:"非公路用自卸车依赖与印尼路径审查", evidence:"中等", status:"金额主体 · 印尼强线索", executive:"非公路用自卸车是工程车组合的金额主体。2025 年中国份额约 38.8%；2019—2024 年印度进口口径总体上升，但镜像差异很大。",
    dataPoints:["2025 年印度自中国进口约 2218.51 万美元，全球进口约 5723.91 万美元，对华来源占比 38.8%。","报告所列印度进口口径中，中国份额由 2019 年 14.1% 上升至 2024 年 43.3%，中间年份波动明显；2021 年 9975 件的数量异常需单独核验。","2024 年印度自中国进口 1807.46 万美元，而中国出口镜像为 3978.38 万美元；统计方向差异超过一倍。"], routes:[{nodes:["中国","印度尼西亚","印度"],label:"印尼转口筛查",basis:"印度自印尼进口 848.8 万美元、35 件，同时中国对印尼出口 2.6847 亿美元、2206 件；缺少同车对应和原产地闭环。"}], routeBoundary:"贸易规模重叠不等于同一车辆转口；必须通过车架号、原产地证书、提单和印尼是否发生实质加工核验。", analysis:["2019—2024 的份额上升支持中国重要性增强，但年度订单和矿业项目会造成显著波动。","印尼拥有矿业车辆需求和装配活动，既可能是终端市场，也可能是区域供货节点；公开统计无法区分。"], conclusion:"中国已是非公路用自卸车的重要来源，印尼是高优先级核验节点；是否存在中国原产车辆经印尼转口，仍未被公开证据证明。", monitoring:["车架号、品牌与制造工厂","2021 年异常数量申报","印尼进口—再出口逐票对应"], references:["专题报告 HS 870410 年度表","UN Comtrade 2025 HS 870410","WITS 2024 中国—印尼—印度数据"],
  },
  earthmoving_crane: {
    title:"汽车起重机高集中度与镜像差异报告", evidence:"中等偏低", status:"高集中信号 · 统计差异巨大", executive:"汽车起重机显示最强的中国来源集中度，但印度进口与中国出口镜像金额差异异常大，必须把依赖信号与数值可信度分开判断。",
    dataPoints:["2025 年印度进口申报中，自中国约 40.01 万美元，全球约 60.61 万美元，对华来源占比 66.0%。","中国出口镜像数据显示，2023 年对印度 1.6535 亿美元、1522 件，2024 年 2.2969 亿美元、1789 件，金额同比增长 38.9%。","报告测算 2024 年中国镜像金额超过其后四个来源合计 56 倍以上，但这一规模与印度进口侧数据严重不一致。"], routes:[], routeBoundary:"在申报方向、计量单位和产品分类未对齐前，不应根据镜像差额推断第三国转口。", analysis:["66.0% 的 2025 来源占比支持中国主导信号，但绝对金额很小，与上一年中国镜像统计形成断裂。","优先核查是否存在单位、底盘/上装拆分、临时进口、项目设备回运或税号错分。"], conclusion:"中国高度重要这一方向性判断具有依据，但精确市场规模和年度变化为低概率结论；当前不能据镜像差额认定转口。", monitoring:["底盘与起重上装是否拆分申报","计量单位、临时进口与退运","中印镜像数据逐票对账"], references:["专题报告 HS 870510 镜像贸易表","UN Comtrade 2025 HS 870510","WITS 中国出口与印度进口数据"],
  },
  earthmoving_mixer: {
    title:"混凝土搅拌车低规模依赖报告", evidence:"中等偏低", status:"低规模 · 低中国暴露", executive:"混凝土搅拌车进口规模很小，2025 年中国占比约 11.2%。当前公开数据不支持将其列为对华高依赖车型，也没有可量化转口链。",
    dataPoints:["2025 年印度自中国进口约 23.03 万美元，全球进口约 206.40 万美元，对华来源占比 11.2%。","2024 年印度全球进口约 39.84 万美元、15 件；中国出口镜像约 11.07 万美元、1 件。","少数车辆即可显著改变年度金额和份额，因此不宜对短期趋势作结构性解释。"], routes:[], routeBoundary:"没有形成中国—第三国—印度的金额、时间和货物闭环；不列示猜测性中转国。", analysis:["低金额与低频交付意味着供应风险更取决于具体品牌、底盘和售后，而非总体贸易份额。","若业务采购集中于少数中国品牌，企业级依赖仍可能高于全国统计值。"], conclusion:"全国贸易口径下，中国不是混凝土搅拌车的主导来源；结论可用于总体筛查，但企业采购依赖仍需订单数据验证。", monitoring:["品牌、底盘和搅拌上装来源","企业采购订单与售后网络","单车价格和数量单位异常"], references:["专题报告 HS 870540 数据表","UN Comtrade 2025 HS 870540","WITS 2024 双边贸易数据"],
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
  { tag:"UN", title:"UN Comtrade API · HS 2022", detail:"2025 矩阵与 2024-12 后月度记录均核验为 classificationCode H6（HS 2022）；跨期趋势单独标注 HS 2017→2022 对照。", period:"2021—2025 / 月度至 2026-06", url:COMTRADE },
  { tag:"FERT", title:"印度化肥部国别—品类附件", detail:"尿素、DAP、MOP、NPK 的财年进口量、对华份额、库存及长期采购协议；与自然年价值口径分开展示。", period:"FY2020–21—FY2025–26", url:"https://sansad.in/getFile/loksabhaquestions/annex/187/AU5699_atvOoH.pdf?source=pqals" },
  { tag:"ROUTE", title:"DGCI&S 化肥直接/间接装运专题", detail:"官方样本显示中国原产化肥 99.9% 直接自中国装运、0.1% 经其他国家装运。", period:"2021-04—2022-02", url:"https://www.dgciskol.gov.in/writereaddata/Downloads/20220504100946Import_from_China_Apr_Feb_2021_22.pdf" },
  { tag:"TBM", title:"中国铁建重工孟买盾构项目资料", detail:"制造商项目资料记录长沙制造、上海装船并直接发往孟买，并披露此前向班加罗尔交付 4 台泥水平衡盾构机。", period:"2020-03", url:"https://en.sasac.gov.cn/2020/03/25/c_4298.htm" },
  { tag:"VEH", title:"DGCI&S 原产国与装运国专题", detail:"提供运输设备直接装运及经新加坡、香港等地装运的宽口径背景；不能外推为单一车型转口比例。", period:"2021-04—2022-02", url:"https://www.dgciskol.gov.in/writereaddata/Downloads/20220504100946Import_from_China_Apr_Feb_2021_22.pdf" },
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
  fertilizer: { level:"高概率", reason:"化肥总项与四类数量来自 UN Comtrade、印度化肥部附件和 DGCI&S 原产国/装运国官方样本，且结论限定为结构性依赖和主导模式判断。" },
  fertilizer_urea: { level:"高概率", reason:"直接份额变化与阿联酋路线反证有官方数量及双边镜像数据支撑；越南路线仅按弱到中等可能性表述。" },
  fertilizer_dap: { level:"高概率", reason:"中国份额回落、替代来源和长期协议均有印度官方附件或可复核 HS6 数据支持。" },
  fertilizer_mop: { level:"高概率", reason:"多年官方数量和 2025 HS6 价值均显示中国份额极低，结论不依赖推测性路径。" },
  fertilizer_npk: { level:"低概率", reason:"2025 自然年 HS 310520 价值与 2025-26 财年 NPK/NPKS 数量口径分化，需要 HS8、配方和企业采购数据解释。" },
  graphite: { level:"推测", reason:"HS4 无法识别纯度、粒径和形态等受控参数，需以产品规格与许可证材料复核。" },
  rareearth: { level:"推测", reason:"宽税号无法区分具体元素、化合物形态与最终用途，当前仅作风险假设。" },
  tunnel: { level:"高概率", reason:"项目直运由制造商官方资料支持，税号合并值明确限定为筛查池；第三国路径未作事实认定。" },
  tunnel_843031: { level:"低概率", reason:"来源占比可复核，但税号混入采煤机和截岩机，新加坡线索也缺少同一设备闭环。" },
  tunnel_843039: { level:"推测", reason:"低金额、高件数和不完整的上游来源使该税号难以代表完整盾构机。" },
  earthmoving: { level:"高概率", reason:"三个严格整车税号的合并值与车型分化均可复核，结论同时保留镜像差异和转口证据边界。" },
  earthmoving_dumptruck: { level:"高概率", reason:"中国份额上升与印尼贸易重叠有年度数据支持，但结论未把印尼路径表述为已证实转口。" },
  earthmoving_crane: { level:"低概率", reason:"中国主导方向明确，但印度进口与中国出口镜像规模差异巨大，精确金额和趋势须逐票复核。" },
  earthmoving_mixer: { level:"高概率", reason:"2024—2025 整车金额和数量均显示市场规模小、中国份额较低；企业级依赖另行保留。" },
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
  const [selectedSubitem,setSelectedSubitem] = useState("fertilizer");
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
    return (category === "全部" || item.category === category) && (!q || `${item.name} ${item.english} ${item.hs} ${hs8Of(item)} ${item.searchTerms??""}`.toLowerCase().includes(q)) && item.completeYear.share >= minShare && item.completeYear.china >= minValue;
  }).sort((a,b)=>b.completeYear.share-a.completeYear.share),[category,search,minShare,minValue]);

  const activeRoutes = routes.filter(route => route.cnToHub[1] >= routeValue && route.hubToIndia[1] >= routeValue && growth(route.cnToHub[1],route.cnToHub[0]) >= routeGrowth && growth(route.hubToIndia[1],route.hubToIndia[0]) >= routeGrowth);
  const chinaTotal = commodities.reduce((sum,item)=>sum+item.completeYear.china,0);
  const worldTotal = commodities.reduce((sum,item)=>sum+item.completeYear.world,0);
  const weightedShare = chinaTotal/worldTotal*100;
  const highCount = commodities.filter(item=>item.completeYear.share>=50).length;
  const reset = () => { setCategory("全部"); setSearch(""); setMinShare(0); setMinValue(0); };
  const openCommodity = (item:CommodityRecord) => {
    setSelected(item);
    setSelectedSubitem(item.id);
  };
  const openCommodityById = (id:string) => {
    const parent = commodities.find(item=>item.id===id);
    if (parent) {
      openCommodity(parent);
      return;
    }
    const parentEntry = Object.entries(commoditySubitemsByParent).find(([,items])=>items.some(item=>item.id===id));
    if (!parentEntry) return;
    const parentRecord = commodities.find(item=>item.id===parentEntry[0]);
    if (!parentRecord) return;
    setSelected(parentRecord);
    setSelectedSubitem(id);
  };
  const selectedChildren = selected ? commoditySubitemsByParent[selected.id]??[] : [];
  const selectedRecord = selected && selectedChildren.length
    ? [selected,...selectedChildren].find(item=>item.id===selectedSubitem)??selected
    : selected;
  const selectedReport = selectedRecord ? commodityReports[selectedRecord.id] : null;
  const selectedMonthly = selectedRecord ? monthlyTradeById[selectedRecord.id]??[] : [];
  const selectedAccuracy = selectedReport && selectedRecord ? reportAccuracyById[selectedRecord.id]??defaultReportAccuracy : null;

  return <main>
    <header className="topbar">
      <a className="brand" href="#top" aria-label="返回首页"><span className="brand-mark">依</span><span>中印供应链依赖图谱<small>INDIA × CHINA SUPPLY ATLAS</small></span></a>
      <nav aria-label="主要导航"><a href="#matrix">依赖矩阵</a><a href="#fertilizer-focus">化肥专题</a><a href="#routes">路径信号</a><a href="#sources">来源中心</a><a href="#reports">报告下载</a></nav>
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
        <div className="period-toggle" role="group" aria-label="数据时期"><button className={period==="annual"?"active":""} onClick={()=>setPeriod("annual")}>2025 完整年</button><button className={period==="pulse"?"active":""} onClick={()=>setPeriod("pulse")}>2026 最新数据</button></div>
        {period === "annual" ? <>
          <div className="hero-metric"><span>{commodities.length} 个重点商品组 · 加权对华来源占比</span><strong>{weightedShare.toFixed(1)}<small>%</small></strong><p>中国进口额之和 ÷ 全球进口额之和；页面展示 HS2022 8 位筛查码，统计金额仍按可复核的 HS31、HS4 或 HS6 合并口径计算。不是印度全经济总体依赖率。</p></div>
          <div className="metric-quads"><div><span>自中国进口</span><strong>{formatB(chinaTotal)}</strong></div><div><span>样本全球进口</span><strong>{formatB(worldTotal)}</strong></div><div><span>占比 ≥ 50%</span><strong>{highCount}<small> 组</small></strong></div><div><span>最高集中度</span><strong>87.2%</strong></div></div>
          <a className="panel-source" href={COMTRADE} target="_blank" rel="noreferrer"><span>SOURCE 01</span> UN Comtrade · 2025 · {CURRENT_HS_VERSION}（H6）↗</a>
        </> : <>
          <div className="hero-metric pulse"><span>印度对华进口 · FY2025–26</span><strong>$131.63<small>B</small></strong><p>完整财年官方总量；与 2025 自然年商品矩阵分开展示。</p></div>
          <div className="metric-quads"><div><span>对华出口</span><strong>$19.47B</strong></div><div><span>进口同比</span><strong>+16.03%</strong></div><div><span>2026 年 4 月进口同比</span><strong>+20.85%</strong></div><div><span>月度库可用至</span><strong>2026.05</strong></div></div>
          <a className="panel-source" href={TIA} target="_blank" rel="noreferrer"><span>SOURCE 02</span> India TIA / DGCI&S · 访问 {SNAPSHOT_DATE} ↗</a>
        </>}
      </div>
    </section>

    <section className="definition-strip" id="method"><span>01</span><div><strong>“依赖”指什么？</strong><p>同一时期、同一 HS 编码下，印度自中国进口额 ÷ 印度全球进口额。它衡量的是<strong>进口来源依赖</strong>，不等于印度国内消费或生产的总体依赖。</p></div><a href="#sources">查看完整口径 ↘</a></section>

    <section className="section matrix-section" id="matrix">
      <div className="section-heading"><div><p>DEPENDENCY MATRIX / 2025</p><h2>重点商品依赖矩阵</h2></div><p>基于 2025 完整自然年并统一采用 HS 2022（UN Comtrade H6）；商品编码展示为 8 位筛查码，统计金额按可复核的 HS31、HS4 或 HS6 合并口径计算，并可下钻至各子项。</p></div>
      <div className="filter-shell">
        <div className="category-tabs" role="tablist" aria-label="行业筛选">{categories.map(item=><button key={item} role="tab" aria-selected={category===item} className={category===item?"active":""} onClick={()=>setCategory(item)}>{item}</button>)}</div>
        <div className="filters"><label className="search"><span>搜索商品 / 英文 / HS</span><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="例如：盾构、起重机、870510"/></label><label><span>最低对华占比 <b>{minShare}%</b></span><input type="range" min="0" max="90" step="5" value={minShare} onChange={e=>setMinShare(Number(e.target.value))}/></label><label><span>最低自华进口额 <b>{minValue===0?"不限":formatB(minValue)}</b></span><input type="range" min="0" max="5" step="0.25" value={minValue} onChange={e=>setMinValue(Number(e.target.value))}/></label><button className="reset" onClick={reset}>重置筛选</button></div>
      </div>
      <div className="matrix-meta" aria-live="polite"><span>显示 {filtered.length} / {commodities.length} 个商品组 · 按依赖度排序</span><a href={COMTRADE} target="_blank" rel="noreferrer">UN Comtrade · 2025 · 访问 {SNAPSHOT_DATE} ↗</a></div>
      <div className="commodity-table"><div className="table-head"><span>商品 / HS8</span><span>印度自中国进口</span><span>印度全球进口</span><span>对华来源占比</span><span>判读</span></div>{filtered.map(item=><button className="commodity-row" key={item.id} onClick={()=>openCommodity(item)} aria-label={`查看 ${item.name} 详情`}><span className="commodity-name"><b>{item.name}</b><small>{item.english}</small><code>{CURRENT_HS_VERSION} · HS8 {hs8Of(item)}{item.proxy?" · 代理编码":""}</code><em>{statLevelOf(item)}</em></span><span className="value-cell"><b>{formatB(item.completeYear.china)}</b><small>2025 · CIF</small></span><span className="value-cell"><b>{formatB(item.completeYear.world)}</b><small>2025 · 全球</small></span><span className="share-cell"><b>{item.completeYear.share.toFixed(1)}%</b><i><em style={{width:`${item.completeYear.share}%`}}/></i></span><span className="tag-cell">{item.controlled&&<i className="risk">管制筛查</i>}{item.proxy&&<i>代理口径</i>}{item.children&&<i>{item.children.length} 个子项</i>}<small>详情 ↗</small></span></button>)}{filtered.length===0&&<div className="empty-state"><strong>没有符合条件的商品</strong><p>降低阈值或清除搜索词后再试。</p><button onClick={reset}>恢复全部</button></div>}</div>
      <p className="data-note">分类版本：HS 2022（UN Comtrade H6）。页面展示 8 位筛查码：HS4/HS6 项以末位补零方式映射为 8 位，合并项以多个 8 位码并列展示。单位：十亿美元，现价美元，进口通常按 CIF 计。统计金额仍以数据源可复核的 HS31、HS4、HS6 单项或合并筛查池计算；筛查池不能等同于具体整机成交额或台数。</p>
    </section>

    <section className="pulse-ribbon" aria-label="最新月度数据"><div><span>MONTHLY DATA UPDATE</span><strong>2026.05</strong></div><p>印度 TradeStat 月度库已更新至 2026 年 5 月；2026 年 4 月起部分 ITC HS 编码被撤销或重新分配。本版保留 2025 完整年作为可比矩阵，月度细项通过下次审核后再进入快照。</p><a href={TRADESTAT} target="_blank" rel="noreferrer">打开官方月度库 ↗</a></section>

    <section className="section fertilizer-focus" id="fertilizer-focus">
      <div className="section-heading"><div><p>FERTILIZER FOCUS</p><h2>化肥专题</h2></div><p>将 HS31 总项与尿素、DAP、MOP、NPK 四个子项分开判读：总项观察整体暴露，子项用于核验具体采购、替代来源和第三国装运线索。</p></div>
      <div className="fertilizer-grid">{fertilizerFocusIds.map((id,index)=>{const item = allCommodityRecords.find(record=>record.id===id)!;const accuracy = reportAccuracyById[id]??defaultReportAccuracy;return <article className="fertilizer-card" key={id}><button type="button" onClick={()=>openCommodityById(id)}><span>{String(index+1).padStart(2,"0")} / HS8 {hs8Of(item)}</span><h3>{item.name}</h3><p>{item.english}</p><strong>{item.completeYear.share.toFixed(1)}<small>%</small></strong><em>{accuracy.level}</em></button><a href={reportHref(id)} download>下载 Word 报告 ↗</a></article>})}</div>
      <p className="data-note">化肥专题参考印度化肥部国别—品类附件、DGCI&S 直接/间接装运样本与 UN Comtrade 2025 HS2022 数据。财年数量、自然年金额和 HS8 企业单证应分开校验。</p>
    </section>

    <section className="section spotlight"><div className="section-heading"><div><p>EQUIPMENT FOCUS</p><h2>工程设备专题</h2></div><p>盾构机按项目证据与两个 HS6 筛查池阅读，工程车按三个严格整车子项阅读，并与维保零件分开判断。</p></div><div className="spotlight-grid">{["tunnel","earthmoving","machineparts"].map((id,index)=>{const item=commodities.find(x=>x.id===id)!;return <button className="spotlight-card" key={id} onClick={()=>openCommodity(item)}><span className="card-index">0{index+1} / HS8 {hs8Of(item)}</span><div className={`equipment-visual v${index+1}`} aria-hidden="true"><i/><i/><i/></div><p>{item.english}</p><h3>{item.name}</h3><strong className="big-share">{item.completeYear.share.toFixed(1)}<small>%</small></strong><span className="card-link">查看证据卡片 ↗</span></button>})}</div></section>

    <section className="section route-section" id="routes">
      <div className="section-heading inverse"><div><p>ROUTE SIGNALS / SCREENING ONLY</p><h2>可能的第三国路径信号</h2></div><p>同一 HS 组中“中国→第三国”与“第三国→印度”同步上升，并同时展示“中国→印度”变化。仅用于筛查，不认定实际转口或违法。</p></div>
      <div className="route-controls"><label><span>两段贸易额下限 <b>{formatM(routeValue)}</b></span><input type="range" min="0" max="3" step="0.1" value={routeValue} onChange={e=>setRouteValue(Number(e.target.value))}/></label><label><span>两段增幅下限 <b>{routeGrowth}%</b></span><input type="range" min="0" max="100" step="5" value={routeGrowth} onChange={e=>setRouteGrowth(Number(e.target.value))}/></label><div><strong>{activeRoutes.length}</strong><span>条路径信号</span></div></div>
      <div className="route-list">{activeRoutes.map(route=><article className="route-card" key={route.id}><div className="route-title"><div><span>HS {route.hs} · {route.coverage}</span><h3>{route.product} / {route.hub}</h3></div><a href={route.source} target="_blank" rel="noreferrer">UN ↗</a></div><div className="route-flow"><div className="node china"><small>起点</small><strong>中国</strong><span>{formatM(route.cnToHub[1])}</span></div><div className="edge"><b>{signed(growth(route.cnToHub[1],route.cnToHub[0]))}</b><i/></div><div className="node hub"><small>第三国</small><strong>{route.hub}</strong><span>{formatM(route.hubToIndia[1])}</span></div><div className="edge"><b>{signed(growth(route.hubToIndia[1],route.hubToIndia[0]))}</b><i/></div><div className="node india"><small>终点</small><strong>印度</strong><span>直接流 {formatM(route.directToIndia[1])}</span></div></div><p>中国→印度直接流：{formatM(route.directToIndia[0])} → {formatM(route.directToIndia[1])}（{signed(growth(route.directToIndia[1],route.directToIndia[0]))}）</p></article>)}</div>
      {activeRoutes.length===0&&<div className="route-empty"><span>∅</span><div><strong>当前阈值下没有路径信号</strong><p>这不代表不存在转口。默认阈值要求两段贸易额均不低于 100 万美元、可比期增幅均不低于 25%；尝试降低金额阈值可查看弱信号。</p><button onClick={()=>{setRouteValue(.2);setRouteGrowth(25)}}>查看弱信号</button></div></div>}
      <div className="route-warning"><strong>判读边界</strong><p>同步上升可能由产业扩张、库存、加工贸易、价格变化或统计差异造成。信号不是规避管制、非法转口或个案事实的认定；缺失月份不插值，不完整国家不进入排名。</p></div>
    </section>

    <section className="section" id="policy"><div className="section-heading"><div><p>CONTROL TIMELINE</p><h2>政策与管制时间线</h2></div><p>HS 编码只是筛查入口。是否受控取决于管制编码、技术参数、最终用户、最终用途以及查询时有效的政策。</p></div><div className="timeline">{policies.map((item,index)=><a className="timeline-item" href={item.url} target="_blank" rel="noreferrer" key={item.date}><span>{item.date}</span><i>{String(index+1).padStart(2,"0")}</i><div><h3>{item.title} ↗</h3><p>{item.body}</p></div></a>)}</div><div className="control-ledger"><h3>可观察管制筛查表</h3>{controls.map(item=><a href={item.source} target="_blank" rel="noreferrer" key={item.referenceHs}><span>{item.referenceHs}</span><strong>{item.item}</strong><p>{item.parameters}</p><em>{item.status} ↗</em></a>)}</div></section>

    <section className="section sources-section" id="sources"><div className="section-heading"><div><p>SOURCE CENTER</p><h2>来源、口径与可复核性</h2></div><p>每组数据保留来源发布日期、访问日期、HS 版本、完整年度/月度口径及限制说明。</p></div><div className="source-grid">{sources.map(source=><a className="source-card" href={source.url} target="_blank" rel="noreferrer" key={source.tag}><span>{source.tag}</span><div><h3>{source.title} ↗</h3><p>{source.detail}</p></div><small>{source.period} · 访问 {SNAPSHOT_DATE}</small></a>)}</div><div className="method-grid"><div><span>M01</span><h3>计算</h3><p>同一时期、同一 HS 编码：印度自中国进口额 ÷ 印度全球进口额；合并项先求金额合计再计算份额。</p></div><div><span>M02</span><h3>时间</h3><p>2025 自然年作为完整基准；2026 年 1—5 月只作为最新月度数据参考，不与完整年混算。</p></div><div><span>M03</span><h3>编码版本</h3><p>当前矩阵和月度序列使用 HS 2022（H6）；页面展示 8 位筛查码，统计口径仍按来源可复核层级标注。跨越修订点的趋势标注 HS 2017→2022 对照。</p></div><div><span>M04</span><h3>限制</h3><p>8 位码用于业务单证对齐，不表示公开统计已全部下钻至 HS8；镜像贸易、CIF/FOB、数量单位和分类差异也会影响判读。本工具不构成法律意见。</p></div></div></section>

    <section className="section report-center" id="reports">
      <div className="section-heading"><div><p>WORD REPORTS</p><h2>分析报告下载</h2></div><p>总报告独立归档在本栏目；每个商品和子项也生成对应 Word 版，便于离线审阅、业务数据校验和内部流转。</p></div>
      <div className="overall-report-card">
        <div><span>MASTER REPORT / {REPORT_DATE}</span><h3>中国-印度供应链依赖图谱总分析报告</h3><p>汇总重点商品矩阵、化肥专题、工程设备专题、第三国路径边界、HS8 筛查码说明和结论准确度分级。</p></div>
        <a href={reportHref("overall")} download>下载总报告 Word 版 ↗</a>
      </div>
      <div className="report-download-grid">{allCommodityRecords.map(item=><a href={reportHref(item.id)} download key={item.id}><span>HS8 {hs8Of(item)}</span><strong>{item.name}</strong><small>{statLevelOf(item)} · {item.completeYear.share.toFixed(1)}% · {reportAccuracyById[item.id]?.level??defaultReportAccuracy.level}</small></a>)}</div>
    </section>

    <footer><div><strong>中印供应链依赖图谱</strong><p>公开研究工具 · 静态数据快照 · 无需登录</p></div><div><span>快照生成</span><b>{SNAPSHOT_DATE}</b></div><a href="#top">回到顶部 ↑</a></footer>

    {selected&&selectedRecord&&selectedReport&&<div className="drawer-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setSelected(null)}}>
      <aside className="detail-drawer" role="dialog" aria-modal="true" aria-labelledby="drawer-title">
        <button className="drawer-close" onClick={()=>setSelected(null)} aria-label="关闭详情">×</button>
        <p className="eyebrow">COMMODITY REPORT / {REPORT_DATE}</p>
        <h2 id="drawer-title">{selectedRecord.name}</h2>
        <p className="drawer-english">{selectedRecord.english}</p>
        {selectedChildren.length>0&&<div className="commodity-subnav" role="tablist" aria-label={`${selected.name}子项`}>
          {[selected,...selectedChildren].map((item,index)=><button key={item.id} role="tab" aria-selected={selectedRecord.id===item.id} className={selectedRecord.id===item.id?"active":""} onClick={()=>setSelectedSubitem(item.id)}><small>{index===0?"总览":`HS8 ${hs8Of(item)}`}</small><strong>{item.name}</strong></button>)}
        </div>}
        <div className="drawer-tags"><code>{CURRENT_HS_VERSION} · HS8 {hs8Of(selectedRecord)}</code><span>{statLevelOf(selectedRecord)}</span><span>{selectedRecord.category}</span>{selectedRecord.proxy&&<span>代理编码</span>}{selectedRecord.controlled&&<span className="risk">管制筛查</span>}</div>
        <div className="report-status"><span className={`evidence-level evidence-${selectedReport.evidence.replace("中等偏低","medium-low").replace("中等","medium").replace("低","low")}`}>证据等级 · {selectedReport.evidence}</span><span>{selectedReport.status}</span></div>
        <div className="drawer-report-cover"><small>专项分析报告</small><h3>{selectedReport.title}</h3><p>{selectedReport.executive}</p></div>
        <a className="report-download-btn" href={reportHref(selectedRecord.id)} download>下载本商品 Word 分析报告 ↗</a>
        <div className="drawer-metrics"><div><span>印度自中国进口</span><strong>{formatB(selectedRecord.completeYear.china)}</strong></div><div><span>印度全球进口</span><strong>{formatB(selectedRecord.completeYear.world)}</strong></div><div><span>对华来源占比</span><strong>{selectedRecord.completeYear.share.toFixed(1)}%</strong></div></div>
        <a className="drawer-source" href={COMTRADE} target="_blank" rel="noreferrer">UN Comtrade · 2025 · {CURRENT_HS_VERSION}（H6）· 访问 {selectedRecord.accessedAt} ↗</a>

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

        <section><h3>商品定义与口径</h3><p>{selectedRecord.definition}</p></section>
        <section><div className="drawer-section-title"><h3>月度数据与趋势</h3><span>2024-12—2026-06 · {CURRENT_HS_VERSION} · HS8 {hs8Of(selectedRecord)} · {statLevelOf(selectedRecord)}</span></div><MonthlyTrend points={selectedMonthly}/></section>
        <section><div className="drawer-section-title"><h3>五年趋势</h3><span>2021—2025 · {CROSSWALK_HS_VERSION} · 对华来源占比</span></div>{selectedRecord.trend?<div className="trend-chart">{selectedRecord.trend.map(point=><div className="trend-year" key={point.year}><span>{point.share.toFixed(1)}%</span><div><i style={{height:`${Math.max(6,point.share)}%`}}/></div><small>{point.year}</small></div>)}</div>:<div className="trend-unavailable"><strong>未跨版本合并</strong><p>该子项展示 HS 2022 月度序列；尚未建立可靠的 HS 2017→2022 年度对照序列。</p></div>}</section>
        <section><h3>主要替代供应国</h3><div className="alternatives">{selectedRecord.alternatives.map(country=><span key={country}>{country}</span>)}</div><p>按可比双边数据识别，表示其他来源，不代表短期内具备等量替代能力，也不自动构成中转国。</p></section>
        <section className="report-references"><h3>证据来源</h3><ul>{selectedReport.references.map(reference=><li key={reference}>{reference}</li>)}</ul><p>报告研究日期：{REPORT_DATE}。路径证据用于风险筛查，不构成违法转口、规避关税或规避管制的认定。</p></section>
        <section className="pulse-box"><h3>2026 月度数据说明</h3><p>TradeStat 已发布 2026 年 1—5 月数据；该 HS 项处于复核队列，本快照不以缺失值推算或替代完整年度数值。</p><a href={TRADESTAT} target="_blank" rel="noreferrer">India TradeStat · 更新 2026-07-15 ↗</a></section>
        {selectedRecord.controlled&&<section className="control-box"><h3>{selectedRecord.controlled}</h3><p>参考 HS 只能用于初筛；是否受控仍取决于技术参数、最终用户、最终用途与当前有效政策。</p><a href={CONTROL_CATALOG} target="_blank" rel="noreferrer">核对 2026 年许可证管理目录 ↗</a></section>}
        <p className="fineprint">数据单位为现价美元；数值经过十亿美元换算和显示舍入，比例使用未舍入值计算。报告结论基于公开来源，须结合 HS6/8、BOM、原产地与企业级单证复核。</p>
      </aside>
    </div>}
  </main>;
}
