"use client";

import { motion, useReducedMotion } from "framer-motion";
import { useDashState, useNow } from "@/components/useDashState";
import { AllocationTape, ModeStrip, RouteDisplay, statusLine, toneColor } from "@/components/Cockpit";
import { Contracts, EventStream, FlightLog, Holdings, HowItWorks, RangeScale, Recorder, Rules } from "@/components/Instruments";
import { AnimatedNumber, ThemeToggle } from "@/components/primitives";
import { addrUrl } from "@/lib/chains";
import { ago, shortHash } from "@/lib/format";

export default function Page() {
  const { state: s, error } = useDashState(5000);
  const now = useNow();
  const reduce = useReducedMotion();

  // One orchestrated entrance for the hero; everything below simply appears.
  const rise = (i: number) =>
    reduce ? {} : { initial: { opacity: 0, y: 14 }, animate: { opacity: 1, y: 0 }, transition: { delay: 0.08 * i, duration: 0.6, ease: [0.2, 0.8, 0.2, 1] as const } };

  const status = s ? statusLine(s) : null;

  return (
    <div className="mx-auto max-w-[1240px] px-4 pb-16 pt-5 sm:px-6 lg:px-8">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:px-3 focus:py-2" style={{ background: "var(--panel)" }}>
        Skip to the dashboard
      </a>
      <header className="flex flex-wrap items-center justify-between gap-3 border-b pb-4" style={{ borderColor: "var(--line)" }}>
        <div className="flex items-center gap-3">
          <Mark />
          <div>
            <div className="display text-lg font-bold leading-tight">Omni Autopilot</div>
            <div className="muted hidden text-[0.85rem] sm:block">Keeps a three-chain portfolio on course, on Reactive Omni</div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[0.85rem]">
          {s?.deployed && (
            <span className="panel flex h-9 items-center gap-2 px-3" title="Latest block on Reactive Lasna">
              <span className="pulse-dot h-2 w-2 rounded-full" style={{ background: "var(--green)" }} aria-hidden />
              <span className="muted">Lasna</span>
              <AnimatedNumber value={s.lasnaBlock} format={(v) => `#${Math.round(v).toLocaleString()}`} className="display" highlight={false} />
            </span>
          )}
          {s?.addresses.wallet && !s.preview && (
            <a href={addrUrl(84532, s.addresses.wallet)} target="_blank" rel="noreferrer" className="panel link hidden h-9 items-center px-3 tnum no-underline sm:flex">
              Demo wallet {shortHash(s.addresses.wallet)}
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          )}
          <ThemeToggle />
        </div>
      </header>

      <main id="main" className="pt-6">
        {s?.preview && (
          <p className="mb-5 rounded-[4px] border-2 px-4 py-3 text-[0.95rem]" style={{ borderColor: "var(--amber)" }}>
            <b>Preview, not live data.</b> These numbers are illustrative, for designing the page. Remove <code>?preview=1</code> to see the live contracts.
          </p>
        )}
        {error && !s && (
          <p className="mb-5 rounded-[4px] border-2 px-4 py-3" style={{ borderColor: "var(--red)" }}>
            Can&apos;t reach the chains right now ({error}). The page retries every 5 seconds.
          </p>
        )}

        {!s ? (
          <Skeleton />
        ) : !s.deployed ? (
          <NotDeployed />
        ) : (
          <>
            {/* hero: live status, modes, route and allocation */}
            <section aria-labelledby="status-h" className="mb-8">
              <motion.div {...rise(0)}>
                <ModeStrip s={s} />
              </motion.div>
              <motion.h1
                {...rise(1)}
                id="status-h"
                className="display mt-5 max-w-[30ch] text-[clamp(1.6rem,3.6vw,2.6rem)] font-bold leading-[1.15] tracking-[-0.01em]"
              >
                <span className="mr-3 inline-block h-[0.55em] w-[0.55em] translate-y-[-0.08em] rounded-[2px]" style={{ background: toneColor[status!.tone] }} aria-hidden />
                {status!.text}
              </motion.h1>
              {/* announces status changes to screen readers without re-reading the page */}
              <p role="status" className="sr-only">
                {status!.text}
              </p>
              <motion.p {...rise(2)} className="muted mt-3 text-[0.95rem]">
                Last reaction {ago(s.autopilot.lastReactAt, now)}. {s.vault.rebalanceCount} trade{s.vault.rebalanceCount === 1 ? "" : "s"} made by the vault so far.
              </motion.p>
              <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1.75fr)_minmax(0,1fr)]">
                <motion.div {...rise(3)} className="min-w-0">
                  <RouteDisplay s={s} />
                </motion.div>
                <motion.div {...rise(4)} className="min-w-0">
                  <AllocationTape s={s} />
                </motion.div>
              </div>
            </section>

            <div className="space-y-5">
              <Holdings s={s} />
              <div className="grid gap-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
                <FlightLog s={s} now={now} />
                <EventStream s={s} now={now} />
              </div>
              <div className="grid gap-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
                <Recorder s={s} />
                <RangeScale s={s} />
              </div>
              <div className="grid gap-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
                <HowItWorks />
                <Rules s={s} />
              </div>
              <Contracts s={s} />
              {s.errors.length > 0 && (
                <ul className="text-[0.9rem]" style={{ color: "var(--amber)" }}>
                  {s.errors.map((e) => (
                    <li key={e}>{e}</li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </main>

      <footer className="muted mt-12 border-t pt-5 text-[0.85rem] leading-relaxed" style={{ borderColor: "var(--line)" }}>
        Testnet project for the Reactive Omni Buildathon. tETH and tUSD are test tokens with no value, the tracked wallet is a demo wallet, and all activity was created
        to demonstrate the system.{" "}
        <a className="link" href="https://github.com/opxy16/omni-autopilot" target="_blank" rel="noreferrer">
          Source on GitHub
          <span className="sr-only"> (opens in a new tab)</span>
        </a>
        {s?.addresses.wallet && !s.preview && (
          <>
            {", "}
            <a className="link tnum" href={addrUrl(84532, s.addresses.wallet)} target="_blank" rel="noreferrer">
              demo wallet {shortHash(s.addresses.wallet)}
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          </>
        )}
        .
      </footer>
    </div>
  );
}

/** Autopilot mark: a heading bug over a horizon line. */
function Mark() {
  return (
    <svg viewBox="0 0 40 40" className="h-10 w-10" aria-hidden>
      <rect x="1" y="1" width="38" height="38" rx="8" fill="var(--tape-bg)" stroke="var(--line-strong)" />
      <path d="M8 24 H32" stroke="var(--cyan)" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M20 9 l7 9 h-14 z" fill="var(--magenta)" />
      <circle cx="20" cy="29" r="2.5" fill="var(--green)" />
    </svg>
  );
}

function Skeleton() {
  return (
    <div className="space-y-5" aria-busy="true" aria-label="Loading the latest state from the chains">
      <div className="h-10 w-2/3 animate-pulse rounded" style={{ background: "var(--panel-2)" }} />
      <div className="grid gap-5 lg:grid-cols-[1.75fr_1fr]">
        <div className="panel h-[420px] animate-pulse" />
        <div className="panel hidden h-[420px] animate-pulse lg:block" />
      </div>
    </div>
  );
}

function NotDeployed() {
  return (
    <div className="panel p-8 text-center">
      <h1 className="display text-lg font-bold">Contracts not deployed yet</h1>
      <p className="muted mx-auto mt-2 max-w-md text-[0.95rem]">
        Run the deploy steps in the README, then <code>npm run sync-deployments</code>. Meanwhile,{" "}
        <a className="link" href="/?preview=1">
          open the preview
        </a>
        .
      </p>
    </div>
  );
}
