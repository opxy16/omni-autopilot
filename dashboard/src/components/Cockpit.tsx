"use client";

import { motion, useReducedMotion } from "framer-motion";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { DashState, Loop } from "@/lib/types";
import { duration, num, pct, usd } from "@/lib/format";
import { AnimatedNumber, chainVar } from "./primitives";

/* ───────────────────────── status in plain English ───────────────────────── */

type Tone = "ok" | "caution" | "command" | "idle";

export function statusLine(s: DashState): { text: string; tone: Tone } {
  const { ethShare, totalUsd } = s.portfolio;
  const { targetShare, band, pendingNonce, paused } = s.autopilot;
  const lo = targetShare - band;
  const hi = targetShare + band;
  if (!totalUsd) return { text: "Waiting for the first balances from the chains.", tone: "idle" };
  if (paused) return { text: "The autopilot is paused. It keeps tracking your wallet but won't trade or alert.", tone: "caution" };
  if (pendingNonce)
    return { text: `Your mix drifted, so the autopilot asked the vault on Base to trade (request #${pendingNonce}). Waiting for it to confirm.`, tone: "command" };
  if (ethShare > hi || ethShare < lo)
    return {
      text: `Your mix is ${pct(ethShare)} ETH, outside your ${pct(lo, 0)}–${pct(hi, 0)} zone. The autopilot trades back on its next check-in, after a short cooldown.`,
      tone: "caution",
    };
  return { text: `Your mix is ${pct(ethShare)} ETH, inside your ${pct(lo, 0)}–${pct(hi, 0)} zone. Nothing to do.`, tone: "ok" };
}

const toneColor: Record<Tone, string> = { ok: "var(--green)", caution: "var(--amber)", command: "var(--magenta)", idle: "var(--muted)" };

/* ───────────────────────── mode annunciators ───────────────────────── */

function Annunciator({ text, color, title }: { text: string; color: string; title: string }) {
  const [flash, setFlash] = useState(false);
  const prev = useRef(text);
  useEffect(() => {
    if (prev.current !== text) {
      prev.current = text;
      setFlash(true);
      const t = setTimeout(() => setFlash(false), 1900);
      return () => clearTimeout(t);
    }
  }, [text]);
  return (
    <li className={`fma ${flash ? "fma-changed" : ""}`} style={{ color }} title={title}>
      {text}
    </li>
  );
}

export function ModeStrip({ s }: { s: DashState }) {
  const a = s.autopilot;
  const st = statusLine(s);
  const alloc =
    a.pendingNonce > 0
      ? { text: `REBAL #${a.pendingNonce}`, color: "var(--magenta)", title: "A rebalance request is on its way to the vault" }
      : st.tone === "caution" && !a.paused
        ? { text: "ALLOC DRIFT", color: "var(--amber)", title: "Mix is outside the comfort zone" }
        : { text: `ALLOC HOLD ${pct(a.targetShare, 0)}`, color: "var(--green)", title: "Holding your target mix" };
  const range = [
    { text: "RANGE ---", color: "var(--muted)", title: "No price reading yet" },
    { text: "RANGE IN", color: "var(--green)", title: "Pool price is inside your LP range" },
    { text: "RANGE LOW", color: "var(--amber)", title: "Pool price is below your LP range" },
    { text: "RANGE HIGH", color: "var(--amber)", title: "Pool price is above your LP range" },
  ][a.rangeState] ?? { text: "RANGE ---", color: "var(--muted)", title: "" };
  return (
    <ul className="flex flex-wrap gap-2" aria-label="Autopilot modes">
      <Annunciator
        text={a.paused ? "AP PAUSED" : "AP ENGAGED"}
        color={a.paused ? "var(--amber)" : "var(--green)"}
        title={a.paused ? "Tracking only" : "Tracking, trading and alerting"}
      />
      <Annunciator {...alloc} />
      <Annunciator {...range} />
      <Annunciator text={`SNAP ${duration(a.snapshotInterval).toUpperCase()}`} color="var(--cyan)" title="How often a snapshot is written to the journal" />
    </ul>
  );
}

/* ───────────────────────── route display (the hero) ───────────────────────── */

type DestKey = "vault" | "journal";
type Pt = { x: number; y: number };
type Geo = {
  W: number;
  H: number;
  origins: { id: number; x: number; y: number }[];
  fmc: Pt;
  dests: Record<DestKey, Pt>;
  inLeg: (o: Pt) => string;
  outLeg: (d: Pt) => string;
  vertical: boolean;
};

