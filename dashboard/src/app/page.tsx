"use client";

import { motion } from "framer-motion";
import { useDashState, useNow } from "@/components/useDashState";
import { Hero } from "@/components/Hero";
import { ChainCards, RangeCard } from "@/components/Chains";
import { ActivityFeed, LoopTimeline } from "@/components/Loops";
import { HistoryChart } from "@/components/History";
import { Contracts, HowItWorks, RulesCard } from "@/components/Explain";
import { AnimatedNumber, Pill } from "@/components/primitives";
import { addrUrl } from "@/lib/chains";
import { shortHash } from "@/lib/format";

export default function Page() {
  const { state: s, error } = useDashState(5000);
  const now = useNow();

  return (
    <main className="mx-auto max-w-6xl px-4 pb-16 pt-6 sm:px-6 sm:pt-10">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Logo />
          <div>
            <div className="text-lg font-semibold tracking-tight">Omni Autopilot</div>
            <div className="text-xs text-white/45">Set it and forget it · powered by Reactive Omni</div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {s?.deployed && (
            <span className="glass flex items-center gap-2 !rounded-full px-3 py-1.5 text-xs">
              <span className="pulse-dot h-2 w-2 rounded-full bg-react" />
              Watching 3 chains · Lasna block{" "}
              <AnimatedNumber value={s.lasnaBlock} format={(v) => `#${Math.round(v).toLocaleString()}`} className="font-mono" />
            </span>
          )}
          {s?.addresses.wallet && !s.preview && (
            <a
              href={addrUrl(84532, s.addresses.wallet)}
              target="_blank"
              rel="noreferrer"
              className="glass !rounded-full px-3 py-1.5 font-mono text-xs text-white/70 hover:text-react"
            >
              demo wallet {shortHash(s.addresses.wallet)}
            </a>
          )}
        </div>
      </header>

      {s?.preview && (
        <div className="mb-5 rounded-2xl border border-amber-300/30 bg-amber-300/10 px-4 py-3 text-sm text-amber-100">
          <b>Preview — not live data.</b> These numbers are illustrative, for designing the page. Remove <code>?preview=1</code> to see the live contracts.
        </div>
      )}
      {error && !s && (
        <div className="mb-5 rounded-2xl border border-rose-400/30 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">Couldn&apos;t reach the chains: {error}</div>
      )}

      {!s ? (
        <Skeleton />
      ) : !s.deployed ? (
        <NotDeployed />
      ) : (
        <div className="space-y-5">
          <Hero s={s} now={now} />
          <ChainCards s={s} />
          <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
            <LoopTimeline s={s} now={now} />
            <ActivityFeed s={s} now={now} />
          </div>
          <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
            <HistoryChart s={s} />
            <RangeCard s={s} />
          </div>
          <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
            <HowItWorks />
            <RulesCard s={s} />
          </div>
          <Contracts s={s} />
          {s.errors.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {s.errors.map((e) => (
                <Pill key={e} tone="warn">
                  {e}
                </Pill>
              ))}
            </div>
          )}
        </div>
      )}

      <footer className="mt-12 text-center text-xs leading-relaxed text-white/35">
        Testnet project for the Reactive Omni Buildathon. tETH and tUSD are test tokens with no value; the tracked wallet is a demo wallet.
        <br />
        Contracts: Reactive Lasna · Ethereum Sepolia · Base Sepolia · Unichain Sepolia.
      </footer>
    </main>
  );
}

function Logo() {
  return (
    <motion.div
      className="relative grid h-10 w-10 place-items-center rounded-2xl bg-gradient-to-br from-violet to-react"
      animate={{ rotate: [0, 6, -6, 0] }}
      transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
    >
      <svg viewBox="0 0 24 24" className="h-5 w-5 text-ink" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden>
        <circle cx="12" cy="12" r="3" />
        <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" />
      </svg>
    </motion.div>
  );
}

function Skeleton() {
  return (
    <div className="space-y-5">
      {[260, 180, 320].map((h, i) => (
        <div key={i} className="glass animate-pulse" style={{ height: h }} />
      ))}
    </div>
  );
}

function NotDeployed() {
  return (
    <div className="glass p-8 text-center">
      <div className="text-lg font-semibold">Contracts not deployed yet</div>
      <p className="mx-auto mt-2 max-w-md text-sm text-white/55">
        Run the deploy steps in the README, then <code>npm run sync-deployments</code>. Meanwhile, open{" "}
        <a className="text-react underline" href="/?preview=1">
          the preview
        </a>
        .
      </p>
    </div>
  );
}
