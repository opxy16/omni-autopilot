"use client";

import { motion } from "framer-motion";
import type { DashState } from "@/lib/types";
import { AnimatedNumber, Card, Label, Pill } from "./primitives";
import { pct, usd, ago, num } from "@/lib/format";
import { CHAINS } from "@/lib/chains";

export function statusSentence(s: DashState): { text: string; tone: "good" | "warn" | "info" | "neutral" } {
  const { ethShare, totalUsd } = s.portfolio;
  const { targetShare, band, pendingNonce, paused } = s.autopilot;
  const lo = targetShare - band;
  const hi = targetShare + band;
  if (!totalUsd) return { text: "Waiting for the first balances to arrive from the beacons.", tone: "neutral" };
  if (paused) return { text: "Autopilot is paused — it keeps tracking, but won't trade or alert.", tone: "warn" };
  if (pendingNonce) return { text: `Your mix drifted, so the autopilot asked the Base vault to trade (request #${pendingNonce}). Waiting for it to confirm…`, tone: "info" };
  if (ethShare > hi) return { text: `Your mix is ${pct(ethShare)} ETH — above your ${pct(lo, 0)}–${pct(hi, 0)} comfort zone. A rebalance is queued for when the cooldown ends.`, tone: "warn" };
  if (ethShare < lo) return { text: `Your mix is ${pct(ethShare)} ETH — below your ${pct(lo, 0)}–${pct(hi, 0)} comfort zone. A rebalance is queued for when the cooldown ends.`, tone: "warn" };
  return { text: `Your mix is ${pct(ethShare)} ETH — inside your ${pct(lo, 0)}–${pct(hi, 0)} comfort zone. Nothing to do.`, tone: "good" };
}

function Donut({ s }: { s: DashState }) {
  const r = 70;
  const c = 2 * Math.PI * r;
  const share = Math.min(1, Math.max(0, s.portfolio.ethShare));
  const { targetShare, band } = s.autopilot;
  const cb = 2 * Math.PI * (r + 13);
  const arc = (from: number, to: number) => ({ strokeDasharray: `${(to - from) * cb} ${cb}`, strokeDashoffset: -from * cb });
  return (
    <svg viewBox="0 0 180 180" className="h-44 w-44 -rotate-90 sm:h-52 sm:w-52" role="img" aria-label={`ETH share ${pct(share)}`}>
      <defs>
        <linearGradient id="ethGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#7c5cff" />
          <stop offset="100%" stopColor="#2de2a6" />
        </linearGradient>
      </defs>
      <circle cx="90" cy="90" r={r} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="16" />
      {/* comfort band */}
      <circle cx="90" cy="90" r={r + 13} fill="none" stroke="rgba(45,226,166,0.35)" strokeWidth="3" strokeLinecap="round" {...arc(targetShare - band, targetShare + band)} />
      <motion.circle
        cx="90"
        cy="90"
        r={r}
        fill="none"
        stroke="url(#ethGrad)"
        strokeWidth="16"
        strokeLinecap="round"
        initial={false}
        animate={{ strokeDasharray: `${share * c} ${c}` }}
        transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
      />
      {/* target tick */}
      <line
        x1={90 + (r - 12) * Math.cos(2 * Math.PI * targetShare)}
        y1={90 + (r - 12) * Math.sin(2 * Math.PI * targetShare)}
        x2={90 + (r + 16) * Math.cos(2 * Math.PI * targetShare)}
        y2={90 + (r + 16) * Math.sin(2 * Math.PI * targetShare)}
        stroke="white"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function BandGauge({ s }: { s: DashState }) {
  const { targetShare, band } = s.autopilot;
  const share = s.portfolio.ethShare;
  const inBand = share >= targetShare - band && share <= targetShare + band;
  return (
    <div>
      <div className="relative h-3 w-full overflow-hidden rounded-full bg-white/[0.06]">
        <div
          className="absolute inset-y-0 rounded-full bg-react/25 ring-1 ring-react/50"
          style={{ left: `${(targetShare - band) * 100}%`, width: `${band * 200}%` }}
        />
        <div className="absolute inset-y-0 w-px bg-white/70" style={{ left: `${targetShare * 100}%` }} />
        <motion.div
          className={`absolute top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white ${inBand ? "bg-react" : "bg-amber-400"}`}
          style={{ boxShadow: inBand ? "0 0 18px rgba(45,226,166,0.9)" : "0 0 18px rgba(251,191,36,0.9)" }}
          initial={false}
          animate={{ left: `${Math.min(100, Math.max(0, share * 100))}%` }}
          transition={{ type: "spring", stiffness: 80, damping: 16 }}
        />
      </div>
      <div className="mt-2 flex justify-between text-[11px] text-white/40 tabular">
        <span>0% ETH</span>
        <span>
          comfort zone {pct(targetShare - band, 0)}–{pct(targetShare + band, 0)}
        </span>
        <span>100%</span>
      </div>
    </div>
  );
}

export function Hero({ s, now }: { s: DashState; now: number }) {
  const status = statusSentence(s);
  const p = s.portfolio;
  return (
    <Card className="overflow-hidden" delay={0.05}>
      <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-violet/30 blur-3xl" />
      <div className="grid items-center gap-8 md:grid-cols-[1fr_auto]">
        <div className="min-w-0">
          <Label>Total portfolio · 3 chains</Label>
          <div className="mt-2 text-5xl font-semibold tracking-tight sm:text-6xl">
            <AnimatedNumber value={p.totalUsd} format={(v) => usd(v, 0)} />
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-white/55">
            <span className="tabular">
              {num(p.ethUnits, 3)} tETH + {usd(p.usdUnits, 0)} tUSD
            </span>
            <span className="tabular">1 tETH = {usd(p.price, 2)}</span>
          </div>
          <motion.p
            key={status.text}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-5 max-w-xl text-lg leading-relaxed text-white/85"
          >
            {status.text}
          </motion.p>
          <div className="mt-6 max-w-xl">
            <BandGauge s={s} />
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            <Pill tone={status.tone}>{status.tone === "good" ? "Balanced" : status.tone === "info" ? "Rebalancing" : status.tone === "warn" ? "Drifted" : "Starting up"}</Pill>
            <Pill tone="neutral">Last reaction {ago(s.autopilot.lastReactAt, now)}</Pill>
            <Pill tone="neutral">{s.vault.rebalanceCount} rebalances so far</Pill>
          </div>
        </div>
        <div className="relative mx-auto grid place-items-center">
          <Donut s={s} />
          <div className="absolute text-center">
            <div className="text-3xl font-semibold tabular">
              <AnimatedNumber value={p.ethShare * 100} format={(v) => `${v.toFixed(1)}%`} />
            </div>
            <div className="text-xs text-white/50">ETH · target {pct(s.autopilot.targetShare, 0)}</div>
          </div>
          <div className="mt-3 flex gap-3 text-[11px] text-white/45">
            {p.chains.map((c) => (
              <span key={c.chainId} className="flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: CHAINS[c.chainId].color }} />
                {CHAINS[c.chainId].short} {p.totalUsd ? pct(c.valueUsd / p.totalUsd, 0) : "—"}
              </span>
            ))}
          </div>
        </div>
      </div>
    </Card>
  );
}
