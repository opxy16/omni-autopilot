export const usd = (v: number, digits?: number) =>
  `$${v.toLocaleString("en-US", { minimumFractionDigits: digits ?? (v < 100 ? 2 : 0), maximumFractionDigits: digits ?? (v < 100 ? 2 : 0) })}`;

export const num = (v: number, digits = 4) => v.toLocaleString("en-US", { maximumFractionDigits: digits });

export const pct = (v: number, digits = 1) => `${(v * 100).toFixed(digits)}%`;

export const shortHash = (h?: string) => (h ? `${h.slice(0, 6)}…${h.slice(-4)}` : "—");

export function ago(unixSecs?: number, now = Date.now() / 1000): string {
  if (!unixSecs) return "—";
  const d = Math.max(0, Math.round(now - unixSecs));
  if (d < 5) return "just now";
  if (d < 60) return `${d}s ago`;
  if (d < 3600) return `${Math.floor(d / 60)}m ago`;
  if (d < 86400) return `${Math.floor(d / 3600)}h ${Math.floor((d % 3600) / 60)}m ago`;
  return `${Math.floor(d / 86400)}d ago`;
}

export function duration(secs: number): string {
  if (secs < 60) return `${secs}s`;
  if (secs < 3600) return `${Math.round(secs / 60)} min`;
  if (secs % 3600 === 0) return `${secs / 3600} h`;
  return `${(secs / 3600).toFixed(1)} h`;
}
