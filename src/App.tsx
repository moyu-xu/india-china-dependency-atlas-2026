import { Fragment, memo, useEffect, useMemo, useState } from "react";
import { MONTHLY_SOURCE_ACCESSED, MONTHLY_SOURCE_LABEL, MONTHLY_SOURCE_URL, monthlyTradeById, type MonthlyTradePoint } from "./data/monthlyTrade";
import chinaCustomsHs8 from "./data/chinaCustomsHs8.json";
import { enterpriseProductAliasByCommodityId, enterpriseProductsBySlug, typicalEnterprises, type EnterpriseMechanism, type EnterpriseRiskChainStep, type TypicalEnterprise, type TypicalEnterpriseProduct } from "./data/typicalEnterprises";

type Category = "全部" | "原材料" | "医药化工" | "电子与电力" | "工业机械" | "工程设备" | "车辆零部件";
type TrendPoint = { year: string; china: number; world: number; share: number };
type EvidenceLevel = "已复核" | "高概率" | "中等" | "中等偏低" | "低";
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
type PublicEvidenceEntry = {
  source: string;
  fact: string;
  meta: string;
  url: string;
};
type SensitiveUseEntry = {
  label: "明确涉军" | "军民两用链条风险" | "战略基础设施相关" | "下游涉军场景";
  item: string;
  company: string;
  case: string;
  source: string;
  url: string;
  reliability: "高" | "中" | "低";
  conclusion?: boolean;
};

type MappingReliability = "高" | "中" | "低";
type ChinaHs8Profile = {
  codes: string[];
  scope: "精确 HS8" | "HS8 子项集合" | "HS6 国际可比口径";
  mappingNote: string;
  countryMappings: { country: string; code: string; version: string; reliability: MappingReliability }[];
  controlCategory: string;
  controlStatus: "未列为重点管制筛查" | "需结合技术参数" | "重点核验";
  controlParameters: string;
  controlEffective: string;
};
type ChinaControlMeta = Pick<ChinaHs8Profile, "controlCategory" | "controlStatus" | "controlParameters" | "controlEffective">;

