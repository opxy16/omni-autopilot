export type Hex = `0x${string}`;

export type Leg = { chainId: number; tx: Hex; time?: number };

export type LoopKind = "rebalance" | "alert" | "snapshot";

/** One full Reactive loop: origin event → reactive tx on Lasna → callback on the destination. */
export type Loop = {
  kind: LoopKind;
  key: string;
  title: string;
  detail: string;
  origin?: Leg;
  reactive: Leg;
  callback?: Leg & { ok: boolean };
  /** seconds from origin block to reactive block, and from reactive block to callback block */
  reactSecs?: number;
  callbackSecs?: number;
};

export type FeedItem = {
  key: string;
  kind: "holding" | "price" | "rebalance" | "settled" | "alert" | "snapshot" | "resync" | "landed";
  text: string;
  chainId?: number;
  lasnaTx: Hex;
  lasnaBlock: number;
  time?: number;
};

export type ChainHolding = { chainId: number; eth: number; usd: number; valueUsd: number };

export type Snapshot = {
  timestamp: number;
  totalUsd: number;
  ethShare: number; // 0..1
  target: number;
  price: number;
  chainValueUsd: number[];
};

export type AlertRow = { timestamp: number; kind: number; price: number; lower: number; upper: number };

export type DashState = {
  deployed: boolean;
  preview?: boolean;
  fetchedAt: number;
  addresses: {
    autopilot?: Hex;
    wallet?: Hex;
    vault?: Hex;
    journal?: Hex;
    beacons: Record<number, Hex | undefined>;
    tokens: Record<number, { eth?: Hex; usd?: Hex; pool?: Hex }>;
  };
  lasnaBlock: number;
  autopilot: {
    paused: boolean;
    reactCount: number;
    lastReactAt: number;
    pendingNonce: number;
    nonce: number;
    lastRebalanceAt: number;
    snapshotCount: number;
    lastSnapshotAt: number;
    rangeState: number; // 0 unknown, 1 in, 2 below, 3 above
    lpPrice: number;
    rangeLower: number;
    rangeUpper: number;
    targetShare: number;
    band: number;
    slippage: number;
    cooldown: number;
    snapshotInterval: number;
    funds?: number; // lREACT balance of the reactive contract
    debt?: number;
  };
  portfolio: {
    ethUnits: number;
    usdUnits: number;
    price: number;
    totalUsd: number;
    ethShare: number;
    chains: ChainHolding[];
  };
  vault: { eth: number; usd: number; rebalanceCount: number; lastRebalanceAt: number };
  snapshots: Snapshot[];
  alerts: AlertRow[];
  loops: Loop[];
  feed: FeedItem[];
  errors: string[];
};
