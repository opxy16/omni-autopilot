// Copies contracts/deployments/*.json into dashboard/src/lib/deployments.json (addresses only).
import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, "..", "..", "contracts", "deployments");
const out = join(here, "..", "src", "lib", "deployments.json");

const all = {};
if (existsSync(src)) {
  for (const f of readdirSync(src)) {
    if (!/^\d+\.json$/.test(f)) continue;
    const chainId = f.replace(".json", "");
    const j = JSON.parse(readFileSync(join(src, f), "utf8"));
    const clean = {};
    for (const [k, v] of Object.entries(j)) {
      if (typeof v === "string" && /^0x[0-9a-fA-F]{40}$/.test(v)) clean[k] = v;
      else if (k === "deployBlock") clean[k] = String(v);
    }
    all[chainId] = clean;
  }
}
// Find the autopilot's deploy block from forge's broadcast receipts (lets the dashboard skip older blocks).
const lasna = all["5318007"];
const bdir = join(here, "..", "..", "contracts", "broadcast", "Deploy.s.sol", "5318007");
if (lasna?.autopilot && existsSync(bdir)) {
  for (const f of readdirSync(bdir).filter((f) => f.endsWith(".json"))) {
    const run = JSON.parse(readFileSync(join(bdir, f), "utf8"));
    const r = (run.receipts ?? []).find((x) => x.contractAddress?.toLowerCase() === lasna.autopilot.toLowerCase());
    if (r) lasna.deployBlock = String(parseInt(r.blockNumber, 16));
  }
}
writeFileSync(out, JSON.stringify(all, null, 2) + "\n");
console.log(`wrote ${Object.keys(all).length} chain(s) to src/lib/deployments.json`);
