import { createPublicClient, http, formatUnits, type PublicClient, type Log, toHex } from "viem";
import { CHAINS, ORIGIN_ORDER, lasna, VIEM_CHAINS } from "./chains";
import { autopilotAbi, journalAbi, vaultAbi, systemAbi } from "./abi";
import deployments from "./deployments.json";
import history from "./history.json";
import type { DashState, FeedItem, Hex, Loop } from "./types";

const SYSTEM = "0x8888888888888888888888888888888888888888" as const;
const LOOKBACK = BigInt(process.env.LASNA_LOOKBACK_BLOCKS ?? 60_000); // ≈ 17 h of ~1 s blocks
const CHUNK = BigInt(process.env.LASNA_LOG_CHUNK ?? 10_000);

type Dep = Partial<Record<string, string>>;
const dep = deployments as unknown as Record<string, Dep>;
const at = (chainId: number, key: string) => (dep[String(chainId)]?.[key] || undefined) as Hex | undefined;

const clients = new Map<number, PublicClient>();
function client(chainId: number): PublicClient {
  let c = clients.get(chainId);
  if (!c) {
    c = createPublicClient({
      chain: VIEM_CHAINS[chainId as keyof typeof VIEM_CHAINS],
      transport: http(CHAINS[chainId].rpc, { timeout: 12_000, retryCount: 1 }),
    }) as PublicClient;
    clients.set(chainId, c);
  }
  return c;
}

const n = (v: bigint, d = 18) => Number(formatUnits(v, d));

// ───────────── caches that survive between requests on a warm server ─────────────
const blockTime = new Map<string, number>(); // `${chainId}:${block}` → unix secs
const txTime = new Map<string, number>(); // `${chainId}:${tx}` → unix secs
let logCache: { from: bigint; to: bigint; logs: Log[] } | null = null;

async function timeOfBlock(chainId: number, block: bigint): Promise<number | undefined> {
  const k = `${chainId}:${block}`;
  if (blockTime.has(k)) return blockTime.get(k);
  try {
    const b = await client(chainId).getBlock({ blockNumber: block });
    blockTime.set(k, Number(b.timestamp));
    return Number(b.timestamp);
  } catch {
    return undefined;
  }
}

async function timeOfTx(chainId: number, tx: Hex): Promise<number | undefined> {
  const k = `${chainId}:${tx}`;
  if (txTime.has(k)) return txTime.get(k);
  try {
    const r = await client(chainId).getTransactionReceipt({ hash: tx });
    const t = await timeOfBlock(chainId, r.blockNumber);
    if (t !== undefined) txTime.set(k, t);
    return t;
  } catch {
    return undefined;
  }
}

async function lasnaLogs(address: Hex, latest: bigint): Promise<Log[]> {
  const deployBlock = BigInt(dep[String(lasna.id)]?.deployBlock ?? 0);
  let start = latest > LOOKBACK ? latest - LOOKBACK : 0n;
  if (start < deployBlock) start = deployBlock;
  if (logCache && logCache.from <= start && logCache.to < latest) {
    const fresh = await getLogsChunked(address, logCache.to + 1n, latest);
    logCache = { from: logCache.from, to: latest, logs: [...logCache.logs, ...fresh].filter((l) => l.blockNumber! >= start) };
    logCache.from = start;
  } else if (!logCache || logCache.from > start || logCache.to < latest) {
    logCache = { from: start, to: latest, logs: await getLogsChunked(address, start, latest) };
  }
  return logCache.logs;
}

async function getLogsChunked(address: Hex, from: bigint, to: bigint): Promise<Log[]> {
  const ranges: [bigint, bigint][] = [];
  for (let s = from; s <= to; s += CHUNK) ranges.push([s, s + CHUNK - 1n > to ? to : s + CHUNK - 1n]);
  const out: Log[] = [];
  // newest chunks first, a few at a time
  for (let i = ranges.length - 1; i >= 0; i -= 4) {
    const batch = ranges.slice(Math.max(0, i - 3), i + 1);
    const res = await Promise.all(
      batch.map(([a, b]) => client(lasna.id).getLogs({ address, fromBlock: a, toBlock: b }).catch(() => [] as Log[])),
    );
    for (const r of res) out.push(...r);
  }
  return out.sort((a, b) => Number(a.blockNumber! - b.blockNumber!) || (a.logIndex! - b.logIndex!));
}

