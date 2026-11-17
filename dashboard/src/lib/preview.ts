import type { DashState, Hex } from "./types";

/**
 * Illustrative data for designing the UI before contracts are live (/?preview=1).
 * The page shows a "PREVIEW — not live data" banner whenever this is used.
 */
export function previewState(): DashState {
  const now = Math.floor(Date.now() / 1000);
  const h = (s: string) => (`0x${s.repeat(64).slice(0, 64)}`) as Hex;
  const snaps = Array.from({ length: 30 }, (_, i) => {
    const t = now - (29 - i) * 4 * 3600;
    const price = 2000 + Math.sin(i / 3) * 140 + i * 4;
    const total = 16000 + Math.sin(i / 4) * 900 + i * 40;
    const share = 0.6 + Math.sin(i / 2.2) * 0.045;
    return { timestamp: t, totalUsd: total, ethShare: share, target: 0.6, price, chainValueUsd: [total * 0.25, total * 0.62, total * 0.13] };
  });
  return {
    deployed: true,
    preview: true,
    fetchedAt: Date.now(),
    addresses: { beacons: {}, tokens: {} },
    lasnaBlock: 4_812_330 + (now % 1000),
    autopilot: {
      paused: false, reactCount: 1287, lastReactAt: now - 3, pendingNonce: 0, nonce: 14, lastRebalanceAt: now - 3600,
      snapshotCount: 30, lastSnapshotAt: now - 1800, rangeState: 1, lpPrice: 2071.4, rangeLower: 1800, rangeUpper: 2200,
      targetShare: 0.6, band: 0.05, slippage: 0.02, cooldown: 120, snapshotInterval: 14400, funds: 18.42, debt: 0,
    },
    portfolio: {
      ethUnits: 5.02, usdUnits: 6180, price: 2071.4, totalUsd: 16578.4, ethShare: 0.627,
      chains: [
        { chainId: 11155111, eth: 2, usd: 0, valueUsd: 4142.8 },
        { chainId: 84532, eth: 3.02, usd: 4180, valueUsd: 10435.6 },
        { chainId: 1301, eth: 0, usd: 2000, valueUsd: 2000 },
      ],
    },
    vault: { eth: 3.02, usd: 4180, rebalanceCount: 14, lastRebalanceAt: now - 3600 },
    snapshots: snaps,
    alerts: [{ timestamp: now - 9000, kind: 2, price: 1774, lower: 1800, upper: 2200 }, { timestamp: now - 7000, kind: 1, price: 1846, lower: 1800, upper: 2200 }],
    loops: [
      { kind: "rebalance", key: "p1", title: "Rebalance #14", detail: "72.7% ETH → sell tETH on Base", origin: { chainId: 11155111, tx: h("a1"), time: now - 3610 }, reactive: { chainId: 5318007, tx: h("b2"), time: now - 3600 }, callback: { chainId: 84532, tx: h("c3"), time: now - 3598, ok: true }, reactSecs: 10, callbackSecs: 2 },
      { kind: "alert", key: "p2", title: "Range alert", detail: "Price $1,846 back inside your range", origin: { chainId: 1301, tx: h("d4"), time: now - 7003 }, reactive: { chainId: 5318007, tx: h("e5"), time: now - 7001 }, callback: { chainId: 84532, tx: h("f6"), time: now - 6999, ok: true }, reactSecs: 2, callbackSecs: 2 },
      { kind: "snapshot", key: "p3", title: "Snapshot #29", detail: "$16,578 · 62.7% ETH", reactive: { chainId: 5318007, tx: h("a7"), time: now - 1800 }, callback: { chainId: 84532, tx: h("b8"), time: now - 1797, ok: true }, callbackSecs: 3 },
    ],
    feed: [
      { key: "f1", kind: "price", chainId: 84532, lasnaTx: h("11"), lasnaBlock: 1, time: now - 3, text: "Base pool price → $2,071 per tETH" },
      { key: "f2", kind: "holding", chainId: 11155111, lasnaTx: h("12"), lasnaBlock: 1, time: now - 40, text: "Sepolia: wallet now holds 2 tETH" },
      { key: "f3", kind: "snapshot", lasnaTx: h("13"), lasnaBlock: 1, time: now - 1800, text: "Cron tick → journal snapshot #29: $16,578, 62.7% ETH" },
      { key: "f4", kind: "settled", chainId: 84532, lasnaTx: h("14"), lasnaBlock: 1, time: now - 3597, text: "Vault confirmed trade #14" },
      { key: "f5", kind: "rebalance", chainId: 84532, lasnaTx: h("15"), lasnaBlock: 1, time: now - 3600, text: "Mix hit 72.7% ETH → asked the Base vault to sell 1.3517 tETH" },
    ],
    errors: [],
  };
}
