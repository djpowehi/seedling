# 🌱 Seedling

**Allowance that grows.** A Solana protocol where parents deposit USDC once into a pooled vault, the vault lends on Kamino at ~8% APY, and the kid receives a monthly allowance plus a year-end yield bonus — the *décimo terceiro* every Brazilian knows, but on-chain.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Live on devnet](https://img.shields.io/badge/Solana-devnet-brightgreen)](https://solscan.io/account/44vix4JmG4hdoharDH38R5sc7g5MbFxjvpUpgwNDbTYN?cluster=devnet)
[![Live site](https://img.shields.io/badge/site-seedlingsol.xyz-blue)](https://seedlingsol.xyz)

- **Live product** → [**seedlingsol.xyz**](https://seedlingsol.xyz)
- **Pitch deck** → [`Seedling — allowance that grows.pdf`](./Seedling%20—%20allowance%20that%20grows.pdf)
- **Program ID** → [`44vix4JmG4hdoharDH38R5sc7g5MbFxjvpUpgwNDbTYN`](https://solscan.io/account/44vix4JmG4hdoharDH38R5sc7g5MbFxjvpUpgwNDbTYN?cluster=devnet) *(devnet live · mainnet flip pending)*

---

## Status

**Hackathon:** Colosseum Frontier 2026 (Apr 6 – May 12, 2026 · noon close)

**Submission tracks:** Consumer Apps (primary) · Public Goods Award · University Award

| | |
|---|---|
| **Network** | Live on Solana devnet · mainnet deploy queued (gated on 4P Pix activation) |
| **Program** | `44vix4JmG4hdoharDH38R5sc7g5MbFxjvpUpgwNDbTYN` *(same address on both clusters)* |
| **Framework** | Quasar (Pinocchio-based, single-byte discriminators, `no_std`) |
| **Yield engine** | Kamino klend — verified against **klend v1.18.0** on mainnet + devnet |
| **Frontend** | Next.js · Privy embedded wallets · 4P Finance Pix on/off-ramp |
| **Authority** | `6Wk8mM3DX5nv6naY4webfKe7ntdJagQpwtGaJcfvc56K` |
| **Vault initialized** | [`sok5s1DA…sdRj`](https://solscan.io/tx/sok5s1DAfzDvVCR4p3S8ohZhiRmFrEu75BHvu9wLU9D31sjcXeBFZs4khd9sdygeZAVnEeXfkidCbmWkX4odsRj?cluster=devnet) |

---

## What it does

1. **Parent funds the vault in USDC.** One deposit; the vault CPIs into Kamino's USDC reserve and receives interest-bearing cTokens. No subscriptions.
2. **Allowance arrives on the 1st of every month.** Drawdown is principal-first (kid spends the principal, then yield once principal exhausts). A 30-day on-chain time gate prevents abuse.
3. **Year-end bonus** sweeps accumulated yield (everything above remaining principal) to the kid in one payout — the *13th allowance*. Pure yield by construction.
4. **Protocol earns 10% of yield** at every cToken-redeeming event (withdraw, monthly distribute, bonus). Aligned incentive: Seedling earns when families earn. Deposits are fee-free by mechanism.
5. **Parent custody, kid never signs — by architecture.** The kid identifier is a 32-byte client-generated address that owns nothing on-chain. The parent retains custody of the principal at all times; yield is gifted at distribution. Kids hold a read-only `KidView` PDA so the kid-facing URL is canonical and shareable but cannot move funds.

The on-chain program currently exposes **12 instructions** — 6 user-facing (`initialize_vault`, `create_family`, `deposit`, `withdraw`, `distribute_monthly_allowance`, `distribute_bonus`), `close_family` for cleanup, plus 5 admin/operations helpers (`set_family_last_distribution`, `roll_period`, `set_paused`, `payout_kid`, `set_stream_rate`).

---

## Standards & ecosystem contributions

- **[SVS-5 — Streaming Yield Vault Standard](https://github.com/solanabr/solana-vault-standard)** · authored by Vicenzo, merged into the Solana Vault Standard repo. Defines the streaming-distribution + 13th-bonus pattern Seedling is built on.
- **SVS-6** · authored, merged in the same repo. Extends SVS-5 with parent-custody semantics for the kid-never-signs model.
- **1st place** at the *Extend the Solana Vault Standard* bounty during the contribution window.
- Sponsor-relay + lazy-creation patterns are reusable primitives — open-source MIT, intended as gifts to other Pix-native or family-facing builders on Solana.

---

## Architecture

```
parent (Privy or self-custody wallet)
        │ USDC
        ▼
┌──────────────────────────────────────────────────┐
│  Quasar program — 12 instructions (Pinocchio)    │
│                                                  │
│  ┌──────────────┐    ┌────────────────┐          │
│  │ VaultConfig  │    │ FamilyPosition │          │  ← shares pattern (kvault)
│  │  · oracles   │    │  · shares      │          │
│  │    cached    │    │  · principal_* │          │
│  │  · period_id │    │  · last_dist   │          │
│  │  · cTokens   │    │  · bump        │          │
│  └──────┬───────┘    └────────────────┘          │
│         │                                        │
│         │  PDA seed: "vault_config_v2"           │
│         │  Family seed: "family_v3" + parent+kid │
└─────────┼────────────────────────────────────────┘
          │ deposit_reserve_liquidity / redeem_reserve_collateral
          ▼
   Kamino klend  (mainnet · devnet)
          │
          ▼
   ~8% APY USDC lending market
```

**Frontend & runtime layers:**

```
┌──── parent UX ─────────────┐    ┌──── kid UX ────────────────────┐
│ Privy embedded wallet      │    │ /kid/<familyPda> — public,     │
│   (Google login, no seed   │    │   wallet-free, read-only       │
│   phrase)                  │    │   12-stage tree visualization  │
│                            │    │   countdowns + savings goals   │
│ + Phantom/Solflare for     │    │   bonus-ready celebration      │
│   self-custody parents     │    │   (halo + falling petals)      │
└────────────┬───────────────┘    └────────────────────────────────┘
             │
             ▼
   Sponsor relay endpoint        ← covers gas for first-time families
   /api/sponsor-broadcast        ← supports atomic [create_family + deposit]
                                    bundle for lazy creation
             │
             ▼
   4P Finance — Brazilian Pix    ← R$ → USDC (and back)
   /api/4p/onramp                ← signed webhook on USDC delivery
   /api/4p/webhook
             │
             ▼
   Hot wallet → parent's USDC ATA  ← idempotent, on-chain memo
                                     (`cid:<customId>`) for replay
                                     protection
```

**Design notes:**

- **Reserve-agnostic.** Kamino reserve pubkey + per-reserve oracle config cached on `VaultConfig` at `initialize_vault`. Address-validated on every subsequent CPI. Same program runs against mainnet's Scope-only USDC reserve and devnet's Pyth-only reserve without code changes.
- **kvault share math.** Floor-on-mint, floor-on-redeem, ceil-on-target-asset. First-depositor donation-attack defense via Path A inflation guard. No virtual-offset field.
- **Path B exchange-rate** computes `total_assets = cTokens × (supply_vault + borrowed_amount_sf >> 60) / ctoken_supply` directly from observable accounts. Avoids deserializing klend's 8624-byte `Reserve`.
- **Fees collected at cToken-redeeming events only** (withdraw + both distributes). Deposit is fee-free by mechanism — Day-3 design that skimmed fees from `vault_usdc_ata` at deposit was caught by the Day-5 precision regression test.
- **Lazy family creation.** Parents can add a kid without paying rent until the first deposit. Drafts live in `localStorage`; the deposit transaction bundles `[create_family + deposit]` atomically through the sponsor-relay endpoint.

Detailed spec: [`SEEDLING_MASTER_DOC.md`](SEEDLING_MASTER_DOC.md). Hard-won pitfalls: [`GOTCHAS.md`](GOTCHAS.md).

---

## Quick start

### Prerequisites

- Solana CLI 3.1+ · Rust stable · Node 20+
- Phantom or Solflare wallet, configured for devnet *(Privy login also works on the live site)*
- ~0.5 SOL on devnet (`solana airdrop 1 --url devnet`)
- ~5 USDC devnet from [Circle's faucet](https://faucet.circle.com)

### Build the on-chain program

```bash
cd programs/seedling-quasar
cargo build-sbf
```

Quasar is Pinocchio-based — Anchor's CLI (`anchor build`, `anchor test`) does not apply. Build artifacts land in `target/deploy/seedling_quasar.so`.

### Run the frontend

```bash
cd frontend
npm install
npm run dev    # http://localhost:3000
```

Required env vars: `NEXT_PUBLIC_PRIVY_APP_ID`, `FOURP_*` (4P Pix credentials), `SEEDLING_HOT_WALLET_SECRET_KEY`, `HELIUS_RPC_URL`. See `frontend/.env.example`.

### Demo data prep

```bash
ANCHOR_WALLET=~/.config/solana/id.json \
  ANCHOR_PROVIDER_URL=https://api.devnet.solana.com \
  npx tsx scripts/demo-prep.ts
```

Backdates `last_distribution` 31 days + rolls bonus period 1 day backward so both the monthly and 13th allowance buttons are clickable in the demo flow.

### End-to-end on Surfpool mainnet-fork

```bash
# Terminal 1
surfpool start --network mainnet --no-tui

# Terminal 2
solana program deploy --url http://127.0.0.1:8899 target/deploy/seedling_quasar.so
ANCHOR_WALLET=~/.config/solana/id.json \
  ANCHOR_PROVIDER_URL=http://127.0.0.1:8899 \
  npx tsx scripts/surfpool-deposit-precision.ts
```

Other e2e scripts in `scripts/`: `surfpool-withdraw-e2e.ts`, `surfpool-distribute-e2e.ts`, `surfpool-bonus-e2e.ts`.

---

## Repository layout

```
.
├── programs/
│   ├── seedling-quasar/          # Quasar/Pinocchio program — production
│   │   └── src/
│   │       ├── lib.rs            # 12-instruction dispatcher
│   │       ├── state.rs          # VaultConfig, FamilyPosition, KidView
│   │       ├── instructions/     # admin, deposit, withdraw, distribute…
│   │       ├── utils/            # share math + harvest helpers
│   │       ├── events.rs         # event types
│   │       └── errors.rs
│   └── seedling/                 # Anchor reference impl (pre-Day-11) — kept for diffing
├── frontend/                     # Next.js · React · TypeScript
│   ├── app/                      # routes
│   │   ├── api/
│   │   │   ├── 4p/               # Pix on-ramp, webhook, sweep
│   │   │   └── sponsor-broadcast/ # atomic [create_family + deposit] relay
│   │   ├── dashboard/            # parent — two-layer account view
│   │   └── kid/[familyPda]/      # public kid view (no wallet required)
│   ├── components/
│   │   ├── dashboard/            # ParentAccountSection, FamilyCard, …
│   │   ├── PixDepositForm.tsx    # Pix QR + polling
│   │   ├── TopUpAccountModal.tsx # USDC top-up tutorial (non-crypto-friendly)
│   │   └── KidView.tsx           # 12-stage tree + bonus celebration
│   └── lib/
│       ├── quasar-client.ts      # 12-instruction TS client
│       ├── hotWallet.ts          # server-only: signs + sends USDC transfers
│       ├── fourp.ts              # 4P Finance API wrapper
│       ├── draftFamilies.ts      # localStorage drafts (lazy creation)
│       ├── fetchFamilies.ts      # merged on-chain + draft view
│       └── i18n.tsx              # PT-BR + EN
├── tests/                        # LiteSVM + integration tests
├── scripts/                      # Surfpool e2e + devnet ops + demo-prep
├── docs/4p-finance-api.md        # 4P Pix integration reference
├── SEEDLING_MASTER_DOC.md        # 1100+ line spec, kept in lockstep with code
├── GOTCHAS.md                    # hard-won pitfalls (Quasar, Kamino, devnet, 4P)
├── LICENSE                       # MIT
└── README.md
```

---

## Dependencies & third-party code

Per Section 9 of the Frontier rules — full disclosure:

| Layer | Dependency | License | Role |
|---|---|---|---|
| On-chain | [Pinocchio](https://github.com/anza-xyz/pinocchio) | Apache 2.0 | Solana program framework — single-byte discriminators, zero-copy account access, no_std |
| On-chain | [Quasar](https://github.com/quasar-lang/quasar) (`quasar-lang`) | Apache 2.0 | Pinocchio-based authoring layer — derive macros for accounts, dispatcher, event emission |
| On-chain CPI | [Kamino klend](https://github.com/Kamino-Finance/klend) v1.18.0 | Apache 2.0 | USDC lending market — yield engine via `deposit_reserve_liquidity` / `redeem_reserve_collateral` |
| On-chain runtime | [zeropod](https://github.com/anza-xyz/zeropod), [wincode](https://crates.io/crates/wincode) | Apache 2.0 / MIT | Zero-copy serialization helpers used by Quasar |
| Frontend wallet | [Privy SDK](https://github.com/privy-io/privy-js) | MIT | Embedded wallet UX — Google login, no seed phrase ([showWalletUIs: false](https://docs.privy.io)) |
| Frontend wallet | [Solana wallet adapter](https://github.com/anza-xyz/wallet-adapter) | Apache 2.0 | Phantom / Solflare support for self-custody parents |
| Frontend SDK | [@coral-xyz/anchor](https://github.com/coral-xyz/anchor) | Apache 2.0 | **Event coder only** — used to decode emitted events. We do not use the Anchor program client (which assumes 8-byte discriminators); all instruction construction is manual via `quasar-client.ts`. |
| Frontend SDK | [@solana/web3.js](https://github.com/anza-xyz/solana-web3.js) (1.x) | Apache 2.0 | RPC + transaction building |
| Frontend infra | [Helius RPC](https://www.helius.dev/) | commercial (free tier) | Devnet RPC + token-account indexing |
| Off-chain integration | [4P Finance API](https://4p.finance) | commercial | Brazilian Pix on-ramp + off-ramp (R$ ↔ USDC delivery to/from a hot wallet) |
| Testing | [Surfpool](https://github.com/txtx/surfpool) | Apache 2.0 | Local mainnet-fork validator with JIT account fetch |
| Testing | [LiteSVM](https://github.com/LiteSVM/litesvm) | Apache 2.0 | In-process Solana VM for fast unit-style integration tests |
| Frontend | [Next.js](https://github.com/vercel/next.js), Tailwind | MIT | UI framework + styling |

No oracles or AI/ML services in the runtime path. No tokens minted by Seedling itself. No NFTs (yet — see roadmap).

---

## Hackathon submission

**Submitted to Colosseum Frontier 2026 — three tracks:**

- **Consumer Apps** (primary) — UX, Pix-native onboarding, two-layer dashboard, kid view tree gamification, parent-custody architecture
- **Public Goods Award** — open-source MIT · SVS-5 + SVS-6 standards authored and merged · sponsor-relay + lazy-creation patterns reusable by other builders
- **University Award** — eligibility-confirmed, applies on author's status

Submission window: **May 11–12, 2026** (close: noon UTC May 12).

---

## Credits

Built solo by **Vicenzo Tulio** (16 · Brazil · [@seedling_sol](https://twitter.com/seedling_sol)).

Special thanks to **Superteam Brazil** for early adopter parents + the SVS standards collaboration, and **Colosseum** for the Frontier program and the University Award eligibility waiver.

Brand and visual system inspired by the patient-cultivation / bonsai aesthetic — every UX choice tries to embody *"compounding by letting kids live it."*

---

## License

[MIT](LICENSE) © 2026 Superteam Brazil

> Seedling. Deposit once. Let it grow. 🌱