function emptyState(errors: string[] = []): DashState {
  return {
    deployed: false,
    fetchedAt: Date.now(),
    addresses: { beacons: {}, tokens: {} },
    lasnaBlock: 0,
    autopilot: {
      paused: false, reactCount: 0, lastReactAt: 0, pendingNonce: 0, nonce: 0, lastRebalanceAt: 0,
      snapshotCount: 0, lastSnapshotAt: 0, rangeState: 0, lpPrice: 0, rangeLower: 0, rangeUpper: 0,
      targetShare: 0.6, band: 0.05, slippage: 0.02, cooldown: 120, snapshotInterval: 14400,
    },
    portfolio: { ethUnits: 0, usdUnits: 0, price: 0, totalUsd: 0, ethShare: 0, chains: ORIGIN_ORDER.map((id) => ({ chainId: id, eth: 0, usd: 0, valueUsd: 0 })) },
    vault: { eth: 0, usd: 0, rebalanceCount: 0, lastRebalanceAt: 0 },
    snapshots: [],
    alerts: [],
    loops: [],
    feed: [],
    errors,
  };
}

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const fmtUsd = (v: number) => `$${v.toLocaleString("en-US", { maximumFractionDigits: v < 100 ? 2 : 0 })}`;
const hexTx = (v: bigint) => toHex(v, { size: 32 }) as Hex;
const KIND_TEXT: Record<number, string> = { 1: "back inside your range", 2: "fell below your range", 3: "rose above your range" };

