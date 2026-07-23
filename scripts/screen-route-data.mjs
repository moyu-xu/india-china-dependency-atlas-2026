import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const API = "https://comtradeapi.un.org/public/v1/preview/C/A/HS";
const CACHE_DIR = resolve(".cache/route-screen");
const OUTPUT = resolve(".cache/route-screen/candidates.json");
// 2023→2024 is the latest fully comparable annual window across all reporters.
// The 2025 responses are cached separately, but are not used to rank paths when
// a reporting country has not yet supplied a complete comparable series.
const YEARS = [2023, 2024];
const CHUNK_SIZE = 7;
const REQUEST_DELAY_MS = 1400;
const HS_CODES = [
  "854231", "850760", "850440", "854142", "390761", "250410", "284690",
  "841370", "848180", "846693", "843143", "870840", "310210", "310530",
  "310420", "310520", "843031", "843039", "870410", "870510", "870540",
];
const HUBS = {
  "704": "越南", "458": "马来西亚", "702": "新加坡", "784": "阿联酋",
  "360": "印度尼西亚", "764": "泰国", "410": "韩国", "344": "中国香港", "608": "菲律宾",
};

const delay = (milliseconds) => new Promise(resolveDelay => setTimeout(resolveDelay, milliseconds));
const chunks = (values, size) => Array.from({ length: Math.ceil(values.length / size) }, (_, index) => values.slice(index * size, (index + 1) * size));

async function cachedFetch({ year, reporter, partners, flow, codes }, attempt = 1) {
  await mkdir(CACHE_DIR, { recursive: true });
  const partnerKey = [...partners].sort().join("-");
  const codeKey = [...codes].sort().join("-");
  const cacheFile = resolve(CACHE_DIR, `${year}_${reporter}_${partnerKey}_${flow}_${codeKey}.json`);
  try {
    return JSON.parse(await readFile(cacheFile, "utf8"));
  } catch {
    // Cache miss: request the public API below.
  }

  const params = new URLSearchParams({
    period: String(year), reporterCode: reporter, partnerCode: partners.join(","), flowCode: flow,
    cmdCode: codes.join(","), partner2Code: "0", customsCode: "C00", motCode: "0", maxRecords: "500",
  });
  await delay(REQUEST_DELAY_MS);
  let response;
  try {
    response = await fetch(`${API}?${params}`, {
      headers: { "user-agent": "india-china-dependency-atlas/3.0" },
      signal: AbortSignal.timeout(45_000),
    });
  } catch (error) {
    if (attempt >= 6) throw error;
    await delay(attempt * 2000);
    return cachedFetch({ year, reporter, partners, flow, codes }, attempt + 1);
  }
  if (response.status === 429) {
    const retryAfter = Number(response.headers.get("retry-after") ?? 2);
    if (attempt >= 6) throw new Error(`Rate limit persisted after ${attempt} attempts`);
    await delay(Math.max(retryAfter * 1000, attempt * 2000));
    return cachedFetch({ year, reporter, partners, flow, codes }, attempt + 1);
  }
  if (!response.ok) throw new Error(`UN Comtrade HTTP ${response.status}: ${await response.text()}`);
  const payload = await response.json();
  const result = { accessedAt: new Date().toISOString(), query: Object.fromEntries(params), data: payload.data ?? [] };
  await writeFile(cacheFile, JSON.stringify(result, null, 2), "utf8");
  return result;
}

const valueOf = (rows, year, reporter, partner, flow, code) => rows
  .filter(row => Number(row.period) === year && String(row.reporterCode) === reporter && String(row.partnerCode) === partner && row.flowCode === flow && row.cmdCode === code)
  .reduce((sum, row) => sum + Number(row.primaryValue ?? 0), 0) / 1_000_000;

const growth = (oldValue, newValue) => oldValue > 0 ? (newValue - oldValue) / oldValue * 100 : (newValue > 0 ? Infinity : 0);

