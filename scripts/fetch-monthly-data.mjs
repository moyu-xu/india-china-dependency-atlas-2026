import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const API = "https://comtradeapi.un.org/public/v1/preview/C/M/HS";
const REQUIRED_CLASSIFICATION = "H6"; // UN Comtrade code for HS 2022.
const OUTPUT = resolve("src/data/monthlyTrade.ts");
const CACHE_DIR = resolve(".cache/monthly-trade");
const ACCESS_DATE = new Date().toISOString().slice(0, 10);
const REQUEST_DELAY_MS = 1400;

const commodities = {
  ic: "854231",
  battery: "850760",
  transformers: "850440",
  semiconductor: "854142",
  fertilizer_urea: "310210",
  fertilizer_dap: "310530",
  fertilizer_mop: "310420",
  fertilizer_npk: "310520",
  polymer: "390761",
  graphite: "250410",
  rareearth: "284690",
  pumps: "841370",
  valves: "848180",
  toolparts: "846693",
  machineparts: "843143",
  tunnel_843031: "843031",
  tunnel_843039: "843039",
  earthmoving_dumptruck: "870410",
  earthmoving_crane: "870510",
  earthmoving_mixer: "870540",
  autoparts: "870840",
};

const months = [];
for (let year = 2024, month = 12; year < 2026 || (year === 2026 && month <= 6);) {
  months.push({ period: `${year}${String(month).padStart(2, "0")}` });
  month += 1;
  if (month === 13) {
    month = 1;
    year += 1;
  }
}

const delay = (milliseconds) => new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));

async function fetchPeriod(period, attempt = 1) {
  await mkdir(CACHE_DIR, { recursive: true });
  const codeKey = [...new Set(Object.values(commodities).flat())].sort().join("-");
  const cacheFile = resolve(CACHE_DIR, `${period}_699_0-156_M_${codeKey}.json`);
  try {
    return JSON.parse(await readFile(cacheFile, "utf8"));
  } catch {
    // Cache miss.
  }
  const params = new URLSearchParams({
    period,
    reporterCode: "699",
    partnerCode: "0,156",
    flowCode: "M",
    cmdCode: [...new Set(Object.values(commodities).flat())].join(","),
    partner2Code: "0",
    customsCode: "C00",
    motCode: "0",
    maxRecords: "500",
  });
  await delay(REQUEST_DELAY_MS);
  try {
    const response = await fetch(`${API}?${params}`, {
      headers: { "user-agent": "india-china-dependency-atlas/2.0" },
      signal: AbortSignal.timeout(45_000),
    });
    if (response.status === 429) {
      const retryAfter = Number(response.headers.get("retry-after") ?? 2);
      if (attempt >= 6) throw new Error(`HTTP 429 after ${attempt} attempts`);
      await delay(Math.max(retryAfter * 1000, attempt * 2000));
      return fetchPeriod(period, attempt + 1);
    }
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    if (payload.error) throw new Error(payload.error);
    const incompatible = payload.data.filter((row) => row.classificationCode !== REQUIRED_CLASSIFICATION);
    if (incompatible.length > 0) {
      const versions = [...new Set(incompatible.map((row) => row.classificationCode))].join(", ");
      throw new Error(`Expected HS 2022 (${REQUIRED_CLASSIFICATION}), received: ${versions}`);
    }
    const result = { accessedAt: new Date().toISOString(), query: Object.fromEntries(params), data: payload.data ?? [] };
    await writeFile(cacheFile, JSON.stringify(result, null, 2), "utf8");
    console.log(`${period}: ${payload.count} records`);
    return result;
  } catch (error) {
    if (attempt >= 6) throw error;
    await delay(attempt * 2000);
    return fetchPeriod(period, attempt + 1);
  }
}

function render(results) {
  const lines = [
    "export type MonthlyTradePoint = {",
    "  period: string;",
    "  china: number | null;",
    "  world: number | null;",
    "  share: number | null;",
    '  status: "available" | "pending";',
    "};",
    "",
    "// Unit: US$ million. India-reported monthly imports classified under HS 2022 (UN Comtrade H6).",
    "// Null values are intentionally retained when the source has not published that month.",
    `export const MONTHLY_SOURCE_ACCESSED = \"${ACCESS_DATE}\";`,
    "export const MONTHLY_SOURCE_LABEL = \"UN Comtrade monthly API · HS 2022 (H6)\";",
    "export const MONTHLY_SOURCE_URL = \"https://comtradeplus.un.org/TradeFlow\";",
    "",
    "export const monthlyTradeById: Record<string, MonthlyTradePoint[]> = {",
  ];

  for (const [id, hs] of Object.entries(commodities)) {
    const hsCodes = Array.isArray(hs) ? hs : [hs];
    lines.push(`  ${id}: [`);
    for (const result of results) {
      const records = result.data.filter((row) => hsCodes.includes(row.cmdCode));
      const worldRows = records.filter((row) => row.partnerCode === 0);
      const chinaRows = records.filter((row) => row.partnerCode === 156);
      const period = `${result.period.slice(0, 4)}-${result.period.slice(4)}`;
      if (!result.published) {
        lines.push(`    { period: \"${period}\", china: null, world: null, share: null, status: \"pending\" },`);
        continue;
      }
      const china = chinaRows.reduce((sum, row) => sum + (row.primaryValue ?? 0), 0) / 1_000_000;
      const world = worldRows.reduce((sum, row) => sum + (row.primaryValue ?? 0), 0) / 1_000_000;
      const share = world > 0 ? (china / world) * 100 : 0;
      lines.push(`    { period: \"${period}\", china: ${china.toFixed(2)}, world: ${world.toFixed(2)}, share: ${share.toFixed(1)}, status: \"available\" },`);
    }
    lines.push("  ],");
  }
  lines.push("};", "");
  return lines.join("\n");
}

const results = [];
for (const { period } of months) {
  const payload = await fetchPeriod(period);
  results.push({ period, data: payload.data, published: payload.data.length > 0 });
}

await mkdir(dirname(OUTPUT), { recursive: true });
await writeFile(OUTPUT, render(results), "utf8");
console.log(`Wrote ${OUTPUT}`);
