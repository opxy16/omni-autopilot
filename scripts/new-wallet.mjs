#!/usr/bin/env node
// Creates the deploy/demo wallet WITHOUT ever printing the private key.
// The key is written only to contracts/.env (git-ignored); only the address is printed.
//
//   node scripts/new-wallet.mjs
//
// Re-running is safe: if contracts/.env already has a key, it just prints that wallet's address.

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { homedir } from "node:os";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const envPath = join(root, "contracts", ".env");
const castCandidates = [
  process.env.CAST_BIN,
  join(homedir(), ".foundry", "bin", process.platform === "win32" ? "cast.exe" : "cast"),
  "cast",
].filter(Boolean);

function cast(args) {
  for (const bin of castCandidates) {
    try {
      return execFileSync(bin, args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    } catch (e) {
      if (e.code !== "ENOENT") throw new Error(`cast ${args[0]} failed`);
    }
  }
  throw new Error("Foundry's `cast` not found. Install Foundry first.");
}

const existing = existsSync(envPath) ? readFileSync(envPath, "utf8") : "";
const addrLine = existing.match(/^DEPLOYER_ADDRESS=(0x[0-9a-fA-F]{40})$/m);
if (/^PRIVATE_KEY=/m.test(existing)) {
  console.log(`A wallet already exists in contracts/.env`);
  console.log(`Address: ${addrLine ? addrLine[1] : "(unknown — DEPLOYER_ADDRESS missing)"}`);
  process.exit(0);
}

const out = JSON.parse(cast(["wallet", "new", "--json"]));
const w = Array.isArray(out) ? out[0] : out;
const address = w.address;
const key = w.private_key ?? w.privateKey;
if (!/^0x[0-9a-fA-F]{40}$/.test(address) || !/^0x[0-9a-fA-F]{64}$/.test(key)) {
  throw new Error("Unexpected output from `cast wallet new --json`");
}

const block = [
  existing && !existing.endsWith("\n") ? "\n" : "",
  "# Deploy/demo wallet — TESTNETS ONLY. Never commit this file.\n",
  `PRIVATE_KEY=${key}\n`,
  `DEPLOYER_ADDRESS=${address}\n`,
].join("");
if (existing) appendFileSync(envPath, block, { mode: 0o600 });
else writeFileSync(envPath, block, { mode: 0o600 });

console.log("New testnet wallet created; key saved to contracts/.env (git-ignored).");
console.log(`Address: ${address}`);
