"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useMemo, useState } from "react";
import type { DashState, FeedItem, Loop } from "@/lib/types";
import { CHAINS, addrUrl } from "@/lib/chains";
import { ago, duration, num, pct, shortHash, usd } from "@/lib/format";
import { AnimatedNumber, ChainDot, ChainName, Heading, TxLink, chainVar } from "./primitives";

/* ───────────────────────── holdings per chain ───────────────────────── */

export function Holdings({ s }: { s: DashState }) {
  const total = s.portfolio.totalUsd || 1;
  return (
    <section className="panel p-5" aria-labelledby="holdings-h">
      <Heading id="holdings-h" title="Holdings by chain" note="Kept up to date by Transfer events, and checked against real balances after every snapshot." />
      {/* one stacked bar shows the split at a glance */}
      <div className="mb-5 flex h-3 overflow-hidden rounded-sm" role="img" aria-label="Share of value by chain">
        {s.portfolio.chains.map((c) => (
          <motion.div
            key={c.chainId}
            initial={false}
            animate={{ width: `${(c.valueUsd / total) * 100}%` }}
            transition={{ duration: 0.9, ease: [0.2, 0.8, 0.2, 1] }}
            style={{ background: chainVar(c.chainId) }}
          />
        ))}
      </div>
      <div className="grid gap-px overflow-hidden rounded-[4px] sm:grid-cols-3" style={{ background: "var(--line)" }}>
        {s.portfolio.chains.map((c) => (
          <div key={c.chainId} className="p-4" style={{ background: "var(--panel)" }}>
            <div className="flex items-center justify-between gap-2">
              <span className="display font-bold">
                <ChainName chainId={c.chainId} short={false} />
              </span>
              <span className="display tnum muted text-sm">{pct(c.valueUsd / total, 0)}</span>
            </div>
            <div className="display mt-3 text-[1.7rem] font-bold leading-none">
              <AnimatedNumber value={c.valueUsd} format={(v) => usd(v, 0)} />
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-1 text-[0.92rem]">
              <dt className="muted">tETH</dt>
              <dd className="tnum text-right">
                <AnimatedNumber value={c.eth} format={(v) => num(v, 4)} />
              </dd>
              <dt className="muted">tUSD</dt>
              <dd className="tnum text-right">
                <AnimatedNumber value={c.usd} format={(v) => num(v, 2)} />
              </dd>
            </dl>
            <p className="muted mt-3 text-[0.82rem] leading-snug">
              {c.chainId === 84532 ? (
                <>
                  Wallet plus the{" "}
                  {s.addresses.vault && !s.preview ? (
                    <a className="link" href={addrUrl(84532, s.addresses.vault)} target="_blank" rel="noreferrer">
                      rebalancer vault
                      <span className="sr-only"> (opens in a new tab)</span>
                    </a>
                  ) : (
                    "rebalancer vault"
                  )}
                </>
              ) : (
                "Wallet balance"
              )}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ───────────────────────── flight log: full loops ───────────────────────── */

const KIND: Record<Loop["kind"], { label: string; color: string }> = {
  rebalance: { label: "Rebalance", color: "var(--magenta)" },
  alert: { label: "Range alert", color: "var(--amber)" },
  snapshot: { label: "Snapshot", color: "var(--cyan)" },
};

function Leg({ chainId, title, tx, preview }: { chainId: number; title: string; tx?: string; preview?: boolean }) {
  return (
    <div className="min-w-0">
      <div className="muted text-[0.78rem]">{title}</div>
      <div className="flex items-center gap-1.5 text-[0.9rem]">
        <ChainDot chainId={chainId} size={7} />
        <span className="truncate">{CHAINS[chainId]?.short}</span>
      </div>
      <div className="whitespace-nowrap text-[0.8rem] sm:text-[0.85rem]">
        <TxLink chainId={chainId} tx={tx} preview={preview} />
      </div>
    </div>
  );
}

function Gap({ secs }: { secs?: number }) {
  return (
    <div className="flex flex-col items-center justify-center px-1" aria-hidden={secs === undefined}>
      <svg width="34" height="10" viewBox="0 0 34 10" aria-hidden>
        <path d="M0 5 H28 M24 1 L30 5 L24 9" fill="none" stroke="var(--line-strong)" strokeWidth="1.5" />
      </svg>
      <span className="display tnum text-[0.78rem]" style={{ color: "var(--green)" }}>
        {secs !== undefined ? `${secs}s` : ""}
      </span>
    </div>
  );
}

export function FlightLog({ s, now }: { s: DashState; now: number }) {
  const reduce = useReducedMotion();
  const [kind, setKind] = useState<Loop["kind"] | "all">("all");
  const counts = { all: s.loops.length, rebalance: 0, alert: 0, snapshot: 0 } as Record<Loop["kind"] | "all", number>;
  s.loops.forEach((l) => counts[l.kind]++);
  const shown = kind === "all" ? s.loops : s.loops.filter((l) => l.kind === kind);
  const lat = s.loops.filter((l) => l.reactSecs !== undefined && l.callbackSecs !== undefined).map((l) => l.reactSecs! + l.callbackSecs!).sort((a, b) => a - b);
  const median = lat.length ? lat[Math.floor(lat.length / 2)] : undefined;
  return (
    <section className="panel p-5" aria-labelledby="log-h">
      <Heading
        id="log-h"
        title="Flight log"
        note="Each entry is one complete loop: the event on a chain, the autopilot's reaction on Lasna, and the result it caused on Base."
        right={
          median !== undefined ? (
            <span className="display tnum text-sm" style={{ color: "var(--green)" }}>
              median {median}s end to end
            </span>
          ) : undefined
        }
      />
      {s.loops.length > 0 && (
        <div role="group" aria-label="Show loops of one kind" className="mb-2 flex flex-wrap gap-2">
          {(["all", "rebalance", "alert", "snapshot"] as const).map((k) => (
            <button
              key={k}
              type="button"
              aria-pressed={kind === k}
              onClick={() => setKind(k)}
              className="min-h-9 rounded-[3px] border px-3 text-[0.88rem] transition-colors"
              style={
                kind === k
                  ? { borderColor: k === "all" ? "var(--text)" : KIND[k].color, color: k === "all" ? "var(--text)" : KIND[k].color, background: "var(--panel-2)" }
                  : { borderColor: "var(--line)", color: "var(--muted)" }
              }
            >
              {k === "all" ? "All" : KIND[k].label + "s"} <span className="tnum">{counts[k]}</span>
            </button>
          ))}
        </div>
      )}
      {shown.length === 0 ? (
        <p className="muted text-[0.95rem]">
          {s.loops.length === 0
            ? "No loops in the last few hours. The next transfer, price move or check-in will appear here."
            : "None of this kind in the recent log."}
        </p>
      ) : (
        <ol className="divide-y" style={{ borderColor: "var(--line)" }}>
          <AnimatePresence initial={false}>
            {shown.map((l) => (
              <motion.li
                key={l.key}
                layout={!reduce}
                initial={reduce ? false : { opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                className="grid gap-3 py-4 md:grid-cols-[11rem_1fr]"
                style={{ borderColor: "var(--line)" }}
              >
                <div className="min-w-0">
                  <div className="display text-[0.95rem] font-bold" style={{ color: KIND[l.kind].color }}>
                    {KIND[l.kind].label}
                  </div>
                  <div className="text-[0.92rem] leading-snug">{l.detail}</div>
                  <div className="muted mt-0.5 text-[0.8rem]">{ago(l.reactive.time, now)}</div>
                </div>
                <div className="grid grid-cols-[1fr_auto_1fr_auto_1fr] items-center gap-1">
                  {l.origin ? (
                    <Leg chainId={l.origin.chainId} title="Event" tx={l.origin.tx} preview={s.preview} />
                  ) : (
                    <div className="min-w-0">
                      <div className="muted text-[0.78rem]">Trigger</div>
                      <div className="text-[0.9rem]">Scheduled check-in</div>
                    </div>
                  )}
                  <Gap secs={l.reactSecs} />
                  <Leg chainId={l.reactive.chainId} title="Reaction" tx={l.reactive.tx} preview={s.preview} />
                  <Gap secs={l.callbackSecs} />
                  <div className="min-w-0">
                    <Leg chainId={l.callback?.chainId ?? 84532} title={l.callback && !l.callback.ok ? "Result (held by vault rule)" : "Result"} tx={l.callback?.tx} preview={s.preview} />
                  </div>
                </div>
              </motion.li>
            ))}
          </AnimatePresence>
        </ol>
      )}
    </section>
  );
}

/* ───────────────────────── event stream ───────────────────────── */

const FEED_COLOR: Record<FeedItem["kind"], string> = {
  holding: "var(--text)",
  price: "var(--text)",
  rebalance: "var(--magenta)",
  settled: "var(--green)",
  alert: "var(--amber)",
  snapshot: "var(--cyan)",
  resync: "var(--cyan)",
  landed: "var(--green)",
};

export function EventStream({ s, now }: { s: DashState; now: number }) {
  const reduce = useReducedMotion();
  return (
    <section className="panel flex max-h-[38rem] flex-col p-5" aria-labelledby="stream-h">
      <Heading id="stream-h" title="What the autopilot heard" note="Every reaction on Lasna, newest first." />
      <ul className="-mr-2 flex-1 overflow-y-auto pr-2" aria-live="polite" aria-relevant="additions">
        <AnimatePresence initial={false}>
          {s.feed.slice(0, 40).map((f) => (
            <motion.li
              key={f.key}
              layout={!reduce}
              initial={reduce ? false : { opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              className="grid grid-cols-[4px_1fr] gap-3 py-2"
            >
              <span className="mt-1 h-[calc(100%-8px)] rounded-full" style={{ background: f.chainId ? chainVar(f.chainId) : "var(--magenta)" }} aria-hidden />
              <div className="min-w-0">
                <div className="text-[0.92rem] leading-snug" style={{ color: FEED_COLOR[f.kind] }}>
                  {f.text}
                </div>
                <div className="muted text-[0.78rem]">
                  {f.time ? ago(f.time, now) : `block ${f.lasnaBlock}`}, reaction <TxLink chainId={5318007} tx={f.lasnaTx} preview={s.preview} />
                </div>
              </div>
            </motion.li>
          ))}
        </AnimatePresence>
        {s.feed.length === 0 && <li className="muted text-[0.95rem]">Quiet so far. Reactions show up here within seconds.</li>}
      </ul>
    </section>
  );
}

/* ───────────────────────── recorder: journal history ───────────────────────── */

const CW = 640;
const CH = 200;
const P = { l: 6, r: 6, t: 18, b: 24 };

export function Recorder({ s }: { s: DashState }) {
  const data = s.snapshots;
  const [hover, setHover] = useState<number | null>(null);
  const geo = useMemo(() => {
    if (data.length < 2) return null;
    const t0 = data[0].timestamp;
    const t1 = data[data.length - 1].timestamp;
    const vals = data.map((d) => d.totalUsd);
    const lo = Math.min(...vals) * 0.97;
    const hi = Math.max(...vals) * 1.03;
    const x = (t: number) => P.l + ((t - t0) / Math.max(1, t1 - t0)) * (CW - P.l - P.r);
    const y = (v: number) => P.t + (1 - (v - lo) / Math.max(1e-9, hi - lo)) * (CH - P.t - P.b);
    const ys = (v: number) => P.t + (1 - v) * (CH - P.t - P.b);
    const pts = data.map((d) => [x(d.timestamp), y(d.totalUsd)] as const);
    const line = pts.map(([a, b], i) => `${i ? "L" : "M"}${a.toFixed(1)},${b.toFixed(1)}`).join(" ");
    const share = data.map((d, i) => `${i ? "L" : "M"}${x(d.timestamp).toFixed(1)},${ys(d.ethShare).toFixed(1)}`).join(" ");
    return { pts, line, share, ys, lo, hi, target: data[data.length - 1].target };
  }, [data]);
  const h = hover !== null ? data[hover] : data[data.length - 1];

  return (
    <section className="panel p-5" aria-labelledby="rec-h">
      <Heading
        id="rec-h"
        title="Journal"
        note="Snapshots the autopilot writes to Base on Reactive's schedule."
        right={
          h ? (
            <div className="text-right">
              <div className="display tnum font-bold">{usd(h.totalUsd, 0)}</div>
              <div className="muted tnum text-[0.8rem]">
                {pct(h.ethShare)} ETH, {new Date(h.timestamp * 1000).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
              </div>
            </div>
          ) : undefined
        }
      />
      {!geo ? (
        <div className="rounded-[4px] border border-dashed p-5 text-[0.95rem]" style={{ borderColor: "var(--line-strong)" }}>
          {data.length === 1 ? (
            <>
              First snapshot recorded: <b className="tnum">{usd(data[0].totalUsd, 0)}</b> at {pct(data[0].ethShare)} ETH. The trend line appears after the next one,
              about {duration(s.autopilot.snapshotInterval)} later.
            </>
          ) : (
            <>The first snapshot is on its way. The autopilot writes one every {duration(s.autopilot.snapshotInterval)}.</>
          )}
        </div>
      ) : (
        <svg
          viewBox={`0 0 ${CW} ${CH}`}
          className="w-full touch-none select-none"
          onPointerLeave={() => setHover(null)}
          onPointerMove={(e) => {
            const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
            const px = ((e.clientX - r.left) / r.width) * CW;
            let best = 0;
            geo.pts.forEach(([x], i) => {
              if (Math.abs(x - px) < Math.abs(geo.pts[best][0] - px)) best = i;
            });
            setHover(best);
          }}
          role="img"
          aria-label={`Portfolio value over ${data.length} snapshots, from ${usd(data[0].totalUsd, 0)} to ${usd(data[data.length - 1].totalUsd, 0)}`}
        >
          <line x1={P.l} x2={CW - P.r} y1={geo.ys(geo.target)} y2={geo.ys(geo.target)} stroke="var(--cyan)" strokeDasharray="3 5" />
          <text x={P.l} y={P.t - 2} fontSize="11" fill="var(--muted)" className="tnum">
            {usd(geo.hi, 0)}
          </text>
          <text x={P.l} y={CH - 6} fontSize="11" fill="var(--muted)" className="tnum">
            {usd(geo.lo, 0)}
          </text>
          <text x={CW - P.r} y={CH - 6} textAnchor="end" fontSize="11" fill="var(--muted)">
            {new Date(data[data.length - 1].timestamp * 1000).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
          </text>
          <path d={geo.share} fill="none" stroke="var(--cyan)" strokeOpacity="0.6" strokeWidth="1.5" />
          <path d={geo.line} fill="none" stroke="var(--text)" strokeWidth="2.25" strokeLinejoin="round" />
          {hover !== null && (
            <g>
              <line x1={geo.pts[hover][0]} x2={geo.pts[hover][0]} y1={P.t} y2={CH - P.b} stroke="var(--line-strong)" />
              <circle cx={geo.pts[hover][0]} cy={geo.pts[hover][1]} r="4.5" fill="var(--panel)" stroke="var(--text)" strokeWidth="2" />
            </g>
          )}
        </svg>
      )}
      <div className="muted mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[0.8rem]">
        <span className="flex items-center gap-2">
          <span className="h-0.5 w-5" style={{ background: "var(--text)" }} /> total value
        </span>
        <span className="flex items-center gap-2">
          <span className="h-0.5 w-5" style={{ background: "var(--cyan)" }} /> ETH share, dashed at target
        </span>
        <span className="ml-auto tnum">{data.length} snapshot{data.length === 1 ? "" : "s"}</span>
      </div>
    </section>
  );
}

/* ───────────────────────── LP range: deviation scale ───────────────────────── */

export function RangeScale({ s }: { s: DashState }) {
  const { rangeLower: lo, rangeUpper: hi, lpPrice, rangeState } = s.autopilot;
  const span = hi - lo || 1;
  const min = lo - span * 0.75;
  const max = hi + span * 0.75;
  const pos = (v: number) => Math.min(100, Math.max(0, ((v - min) / (max - min)) * 100));
  const state = [
    { text: "Waiting for a price", color: "var(--muted)" },
    { text: "Inside your range", color: "var(--green)" },
    { text: "Below your range: time to move liquidity", color: "var(--amber)" },
    { text: "Above your range: time to move liquidity", color: "var(--amber)" },
  ][rangeState] ?? { text: "", color: "var(--muted)" };
  const last = s.alerts[s.alerts.length - 1];
  return (
    <section className="panel p-5" aria-labelledby="range-h">
      <Heading id="range-h" title="LP range watch" note="Price of the tETH/tUSD pool on Unichain against the range you provide liquidity in." />
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="display text-[2rem] font-bold leading-none">
          <AnimatedNumber value={lpPrice} format={(v) => usd(v, 2)} />
        </div>
        <div className="display font-bold" style={{ color: state.color }}>
          {state.text}
        </div>
      </div>
      {hi > 0 && (
        <div className="relative mt-6 h-14" role="img" aria-label={`Price ${usd(lpPrice, 0)} on a scale; your range is ${usd(lo, 0)} to ${usd(hi, 0)}`}>
          {/* deviation dots, like an instrument-landing scale */}
          <div className="absolute inset-x-0 top-6 flex justify-between px-[2px]">
            {Array.from({ length: 11 }, (_, i) => (
              <span key={i} className="h-2 w-2 rounded-full border" style={{ borderColor: "var(--line-strong)" }} />
            ))}
          </div>
          <div
            className="absolute top-[18px] h-5 rounded-[3px] border-2"
            style={{ left: `${pos(lo)}%`, width: `${pos(hi) - pos(lo)}%`, borderColor: "var(--cyan)", background: "color-mix(in oklab, var(--cyan) 12%, transparent)" }}
          />
          <motion.div
            className="absolute top-0 -translate-x-1/2"
            initial={false}
            animate={{ left: `${pos(lpPrice)}%` }}
            transition={{ type: "spring", stiffness: 60, damping: 14 }}
          >
            <svg width="22" height="56" viewBox="0 0 22 56" aria-hidden>
              <path d="M11 4 L19 16 L11 28 L3 16 Z" fill={state.color} />
              <line x1="11" y1="28" x2="11" y2="54" stroke={state.color} strokeWidth="2" />
            </svg>
          </motion.div>
          <div className="muted tnum absolute -bottom-5 text-[0.78rem]" style={{ left: `${pos(lo)}%`, transform: "translateX(-50%)" }}>
            {usd(lo, 0)}
          </div>
          <div className="muted tnum absolute -bottom-5 text-[0.78rem]" style={{ left: `${pos(hi)}%`, transform: "translateX(-50%)" }}>
            {usd(hi, 0)}
          </div>
        </div>
      )}
      <p className="muted mt-9 text-[0.9rem] leading-snug">
        {s.alerts.length === 0
          ? "No alerts yet. When the price leaves the range, or comes back, the autopilot writes an alert to the journal on Base."
          : `${s.alerts.length} alert${s.alerts.length === 1 ? "" : "s"} in the journal. Latest: price ${usd(last.price, 0)} ${["", "came back inside", "fell below", "rose above"][last.kind] ?? "changed"} the range.`}
      </p>
    </section>
  );
}

/* ───────────────────────── your rules ───────────────────────── */

export function Rules({ s }: { s: DashState }) {
  const a = s.autopilot;
  const rows: [string, string][] = [
    ["Target mix", `${pct(a.targetShare, 0)} ETH`],
    ["Comfort zone", `± ${pct(a.band, 0)}`],
    ["Largest price slip allowed", pct(a.slippage, 1)],
    ["Wait between trades", duration(a.cooldown)],
    ["Snapshot every", duration(a.snapshotInterval)],
    ["LP range", a.rangeUpper ? `${usd(a.rangeLower, 0)} to ${usd(a.rangeUpper, 0)}` : "not set"],
  ];
  const low = a.funds !== undefined && a.funds < 1;
  return (
    <section className="panel p-5" aria-labelledby="rules-h">
      <Heading id="rules-h" title="Your rules" note="Set once, stored on-chain in the autopilot. Values you chose are shown in cyan." />
      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-[4px]" style={{ background: "var(--line)" }}>
        {rows.map(([k, v]) => (
          <div key={k} className="p-3" style={{ background: "var(--panel)" }}>
            <dt className="muted text-[0.8rem] leading-tight">{k}</dt>
            <dd className="display tnum mt-1 font-bold" style={{ color: "var(--cyan)" }}>
              {v}
            </dd>
          </div>
        ))}
      </dl>
      <dl className="mt-4 grid grid-cols-2 gap-3 text-[0.9rem]">
        <div>
          <dt className="muted text-[0.8rem]">Reactions handled</dt>
          <dd className="display tnum font-bold">{a.reactCount.toLocaleString()}</dd>
        </div>
        <div>
          <dt className="muted text-[0.8rem]">Fuel left for reactions</dt>
          <dd className="display tnum font-bold" style={{ color: low ? "var(--amber)" : undefined }}>
            {a.funds !== undefined ? `${a.funds.toFixed(2)} lREACT` : "unknown"}
          </dd>
        </div>
      </dl>
    </section>
  );
}

/* ───────────────────────── how it works + contracts ───────────────────────── */

const STEPS = [
  ["It listens", "A reactive contract on Reactive Lasna subscribes to every tETH and tUSD transfer in or out of your wallet on three chains, and to pool prices. No bot, no server."],
  ["It keeps the books", "Each event updates an on-chain ledger per chain. After every snapshot, a beacon on each chain re-publishes real balances, so a missed event can't leave the books wrong."],
  ["It acts", "When your ETH share leaves the comfort zone, it tells the vault on Base to trade back to target. When the price leaves your LP range, it writes an alert."],
  ["It remembers", "Reactive's built-in schedule wakes it to write a snapshot to the journal on Base. That is the history above."],
] as const;

export function HowItWorks() {
  return (
    <section className="panel p-5" aria-labelledby="how-h">
      <Heading id="how-h" title="How it works" note="The whole loop runs on-chain. You set your rules once." />
      <ol className="grid gap-5 sm:grid-cols-2">
        {STEPS.map(([t, b], i) => (
          <li key={t} className="grid grid-cols-[2rem_1fr] gap-3">
            <span className="display grid h-8 w-8 place-items-center rounded-[3px] border-2 text-sm font-bold" style={{ borderColor: "var(--magenta)", color: "var(--magenta)" }}>
              {i + 1}
            </span>
            <div>
              <div className="display font-bold">{t}</div>
              <p className="muted mt-1 text-[0.92rem] leading-relaxed">{b}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function Contracts({ s }: { s: DashState }) {
  if (s.preview) return null;
  const A = s.addresses;
  const rows: { name: string; chainId: number; addr?: string }[] = [
    { name: "Autopilot (reactive contract)", chainId: 5318007, addr: A.autopilot },
    { name: "Rebalancer vault", chainId: 84532, addr: A.vault },
    { name: "Journal", chainId: 84532, addr: A.journal },
    ...[11155111, 84532, 1301].map((id) => ({ name: "Balance beacon", chainId: id, addr: A.beacons[id] })),
    { name: "Price pool", chainId: 84532, addr: A.tokens[84532]?.pool },
    { name: "LP range pool", chainId: 1301, addr: A.tokens[1301]?.pool },
  ];
  return (
    <section className="panel p-5" aria-labelledby="contracts-h">
      <Heading id="contracts-h" title="Contracts" note="Everything is verifiable on the block explorers." />
      <ul className="grid gap-x-6 sm:grid-cols-2">
        {rows
          .filter((r) => r.addr)
          .map((r) => (
            <li key={`${r.name}-${r.chainId}`} className="flex items-center justify-between gap-3 border-b py-2 text-[0.9rem]" style={{ borderColor: "var(--line)" }}>
              <span className="min-w-0 truncate">
                {r.name} <span className="muted">on <ChainName chainId={r.chainId} /></span>
              </span>
              <a href={addrUrl(r.chainId, r.addr!)} target="_blank" rel="noreferrer" className="link tnum inline-block shrink-0 py-[4px]" aria-label={`${r.name} on ${CHAINS[r.chainId].name}: ${r.addr} (opens in a new tab)`}>
                {shortHash(r.addr)}
              </a>
            </li>
          ))}
      </ul>
    </section>
  );
}
