# 🌱 Seedling

**Allowance that grows.** A Solana protocol where parents deposit USDC once into a pooled vault, the vault lends on Kamino at ~8% APY, and the kid receives a monthly allowance on the 1st plus a year-end yield bonus.

> Built solo for [Colosseum Frontier](https://www.colosseum.com/) by [@seedling_sol](https://twitter.com/seedling_sol). Target submission **May 8, 2026**.

---

## How it works

1. **Parent deposits USDC** once. Vault CPIs into Kamino's USDC reserve, receives cTokens that appreciate as borrowers pay interest.
2. **Monthly allowance** lands on the kid's wallet on the 1st of each month. Drawdown is principal-first: the kid spends the deposited principal, then yield once principal exhausts. 30-day on-chain time gate prevents abuse.
3. **Year-end bonus** sweeps accumulated yield (everything above remaining principal) to the kid in one payout. The "13th allowance" — period-end yield, not principal.
4. **Protocol takes 10%** of yield at every cToken-redeeming event (withdraw, monthly distribute, bonus). Aligned incentive: Seedling earns when families earn.

---

## Status

**Days used:** 7 of 19. **Submission target:** May 8, 2026.

- **5 core instructions shipped** end-to-end:
  - `initialize_vault` · `create_family` · `deposit` · `withdraw` · `distribute_monthly_allowance` · `distribute_bonus`
  - Plus 2 admin helpers: `set_family_last_distribution`, `roll_period`
- **33 tests green** (21 Rust unit on math + 12 anchor integration on constraints)
- **4 end-to-end flows verified on mainnet-fork** (Surfpool with real Kamino state):
  - Deposit precision regression test (Path B share-math drift < 100 bps)
  - Withdraw round-trip
  - Monthly allowance distribute
  - Bonus distribute
- **Live on Solana devnet:**
  - Program: [`44vix4JmG4hdoharDH38R5sc7g5MbFxjvpUpgwNDbTYN`](https://solscan.io/account/44vix4JmG4hdoharDH38R5sc7g5MbFxjvpUpgwNDbTYN?cluster=devnet)
  - Vault initialized: [`sok5s1DA…sdRj`](https://solscan.io/tx/sok5s1DAfzDvVCR4p3S8ohZhiRmFrEu75BHvu9wLU9D31sjcXeBFZs4khd9sdygeZAVnEeXfkidCbmWkX4odsRj?cluster=devnet)
  - Smoke deposit (1 USDC → 1M shares): [`58xM1dka…FJ7m`](https://solscan.io/tx/58xM1dkagiDwzSHir6nbtPagECF4vZ4RZ1tPEw9u5BPmD4FzhaqemJdafx4D8kZXs75XsbgyfQuYbJ8EPZgiFJ7m?cluster=devnet)
- Reserve-agnostic by design — verified on **mainnet** (Kamino USDC reserve uses Scope) and **devnet** (uses Pyth). Oracle pubkeys cached on `VaultConfig` at init, validated on every CPI.

**Not yet shipped:** parent dashboard, deposit/withdraw forms, kid view, demo video. Frontend scaffold + wallet-adapter live; dashboard wiring is Day 8.

---

## Quick start

### Prerequisites

- Solana CLI 3.1+, Anchor 0.32.1 (`avm use 0.32.1`), Rust stable, Node 20+
- Phantom or Solflare wallet, configured for devnet
- ~0.5 SOL on devnet (`solana airdrop 1 --url devnet`)
- ~5 USDC devnet from [Circle's faucet](https://faucet.circle.com)

### Anchor program

```bash
anchor build
anchor test                 # local-validator integration tests
cargo test --lib            # pure-Rust math unit tests
```

### End-to-end on Surfpool mainnet-fork

```bash
# In one terminal:
surfpool start --network mainnet --no-tui

# In another:
anchor deploy --provider.cluster http://127.0.0.1:8899
ANCHOR_WALLET=~/.config/solana/id.json \
  ANCHOR_PROVIDER_URL=http://127.0.0.1:8899 \
  npx tsx scripts/surfpool-deposit-precision.ts
```

Other e2e scripts in `scripts/`: `surfpool-withdraw-e2e.ts`, `surfpool-distribute-e2e.ts`, `surfpool-bonus-e2e.ts`.

### Frontend (devnet)

```bash
cd frontend
npm install
npm run dev    # http://localhost:3000
```

---

## Architecture

```
parent wallet
     │ USDC
     ▼
┌─────────────────────────────────────────┐
│  Seedling Anchor program                │
│                                         │
│  ┌──────────────┐    ┌────────────────┐ │
│  │ VaultConfig  │    │ FamilyPosition │ │  ←── PDAs, ERC-4626-style shares
│  │  + cached    │    │  · shares      │ │
│  │    oracles   │    │  · principal_* │ │
│  │  + cTokens   │    │  · last_dist   │ │
│  └──────────────┘    └────────────────┘ │
│         │                                │
└─────────┼────────────────────────────────┘
          │ deposit_reserve_liquidity / redeem_reserve_collateral
          ▼
   Kamino klend (mainnet+devnet)
          │
          ▼
        ~8% APY USDC lending market
```

- **Vault is reserve-agnostic.** Kamino reserve pubkey + oracle config cached on `VaultConfig` at `initialize_vault`. Address-validated on every subsequent CPI. Same program runs against mainnet's Scope-only USDC reserve and devnet's Pyth-only reserve without code changes.
- **Shares math follows kvault pattern.** Floor-on-mint, floor-on-redeem, ceil-on-target-asset withdrawal. First-depositor donation-attack defense via inflation guard (Path A — refuse if `total_shares == 0` and `total_assets_pre > 0`). No virtual offset field needed.
- **Path B exchange-rate** computes `total_assets = cTokens × (supply_vault + borrowed_amount_sf >> 60) / ctoken_supply` directly from observable accounts. Avoids deserializing klend's 8624-byte `Reserve` struct, stays robust across Kamino struct changes.
- **Fees collected at cToken-redeeming events only** (withdraw, distribute_*). Day-3 design that skimmed fees from `vault_usdc_ata` at deposit was caught by the Day-5 precision regression test — Kamino sweeps that ATA clean on every deposit.

Detailed spec: [`SEEDLING_MASTER_DOC.md`](SEEDLING_MASTER_DOC.md).

---

## Repository layout

```
.
├── programs/seedling/           # Anchor program (Rust)
│   └── src/
│       ├── lib.rs               # entrypoints
│       ├── state/               # VaultConfig, FamilyPosition, KidView
│       ├── instructions/        # 5 core + 2 admin
│       ├── utils/               # share math + harvest helpers
│       ├── events.rs            # 6 event types
│       └── errors.rs
├── frontend/                    # Next.js 16 + wallet-adapter (Day 7+)
├── tests/                       # anchor test integration (constraint failures)
├── scripts/                     # Surfpool e2e + devnet ops scripts
├── SEEDLING_MASTER_DOC.md       # 1100+ line spec, kept in lockstep with code
├── GOTCHAS.md                   # 19 hard-won pitfalls (Anchor, Kamino, devnet)
└── README.md                    # this file
```

---

## Credits

Built on:
- **[Kamino klend](https://github.com/Kamino-Finance/klend)** for the lending CPI (Apache 2.0)
- **[Solana Vault Standard](https://github.com/solanabr/solana-vault-standard)** patterns — author of SVS-5 and SVS-6
- **[Anchor](https://github.com/coral-xyz/anchor)** 0.32.1
- **[Surfpool](https://github.com/txtx/surfpool)** for mainnet-fork integration testing

Verified against **klend v1.18.0** on Solana mainnet + devnet.

---

## Contact

- **Founder:** Vicenzo Tulio · Brazil · 16 · @seedling_sol
- **Twitter:** [@seedling_sol](https://twitter.com/seedling_sol)
- **Hackathon:** Colosseum Frontier (Apr 6 – May 11, 2026)
- **License:** Apache 2.0

> Seedling. Deposit once. Let it grow. 🌱
