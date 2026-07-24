import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const ANNUAL_API = "https://comtradeapi.un.org/public/v1/preview/C/A/HS";
const MONTHLY_API = "https://comtradeapi.un.org/public/v1/preview/C/M/HS";
const ANNUAL_CACHE_DIR = resolve(".cache/route-screen");
const CACHE_DIR = resolve(".cache/route-screen-ytd");
const OUTPUT = resolve(".cache/route-screen-ytd/candidates-2025-2026.json");
const REQUEST_DELAY_MS = 1600;
const MONTHS_2026 = ["202601", "202602", "202603", "202604", "202605", "202606"];
const CODES = ["854142", "854231", "843031", "850760", "850440", "390761", "250410", "843039", "848180"];
const REPORTERS = ["344", "360", "458", "608", "702", "764"];

const routes = [
  { id: "id-pvcell", code: "854142", hub: "360", hubName: "印度尼西亚" },
  { id: "my-processor", code: "854231", hub: "458", hubName: "马来西亚" },
  { id: "sg-selfpropelled", code: "843031", hub: "702", hubName: "新加坡" },
  { id: "id-battery", code: "850760", hub: "360", hubName: "印度尼西亚" },
  { id: "ph-converter", code: "850440", hub: "608", hubName: "菲律宾" },
  { id: "th-pet", code: "390761", hub: "764", hubName: "泰国" },
  { id: "my-graphite", code: "250410", hub: "458", hubName: "马来西亚" },
  { id: "sg-otherboring", code: "843039", hub: "702", hubName: "新加坡" },
];

const networks = [
  { id: "ic-hk-my", code: "854231", legs: [["156", "344"], ["344", "458"], ["458", "699"]] },
  { id: "valve-id-th", code: "848180", legs: [["156", "360"], ["360", "764"], ["764", "699"]] },
  { id: "pet-id-th", code: "390761", legs: [["156", "360"], ["360", "764"], ["764", "699"]] },
];

const delay = (milliseconds) => new Promise(resolveDelay => setTimeout(resolveDelay, milliseconds));
const keyOf = (row) => `${row.reporterCode}|${row.partnerCode}|${row.flowCode}|${row.cmdCode}`;

async function loadAnnualRows() {
  const rows = [];
  for (const name of await readdir(ANNUAL_CACHE_DIR)) {
    if (!name.startsWith("2025_") || !name.endsWith(".json")) continue;
    const payload = JSON.parse(await readFile(resolve(ANNUAL_CACHE_DIR, name), "utf8"));
    rows.push(...(payload.data ?? []));
  }
  return rows;
}