export type CommodityRecord = {
  id: string;
  hs: string;
  hs8?: string;
  name: string;
  english: string;
  category: Exclude<Category, "全部">;
  completeYear: { period: "2025"; china: number; world: number; share: number; source: "UN Comtrade" };
  latestPulse: { period: "2026-01—05"; china: null; world: null; share: null; completeness: "官方库已发布，逐项以月度图为准"; source: "India TradeStat" };
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

type CustomsAnnual = { usd: number; rows: number; firstQty: number; secondQty: number };
type RouteCoverage = "2025→2026 YTD";
type RoutePair = [number, number | null];
type CustomsMonth = { period: string; usd: number; rows: number; firstQty: number; secondQty: number };
type CustomsTradeMode = { code: string; name: string; usd: number; rows: number; months: CustomsMonth[] };
type CustomsHs8Code = {
  code: string;
  name: string;
  rows: number;
  annual: Record<string, CustomsAnnual>;
  months: CustomsMonth[];
  tradeModes: CustomsTradeMode[];
  firstUnit: string;
  secondUnit: string;
};
type CustomsHs6Profile = {
  hs6: string;
  rows: number;
  annual: Record<string, CustomsAnnual>;
  months: CustomsMonth[];
  tradeModes: CustomsTradeMode[];
  hs8: CustomsHs8Code[];
};
type MatrixGroup = {
  id: string;
  title: string;
  english: string;
  description: string;
  children: string[];
};

export type RouteSignal = {
  id: string;
  product: string;
  hs: string;
  hub: string;
  nodes: string[];
  coverage: RouteCoverage;
  cnToHub: RoutePair;
  hubToIndia: RoutePair;
  legs?: { label: string; values: RoutePair }[];
  directToIndia: RoutePair;
  reliability: "高" | "中" | "低";
  evidence: string;
  methodSteps: string[];
  inference: string;
  caveat: string;
  sourceDetail: string;
  source: string;
};

export type RouteNetworkSignal = {
  id: string;
  product: string;
  hs: string;
  nodes: string[];
  coverage: RouteCoverage;
  legs: { label: string; values: RoutePair }[];
  directToIndia: RoutePair;
  reliability: "高" | "中" | "低";
  evidence: string;
  methodSteps: string[];
  inference: string;
  caveat: string;
  sourceDetail: string;
  source: string;
};

const SNAPSHOT_DATE = "2026-07-23";
const REPORT_DATE = "2026-07-23";
const CURRENT_HS_VERSION = "HS 2022";
const APP_BASE = import.meta.env.BASE_URL.replace(/\/$/,"");
const CROSSWALK_HS_VERSION = "HS 2017→2022 对照";
const COMTRADE = "https://uncomtrade.org/docs/un-comtrade-api/";
const TRADESTAT = "https://tradestat.commerce.gov.in/meidb/commodity_wise_all_countries_import";
const TIA = "https://trade-analytics.commerce.gov.in/public";
const CONTROL_RULE = "https://xzfg.moj.gov.cn/front/law/detail?LawID=1735&Query=";
const CONTROL_CATALOG = "https://exportcontrol.mofcom.gov.cn/article/hgfw/lywxcx/gzqd/202601/1203.html";
const CUSTOMS_CASE = "https://gujaratcustoms.gov.in/juridictional_commissionerate/public/storage/pdfs/7bRyuZebEmCGU3qLJ13vFhyHyoz2Nl3QpOWhUIz6.pdf";
const enterpriseHref = (slug:string) => `${APP_BASE}/products/${slug}/enterprises`;
const productDetailHref = (productId:string) => `${APP_BASE}/?product=${productId}`;
const enterpriseRouteSlug = () => {
  const path = window.location.pathname.replace(/\/$/,"");
  const prefix = `${APP_BASE}/products/`;
  if (!path.startsWith(prefix)) return "";
  const rest = path.slice(prefix.length);
  return rest.endsWith("/enterprises") ? rest.replace(/\/enterprises$/,"") : "";
};

const categories: Category[] = ["全部", "原材料", "医药化工", "电子与电力", "工业机械", "工程设备", "车辆零部件"];
const pulse = { period: "2026-01—05", china: null, world: null, share: null, completeness: "官方库已发布，逐项以月度图为准", source: "India TradeStat" } as const;
const annual = (china: number, world: number) => ({ period: "2025", china, world, share: china / world * 100, source: "UN Comtrade" } as const);
const chinaHs8Profile: Record<string, ChinaControlMeta> = {
  fertilizer_urea: { controlCategory:"化肥/农资", controlStatus:"未列为重点管制筛查", controlParameters:"产品成分、用途与许可证政策", controlEffective:"现行目录" },
  fertilizer_dap: { controlCategory:"化肥/农资", controlStatus:"未列为重点管制筛查", controlParameters:"产品成分、用途与许可证政策", controlEffective:"现行目录" },
  fertilizer_mop: { controlCategory:"化肥/农资", controlStatus:"未列为重点管制筛查", controlParameters:"产品成分、用途与许可证政策", controlEffective:"现行目录" },
  fertilizer_npk: { controlCategory:"化肥/农资", controlStatus:"未列为重点管制筛查", controlParameters:"产品成分、用途与许可证政策", controlEffective:"现行目录" },
  tunnel_843031: { controlCategory:"工程设备", controlStatus:"需结合技术参数", controlParameters:"设备型号、掘进方式、最终用途与最终用户", controlEffective:"按现行两用物项规则核验" },
  tunnel_843039: { controlCategory:"工程设备", controlStatus:"需结合技术参数", controlParameters:"设备型号、掘进方式、最终用途与最终用户", controlEffective:"按现行两用物项规则核验" },
  earthmoving_dumptruck: { controlCategory:"工程车辆", controlStatus:"未列为重点管制筛查", controlParameters:"车辆型号、用途与最终用户", controlEffective:"现行目录" },
  earthmoving_crane: { controlCategory:"工程车辆", controlStatus:"未列为重点管制筛查", controlParameters:"车辆型号、用途与最终用户", controlEffective:"现行目录" },
  earthmoving_mixer: { controlCategory:"工程车辆", controlStatus:"未列为重点管制筛查", controlParameters:"车辆型号、用途与最终用户", controlEffective:"现行目录" },
  graphite: { controlCategory:"石墨材料", controlStatus:"重点核验", controlParameters:"纯度、粒径、形态、密度及用途", controlEffective:"按现行出口管制目录核验" },
  rareearth: { controlCategory:"稀土材料", controlStatus:"重点核验", controlParameters:"元素、化合物形态、含量和最终用途", controlEffective:"按现行出口管制目录核验" },
};
const hs8ProfileOf = (item: CommodityRecord): ChinaHs8Profile => {
  const controlMeta = chinaHs8Profile[item.id];
  return {
    codes:[item.hs],
    scope:item.hs.length === 8 ? "精确 HS8" : "HS6 国际可比口径",
    mappingNote:item.hs.length === 8 ? "公开金额按真实中国 HS8 统计。" : "公开金额按 HS2022 六位国际可比口径统计，不补零、不冒充中国 HS8；取得中国海关八位明细后再下钻。",
    countryMappings:[{country:"印度",code:item.hs,version:item.hs.length === 8 ? "India national tariff mapping" : "HS 2022 (H6)",reliability:"高"}],
    controlCategory:controlMeta?.controlCategory ?? "一般贸易筛查",
    controlStatus:controlMeta?.controlStatus ?? "需结合技术参数",
    controlParameters:controlMeta?.controlParameters ?? "商品规格、用途、最终用户与最终用途",
    controlEffective:controlMeta?.controlEffective ?? "现行规则",
  };
};
const hs8Of = (item: CommodityRecord) => item.hs;
const codeLevelOf = (item: CommodityRecord) => item.hs.length === 8 ? "中国 HS8" : "HS6";
const statLevelOf = (item: CommodityRecord) => item.hs.length === 8 ? "中国 HS2022 · 精确 HS8" : "HS2022 · HS6 国际可比口径";
const reportHref = (id: string) => `${import.meta.env.BASE_URL}reports/${id}.docx`;

const batteryPublicEvidence: PublicEvidenceEntry[] = [
  {
    source: "印度新闻信息局（PIB）/印度重工业部",
    fact: "印度政府议会书面答复指出，印度锂等关键矿产需求全部依赖进口；同时提到中国对高性能锂离子电池、正极材料、人造石墨负极材料及相关制造技术实施出口许可管理，可能造成供应收紧。",
    meta: "《Impact on EV Due to Policy Changes in China Pertaining to Lithium》；发布 2026-03-17；访问 2026-07-27。",
    url: "https://www.pib.gov.in/PressReleasePage.aspx?PRID=2241265&lang=1&reg=1",
  },
  {
    source: "Moneycontrol",
    fact: "Moneycontrol 根据印度商业与工业部数据分析称，2023—2024 财年中国占印度电池包进口额的 72.8%，电池包在印度关键矿产相关进口中占 68%。",
    meta: "《India’s critical mineral trade is up 10x in ten years: MC Analysis》；发布 2024-10-21；访问 2026-07-27。",
    url: "https://www.moneycontrol.com/news/business/economy/indias-critical-mineral-trade-is-up-10x-in-ten-years-mc-analysis-12846974.html",
  },
  {
    source: "Amara Raja Group",
    fact: "Amara Raja 披露，其子公司与中国国轩高科子公司 GIB EnergyX 签署磷酸铁锂电芯技术许可协议，合作范围包括电芯技术知识产权、超级工厂建设支持、关键电池材料全球供应链整合和技术服务。",
    meta: "《Amara Raja Announces Strategic Technology Collaboration with Gotion-InoBat-Batteries (GIB)》；发布 2024-06-24；访问 2026-07-27。",
    url: "https://www.amararaja.com/press_release/amara-raja-announces-strategic-technology-collaboration-with-gotion-inobat-batteries-gib/",
  },
];

const rareEarthPublicEvidence: PublicEvidenceEntry[] = [
  {
    source: "印度新闻信息局（PIB）/印度重工业部",
    fact: "印度官方披露，2022—2025 年两个主要稀土永磁体税号下，中国占印度进口金额的 59.6%—81.3%，占进口数量的 82.2%—90.4%。",
    meta: "《Disruption in the Supply of Rare Earth Magnets》；发布 2025-08-01；访问 2026-07-27。",
    url: "https://www.pib.gov.in/PressReleasePage.aspx?PRID=2151394&lang=2&reg=48",
  },
  {
    source: "The Indian Express（印度快报）",
    fact: "报道基于官方贸易数据称，2024—2025 财年印度永久磁体进口量约 5.37 万吨，其中约 5 万吨来自中国，占比约 93%。",
    meta: "《Before China’s rare earth curbs, India’s permanent magnet imports nearly doubled in FY25》；发布 2025-06-09；访问 2026-07-27。",
    url: "https://indianexpress.com/article/business/india-permanent-magnet-imports-fy25-china-rare-earth-curbs-10057092/",
  },
  {
    source: "CRISIL Ratings",
    fact: "CRISIL 指出，印度上一财年约 540 吨稀土磁体进口中超过 80% 来自中国；汽车企业通常仅有四至六周库存。",
    meta: "《Shortage of rare earth magnet can decelerate India’s automotive ride》；发布 2025-06-10；访问 2026-07-27。",
    url: "https://www.crisilratings.com/en/home/newsroom/press-releases/2025/06/shortage-of-rare-earth-magnet-can-decelerate-indias-automotive-ride.html",
  },
];

const tunnellingPublicEvidence: PublicEvidenceEntry[] = [
  {
    source: "The Indian Express（印度快报）",
    fact: "报道调查显示，孟买重大基础设施项目使用的 18 台盾构机中，8 台由中国企业制造，另外 10 台虽为欧美品牌但在中国制造。",
    meta: "《Crucial to Mumbai infra projects, tunnelling machines made in China》；发布 2020-06-23；访问 2026-07-27。",
    url: "https://indianexpress.com/article/india/crucial-to-mumbai-infra-projects-tunnelling-machines-made-in-china-6471694/",
  },
  {
    source: "The Indian Express（印度快报）",
    fact: "报道援引德国海瑞克和印度商业与工业部长表态，部分供印度项目使用、在中国制造的盾构机因中国海关清关异常而延迟或无法交付。",
    meta: "《Tunnel boring machines: Machines for India delayed, German firm flags bottleneck at Chinese customs》；发布 2024-11-02；访问 2026-07-27。",
    url: "https://indianexpress.com/article/business/tunnel-boring-machines-machines-for-india-delayed-german-firm-flags-bottleneck-at-chinese-customs-9649284/",
  },
];

const engineeringVehiclePublicEvidence: PublicEvidenceEntry[] = [
  {
    source: "印度贸易救济总局（DGTR）",
    fact: "印度 DGTR 对原产于或进口自中国的轮式装载机反倾销最终裁定显示，2018—2019 年至 2021—2022 调查期，中国轮式装载机占印度相关进口数量的 94.52%—98.35%。",
    meta: "《Final Findings: Anti-dumping investigation concerning imports of “Wheel Loaders” originating in or exported from China PR》；发布 2023-09-29；访问 2026-07-27。",
    url: "https://dgtr.gov.in/sites/default/files/2024-08/WL%20NCV_29-9-2023.pdf",
  },
  {
    source: "ICRA",
    fact: "ICRA 指出，印度矿山和工程机械行业约 50% 的零部件需求按价值依赖进口，主要供应来源包括中国、日本和韩国；进口部件集中于底盘、精密液压系统、电子控制单元、传感器和远程信息处理系统。",
    meta: "《Increasing component localisation could offer ~Rs. 25,000 crore annual opportunity to construction equipment vendors by FY2030》；发布 2024-09；访问 2026-07-27。",
    url: "https://www.icra.in/Newsletter/9168262a-c574-49de-ac1e-d3b3fcea580e/ICRA%20Insight_Sept2024/ICRA%20Insight_Sept2024.html",
  },
];

const publicEvidenceById: Record<string, PublicEvidenceEntry[]> = {
  battery: batteryPublicEvidence,
  rareearth: rareEarthPublicEvidence,
  tunnel: tunnellingPublicEvidence,
  tunnel_843031: tunnellingPublicEvidence,
  tunnel_843039: tunnellingPublicEvidence,
  earthmoving: engineeringVehiclePublicEvidence,
  earthmoving_dumptruck: engineeringVehiclePublicEvidence,
  earthmoving_crane: engineeringVehiclePublicEvidence,
  earthmoving_mixer: engineeringVehiclePublicEvidence,
};

const sensitiveUseById: Record<string, SensitiveUseEntry[]> = {
  rareearth: [
    {
      label: "明确涉军",
      item: "稀土永磁体 / 稀土材料",
      company: "印度汽车、航空航天、国防和电子制造供应链",
      case: "印度官方材料将稀土永磁体列入电动汽车、可再生能源、电子、航空航天和国防等关键用途；印度媒体和评级机构同时披露，印度稀土磁体进口高度依赖中国来源。",
      source: "PIB / Indian Express / CRISIL Ratings",
      url: "https://www.pib.gov.in/PressReleasePage.aspx?PRID=2151394&lang=2&reg=48",
      reliability: "高",
      conclusion: true,
    },
  ],
  pumps: [
    {
      label: "明确涉军",
      item: "舰船泵、流体控制和海事保障系统",
      company: "Kirloskar Brothers / 印度海军舰船平台",
      case: "Kirloskar Marine & Defence 公开称其服务印度海军、海岸警卫队、陆军、空军和军工厂，产品用于航母、潜艇、护卫舰等军用海事平台；公开报道还提到其为 INS Taragiri 提供泵系统。",
      source: "Kirloskar Brothers / ET Manufacturing",
      url: "https://www.kirloskarpumps.com/business-verticals/marine-defence/",
      reliability: "高",
      conclusion: true,
    },
  ],
  toolparts: [
    {
      label: "下游涉军场景",
      item: "机床零部件、精密加工部件",
      company: "印度军民两用零部件贸易企业",
      case: "公开制裁报道显示，部分印度企业涉及电子、航空零部件、机床及零部件等军民两用物项贸易；该线索适合用于识别精密加工零部件的敏感下游，但需继续匹配具体 HS8、企业和批次。",
      source: "The Indian Express / US sanctions reporting",
      url: "https://indianexpress.com/article/business/electronic-aircraft-parts-most-indian-firms-on-list-supplied-dual-use-goods-9647775/lite/",
      reliability: "中",
      conclusion: true,
    },
  ],
  machineparts: [
    {
      label: "军民两用链条风险",
      item: "钻探、凿井和工程机械关键零部件",
      company: "印度工程装备和重型制造企业",
      case: "该类零部件可服务矿山、地下工程和重型装备维护。公开资料能证明下游工业与战略工程用途，涉军属性需结合项目业主、设备清单和最终用途文件进一步核验。",
      source: "ICRA / 公开行业资料",
      url: "https://www.icra.in/Newsletter/9168262a-c574-49de-ac1e-d3b3fcea580e/ICRA%20Insight_Sept2024/ICRA%20Insight_Sept2024.html",
      reliability: "中",
    },
  ],
  earthmoving_dumptruck: [
    {
      label: "战略基础设施相关",
      item: "非公路用自卸车、矿山和工程车辆",
      company: "BEML、JCB India 等印度重型装备承接企业",
      case: "印度工程装备行业公开资料显示，矿山和工程机械关键部件仍依赖进口，中国是重要来源之一；部分承接企业同时服务基础设施、矿山和国防/公共工程场景。",
      source: "DGTR / ICRA / 企业公开资料",
      url: "https://dgtr.gov.in/sites/default/files/2024-08/WL%20NCV_29-9-2023.pdf",
      reliability: "中",
      conclusion: true,
    },
  ],
  earthmoving_crane: [
    {
      label: "战略基础设施相关",
      item: "汽车起重机和大型吊装设备",
      company: "印度工程装备、港口、基础设施和公共工程承包企业",
      case: "汽车起重机主要用于重大工程、港口、能源和基础设施项目，可能进入军民两用工程保障场景；公开贸易数据提示中国来源集中度较高，具体涉军项目需用采购合同和设备清单核验。",
      source: "中国海关 HS8 数据 / UN Comtrade / 行业公开资料",
      url: "https://comtradeplus.un.org/",
      reliability: "中",
    },
  ],
  tunnel_843031: [
    {
      label: "战略基础设施相关",
      item: "自推进隧道掘进设备",
      company: "印度地铁、高铁、地下工程项目业主和 EPC 承包商",
      case: "印度媒体调查和后续报道显示，中国制造或中国供应链参与印度重大隧道工程设备供应，且中国海关清关变化曾影响供印设备交付；该线索属于战略基础设施装备依赖，不等同于军工采购。",
      source: "The Indian Express",
      url: "https://indianexpress.com/article/business/tunnel-boring-machines-machines-for-india-delayed-german-firm-flags-bottleneck-at-chinese-customs-9649284/",
      reliability: "中",
    },
  ],
  tunnel_843039: [
    {
      label: "战略基础设施相关",
      item: "非自推进隧道掘进设备",
      company: "印度地铁、高铁、地下工程项目业主和 EPC 承包商",
      case: "公开项目证据支持中国制造基地和中国供应链参与印度隧道工程装备交付；该税号口径较宽，需要结合型号、项目和设备清单识别真实盾构或掘进设备。",
      source: "The Indian Express",
      url: "https://indianexpress.com/article/india/crucial-to-mumbai-infra-projects-tunnelling-machines-made-in-china-6471694/",
      reliability: "中",
    },
  ],
  battery: [
    {
      label: "军民两用链条风险",
      item: "锂离子蓄电池、电池包和储能系统",
      company: "印度电池、整车、两轮车和储能系统企业",
      case: "公开来源可确认印度动力电池和储能链条对中国技术、材料和中游制造能力存在依赖；目前不把该线索写成印度军工直接采购中国电池。",
      source: "PIB / Amara Raja / Moneycontrol",
      url: "https://www.pib.gov.in/PressReleasePage.aspx?PRID=2241265&lang=1&reg=1",
      reliability: "中",
    },
  ],
  graphite: [
    {
      label: "军民两用链条风险",
      item: "天然石墨和电池负极材料链条",
      company: "电池材料、储能和新能源制造企业",
      case: "石墨可进入电池负极材料和储能链条。公开资料足以支持关键材料风险提示，但尚不足以认定印度军工直接采购中国石墨。",
      source: "PIB / 公开关键矿物资料",
      url: "https://www.pib.gov.in/neWSite/erelcontent.aspx?lang=2&reg=48&relid=278713",
      reliability: "低",
    },
  ],
};

const commodityIdByEnterpriseProductId: Record<string,string> = {
  battery: "battery",
  semiconductor: "semiconductor",
  rareearth: "rareearth",
  "industrial-machinery-parts": "toolparts",
  "construction-machinery": "earthmoving_dumptruck",
  "tunnel-boring-machine": "tunnel_843031",
};

const militaryCaseProducts = typicalEnterprises
  .map(product => ({
    product,
    enterprises: product.enterprises.filter(enterprise => enterprise.militaryStatus),
  }))
  .filter(({ enterprises }) => enterprises.length > 0);

const commodities: CommodityRecord[] = [
  { id: "battery", hs: "850760", name: "锂离子蓄电池", english: "Lithium-ion accumulators", category: "电子与电力", completeYear: annual(3.807624325, 4.083603910), latestPulse: pulse, alternatives: ["日本", "印度尼西亚", "韩国", "越南", "德国"], definition: "HS 850760：锂离子蓄电池，不包含铅酸蓄电池及其他化学体系。", sourcePublished: "2026-07", accessedAt: SNAPSHOT_DATE },
  { id: "semiconductor", hs: "854142", name: "未组装光伏电池", english: "Photovoltaic cells not assembled in modules or panels", category: "电子与电力", completeYear: annual(1.989338056, 2.673415238), latestPulse: pulse, alternatives: ["印度尼西亚", "埃塞俄比亚", "老挝", "越南", "泰国"], definition: "HS 854142：未装在组件内或未组装成块的光电池，不与其他二极管、晶体管及光伏组件合并。", sourcePublished: "2026-07", accessedAt: SNAPSHOT_DATE },
  { id: "fertilizer", hs: "31", name: "化肥", english: "Fertilizers", category: "医药化工", completeYear: annual(2.160695784, 14.171272537), latestPulse: pulse, alternatives: ["俄罗斯", "沙特阿拉伯", "摩洛哥", "阿曼", "卡塔尔"], definition: "HS 31 化肥总项；详情下钻至尿素、磷酸二铵（DAP）、氯化钾（MOP）与 NPK 四个 HS6 子项。总项用于观察整体来源暴露，不能替代分品类判断。", sourcePublished: "2026-07", accessedAt: "2026-07-23", searchTerms: "尿素 DAP 磷酸二铵 MOP 氯化钾 NPK 310210 310530 310420 310520", children: ["fertilizer_urea","fertilizer_dap","fertilizer_mop","fertilizer_npk"], trend: [{year:"2021",china:2.6875,world:9.1168,share:29.5},{year:"2022",china:2.3375,world:17.2598,share:13.5},{year:"2023",china:2.6069,world:10.4229,share:25.0},{year:"2024",china:0.8541,world:7.7090,share:11.1},{year:"2025",china:2.1607,world:14.1713,share:15.2}] },
  { id: "graphite", hs: "250410", name: "粉末或鳞片状天然石墨", english: "Natural graphite in powder or flakes", category: "原材料", completeYear: annual(0.003700898, 0.039662767), latestPulse: pulse, alternatives: ["马达加斯加", "坦桑尼亚", "莫桑比克", "德国", "美国"], definition: "HS 250410：粉末或鳞片状天然石墨；是否受控仍取决于纯度、粒径、形态、密度和用途。", sourcePublished: "2026-07", accessedAt: SNAPSHOT_DATE, controlled: "部分石墨相关物项受控" },
  { id: "rareearth", hs: "284690", name: "其他稀土金属化合物", english: "Other compounds of rare-earth metals", category: "原材料", completeYear: annual(0.002689114, 0.006087380), latestPulse: pulse, alternatives: ["奥地利", "日本", "德国", "美国", "法国"], definition: "HS 284690：除铈化合物外的其他稀土金属、钇或钪的无机或有机化合物；管制判断仍需下钻元素与技术参数。", sourcePublished: "2026-07", accessedAt: SNAPSHOT_DATE, controlled: "部分中重稀土化合物受控" },
  { id: "pumps", hs: "841370", name: "其他离心泵", english: "Other centrifugal pumps", category: "工业机械", completeYear: annual(0.077506298, 0.223729790), latestPulse: pulse, alternatives: ["日本", "德国", "美国", "意大利", "墨西哥"], definition: "HS 841370：其他离心泵，不包含容积式泵及液体提升机。", sourcePublished: "2026-07", accessedAt: SNAPSHOT_DATE },
  { id: "toolparts", hs: "846693", name: "金属加工机床专用零件及附件", english: "Parts for machine-tools of headings 8456–8461", category: "工业机械", completeYear: annual(0.102360587, 0.327527779), latestPulse: pulse, alternatives: ["中国台湾", "日本", "德国", "美国", "意大利"], definition: "HS 846693：专用于或主要用于 HS 8456—8461 所列机床的零件及附件。", sourcePublished: "2026-07", accessedAt: SNAPSHOT_DATE },
  { id: "machineparts", hs: "843143", name: "钻探或凿井机械零件", english: "Parts for boring or sinking machinery", category: "工程设备", completeYear: annual(0.125859977, 0.296263156), latestPulse: pulse, alternatives: ["美国", "意大利", "加拿大", "芬兰", "阿联酋"], definition: "HS 843143：专用于或主要用于钻探或凿井机械的零件，不再与全部工程机械零件合并。", sourcePublished: "2026-07", accessedAt: SNAPSHOT_DATE },
  { id: "tunnel", hs: "843031/843039", name: "盾构机", english: "Tunnel boring machines", category: "工程设备", completeYear: annual(0.042488353, 0.108409376), latestPulse: pulse, alternatives: ["美国", "新加坡", "芬兰", "奥地利", "南非"], definition: "土压平衡盾构机、泥水平衡盾构机与硬岩 TBM 的项目级观察项。HS 843031 与 843039 同时混入采煤机、截岩机和其他掘进设备，只能作为整机贸易筛查池，不能把合计金额等同于盾构机成交额或台数。", sourcePublished: "2026-07", accessedAt: SNAPSHOT_DATE, proxy: true, searchTerms: "盾构 TBM 隧道掘进机 土压平衡 泥水平衡 硬岩 843031 843039", children: ["tunnel_843031","tunnel_843039"] },
  { id: "earthmoving", hs: "870410/870510/870540", name: "工程车", english: "Special-purpose construction vehicles", category: "工程设备", completeYear: annual(0.022815544, 0.059909220), latestPulse: pulse, alternatives: ["瑞典", "加拿大", "泰国", "芬兰", "荷兰"], definition: "工程车整车筛查项，合并非公路用自卸车、汽车起重机和混凝土搅拌车三个 HS6 子项。未纳入混合消防、医疗等多类专用车辆的 HS 870590，也不包含一般挖掘机、装载机或零部件。", sourcePublished: "2026-07", accessedAt: SNAPSHOT_DATE, searchTerms: "工程车 矿用自卸车 汽车起重机 混凝土搅拌车 870410 870510 870540", children: ["earthmoving_dumptruck","earthmoving_crane","earthmoving_mixer"] },
];

const fertilizerSubitems: CommodityRecord[] = [
  { id: "fertilizer_urea", hs: "310210", name: "尿素", english: "Urea", category: "医药化工", completeYear: annual(0.878822312, 4.694018868), latestPulse: pulse, alternatives: ["阿曼", "俄罗斯", "卡塔尔", "印度尼西亚", "沙特阿拉伯"], definition: "HS 310210 尿素。贸易价值使用自然年，印度化肥部国别数量使用财政年度；两个时间窗口必须分开阅读。", sourcePublished: "2026-07", accessedAt: "2026-07-23" },
  { id: "fertilizer_dap", hs: "310530", name: "磷酸二铵（DAP）", english: "Diammonium phosphate", category: "医药化工", completeYear: annual(0.450036058, 4.909200456), latestPulse: pulse, alternatives: ["沙特阿拉伯", "摩洛哥", "俄罗斯", "澳大利亚", "约旦"], definition: "HS 310530 磷酸氢二铵（DAP）。该品类对中国出口政策和印度采购节奏敏感，年度份额波动较大。", sourcePublished: "2026-07", accessedAt: "2026-07-23" },
  { id: "fertilizer_mop", hs: "310420", name: "氯化钾（MOP）", english: "Potassium chloride", category: "医药化工", completeYear: annual(0.000025641, 1.251671655), latestPulse: pulse, alternatives: ["俄罗斯", "土库曼斯坦", "加拿大", "约旦", "以色列"], definition: "HS 310420 氯化钾（MOP）。印度几乎完全依赖进口，但中国在该品类中不是关键直接来源。", sourcePublished: "2026-07", accessedAt: "2026-07-23" },
  { id: "fertilizer_npk", hs: "310520", name: "含氮磷钾三种肥效元素的肥料", english: "Mineral or chemical fertilizers containing N, P and K", category: "医药化工", completeYear: annual(0.009068417, 1.209994350), latestPulse: pulse, alternatives: ["俄罗斯", "沙特阿拉伯", "挪威", "以色列", "阿联酋"], definition: "HS 310520：含氮、磷、钾三种肥效元素的矿物肥料或化学肥料；不与印度更宽的 NPK/NPKS 财年统计混算。", sourcePublished: "2026-07", accessedAt: "2026-07-23" },
];

const tunnelSubitems: CommodityRecord[] = [
  { id: "tunnel_843031", hs: "843031", name: "自推进采煤机、截岩机及隧道掘进机械", english: "Self-propelled coal or rock cutters and tunnelling machinery", category: "工程设备", completeYear: annual(0.040596479, 0.102945050), latestPulse: pulse, alternatives: ["美国", "新加坡", "芬兰", "奥地利", "南非"], definition: "HS 843031：自推进的采煤机、截岩机及隧道掘进机械。金额仅对应这一法定商品物项，不再称作盾构机金额；识别盾构机仍需型号和项目资料。", sourcePublished: "2026-07", accessedAt: SNAPSHOT_DATE },
  { id: "tunnel_843039", hs: "843039", name: "其他采煤机、截岩机及隧道掘进机械", english: "Other coal or rock cutters and tunnelling machinery", category: "工程设备", completeYear: annual(0.001891874, 0.005464327), latestPulse: pulse, alternatives: ["韩国", "芬兰", "荷兰", "意大利", "俄罗斯"], definition: "HS 843039：其他非自推进采煤机、截岩机及隧道掘进机械。金额只对应法定税目，不推算盾构机台数。", sourcePublished: "2026-07", accessedAt: SNAPSHOT_DATE },
];

const earthmovingSubitems: CommodityRecord[] = [
  { id: "earthmoving_dumptruck", hs: "870410", name: "非公路用自卸车", english: "Off-highway dump trucks", category: "工程设备", completeYear: annual(0.022185146, 0.057239066), latestPulse: pulse, alternatives: ["瑞典", "加拿大", "泰国", "芬兰", "荷兰"], definition: "HS 870410 为非公路用自卸车，主要包括矿山、采石场等封闭场景使用的整车；不包含一般道路货车和零部件。", sourcePublished: "2026-07", accessedAt: SNAPSHOT_DATE },
  { id: "earthmoving_crane", hs: "870510", name: "汽车起重机", english: "Mobile cranes", category: "工程设备", completeYear: annual(0.000400126, 0.000606105), latestPulse: pulse, alternatives: [], definition: "HS 870510 为装在汽车底盘上的起重机整车。2025 年除中国外未报告其他境外来源；印度进口申报与中国出口镜像金额仍须分开列示，不能互相替代。", sourcePublished: "2026-07", accessedAt: SNAPSHOT_DATE },
  { id: "earthmoving_mixer", hs: "870540", name: "混凝土搅拌车", english: "Concrete mixer trucks", category: "工程设备", completeYear: annual(0.000230272, 0.002064049), latestPulse: pulse, alternatives: ["芬兰", "尼泊尔", "墨西哥"], definition: "HS 870540 为混凝土搅拌运输车整车。公开贸易规模小、订单稀疏，单月或单年波动可能主要由少数车辆交付造成。", sourcePublished: "2026-07", accessedAt: SNAPSHOT_DATE },
];

const commoditySubitemsByParent: Record<string,CommodityRecord[]> = {
  fertilizer: fertilizerSubitems,
  tunnel: tunnelSubitems,
  earthmoving: earthmovingSubitems,
};
const aggregateTopicIds = new Set(["fertilizer", "tunnel", "earthmoving"]);
const hiddenCommodityIds = new Set(["fertilizer","fertilizer_urea","fertilizer_dap","fertilizer_mop","fertilizer_npk","earthmoving_mixer"]);
const matrixCommodities = [
  ...commodities.filter(item=>!aggregateTopicIds.has(item.id)),
  ...fertilizerSubitems,
  ...tunnelSubitems,
  ...earthmovingSubitems,
].filter(item=>!hiddenCommodityIds.has(item.id));
const allCommodityRecords = matrixCommodities;
const fertilizerFocusIds = ["fertilizer_urea", "fertilizer_dap", "fertilizer_mop", "fertilizer_npk"];
const matrixGroups: MatrixGroup[] = [
  { id:"chips", title:"芯片与半导体", english:"Chips & semiconductors", description:"聚焦光伏电池等已纳入管制筛查的电子核心物项。", children:["semiconductor"] },
  { id:"power", title:"储能设备", english:"Energy storage", description:"锂离子蓄电池等储能相关物项。", children:["battery"] },
  { id:"critical-minerals", title:"关键矿物与稀土", english:"Critical minerals & rare earths", description:"天然石墨和稀土化合物，需结合参数判断管制属性。", children:["graphite","rareearth"] },
  { id:"fluid-control", title:"泵类设备", english:"Pumps", description:"保留离心泵等可继续核验的具体物项。", children:["pumps"] },
  { id:"industrial-parts", title:"工业机械零部件", english:"Industrial machinery parts", description:"机床、钻探和凿井机械关键零部件。", children:["toolparts","machineparts"] },
  { id:"tunnelling", title:"隧道掘进设备", english:"Tunnelling machinery", description:"自推进与非自推进隧道掘进相关设备。", children:["tunnel_843031","tunnel_843039"] },
  { id:"construction-vehicles", title:"工程车辆", english:"Construction vehicles", description:"非公路自卸车、汽车起重机。", children:["earthmoving_dumptruck","earthmoving_crane"] },
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
    evidence: "高概率",
    status: "直接依赖与中游技术依赖均突出",
    executive: "蓄电池是样本中对华来源占比最高的商品。印度政府议会答复已明确提示新能源汽车制造商对中国中游加工能力、先进电池和正负极材料存在供应链脆弱性；企业官方技术合作案例也显示印度本土电芯产能建设仍需引入中国电芯技术与关键材料供应链能力。越南、香港、印度尼西亚、日本、马来西亚和韩国仍作为第三国路径筛查节点，但必须区分电芯、模组与 PACK 的实质加工。",
    dataPoints: [
      "2025 年印度自中国进口 43.13 亿美元，全球进口 49.47 亿美元，对华来源占比 87.2%。",
      "印度重工业部 2026 年 3 月 17 日议会书面答复指出，印度锂等关键矿产需求全部依赖进口，并明确提到中国高性能锂离子电池、正极材料、人造石墨负极材料及制造技术出口许可管理可能造成供应收紧。",
      "Moneycontrol 根据印度商业与工业部数据分析称，2023—2024 财年中国占印度电池包进口额的 72.8%，电池包在印度关键矿产相关进口中占 68%。",
      "Amara Raja Group 2024 年 6 月 24 日披露，其子公司与中国国轩高科子公司 GIB EnergyX 签署磷酸铁锂电芯技术许可协议，范围包括电芯技术知识产权、超级工厂建设支持、关键电池材料全球供应链整合和技术服务。",
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
      "87.2% 的对华来源占比与印度政府对中游加工能力脆弱性的表述相互印证，说明风险不只在成品蓄电池贸易额，还延伸至正负极材料、电芯技术、BMS、制造工艺和关键设备调试能力。",
      "企业技术合作证据表明，印度本土化并不等于完全脱离中国供应链。即便未来印度本地完成 PACK 或电芯制造，关键知识产权、材料认证和供应链整合仍可能形成持续依赖。",
      "越南具备规模和产业能力的双重信号，较香港等纯贸易节点更可能发生实质加工。合规判断应审查 BOM、工序、增值比例和原产地证书。",
    ],
    conclusion: "锂离子蓄电池应列为高概率、高优先级供应安全品类。当前可确认印度在电池包、正负极材料、制造技术和中游加工环节对中国依赖较高；越南是首要路径筛查节点，但现有证据不足以认定大规模非法转口。",
    monitoring: ["电芯、模组、PACK 的 HS8 与料号映射", "越南工厂工序与区域增值比例", "香港、印尼、日本等次级来源的月度异常增量"],
    references: ["印度新闻信息局（PIB）/印度重工业部：《Impact on EV Due to Policy Changes in China Pertaining to Lithium》，2026-03-17", "Moneycontrol：《India’s critical mineral trade is up 10x in ten years: MC Analysis》，2024-10-21", "Amara Raja Group：《Amara Raja Announces Strategic Technology Collaboration with Gotion-InoBat-Batteries (GIB)》，2024-06-24", "OEC 2024 电池双边贸易结构", "Volza HS 8507 对印 shipment 开放摘要"],
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
    evidence: "高概率",
    status: "稀土中游与永磁体依赖证据充分",
    executive: "本项展示的贸易编码为 HS 284690 稀土化合物，但新增证据主要来自印度官方和行业资料对稀土永磁体及中游加工环节的披露。应把“稀土化合物贸易额”和“稀土永磁体供应链依赖”分开阅读：前者用于观察化合物进口来源，后者用于判断印度制造业对中国稀土中游能力的脆弱性。",
    dataPoints: ["2025 年印度自中国进口约 491 万美元，全球进口约 1294 万美元，对华来源占比 37.9%。", "印度重工业部 2025 年 8 月 1 日议会答复披露，2022—2025 年两个主要永磁体税号下，中国占印度进口金额的 59.6%—81.3%，占进口数量的 82.2%—90.4%。", "《印度快报》基于官方贸易数据报道，2024—2025 财年印度永久磁体进口量约 5.37 万吨，其中约 5 万吨来自中国，占比约 93%。", "CRISIL Ratings 2025 年 6 月指出，印度上一财年约 540 吨稀土磁体进口中超过 80% 来自中国，汽车企业通常仅有四至六周库存。", "印度官方数量表显示，HS 2846 总进口量由 2019—20 年度 1375 吨降至 2023—24 年度 1086 吨；中国在 2020—21 至 2023—24 年连续保持主要来源国。"],
    routes: [
      { nodes: ["中国", "日本", "印度"], label: "替代采购/加工链监测", basis: "日本是可观察替代来源，但公开数据未证明其中包含中国原产成分。" },
      { nodes: ["中国", "韩国", "印度"], label: "替代采购/加工链监测", basis: "韩国同属可观察来源；该路径仅用于前序原产地核验。" },
    ],
    routeBoundary: "两条路径均是风险网络而非转口事实。对于受控物项，技术参数、最终用户和最终用途优先于 HS4 与发票国。",
    analysis: ["政策敏感度远高于金额本身。稀土永磁体的官方份额证据强于 HS 284690 化合物金额证据，说明印度对华依赖更集中在磁体和中游加工环节。", "审批延迟和库存周转数据表明，供应扰动可以在数周内传导到印度汽车、电机和新能源产业。", "通过第三国采购不当然绕开中国规则，也不当然意味着违法；关键是原产、加工、再出口义务、最终用户和最终用途。"],
    conclusion: "稀土相关供应链应判定为高概率依赖，尤其是永磁体和中游加工环节。HS 284690 化合物页仍需保持编码边界：不能把永磁体数据直接混算为化合物金额，但足以支持该类物项进入高优先级管制与供应审计。",
    monitoring: ["284690 子目与具体元素、化合物形态、含量和用途", "85051190、85051900 等永磁体税号的中国份额和审批状态", "日本、韩国等替代来源的前序原产地", "许可证、最终用户与最终用途声明"],
    references: ["印度新闻信息局（PIB）/印度重工业部：《Disruption in the Supply of Rare Earth Magnets》，2025-08-01", "The Indian Express：《Before China’s rare earth curbs, India’s permanent magnet imports nearly doubled in FY25》，2025-06-09", "CRISIL Ratings：《Shortage of rare earth magnet can decelerate India’s automotive ride》，2025-06-10", "中国商务部、海关总署 2025 年 4 月稀土相关出口管制公告"],
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
    evidence: "高概率",
    status: "中国制造与出口交付环节依赖明确",
    executive: "公开项目证据可以确认中国厂商及中国制造基地参与印度重大隧道工程供货；印度主流媒体还披露，孟买重大基础设施项目使用的 18 台盾构机全部具有中国制造关联。HS 843031/843039 不是盾构机专属税号，因此 2025 年合并筛查池 39.2% 的对华来源占比只能用于观察来源暴露，不能当作盾构机成交额或台数。",
    dataPoints: ["2025 年 HS 843031 与 843039 合并口径下，印度自中国进口约 4248.84 万美元，全球进口约 1.0841 亿美元，对华来源占比 39.2%。", "《印度快报》2020 年调查称，孟买重大基础设施项目使用的 18 台盾构机中，8 台由中国企业制造，另外 10 台虽为欧美品牌但在中国制造；报道还援引当地供应商估计称，当时印度部署的盾构机中近 90% 具有中国企业、中国制造基地或中国供应链关联。", "《印度快报》2024 年报道援引德国海瑞克和印度商业与工业部长表态，部分供印度项目使用、在中国制造的盾构机因中国海关清关异常而延迟或无法交付。", "报告整理的 2024 年印度进口数据显示：HS 843031 自中国进口 654.49 万美元、43 件；HS 843039 自中国进口 14.89 万美元、558 件，后者的低价值与高件数说明其作为盾构机代理的杂质很高。", "中国铁建重工官方项目资料显示，至少有 5 台泥水平衡盾构机用于孟买沿海公路和班加罗尔两个项目；孟买设备于 2020 年 3 月从上海直接发往孟买。"],
    routes: [
      { nodes:["中国","印度"], label:"上海—孟买项目直运", basis:"中国铁建重工官方项目资料明确记载设备在长沙制造、从上海装船并直接发往孟买，是项目级直供证据。" },
      { nodes:["中国","新加坡","印度"], label:"HS 843031 新加坡中转强线索", basis:"2024 年印度自新加坡进口 827.9 万美元，同期新加坡自中国进口 9661.4 万美元；两端规模支持筛查，但未闭合原产地与逐票流向。" },
      { nodes:["中国","新加坡","印度"], label:"HS 843039 新加坡中转一般线索", basis:"印度自新加坡进口约 37.4 万美元，但缺少新加坡进口端的中国原产对应闭环，证据弱于 HS 843031。" },
    ],
    routeBoundary: "报告没有取得任何 A 级“同一货物由中国出口、第三国再出口、最终进入印度项目”的闭环单证。新加坡路径只能视为贸易重叠线索；已知孟买项目反而有直接运输证据。",
    analysis: ["盾构机是低频、大额、按项目定制的资本品，年度贸易值极易被少数合同左右。项目合同、设备序列号、制造商交付记录比宽税号占比更能说明真实依赖。", "公开案例显示，依赖并不只体现为中国品牌，也包括欧美品牌在中国制造、组装或发运的设备。对印度项目而言，制造基地、出口放行、备件和现场服务都可能成为实际约束点。", "印度对中国的依赖主要体现在大直径泥水平衡盾构机的制造、交付、备件与现场服务能力。芬兰、欧洲、美国等来源可构成替代，但工法适配、直径、地质条件和服务体系决定了替代并非同质。"],
    conclusion: "盾构机相关依赖应判定为高概率：印度重大项目存在可核实的中国制造和供应链关联，且中国出口放行变化曾对交付形成现实约束。39.2% 仅代表两个 HS6 筛查池的来源占比；第三国转口尚未证实，新加坡只应列入后续单证核验名单。",
    monitoring: ["项目合同、设备序列号与制造商交付记录", "盾构直径、工法、地质适配及备件服务", "新加坡贸易商的原产地证书、提单与再出口申报"],
    references: ["The Indian Express：《Crucial to Mumbai infra projects, tunnelling machines made in China》，2020-06-23", "The Indian Express：《Tunnel boring machines: Machines for India delayed, German firm flags bottleneck at Chinese customs》，2024-11-02", "中国国资委：中国铁建重工孟买沿海公路盾构机项目资料", "UN Comtrade / WITS：HS 843031、843039"],
  },
  tunnel_843031: {
    title: "HS 843031 自推进掘进机械筛查报告", evidence: "高概率", status: "盾构相关筛查池 · 项目证据强",
    executive: "该税号是盾构机最重要的公开贸易筛查池之一，但同时包含自推进采煤机和截岩机。2025 年中国占比约 39.4%；数值能反映来源暴露，不能独立证明盾构整机数量。结合印度媒体关于孟买项目 18 台盾构机全部具有中国制造关联的调查，以及中国制造基地清关变化影响印度交付的公开报道，盾构相关依赖可按高概率处理。",
    dataPoints: ["2025 年印度自中国进口约 4059.65 万美元，全球进口约 1.0295 亿美元，对华来源占比 39.4%。", "《印度快报》2020 年调查称，孟买重大基础设施项目使用的 18 台盾构机全部具有中国制造关联，其中 8 台由中国企业制造，另外 10 台为欧美品牌但在中国制造。", "《印度快报》2024 年报道称，德国海瑞克向印度交付、在中国制造的盾构机出现中国海关清关瓶颈，影响印度项目交付。", "2024 年报告口径下，中国金额 654.49 万美元、43 件，在欧盟、芬兰、美国、新加坡、南非之后，宽税号层面并非中国主导。", "2024 年印度自新加坡进口 827.9 万美元，而新加坡自中国进口 9661.4 万美元、2772 件，形成较强但未闭环的转口筛查线索。"],
    routes: [{nodes:["中国","新加坡","印度"],label:"新加坡贸易重叠筛查",basis:"两端贸易规模同时可见，但没有同一设备的序列号、原产地证书和再出口单证，不能认定实际转口。"}],
    routeBoundary: "HS 843031 产品构成复杂；即便两段贸易同年重叠，也可能是不同设备或零部件。", analysis: ["2024—2025 数值变化可能来自少数项目交付，也可能来自采矿机械，不能直接解释为盾构需求突然上升。", "验证时应优先用设备名称、刀盘直径、工法和序列号把真正 TBM 从税号池中剥离。"],
    conclusion: "中国来源暴露值得关注，新加坡是首要核验节点；但“印度约四成盾构机来自中国”这一表述不成立，准确说法应是 HS 843031 筛查池约四成来自中国。结合项目级公开案例，盾构机制造、组装和出口交付环节对中国依赖可判定为高概率。", monitoring:["设备品名与序列号","新加坡再出口原产地","项目交付月份与单笔金额"], references:["The Indian Express：《Crucial to Mumbai infra projects, tunnelling machines made in China》，2020-06-23","The Indian Express：《Tunnel boring machines: Machines for India delayed, German firm flags bottleneck at Chinese customs》，2024-11-02","UN Comtrade 2025 HS 843031","WITS 2024 双边贸易数据"],
  },
  tunnel_843039: {
    title: "HS 843039 其他掘进设备筛查报告", evidence: "高概率", status: "高杂质筛查池 · 依赖按项目证据判读",
    executive: "该税号对盾构机的指向性较弱。2025 年中国占比约 34.6%，但 2024 年出现低金额、高件数组合，说明大量申报很可能不是完整盾构机。该子项的高概率判断来自盾构机项目证据，而不是把 HS 843039 全部等同于盾构整机。",
    dataPoints:["2025 年印度自中国进口约 189.19 万美元，全球进口约 546.43 万美元，对华来源占比 34.6%。","《印度快报》披露的孟买项目和海瑞克交付受阻案例说明，印度盾构机项目对中国制造、组装和出口放行环节存在现实依赖。","2024 年中国金额仅 14.89 万美元却申报 558 件，无法按完整盾构机理解。","2024 年印度自新加坡进口约 37.4 万美元、11 件；新加坡全球出口约 346.8 万美元，但缺少中国原产入口闭环。"],
    routes:[{nodes:["中国","新加坡","印度"],label:"新加坡弱线索",basis:"只有印度进口端和新加坡全球出口端可比，缺少对应中国来源数据，因此仅作假设。"}], routeBoundary:"数量、单价和货物定义均不足，不能由该税号推断盾构机台数或转口比例。", analysis:["该税号更适合发现异常申报和项目交付时间，而不适合测量整机依赖。","若业务数据能提供型号和净重，可先排除配件、小型截岩设备及非自推进装置。","高概率依赖判断仅适用于盾构机相关项目链条；对 HS 843039 税号内非盾构设备，仍需逐票剥离。"], conclusion:"盾构机项目链条对中国制造、组装和出口交付环节的依赖可判定为高概率；但 HS 843039 本身杂质较高，中国份额和新加坡路径仍需业务数据验证。", monitoring:["单价、净重与设备型号","完整整机/部件申报区分","新加坡进口来源与再出口提单"], references:["The Indian Express：《Crucial to Mumbai infra projects, tunnelling machines made in China》，2020-06-23","The Indian Express：《Tunnel boring machines: Machines for India delayed, German firm flags bottleneck at Chinese customs》，2024-11-02","UN Comtrade 2025 HS 843039","WITS 2024 双边贸易数据"],
  },
  earthmoving: {
    title: "印度工程车整车依赖与转口链审查", evidence: "高概率", status: "车型依赖显著分化",
    executive: "工程车不能用一个宽税号概括。2025 年三个严格整车子项合并后中国占比约 38.1%；其中汽车起重机占比最高，非公路用自卸车贡献绝大多数金额，混凝土搅拌车依赖较低。新增 A+ 证据来自印度 DGTR 对轮式装载机的反倾销最终裁定，证明至少在部分工程车辆领域，中国长期占据印度进口数量的绝大多数；ICRA 也指出印度矿山和工程机械约一半零部件按价值依赖进口，中国是关键部件主要来源之一。",
    dataPoints:["2025 年 HS 870410、870510、870540 合并口径下，印度自中国进口约 2281.55 万美元，全球进口约 5990.92 万美元，对华来源占比 38.1%。","印度 DGTR 对原产于或进口自中国的轮式装载机反倾销最终裁定显示，2018—2019 年至 2021—2022 调查期，中国轮式装载机占印度相关进口数量的 94.52%—98.35%。","ICRA 2024 年 9 月行业研究指出，印度矿山和工程机械行业约 50% 的零部件需求按价值依赖进口，主要供应来源包括中国、日本和韩国，进口部件集中于底盘、精密液压系统、电子控制单元、传感器和远程信息处理系统。","报告显示 2024 年非公路用自卸车中国份额为 43.3%；汽车起重机的中国出口镜像金额为 2.2969 亿美元，超过其后四国合计 56 倍以上；混凝土搅拌车总贸易规模很小。","不同报告方向存在显著镜像差异，尤其是汽车起重机和自卸车，不能把中国出口统计与印度进口统计直接混为一列。"],
    routes:[{nodes:["中国","印度尼西亚","印度"],label:"非公路用自卸车的印尼强线索",basis:"2024 年印度自印尼进口 848.8 万美元，同期中国对印尼出口 2.6847 亿美元；缺少原产地闭环，仍不能认定转口。"},{nodes:["中国","新加坡","印度"],label:"运输设备分拨背景",basis:"DGCI&S 宽口径运输设备样本显示约 5.9% 经新加坡装运；该比例不能直接外推到任何单一工程车型。"}],
    routeBoundary:"报告没有取得工程车的逐票闭环转口证据。印尼、新加坡和香港只能作为单证审计的优先节点，不能被标注为已确认中转国。轮式装载机 A+ 证据不能直接外推到所有工程车辆，只能说明部分工程车辆领域已存在非常高的中国进口集中度。", analysis:["中国依赖呈车型分化：自卸车决定金额规模，起重机体现高集中度信号，搅拌车则是低规模、低稳定性市场。合并值只能用于总览，采购判断必须进入子项。","DGTR 轮式装载机裁定和 ICRA 零部件本地化研究共同说明，印度工程机械的脆弱性既有整机集中度，也有底盘、液压、电子控制、传感器和远程信息处理等关键零部件进口依赖。","镜像差异可能来自 FOB/CIF、时间错配、转口、退运、分类差异或漏报。差异本身是审计触发器，不是转口证据。"], conclusion:"工程车辆及关键零部件的对华依赖可判定为高概率，但必须分车型、分零部件层级描述。轮式装载机存在 A+ 级官方高集中度证据；本页三个整车子项仍按各自 HS6 数据判读。印尼转口线索值得优先核验，尚不能认定存在稳定的中国—第三国—印度转口链。", monitoring:["车型、底盘号与设备序列号","轮式装载机与现有三类整车子项的编码边界","底盘、液压、ECU、传感器等关键零部件原产地","印度进口与中国出口镜像差异","印尼/新加坡原产地证书与提单"], references:["印度贸易救济总局（DGTR）：《Final Findings: Anti-dumping investigation concerning imports of “Wheel Loaders” originating in or exported from China PR》，2023-09-29","ICRA：《Increasing component localisation could offer ~Rs. 25,000 crore annual opportunity to construction equipment vendors by FY2030》，2024-09","UN Comtrade / WITS：HS 870410、870510、870540","DGCI&S 原产国/装运国专题"],
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
  {
    id:"id-pvcell", product:"未组装光伏电池", hs:"854142", hub:"印度尼西亚", nodes:["中国","印度尼西亚","印度"], coverage:"2025→2026 YTD",
    cnToHub:[1028.460378,1003.758289], hubToIndia:[372.239261,711.284286], directToIndia:[1989.338056,303.786458], reliability:"高",
    evidence:"同一 HS2022 六位物项下，中国海关出口至印尼 2025 全年为 10.285 亿美元，2026 已导出月份为 10.038 亿美元；印尼报告出口至印度由 2025 全年 3.722 亿美元，到 2026 已公布月份已达 7.113 亿美元。",
    methodSteps:["锁定真实 HS6 854142，不与光伏组件或其他半导体合并。","第一段使用中国海关出口统计，中国→印尼；第二段使用印尼报告对印度出口。","将 2026 已公布月份与 2025 全年对照，并以印度自中国进口 2026 已公布值作为直接流参照。"],
    inference:"印尼在 2026 已公布月份的对印出口已经超过 2025 全年，且自中国进口也保持较大规模，应列为光伏电池原产地、加工工序和提单穿透的优先核验国；这仍是统计筛查，不是同批货物证明。",
    caveat:"印尼具有本地光伏制造与贸易活动；两段增长可能对应不同企业、不同电池规格或真实加工。",
    sourceDetail:"中国海关总署统计网导出 CSV；中国报告出口至印尼，单位美元；UN Comtrade 公共 API 补充印尼报告出口和印度报告进口；HS2022 H6 854142；2025 全年与 2026 已公布月份；访问 2026-07-24。", source:COMTRADE
  },
  {
    id:"sg-selfpropelled", product:"自推进采煤机、截岩机及隧道掘进机械", hs:"843031", hub:"新加坡", nodes:["中国","新加坡","印度"], coverage:"2025→2026 YTD",
    cnToHub:[48.015090,18.734267], hubToIndia:[10.008576,0], directToIndia:[40.596479,64.898955], reliability:"低",
    evidence:"中国海关出口至新加坡 2025 全年为 4,801.5 万美元，2026 已导出月份为 1,873.4 万美元。新加坡对印度出口 2025 全年为 1,000.9 万美元；2026 已公布月份暂未观察到同口径记录。",
    methodSteps:["按法定 HS6 843031 统计，不把金额直接命名为盾构机成交额。","第一段使用中国海关出口统计，中国→新加坡；第二段读取新加坡对印度出口。","2026 已公布月份未形成末端连续金额，因此仅保留为低可靠历史基准和单证核验线索。"],
    inference:"新加坡仍可作为该掘进机械税号下的贸易节点核验对象，但 2026 已公布数据尚未支持新的路径信号；需要核查设备序列号、装运港、工法与是否发生翻新或实质加工。",
    caveat:"HS 843031 同时包含采煤机、截岩机和隧道掘进机械，无法单凭贸易额识别盾构机或确认同一设备。",
    sourceDetail:"中国海关总署统计网导出 CSV；中国报告出口至新加坡，单位美元；UN Comtrade 公共 API 补充新加坡报告出口和印度报告进口；HS2022 H6 843031；2025 全年与 2026 已公布月份；访问 2026-07-24。", source:COMTRADE
  },
  {
    id:"id-battery", product:"锂离子蓄电池", hs:"850760", hub:"印度尼西亚", nodes:["中国","印度尼西亚","印度"], coverage:"2025→2026 YTD",
    cnToHub:[528.493736,496.669021], hubToIndia:[54.637520,15.772564], directToIndia:[3807.624325,1388.493729], reliability:"高",
    evidence:"中国海关出口至印尼 2025 全年为 5.285 亿美元，2026 已导出月份为 4.967 亿美元；印尼报告出口至印度 2025 全年为 5,463.8 万美元，2026 已公布月份为 1,577.3 万美元。",
    methodSteps:["锁定锂离子蓄电池 HS6 850760。","第一段使用中国海关出口统计，中国→印尼；第二段使用印尼对印度出口，不使用印度尼西亚全球贸易总额替代。","2026 已公布月份前段已达 2025 全年的 94%，后段达 29%，因此保留为高可靠筛查信号。"],
    inference:"印尼节点值得核查电芯、模组与 PACK 的生产工序、BOM 和原产地转换；两段规模可观察，但不能视为中国货物等额转运。",
    caveat:"印尼正在扩展本地电池产业，且电池可能发生实质加工；低基数会放大第二段增幅。",
    sourceDetail:"中国海关总署统计网导出 CSV；中国报告出口至印尼，单位美元；UN Comtrade 公共 API 补充印尼报告出口和印度报告进口；HS2022 H6 850760；2025 全年与 2026 已公布月份；访问 2026-07-24。", source:COMTRADE
  },
  {
    id:"my-graphite", product:"粉末或鳞片状天然石墨", hs:"250410", hub:"马来西亚", nodes:["中国","马来西亚","印度"], coverage:"2025→2026 YTD",
    cnToHub:[0.526478,0.350299], hubToIndia:[0.098340,0], directToIndia:[3.700898,0.550826], reliability:"低",
    evidence:"中国海关出口至马来西亚 2025 全年为 52.6 万美元，2026 已导出月份为 35.0 万美元；马来西亚对印度出口 2025 全年为 9.8 万美元，2026 已公布月份暂未观察到记录。",
    methodSteps:["使用真实 HS6 250410，不用 HS4 2504 总项。","复核中国海关出口至马来西亚、马来西亚对印度出口及印度自中国进口直接流。","由于 2026 末端对印段缺失，仅列为低可靠弱信号。"],
    inference:"适合优先核对纯度、粒径、球形化、原产地证书和加工记录；不应把 HS6 全部金额视为受控石墨。",
    caveat:"金额很小且低基数导致增幅失真；HS6 不能识别出口管制技术参数。",
    sourceDetail:"中国海关总署统计网导出 CSV；中国报告出口至马来西亚，单位美元；UN Comtrade 公共 API 补充马来西亚报告出口和印度报告进口；HS2022 H6 250410；2025 全年与 2026 已公布月份；访问 2026-07-24。", source:COMTRADE
  },
  {
    id:"sg-otherboring", product:"其他采煤机、截岩机及隧道掘进机械", hs:"843039", hub:"新加坡", nodes:["中国","新加坡","印度"], coverage:"2025→2026 YTD",
    cnToHub:[1.244221,0.050521], hubToIndia:[0.091329,0], directToIndia:[1.891874,0.530416], reliability:"低",
    evidence:"中国海关出口至新加坡 2025 全年为 124.4 万美元，2026 已导出月份为 5.1 万美元；新加坡对印度出口 2025 全年为 9.1 万美元，2026 已公布月份暂未观察到记录。",
    methodSteps:["限定为 HS6 843039。","复核中国海关出口至新加坡、新加坡对印度出口和印度自中国进口直接流。","2026 已公布月份未形成末端连续金额，因此仅保留为低可靠性单证核验线索。"],
    inference:"新加坡值得在项目交付期核对设备名称、序列号、净重和装运文件，但不足以证明盾构机经新加坡进入印度。",
    caveat:"税号涵盖多类非自推进掘进设备，低金额、高件数或零配件会造成显著杂质。",
    sourceDetail:"中国海关总署统计网导出 CSV；中国报告出口至新加坡，单位美元；UN Comtrade 公共 API 补充新加坡报告出口和印度报告进口；HS2022 H6 843039；2025 全年与 2026 已公布月份；访问 2026-07-24。", source:COMTRADE
  },
];

const routeNetworks: RouteNetworkSignal[] = [
];
const auditedRoutes = routes;
const auditedRouteNetworks = routeNetworks;

const sources = [
  { tag:"IN", title:"印度 DGCI&S TradeStat", detail:"月度库已更新至 2026 年 5 月，最后更新 2026-07-15；2026 年 4 月起部分 ITC HS 编码调整。", period:"2018-01—2026-05", url:TRADESTAT },
  { tag:"TIA", title:"印度贸易情报与分析门户", detail:"FY2025–26 对华进口 1,316.3 亿美元、出口 194.7 亿美元；来源为 DGCIS。", period:"FY2025–26", url:TIA },
  { tag:"UN", title:"UN Comtrade API · HS 2022", detail:"2025 矩阵与 2024-12 后月度记录均核验为 classificationCode H6（HS 2022）；月度请求范围至 2026 年 6 月，其中 2026 年 4—6 月尚未发布，页面明确留空。", period:"2021—2025 / 月度请求至 2026-06", url:COMTRADE },
  { tag:"TSP", title:"外贸公社（TradeSparq）", detail:"用于企业与贸易流向线索核验；具体贸易记录、进口商和供应链关系仍需与海关数据及企业公开资料交叉确认。", period:"按平台可查询范围", url:"https://console.tradesparq.com/" },
  { tag:"FERT", title:"印度化肥部国别—品类附件", detail:"尿素、DAP、MOP、NPK 的财年进口量、对华份额、库存及长期采购协议；与自然年价值口径分开展示。", period:"FY2020–21—FY2025–26", url:"https://sansad.in/getFile/loksabhaquestions/annex/187/AU5699_atvOoH.pdf?source=pqals" },
  { tag:"ROUTE", title:"DGCI&S 化肥直接/间接装运专题", detail:"官方样本显示中国原产化肥 99.9% 直接自中国装运、0.1% 经其他国家装运。", period:"2021-04—2022-02", url:"https://www.dgciskol.gov.in/writereaddata/Downloads/20220504100946Import_from_China_Apr_Feb_2021_22.pdf" },
  { tag:"TBM", title:"中国铁建重工孟买盾构项目资料", detail:"制造商项目资料记录长沙制造、上海装船并直接发往孟买，并披露此前向班加罗尔交付 4 台泥水平衡盾构机。", period:"2020-03", url:"https://en.sasac.gov.cn/2020/03/25/c_4298.htm" },
  { tag:"VEH", title:"DGCI&S 原产国与装运国专题", detail:"提供运输设备直接装运及经新加坡、香港等地装运的宽口径背景；不能外推为单一车型转口比例。", period:"2021-04—2022-02", url:"https://www.dgciskol.gov.in/writereaddata/Downloads/20220504100946Import_from_China_Apr_Feb_2021_22.pdf" },
  { tag:"CASE", title:"印度蒙德拉海关第三国路径裁决书", detail:"以发票、原产地证书、进出提单、斯里兰卡海关材料和当事人陈述确认中国制造数字印刷版材经科伦坡换装后进入印度；仅用于校验取证方法，不外推至其他商品。", period:"涉案交易 2019—2022 / 裁决公开文件", url:CUSTOMS_CASE },
  { tag:"GOI", title:"印度议会答复 4023/2025", detail:"说明对华进口以原材料、中间品、资本品、电子零件、机械及零件等为主。", period:"2025-03-25", url:"https://www.commerce.gov.in/wp-content/uploads/2025/03/LS-USQ-No.4023-dated.-25.03.2025.pdf" },
  { tag:"CN", title:"两用物项出口管制条例与 2026 目录", detail:"管制编码和技术参数优先于 HS 参考编码；最终用户与最终用途同样影响判定。", period:"现行", url:CONTROL_CATALOG },
];
const visibleSources = sources.filter(source=>source.tag!=="FERT" && source.title!=="DGCI&S 化肥直接/间接装运专题");

const policies = [
  { date:"2020.10", title:"《出口管制法》通过", body:"建立两用物项、军品、核以及其他受管制物项的统一法律框架，覆盖境内出口、境外转移和相关服务。", url:"https://www.npc.gov.cn/c2/c30834/202010/t20201017_308277.html" },
  { date:"2020.11", title:"商用密码进口许可与出口管制", body:"商用密码进口许可清单和出口管制清单发布，相关经营者需按清单和许可证要求申报。", url:"https://aqygzj.mofcom.gov.cn/qdml/art/2020/art_aa383a8551a64251a7d202e0c62d4ee4.html" },
  { date:"2020.12", title:"《出口管制法》施行", body:"出口经营者、最终用户和最终用途审查成为法定合规要求，违法责任与域外适用边界同步明确。", url:"https://www.npc.gov.cn/c2/c30834/202010/t20201017_308277.html" },
  { date:"2021.01", title:"2021 年两用物项和技术进出口许可证目录", body:"年度目录细化两用物项和技术的许可编码、商品描述及管理要求。", url:"https://12335.mofcom.gov.cn/articledwmy/zcxx/dwmy/202101/1927463_1.html" },
  { date:"2021.04", title:"出口经营者内部合规机制指引", body:"要求建立受管制清单筛查、最终用户和最终用途审查、交易风险评估及记录留存机制。", url:"https://www.mofcom.gov.cn/zcfb/dwmygl/art/2021/art_3c243ab2b57b4089972bf74ea8d929dc.html" },
  { date:"2021.06", title:"两用物项许可证无纸化办理", body:"推进两用物项和敏感物项许可证电子化、无纸化办理，强化线上核验和留痕。", url:"https://www.mofcom.gov.cn/zfxxgk/gkml/art/2021/art_53736606dffb43a0816a4eb003f14606.html" },
  { date:"2022.01", title:"2022 年两用物项和技术进出口许可证目录", body:"年度目录更新许可编码和商品范围，出口判断仍以目录、参数和最终用途为准。", url:"https://exportcontrol.mofcom.gov.cn/article/hgfw/lywxcx/gzqd/202111/225.html" },
  { date:"2023.01", title:"2023 年两用物项和技术进出口许可证目录", body:"年度目录继续实行许可证管理，配套要求覆盖海关申报和出口经营者合规审查。", url:"https://m.mofcom.gov.cn/article/zcfb/zcwg/202305/20230503410054.shtml" },
  { date:"2023.07", title:"镓、锗相关物项出口管制", body:"镓、锗相关物项纳入出口许可管理，需按公告所列物项和技术参数申请许可。", url:"https://www.mofcom.gov.cn/zcfb/blgg/art/2023/art_ca2e9d349361441f847bdabac5d8331b.html" },
  { date:"2023.07", title:"无人机及相关设备出口管制（一）", body:"对特定无人机发动机、敏感载荷、无线电通信设备和反无人机系统实施出口管制。", url:"https://interview.mofcom.gov.cn/mofcom_interview/front/opdata/downlodePdf?id=20230703424598" },
  { date:"2023.08", title:"无人机及相关设备出口管制（二）", body:"对部分消费级无人机实施临时管制，并明确不得用于军事、核生化及恐怖主义活动。", url:"https://interview.mofcom.gov.cn/mofcom_interview/front/opdata/downlodePdf?id=20230703424616" },
  { date:"2023.10", title:"石墨相关物项出口管制调整", body:"将三项高敏感石墨物项纳入许可管理，并取消五项较低敏感度石墨物项的临时管制。", url:"https://www.mofcom.gov.cn/xwfb/art/2023/art_8114f91bafb3454b970857b825e8e44a.html" },
  { date:"2024.01", title:"2024 年两用物项和技术进出口许可证目录", body:"年度目录更新两用物项许可编码和商品范围，作为年度申报和许可证审核依据。", url:"https://www.mofcom.gov.cn/zcfb/blgg/art/2023/art_9853e2727add4ae7b7089afaff983106.html" },
  { date:"2024.05", title:"航空航天相关设备、软件和技术出口管制", body:"对部分航空航天结构件、发动机制造设备、软件和技术实施许可管理，涉及钛铝合金超塑成形及扩散连接设备。", url:"https://www.mofcom.gov.cn/zfxxgk/gkml/art/2024/art_47f7a3b6d75b418dad1aab682194a48d.html" },
  { date:"2024.07", title:"无人机出口管制优化调整", body:"调整红外成像等载荷参数，增加高精度惯性测量设备要求，并取消部分临时管制；军事和大规模杀伤性武器用途禁限仍保留。", url:"https://www.mofcom.gov.cn/xwfb/xwfyrth/art/2024/art_a5f72afb451b49e183347a2ce0e32585.html" },
  { date:"2024.09", title:"《两用物项出口管制条例》发布", body:"统一规范两用物项出口、过境、转运、通运、再出口和特定境外再转移，建立许可、最终用户和最终用途制度。", url:"https://flk.npc.gov.cn/detail?fileId=&id=ff808181927f0e7b019294a6bf08358f&title=%E4%B8%AD%E5%8D%8E%E4%BA%BA%E6%B0%91%E5%85%B1%E5%92%8C%E5%9B%BD%E4%B8%A4%E7%94%A8%E7%89%A9%E9%A1%B9%E5%87%BA%E5%8F%A3%E7%AE%A1%E5%88%B6%E6%9D%A1%E4%BE%8B&type=" },
  { date:"2024.12", title:"统一两用物项管制清单生效", body:"统一清单与《两用物项出口管制条例》同步生效，取代分散清单；应以实际物项和参数而非仅 HS 编码判断。", url:"https://www.mofcom.gov.cn/zcfb/dwmygl/art/2024/art_e56833e346534981b250bae772d0cbce.html" },
  { date:"2024.12", title:"2025 年两用物项和技术进出口许可证目录", body:"发布 2025 年度许可证目录，细化管制编码、商品描述和许可证管理方式。", url:"https://www.mofcom.gov.cn/zcfb/blgg/art/2024/art_1c34b32dcbdd466395f25e1e0d0824a3.html" },
  { date:"2024.12", title:"对美国特定两用物项出口管制", body:"对镓、锗、锑、超硬材料等对美出口实施更严格的最终用户和最终用途审查，并限制特定石墨出口。", url:"https://exportcontrol.mofcom.gov.cn/article/zcfg/gnzcfg/zcfggzqd/202412/1072.html" },
  { date:"2025.01", title:"28 家美国实体列入出口管制管控名单", body:"禁止向名单实体出口两用物项，并禁止向其转移中国原产两用物项；措施即时生效。", url:"https://www.mofcom.gov.cn/zcfb/dwmygl/art/2025/art_c14d6b7d45e247c596f4d3ecdda9b291.html" },
  { date:"2025.02", title:"钨、碲、铋、钼、铟相关物项出口管制", body:"部分战略矿产、化合物及相关技术纳入许可管理，应按实际物项和参数而非仅按 HS 识别。", url:"https://aqygzj.mofcom.gov.cn/qdml/art/2025/art_a7ac614d3a784deb8f88700cdadd471c.html" },
  { date:"2025.04", title:"部分中重稀土相关物项出口管制", body:"钐、钆、铽、镝、镥、钪、钇等相关物项按公告参数实施出口管制，涉及物项、技术和最终用途审查。", url:"https://www.mofcom.gov.cn/zfxxgk/fdzdgknr/ztfl/dwmygl/art/2025/art_99cf6e4b536d4a6796e6e2ed6d79f12c.html" },
  { date:"2025.06", title:"海关质疑出口管制物项的核查程序", body:"海关认为货物可能属于受管制物项时，出口经营者须在规定期限内提交物项属性、用途和最终用户等证明材料。", url:"https://12335.mofcom.gov.cn/articledwmy/zcxx/dwmy/202506/1942013_1.html" },
  { date:"2025.10", title:"超硬材料相关物项出口管制", body:"对公告列明的超硬材料相关物项实施出口许可管理，重点核查物项属性、技术参数和最终用途。", url:"https://www.mofcom.gov.cn/zfxxgk/gkml/art/2025/art_628491c002b940ad906efc445b1ee260.html" },
  { date:"2025.10", title:"稀土生产、分离设备及原辅料出口管制", body:"对稀土生产、分离设备及相关原辅料实施出口管制，覆盖设备、部件、软件和技术。", url:"https://www.mofcom.gov.cn/zcfb/blgg/art/2025/art_9ee7af86f4274dc1ad16d6d5a6e47245.html" },
  { date:"2025.10", title:"中重稀土物项申报与管制编码要求", body:"受管制货物需在报关单中准确填写两用物项和管制编码；接近参数但未列管的物项也应如实申报。", url:"https://www.mofcom.gov.cn/zfxxgk/gkml/art/2025/art_b9cf403808634a649ce8b3f921f4dcf3.html" },
  { date:"2025.10", title:"境外组织和个人再出口中国稀土相关物项", body:"对含中国受管制稀土成分、使用中国稀土技术或含中国原产受管制物项的境外再出口实施许可和最终用途审查。", url:"https://www.mofcom.gov.cn/zfxxgk/fdzdgknr/ztfl/dwmygl/art/2025/art_148254ba99284928ae6e4f84d1d6f297.html" },
  { date:"2025.10", title:"稀土相关技术出口管制", body:"对稀土开采、分离、冶炼及相关工艺技术实施出口管制，技术转移和境外再转移均需核验。", url:"https://www.mofcom.gov.cn/zfxxgk/fdzdgknr/ztfl/dwmygl/art/2025/art_619fbb66fdd24bbfb49eee4cb837ac61.html" },
  { date:"2026.01", title:"2026 年两用物项和技术进出口许可证目录", body:"年度目录更新许可编码、商品描述和管理方式，作为 2026 年两用物项出口申报依据。", url:"https://www.mofcom.gov.cn/zwgk/zcfb/art/2025/art_c03d1e511b2b486e829d68e8f1422aff.html" },
  { date:"2026.01", title:"对日本军事用户和军事用途的两用物项出口管制", body:"禁止向日本军事用户、军事用途及有助于提升军事能力的用途出口两用物项，并覆盖中国原产物项再出口。", url:"https://www.mofcom.gov.cn/zcfb/zgdwjjmywg/art/2026/art_5eb791b008284131855c37cc70d84e26.html" },
  { date:"2026.02", title:"20 家日本实体列入出口管制管控名单", body:"禁止向名单实体出口两用物项及进行相关境外再转移，强化对军事相关最终用户的筛查。", url:"https://policy.mofcom.gov.cn/claw/clawContent.shtml?id=104956" },
  { date:"2026.04", title:"7 家欧盟实体列入出口管制管控名单", body:"对名单实体实施两用物项出口和境外再转移禁限措施。", url:"https://policy.mofcom.gov.cn/claw/clawContent.shtml?id=106015" },
  { date:"2026.06", title:"10 家美国实体列入出口管制管控名单", body:"对名单实体实施两用物项出口和境外再转移禁限措施。", url:"https://www.mofcom.gov.cn/zwgk/zcfb/art/2026/art_dfa9cc5c1e004d7fbb86f83d249e7986.html" },
  { date:"2026.06", title:"战略矿产出口违法线索举报与核查机制", body:"建立战略矿产两用物项违法出口线索举报平台，重点关注第三国规避、拆分转运、非法技术转移和中间商。", url:"https://policy.mofcom.gov.cn/claw/clawContent.shtml?id=106193" },
  { date:"2026.06", title:"无人机及相关设备海关申报要求", body:"要求准确申报无人机、飞艇、相关设备和零部件以及民用反无人机系统，强化物项归类与许可证核验。", url:"https://12335.mofcom.gov.cn/articledwmy/zcxx/dwmy/202607/1944334_1.html" },
  { date:"2026.06", title:"20 家日本实体列入出口管制管控名单", body:"对新增日本实体实施两用物项出口和境外再转移禁限措施。", url:"https://www.mofcom.gov.cn/zcfb/blgg/gg/2026/art/2026/art_6607ea694b704da8ac5e863a5568e47c.html" },
  { date:"2026.07", title:"临时禁止氦气出口", body:"临时禁止出口特定海关商品编码氦气，措施即时生效，属于专项临时出口管理。", url:"https://policy.mofcom.gov.cn/claw/clawContent.shtml?id=106307" },
  { date:"2026.07", title:"14 家欧盟实体列入出口管制管控名单", body:"对名单实体实施两用物项出口和境外再转移禁限措施。", url:"https://www.mofcom.gov.cn/zcfb/blgg/gg/2026/index.html" },
];

const formatB = (v:number) => v >= 1 ? `$${v.toFixed(v >= 10 ? 1 : 2)}B` : `$${(v*1000).toFixed(v < .01 ? 1 : 0)}M`;
const formatM = (v:number) => v >= 1 ? `$${v.toFixed(v >= 10 ? 1 : 2)}M` : `$${(v*1000).toFixed(0)}K`;
const formatRouteValue = (v:number | null) => v === null ? "未发布" : formatM(v);
const growth = (a:number,b:number) => b === 0 ? (a > 0 ? Infinity : 0) : (a-b)/b*100;
const signed = (v:number) => Number.isFinite(v) ? `${v >= 0 ? "+" : ""}${v.toFixed(0)}%` : "新增";
const routeLegs = (route:RouteSignal) => route.legs ?? [
  { label:"中国→第三国", values:route.cnToHub },
  { label:"第三国→印度", values:route.hubToIndia },
];
const routeYtdRatio = ([base, current]:RoutePair) => current === null ? 0 : base === 0 ? (current > 0 ? Infinity : 0) : current / base * 100;
const routeComparisonLabel = (values:RoutePair) => values[1] === null ? "未发布" : values[0] === 0 ? (values[1] > 0 ? "新增" : "—") : `达2025全年 ${routeYtdRatio(values).toFixed(0)}%`;
const weakestRouteValue = (route:RouteSignal) => Math.min(...routeLegs(route).map(leg=>leg.values[1] ?? 0));
const weakestRouteGrowth = (route:RouteSignal) => Math.min(...routeLegs(route).map(leg=>routeYtdRatio(leg.values)));
type RouteProofRecord = Pick<RouteSignal,"id"|"evidence"|"methodSteps"|"inference"|"sourceDetail"|"caveat">;
function RouteProof({ route }: { route: RouteProofRecord }) {
  return <details className="route-proof"><summary><h4>推演判断过程与数据来源</h4><b>展开 ↕</b></summary><dl className="route-analysis"><div><dt>推理口径</dt><dd>第一段采用中国海关出口统计（中国→中转国，美元），第二段采用公开报告国数据（中转国→印度），并展示印度自中国直接进口作为对照。统计信号不认定实际转口或违法。</dd></div><div><dt>公开数据</dt><dd>{route.evidence}</dd></div><div><dt>判断步骤</dt><dd><ol>{route.methodSteps.map((step,index)=><li key={`${route.id}-step-${index}`}>{step}</li>)}</ol></dd></div><div><dt>推演结论</dt><dd>{route.inference}</dd></div><div><dt>数据来源</dt><dd>{route.sourceDetail}</dd></div><div><dt>限制</dt><dd>{route.caveat}</dd></div></dl></details>;
}
function RouteTradeDetails({ route }: { route: RouteSignal }) {
  return <details className="route-trade-details"><summary><h4>分段贸易数据与直接流</h4><b>展开 ↕</b></summary><div className="route-leg-list">{routeLegs(route).map(leg=><div key={`${route.id}-${leg.label}`}><span>{leg.label}</span><strong>{formatRouteValue(leg.values[0])} → {formatRouteValue(leg.values[1])}</strong><em>{routeComparisonLabel(leg.values)}</em></div>)}</div><p>中国→印度直接流：{formatRouteValue(route.directToIndia[0])} → {formatRouteValue(route.directToIndia[1])}（{routeComparisonLabel(route.directToIndia)}）</p></details>;
}
const exactCommodityReport = (item:CommodityRecord, base:CommodityReport):CommodityReport => ({
  ...base,
  evidence:"已复核",
  title:`${item.name}对华进口依赖与供应风险分析`,
  status:`${codeLevelOf(item)} ${item.hs} · 具体商品物项`,
  executive:`本报告只分析 ${codeLevelOf(item)} ${item.hs}“${item.name}”。2025 年印度从中国进口 ${formatB(item.completeYear.china)}，该商品进口总额为 ${formatB(item.completeYear.world)}，从中国进口占比为 ${item.completeYear.share.toFixed(1)}%。不使用父级税目或补零代理值。`,
  dataPoints:[
    `2025 年印度从中国进口 ${formatB(item.completeYear.china)}。`,
    `2025 年印度该商品进口总额为 ${formatB(item.completeYear.world)}。`,
    `从中国进口金额占该商品进口总额的 ${item.completeYear.share.toFixed(1)}%。`,
  ],
  routes:[],
  routeBoundary:`当前未取得与 ${codeLevelOf(item)} ${item.hs} 完全同口径、可复核的逐段第三国贸易闭环，因此不把父级税目路径套用到本商品。`,
  analysis:[],
  conclusion:item.completeYear.share>=50
    ? `${item.name}对华进口来源集中度较高，应列入优先核验清单；结论仅适用于 ${codeLevelOf(item)} ${item.hs}。`
    : `${item.name}存在一定对华进口暴露，但不能仅凭当前份额认定不可替代；结论仅适用于 ${codeLevelOf(item)} ${item.hs}。`,
  monitoring:[`${codeLevelOf(item)} ${item.hs} 月度进口金额与数量`,"中国出口许可证与技术参数变化","印度进口商、原产地、装运国和最终用途单证"],
  references:["UN Comtrade 2025 · HS 2022 (H6)","印度 DGCI&S TradeStat","中国现行出口管制目录与公告"],
});

const reportAccuracyById: Record<string,{level:AccuracyLevel;reason:string}> = {
  ic: { level:"高概率", reason:"2025 年 HS6 854231 的印度报告进口额、全球总额及 12 个月合计均已逐项复核；本结论不包含第三国路径认定。" },
  battery: { level:"高概率", reason:"2025 年 HS6 850760 的印度报告年度值、月度合计和其他供应来源排名已逐项复核；印度重工业部议会答复、Moneycontrol 官方数据分析和 Amara Raja 官方合作披露共同支持电池包、正负极材料、制造技术及中游加工环节对中国依赖较高。" },
  semiconductor: { level:"高概率", reason:"2025 年 HS6 854142 的年度值、月度合计和其他供应来源排名均已逐项复核；加工地与原产地仍须另行核验。" },
  fertilizer: { level:"高概率", reason:"化肥总项与四类数量来自 UN Comtrade、印度化肥部附件和 DGCI&S 原产国/装运国官方样本，且结论限定为结构性依赖和主导模式判断。" },
  fertilizer_urea: { level:"高概率", reason:"直接份额变化与阿联酋路线反证有官方数量及双边镜像数据支撑；越南路线仅按弱到中等可能性表述。" },
  fertilizer_dap: { level:"高概率", reason:"中国份额回落、替代来源和长期协议均有印度官方附件或可复核 HS6 数据支持。" },
  fertilizer_mop: { level:"高概率", reason:"多年官方数量和 2025 HS6 价值均显示中国份额极低，结论不依赖推测性路径。" },
  fertilizer_npk: { level:"高概率", reason:"2025 自然年 HS6 310520 的进口金额与来源排名已逐项复核；印度财年 NPK/NPKS 数量仅作独立背景，不与该结论混算。" },
  graphite: { level:"推测", reason:"HS6 250410 的贸易金额可复核，但无法识别纯度、粒径和形态等受控参数；管制关联仍需产品规格与许可证材料复核。" },
  rareearth: { level:"高概率", reason:"HS6 284690 化合物金额仅作编码内贸易观察；印度重工业部议会答复、The Indian Express 和 CRISIL 的公开资料直接支持稀土永磁体及中游加工环节对中国高度依赖。" },
  tunnel: { level:"高概率", reason:"The Indian Express 孟买项目调查和海瑞克交付受阻报道支持中国制造、组装和出口交付环节依赖；税号合并值明确限定为筛查池，第三国路径未作事实认定。" },
  tunnel_843031: { level:"高概率", reason:"HS6 843031 法定商品物项的年度金额与来源占比已逐项复核；项目级公开案例支持盾构相关中国制造依赖，页面明确不把该金额等同于盾构机成交额。" },
  tunnel_843039: { level:"高概率", reason:"HS6 843039 年度金额可复核且项目级公开案例支持盾构相关中国制造依赖；该税号杂质较高，页面明确不把该金额等同于盾构机成交额。" },
  earthmoving: { level:"高概率", reason:"三个严格整车税号的合并值与车型分化均可复核；DGTR 轮式装载机最终裁定和 ICRA 零部件本地化研究补强了工程车辆及关键部件依赖判断，结论保留车型边界。" },
  earthmoving_dumptruck: { level:"高概率", reason:"中国份额上升与印尼贸易重叠有年度数据支持，但结论未把印尼路径表述为已证实转口。" },
  earthmoving_crane: { level:"高概率", reason:"HS6 870510 的印度报告进口额、全球总额和 2025 年来源结构已逐项复核；中国出口镜像数据不替代印度进口口径。" },
  earthmoving_mixer: { level:"高概率", reason:"2024—2025 整车金额和数量均显示市场规模小、中国份额较低；企业级依赖另行保留。" },
};

const defaultReportAccuracy = { level:"高概率", reason:"结论主要基于可复核的真实 HS6 商品进口规模、来源占比和审慎的证据边界表述。" } as const;

const formatMonthlyValue = (value:number|null) => value === null ? "—" : value.toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2});

