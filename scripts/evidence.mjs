#!/usr/bin/env node
// Prints a markdown table of every full Reactive loop the autopilot has run:
// origin event → reactive tx on Lasna → callback on the destination (→ echo back on Lasna),
// with explorer links and latency measured from block timestamps.
//
//   node scripts/evidence.mjs [lookbackBlocks]   (default 200000 ≈ 2 days of Lasna blocks)
//
// Uses viem from dashboard/node_modules (run `npm install` in dashboard/ first).
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(join(root, "dashboard", "package.json"));
const { createPublicClient, http, parseAbi, decodeEventLog, toHex } = require("viem");

const dep = (c) => JSON.parse(readFileSync(join(root, "contracts", "deployments", `${c}.json`), "utf8"));
const CH = {
  5318007: { name: "Lasna", rpc: "https://lasna-rpc.rnk.dev/", exp: "https://lasna.reactscan.net" },
  11155111: { name: "Sepolia", rpc: "https://ethereum-sepolia-rpc.publicnode.com", exp: "https://sepolia.etherscan.io" },
  84532: { name: "Base Sepolia", rpc: "https://sepolia.base.org", exp: "https://sepolia.basescan.org" },
  1301: { name: "Unichain Sepolia", rpc: "https://sepolia.unichain.org", exp: "https://sepolia.uniscan.xyz" },
};
const clients = {};
const cl = (id) => (clients[id] ??= createPublicClient({ transport: http(CH[id].rpc, { timeout: 20_000, retryCount: 2 }) }));
const abi = parseAbi([
  "event RebalanceRequested(uint256 indexed nonce, bool sellEth, uint256 amountIn, uint256 minOut, uint16 ethShareBps, uint256 originChainId, uint256 originTx)",
  "event RebalanceSettled(uint256 indexed nonce, bool executed, uint256 originTx)",
  "event RangeAlertRequested(uint8 indexed kind, uint256 priceE18, uint256 lowerE18, uint256 upperE18, uint256 originChainId, uint256 originTx)",
  "event SnapshotRequested(uint256 indexed id, uint256 totalUsd, uint16 ethShareBps)",
  "event CallbackLanded(uint8 indexed kind, uint256 indexed id, uint256 chainId, uint256 destTx)",
]);
const hx = (v) => toHex(v, { size: 32 });
const link = (id, tx) => `[${tx.slice(0, 10)}…](${CH[id].exp}/tx/${tx})`;
const tCache = {};
async function txTime(id, tx) {
  const k = id + tx;
  if (tCache[k] !== undefined) return tCache[k];
  try {
    const r = await cl(id).getTransactionReceipt({ hash: tx });
    const b = await cl(id).getBlock({ blockNumber: r.blockNumber });
    return (tCache[k] = Number(b.timestamp));
  } catch {
    return (tCache[k] = undefined);
  }
}

const ap = dep(5318007).autopilot;
const L = cl(5318007);
const latest = await L.getBlockNumber();
const lookback = BigInt(process.argv[2] ?? 200000);
const from = latest > lookback ? latest - lookback : 0n;
const logs = [];
for (let s = from; s <= latest; s += 10000n) {
  const e = s + 9999n > latest ? latest : s + 9999n;
  logs.push(...(await L.getLogs({ address: ap, fromBlock: s, toBlock: e })));
}
const ev = [];
for (const l of logs) {
  try {
    const d = decodeEventLog({ abi, data: l.data, topics: l.topics });
    ev.push({ name: d.eventName, a: d.args, l });
  } catch {}
}
const settled = new Map(ev.filter((e) => e.name === "RebalanceSettled").map((e) => [e.a.nonce, e]));
const landed = ev.filter((e) => e.name === "CallbackLanded");
const used = new Set();
const nextLanded = (kind, after) => landed.find((e) => !used.has(e) && Number(e.a.kind) === kind && e.l.blockNumber >= after);

const rows = [];
for (const e of ev) {
  const rx = e.l.transactionHash;
  let what, origin, cb, echo;
  if (e.name === "RebalanceRequested") {
    const s = settled.get(e.a.nonce);
    what = `Rebalance #${e.a.nonce}: ETH share ${(Number(e.a.ethShareBps) / 100).toFixed(1)}% → vault ${e.a.sellEth ? "sells" : "buys"} tETH`;
    origin = Number(e.a.originChainId) && e.a.originTx ? { id: Number(e.a.originChainId), tx: hx(e.a.originTx) } : null;
    if (s) {
      cb = { id: 84532, tx: hx(s.a.originTx), note: s.a.executed ? "" : " (skipped by vault rail)" };
      echo = s.l.transactionHash;
    }
  } else if (e.name === "RangeAlertRequested") {
    const k = ["", "back inside", "fell below", "rose above"][Number(e.a.kind)];
    what = `LP range alert: price $${(Number(e.a.priceE18) / 1e18).toFixed(0)} ${k} $${Number(e.a.lowerE18) / 1e18}–$${Number(e.a.upperE18) / 1e18}`;
    origin = { id: Number(e.a.originChainId), tx: hx(e.a.originTx) };
    const l2 = nextLanded(2, e.l.blockNumber);
    if (l2) (used.add(l2), (cb = { id: Number(l2.a.chainId), tx: hx(l2.a.destTx), note: "" }), (echo = l2.l.transactionHash));
  } else if (e.name === "SnapshotRequested") {
    what = `Journal snapshot #${e.a.id}: $${(Number(e.a.totalUsd) / 1e18).toFixed(0)}, ${(Number(e.a.ethShareBps) / 100).toFixed(1)}% ETH`;
    origin = null;
    const l1 = nextLanded(1, e.l.blockNumber);
    if (l1) (used.add(l1), (cb = { id: Number(l1.a.chainId), tx: hx(l1.a.destTx), note: "" }), (echo = l1.l.transactionHash));
  } else continue;
  const [to, tr, tc] = await Promise.all([origin ? txTime(origin.id, origin.tx) : undefined, txTime(5318007, rx), cb ? txTime(cb.id, cb.tx) : undefined]);
  const lat = to !== undefined && tc !== undefined ? `${tc - to}s` : tr !== undefined && tc !== undefined ? `${tc - tr}s from Lasna` : "—";
  rows.push(
    `| ${what} | ${origin ? `${CH[origin.id].name} ${link(origin.id, origin.tx)}` : "Lasna cron / owner"} | ${link(5318007, rx)} | ${cb ? `${CH[cb.id].name} ${link(cb.id, cb.tx)}${cb.note}` : "pending"} | ${echo ? link(5318007, echo) : "—"} | ${lat} |`,
  );
}
console.log("| Loop | Origin event | Reactive tx (Lasna) | Callback | Landing seen on Lasna | Origin → callback |");
console.log("|---|---|---|---|---|---|");
for (const r of rows) console.log(r);
console.log(`\n_${rows.length} loops, generated from on-chain events of ${ap} at Lasna block ${latest}._`);
