"use client";

import { animate, motion, useMotionValue, useTransform } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { CHAINS, txUrl } from "@/lib/chains";
import { shortHash } from "@/lib/format";

/** Number that glides to its new value and briefly glows when it changes. */
export function AnimatedNumber({
  value,
  format,
  className = "",
}: {
  value: number;
  format: (v: number) => string;
  className?: string;
}) {
  const mv = useMotionValue(value);
  const text = useTransform(mv, (v) => format(v));
  const [flash, setFlash] = useState(false);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      mv.set(value);
      return;
    }
    const c = animate(mv, value, { duration: 1.1, ease: [0.16, 1, 0.3, 1] });
    setFlash(true);
    const t = setTimeout(() => setFlash(false), 900);
    return () => {
      c.stop();
      clearTimeout(t);
    };
  }, [value, mv]);
  return (
    <motion.span
      className={`tabular transition-[text-shadow,color] duration-700 ${flash ? "text-react [text-shadow:0_0_24px_rgba(45,226,166,0.7)]" : ""} ${className}`}
    >
      {text}
    </motion.span>
  );
}

export function Card({
  children,
  className = "",
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 18, filter: "blur(6px)" }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      transition={{ duration: 0.7, delay, ease: [0.16, 1, 0.3, 1] }}
      className={`glass min-w-0 p-5 sm:p-6 ${className}`}
    >
      {children}
    </motion.section>
  );
}

export function Label({ children }: { children: React.ReactNode }) {
  return <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-white/45">{children}</div>;
}

export function ChainDot({ chainId, size = 8 }: { chainId: number; size?: number }) {
  return (
    <span
      className="inline-block shrink-0 rounded-full"
      style={{ width: size, height: size, background: CHAINS[chainId]?.color ?? "#999", boxShadow: `0 0 10px ${CHAINS[chainId]?.color ?? "#999"}` }}
    />
  );
}

export function TxLink({ chainId, tx, preview }: { chainId: number; tx?: string; preview?: boolean }) {
  if (!tx) return <span className="text-white/30">pending…</span>;
  if (preview) return <span className="font-mono text-xs text-white/50">{shortHash(tx)}</span>;
  return (
    <a
      href={txUrl(chainId, tx)}
      target="_blank"
      rel="noreferrer"
      className="font-mono text-xs text-white/70 underline decoration-white/20 underline-offset-4 transition hover:text-react hover:decoration-react"
    >
      {shortHash(tx)}
    </a>
  );
}

export function Pill({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "good" | "warn" | "bad" | "neutral" | "info" }) {
  const tones = {
    good: "bg-react/15 text-react ring-react/30",
    warn: "bg-amber-400/15 text-amber-300 ring-amber-300/30",
    bad: "bg-rose-500/15 text-rose-300 ring-rose-400/30",
    info: "bg-violet/20 text-violet-200 ring-violet/40",
    neutral: "bg-white/8 text-white/70 ring-white/15",
  } as const;
  return <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${tones[tone]}`}>{children}</span>;
}