function MonthlyTrend({points}:{points:MonthlyTradePoint[]}) {
  const [metric,setMetric] = useState<"value"|"share">("value");
  const [chartOpen,setChartOpen] = useState(false);
  const [tableOpen,setTableOpen] = useState(false);
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
    <details className="monthly-table-details trend-details" open={chartOpen} onToggle={event=>setChartOpen(event.currentTarget.open)}>
      <summary><span>月度趋势图</span><b>{chartOpen?"收起":"展开"} ↕</b></summary>
      {chartOpen&&<>
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
      </>}
    </details>
    <details className="monthly-table-details" open={tableOpen} onToggle={event=>setTableOpen(event.currentTarget.open)}>
      <summary><span>月度明细表</span><b>{tableOpen?"收起":"展开"} ↕</b></summary>
      {tableOpen&&<div className="monthly-table-wrap">
        <table className="monthly-table">
          <thead><tr><th>月份</th><th>自中国进口</th><th>全球进口</th><th>对华占比</th><th>状态</th></tr></thead>
          <tbody>{points.map(point=><tr key={point.period} className={point.status==="pending"?"pending":""}><td>{point.period}</td><td>{point.china===null?"—":`$${formatMonthlyValue(point.china)}M`}</td><td>{point.world===null?"—":`$${formatMonthlyValue(point.world)}M`}</td><td>{point.share===null?"—":`${point.share.toFixed(1)}%`}</td><td>{point.status==="available"?"已发布":"待发布/核验"}</td></tr>)}</tbody>
        </table>
      </div>}
    </details>
    <p className="monthly-note">月度序列来源：<a href={MONTHLY_SOURCE_URL} target="_blank" rel="noreferrer">{MONTHLY_SOURCE_LABEL}</a>，访问 {MONTHLY_SOURCE_ACCESSED}。印度 TradeStat 声明已更新至 2026-05，但本快照仅展示可由 UN Comtrade API 逐月复核的数值；其余月份不作估算。</p>
  </div>;
}

