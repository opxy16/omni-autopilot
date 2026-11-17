"use client";

import { AnimatePresence, motion } from "framer-motion";
import type { DashState, Loop, FeedItem } from "@/lib/types";
import { CHAINS } from "@/lib/chains";
import { Card, ChainDot, Label, Pill, TxLink } from "./primitives";
import { ago } from "@/lib/format";

const KIND_STYLE: Record<Loop["kind"], { tone: "info" | "warn" | "good"; label: string }> = {
  rebalance: { tone: "info", label: "Rebalance" },
  alert: { tone: "warn", label: "Alert" },
  snapshot: { tone: "good", label: "Snapshot" },
};

function Node({ chainId, title, tx, time, preview, now }: { chainId: number; title: string; tx?: string; time?: number; preview?: boolean; now: number }) {
  return (
    <div className="min-w-0 flex-1 rounded-2xl bg-white/[0.035] p-3 ring-1 ring-white/[0.06]">
      <div className="flex items-center gap-2 text-xs text-white/50">
        <ChainDot chainId={chainId} size={7} />
        <span className="truncate">{title}</span>
      </div>
      <div className="mt-1 truncate text-sm font-medium">{CHAINS[chainId]?.short ?? "—"}</div>
      <div className="mt-1 flex items-center justify-between gap-2">
        <TxLink chainId={chainId} tx={tx} preview={preview} />
        <span className="text-[10px] text-white/35">{time ? ago(time, now) : ""}</span>
      </div>
    </div>
  );
}

function Arrow({ secs, live }: { secs?: number; live: boolean }) {
  return (
    <div className="flex w-full shrink-0 flex-row items-center gap-2 sm:w-16 sm:flex-col sm:gap-1">
      <div className="relative h-px flex-1 overflow-hidden bg-white/10 sm:h-0.5 sm:w-full sm:flex-none">
        {live && <div className="flow-line absolute inset-0" />}
      </div>
      <span className="text-[10px] font-medium text-react tabular">{secs !== undefined ? `${secs}s` : ""}</span>
    </div>
  );
}

export function LoopTimeline({ s, now }: { s: DashState; now: number }) {
  const latencies = s.loops
    .filter((l) => l.reactSecs !== undefined && l.callbackSecs !== undefined)
    .map((l) => l.reactSecs! + l.callbackSecs!)
    .sort((a, b) => a - b);
  const median = latencies.length ? latencies[Math.floor(latencies.length / 2)] : undefined;
  return (
    <Card delay={0.2}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Label>Full loops · event → Reactive → callback</Label>
          <h2 className="mt-1 text-xl font-semibold">What the autopilot did</h2>
        </div>
        {median !== undefined && <Pill tone="good">median loop {median}s end-to-end</Pill>}
      </div>
      <div className="mt-5 space-y-3">
        {s.loops.length === 0 && (
          <p className="text-sm text-white/45">No loops yet in the last few hours. The next cron tick or wallet transfer will show up here.</p>
        )}
        <AnimatePresence initial={false}>
          {s.loops.map((l, i) => (
            <motion.div
              key={l.key}
              layout
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.5, delay: i * 0.03 }}
              className="rounded-2xl bg-white/[0.02] p-3 ring-1 ring-white/[0.05]"
            >
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <Pill tone={KIND_STYLE[l.kind].tone}>{KIND_STYLE[l.kind].label}</Pill>
                <span className="text-sm font-medium">{l.title}</span>
                <span className="text-sm text-white/50">{l.detail}</span>
                {l.callback && !l.callback.ok && <Pill tone="warn">skipped by vault rail</Pill>}
              </div>
              <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
                {l.origin ? (
                  <Node chainId={l.origin.chainId} title="Origin event" tx={l.origin.tx} time={l.origin.time} preview={s.preview} now={now} />
                ) : (
                  <Node chainId={5318007} title="Cron / owner" time={l.reactive.time} preview={s.preview} now={now} />
                )}
                <Arrow secs={l.reactSecs} live={i === 0} />
                <Node chainId={l.reactive.chainId} title="Reactive tx" tx={l.reactive.tx} time={l.reactive.time} preview={s.preview} now={now} />
                <Arrow secs={l.callbackSecs} live={i === 0} />
                <Node chainId={l.callback?.chainId ?? 84532} title="Callback" tx={l.callback?.tx} time={l.callback?.time} preview={s.preview} now={now} />
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </Card>
  );
}

const FEED_ICON: Record<FeedItem["kind"], string> = {
  holding: "◆",
  price: "◷",
  rebalance: "⇄",
  settled: "✓",
  alert: "⚑",
  snapshot: "▣",
  resync: "↻",
  landed: "⤓",
};

export function ActivityFeed({ s, now }: { s: DashState; now: number }) {
  return (
    <Card delay={0.35} className="flex max-h-[34rem] flex-col">
      <Label>Live reactions on Lasna</Label>
      <h2 className="mt-1 text-xl font-semibold">Activity</h2>
      <ul className="-mr-2 mt-4 flex-1 space-y-1 overflow-y-auto pr-2">
        <AnimatePresence initial={false}>
          {s.feed.slice(0, 40).map((f) => (
            <motion.li
              key={f.key}
              layout
              initial={{ opacity: 0, y: -8, backgroundColor: "rgba(45,226,166,0.15)" }}
              animate={{ opacity: 1, y: 0, backgroundColor: "rgba(45,226,166,0)" }}
              transition={{ duration: 1.2 }}
              className="flex items-start gap-3 rounded-xl px-2 py-2"
            >
              <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-lg bg-white/[0.06] text-xs text-white/70">{FEED_ICON[f.kind]}</span>
              <div className="min-w-0 flex-1">
                <div className="text-sm leading-snug text-white/85">{f.text}</div>
                <div className="mt-0.5 flex items-center gap-2 text-[11px] text-white/35">
                  {f.chainId ? <ChainDot chainId={f.chainId} size={5} /> : null}
                  <span>{f.time ? ago(f.time, now) : `block ${f.lasnaBlock}`}</span>
                  <span>·</span>
                  <TxLink chainId={5318007} tx={f.lasnaTx} preview={s.preview} />
                </div>
              </div>
            </motion.li>
          ))}
        </AnimatePresence>
        {s.feed.length === 0 && <li className="text-sm text-white/45">Nothing yet — reactions appear here within seconds.</li>}
      </ul>
    </Card>
  );
}
