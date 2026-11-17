#!/usr/bin/env bash
# Demo actions for Omni Autopilot (testnets only). Each one makes a real origin-chain event;
# the reactive contract on Lasna picks it up within seconds.
#
#   bash scripts/demo.sh status        # what the autopilot sees right now
#   bash scripts/demo.sh gift-eth [n]  # n tETH (default 3) lands in the wallet on Ethereum Sepolia → ETH share jumps → vault sells on Base
#   bash scripts/demo.sh gift-usd [n]  # n tUSD (default 6000) lands in the wallet on Unichain Sepolia → ETH share drops → vault buys on Base
#   bash scripts/demo.sh price-drop    # someone dumps 120 tETH into the Unichain pool → price leaves your LP range → alert on Base
#   bash scripts/demo.sh price-recover # someone buys tETH with 180k tUSD on Unichain → price back in range → alert on Base
#   bash scripts/demo.sh snapshot      # owner asks for a journal snapshot + balance re-sync right now
#   bash scripts/demo.sh cron <100|1000|10000>  # how often the autopilot wakes up (slower = cheaper)
#
# "Someone" in the price demos is a separate market wallet (MARKET_* in contracts/.env): the deployer
# mints test tokens to it, it sells them into the pool and the proceeds go to 0x…dEaD. The tracked
# wallet never moves, so only the price changes.
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root/contracts"
set -a; . ./.env; set +a
C="${CAST_BIN:-$HOME/.foundry/bin/cast}"
LASNA=https://lasna-rpc.rnk.dev/
SINK=0x000000000000000000000000000000000000dEaD
dep() { node -p "require('./deployments/$1.json').$2"; }
AP=$(dep 5318007 autopilot)
WALLET=$(dep 5318007 wallet)

send() { # rpc, to, sig, args...   (KEY_VAR=MARKET_PRIVATE_KEY to send as the market wallet)
  local rpc=$1 to=$2; shift 2
  local extra=()
  [[ "$rpc" == "$LASNA" ]] && extra=(--gas-price 101gwei --priority-gas-price 1gwei)
  local keyvar=${KEY_VAR:-PRIVATE_KEY}
  "$C" send "$to" "$@" --rpc-url "$rpc" --private-key "${!keyvar}" "${extra[@]}" --json |
    node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);const r=j.data??j;console.log(`  tx ${r.transactionHash} (status ${r.status})`)})'
}

case "${1:-status}" in
  status)
    "$C" call "$AP" "portfolio()((uint256,uint256,uint256,uint256,uint16,uint256[3],uint256[3],uint256[3]))" --rpc-url $LASNA |
      node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const n=[...s.matchAll(/(\d+)(?: \[[^\]]*\])?/g)].map(m=>BigInt(m[1]));const f=v=>Number(v)/1e18;console.log(`total $${f(n[3]).toFixed(2)} | ETH share ${(Number(n[4])/100).toFixed(2)}% | price $${f(n[2]).toFixed(2)} | tETH ${f(n[0]).toFixed(4)} | tUSD ${f(n[1]).toFixed(2)}`)})'
    "$C" call "$AP" "status()(bool,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint8,uint256)" --rpc-url $LASNA |
      node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const v=s.trim().split("\n").map(x=>x.split(" ")[0]);console.log(`paused ${v[0]} | reactions ${v[1]} | pending #${v[3]} | rebalances requested ${v[4]} | snapshots ${v[6]} | range state ${["unknown","in","below","above"][v[8]]} | LP price $${(Number(BigInt(v[9]))/1e18).toFixed(2)}`)})'
    ;;
  gift-eth)
    n=${2:-3}; echo "Minting $n tETH to the wallet on Ethereum Sepolia"
    send "$SEPOLIA_RPC" "$(dep 11155111 ethToken)" "mint(address,uint256)" "$WALLET" "$($C to-wei "$n")"
    ;;
  gift-usd)
    n=${2:-6000}; echo "Minting $n tUSD to the wallet on Unichain Sepolia"
    send "$UNICHAIN_SEPOLIA_RPC" "$(dep 1301 usdToken)" "mint(address,uint256)" "$WALLET" "$($C to-wei "$n")"
    ;;
  price-drop | price-recover)
    pool=$(dep 1301 pool)
    if [[ "$1" == price-drop ]]; then tok=$(dep 1301 ethToken); amt=$($C to-wei 120); what="120 tETH"; else tok=$(dep 1301 usdToken); amt=$($C to-wei 180000); what="180,000 tUSD"; fi
    : "${MARKET_ADDRESS:?run: node scripts/new-wallet.mjs MARKET, then fund it with a little Unichain Sepolia ETH}"
    echo "Market wallet sells $what into the Unichain pool (the tracked wallet is not involved)"
    send "$UNICHAIN_SEPOLIA_RPC" "$tok" "mint(address,uint256)" "$MARKET_ADDRESS" "$amt"
    if [[ "$("$C" call "$tok" "allowance(address,address)(uint256)" "$MARKET_ADDRESS" "$pool" --rpc-url "$UNICHAIN_SEPOLIA_RPC" | cut -d' ' -f1)" == "0" ]]; then
      KEY_VAR=MARKET_PRIVATE_KEY send "$UNICHAIN_SEPOLIA_RPC" "$tok" "approve(address,uint256)" "$pool" "$("$C" max-uint)"
    fi
    KEY_VAR=MARKET_PRIVATE_KEY send "$UNICHAIN_SEPOLIA_RPC" "$pool" "swap(address,uint256,uint256,address)" "$tok" "$amt" 0 "$SINK"
    ;;
  snapshot)
    echo "Asking for a snapshot + re-sync now"; send $LASNA "$AP" "snapshotNow()" ;;
  cron)
    echo "Setting cron to every ${2:?blocks} Lasna blocks"; send $LASNA "$AP" "setCronInterval(uint256)" "$2" ;;
  *) echo "unknown action: $1"; exit 1 ;;
esac
