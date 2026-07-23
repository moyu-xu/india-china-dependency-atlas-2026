import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const API = "https://comtradeapi.un.org/public/v1/preview/C/A/HS";
const APP = resolve("src/App.tsx");
const MONTHLY = resolve("src/data/monthlyTrade.ts");
const CACHE_DIR = resolve(".cache/site-audit");
const OUTPUT = resolve(".cache/site-audit/audit-report.json");
const ROUTE_CANDIDATES = resolve(".cache/route-screen/candidates.json");
const DELAY_MS = 1400;
const MATRIX_IDS_TO_EXCLUDE = new Set(["fertilizer", "tunnel", "earthmoving"]);
const PARTNER_NAMES = new Map(Object.entries({
  36:"澳大利亚", 40:"奥地利", 56:"比利时", 76:"巴西", 112:"白俄罗斯",
  124:"加拿大", 156:"中国", 203:"捷克", 208:"丹麦", 246:"芬兰", 250:"法国",
  276:"德国", 344:"中国香港", 360:"印度尼西亚", 372:"爱尔兰", 376:"以色列",
  380:"意大利", 392:"日本", 400:"约旦", 410:"韩国", 418:"老挝", 450:"马达加斯加",
  458:"马来西亚", 490:"中国台湾", 504:"摩洛哥", 508:"莫桑比克", 528:"荷兰",
  50:"孟加拉国", 231:"埃塞俄比亚", 251:"法国", 484:"墨西哥", 512:"阿曼",
  524:"尼泊尔", 578:"挪威", 579:"挪威", 608:"菲律宾", 634:"卡塔尔",
  643:"俄罗斯", 682:"沙特阿拉伯", 699:"印度", 702:"新加坡", 710:"南非",
  724:"西班牙", 752:"瑞典", 756:"瑞士", 764:"泰国", 784:"阿联酋",
  792:"土耳其", 795:"土库曼斯坦", 826:"英国", 834:"坦桑尼亚",
  842:"美国", 858:"乌拉圭", 704:"越南"
}));

const delay = milliseconds => new Promise(resolveDelay => setTimeout(resolveDelay, milliseconds));

async function cachedFetch(name, params, attempt = 1) {
  await mkdir(CACHE_DIR, { recursive: true });
  const target = resolve(CACHE_DIR, `${name}.json`);
  try {
    return JSON.parse(await readFile(target, "utf8"));
  } catch {
    // Cache miss.
  }

  await delay(DELAY_MS);
  let response;
  try {
    response = await fetch(`${API}?${new URLSearchParams(params)}`, {
      headers: { "user-agent": "india-china-dependency-atlas-audit/1.0" },
      signal: AbortSignal.timeout(45_000),
    });
  } catch (error) {
    if (attempt >= 6) throw error;
    await delay(attempt * 2000);
    return cachedFetch(name, params, attempt + 1);
  }
  if (response.status === 429) {
    if (attempt >= 6) throw new Error(`Rate limit persisted for ${name}`);
    const retryAfter = Number(response.headers.get("retry-after") ?? 2);
    await delay(Math.max(retryAfter * 1000, attempt * 2000));
    return cachedFetch(name, params, attempt + 1);
  }
  if (!response.ok) throw new Error(`${name}: HTTP ${response.status} ${await response.text()}`);
  const payload = await response.json();
  const result = {
    accessedAt: new Date().toISOString(),
    query: params,
    data: payload.data ?? [],
  };
  await writeFile(target, JSON.stringify(result, null, 2), "utf8");
  return result;
}

function parseAnnualRecords(source) {
  const records = [];
  const pattern = /\{\s*id:\s*"([^"]+)",\s*hs:\s*"([^"]+)",\s*name:\s*"([^"]+)"[\s\S]*?completeYear:\s*annual\(([\d.]+),\s*([\d.]+)\)/g;
  for (const match of source.matchAll(pattern)) {
    const [, id, hs, name, china, world] = match;
    if (MATRIX_IDS_TO_EXCLUDE.has(id) || hs.includes("/") || hs.length !== 6) continue;
    records.push({ id, hs, name, pageChina: Number(china), pageWorld: Number(world) });
  }
  return [...new Map(records.map(record => [record.id, record])).values()];
}

function parseAlternatives(source, id) {
  const block = objectForId(source, id);
  const match = block.match(/alternatives:\s*\[([^\]]*)\]/);
  return match ? [...match[1].matchAll(/"([^"]+)"/g)].map(item => item[1]) : [];
}

function parseAggregate(source, id) {
  const match = source.match(new RegExp(`\\{\\s*id:\\s*"${id}"[\\s\\S]*?completeYear:\\s*annual\\(([\\d.]+),\\s*([\\d.]+)\\)`));
  return match ? { id, pageChina: Number(match[1]), pageWorld: Number(match[2]) } : null;
}