const ORIGIN_NAME: Record<number, string> = { 11155111: "Ethereum", 84532: "Base", 1301: "Unichain" };
const DEST_LABEL: Record<DestKey, string> = { vault: "Rebalancer vault", journal: "Journal" };

// Wide screens: left to right. Phones: top to bottom, so labels stay readable.
const WIDE: Geo = (() => {
  const fmc = { x: 380, y: 190 };
  const OX = 112;
  const DX = 588;
  return {
    W: 760,
    H: 380,
    vertical: false,
    origins: [
      { id: 11155111, x: OX, y: 78 },
      { id: 84532, x: OX, y: 190 },
      { id: 1301, x: OX, y: 302 },
    ],
    fmc,
    dests: { vault: { x: DX, y: 122 }, journal: { x: DX, y: 258 } },
    inLeg: (o) => `M${o.x + 14} ${o.y} C ${o.x + 150} ${o.y}, ${fmc.x - 160} ${fmc.y}, ${fmc.x - 48} ${fmc.y}`,
    outLeg: (d) => `M${fmc.x + 48} ${fmc.y} C ${fmc.x + 150} ${fmc.y}, ${d.x - 150} ${d.y}, ${d.x - 16} ${d.y}`,
  };
})();

const TALL: Geo = (() => {
  const fmc = { x: 180, y: 262 };
  return {
    W: 360,
    H: 500,
    vertical: true,
    origins: [
      { id: 11155111, x: 60, y: 74 },
      { id: 84532, x: 180, y: 74 },
      { id: 1301, x: 300, y: 74 },
    ],
    fmc,
    dests: { vault: { x: 96, y: 430 }, journal: { x: 264, y: 430 } },
    inLeg: (o) => `M${o.x} ${o.y + 14} C ${o.x} ${o.y + 100}, ${fmc.x} ${fmc.y - 120}, ${fmc.x} ${fmc.y - 48}`,
    outLeg: (d) => `M${fmc.x} ${fmc.y + 48} C ${fmc.x} ${fmc.y + 110}, ${d.x} ${d.y - 100}, ${d.x} ${d.y - 16}`,
  };
})();

type Pulse = { id: string; from?: number; to?: DestKey };

/** Animates a dot along an SVG path once, then removes itself. */
function Traveller({ path, color, delay, dur, onDone }: { path: string; color: string; delay: number; dur: number; onDone?: () => void }) {
  const [on, setOn] = useState(false);
  const [gone, setGone] = useState(false);
  const ref = useRef<SVGAnimateMotionElement>(null);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  useEffect(() => {
    const t = setTimeout(() => setOn(true), delay * 1000);
    const end = setTimeout(() => {
      setGone(true);
      doneRef.current?.();
    }, (delay + dur) * 1000 + 60);
    return () => {
      clearTimeout(t);
      clearTimeout(end);
    };
  }, [delay, dur]);
  // Start the motion before the browser paints, so the dot never shows at the SVG origin.
  useLayoutEffect(() => {
    if (on) ref.current?.beginElement();
  }, [on]);
  if (!on || gone) return null;
  return (
    <g>
      <circle r="11" fill={color} opacity="0.25" />
      <circle r="5.5" fill={color} />
      <animateMotion ref={ref} path={path} dur={`${dur}s`} begin="indefinite" fill="freeze" calcMode="spline" keyTimes="0;1" keySplines="0.4 0 0.2 1" />
    </g>
  );
}

function destFor(l: Loop): DestKey {
  return l.kind === "rebalance" ? "vault" : "journal";
}

