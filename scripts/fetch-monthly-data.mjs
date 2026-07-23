import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const API = "https://comtradeapi.un.org/public/v1/preview/C/M/HS";
const OUTPUT = resolve("src/data/monthlyTrade.ts");
const ACCESS_DATE = new Date().toISOString().slice(0, 10);

const commodities = {
  ic: "8542",
  battery: "8507",
  transformers: "8504",
  semiconductor: "8541",
  fertilizer: "31",
  fertilizer_urea: "310210",
  fertilizer_dap: "310530",
  fertilizer_mop: "310420",
  fertilizer_npk: "310520",
  polymer: "3907",
  graphite: "2504",
  rareearth: "2846",
  pumps: "8413",
  valves: "8481",
  toolparts: "8466",
  machineparts: "8431",
  tunnel: "8430",
  earthmoving: "8429",
  autoparts: "8708",
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
  const params = new URLSearchParams({
    period,
    reporterCode: "699",
    partnerCode: "0,156",
    flowCode: "M",
    cmdCode: Object.values(commodities).join(","),
    partner2Code: "0",
    customsCode: "C00",
    motCode: "0",
    maxRecords: "500",
  });
  try {
    const response = await fetch(`${API}?${params}`, {
      headers: { "user-agent": "india-china-dependency-atlas/2.0" },
      signal: AbortSignal.timeout(45_000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    if (payload.error) throw new Error(payload.error);
    console.log(`${period}: ${payload.count} records`);
    return payload.data;
  } catch (error) {
    if (attempt >= 3) throw error;
    await delay(attempt * 1500);
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
    "// Unit: US$ million. India-reported monthly imports, keyed by HS chapter/HS4/HS6.",
    "// Null values are intentionally retained when the source has not published that month.",
    `export const MONTHLY_SOURCE_ACCESSED = \"${ACCESS_DATE}\";`,
    "export const MONTHLY_SOURCE_LABEL = \"UN Comtrade monthly API\";",
    "export const MONTHLY_SOURCE_URL = \"https://comtradeplus.un.org/TradeFlow\";",
    "",
    "export const monthlyTradeById: Record<string, MonthlyTradePoint[]> = {",
  ];

  for (const [id, hs] of Object.entries(commodities)) {
    lines.push(`  ${id}: [`);
    for (const result of results) {
      const records = result.data.filter((row) => row.cmdCode === hs);
      const worldRow = records.find((row) => row.partnerCode === 0);
      const chinaRow = records.find((row) => row.partnerCode === 156);
      const period = `${result.period.slice(0, 4)}-${result.period.slice(4)}`;
      if (!worldRow) {
        lines.push(`    { period: \"${period}\", china: null, world: null, share: null, status: \"pending\" },`);
        continue;
      }
      const china = (chinaRow?.primaryValue ?? 0) / 1_000_000;
      const world = worldRow.primaryValue / 1_000_000;
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
  results.push({ period, data: await fetchPeriod(period) });
  await delay(350);
}

await mkdir(dirname(OUTPUT), { recursive: true });
await writeFile(OUTPUT, render(results), "utf8");
console.log(`Wrote ${OUTPUT}`);