export async function getDashState(): Promise<DashState> {
  const autopilot = at(lasna.id, "autopilot");
  const base = 84532;
  const state = emptyState();
  state.addresses = {
    autopilot,
    wallet: at(lasna.id, "wallet"),
    vault: at(base, "vault"),
    journal: at(base, "journal"),
    beacons: Object.fromEntries(ORIGIN_ORDER.map((id) => [id, at(id, "beacon")])),
    tokens: Object.fromEntries(ORIGIN_ORDER.map((id) => [id, { eth: at(id, "ethToken"), usd: at(id, "usdToken"), pool: at(id, "pool") }])),
  };
  if (!autopilot) return state;
  state.deployed = true;

  const L = client(lasna.id);
  const errors: string[] = [];
  const ap = { address: autopilot, abi: autopilotAbi } as const;

  // ── live state straight from the reactive contract (Omni: no ReactVM, plain eth_call) ──
  const [latest, pf, st, rules, lo, hi, interval, funds, debt] = await Promise.all([
    L.getBlockNumber(),
    L.readContract({ ...ap, functionName: "portfolio" }),
    L.readContract({ ...ap, functionName: "status" }),
    L.readContract({ ...ap, functionName: "rules" }),
    L.readContract({ ...ap, functionName: "lpLowerE18" }),
    L.readContract({ ...ap, functionName: "lpUpperE18" }),
    L.readContract({ ...ap, functionName: "snapshotInterval" }),
    L.getBalance({ address: autopilot }).catch(() => undefined),
    L.readContract({ address: SYSTEM, abi: systemAbi, functionName: "debt", args: [autopilot] }).catch(() => undefined),
  ]);
  state.lasnaBlock = Number(latest);
  state.portfolio = {
    ethUnits: n(pf.ethUnits),
    usdUnits: n(pf.usdUnits),
    price: n(pf.priceE18),
    totalUsd: n(pf.totalUsd),
    ethShare: pf.ethShareBps / 10_000,
    chains: ORIGIN_ORDER.map((id, i) => ({ chainId: id, eth: n(pf.chainEth[i]), usd: n(pf.chainUsd[i]), valueUsd: n(pf.chainValueUsd[i]) })),
  };
  const [paused, reactCount, lastReactAt, pendingNonce, nonce, lastRebalanceAt, snapshotCount, lastSnapshotAt, rangeState, lpPrice] = st;
  const [targetEthBps, bandBps, slippageBps, cooldown] = rules;
  state.autopilot = {
    paused,
    reactCount: Number(reactCount),
    lastReactAt: Number(lastReactAt),
    pendingNonce: Number(pendingNonce),
    nonce: Number(nonce),
    lastRebalanceAt: Number(lastRebalanceAt),
    snapshotCount: Number(snapshotCount),
    lastSnapshotAt: Number(lastSnapshotAt),
    rangeState: Number(rangeState),
    lpPrice: n(lpPrice),
    rangeLower: n(lo),
    rangeUpper: n(hi),
    targetShare: targetEthBps / 10_000,
    band: bandBps / 10_000,
    slippage: slippageBps / 10_000,
    cooldown: Number(cooldown),
    snapshotInterval: Number(interval),
    funds: funds === undefined ? undefined : n(funds),
    debt: debt === undefined ? undefined : n(debt),
  };

  // ── destination-side state on Base Sepolia ──
  const B = client(base);
  const { vault, journal } = state.addresses;
  await Promise.all([
    vault &&
      Promise.all([
        B.readContract({ address: vault, abi: vaultAbi, functionName: "holdings" }),
        B.readContract({ address: vault, abi: vaultAbi, functionName: "rebalanceCount" }),
        B.readContract({ address: vault, abi: vaultAbi, functionName: "lastRebalanceAt" }),
      ])
        .then(([[e, u], c, t]) => (state.vault = { eth: n(e), usd: n(u), rebalanceCount: Number(c), lastRebalanceAt: Number(t) }))
        .catch(() => errors.push("vault read failed")),
    journal &&
      Promise.all([
        B.readContract({ address: journal, abi: journalAbi, functionName: "latestSnapshots", args: [200n] }),
        B.readContract({ address: journal, abi: journalAbi, functionName: "latestAlerts", args: [20n] }),
      ])
        .then(([snaps, alerts]) => {
          state.snapshots = snaps.map((s) => ({
            timestamp: Number(s.timestamp),
            totalUsd: n(s.totalUsd),
            ethShare: s.ethShareBps / 10_000,
            target: s.targetBps / 10_000,
            price: n(s.priceE18),
            chainValueUsd: s.chainValueUsd.map((v) => n(v)),
          }));
          state.alerts = alerts.map((a) => ({ timestamp: Number(a.timestamp), kind: a.kind, price: n(a.priceE18), lower: n(a.lowerE18), upper: n(a.upperE18) }));
        })
        .catch(() => errors.push("journal read failed")),
  ]);

  // ── the reactive contract's own event log on Lasna → activity feed + full loops ──
  try {
    const raw = await lasnaLogs(autopilot, latest);
    const { decodeEventLog } = await import("viem");
    type Dec = { name: string; args: Record<string, unknown>; log: Log };
    const decoded: Dec[] = [];
    for (const log of raw) {
      try {
        const d = decodeEventLog({ abi: autopilotAbi, data: log.data, topics: log.topics });
        decoded.push({ name: d.eventName, args: d.args as Record<string, unknown>, log });
      } catch {
        /* not ours */
      }
    }
    const tokenName = (chainId: number, token: string) => {
      const t = state.addresses.tokens[chainId];
      if (t?.eth?.toLowerCase() === token.toLowerCase()) return "tETH";
      if (t?.usd?.toLowerCase() === token.toLowerCase()) return "tUSD";
      return short(token);
    };
    const holderName = (h: string) =>
      h.toLowerCase() === state.addresses.wallet?.toLowerCase() ? "wallet" : h.toLowerCase() === vault?.toLowerCase() ? "vault" : short(h);

    // feed (newest first, capped)
    const recent = decoded.slice(-60).reverse();
    const feed: FeedItem[] = recent.map(({ name, args: a, log }) => {
      const key = `${log.transactionHash}-${log.logIndex}`;
      const lasnaTx = log.transactionHash as Hex;
      const lasnaBlock = Number(log.blockNumber);
      switch (name) {
        case "HoldingChanged": {
          const c = Number(a.chainId);
          return { key, kind: "holding", chainId: c, lasnaTx, lasnaBlock, text: `${CHAINS[c]?.short}: ${holderName(String(a.holder))} now holds ${n(a.balance as bigint).toLocaleString("en-US", { maximumFractionDigits: 4 })} ${tokenName(c, String(a.token))}` };
        }
        case "PriceUpdated": {
          const c = Number(a.chainId);
          return { key, kind: "price", chainId: c, lasnaTx, lasnaBlock, text: `${CHAINS[c]?.short} pool price is now ${fmtUsd(n(a.priceE18 as bigint))} per tETH` };
        }
        case "RebalanceRequested":
          return { key, kind: "rebalance", chainId: base, lasnaTx, lasnaBlock, text: `Mix reached ${(Number(a.ethShareBps) / 100).toFixed(1)}% ETH, so it asked the Base vault to ${a.sellEth ? "sell" : "buy"} ${a.sellEth ? n(a.amountIn as bigint).toFixed(4) + " tETH" : fmtUsd(n(a.amountIn as bigint)) + " of tETH"}` };
        case "RebalanceSettled":
          return { key, kind: "settled", chainId: base, lasnaTx, lasnaBlock, text: a.executed ? `Vault confirmed trade #${a.nonce}` : `Vault skipped request #${a.nonce} (a safety rail held it back)` };
        case "RangeAlertRequested":
          return { key, kind: "alert", chainId: Number(a.originChainId), lasnaTx, lasnaBlock, text: `Price ${fmtUsd(n(a.priceE18 as bigint))} ${KIND_TEXT[Number(a.kind)] ?? "changed range"} (${fmtUsd(n(a.lowerE18 as bigint))}–${fmtUsd(n(a.upperE18 as bigint))})` };
        case "SnapshotRequested":
          return { key, kind: "snapshot", lasnaTx, lasnaBlock, text: `Scheduled check-in wrote snapshot #${a.id}: ${fmtUsd(n(a.totalUsd as bigint))} at ${(Number(a.ethShareBps) / 100).toFixed(1)}% ETH` };
        case "ResyncRequested":
          return { key, kind: "resync", chainId: Number(a.chainId), lasnaTx, lasnaBlock, text: `Asked the ${CHAINS[Number(a.chainId)]?.short} beacon to re-publish real balances` };
        default:
          return { key, kind: "landed", chainId: Number(a.chainId), lasnaTx, lasnaBlock, text: `${Number(a.kind) === 1 ? "Snapshot" : "Alert"} #${a.id} landed on ${CHAINS[Number(a.chainId)]?.short}` };
      }
    });

    // loops
    const loops: Loop[] = [];
    const settled = new Map<string, Dec>();
    for (const d of decoded) if (d.name === "RebalanceSettled") settled.set(String(d.args.nonce), d);
    const landed = decoded.filter((d) => d.name === "CallbackLanded");
    const used = new Set<Dec>();
    const nextLanded = (kind: number, after: Log) =>
      landed.find((d) => !used.has(d) && Number(d.args.kind) === kind && d.log.blockNumber! >= after.blockNumber!);

    for (const d of decoded) {
      const a = d.args;
      const reactive = { chainId: lasna.id, tx: d.log.transactionHash as Hex };
      if (d.name === "RebalanceRequested") {
        const s = settled.get(String(a.nonce));
        const oc = Number(a.originChainId);
        loops.push({
          kind: "rebalance",
          key: `r${a.nonce}`,
          title: `Rebalance #${a.nonce}`,
          detail: `At ${(Number(a.ethShareBps) / 100).toFixed(1)}% ETH, ${a.sellEth ? "sell" : "buy"} tETH on Base`,
          origin: oc && oc !== lasna.id && a.originTx ? { chainId: oc, tx: hexTx(a.originTx as bigint) } : undefined,
          reactive,
          callback: s ? { chainId: base, tx: hexTx(s.args.originTx as bigint), ok: Boolean(s.args.executed) } : undefined,
        });
      } else if (d.name === "RangeAlertRequested") {
        const l = nextLanded(2, d.log);
        if (l) used.add(l);
        const oc = Number(a.originChainId);
        loops.push({
          kind: "alert",
          key: `a${d.log.transactionHash}`,
          title: "Range alert",
          detail: `Price ${fmtUsd(n(a.priceE18 as bigint))} ${KIND_TEXT[Number(a.kind)] ?? ""}`,
          origin: oc && oc !== lasna.id ? { chainId: oc, tx: hexTx(a.originTx as bigint) } : undefined,
          reactive,
          callback: l ? { chainId: Number(l.args.chainId), tx: hexTx(l.args.destTx as bigint), ok: true } : undefined,
        });
      } else if (d.name === "SnapshotRequested") {
        const l = nextLanded(1, d.log);
        if (l) used.add(l);
        loops.push({
          kind: "snapshot",
          key: `s${a.id}-${d.log.transactionHash}`,
          title: `Snapshot #${a.id}`,
          detail: `${fmtUsd(n(a.totalUsd as bigint))} at ${(Number(a.ethShareBps) / 100).toFixed(1)}% ETH`,
          reactive,
          callback: l ? { chainId: Number(l.args.chainId), tx: hexTx(l.args.destTx as bigint), ok: true } : undefined,
        });
      }
    }
    // Live scan covers ~17 h; older loops come from history.json (written by scripts/evidence.mjs --json).
    const lastLoops = loops.slice(-12).reverse();
    const liveKeys = new Set(loops.map((l) => l.key));
    const recorded =
      (history as { autopilot?: string; loops?: Loop[] }).autopilot?.toLowerCase() === autopilot.toLowerCase()
        ? ((history as { loops: Loop[] }).loops ?? []).filter((l) => !liveKeys.has(l.key))
        : [];

    // timestamps + latency for the loops shown, and for feed items
    await Promise.all([
      ...lastLoops.map(async (lp) => {
        const lb = decoded.find((d) => d.log.transactionHash === lp.reactive.tx)?.log.blockNumber;
        const [ot, rt, ct] = await Promise.all([
          lp.origin ? timeOfTx(lp.origin.chainId, lp.origin.tx) : undefined,
          lb !== undefined && lb !== null ? timeOfBlock(lasna.id, lb) : undefined,
          lp.callback ? timeOfTx(lp.callback.chainId, lp.callback.tx) : undefined,
        ]);
        if (lp.origin) lp.origin.time = ot;
        lp.reactive.time = rt;
        if (lp.callback) lp.callback.time = ct;
        if (ot !== undefined && rt !== undefined) lp.reactSecs = Math.max(0, rt - ot);
        if (rt !== undefined && ct !== undefined) lp.callbackSecs = Math.max(0, ct - rt);
      }),
      ...feed.slice(0, 25).map(async (f) => (f.time = await timeOfBlock(lasna.id, BigInt(f.lasnaBlock)))),
    ]);
    state.loops = [...lastLoops, ...recorded]
      .sort((a, b) => (b.reactive.time ?? 0) - (a.reactive.time ?? 0))
      .slice(0, 40);
    state.feed = feed;
  } catch (e) {
    errors.push(`Lasna log scan failed: ${(e as Error).message.slice(0, 120)}`);
  }

  state.errors = errors;
  state.fetchedAt = Date.now();
  return state;
}