function RouteSvg({ g, s, pulses, onPulseDone, reduce, className }: { g: Geo; s: DashState; pulses: Pulse[]; onPulseDone: (id: string) => void; reduce: boolean; className: string }) {
  const latest = s.loops[0];
  const keys = Object.keys(g.dests) as DestKey[];
  const latestOrigin = latest?.origin ? g.origins.find((o) => o.id === latest.origin!.chainId) : undefined;
  return (
    <svg
      viewBox={`0 0 ${g.W} ${g.H}`}
      className={className}
      role="img"
      aria-label="Events from Ethereum Sepolia, Base Sepolia and Unichain Sepolia flow into the autopilot on Reactive Lasna, which sends trades to the vault and notes to the journal on Base Sepolia."
    >
      {[70, 120, 170].map((r) => (
        <circle key={r} cx={g.fmc.x} cy={g.fmc.y} r={r} fill="none" stroke="currentColor" strokeOpacity="0.08" strokeDasharray="2 6" />
      ))}

      {g.origins.map((o) => (
        <g key={o.id}>
          <path d={g.inLeg(o)} fill="none" stroke={chainVar(o.id)} strokeOpacity="0.3" strokeWidth="2" />
          <path d={g.inLeg(o)} fill="none" stroke={chainVar(o.id)} strokeWidth="2" className={reduce ? "" : "route-dash"} />
        </g>
      ))}
      {keys.map((k) => (
        <g key={k}>
          <path d={g.outLeg(g.dests[k])} fill="none" stroke="var(--magenta)" strokeOpacity="0.3" strokeWidth="2" />
          <path d={g.outLeg(g.dests[k])} fill="none" stroke="var(--magenta)" strokeWidth="2" className={reduce ? "" : "route-dash"} />
        </g>
      ))}

      {g.origins.map((o) => (
        <g key={o.id} transform={`translate(${o.x} ${o.y})`}>
          <path d="M0 -13 L4 -4 L13 0 L4 4 L0 13 L-4 4 L-13 0 L-4 -4 Z" fill={chainVar(o.id)} />
          {g.vertical ? (
            <>
              <text y={-38} textAnchor="middle" className="display" fontSize="16" fontWeight="700" fill="currentColor">
                {ORIGIN_NAME[o.id]}
              </text>
              <text y={-21} textAnchor="middle" fontSize="12.5" fill="currentColor" fillOpacity="0.7">
                Sepolia
              </text>
            </>
          ) : (
            <>
              <text x={-22} y={-2} textAnchor="end" className="display" fontSize="15" fontWeight="700" fill="currentColor">
                {ORIGIN_NAME[o.id]}
              </text>
              <text x={-22} y={15} textAnchor="end" fontSize="11.5" fill="currentColor" fillOpacity="0.7">
                Sepolia
              </text>
            </>
          )}
        </g>
      ))}

      <g transform={`translate(${g.fmc.x} ${g.fmc.y})`}>
        <circle r="48" fill="var(--tape-bg)" stroke="var(--magenta)" strokeWidth="2.5" />
        <circle r="40" fill="none" stroke="var(--magenta)" strokeOpacity="0.35" />
        <text y="-6" textAnchor="middle" className="display" fontSize="15" fontWeight="700" fill="currentColor">
          Lasna
        </text>
        <text y="12" textAnchor="middle" fontSize="11.5" fill="currentColor" fillOpacity="0.75">
          autopilot
        </text>
        <text x={g.vertical ? 62 : 0} y={g.vertical ? 4 : 74} textAnchor={g.vertical ? "start" : "middle"} className="display tnum" fontSize="12.5" fill="var(--magenta)">
          {s.autopilot.reactCount.toLocaleString()} reactions
        </text>
      </g>

      {keys.map((k) => (
        <g key={k} transform={`translate(${g.dests[k].x} ${g.dests[k].y})`}>
          <rect x="-12" y="-12" width="24" height="24" rx="3" fill="none" stroke="var(--magenta)" strokeWidth="2.5" />
          <rect x="-6" y="-6" width="12" height="12" fill="var(--magenta)" />
          {g.vertical ? (
            <>
              <text y={34} textAnchor="middle" className="display" fontSize="14.5" fontWeight="700" fill="currentColor">
                {DEST_LABEL[k]}
              </text>
              <text y={51} textAnchor="middle" fontSize="12.5" fill="currentColor" fillOpacity="0.7">
                Base Sepolia
              </text>
            </>
          ) : (
            <>
              <text x="22" y="-2" className="display" fontSize="14" fontWeight="700" fill="currentColor">
                {DEST_LABEL[k]}
              </text>
              <text x="22" y="14" fontSize="11.5" fill="currentColor" fillOpacity="0.7">
                Base Sepolia
              </text>
            </>
          )}
        </g>
      ))}

      {/* latency of the most recent loop, written beside its legs */}
      {!g.vertical && latest?.reactSecs !== undefined && latestOrigin && (
        <text x={(latestOrigin.x + g.fmc.x) / 2 + 10} y={latestOrigin.y < g.fmc.y ? 126 : latestOrigin.y > g.fmc.y ? 264 : g.fmc.y - 12} textAnchor="middle" className="display tnum" fontSize="12" fill="currentColor" fillOpacity="0.85">
          {latest.reactSecs}s to Lasna
        </text>
      )}
      {!g.vertical && latest?.callbackSecs !== undefined && (
        <text x={(g.fmc.x + g.dests.vault.x) / 2 + 30} y={destFor(latest) === "vault" ? 104 : 290} textAnchor="middle" className="display tnum" fontSize="12" fill="var(--magenta)">
          {latest.callbackSecs}s to Base
        </text>
      )}

      {pulses.map((p) => {
        const o = g.origins.find((x) => x.id === p.from);
        const legs: { path: string; color: string }[] = [];
        if (o) legs.push({ path: g.inLeg(o), color: chainVar(o.id) });
        if (p.to) legs.push({ path: g.outLeg(g.dests[p.to]), color: "var(--magenta)" });
        return legs.map((leg, i) => (
          <Traveller
            key={`${p.id}-${i}`}
            path={leg.path}
            color={leg.color}
            delay={(p.id.startsWith("intro") ? 0.9 : 0) + i * 1.1}
            dur={1.1}
            onDone={i === legs.length - 1 ? () => onPulseDone(p.id) : undefined}
          />
        ));
      })}
    </svg>
  );
}

