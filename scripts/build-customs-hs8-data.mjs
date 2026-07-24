import fs from "node:fs";
import path from "node:path";
import { TextDecoder } from "node:util";

const root = process.cwd();
const outputPath = path.join(root, "src", "data", "chinaCustomsHs8.json");
const sourceFiles = [
  "E:/下载/数据导出.csv",
  "E:/下载/数据导出 (1).csv",
];

function parseCsv(text) {
  const rows = [];
  let row = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (quoted) {
      if (char === "\"" && next === "\"") {
        value += "\"";
        index += 1;
      } else if (char === "\"") {
        quoted = false;
      } else {
        value += char;
      }
      continue;
    }
    if (char === "\"") {
      quoted = true;
    } else if (char === ",") {
      row.push(value);
      value = "";
    } else if (char === "\n") {
      row.push(value);
      if (row.some((cell) => cell !== "")) rows.push(row);
      row = [];
      value = "";
    } else if (char !== "\r") {
      value += char;
    }
  }
  if (value || row.length) {
    row.push(value);
    rows.push(row);
  }
  return rows;
}

function numeric(value) {
  return Number(String(value ?? "0").replaceAll(",", ""));
}

function ensureMap(map, key, init) {
  if (!map.has(key)) map.set(key, init());
  return map.get(key);
}

function addMonth(map, period, usd, firstQty, secondQty) {
  const month = ensureMap(map, period, () => ({ period, usd: 0, rows: 0, firstQty: 0, secondQty: 0 }));
  month.usd += usd;
  month.rows += 1;
  month.firstQty += firstQty;
  month.secondQty += secondQty;
}

function serializeTradeModes(map) {
  return [...map.values()]
    .map((mode) => ({
      ...mode,
      months: [...mode.months.values()].sort((a, b) => a.period.localeCompare(b.period)),
    }))
    .sort((a, b) => b.usd - a.usd);
}

const hs6Map = new Map();
let rowCount = 0;

for (const file of sourceFiles) {
  const rows = parseCsv(new TextDecoder("gb18030").decode(fs.readFileSync(file)));
  const headers = rows[0];
  for (const row of rows.slice(1)) {
    const record = Object.fromEntries(headers.map((header, index) => [header, row[index]]));
    const hs8 = record["商品编码"];
    const period = record["数据年月"];
    if (!hs8 || !period) continue;
    rowCount += 1;
    const hs6 = hs8.slice(0, 6);
    const year = period.slice(0, 4);
    const usd = numeric(record["美元"]);
    const firstQty = numeric(record["第一数量"]);
    const secondQty = numeric(record["第二数量"]);
    const hs6Group = ensureMap(hs6Map, hs6, () => ({
      hs6,
      rows: 0,
      annual: {},
      months: new Map(),
      tradeModes: new Map(),
      hs8: new Map(),
    }));
    hs6Group.rows += 1;
    hs6Group.annual[year] ??= { usd: 0, rows: 0, firstQty: 0, secondQty: 0 };
    hs6Group.annual[year].usd += usd;
    hs6Group.annual[year].rows += 1;
    hs6Group.annual[year].firstQty += firstQty;
    hs6Group.annual[year].secondQty += secondQty;
    addMonth(hs6Group.months, period, usd, firstQty, secondQty);
    const groupTradeMode = ensureMap(hs6Group.tradeModes, record["贸易方式编码"], () => ({
      code: record["贸易方式编码"],
      name: record["贸易方式名称"],
      usd: 0,
      rows: 0,
      months: new Map(),
    }));
    groupTradeMode.usd += usd;
    groupTradeMode.rows += 1;
    addMonth(groupTradeMode.months, period, usd, firstQty, secondQty);

    const code = ensureMap(hs6Group.hs8, hs8, () => ({
      code: hs8,
      name: record["商品名称"],
      rows: 0,
      annual: {},
      months: new Map(),
      tradeModes: new Map(),
      firstUnit: record["第一计量单位"],
      secondUnit: record["第二计量单位"],
    }));
    code.rows += 1;
    code.annual[year] ??= { usd: 0, rows: 0, firstQty: 0, secondQty: 0 };
    code.annual[year].usd += usd;
    code.annual[year].rows += 1;
    code.annual[year].firstQty += firstQty;
    code.annual[year].secondQty += secondQty;
    addMonth(code.months, period, usd, firstQty, secondQty);
    const tradeMode = ensureMap(code.tradeModes, record["贸易方式编码"], () => ({
      code: record["贸易方式编码"],
      name: record["贸易方式名称"],
      usd: 0,
      rows: 0,
      months: new Map(),
    }));
    tradeMode.usd += usd;
    tradeMode.rows += 1;
    addMonth(tradeMode.months, period, usd, firstQty, secondQty);
  }
}

const byHs6 = {};
for (const [hs6, group] of [...hs6Map].sort(([a], [b]) => a.localeCompare(b))) {
  byHs6[hs6] = {
    hs6,
    rows: group.rows,
    annual: group.annual,
    months: [...group.months.values()].sort((a, b) => a.period.localeCompare(b.period)),
    tradeModes: serializeTradeModes(group.tradeModes),
    hs8: [...group.hs8.values()]
      .map((code) => ({
        ...code,
        months: [...code.months.values()].sort((a, b) => a.period.localeCompare(b.period)),
        tradeModes: serializeTradeModes(code.tradeModes),
      }))
      .sort((a, b) => (b.annual["2025"]?.usd ?? 0) - (a.annual["2025"]?.usd ?? 0)),
  };
}

const output = {
  sourceLabel: "海关总署统计网",
  sourceUrl: "http://stats.customs.gov.cn/",
  accessedAt: "2026-07-24",
  flow: "中国出口至印度",
  partnerCode: "111",
  partnerName: "印度",
  currency: "USD",
  sourceFiles: sourceFiles.map((file) => path.basename(file)),
  rowCount,
  byHs6,
};

fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");
console.log(`wrote ${outputPath}`);
console.log(`rows=${rowCount} hs6=${Object.keys(byHs6).length}`);