const formatInteger = (value:number) => value.toLocaleString("zh-CN");
const customsByHs6 = chinaCustomsHs8.byHs6 as Record<string, CustomsHs6Profile>;
const customsProfileOf = (item: CommodityRecord) => customsByHs6[item.hs.slice(0,6)];
const formatUsd = (value:number) => value >= 1_000_000_000 ? `$${(value/1_000_000_000).toFixed(2)}B` : `$${(value/1_000_000).toFixed(2)}M`;
const compactUsd = (value:number) => value ? formatUsd(value) : "—";
const customsYearValue = (profile: CustomsHs6Profile | undefined, year:string) => profile?.annual?.[year]?.usd ?? 0;

const CustomsTrend = memo(function CustomsTrend({months,label,ariaLabel}:{months: CustomsMonth[]; label:string; ariaLabel:string}) {
  const width = 720;
  const height = 250;
  const plot = { left:56, right:18, top:24, bottom:45 };
  const plotWidth = width-plot.left-plot.right;
  const plotHeight = height-plot.top-plot.bottom;
  const maxValue = Math.max(1,...months.map(point=>point.usd/1_000_000));
  const x = (index:number) => plot.left+(months.length<=1?0:index/(months.length-1)*plotWidth);
  const y = (value:number) => plot.top+plotHeight-(value/maxValue)*plotHeight;
  const line = months.map((point,index)=>`${index===0?"M":"L"}${x(index).toFixed(1)},${y(point.usd/1_000_000).toFixed(1)}`).join(" ");
  const gridValues = [0,.25,.5,.75,1].map(ratio=>maxValue*ratio);
  return <>
    <div className="monthly-toolbar"><span>单位：US$ million</span><span>{months[0]?.period ?? "—"}—{months.at(-1)?.period ?? "—"} · {label}</span></div>
    <div className="monthly-chart-wrap">
      <svg className="monthly-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={ariaLabel}>
        {gridValues.map(value=><g key={value}><line className="chart-grid" x1={plot.left} x2={width-plot.right} y1={y(value)} y2={y(value)}/><text className="chart-y-label" x={plot.left-10} y={y(value)+4} textAnchor="end">{value.toFixed(maxValue<10?1:0)}</text></g>)}
        <path className="monthly-line customs" d={line}/>
        {months.map((point,index)=>(index%2===0||index===months.length-1)?<text className="chart-x-label" key={point.period} x={x(index)} y={height-14} textAnchor={index===0?"start":index===months.length-1?"end":"middle"}>{point.period.slice(4)}</text>:null)}
      </svg>
      <div className="monthly-legend"><span><i className="legend-customs"/>{label}</span></div>
    </div>
  </>;
});

