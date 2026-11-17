import { parseAbi } from "viem";

export const autopilotAbi = parseAbi([
  "struct Portfolio { uint256 ethUnits; uint256 usdUnits; uint256 priceE18; uint256 totalUsd; uint16 ethShareBps; uint256[3] chainEth; uint256[3] chainUsd; uint256[3] chainValueUsd; }",
  "function portfolio() view returns (Portfolio)",
  "function status() view returns (bool paused, uint256 reactCount, uint256 lastReactAt, uint256 pendingNonce, uint256 nonce, uint256 lastRebalanceAt, uint256 snapshotCount, uint256 lastSnapshotAt, uint8 rangeState, uint256 lpPriceE18)",
  "function rules() view returns (uint16 targetEthBps, uint16 bandBps, uint16 slippageBps, uint32 cooldown, uint32 pendingTimeout, uint256 minTradeUsd)",
  "function lpLowerE18() view returns (uint256)",
  "function lpUpperE18() view returns (uint256)",
  "function snapshotInterval() view returns (uint32)",
  "function wallet() view returns (address)",
  "function vault() view returns (address)",
  "function journal() view returns (address)",
  "function beaconOf(uint256) view returns (address)",
  "function ethPriceE18() view returns (uint256)",
  "event HoldingChanged(uint256 indexed chainId, address indexed token, address indexed holder, uint256 balance, uint256 originTx)",
  "event PriceUpdated(uint256 indexed chainId, address indexed pool, uint256 priceE18, uint256 originTx)",
  "event RebalanceRequested(uint256 indexed nonce, bool sellEth, uint256 amountIn, uint256 minOut, uint16 ethShareBps, uint256 originChainId, uint256 originTx)",
  "event RebalanceSettled(uint256 indexed nonce, bool executed, uint256 originTx)",
  "event RangeAlertRequested(uint8 indexed kind, uint256 priceE18, uint256 lowerE18, uint256 upperE18, uint256 originChainId, uint256 originTx)",
  "event SnapshotRequested(uint256 indexed id, uint256 totalUsd, uint16 ethShareBps)",
  "event ResyncRequested(uint256 indexed chainId, address beacon)",
  "event CallbackLanded(uint8 indexed kind, uint256 indexed id, uint256 chainId, uint256 destTx)",
]);

export const journalAbi = parseAbi([
  "struct Snapshot { uint64 timestamp; uint64 lasnaBlock; uint256 totalUsd; uint256 ethUnits; uint256 usdUnits; uint256 priceE18; uint16 ethShareBps; uint16 targetBps; uint256[3] chainValueUsd; }",
  "struct Alert { uint64 timestamp; uint8 kind; uint256 priceE18; uint256 lowerE18; uint256 upperE18; }",
  "function latestSnapshots(uint256 limit) view returns (Snapshot[])",
  "function latestAlerts(uint256 limit) view returns (Alert[])",
  "function snapshotCount() view returns (uint256)",
  "function alertCount() view returns (uint256)",
]);

export const vaultAbi = parseAbi([
  "function holdings() view returns (uint256 eth, uint256 usd)",
  "function rebalanceCount() view returns (uint256)",
  "function lastRebalanceAt() view returns (uint256)",
  "function minInterval() view returns (uint256)",
  "function paused() view returns (bool)",
]);

export const systemAbi = parseAbi(["function debt(address) view returns (uint256)", "function reserves(address) view returns (uint256)"]);