async function main() {
  const rows = [];
  const codeChunks = chunks(HS_CODES, CHUNK_SIZE);
  for (const year of YEARS) {
    for (const codes of codeChunks) {
      const china = await cachedFetch({ year, reporter: "156", partners: Object.keys(HUBS), flow: "X", codes });
      rows.push(...china.data);
      const direct = await cachedFetch({ year, reporter: "699", partners: ["156"], flow: "M", codes });
      rows.push(...direct.data);
    }
    for (const hub of Object.keys(HUBS)) {
      for (const codes of codeChunks) {
        const onward = await cachedFetch({ year, reporter: hub, partners: ["699"], flow: "X", codes });
        rows.push(...onward.data);
      }
    }
    // Middle legs for China → hub A → hub B → India. Each reporter is
    // requested separately so the route never substitutes world totals for a
    // missing bilateral segment.
    for (const firstHub of Object.keys(HUBS)) {
      const secondHubs = Object.keys(HUBS).filter(code => code !== firstHub);
      for (const codes of codeChunks) {
        const middle = await cachedFetch({ year, reporter: firstHub, partners: secondHubs, flow: "X", codes });
        rows.push(...middle.data);
      }
    }
  }

  const candidates = [];
  for (const code of HS_CODES) {
    for (const [hub, hubName] of Object.entries(HUBS)) {
      const cnToHub = YEARS.map(year => valueOf(rows, year, "156", hub, "X", code));
      const hubToIndia = YEARS.map(year => valueOf(rows, year, hub, "699", "X", code));
      const direct = YEARS.map(year => valueOf(rows, year, "699", "156", "M", code));
      const firstGrowth = growth(cnToHub.at(-2), cnToHub.at(-1));
      const secondGrowth = growth(hubToIndia.at(-2), hubToIndia.at(-1));
      if (cnToHub.at(-1) >= 0.1 && hubToIndia.at(-1) >= 0.1 && firstGrowth > 0 && secondGrowth > 0) {
        candidates.push({ code, hub, hubName, years: YEARS, cnToHub, hubToIndia, direct, firstGrowth, secondGrowth, directGrowth: growth(direct.at(-2), direct.at(-1)), weakestLatest: Math.min(cnToHub.at(-1), hubToIndia.at(-1)) });
      }
    }
  }
  candidates.sort((a, b) => (b.weakestLatest * Math.min(b.firstGrowth, b.secondGrowth)) - (a.weakestLatest * Math.min(a.firstGrowth, a.secondGrowth)));
  const multiCandidates = [];
  for (const code of HS_CODES) {
    for (const [firstHub, firstHubName] of Object.entries(HUBS)) {
      for (const [secondHub, secondHubName] of Object.entries(HUBS)) {
        if (firstHub === secondHub) continue;
        const first = YEARS.map(year => valueOf(rows, year, "156", firstHub, "X", code));
        const middle = YEARS.map(year => valueOf(rows, year, firstHub, secondHub, "X", code));
        const last = YEARS.map(year => valueOf(rows, year, secondHub, "699", "X", code));
        const direct = YEARS.map(year => valueOf(rows, year, "699", "156", "M", code));
        const growths = [growth(first[0], first[1]), growth(middle[0], middle[1]), growth(last[0], last[1])];
        if (Math.min(first[1], middle[1], last[1]) >= 0.1 && growths.every(value => value > 0)) {
          multiCandidates.push({ code, firstHub, firstHubName, secondHub, secondHubName, years: YEARS, legs: [first, middle, last], direct, growths, directGrowth: growth(direct[0], direct[1]), weakestLatest: Math.min(first[1], middle[1], last[1]) });
        }
      }
    }
  }
  multiCandidates.sort((a, b) => (b.weakestLatest * Math.min(...b.growths)) - (a.weakestLatest * Math.min(...a.growths)));
  const output = { generatedAt: new Date().toISOString(), source: API, methodology: "Reporter-side bilateral exports for every leg; India-reported direct imports from China as comparison; HS 2022 H6", candidates, multiCandidates };
  await writeFile(OUTPUT, JSON.stringify(output, null, 2), "utf8");
  console.log(JSON.stringify(output, null, 2));
}

main().catch(error => { console.error(error); process.exitCode = 1; });