function TradeModeTrendCard({mode,scope,inWindow}:{mode: CustomsTradeMode; scope:string; inWindow:(period:string)=>boolean}) {
  const [open,setOpen] = useState(false);
  const modeMonths = mode.months.filter(point=>inWindow(point.period));
  return <details className="trade-mode-trend-card" open={open} onToggle={event=>setOpen(event.currentTarget.open)}>
    <summary className="trade-mode-trend-head">
      <div><code>{mode.code}</code><h4>{mode.name}</h4></div>
      <div><strong>{compactUsd(mode.usd)}</strong><small>{open?"收起":"展开趋势"} ↕</small></div>
    </summary>
    {open&&<CustomsTrend months={modeMonths} label={`${mode.name}出口额`} ariaLabel={`${scope}${mode.name}贸易方式月度趋势图`}/>}
  </details>;
}

const groupChildren = (group: MatrixGroup) => group.children.map(id=>allCommodityRecords.find(record=>record.id===id)).filter(Boolean) as CommodityRecord[];
const groupStats = (items: CommodityRecord[]) => {
  const china = items.reduce((sum,item)=>sum+item.completeYear.china,0);
  const world = items.reduce((sum,item)=>sum+item.completeYear.world,0);
  const customs2025 = items.reduce((sum,item)=>sum+customsYearValue(customsProfileOf(item),"2025"),0);
  return { china, world, share: world ? china/world*100 : 0, customs2025 };
};

