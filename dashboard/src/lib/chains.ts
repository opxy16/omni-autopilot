import { defineChain } from "viem";
import { sepolia, baseSepolia, unichainSepolia } from "viem/chains";

export const lasna = defineChain({
  id: 5318007,
  name: "Reactive Lasna",
  nativeCurrency: { name: "Lasna REACT", symbol: "lREACT", decimals: 18 },
  rpcUrls: { default: { http: ["https://lasna-rpc.rnk.dev/"] } },
  blockExplorers: { default: { name: "Reactscan", url: "https://lasna.reactscan.net" } },
  testnet: true,
});

export type ChainMeta = {
  id: number;
  name: string;
  short: string;
  explorer: string;
  rpc: string;
  color: string; // accent used across the UI
};

const env = (k: string, d: string) => process.env[k] || d;

export const CHAINS: Record<number, ChainMeta> = {
  [sepolia.id]: {
    id: sepolia.id,
    name: "Ethereum Sepolia",
    short: "Sepolia",
    explorer: "https://sepolia.etherscan.io",
    rpc: env("SEPOLIA_RPC", "https://ethereum-sepolia-rpc.publicnode.com"),
    color: "#8b9cff",
  },
  [baseSepolia.id]: {
    id: baseSepolia.id,
    name: "Base Sepolia",
    short: "Base",
    explorer: "https://sepolia.basescan.org",
    rpc: env("BASE_SEPOLIA_RPC", "https://sepolia.base.org"),
    color: "#3b82f6",
  },
  [unichainSepolia.id]: {
    id: unichainSepolia.id,
    name: "Unichain Sepolia",
    short: "Unichain",
    explorer: "https://sepolia.uniscan.xyz",
    rpc: env("UNICHAIN_SEPOLIA_RPC", "https://sepolia.unichain.org"),
    color: "#f50db4",
  },
  [lasna.id]: {
    id: lasna.id,
    name: "Reactive Lasna",
    short: "Lasna",
    explorer: "https://lasna.reactscan.net",
    rpc: env("LASNA_RPC", "https://lasna-rpc.rnk.dev/"),
    color: "#2de2a6",
  },
};

export const ORIGIN_ORDER = [sepolia.id, baseSepolia.id, unichainSepolia.id] as const;
export const VIEM_CHAINS = { [sepolia.id]: sepolia, [baseSepolia.id]: baseSepolia, [unichainSepolia.id]: unichainSepolia, [lasna.id]: lasna } as const;

export const txUrl = (chainId: number, hash: string) => `${CHAINS[chainId]?.explorer ?? ""}/tx/${hash}`;
export const addrUrl = (chainId: number, a: string) => `${CHAINS[chainId]?.explorer ?? ""}/address/${a}`;
