# Omni Portfolio Autopilot — build plan (draft for approval)

Track: **Set It and Forget It** (Reactive Omni Buildathon, deadline 5 Dec 2026 20:00 UTC).

## What the event checked out as (re-read 17 Nov 2026)
- Judging: Execution, Integration, Usefulness, Craft (1–5 each). Entries with no on-chain reactive txs + callbacks are not scored.
- Submit: public repo, deployed addresses, tx hashes for the full loop (origin event → reactive tx → callback), demo video < 3 min.
- Rules: built during the event; on Base Sepolia use timestamps, not block counts, for timers.
- Of the 43 builds so far, none is a portfolio tracker, LP price alert or rebalancing-rules tool (they're mostly stop-loss, vault guards, payday/autopay, dead-man switches, AI circuit breakers).

## Docs facts that shape the design
- Omni has **no separate ReactVM**: the reactive contract's state lives on Lasna like a normal contract, so the dashboard can read live holdings with a plain `eth_call`.
- System contract `0x8888…8888`; callbacks via `SYSTEM.requestCallbackV_1_0({chainId, recipient, gasLimit, payload})`; first payload arg is a reserved `address` the network fills with the reactive contract.
- Callback proxies: Base Sepolia `0x476F…3585`, Unichain Sepolia `0x775c…66C1`, Eth Sepolia `0xAa14…23b4`.
- Cron: legacy system contract `0x…fffFfF` emits Cron1/10/100/1000/10000 (~1 s … ~3 h). Callback gas ≥ 100k. react() must never revert (still billed).

## Contracts
| Contract | Chain | Job |
|---|---|---|
| `PortfolioAutopilot` (reactive) | Lasna | Subscribes to ERC-20 `Transfer`s in/out of the watched wallet + vault on Eth Sepolia, Base Sepolia, Unichain Sepolia; pool `Sync` prices; `Checkpoint` events; Cron1000. Keeps per-chain balances and USD value on-chain. Fires: rebalance callback when allocation leaves its band, LP range alert when price exits/re-enters the range, daily snapshot + self-healing re-sync on cron. |
| `BalanceBeacon` | each of the 3 chains | Reads real `balanceOf` and emits `Checkpoint` — used at setup and by the cron re-sync callback, so tracked balances can't drift from reality. |
| `RebalancerVault` | Base Sepolia | Holds the managed part of the portfolio; on callback swaps through the pool back toward the target mix (e.g. 60% ETH / 40% USD across **all** chains). Timestamp cooldown + max-trade cap. Its own swap Transfers flow back to the reactive contract, closing the loop. |
| `Journal` | Base Sepolia | Receives daily snapshots and alerts as events; dashboard history comes from here. |
| `DemoPool` + test tokens (`tETH`, `tUSD`) | Base + Unichain Sepolia (tokens on all 3) | Minimal x·y=k pool emitting Uniswap-V2-style `Sync`, so prices are real on-chain events we can move for the demo. Clearly labelled test assets. |

## Dashboard (Next.js + viem + Tailwind + Framer Motion, read-only, Vercel)
Glass cards, animated live counters for total value and allocation donut, per-chain holdings, band gauge, LP range bar with live price, "loop timeline" showing each origin event → reactive tx → callback with explorer links and measured latency, snapshot history chart. Plain-English "what just happened" captions.

## Tests
Foundry: unit tests for accounting, band/cooldown logic, alert edge-crossing, cron gating, callback auth (`onlyServiceProvider` + `onlyCallbackSender`), plus an end-to-end test that mocks the system contract and proxy.

## Wallet & funding (you do the funding)
A script creates one deploy/demo wallet, writes the key only to a git-ignored `.env`, prints the address. You'd send roughly: 0.3 Sepolia ETH (0.2 of it to the Lasna faucet → ~20 lREACT), 0.1 Base Sepolia ETH, 0.05 Unichain Sepolia ETH. The watched wallet is this demo wallet — described honestly as test activity.

## Milestones
1. Contracts + tests (by ~21 Nov)
2. Deploy on Lasna + 3 testnets, live loop with tx hashes (by ~24 Nov)
3. Dashboard + hosting guidance (by ~29 Nov)
4. README with diagrams, demo-video script, DoraHacks text (by ~2 Dec), buffer to 5 Dec.