function ChinaCustomsHs8Mirror({ item }: { item: CommodityRecord }) {
  const profile = customsProfileOf(item);
  const [selectedHs8,setSelectedHs8] = useState("");
  const [commodityModesOpen,setCommodityModesOpen] = useState(false);
  const [hs8ModesOpen,setHs8ModesOpen] = useState(false);
  const [customsTrendOpen,setCustomsTrendOpen] = useState(false);
  const [customsTableOpen,setCustomsTableOpen] = useState(false);
  const [hs8ListOpen,setHs8ListOpen] = useState(false);
  const [hs8TrendOpen,setHs8TrendOpen] = useState(false);
  const [hs8TableOpen,setHs8TableOpen] = useState(false);
  useEffect(()=>setSelectedHs8(profile?.hs8[0]?.code ?? ""),[item.id, profile]);
  useEffect(()=>setHs8ListOpen(false),[item.id]);
  useEffect(()=>{setCommodityModesOpen(false);setHs8ModesOpen(false);setCustomsTrendOpen(false);setCustomsTableOpen(false);setHs8TrendOpen(false);setHs8TableOpen(false);},[item.id, selectedHs8]);
  if (!profile) {
    return <div className="customs-hs8-empty"><strong>中国海关 HS8 数据待补充</strong><p>当前已导出的海关统计文件中尚未包含 HS {item.hs} 对应的中国出口至印度八位明细。后续补充 CSV 后，本模块会自动显示美元金额、HS8 子项和月度序列。</p></div>;
  }
  const inWindow = (period:string) => period >= "202501" && period <= "202606";
  const months = profile.months.filter(point=>inWindow(point.period));
  const selectedCode = profile.hs8.find(code=>code.code===selectedHs8) ?? profile.hs8[0];
  const selectedMonths = selectedCode?.months.filter(point=>inWindow(point.period)) ?? [];
  const tradeModes = profile.tradeModes.filter(mode=>mode.months.some(point=>inWindow(point.period)));
  const peak = months.reduce((best,point)=>point.usd>best.usd?point:best,months[0]??{period:"—",usd:0,rows:0,firstQty:0,secondQty:0});
  const selectedPeak = selectedMonths.reduce((best,point)=>point.usd>best.usd?point:best,selectedMonths[0]??{period:"—",usd:0,rows:0,firstQty:0,secondQty:0});
  const annual2025 = customsYearValue(profile,"2025");
  const annual2026 = customsYearValue(profile,"2026");
  const singleHs8 = profile.hs8.length === 1;
  const renderTradeModeTrends = (modes: CustomsTradeMode[], scope:string) => (
    <div className="trade-mode-trend-grid">
      {modes.length ? modes.map(mode=><TradeModeTrendCard mode={mode} scope={scope} inWindow={inWindow} key={`${scope}-${mode.code}-${mode.name}`}/>) : <p className="trade-mode-empty">当前导出数据未包含贸易方式月度拆分。</p>}
    </div>
  );
  const renderTradeModePanel = (title:string, modes: CustomsTradeMode[], scope:string, open:boolean, setOpen:(next:boolean)=>void) => {
    const topMode = modes[0];
    const total = modes.reduce((sum,mode)=>sum+mode.usd,0);
    return <details className="trade-mode-panel" open={open} onToggle={event=>setOpen(event.currentTarget.open)}>
      <summary>
        <div><h4>{title}</h4><span>{modes.length} 种贸易方式 · 最大项 {topMode?.name ?? "—"} · 合计 {compactUsd(total)}</span></div>
        <b>{open ? "收起" : "展开"} ↕</b>
      </summary>
      {open&&renderTradeModeTrends(modes,scope)}
    </details>;
  };

  return <div className="customs-hs8-module">
    <div className="customs-hs8-summary">
      <div><span>2025 出口额</span><strong>{compactUsd(annual2025)}</strong></div>
      <div><span>2026 已导出月份</span><strong>{compactUsd(annual2026)}</strong></div>
      <div><span>HS8 子项</span><strong>{profile.hs8.length}<small> 项</small></strong></div>
      <div><span>月度峰值</span><strong>{peak.period} · {compactUsd(peak.usd)}</strong></div>
    </div>
    <details className="monthly-table-details trend-details" open={customsTrendOpen} onToggle={event=>setCustomsTrendOpen(event.currentTarget.open)}>
      <summary><span>中国海关月度趋势图</span><b>{customsTrendOpen ? "收起" : "展开"} ↕</b></summary>
      {customsTrendOpen&&<CustomsTrend months={months} label="中国海关出口额（全部 HS8 合计）" ariaLabel={`${item.name}中国海关HS8出口额月度趋势图`}/>}
    </details>
    {singleHs8&&<p className="customs-hs8-note merge-note">该商品当前仅对应 1 个 HS8，商品总趋势与 HS8 趋势一致，已合并展示。</p>}
    <details className="monthly-table-details" open={customsTableOpen} onToggle={event=>setCustomsTableOpen(event.currentTarget.open)}>
      <summary><span>中国海关月度明细表</span><b>{customsTableOpen ? "收起" : "展开"} ↕</b></summary>
      {customsTableOpen&&<div className="monthly-table-wrap">
        <table className="monthly-table">
          <thead><tr><th>月份</th><th>出口额</th><th>第一数量</th><th>第二数量</th></tr></thead>
          <tbody>{months.map(point=><tr key={point.period}><td>{point.period}</td><td>{compactUsd(point.usd)}</td><td>{formatInteger(point.firstQty)}</td><td>{formatInteger(point.secondQty)}</td></tr>)}</tbody>
        </table>
      </div>}
    </details>
    <div className="commodity-trade-mode">
      {renderTradeModePanel(singleHs8 ? "贸易方式趋势" : "商品子项贸易方式趋势（全部 HS8 加总）",tradeModes,item.name,commodityModesOpen,setCommodityModesOpen)}
    </div>
    {!singleHs8&&<details className="monthly-table-details hs8-list-details" open={hs8ListOpen} onToggle={event=>setHs8ListOpen(event.currentTarget.open)}>
      <summary><span>HS8 商品子项</span><b>{hs8ListOpen ? "收起" : "展开"} ↕</b></summary>
      {hs8ListOpen&&<div className="customs-hs8-list">{profile.hs8.map(code=><button className={code.code===selectedCode?.code?"active":""} key={code.code} onClick={()=>setSelectedHs8(code.code)} type="button">
        <div><code>HS8 {code.code}</code><h4>{code.name}</h4></div>
        <strong>{compactUsd(code.annual["2025"]?.usd ?? 0)}</strong>
        <small>2025 · {code.tradeModes[0]?.name ?? "贸易方式待核验"}</small>
      </button>)}</div>}
    </details>}
    {!singleHs8&&selectedCode&&<div className="customs-hs8-detail">
      <div className="drawer-section-title"><h3>HS8 {selectedCode.code} 月度趋势</h3><span>2025-01—2026-06 · {selectedCode.name}</span></div>
      <div className="customs-hs8-summary compact">
        <div><span>2025 出口额</span><strong>{compactUsd(selectedCode.annual["2025"]?.usd ?? 0)}</strong></div>
        <div><span>2026 已导出月份</span><strong>{compactUsd(selectedCode.annual["2026"]?.usd ?? 0)}</strong></div>
        <div><span>月度峰值</span><strong>{selectedPeak.period} · {compactUsd(selectedPeak.usd)}</strong></div>
        <div><span>主要贸易方式</span><strong>{selectedCode.tradeModes[0]?.name ?? "—"}</strong></div>
      </div>
      <details className="monthly-table-details trend-details" open={hs8TrendOpen} onToggle={event=>setHs8TrendOpen(event.currentTarget.open)}>
        <summary><span>HS8 {selectedCode.code} 月度趋势图</span><b>{hs8TrendOpen ? "收起" : "展开"} ↕</b></summary>
        {hs8TrendOpen&&<CustomsTrend months={selectedMonths} label={`HS8 ${selectedCode.code} 出口额`} ariaLabel={`${selectedCode.name}中国海关HS8出口额月度趋势图`}/>}
      </details>
      {renderTradeModePanel(`HS8 ${selectedCode.code} 贸易方式趋势`,selectedCode.tradeModes,selectedCode.code,hs8ModesOpen,setHs8ModesOpen)}
      <details className="monthly-table-details" open={hs8TableOpen} onToggle={event=>setHs8TableOpen(event.currentTarget.open)}>
        <summary><span>HS8 {selectedCode.code} 月度明细表</span><b>{hs8TableOpen ? "收起" : "展开"} ↕</b></summary>
        {hs8TableOpen&&<div className="monthly-table-wrap">
          <table className="monthly-table">
            <thead><tr><th>月份</th><th>出口额</th><th>第一数量</th><th>第二数量</th></tr></thead>
            <tbody>{selectedMonths.map(point=><tr key={point.period}><td>{point.period}</td><td>{compactUsd(point.usd)}</td><td>{formatInteger(point.firstQty)}</td><td>{formatInteger(point.secondQty)}</td></tr>)}</tbody>
          </table>
        </div>}
      </details>
    </div>}
  </div>;
}

function EnterpriseFlowPage({ product }: { product?: TypicalEnterpriseProduct }) {
  const active = product;
  return <main className="enterprise-page">
    <header className="topbar">
      <a className="brand" href={`${APP_BASE}/`} aria-label="返回首页"><span className="brand-mark">依</span><span>中印供应链依赖图谱<small>INDIA × CHINA SUPPLY ATLAS</small></span></a>
      <nav aria-label="企业流向导航"><a href={`${APP_BASE}/#matrix`}>依赖矩阵</a><a href={`${APP_BASE}/#routes`}>可能的第三国路径</a><a href={`${APP_BASE}/#sources`}>来源中心</a><a href={`${APP_BASE}/#reports`}>报告下载</a></nav>
      <span className="snapshot"><i/> ENTERPRISE FLOW</span>
    </header>
    <section className="enterprise-hero section">
      <div className="section-heading">
        <div><p>ENTERPRISE FLOW / SCREENING</p><h1>典型流向企业</h1></div>
        <a className="text-btn" href={active ? productDetailHref(active.productId) : `${APP_BASE}/#matrix`}>返回商品详情 ↙</a>
      </div>
      <div className="enterprise-switcher" aria-label="商品切换">
        {typicalEnterprises.map(item=><a key={item.slug} className={active?.slug===item.slug?"active":""} href={enterpriseHref(item.slug)}>{item.productName}</a>)}
      </div>
      {!active ? <div className="empty-state"><strong>未找到对应商品</strong><p>请从商品详情页进入“典型流向企业”，或切换到上方已配置的商品。</p></div> : <>
        <div className="enterprise-overview">
          <article>
            <span>PRODUCT</span>
            <h2>{active.productName}</h2>
            <p>{active.summary}</p>
          </article>
          <article>
            <span>FLOW MAP</span>
            <div className="enterprise-flow">
              {active.flow.map((step,index)=><span key={`${active.slug}-${step}`}>{step}{index<active.flow.length-1&&<i>→</i>}</span>)}
            </div>
          </article>
        </div>
        <p className="enterprise-type-note">该商品在印度有流向以下类型企业：</p>
        <div className="enterprise-type-grid">
          {active.enterpriseTypes.map((item,index)=><span key={item}><b>{String(index+1).padStart(2,"0")}</b>{item}</span>)}
        </div>
        <div className="enterprise-card-grid">
          {active.enterprises.filter(company=>company.militaryStatus).map(company=><details className="enterprise-card" open={Boolean(company.riskChain)} key={company.companyName}>
            <summary>
              <div>
                <span>{company.militaryStatus}</span>
                <h3>{company.chineseName ?? company.companyName}</h3>
                <p>{company.englishName}</p>
              </div>
              <b>展开 ↕</b>
            </summary>
            <div className="enterprise-card-body">
              <div className="enterprise-tags"><span className="enterprise-military-tag">{company.militaryStatus}</span><span>{company.industry}</span><span>{company.ownership}</span><span>{company.supplyChainRole}</span></div>
              {company.riskChain&&<EnterpriseRiskChain chain={company.riskChain} />}
              <dl>
                <div><dt>主营业务</dt><dd>{company.business}</dd></div>
                <div><dt>商品用途</dt><dd>{company.productUsage}</dd></div>
                <div><dt>供应链关系</dt><dd>{company.supplyChainRelation}</dd></div>
                <div><dt>典型案例</dt><dd>{company.caseStudy}</dd></div>
              </dl>
              {company.sources.length>0&&<div className="enterprise-source-list">
                <h4>来源</h4>
                {company.sources.filter(source=>source.type!=="用户报告" && source.institution!=="用户提供研究报告").map((source,index)=><article key={`${company.companyName}-${source.title}-${index}`}>
                  <span>{source.type}</span>
                  <div><strong>{source.institution}</strong><p>{source.title}{source.published ? `（${source.published}）` : ""}</p></div>
                  {source.url ? <a href={source.url} target="_blank" rel="noreferrer">原始来源 ↗</a> : <em>用户提供报告</em>}
                </article>)}
              </div>}
            </div>
          </details>)}
        </div>
        <section className="report-conclusion enterprise-conclusion">
          <div className="conclusion-heading"><div><span>JUDGEMENT</span><h3>综合判断</h3></div></div>
          <p>{active.conclusion}</p>
        </section>
      </>}
    </section>
  </main>;
}

const riskStatusLabel: Record<EnterpriseRiskChainStep["status"] | "cleared", string> = {
  confirmed: "已确认",
  signal: "筛查信号",
  verify: "待核验",
  cleared: "查否",
};

function EnterpriseRiskChain({ chain }: { chain: NonNullable<TypicalEnterprise["riskChain"]> }) {
  const mechanisms = [
    ...(chain.mechanism ? [chain.mechanism] : []),
    ...(chain.mechanisms ?? []),
  ];
  return <section className="enterprise-risk-chain" aria-label="机制流程图">
    <div className="enterprise-risk-chain-heading">
      <div><span>SUPPLY CHAIN / EVIDENCE FLOW</span><h4>{chain.title}</h4></div>
      <strong>证据链</strong>
    </div>
    <p className="enterprise-risk-chain-summary">{chain.summary}</p>
    {mechanisms.length > 0 && <div className="enterprise-mechanism-group">
      <EnterpriseMechanismCluster mechanisms={mechanisms} />
    </div>}
    {chain.branches.length > 0 && <div className="enterprise-risk-branches">
      {chain.branches.map((branch, branchIndex) => {
        const isSuspected = /SUSPECTED|疑似|待核验/.test(branch.label);
        return <article className={`enterprise-risk-branch ${isSuspected ? "suspected" : "known"}`} key={`${branch.title}-${branchIndex}`}>
          <div className="enterprise-risk-branch-heading">
            <div><span>{branch.label}</span><h5>{branch.title}</h5></div>
            {isSuspected && <strong>待核验</strong>}
          </div>
          <p className="enterprise-risk-branch-summary">{branch.summary}</p>
          <div className="enterprise-risk-chain-track">
            {branch.steps.map((step, stepIndex) => <article className={`enterprise-risk-step ${step.status}`} key={`${step.title}-${stepIndex}`}>
              <div className="enterprise-risk-step-meta">
                <span><i className="enterprise-risk-step-icon" aria-hidden="true">{String(stepIndex + 1).padStart(2, "0")}</i>{step.label}</span>
                {step.status !== "confirmed" && <em>{riskStatusLabel[step.status]}</em>}
              </div>
              <h6>{step.title}</h6>
              <details className="enterprise-risk-step-proof">
                <summary>查看证据</summary>
                <p>{step.detail}</p>
              </details>
            </article>)}
          </div>
          <div className="enterprise-risk-boundary"><strong>边界</strong><span>{branch.boundary}</span><small>{branch.sourceLabel}</small></div>
        </article>;
      })}
    </div>}
  </section>;
}

