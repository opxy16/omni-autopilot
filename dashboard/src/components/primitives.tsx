"use client";

import { animate, motion, useMotionValue, useReducedMotion, useTransform } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { CHAINS, txUrl } from "@/lib/chains";
import { shortHash } from "@/lib/format";

/** Theme-aware colour for each chain (CSS variables, so light/dark both work). */
export const chainVar = (id: number) =>
  ({ 11155111: "var(--sepolia)", 84532: "var(--base)", 1301: "var(--unichain)", 5318007: "var(--magenta)" })[id] ??
  "var(--muted)";

/** A number that glides to its new value; it briefly turns cyan when it changes. */
export function AnimatedNumber({
  value,
  format,
  className = "",
  highlight = true,
}: {
  value: number;
  format: (v: number) => string;
  className?: string;
  /** Briefly tint the number when it changes; off for counters that change constantly. */
  highlight?: boolean;
}) {
  const reduce = useReducedMotion();
  const mv = useMotionValue(value);
  const text = useTransform(mv, (v) => format(v));
  const [changed, setChanged] = useState(false);
  const prev = useRef(value);
  useEffect(() => {
    if (prev.current === value) return;
    prev.current = value;
    if (reduce) {
      mv.set(value);
      return;
    }
    const c = animate(mv, value, { duration: 0.9, ease: [0.2, 0.8, 0.2, 1] });
    if (highlight) setChanged(true);
    const t = setTimeout(() => setChanged(false), 1200);
    return () => {
      c.stop();
      clearTimeout(t);
      setChanged(false);
    };
  }, [value, mv, reduce, highlight]);
  return (
    <motion.span className={`tnum transition-colors duration-700 ${className}`} style={changed ? { color: "var(--cyan)" } : undefined}>
      {text}
    </motion.span>
  );
}

export function ChainDot({ chainId, size = 8 }: { chainId: number; size?: number }) {
  return (
    <span
      aria-hidden
      className="inline-block shrink-0 rounded-full"
      style={{ width: size, height: size, background: chainVar(chainId) }}
    />
  );
}

export function ChainName({ chainId, short = true }: { chainId: number; short?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <ChainDot chainId={chainId} size={7} />
      {short ? CHAINS[chainId]?.short : CHAINS[chainId]?.name}
    </span>
  );
}

export function TxLink({ chainId, tx, preview, label }: { chainId: number; tx?: string; preview?: boolean; label?: string }) {
  if (!tx) return <span className="muted">waiting…</span>;
  const text = label ?? shortHash(tx);
  if (preview) return <span className="tnum muted">{text}</span>;
  return (
    <a
      href={txUrl(chainId, tx)}
      target="_blank"
      rel="noreferrer"
      className="link tnum inline-block py-[3px]"
      aria-label={`${CHAINS[chainId]?.name ?? "explorer"} transaction ${tx} (opens in a new tab)`}
    >
      {text}
    </a>
  );
}

/** Small section heading in sentence case, with an optional one-line explanation. */
export function Heading({ title, note, right, id }: { title: string; note?: string; right?: React.ReactNode; id?: string }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
      <div className="min-w-0">
        <h2 id={id} className="display text-[1.15rem] font-bold leading-tight">
          {title}
        </h2>
        {note && <p className="muted mt-1 max-w-[62ch] text-[0.92rem] leading-snug">{note}</p>}
      </div>
      {right}
    </div>
  );
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark" | null>(null);
  useEffect(() => {
    const set = document.documentElement.dataset.theme as "light" | "dark" | undefined;
    setTheme(set ?? (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"));
  }, []);
  const next = theme === "dark" ? "light" : "dark";
  return (
    <button
      type="button"
      onClick={() => {
        document.documentElement.dataset.theme = next;
        try {
          localStorage.setItem("theme", next);
        } catch {
          /* private mode: theme still switches for this visit */
        }
        setTheme(next);
      }}
      className="panel flex h-9 items-center gap-2 px-3 text-sm"
      aria-label={`Switch to ${next} mode`}
    >
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        {theme === "dark" ? (
          <>
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
          </>
        ) : (
          <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
        )}
      </svg>
      <span className="hidden sm:inline">{theme === "dark" ? "Day" : "Night"}</span>
    </button>
  );
}