export function RouteDisplay({ s }: { s: DashState }) {
  const reduce = !!useReducedMotion();
  const [pulses, setPulses] = useState<Pulse[]>([]);
  const seen = useRef<Set<string> | null>(null);
  const latest = s.loops[0];

  // Pulses only for real events: new feed items travel origin → Lasna, completed loops travel
  // origin → Lasna → Base. On first load the latest loop is replayed once.
  useEffect(() => {
    if (reduce) return;
    const keys = [...s.loops.map((l) => `loop:${l.key}`), ...s.feed.map((f) => `feed:${f.key}`)];
    if (!seen.current) {
      seen.current = new Set(keys);
      if (latest) setPulses([{ id: `intro-${latest.key}`, from: latest.origin?.chainId, to: destFor(latest) }]);
      return;
    }
    const fresh: Pulse[] = [];
    for (const l of s.loops)
      if (!seen.current.has(`loop:${l.key}`) && l.callback) fresh.push({ id: `l-${l.key}`, from: l.origin?.chainId, to: destFor(l) });
    for (const f of s.feed.slice(0, 6))
      if (!seen.current.has(`feed:${f.key}`) && f.chainId && (f.kind === "holding" || f.kind === "price")) fresh.push({ id: `f-${f.key}`, from: f.chainId });
    keys.forEach((k) => seen.current!.add(k));
    if (fresh.length) setPulses((p) => [...p, ...fresh.slice(0, 4)]);
  }, [s.loops, s.feed, latest, reduce]);

  const done = (id: string) => setPulses((p) => p.filter((x) => x.id !== id));

  return (
    <figure className="bezel relative overflow-hidden p-3 sm:p-4">
      <RouteSvg g={WIDE} s={s} pulses={pulses} onPulseDone={done} reduce={reduce} className="hidden w-full sm:block" />
      <RouteSvg g={TALL} s={s} pulses={pulses} onPulseDone={() => undefined} reduce={reduce} className="block w-full sm:hidden" />
      <figcaption className="mt-2 flex flex-wrap items-center justify-between gap-2 px-1 text-[0.85rem]" style={{ color: "color-mix(in oklab, var(--tape-text) 78%, transparent)" }}>
        <span>Live route: every event on the three chains reaches the autopilot on Lasna, which acts on Base.</span>
        {latest && latest.reactSecs !== undefined && latest.callbackSecs !== undefined && (
          <span className="display tnum" style={{ color: "var(--green)" }}>
            last full loop {latest.reactSecs + latest.callbackSecs}s
          </span>
        )}
      </figcaption>
    </figure>
  );
}

/* ───────────────────────── allocation tape ───────────────────────── */