function EnterpriseMechanismCluster({ mechanisms }: { mechanisms: EnterpriseMechanism[] }) {
  const primary = mechanisms[0];
  if (primary.layout === "horizontal") {
    const horizontalNodes = [
      ...primary.suppliers,
      primary.hub,
      ...primary.endpoints,
      primary.downstream,
    ];
    return <div className="enterprise-mechanism enterprise-mechanism-horizontal" aria-label="产品到军用终端的水平链条">
      {horizontalNodes.map((node, index) => <Fragment key={`${node.title}-${index}`}>
        <article className={`enterprise-mechanism-node horizontal-node ${node === primary.hub ? "hub" : node === primary.downstream ? "downstream" : primary.endpoints.includes(node) ? "endpoint" : "supplier"} ${node.status ?? ""}`}>
          <span className="enterprise-mechanism-icon" aria-hidden="true">{node.status === "confirmed" ? "✓" : "◇"}</span>
          <div>{index === 0 && <span className="enterprise-mechanism-caption">{primary.supplierCaption ?? "中国侧电芯节点"}</span>}{node === primary.hub && <span className="enterprise-mechanism-caption">{primary.hubCaption ?? "印度承接企业"}</span>}{node === primary.downstream && <span className="enterprise-mechanism-caption">{primary.downstreamCaption ?? "电池包节点"}</span>}<strong>{node.title}</strong><p>{node.detail}</p></div>
          {node.status !== "confirmed" && <em className={`enterprise-mechanism-status ${node.status ?? "signal"}`}>{node.status ? riskStatusLabel[node.status] : "筛查信号"}</em>}
        </article>
        {index < horizontalNodes.length - 1 && <span className={`enterprise-mechanism-arrow horizontal-chain-arrow ${horizontalNodes[index + 1].status !== "confirmed" ? "pending" : ""}`} aria-hidden="true">→</span>}
      </Fragment>)}
    </div>;
  }
  const suppliers = mechanisms
    .flatMap((mechanism) => mechanism.suppliers)
    .filter((node) => node.title !== "供应来源未披露");
  const supplierCaption = mechanisms.length > 1 ? "产品" : (primary.supplierCaption ?? "中国供应商");
  const supplierRowHeight = 176;
  const supplierGap = 12;
  const supplierInset = 22;
  const supplierListHeight = supplierInset * 2 + suppliers.length * supplierRowHeight + Math.max(0, suppliers.length - 1) * supplierGap;
  const supplierCurveYs = suppliers.map((_, index) => ((supplierInset + supplierRowHeight / 2 + index * (supplierRowHeight + supplierGap)) / supplierListHeight) * 100);

  return <div className="enterprise-mechanism" aria-label="产品供应链证据流程图">
    <div className="enterprise-mechanism-suppliers-cluster">
      <span className="enterprise-mechanism-caption">{supplierCaption}</span>
      <div className="enterprise-mechanism-supplier-list">
      {suppliers.map((node,index)=><article className="enterprise-mechanism-node supplier" key={`${node.title}-${index}`}>
        <span className="enterprise-mechanism-icon" aria-hidden="true">{index===0 ? "⌁" : "◈"}</span>
        <div><strong>{node.title}</strong>{node.detail && <p>{node.detail}</p>}</div>
        {node.status !== "confirmed" && <em className={`enterprise-mechanism-status ${node.status ?? "signal"}`}>{node.status ? riskStatusLabel[node.status] : "筛查信号"}</em>}
      </article>)}
      {suppliers.length > 0 && <svg className="enterprise-mechanism-supplier-curves" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <marker id="supplier-arrowhead" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto" markerUnits="userSpaceOnUse">
            <path d="M 0 0 L 10 5 L 0 10 z" />
          </marker>
        </defs>
        {supplierCurveYs.map((y,index)=><path className="supplier-merge-arrow" key={index} d={`M 0 ${y} C 24 ${y}, 34 50, 52 50`} />)}
        <circle className="supplier-merge-dot" cx="56" cy="50" r="4.5" />
        <path className="supplier-main-arrow" d="M 60 50 L 98 50" markerEnd="url(#supplier-arrowhead)" />
      </svg>}
      </div>
    </div>
    <div className="enterprise-mechanism-fanin" aria-hidden="true" />
    <article className="enterprise-mechanism-node hub">
      <span className="enterprise-mechanism-icon" aria-hidden="true">◎</span>
      <div><span className="enterprise-mechanism-caption">{primary.hubCaption ?? "印度承接"}</span><strong>{primary.hub.title}</strong><p>{primary.hub.detail}</p></div>
      {primary.hub.status !== "confirmed" && <em className={`enterprise-mechanism-status ${primary.hub.status ?? "signal"}`}>{primary.hub.status ? riskStatusLabel[primary.hub.status] : "筛查信号"}</em>}
    </article>
    <div className="enterprise-mechanism-outcome">
      <span className="enterprise-mechanism-arrow placeholder" aria-hidden="true" />
      <div className={`enterprise-mechanism-endpoints ${primary.connectEndpoints === false ? "standalone" : ""}`}>
        {primary.endpoints.map((node,index)=><article className={`enterprise-mechanism-node endpoint ${node.status ?? "verify"}`} key={`${node.title}-${index}`}>
          <span className="enterprise-mechanism-icon" aria-hidden="true">{node.status === "confirmed" ? "✓" : "?"}</span>
          <div><strong>{node.title}</strong><p>{node.detail}</p></div>
          {node.status !== "confirmed" && <em className={`enterprise-mechanism-status ${node.status ?? "verify"}`}>{node.status ? riskStatusLabel[node.status] : "待核验"}</em>}
        </article>)}
      </div>
      {primary.connectDownstream !== false ? <span className="enterprise-mechanism-arrow" aria-hidden="true">→</span> : <span className="enterprise-mechanism-arrow placeholder" aria-hidden="true" />}
      <article className="enterprise-mechanism-node downstream">
        <span className="enterprise-mechanism-icon" aria-hidden="true">⇢</span>
        <div><span className="enterprise-mechanism-caption">{primary.downstreamCaption ?? "台湾接收"}</span><strong>{primary.downstream.title}</strong><p>{primary.downstream.detail}</p></div>
        {primary.downstream.status !== "confirmed" && <em className={`enterprise-mechanism-status ${primary.downstream.status ?? "signal"}`}>{primary.downstream.status ? riskStatusLabel[primary.downstream.status] : "筛查信号"}</em>}
      </article>
    </div>
  </div>;
}

export default function App() {
  const slug = enterpriseRouteSlug();
  if (slug) return <EnterpriseFlowPage product={enterpriseProductsBySlug[slug]}/>;
  return <Home/>;
}