function parseFertilizerTrend(source) {
  const match = source.match(/\{\s*id:\s*"fertilizer"[\s\S]*?trend:\s*\[([\s\S]*?)\]\s*\}/);
  if (!match) return [];
  return [...match[1].matchAll(/\{year:"(\d{4})",china:([\d.]+),world:([\d.]+),share:([\d.]+)\}/g)].map(point => ({
    year: Number(point[1]),
    pageChina: Number(point[2]),
    pageWorld: Number(point[3]),
    pageShare: Number(point[4]),
  }));
}

function sumValue(rows, partnerCode, hs) {
  return rows
    .filter(row => Number(row.reporterCode) === 699 && Number(row.partnerCode) === partnerCode && row.flowCode === "M" && row.cmdCode === hs)
    .reduce((sum, row) => sum + Number(row.primaryValue ?? 0), 0) / 1_000_000_000;
}

function parseMonthly(source) {
  const result = {};
  const itemPattern = /^\s{2}([a-zA-Z0-9_]+): \[([\s\S]*?)^\s{2}\],/gm;
  const rowPattern = /\{ period: "([^"]+)", china: (null|[\d.]+), world: (null|[\d.]+), share: (null|[\d.]+), status: "([^"]+)" \}/g;
  for (const item of source.matchAll(itemPattern)) {
    result[item[1]] = [...item[2].matchAll(rowPattern)].map(row => ({
      period: row[1],
      china: row[2] === "null" ? null : Number(row[2]),
      world: row[3] === "null" ? null : Number(row[3]),
      share: row[4] === "null" ? null : Number(row[4]),
      status: row[5],
    }));
  }
  return result;
}