export function AllocationTape({ s }: { s: DashState }) {
  const { targetShare: t, band } = s.autopilot;
  const share = Math.min(1, Math.max(0, s.portfolio.ethShare));
  const inBand = share >= t - band && share <= t + band;
  const TH = 300;
  const top = 18;
  const y = (v: number) => top + (1 - v) * TH;
  const ticks = useMemo(() => Array.from({ length: 21 }, (_, i) => i * 0.05), []);
  const pointerColor = !s.portfolio.totalUsd ? "var(--muted)" : inBand ? "var(--green)" : "var(--amber)";
  return (
    <div className="bezel flex items-stretch gap-4 p-4">
      <svg viewBox="0 0 120 336" className="h-[336px] w-[120px] shrink-0" role="img" aria-label={`ETH share ${pct(share)}, target ${pct(t, 0)} with a comfort zone of plus or minus ${pct(band, 0)}`}>
        <rect x="34" y={top} width="44" height={TH} rx="3" fill="currentColor" fillOpacity="0.06" />
        {/* comfort zone bracket (your selection → cyan) */}
        <rect x="34" y={y(t + band)} width="44" height={y(t - band) - y(t + band)} fill="var(--cyan)" fillOpacity="0.16" />
        <path d={`M30 ${y(t + band)} h-6 V ${y(t - band)} h6`} fill="none" stroke="var(--cyan)" strokeWidth="2" />
        {ticks.map((v) => {
          const major = Math.round(v * 100) % 20 === 0;
          return (
            <g key={v}>
              <line x1={major ? 62 : 70} x2="78" y1={y(v)} y2={y(v)} stroke="currentColor" strokeOpacity={major ? 0.7 : 0.35} />
              {major && (
                <text x="58" y={y(v) + 4} textAnchor="end" fontSize="11" fill="currentColor" fillOpacity="0.7" className="display tnum">
                  {Math.round(v * 100)}
                </text>
              )}
            </g>
          );
        })}
        {/* target bug (your selection → cyan) */}
        <path d={`M78 ${y(t) - 7} l9 0 l0 14 l-9 0 l5 -7 z`} fill="var(--cyan)" />
        {/* live pointer */}
        <motion.g initial={false} animate={{ y: y(share) }} transition={{ type: "spring", stiffness: 70, damping: 16 }}>
          <path d="M80 0 l10 -9 h28 v18 h-28 z" fill={pointerColor} />
          <text x="104" y="4.5" textAnchor="middle" fontSize="12" fontWeight="700" className="display tnum" fill="var(--tape-bg)">
            {Math.round(share * 100)}
          </text>
        </motion.g>
        <text x="56" y={top + TH + 16} textAnchor="middle" fontSize="11" fill="currentColor" fillOpacity="0.7">
          ETH %
        </text>
      </svg>
      <div className="flex min-w-0 flex-1 flex-col justify-between py-1">
        <div>
          <div className="text-[0.85rem]" style={{ color: "color-mix(in oklab, var(--tape-text) 70%, transparent)" }}>
            Total across three chains
          </div>
          <div className="display mt-1 text-[clamp(2rem,4.2vw,2.9rem)] font-bold leading-none">
            <AnimatedNumber value={s.portfolio.totalUsd} format={(v) => usd(v, 0)} />
          </div>
          <div className="tnum mt-2 text-[0.9rem]" style={{ color: "color-mix(in oklab, var(--tape-text) 75%, transparent)" }}>
            {num(s.portfolio.ethUnits, 3)} tETH and {usd(s.portfolio.usdUnits, 0)} tUSD
          </div>
        </div>
        <dl className="grid gap-3 text-[0.9rem]">
          <div>
            <dt style={{ color: "color-mix(in oklab, var(--tape-text) 70%, transparent)" }}>ETH share now</dt>
            <dd className="display tnum text-2xl font-bold" style={{ color: pointerColor }}>
              <AnimatedNumber value={share * 100} format={(v) => `${v.toFixed(1)}%`} />
            </dd>
          </div>
          <div>
            <dt style={{ color: "color-mix(in oklab, var(--tape-text) 70%, transparent)" }}>Your target</dt>
            <dd className="display tnum text-lg" style={{ color: "var(--cyan)" }}>
              {pct(t, 0)} ± {pct(band, 0)}
            </dd>
          </div>
          <div>
            <dt style={{ color: "color-mix(in oklab, var(--tape-text) 70%, transparent)" }}>tETH price (Base pool)</dt>
            <dd className="display tnum text-lg">
              <AnimatedNumber value={s.portfolio.price} format={(v) => usd(v, 2)} />
            </dd>
          </div>
        </dl>
      </div>
    </div>
  );
}

export { toneColor };
