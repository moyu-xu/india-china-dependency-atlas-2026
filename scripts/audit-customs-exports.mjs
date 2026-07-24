import fs from "node:fs";
import { TextDecoder } from "node:util";

const files = [
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

function toNumber(value) {
  return Number(String(value ?? "0").replaceAll(",", ""));
}

const byHs6 = new Map();
let totalRows = 0;
const fertilizerCodes = new Set();

for (const file of files) {
  const rows = parseCsv(new TextDecoder("gb18030").decode(fs.readFileSync(file)));
  const headers = rows[0];
  for (const row of rows.slice(1)) {
    const record = Object.fromEntries(headers.map((header, index) => [header, row[index]]));
    if (!record["商品编码"]) continue;
    totalRows += 1;
    const hs8 = record["商品编码"];
    const hs6 = hs8.slice(0, 6);
    if (hs8.startsWith("310")) fertilizerCodes.add(hs8);
    const year = record["数据年月"].slice(0, 4);
    const usd = toNumber(record["美元"]);
    if (!byHs6.has(hs6)) {
      byHs6.set(hs6, { rows: 0, usd2025: 0, usd2026: 0, codes: new Map() });
    }
    const group = byHs6.get(hs6);
    group.rows += 1;
    group[`usd${year}`] = (group[`usd${year}`] ?? 0) + usd;
    if (!group.codes.has(hs8)) {
      group.codes.set(hs8, { name: record["商品名称"], usd2025: 0, usd2026: 0, rows: 0 });
    }
    const code = group.codes.get(hs8);
    code.rows += 1;
    code[`usd${year}`] = (code[`usd${year}`] ?? 0) + usd;
  }
}

console.log(`rows=${totalRows}`);
console.log(`fertilizerHs8=${[...fertilizerCodes].sort().join(",") || "none"}`);
for (const [hs6, group] of [...byHs6].sort(([a], [b]) => a.localeCompare(b))) {
  console.log(`${hs6} rows=${group.rows} 2025=$${(group.usd2025 / 1_000_000).toFixed(3)}M 2026=$${(group.usd2026 / 1_000_000).toFixed(3)}M`);
  for (const [hs8, code] of [...group.codes].sort(([a], [b]) => a.localeCompare(b))) {
    console.log(`  ${hs8} 2025=$${(code.usd2025 / 1_000_000).toFixed(3)}M 2026=$${(code.usd2026 / 1_000_000).toFixed(3)}M rows=${code.rows} ${code.name}`);
  }
}
