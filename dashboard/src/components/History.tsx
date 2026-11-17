"use client";

import { motion } from "framer-motion";
import { useMemo, useState } from "react";
import type { DashState } from "@/lib/types";
import { Card, Label } from "./primitives";
import { pct, usd } from "@/lib/format";

const W = 640;
const H = 220;
const PAD = { l: 8, r: 8, t: 16, b: 24 };

export function HistoryChart({ s }: { s: DashState }) {
  const data = s.snapshots;
  const [hover, setHover] = useState<number | null>(null);

  const geo = useMemo(() => {
    if (data.length < 2) return null;
    const t0 = data[0].timestamp;
    const t1 = data[data.length - 1].timestamp;
    const vals = data.map((d) => d.totalUsd);
    const vMin = Math.min(...vals) * 0.97;
    const vMax = Math.max(...vals) * 1.02;
    const x = (t: number) => PAD.l + ((t - t0) / Math.max(1, t1 - t0)) * (W - PAD.l - PAD.r);
    const y = (v: number) => PAD.t + (1 - (v - vMin) / Math.max(1e-9, vMax - vMin)) * (H - PAD.t - PAD.b);
    const ys = (share: number) => PAD.t + (1 - share) * (H - PAD.t - PAD.b);
    const pts = data.map((d) => [x(d.timestamp), y(d.totalUsd)] as const);
    const line = pts.map(([px, py], i) => `${i ? "L" : "M"}${px.toFixed(1)},${py.toFixed(1)}`).join(" ");
    const area = `${line} L${pts[pts.length - 1][0].toFixed(1)},${H - PAD.b} L${pts[0][0].toFixed(1)},${H - PAD.b} Z`;
    const share = data.map((d, i) => `${i ? "L" : "M"}${x(d.timestamp).toFixed(1)},${ys(d.ethShare).toFixed(1)}`).join(" ");
    const target = data[data.length - 1].target;
    return { x, y, ys, pts, line, area, share, target };
  }, [data]);

  const h = hover !== null ? data[hover] : data[data.length - 1];

  return (
    <Card delay={0.4}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Label>Journal on Base · written by Reactive cron</Label>
          <h2 className="mt-1 text-xl font-semibold">Portfolio history</h2>
        </div>
        {h && (
          <div className="text-right text-sm tabular">
            <div className="font-semibold">{usd(h.totalUsd, 0)}</div>
            <div className="text-xs text-white/50">
              {pct(h.ethShare)} ETH · {new Date(h.timestamp * 1000).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
            </div>
          </div>
        )}
      </div>
      {!geo ? (
        <p className="mt-6 text-sm text-white/45">
          The first snapshots are on their way — the autopilot writes one every {Math.round(s.autopilot.snapshotInterval / 3600)} h using Reactive&apos;s cron.
        </p>
      ) : (
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="mt-4 w-full touch-none select-none"
          onMouseLeave={() => setHover(null)}
          onPointerMove={(e) => {
            const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
            const px = ((e.clientX - r.left) / r.width) * W;
            let best = 0;
            geo.pts.forEach(([x], i) => {
              if (Math.abs(x - px) < Math.abs(geo.pts[best][0] - px)) best = i;
            });
            setHover(best);
          }}
          role="img"
          aria-label="Portfolio value and ETH share over time"
        >
          <defs>
            <linearGradient id="area" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#7c5cff" stopOpacity="0.45" />
              <stop offset="100%" stopColor="#7c5cff" stopOpacity="0" />
            </linearGradient>
            <linearGradient id="stroke" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#7c5cff" />
              <stop offset="100%" stopColor="#2de2a6" />
            </linearGradient>
          </defs>
          <line x1={PAD.l} x2={W - PAD.r} y1={geo.ys(geo.target)} y2={geo.ys(geo.target)} stroke="rgba(255,255,255,0.18)" strokeDasharray="4 6" />
          <text x={W - PAD.r} y={geo.ys(geo.target) - 6} textAnchor="end" fontSize="10" fill="rgba(255,255,255,0.4)">
            target {pct(geo.target, 0)} ETH
          </text>
          <motion.path d={geo.area} fill="url(#area)" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 1 }} />
          <motion.path
            d={geo.line}
            fill="none"
            stroke="url(#stroke)"
            strokeWidth="2.5"
            strokeLinejoin="round"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 1.6, ease: [0.16, 1, 0.3, 1] }}
          />
          <path d={geo.share} fill="none" stroke="rgba(45,226,166,0.55)" strokeWidth="1.5" strokeDasharray="2 4" />
          {hover !== null && (
            <g>
              <line x1={geo.pts[hover][0]} x2={geo.pts[hover][0]} y1={PAD.t} y2={H - PAD.b} stroke="rgba(255,255,255,0.25)" />
              <circle cx={geo.pts[hover][0]} cy={geo.pts[hover][1]} r="5" fill="#2de2a6" stroke="white" strokeWidth="2" />
            </g>
          )}
        </svg>
      )}
      <div className="mt-2 flex gap-5 text-[11px] text-white/45">
        <span className="flex items-center gap-1.5">
          <span className="h-0.5 w-4 rounded bg-gradient-to-r from-violet to-react" /> total value
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-0.5 w-4 rounded border-t border-dashed border-react/70" /> ETH share
        </span>
        <span className="ml-auto">{data.length} snapshots</span>
      </div>
    </Card>
  );
}
