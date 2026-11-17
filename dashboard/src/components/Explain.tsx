"use client";

import { motion } from "framer-motion";
import type { DashState } from "@/lib/types";
import { CHAINS, addrUrl } from "@/lib/chains";
import { Card, ChainDot, Label } from "./primitives";
import { duration, pct, shortHash, usd } from "@/lib/format";

const STEPS = [
  {
    title: "It watches",
    body: "A reactive contract on Reactive Lasna subscribes to every tETH/tUSD transfer in or out of your wallet on Ethereum, Base and Unichain Sepolia — plus the pool prices. No bot, no server.",
  },
  {
    title: "It keeps the books",
    body: "Each event updates an on-chain ledger of your holdings per chain. Beacons on each chain re-publish real balances on a schedule, so the books heal themselves if anything is missed.",
  },
  {
    title: "It acts",
    body: "When your ETH share leaves your comfort zone, it calls the vault on Base to trade back to target. When the price leaves your LP range, it writes an alert.",
  },
  {
    title: "It remembers",
    body: "Reactive's built-in cron wakes it up to write a snapshot of your portfolio to a journal on Base — the history you see above.",
  },
];

export function HowItWorks() {
  return (
    <Card delay={0.45}>
      <Label>In plain English</Label>
      <h2 className="mt-1 text-xl font-semibold">How the autopilot works</h2>
      <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {STEPS.map((s, i) => (
          <motion.div
            key={s.title}
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.08, duration: 0.5 }}
            className="rounded-2xl bg-white/[0.03] p-4 ring-1 ring-white/[0.06]"
          >
            <div className="grid h-8 w-8 place-items-center rounded-xl bg-gradient-to-br from-violet to-react text-sm font-semibold text-ink">{i + 1}</div>
            <div className="mt-3 font-medium">{s.title}</div>
            <p className="mt-1 text-sm leading-relaxed text-white/55">{s.body}</p>
          </motion.div>
        ))}
      </div>
      <FlowDiagram />
    </Card>
  );
}