function Home() {
  const [category,setCategory] = useState<Category>("全部");
  const [search,setSearch] = useState("");
  const [minShare,setMinShare] = useState(0);
  const [minValue,setMinValue] = useState(0);
  const [expandedGroups,setExpandedGroups] = useState<Set<string>>(()=>new Set(["chips"]));
  const [selected,setSelected] = useState<CommodityRecord|null>(null);
  const [selectedSubitem,setSelectedSubitem] = useState("battery");
  const [routeValue,setRouteValue] = useState(.2);
  const [routeGrowth,setRouteGrowth] = useState(20);
  const [period,setPeriod] = useState<"annual"|"pulse">("annual");
  const [railCollapsed,setRailCollapsed] = useState(false);

  const availableCategories = useMemo<Category[]>(
    () => categories.filter(category => category === "全部" || matrixCommodities.some(item => item.category === category)),
    [],
  );

  useEffect(() => {
    if (!availableCategories.includes(category)) setCategory("全部");
  }, [availableCategories, category]);

  useEffect(() => {
    const onKey = (event:KeyboardEvent) => { if (event.key === "Escape") setSelected(null); };
    window.addEventListener("keydown",onKey);
    return () => window.removeEventListener("keydown",onKey);
  },[]);

  const filtered = useMemo(() => matrixCommodities.filter(item => {
    const q = search.trim().toLowerCase();
    return (category === "全部" || item.category === category) && (!q || `${item.name} ${item.english} ${item.hs} ${hs8Of(item)} ${item.searchTerms??""}`.toLowerCase().includes(q)) && item.completeYear.share >= minShare && item.completeYear.china >= minValue;
  }).sort((a,b)=>b.completeYear.share-a.completeYear.share),[category,search,minShare,minValue]);
  const visibleGroups = useMemo(() => matrixGroups.map(group => {
    const items = groupChildren(group)
      .filter(item => filtered.some(match=>match.id===item.id))
      .sort((a,b)=>b.completeYear.share-a.completeYear.share);
    return { ...group, items, matrixShare: groupStats(items).share };
  }).filter(group=>group.items.length>0).sort((a,b)=>b.matrixShare-a.matrixShare),[filtered]);
  const toggleGroup = (id:string) => setExpandedGroups(current => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });
  const focusMatrixCommodity = (id:string, event?: { preventDefault: () => void }) => {
    event?.preventDefault();
    const group = matrixGroups.find(entry=>entry.children.includes(id));
    if (group && groupChildren(group).length > 1) {
      setExpandedGroups(current => new Set(current).add(group.id));
    }
    window.setTimeout(()=>document.getElementById(`commodity-${id}`)?.scrollIntoView({behavior:"smooth",block:"center"}),0);
  };

  const activeRoutes = auditedRoutes.filter(route => weakestRouteValue(route) >= routeValue && weakestRouteGrowth(route) >= routeGrowth);
  const chinaTotal = matrixCommodities.reduce((sum,item)=>sum+item.completeYear.china,0);
  const worldTotal = matrixCommodities.reduce((sum,item)=>sum+item.completeYear.world,0);
  const weightedShare = chinaTotal/worldTotal*100;
  const highCount = matrixCommodities.filter(item=>item.completeYear.share>=50).length;
  const highestShare = Math.max(...matrixCommodities.map(item=>item.completeYear.share));
  const reset = () => { setCategory("全部"); setSearch(""); setMinShare(0); setMinValue(0); };
  const openCommodity = (item:CommodityRecord) => {
    setSelected(item);
    setSelectedSubitem(item.id);
  };
  const openCommodityById = (id:string) => {
    const item = allCommodityRecords.find(record=>record.id===id);
    if (item) openCommodity(item);
  };
  useEffect(() => {
    const productId = new URLSearchParams(window.location.search).get("product");
    if (!productId) return;
    const item = allCommodityRecords.find(record=>record.id===productId);
    if (!item) return;
    const group = matrixGroups.find(entry=>entry.children.includes(productId));
    if (group && groupChildren(group).length > 1) {
      setExpandedGroups(current => new Set(current).add(group.id));
    }
    setSelected(item);
    setSelectedSubitem(item.id);
    window.history.replaceState(null,"",`${APP_BASE}/#commodity-${productId}`);
    window.setTimeout(()=>document.getElementById(`commodity-${productId}`)?.scrollIntoView({behavior:"smooth",block:"center"}),0);
  },[]);
  const renderCommodityRow = (item: CommodityRecord) => (
    <button id={`commodity-${item.id}`} className="commodity-row subitem-row" key={item.id} onClick={()=>openCommodity(item)} aria-label={`查看 ${item.name} 详情`}>
      <span className="commodity-name"><b>{item.name}</b><small>{item.english}</small><code>HS 2022 · {codeLevelOf(item)} {hs8Of(item)}</code><em>{customsProfileOf(item)?`中国海关 HS8 ${customsProfileOf(item)!.hs8.map(code=>code.code).join(" / ")}`:"中国海关 HS8 待补充"}</em></span>
      <span className="value-cell"><small>印度从中国进口</small><b>{formatB(item.completeYear.china)}</b></span>
      <span className="value-cell"><small>印度进口总额</small><b>{formatB(item.completeYear.world)}</b></span>
      <span className="share-cell"><small>从中国进口占比</small><b>{item.completeYear.share.toFixed(1)}%</b><i><em style={{width:`${item.completeYear.share}%`}}/></i></span>
      <span className="tag-cell">{item.controlled&&<i className="risk">管制筛查</i>}<small>{compactUsd(customsYearValue(customsProfileOf(item),"2025"))}</small></span>
    </button>
  );
  const selectedChildren = selected ? commoditySubitemsByParent[selected.id]??[] : [];
  const selectedRecord = selected && selectedChildren.length
    ? [selected,...selectedChildren].find(item=>item.id===selectedSubitem)??selected
    : selected;
  const selectedReport = selectedRecord && commodityReports[selectedRecord.id] ? exactCommodityReport(selectedRecord, commodityReports[selectedRecord.id]) : null;
  const selectedMonthly = selectedRecord ? monthlyTradeById[selectedRecord.id]??[] : [];
  const selectedAccuracy = selectedReport && selectedRecord ? reportAccuracyById[selectedRecord.id]??defaultReportAccuracy : null;
  const selectedPublicEvidence = selectedRecord ? publicEvidenceById[selectedRecord.id]??[] : [];
  const selectedSensitiveUse = selectedRecord ? sensitiveUseById[selectedRecord.id]??[] : [];
  const selectedEnterpriseSlug = selectedRecord ? enterpriseProductAliasByCommodityId[selectedRecord.id] : "";
  const selectedEnterpriseProduct = selectedEnterpriseSlug ? enterpriseProductsBySlug[selectedEnterpriseSlug] : undefined;

  return <main className="atlas-workspace">
    <header className={`topbar ${railCollapsed ? "rail-collapsed" : ""}`}>
      <a className="brand" href="#top" aria-label="返回首页"><span className="brand-mark">依</span><span>中印供应链依赖图谱<small>INDIA × CHINA SUPPLY ATLAS</small></span></a>
      <nav aria-label="主要导航"><a href="#matrix">依赖矩阵</a><a href="#routes">第三国路径</a><a href="#sources">来源中心</a><a href="#reports">报告下载</a></nav>
      <span className="snapshot"><i/> PUBLIC · 快照 {SNAPSHOT_DATE}</span>
    </header>

    <aside className={`workspace-rail ${railCollapsed ? "is-collapsed" : ""}`} aria-label="研究工作台导航">
      <button
        className="workspace-rail-toggle"
        type="button"
        onClick={() => setRailCollapsed(value => !value)}
        aria-expanded={!railCollapsed}
        aria-label={railCollapsed ? "展开左侧导航" : "收起左侧导航"}
      >
        <span>{railCollapsed ? "展开导航" : "收起导航"}</span>
        <b aria-hidden="true">{railCollapsed ? "›" : "‹"}</b>
      </button>
      <a className="workspace-home" href="#top"><span>01</span><strong>总览</strong></a>
      <a href="#matrix"><span>02</span><strong>商品依赖</strong></a>
      <a href="#routes"><span>03</span><strong>路径核验</strong></a>
      <a href="#policy"><span>04</span><strong>政策管制</strong></a>
      <a href="#sources"><span>05</span><strong>数据来源</strong></a>
      <a href="#reports"><span>06</span><strong>报告归档</strong></a>
      <a href="#enterprises"><span>07</span><strong>企业案例</strong></a>
      <div className="workspace-rail-note"><span>RESEARCH MODE</span><p>商品、路径与企业线索均可交叉查看。</p></div>
    </aside>

    <div className={`workspace-canvas ${railCollapsed ? "rail-collapsed" : ""}`}>

    <section className="hero" id="top">
      <div className="hero-grid" aria-hidden="true"/>
      <div className="hero-copy">
        <p className="eyebrow"><span>RESEARCH BRIEF / 02</span> 可审计供应链情报</p>
        <h1>中国-印度<br/><em>供应链依赖图谱</em></h1>
        <details className="hero-conclusions" aria-label="首页结论摘要" open>
          <summary className="hero-conclusions-summary">
            <div><span>EXECUTIVE SUMMARY</span><strong>结论</strong></div>
            <b>展开 / 收起 ↕</b>
          </summary>
          <div className="hero-conclusions-grid">
          <article>
            <span>01</span>
            <h2>高依赖商品</h2>
            <ul>
              <li><a href="#commodity-battery" onClick={event=>focusMatrixCommodity("battery",event)}>锂离子蓄电池：85076000</a></li>
              <li><a href="#commodity-semiconductor" onClick={event=>focusMatrixCommodity("semiconductor",event)}>未组装光伏电池：85414200</a></li>
              <li><a href="#commodity-rareearth" onClick={event=>focusMatrixCommodity("rareearth",event)}>稀土金属及其混合物的化合物：284690</a></li>
              <li><a href="#commodity-tunnel_843031" onClick={event=>focusMatrixCommodity("tunnel_843031",event)}>自推进隧道掘进机：84303130</a></li>
              <li><a href="#commodity-tunnel_843039" onClick={event=>focusMatrixCommodity("tunnel_843039",event)}>非自推进采（截）煤机、凿岩机及隧道掘进机：84303900</a></li>
              <li><a href="#commodity-earthmoving_dumptruck" onClick={event=>focusMatrixCommodity("earthmoving_dumptruck",event)}>非公路用货运机动自卸车：87041090 / 87041030</a></li>
              <li><a href="#commodity-earthmoving_crane" onClick={event=>focusMatrixCommodity("earthmoving_crane",event)}>其他起重车及全路面起重车：870510</a></li>
              <li><a href="#commodity-graphite" onClick={event=>focusMatrixCommodity("graphite",event)}>其他粉末或粉片天然石墨：25041099</a></li>
            </ul>
          </article>
          <article>
            <span>02</span>
            <h2>明确涉军物项</h2>
            <ul>
              {militaryCaseProducts.map(({ product, enterprises }) => {
                const commodityId = commodityIdByEnterpriseProductId[product.productId];
                const href = commodityId ? `#commodity-${commodityId}` : enterpriseHref(product.slug);
                return <li key={`military-case-${product.productId}`}>
                  <a href={href} onClick={commodityId ? event=>focusMatrixCommodity(commodityId,event) : undefined}>
                    {product.productName}：{enterprises.map(enterprise=>enterprise.chineseName).join("、")}
                  </a>
                </li>;
              })}
            </ul>
          </article>
          <article>
            <span>03</span>
            <h2>需要重点关注的第三国贸易路径</h2>
            <ul>
              <li>中国 → 越南 → 印度</li>
              <li>中国 → 阿联酋 → 印度</li>
              <li>中国 → 新加坡 → 印度</li>
              <li>中国 → 马来西亚 → 印度</li>
              <li>中国 → 韩国 / 台湾 → 印度</li>
            </ul>
          </article>
          </div>
        </details>
        <div className="hero-actions"><a className="primary-btn" href="#matrix">进入依赖矩阵 <span>↗</span></a><a className="text-btn" href="#method">先读方法口径</a></div>
      </div>
      <div className="hero-panel">
        <div className="audit-console-label"><span>SUPPLY AUDIT CONSOLE</span><b>{SNAPSHOT_DATE}</b></div>
        <div className="period-toggle" role="group" aria-label="数据时期"><button className={period==="annual"?"active":""} onClick={()=>setPeriod("annual")}>2025 全年数据</button><button className={period==="pulse"?"active":""} onClick={()=>setPeriod("pulse")}>2026 最新已公布数据</button></div>
        {period === "annual" ? <>
          <div className="hero-metric"><span>{matrixCommodities.length} 个具体商品物项 · 从中国进口的金额占比</span><strong>{weightedShare.toFixed(1)}<small>%</small></strong></div>
          <div className="metric-quads"><div><span>从中国进口金额</span><strong>{formatB(chinaTotal)}</strong></div><div><span>这些商品的进口总额</span><strong>{formatB(worldTotal)}</strong></div><div><span>从中国进口占比超过一半</span><strong>{highCount}<small> 项</small></strong></div><div><span>对中国依赖最高的商品占比</span><strong>{highestShare.toFixed(1)}%</strong></div></div>
          <a className="panel-source" href={COMTRADE} target="_blank" rel="noreferrer"><span>SOURCE 01</span> UN Comtrade · 2025 · {CURRENT_HS_VERSION}（H6）↗</a>
        </> : <>
          <div className="hero-metric pulse"><span>印度对华进口 · FY2025–26</span><strong>$131.63<small>B</small></strong></div>
          <div className="metric-quads"><div><span>对华出口</span><strong>$19.47B</strong></div><div><span>进口同比</span><strong>+16.03%</strong></div><div><span>2026 年 4 月进口同比</span><strong>+20.85%</strong></div><div><span>月度库可用至</span><strong>2026.05</strong></div></div>
          <a className="panel-source" href={TIA} target="_blank" rel="noreferrer"><span>SOURCE 02</span> India TIA / DGCI&S · 访问 {SNAPSHOT_DATE} ↗</a>
        </>}
      </div>
    </section>

    <section className="definition-strip" id="method"><span>01</span><div><strong>“依赖”指什么？</strong><p>同一时期、同一 HS 编码下，印度自中国进口额 ÷ 印度全球进口额。它衡量的是<strong>进口来源依赖</strong>，不等于印度国内消费或生产的总体依赖。</p></div><a href="#sources">查看完整口径 ↘</a></section>

    <section className="section matrix-section" id="matrix">
      <div className="section-heading"><div><p>DEPENDENCY MATRIX / 2025</p><h2>重点商品清单</h2></div></div>
      <div className="filter-shell">
        <div className="category-tabs" role="tablist" aria-label="行业筛选">{availableCategories.map(item=><button key={item} role="tab" aria-selected={category===item} className={category===item?"active":""} onClick={()=>setCategory(item)}>{item}</button>)}</div>
        <div className="filters"><label className="search"><span>搜索商品 / 英文 / HS</span><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="例如：盾构、起重机、870510"/></label><label><span>最低对华占比 <b>{minShare}%</b></span><input type="range" min="0" max="90" step="5" value={minShare} onChange={e=>setMinShare(Number(e.target.value))}/></label><label><span>最低自华进口额 <b>{minValue===0?"不限":formatB(minValue)}</b></span><input type="range" min="0" max="5" step="0.25" value={minValue} onChange={e=>setMinValue(Number(e.target.value))}/></label><button className="reset" onClick={reset}>重置筛选</button></div>
      </div>
      <div className="matrix-meta source-only" aria-live="polite"><a href={COMTRADE} target="_blank" rel="noreferrer">UN Comtrade · 2025 · HS2022（H6）· 访问 {SNAPSHOT_DATE} ↗</a></div>
      <div className="commodity-table grouped-table">
        {visibleGroups.map(group=>{if (group.items.length===1) return renderCommodityRow(group.items[0]); const stats=groupStats(group.items);const expanded=expandedGroups.has(group.id);return <section className={`matrix-group ${expanded?"expanded":"collapsed"}`} key={group.id}>
          <button className="matrix-group-head" type="button" onClick={()=>toggleGroup(group.id)} aria-expanded={expanded} aria-controls={`matrix-group-${group.id}`}>
            <div><span>{group.english}</span><h3>{group.title}</h3></div>
            <div><strong>{group.items.length}</strong></div>
            <div><strong>{stats.share.toFixed(1)}%</strong></div>
            <div><strong>{compactUsd(stats.customs2025)}</strong></div>
            <span className="group-toggle">{expanded?"收起":"展开"} <i>{expanded?"−":"+"}</i></span>
          </button>
          {expanded&&<div className="matrix-group-items" id={`matrix-group-${group.id}`}>
            {group.items.map(item=>renderCommodityRow(item))}
          </div>}
        </section>})}
        {filtered.length===0&&<div className="empty-state"><strong>没有符合条件的商品</strong><p>降低阈值或清除搜索词后再试。</p><button onClick={reset}>恢复全部</button></div>}
      </div>
    </section>

    <section className="section enterprise-directory" id="enterprises">
      <div className="section-heading"><div><p>ENTERPRISE CASES</p><h2>企业案例</h2></div></div>
      <div className="enterprise-directory-grid">
        {typicalEnterprises.map(item=><a className="enterprise-directory-card" key={item.slug} href={enterpriseHref(item.slug)}>
          <span>典型流向企业</span><strong>{item.productName}</strong><p>查看对应商品的涉军企业案例、供应链角色与公开来源。</p><b>进入案例页 ↗</b>
        </a>)}
      </div>
    </section>

    <section className="pulse-ribbon" aria-label="最新月度数据"><div><span>MONTHLY DATA UPDATE</span><strong>2026.05</strong></div><a href={TRADESTAT} target="_blank" rel="noreferrer">打开官方月度库 ↗</a></section>

    <section className="section spotlight"><div className="section-heading"><div><p>EQUIPMENT FOCUS</p><h2>工程设备专题</h2></div></div><div className="spotlight-grid">{["tunnel_843031","earthmoving_dumptruck","machineparts"].map((id,index)=>{const item=allCommodityRecords.find(x=>x.id===id)!;return <button className="spotlight-card" key={id} onClick={()=>openCommodity(item)}><span className="card-index">0{index+1} / {codeLevelOf(item)} {hs8Of(item)}</span><div className={`equipment-visual v${index+1}`} aria-hidden="true"><i/><i/><i/></div><p>{item.english}</p><h3>{item.name}</h3><strong className="big-share">{item.completeYear.share.toFixed(1)}<small>%</small></strong><span className="card-link">查看证据卡片 ↗</span></button>})}</div></section>

    <section className="section route-section" id="routes">
      <div className="section-heading inverse"><div><p>ROUTE SIGNALS / SCREENING ONLY</p><h2>可能的第三国路径</h2></div></div>
      <div className="route-controls"><label><span>路径分段贸易额下限 <b>{formatM(routeValue)}</b></span><input type="range" min="0" max="3" step="0.1" value={routeValue} onChange={e=>setRouteValue(Number(e.target.value))}/></label><label><span>2026已公布/2025全年比例下限 <b>{routeGrowth}%</b></span><input type="range" min="0" max="100" step="5" value={routeGrowth} onChange={e=>setRouteGrowth(Number(e.target.value))}/></label><div><strong>{activeRoutes.length}</strong><span>条路径信号</span></div></div>
      <div className="route-list">{activeRoutes.map(route=><article className="route-card" key={route.id}><div className="route-title"><div><span>HS2022 H6 {route.hs} · {route.coverage}</span><h3>{route.product} / {route.hub}</h3></div><div className="route-title-actions"><em className={`reliability r-${route.reliability}`}>可靠性 {route.reliability}</em><a href={route.source} target="_blank" rel="noreferrer">数据源 ↗</a></div></div><div className="route-chain">{route.nodes.map((node,index)=><span key={`${route.id}-${node}-${index}`}><b className={index===0?"origin":index===route.nodes.length-1?"destination":"transit"}>{node}</b>{index<route.nodes.length-1&&<i>→</i>}</span>)}</div><RouteTradeDetails route={route}/><RouteProof route={route}/></article>)}</div>
      {activeRoutes.length===0&&<div className="route-empty"><span>∅</span><div><strong>当前阈值下没有路径信号</strong><p>这不代表不存在转口。默认阈值要求已公布分段贸易额均不低于 20 万美元、且 2026 已公布金额达到 2025 全年的一定比例；可继续降低阈值查看弱信号。</p><button onClick={()=>{setRouteValue(.1);setRouteGrowth(10)}}>查看弱信号</button></div></div>}
    </section>

          <section className="section policy-section" id="policy"><details className="section-collapse"><summary className="section-heading collapse-heading"><div><p>CONTROL TIMELINE</p><h2>政策与管制时间线</h2></div><b>展开 ↕</b></summary><div className="timeline">{policies.map((item,index)=><a className="timeline-item" href={item.url} target="_blank" rel="noreferrer" key={`${item.date}-${item.title}`}><span>{item.date}</span><i>{String(index+1).padStart(2,"0")}</i><div><h3>{item.title} ↗</h3><p>{item.body}</p></div></a>)}</div><div className="control-ledger"><h3>可观察管制筛查表</h3>{controls.map(item=><a href={item.source} target="_blank" rel="noreferrer" key={item.referenceHs}><span>{item.referenceHs}</span><strong>{item.item}</strong><p>{item.parameters}</p><em>{item.status} ↗</em></a>)}</div></details></section>

    <section className="section sources-section" id="sources"><details className="section-collapse"><summary className="section-heading collapse-heading"><div><p>SOURCE CENTER</p><h2>来源、口径与可复核性</h2></div><b>展开 ↕</b></summary><div className="source-grid">{visibleSources.map(source=><a className="source-card" href={source.url} target="_blank" rel="noreferrer" key={source.tag}><span>{source.tag}</span><div><h3>{source.title} ↗</h3><p>{source.detail}</p></div><small>{source.period} · 访问 {SNAPSHOT_DATE}</small></a>)}</div><div className="method-grid"><div><span>M01</span><h3>怎么算</h3><p>同一时期、同一真实 HS6/HS8 商品物项：印度从中国进口金额 ÷ 印度该商品进口总额。父级大类不参与汇总，避免重复计算。</p></div><div><span>M02</span><h3>看哪个时间</h3><p>2025 全年数据用于横向比较；2026 年已公布月份只用于观察最新变化，不与全年金额混算。</p></div><div><span>M03</span><h3>编码怎么用</h3><p>公开来源可核验到 HS8 时使用真实 HS8；只能核验到 HS6 时如实显示 HS6，不补零、不冒充八位编码。</p></div><div><span>M04</span><h3>需要注意</h3><p>HS 编码不能替代出口管制技术参数、最终用户和最终用途判断；CIF/FOB、数量单位和分类差异也会影响结论。本工具不构成法律意见。</p></div></div></details></section>

    <section className="section report-center" id="reports">
      <details className="section-collapse"><summary className="section-heading collapse-heading"><div><p>WORD REPORTS</p><h2>分析报告下载</h2></div><b>展开 ↕</b></summary>
      <div className="overall-report-card">
        <div><span>MASTER REPORT / {REPORT_DATE}</span><h3>中国-印度供应链依赖图谱总分析报告</h3><p>汇总具体商品矩阵、工程设备专题、第三国路径边界、真实 HS6/HS8 统计编码和结论准确度分级。</p></div>
        <a href={reportHref("overall")} download>下载总报告 Word 版 ↗</a>
      </div>
      <div className="report-download-grid">{allCommodityRecords.map(item=><a href={reportHref(item.id)} download key={item.id}><span>{codeLevelOf(item)} {hs8Of(item)}</span><strong>{item.name}</strong><small>{statLevelOf(item)} · {item.completeYear.share.toFixed(1)}% · {reportAccuracyById[item.id]?.level??defaultReportAccuracy.level}</small></a>)}</div>
      </details>
    </section>

    <footer><div><strong>中印供应链依赖图谱</strong><p>公开研究工具 · 静态数据快照 · 无需登录</p></div><div><span>快照生成</span><b>{SNAPSHOT_DATE}</b></div><a href="#top">回到顶部 ↑</a></footer>
    </div>

    {selected&&selectedRecord&&selectedReport&&<div className="drawer-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setSelected(null)}}>
      <aside className="detail-drawer" role="dialog" aria-modal="true" aria-labelledby="drawer-title">
        <button className="drawer-close" onClick={()=>setSelected(null)} aria-label="关闭详情">×</button>
        <p className="eyebrow">COMMODITY REPORT / {REPORT_DATE}</p>
        <h2 id="drawer-title">{selectedRecord.name}</h2>
        <p className="drawer-english">{selectedRecord.english}</p>
        {selectedChildren.length>0&&<div className="commodity-subnav" role="tablist" aria-label={`${selected.name}子项`}>
          {[selected,...selectedChildren].map((item,index)=><button key={item.id} role="tab" aria-selected={selectedRecord.id===item.id} className={selectedRecord.id===item.id?"active":""} onClick={()=>setSelectedSubitem(item.id)}><small>{index===0?"总览":`${codeLevelOf(item)} ${hs8Of(item)}`}</small><strong>{item.name}</strong></button>)}
        </div>}
        <div className="drawer-report-cover"><small>专项分析报告</small><h3>{selectedReport.title}</h3></div>
        {selectedEnterpriseProduct&&<a className="enterprise-entry-card" href={enterpriseHref(selectedEnterpriseProduct.slug)}>
          <span>典型流向企业</span>
          <strong>{selectedEnterpriseProduct.productName}</strong>
          <p>查看该商品进入印度后的主要承接企业类型、代表企业、供应链角色与可复核来源。</p>
          <b>进入企业页 ↗</b>
        </a>}
        <a className="report-download-btn" href={reportHref(selectedRecord.id)} download>下载本商品 Word 分析报告 ↗</a>
        <div className="drawer-metrics"><div><span>印度自中国进口</span><strong>{formatB(selectedRecord.completeYear.china)}</strong></div><div><span>印度全球进口</span><strong>{formatB(selectedRecord.completeYear.world)}</strong></div><div><span>对华来源占比</span><strong>{selectedRecord.completeYear.share.toFixed(1)}%</strong></div></div>
        <a className="drawer-source" href={COMTRADE} target="_blank" rel="noreferrer">UN Comtrade · 2025 · {CURRENT_HS_VERSION}（H6）· 访问 {selectedRecord.accessedAt} ↗</a>

        <section>
          <div className="drawer-section-title"><h3>一、数据事实</h3><span>2025 全年数据</span></div>
          <ol className="report-facts">{selectedReport.dataPoints.map((point,index)=><li key={point}><span>{String(index+1).padStart(2,"0")}</span><p>{point}</p></li>)}</ol>
        </section>

        {selectedPublicEvidence.length>0&&<section>
          <details className="public-evidence" open={false}>
            <summary><div><h3>公开证据与来源</h3><span>{selectedPublicEvidence.length} 条公开来源</span></div><b>展开 ↕</b></summary>
            <div className="public-evidence-list">
              {selectedPublicEvidence.map((item,index)=><article key={`${selectedRecord.id}-evidence-${index}`}>
                <span>{String(index+1).padStart(2,"0")}</span>
                <div><h4>{item.source}</h4><p>{item.fact}</p><small>{item.meta}</small></div>
                <a href={item.url} target="_blank" rel="noreferrer">原文 ↗</a>
              </article>)}
            </div>
          </details>
        </section>}

        {selectedSensitiveUse.length>0&&<section>
          <details className="public-evidence sensitive-evidence" open={false}>
            <summary><div><h3>涉军/敏感用途公开线索</h3><span>{selectedSensitiveUse.length} 条案例</span></div><b>展开 ↕</b></summary>
            <div className="sensitive-case-grid drawer-sensitive-grid">
              {selectedSensitiveUse.map((item,index)=><article key={`${selectedRecord.id}-sensitive-${index}`}>
                <div><span className={`sensitive-label r-${item.reliability}`}>{item.label}</span><h4>{item.item}</h4></div>
                <p>{item.case}</p>
                <dl><div><dt>涉及企业或机构</dt><dd>{item.company}</dd></div><div><dt>来源</dt><dd><a href={item.url} target="_blank" rel="noreferrer">{item.source} ↗</a></dd></div></dl>
              </article>)}
            </div>
          </details>
        </section>}

        <section>
          <div className="drawer-section-title"><h3>二、第三国路径与多节点网络</h3><span>筛查用途 · 非事实认定</span></div>
          {selectedReport.routes.length>0?<div className="route-network-list">{selectedReport.routes.map((route,index)=><article className="route-network" key={`${route.label}-${index}`}><div className="route-network-head"><span>PATH {String(index+1).padStart(2,"0")}</span><strong>{route.label}</strong></div><div className="route-nodes">{route.nodes.map((node,nodeIndex)=><span key={`${node}-${nodeIndex}`}><b className={nodeIndex===0?"origin":nodeIndex===route.nodes.length-1?"destination":"transit"}>{node}</b>{nodeIndex<route.nodes.length-1&&<i>→</i>}</span>)}</div><p>{route.basis}</p></article>)}</div>:<div className="no-route-report"><span>∅</span><div><strong>无公开量化转口路径</strong><p>现有来源未形成可复核的“中国—第三国—印度”金额、时间与产品口径闭环，因此不虚构中转国排序。</p></div></div>}
        </section>

        {selectedReport.analysis.length>0&&<section>
          <h3>三、分析</h3>
          <div className="report-analysis">{selectedReport.analysis.map(paragraph=><p key={paragraph}>{paragraph}</p>)}</div>
        </section>}

        <section><div className="drawer-section-title"><h3>月度数据与趋势</h3><span>2024-12—2026-06 · {CURRENT_HS_VERSION} · {codeLevelOf(selectedRecord)} {hs8Of(selectedRecord)} · {statLevelOf(selectedRecord)}</span></div><MonthlyTrend points={selectedMonthly}/></section>
        <section><div className="drawer-section-title"><h3>中国海关 HS8 出口数据</h3><span>中国→印度 · 美元 · 来源为你导出的海关总署统计网 CSV</span></div><ChinaCustomsHs8Mirror item={selectedRecord}/></section>
        <section><h3>2025 年其他主要供应来源</h3><div className="alternatives">{selectedRecord.alternatives.length ? selectedRecord.alternatives.map(country=><span key={country}>{country}</span>) : <span>未报告其他境外来源</span>}</div><p>按同一真实 HS6 的印度进口金额排序并排除中国，表示其他来源，不代表短期内具备等量替代能力，也不自动构成中转国。</p></section>
        <section className="report-conclusion">
          <div className="conclusion-heading"><div><span>CONCLUSION</span><h3>四、结论</h3></div>{selectedAccuracy&&<strong className={`accuracy ${selectedAccuracy.level==="高概率"?"accuracy-high":selectedAccuracy.level==="低概率"?"accuracy-low":"accuracy-inference"}`}>准确度 · {selectedAccuracy.level}</strong>}</div>
          <p>{selectedReport.conclusion}</p>
        </section>

        <section>
          <h3>五、后续监测重点</h3>
          <div className="monitor-grid">{selectedReport.monitoring.map((item,index)=><div key={item}><span>0{index+1}</span><p>{item}</p></div>)}</div>
        </section>
      </aside>
    </div>}
  </main>;
}
