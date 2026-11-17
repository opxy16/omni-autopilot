# Demo video script — under 3 minutes

**Setup before recording**
- Dashboard open full-screen (hosted URL), scrolled to the top.
- A terminal in the repo, font large, with these ready to paste: `bash scripts/demo.sh gift-eth 3`, `bash scripts/demo.sh price-drop`, `bash scripts/demo.sh price-recover`.
- Explorer tabs ready: the autopilot on lasna.reactscan.net and the vault on sepolia.basescan.org.
- Check `bash scripts/demo.sh status` shows the mix inside the 55–65% zone. If not, wait for the next check-in or run the opposite gift so you start "Balanced".
- The cron should be at 1000 (`bash scripts/demo.sh cron 1000`) while recording; switch to 10000 afterwards to save lREACT.
- Record at 1080p. Say the lines in your own words; times are a guide.

---

### 0:00 – 0:15 · Hook (dashboard hero on screen)
> "This is Omni Autopilot. It watches my wallet on three chains — Ethereum, Base and Unichain — keeps my 60/40 mix, warns me when my LP range breaks, and keeps a diary. There's no bot and no server. It's one reactive contract on Reactive Omni."

### 0:15 – 0:35 · The rules (point at the gauge and the Rules card)
> "I set my rules once: 60% ETH with a 5% comfort zone, a price range for my liquidity position, and a snapshot every few hours. Right now I'm at [X]% ETH — inside the zone, so it does nothing."

### 0:35 – 1:20 · Live: a transfer on Sepolia causes a trade on Base
Run `bash scripts/demo.sh gift-eth 3` in the terminal, then switch to the dashboard.
> "Now 3 tETH lands in my wallet on Ethereum Sepolia. Watch the activity feed: Reactive picked up the transfer, the books updated, and the mix jumped above 65%."

Point at the new row in **What the autopilot did**.
> "So the autopilot called the vault on Base Sepolia, and the vault traded back toward 60%. Here's the full loop: the origin transaction on Sepolia, the reactive transaction on Lasna, the callback on Base — about [N] seconds end to end. The gauge is back in the green."

Optional: click the Base callback link and show the swap on Basescan for 2 seconds.

### 1:20 – 1:50 · Live: LP range alert on Unichain
Run `bash scripts/demo.sh price-drop`.
> "Different problem: my liquidity on Unichain is set for $1,800 to $2,200. Someone dumps tETH into the pool, and the price falls out of my range. The autopilot sees the pool's Sync event and writes an alert to my journal on Base. That's my cue to move liquidity, and I didn't have to watch the chart."

(Optionally run `price-recover` and show the "back in range" alert.)

### 1:50 – 2:25 · How it works (scroll to "How the autopilot works")
> "Under the hood: one reactive contract on Lasna subscribes to transfers in and out of my wallet on all three chains, plus pool prices. It keeps the ledger on-chain. On Omni there's no separate ReactVM, so this dashboard reads it with a plain eth_call. Reactive's cron wakes it up to write snapshots, and then it asks a beacon on each chain to re-publish the real balances, so the books heal themselves if an event is ever missed."

> "The vault has its own safety rails on Base: only my reactive contract can call it, plus a timestamp cooldown, a trade cap and a minimum-output check."

### 2:25 – 2:50 · Proof and close (show docs/EVIDENCE.md on GitHub, then the history chart)
> "Everything is on-chain and in the repo: every full loop with explorer links, 30 Foundry tests including a fuzz test on the books, and a harness that simulates Reactive's subscriptions and callbacks. It's a tool I'd actually keep running. Set it, and forget it."

End on the dashboard hero.

---

**Things to keep honest in the voice-over:** these are test tokens on testnets; the wallet is a demo wallet; the price move comes from a separate demo "market" wallet.