function FlowDiagram() {
  const origins = [11155111, 84532, 1301];
  return (
    <div className="mt-6 overflow-x-auto">
      <svg viewBox="0 0 720 200" className="min-w-[560px] w-full" role="img" aria-label="Events from three chains flow into the reactive contract on Lasna, which calls back the vault and journal on Base">
        <defs>
          <linearGradient id="flow" x1="0" x2="1">
            <stop offset="0%" stopColor="#7c5cff" stopOpacity="0.2" />
            <stop offset="100%" stopColor="#2de2a6" stopOpacity="0.9" />
          </linearGradient>
        </defs>
        {origins.map((id, i) => (
          <g key={id}>
            <rect x="10" y={20 + i * 60} width="170" height="40" rx="12" fill="rgba(255,255,255,0.04)" stroke={CHAINS[id].color} strokeOpacity="0.6" />
            <circle cx="30" cy={40 + i * 60} r="5" fill={CHAINS[id].color} />
            <text x="44" y={44 + i * 60} fontSize="13" fill="white" fillOpacity="0.85">
              {CHAINS[id].name}
            </text>
            <path d={`M180 ${40 + i * 60} C 240 ${40 + i * 60}, 240 100, 290 100`} fill="none" stroke="url(#flow)" strokeWidth="2" strokeDasharray="5 6">
              <animate attributeName="stroke-dashoffset" from="22" to="0" dur="1s" repeatCount="indefinite" />
            </path>
          </g>
        ))}
        <rect x="290" y="65" width="150" height="70" rx="16" fill="rgba(45,226,166,0.08)" stroke="#2de2a6" />
        <text x="365" y="95" fontSize="13" textAnchor="middle" fill="white">
          PortfolioAutopilot
        </text>
        <text x="365" y="114" fontSize="11" textAnchor="middle" fill="#2de2a6">
          Reactive Lasna
        </text>
        {[
          { y: 40, t: "RebalancerVault" },
          { y: 100, t: "Journal" },
          { y: 160, t: "Beacons (re-sync)" },
        ].map((d) => (
          <g key={d.t}>
            <path d={`M440 100 C 490 100, 490 ${d.y}, 540 ${d.y}`} fill="none" stroke="url(#flow)" strokeWidth="2" strokeDasharray="5 6">
              <animate attributeName="stroke-dashoffset" from="22" to="0" dur="1s" repeatCount="indefinite" />
            </path>
            <rect x="540" y={d.y - 20} width="170" height="40" rx="12" fill="rgba(255,255,255,0.04)" stroke="rgba(59,130,246,0.6)" />
            <text x="625" y={d.y + 5} fontSize="13" textAnchor="middle" fill="white" fillOpacity="0.85">
              {d.t}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

export function RulesCard({ s }: { s: DashState }) {
  const a = s.autopilot;
  const rows: [string, string][] = [
    ["Target mix", `${pct(a.targetShare, 0)} ETH / ${pct(1 - a.targetShare, 0)} USD`],
    ["Comfort zone", `± ${pct(a.band, 0)}`],
    ["Max slippage", pct(a.slippage, 1)],
    ["Cooldown between trades", duration(a.cooldown)],
    ["Snapshot every", duration(a.snapshotInterval)],
    ["LP range", a.rangeUpper ? `${usd(a.rangeLower, 0)} – ${usd(a.rangeUpper, 0)}` : "not set"],
  ];
  return (
    <Card delay={0.5}>
      <Label>Your rules · stored on-chain</Label>
      <h2 className="mt-1 text-xl font-semibold">Set it and forget it</h2>
      <dl className="mt-4 divide-y divide-white/[0.06]">
        {rows.map(([k, v]) => (
          <div key={k} className="flex items-center justify-between py-2.5 text-sm">
            <dt className="text-white/55">{k}</dt>
            <dd className="font-mono text-white/90">{v}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
        <Stat label="Reactions handled" value={a.reactCount.toLocaleString()} />
        <Stat label="Reactive funds" value={a.funds !== undefined ? `${a.funds.toFixed(2)} lREACT` : "—"} warn={a.funds !== undefined && a.funds < 1} />
      </div>
    </Card>
  );
}

function Stat({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="rounded-xl bg-white/[0.03] p-3 ring-1 ring-white/[0.06]">
      <div className="text-white/45">{label}</div>
      <div className={`mt-1 font-mono text-sm ${warn ? "text-amber-300" : "text-white/90"}`}>{value}</div>
    </div>
  );
}

export function Contracts({ s }: { s: DashState }) {
  if (s.preview) return null;
  const A = s.addresses;
  const rows: { name: string; chainId: number; addr?: string }[] = [
    { name: "PortfolioAutopilot (reactive)", chainId: 5318007, addr: A.autopilot },
    { name: "RebalancerVault", chainId: 84532, addr: A.vault },
    { name: "Journal", chainId: 84532, addr: A.journal },
    ...[11155111, 84532, 1301].map((id) => ({ name: `BalanceBeacon`, chainId: id, addr: A.beacons[id] })),
    { name: "Price pool (tETH/tUSD)", chainId: 84532, addr: A.tokens[84532]?.pool },
    { name: "LP-alert pool (tETH/tUSD)", chainId: 1301, addr: A.tokens[1301]?.pool },
  ];
  return (
    <Card delay={0.55}>
      <Label>Deployed contracts</Label>
      <ul className="mt-3 grid gap-2 sm:grid-cols-2">
        {rows
          .filter((r) => r.addr)
          .map((r) => (
            <li key={`${r.name}-${r.chainId}`} className="flex items-center justify-between gap-3 rounded-xl bg-white/[0.03] px-3 py-2 text-sm ring-1 ring-white/[0.05]">
              <span className="flex min-w-0 items-center gap-2">
                <ChainDot chainId={r.chainId} size={6} />
                <span className="truncate text-white/75">{r.name}</span>
                <span className="text-xs text-white/35">{CHAINS[r.chainId].short}</span>
              </span>
              <a href={addrUrl(r.chainId, r.addr!)} target="_blank" rel="noreferrer" className="font-mono text-xs text-white/60 hover:text-react">
                {shortHash(r.addr)}
              </a>
            </li>
          ))}
      </ul>
    </Card>
  );
}
