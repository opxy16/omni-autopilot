"use client";

import { motion } from "framer-motion";
import type { DashState } from "@/lib/types";
import { CHAINS, addrUrl } from "@/lib/chains";
import { AnimatedNumber, Card, ChainDot, Label } from "./primitives";
import { num, usd, pct } from "@/lib/format";

export function ChainCards({ s }: { s: DashState }) {
  const total = s.portfolio.totalUsd || 1;
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {s.portfolio.chains.map((c, i) => {
        const meta = CHAINS[c.chainId];
        const isBase = c.chainId === 84532;
        return (
          <Card key={c.chainId} delay={0.12 + i * 0.06} className="overflow-hidden">
            <div
              className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full blur-2xl"
              style={{ background: meta.color, opacity: 0.18 }}
            />
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ChainDot chainId={c.chainId} />
                <span className="font-medium">{meta.name}</span>
              </div>
              <span className="text-xs text-white/40 tabular">{pct(c.valueUsd / total, 0)}</span>
            </div>
            <div className="mt-4 text-3xl font-semibold tracking-tight">
              <AnimatedNumber value={c.valueUsd} format={(v) => usd(v, 0)} />
            </div>
            <div className="mt-4 space-y-2 text-sm">
              <Row label="tETH" value={<AnimatedNumber value={c.eth} format={(v) => num(v, 4)} />} />
              <Row label="tUSD" value={<AnimatedNumber value={c.usd} format={(v) => num(v, 2)} />} />
            </div>
            <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
              <motion.div
                className="h-full rounded-full"
                style={{ background: `linear-gradient(90deg, ${meta.color}, #2de2a6)` }}
                initial={{ width: 0 }}
                animate={{ width: `${(c.valueUsd / total) * 100}%` }}
                transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
              />
            </div>
            <div className="mt-3 text-xs text-white/40">
              {isBase ? (
                <>
                  Includes the rebalancer vault
                  {s.addresses.vault && !s.preview && (
                    <>
                      {" · "}
                      <a className="underline decoration-white/20 hover:text-react" href={addrUrl(84532, s.addresses.vault)} target="_blank" rel="noreferrer">
                        vault
                      </a>
                    </>
                  )}
                </>
              ) : (
                "Wallet balances, tracked from Transfer events"
              )}
            </div>
          </Card>
        );
      })}
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-white/50">{label}</span>
      <span className="font-mono">{value}</span>
    </div>
  );
}

export function RangeCard({ s }: { s: DashState }) {
  const { rangeLower: lo, rangeUpper: hi, lpPrice, rangeState } = s.autopilot;
  const span = hi - lo || 1;
  const min = lo - span * 0.6;
  const max = hi + span * 0.6;
  const pos = (v: number) => `${Math.min(100, Math.max(0, ((v - min) / (max - min)) * 100))}%`;
  const label = ["Waiting for a price", "Inside your range", "Below your range", "Above your range"][rangeState] ?? "—";
  const tone = rangeState === 1 ? "text-react" : rangeState === 0 ? "text-white/50" : "text-amber-300";
  return (
    <Card delay={0.3}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <Label>LP range alert · Unichain pool</Label>
          <div className="mt-2 text-3xl font-semibold tracking-tight">
            <AnimatedNumber value={lpPrice} format={(v) => usd(v, 2)} />
          </div>
          <div className={`mt-1 text-sm font-medium ${tone}`}>{label}</div>
        </div>
        <div className="text-right text-xs text-white/45">
          <div>Your range</div>
          <div className="font-mono text-sm text-white/80">
            {hi ? `${usd(lo, 0)} – ${usd(hi, 0)}` : "not set"}
          </div>
        </div>
      </div>
      {hi > 0 && (
        <div className="relative mt-6 h-12">
          <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-white/[0.07]" />
          <div
            className="absolute top-1/2 h-3 -translate-y-1/2 rounded-full bg-gradient-to-r from-violet/60 to-react/60 ring-1 ring-react/40"
            style={{ left: pos(lo), width: `calc(${pos(hi)} - ${pos(lo)})` }}
          />
          <motion.div
            className="absolute top-0 flex -translate-x-1/2 flex-col items-center"
            initial={false}
            animate={{ left: pos(lpPrice) }}
            transition={{ type: "spring", stiffness: 70, damping: 15 }}
          >
            <div className="h-12 w-0.5 rounded bg-white shadow-[0_0_12px_white]" />
          </motion.div>
        </div>
      )}
      <p className="mt-4 text-sm leading-relaxed text-white/55">
        When the pool price leaves your range (or comes back), the autopilot writes an alert to the Journal on Base — your
        cue to move liquidity. {s.alerts.length > 0 && <>{s.alerts.length} alert{s.alerts.length === 1 ? "" : "s"} so far.</>}
      </p>
    </Card>
  );
}
