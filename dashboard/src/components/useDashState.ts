"use client";

import { useEffect, useRef, useState } from "react";
import type { DashState } from "@/lib/types";

export function useDashState(intervalMs = 5000) {
  const [state, setState] = useState<DashState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const preview = useRef(false);

  useEffect(() => {
    preview.current = new URLSearchParams(window.location.search).get("preview") === "1";
    let alive = true;
    const load = async () => {
      try {
        const r = await fetch(`/api/state${preview.current ? "?preview=1" : ""}`, { cache: "no-store" });
        const j = await r.json();
        if (!alive) return;
        if (!r.ok) throw new Error(j.error ?? r.statusText);
        setState(j);
        setError(null);
        setTick((t) => t + 1);
      } catch (e) {
        if (alive) setError((e as Error).message);
      }
    };
    load();
    const id = setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, intervalMs);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [intervalMs]);

  return { state, error, tick };
}

/** A clock that re-renders every second so "x s ago" labels stay fresh. */
export function useNow(ms = 1000) {
  const [now, setNow] = useState(() => Date.now() / 1000);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now() / 1000), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}