function objectForId(source, id) {
  const markerMatch = new RegExp(`id:\\s*"${id}"`).exec(source);
  const markerIndex = markerMatch?.index ?? -1;
  if (markerIndex < 0) return "";
  const start = source.lastIndexOf("{", markerIndex);
  let depth = 0;
  for (let index = start; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  return "";
}

function pairField(block, field) {
  const match = block.match(new RegExp(`${field}:\\[([\\d.]+),([\\d.]+)\\]`));
  return match ? [Number(match[1]), Number(match[2])] : null;
}

function pairClose(left, right, tolerance = 0.000001) {
  return Boolean(left && right) && Math.abs(left[0] - right[0]) < tolerance && Math.abs(left[1] - right[1]) < tolerance;
}

async function auditRoutes(source) {
  const routeCache = JSON.parse(await readFile(ROUTE_CANDIDATES, "utf8"));
  const oneHopMap = {
    "id-pvcell": ["854142", "360"],
    "my-processor": ["854231", "458"],
    "sg-selfpropelled": ["843031", "702"],
    "id-battery": ["850760", "360"],
    "ph-converter": ["850440", "608"],
    "th-pet": ["390761", "764"],
    "my-graphite": ["250410", "458"],
    "sg-otherboring": ["843039", "702"],
  };
  const oneHop = Object.entries(oneHopMap).map(([id, [code, hub]]) => {
    const block = objectForId(source, id);
    const candidate = routeCache.candidates.find(item => item.code === code && item.hub === hub);
    const pageFirst = pairField(block, "cnToHub");
    const pageSecond = pairField(block, "hubToIndia");
    const pageDirect = pairField(block, "directToIndia");
    return {
      id,
      code,
      hub,
      pass: Boolean(candidate)
        && pairClose(pageFirst, candidate.cnToHub)
        && pairClose(pageSecond, candidate.hubToIndia)
        && pairClose(pageDirect, candidate.direct),
    };
  });

  const multiMap = {
    "ic-hk-my": ["854231", "344", "458"],
    "valve-id-th": ["848180", "360", "764"],
    "pet-id-th": ["390761", "360", "764"],
  };
  const multi = Object.entries(multiMap).map(([id, [code, firstHub, secondHub]]) => {
    const block = objectForId(source, id);
    const candidate = routeCache.multiCandidates.find(item => item.code === code && item.firstHub === firstHub && item.secondHub === secondHub);
    const pageLegs = [...block.matchAll(/values:\[([\d.]+),([\d.]+)\]/g)].map(match => [Number(match[1]), Number(match[2])]);
    const pageDirect = pairField(block, "directToIndia");
    return {
      id,
      code,
      firstHub,
      secondHub,
      pass: Boolean(candidate)
        && candidate.legs.every((leg, index) => pairClose(pageLegs[index], leg))
        && pairClose(pageDirect, candidate.direct),
    };
  });
  return { oneHop, multi };
}

const appSource = await readFile(APP, "utf8");
const pageRecords = parseAnnualRecords(appSource);
const codes = pageRecords.map(record => record.hs);
const annual = await cachedFetch("annual_2025_india_world_china", {
  period: "2025",
  reporterCode: "699",
  partnerCode: "0,156",
  flowCode: "M",
  cmdCode: codes.join(","),
  partner2Code: "0",
  customsCode: "C00",
  motCode: "0",
  maxRecords: "500",
});

const annualChecks = pageRecords.map(record => {
  const sourceChina = sumValue(annual.data, 156, record.hs);
  const sourceWorld = sumValue(annual.data, 0, record.hs);
  return {
    ...record,
    sourceChina,
    sourceWorld,
    chinaDifference: record.pageChina - sourceChina,
    worldDifference: record.pageWorld - sourceWorld,
    pass: Math.abs(record.pageChina - sourceChina) < 0.0000005 && Math.abs(record.pageWorld - sourceWorld) < 0.0000005,
  };
});

const partnerRankingChecks = [];
const partnerRowsByCode = new Map();
for (const record of pageRecords) {
  const payload = await cachedFetch(`annual_2025_india_partners_${record.hs}`, {
    period: "2025",
    reporterCode: "699",
    flowCode: "M",
    cmdCode: record.hs,
    partner2Code: "0",
    customsCode: "C00",
    motCode: "0",
    maxRecords: "500",
  });
  partnerRowsByCode.set(record.hs, payload.data);
  const partners = payload.data
    .filter(row => ![0, 156, 699].includes(Number(row.partnerCode)))
    .map(row => ({
      code: Number(row.partnerCode),
      name: PARTNER_NAMES.get(String(row.partnerCode)) ?? `M49 ${row.partnerCode}`,
      value: Number(row.primaryValue ?? 0) / 1_000_000_000,
    }))
    .filter(row => row.value > 0)
    .sort((left, right) => right.value - left.value);
  const pageAlternatives = parseAlternatives(appSource, record.id);
  const positiveNames = new Set(partners.map(partner => partner.name));
  partnerRankingChecks.push({
    id: record.id,
    hs: record.hs,
    pageAlternatives,
    sourceTop5: partners.slice(0, 5),
    pass: pageAlternatives.every(country => positiveNames.has(country)),
  });
}

function rankPartners(rows) {
  const totals = new Map();
  for (const row of rows) {
    const code = Number(row.partnerCode);
    if ([0, 156, 699].includes(code)) continue;
    totals.set(code, (totals.get(code) ?? 0) + Number(row.primaryValue ?? 0) / 1_000_000_000);
  }
  return [...totals.entries()]
    .map(([code, value]) => ({ code, name: PARTNER_NAMES.get(String(code)) ?? `M49 ${code}`, value }))
    .filter(row => row.value > 0)
    .sort((left, right) => right.value - left.value);
}

const fertilizerPartners = await cachedFetch("annual_2025_india_partners_31", {
  period: "2025",
  reporterCode: "699",
  flowCode: "M",
  cmdCode: "31",
  partner2Code: "0",
  customsCode: "C00",
  motCode: "0",
  maxRecords: "500",
});
const aggregatePartnerGroups = [
  { id: "fertilizer", rows: fertilizerPartners.data },
  { id: "tunnel", rows: ["843031", "843039"].flatMap(code => partnerRowsByCode.get(code) ?? []) },
  { id: "earthmoving", rows: ["870410", "870510", "870540"].flatMap(code => partnerRowsByCode.get(code) ?? []) },
];
const aggregatePartnerRankingChecks = aggregatePartnerGroups.map(group => {
  const partners = rankPartners(group.rows);
  const pageAlternatives = parseAlternatives(appSource, group.id);
  const positiveNames = new Set(partners.map(partner => partner.name));
  return {
    id: group.id,
    pageAlternatives,
    sourceTop5: partners.slice(0, 5),
    pass: pageAlternatives.every(country => positiveNames.has(country)),
  };
});

const fertilizerTrend = parseFertilizerTrend(appSource);
const fertilizerTrendChecks = [];
for (const point of fertilizerTrend) {
  const payload = await cachedFetch(`annual_${point.year}_india_hs31`, {
    period: String(point.year),
    reporterCode: "699",
    partnerCode: "0,156",
    flowCode: "M",
    cmdCode: "31",
    partner2Code: "0",
    customsCode: "C00",
    motCode: "0",
    maxRecords: "500",
  });
  const sourceChina = sumValue(payload.data, 156, "31");
  const sourceWorld = sumValue(payload.data, 0, "31");
  const sourceShare = sourceWorld > 0 ? sourceChina / sourceWorld * 100 : 0;
  fertilizerTrendChecks.push({
    ...point,
    sourceChina,
    sourceWorld,
    sourceShare,
    pass: Math.abs(point.pageChina - sourceChina) < 0.0001
      && Math.abs(point.pageWorld - sourceWorld) < 0.0001
      && Math.abs(point.pageShare - sourceShare) < 0.1,
  });
}

const aggregateChecks = [
  { aggregate: parseAggregate(appSource, "tunnel"), children: ["tunnel_843031", "tunnel_843039"] },
  { aggregate: parseAggregate(appSource, "earthmoving"), children: ["earthmoving_dumptruck", "earthmoving_crane", "earthmoving_mixer"] },
].map(group => {
  const children = annualChecks.filter(check => group.children.includes(check.id));
  const sourceChina = children.reduce((sum, child) => sum + child.sourceChina, 0);
  const sourceWorld = children.reduce((sum, child) => sum + child.sourceWorld, 0);
  return {
    id: group.aggregate?.id,
    pageChina: group.aggregate?.pageChina,
    pageWorld: group.aggregate?.pageWorld,
    sourceChina,
    sourceWorld,
    pass: Boolean(group.aggregate)
      && Math.abs(group.aggregate.pageChina - sourceChina) < 0.0000005
      && Math.abs(group.aggregate.pageWorld - sourceWorld) < 0.0000005,
  };
});

const monthlyData = parseMonthly(await readFile(MONTHLY, "utf8"));
const monthlyChecks = pageRecords.map(record => {
  const points = monthlyData[record.id] ?? [];
  const year2025 = points.filter(point => point.period.startsWith("2025-") && point.status === "available");
  const china = year2025.reduce((sum, point) => sum + (point.china ?? 0), 0) / 1000;
  const world = year2025.reduce((sum, point) => sum + (point.world ?? 0), 0) / 1000;
  return {
    id: record.id,
    hs: record.hs,
    availableMonths2025: year2025.length,
    annualChina: record.pageChina,
    monthlyChina: china,
    annualWorld: record.pageWorld,
    monthlyWorld: world,
    pass: year2025.length === 12 && Math.abs(record.pageChina - china) < 0.0002 && Math.abs(record.pageWorld - world) < 0.0002,
  };
});
const routeChecks = await auditRoutes(appSource);

const report = {
  generatedAt: new Date().toISOString(),
  source: API,
  annualQuery: annual.query,
  summary: {
    annualRecords: annualChecks.length,
    annualPassed: annualChecks.filter(check => check.pass).length,
    monthlySeries: monthlyChecks.length,
    monthlyPassed: monthlyChecks.filter(check => check.pass).length,
    fertilizerTrendYears: fertilizerTrendChecks.length,
    fertilizerTrendPassed: fertilizerTrendChecks.filter(check => check.pass).length,
    aggregateTopics: aggregateChecks.length,
    aggregateTopicsPassed: aggregateChecks.filter(check => check.pass).length,
    oneHopRoutes: routeChecks.oneHop.length,
    oneHopRoutesPassed: routeChecks.oneHop.filter(check => check.pass).length,
    multiHopRoutes: routeChecks.multi.length,
    multiHopRoutesPassed: routeChecks.multi.filter(check => check.pass).length,
    partnerRankings: partnerRankingChecks.length,
    partnerRankingsPassed: partnerRankingChecks.filter(check => check.pass).length,
    aggregatePartnerRankings: aggregatePartnerRankingChecks.length,
    aggregatePartnerRankingsPassed: aggregatePartnerRankingChecks.filter(check => check.pass).length,
  },
  annualChecks,
  monthlyChecks,
  fertilizerTrendChecks,
  aggregateChecks,
  routeChecks,
  partnerRankingChecks,
  aggregatePartnerRankingChecks,
};

await mkdir(CACHE_DIR, { recursive: true });
await writeFile(OUTPUT, JSON.stringify(report, null, 2), "utf8");
console.log(JSON.stringify(report.summary, null, 2));
if (report.summary.annualPassed !== report.summary.annualRecords) process.exitCode = 2;
if (report.summary.monthlyPassed !== report.summary.monthlySeries) process.exitCode = 2;
if (report.summary.fertilizerTrendPassed !== report.summary.fertilizerTrendYears) process.exitCode = 2;
if (report.summary.aggregateTopicsPassed !== report.summary.aggregateTopics) process.exitCode = 2;
if (report.summary.oneHopRoutesPassed !== report.summary.oneHopRoutes) process.exitCode = 2;
if (report.summary.multiHopRoutesPassed !== report.summary.multiHopRoutes) process.exitCode = 2;
if (report.summary.partnerRankingsPassed !== report.summary.partnerRankings) process.exitCode = 2;
if (report.summary.aggregatePartnerRankingsPassed !== report.summary.aggregatePartnerRankings) process.exitCode = 2;