async function cachedFetch(api, query, attempt = 1) {
  await mkdir(CACHE_DIR, { recursive: true });
  const cacheName = `${query.period}_${query.reporterCode}_${query.partnerCode}_${query.flowCode}_${query.cmdCode}.json`.replaceAll(",", "-");
  const cacheFile = resolve(CACHE_DIR, cacheName);
  try {
    return JSON.parse(await readFile(cacheFile, "utf8"));
  } catch {
    // cache miss
  }

  const params = new URLSearchParams({ ...query, partner2Code: "0", customsCode: "C00", motCode: "0", maxRecords: "500" });
  await delay(REQUEST_DELAY_MS);
  const response = await fetch(`${api}?${params}`, {
    headers: { "user-agent": "india-china-dependency-atlas/3.0" },
    signal: AbortSignal.timeout(45_000),
  });
  if (response.status === 429) {
    const retryAfter = Number(response.headers.get("retry-after") ?? 3);
    if (attempt >= 6) throw new Error(`HTTP 429 after ${attempt} attempts`);
    await delay(Math.max(retryAfter * 1000, attempt * 2500));
    return cachedFetch(api, query, attempt + 1);
  }
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${await response.text()}`);
  const payload = await response.json();
  const result = { accessedAt: new Date().toISOString(), query, data: payload.data ?? [] };
  await writeFile(cacheFile, JSON.stringify(result, null, 2), "utf8");
  return result;
}

const annualValue = (rows, reporter, partner, flow, code) => rows
  .filter(row => String(row.reporterCode) === reporter && String(row.partnerCode) === partner && row.flowCode === flow && row.cmdCode === code)
  .reduce((sum, row) => sum + Number(row.primaryValue ?? 0), 0) / 1_000_000;

const monthlyValue = (rows, reporter, partner, flow, code) => rows
  .filter(row => String(row.reporterCode) === reporter && String(row.partnerCode) === partner && row.flowCode === flow && row.cmdCode === code)
  .reduce((sum, row) => sum + Number(row.primaryValue ?? 0), 0) / 1_000_000;

async function main() {
  const annualRows = await loadAnnualRows();
  const monthlyRows = [];

  for (const period of MONTHS_2026) {
    for (const reporter of REPORTERS) {
      const exportsPayload = await cachedFetch(MONTHLY_API, {
        period,
        reporterCode: reporter,
        partnerCode: "699,344,360,458,608,702,704,764,784",
        flowCode: "X",
        cmdCode: CODES.join(","),
      });
      monthlyRows.push(...exportsPayload.data);
      const importsPayload = await cachedFetch(MONTHLY_API, {
        period,
        reporterCode: reporter,
        partnerCode: "156",
        flowCode: "M",
        cmdCode: CODES.join(","),
      });
      monthlyRows.push(...importsPayload.data);
    }
  }

  const directRows = [];
  for (const period of MONTHS_2026) {
    const payload = await cachedFetch(MONTHLY_API, {
      period,
      reporterCode: "699",
      partnerCode: "156",
      flowCode: "M",
      cmdCode: CODES.join(","),
    });
    directRows.push(...payload.data);
  }

  const annualMiddleRows = [];
  for (const [reporter, partner] of [["344", "458"], ["360", "764"]]) {
    const payload = await cachedFetch(ANNUAL_API, {
      period: "2025",
      reporterCode: reporter,
      partnerCode: partner,
      flowCode: "X",
      cmdCode: CODES.join(","),
    });
    annualMiddleRows.push(...payload.data);
  }
  const annualChinaMirrorRows = [];
  for (const reporter of REPORTERS) {
    const payload = await cachedFetch(ANNUAL_API, {
      period: "2025",
      reporterCode: reporter,
      partnerCode: "156",
      flowCode: "M",
      cmdCode: CODES.join(","),
    });
    annualChinaMirrorRows.push(...payload.data);
  }
  const allAnnualRows = [...annualRows, ...annualMiddleRows, ...annualChinaMirrorRows];

  const routeOutput = routes.map(route => ({
    ...route,
    coverage: "2025→2026 YTD",
    cnToHub: [annualValue(allAnnualRows, route.hub, "156", "M", route.code), monthlyValue(monthlyRows, route.hub, "156", "M", route.code)],
    hubToIndia: [annualValue(allAnnualRows, route.hub, "699", "X", route.code), monthlyValue(monthlyRows, route.hub, "699", "X", route.code)],
    directToIndia: [annualValue(allAnnualRows, "699", "156", "M", route.code), monthlyValue(directRows, "699", "156", "M", route.code)],
  }));

  const networkOutput = networks.map(route => ({
    ...route,
    coverage: "2025→2026 YTD",
    legs: route.legs.map(([reporter, partner]) => ({
      label: reporter === "156" ? "中国→第一中转国" : partner === "699" ? "末端中转国→印度" : "中转国→中转国",
      values: [
        reporter === "156" ? annualValue(allAnnualRows, partner, "156", "M", route.code) : annualValue(allAnnualRows, reporter, partner, "X", route.code),
        reporter === "156" ? monthlyValue(monthlyRows, partner, "156", "M", route.code) : monthlyValue(monthlyRows, reporter, partner, "X", route.code),
      ],
    })),
    directToIndia: [annualValue(allAnnualRows, "699", "156", "M", route.code), monthlyValue(directRows, "699", "156", "M", route.code)],
  }));

  const output = {
    generatedAt: new Date().toISOString(),
    source: "UN Comtrade public API, HS 2022 H6",
    methodology: "2025 annual values are the baseline. 2026 values are summed from published monthly data through June when available. China-to-hub legs use hub-reported imports from China as the mirror series; onward legs use hub-reported exports to the next node or India. Missing published months are not imputed.",
    routes: routeOutput,
    networks: networkOutput,
    annualRows: allAnnualRows.length,
    monthlyRows: monthlyRows.length,
    directRows: directRows.length,
    uniqueMonthlyKeys: new Set(monthlyRows.map(keyOf)).size,
  };
  await writeFile(OUTPUT, JSON.stringify(output, null, 2), "utf8");
  console.log(JSON.stringify(output, null, 2));
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
