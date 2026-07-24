import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = JSON.parse(fs.readFileSync(path.join(root,"src/data/batteryChinaCustoms.json"),"utf8"));
const failures = [];

const sum = key => source.months.reduce((total,point)=>total+point[key],0);
const months = source.months.map(point=>point.period);
const expectedMonths = Array.from({length:12},(_,index)=>`2025-${String(index+1).padStart(2,"0")}`);

if (source.hs8 !== "85076000") failures.push(`Unexpected HS8: ${source.hs8}`);
if (source.partnerCode !== "111" || source.partner !== "印度") failures.push("Unexpected trade partner");
if (source.currency !== "CNY") failures.push(`Unexpected currency: ${source.currency}`);
if (JSON.stringify(months) !== JSON.stringify(expectedMonths)) failures.push("Monthly coverage is not 2025-01 through 2025-12");
for (const key of ["rmb","units","kg","rows"]) {
  if (sum(key) !== source.annual[key]) failures.push(`${key} monthly sum ${sum(key)} != annual ${source.annual[key]}`);
}
const modeRmb = source.tradeModes.reduce((total,mode)=>total+mode.rmb,0);
if (modeRmb !== source.annual.rmb) failures.push(`Trade-mode RMB sum ${modeRmb} != annual ${source.annual.rmb}`);
if (source.months.some(point=>point.rmb<=0 || point.units<=0 || point.kg<=0 || point.rows<=0)) failures.push("Monthly data contains a non-positive value");

const summary = {
  hs8: source.hs8,
  partner: source.partner,
  months: source.months.length,
  rows: source.annual.rows,
  annualRmb: source.annual.rmb,
  annualUnits: source.annual.units,
  annualKg: source.annual.kg,
  failures: failures.length,
};
console.log(JSON.stringify(summary,null,2));
if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(2);
}
