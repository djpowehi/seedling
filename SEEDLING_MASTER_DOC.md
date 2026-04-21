# Seedling — Master Project Document

**Last updated:** April 19, 2026
**Target submission:** May 8, 2026 (Frontier hackathon deadline May 11 — never submit on final day)
**Status:** Pre-coding. Deck complete. Architecture locked. Ready to build.

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [The Problem & Solution](#2-the-problem--solution)
3. [Hackathon Context](#3-hackathon-context)
4. [Architecture — Locked Decisions](#4-architecture--locked-decisions)
5. [Technical Stack](#5-technical-stack)
6. [Data Model](#6-data-model)
7. [Anchor Program Instructions](#7-anchor-program-instructions)
8. [Kamino Integration](#8-kamino-integration)
9. [SVS-5 Integration](#9-svs-5-integration)
10. [Frontend Specification](#10-frontend-specification)
11. [Repository Structure](#11-repository-structure)
12. [Weekly Schedule](#12-weekly-schedule)
13. [The Three Rules](#13-the-three-rules)
14. [Testing Strategy](#14-testing-strategy)
15. [Deployment Plan](#15-deployment-plan)
16. [Submission Checklist](#16-submission-checklist)
17. [Pitch Deck Summary](#17-pitch-deck-summary)
18. [Narration Script](#18-narration-script)
19. [Video Recording Plan](#19-video-recording-plan)
20. [Key Reference Data](#20-key-reference-data)
21. [Q&A Preparation](#21-qa-preparation)
22. [Post-Hackathon Roadmap](#22-post-hackathon-roadmap)
23. [Risk Register](#23-risk-register)
24. [Founder Notes](#24-founder-notes)

---

## 1. Project Overview

**Name:** Seedling
**Tagline:** Allowance that grows
**One-liner:** A Solana protocol that lets parents deposit USDC once, streams yield-bearing allowance to their kids continuously, and accumulates a summer bonus from DeFi yield.
**Category:** Consumer fintech / PayFi / DeFi
**Target hackathon:** Colosseum Frontier Hackathon (April 6 – May 11, 2026)
**Founder:** Vincenzo Tulio, 16 years old, Brazil
**Domain:** seedlingsol.xyz
**X/Twitter:** @seedling_sol
**Age eligibility:** Approved by Colosseum (obtained via hello@colosseum.com)

---

## 2. The Problem & Solution

### Problem

- 71% of US parents with kids 5–17 give allowance (Wells Fargo, 2025)
- Average $37/week = ~$65B flowing through allowances annually in the US
- Parents forget / payments are inconsistent
- Money earns $0 sitting in cash or Greenlight-style subscription accounts
- Greenlight charges families $72–$300/year just to hold their kids' money
- Kids can't meaningfully invest (custody, KYC, fees all block them)

### Solution

- Parent deposits USDC once into Seedling vault
- Vault CPIs into Kamino for ~8% APY lending yield
- Monthly allowance streams to kid's on-chain position continuously (via SVS-5 streaming yield vault)
- Yield accumulates as a "summer bonus" payout
- Parent withdraws to offramp (p2p.me in BR, MoonPay/Coinbase in US) when kid needs cash

### Why Solana

- GENIUS Act (Jul 2025) made USDC a legal payment instrument
- Kamino hit $3.6B TVL (Oct 2025) — institutional-grade yield
- SOL classified as digital commodity (Mar 2026) — full stack regulatory clarity
- Gusto runs payroll on Solana in USDC (Mar 2026) — PayFi thesis proven
- Tx fees ~$0.0004 make monthly micro-distributions viable
- 1.2M txs/year for 100K families = $480 on Solana vs $6M+ on Ethereum

### Why Now

- 2018: Pigzbe tried this on Stellar with custom token. Right idea, wrong infrastructure. Failed.
- The rails didn't exist in 2018. They do now.

---

## 3. Hackathon Context

### Colosseum Frontier Rules (key points)

- **Submission deadline:** May 11, 2026, 11:59pm PT
- **Registration deadline:** May 4, 2026, 11:59pm PT
- **Winners announced:** June 23, 2026
- **Prizes:** $30K Grand Champion, $10K Public Goods, $10K University, $10K × 20 standout teams
- **Judging criteria:**
  - Founder + Market Fit
  - Insight
  - Product + Execution (working code, shipping velocity)
  - Potential Market Size
  - Founder Communication
  - Viability (scalable, sustainable business)
- **Required submissions:**
  - GitHub repo (code created during hackathon)
  - Pitch video (2 minutes, deck + narration)
  - Technical demo video (shows the product working)
  - Optional: weekly video updates (boost visibility)

### Realistic target

- **Top 20 Standout ($10K)** is the realistic goal
- Grand Champion is possible but unlikely for solo 16yo
- Public Goods is not a fit (revenue model disqualifies) — will open-source the core vault as a byproduct but won't pursue this category
- University Award: not eligible (high school, not university)

---

## 4. Architecture — Locked Decisions

### Core architectural choices

| Decision | Choice | Rationale |
|---|---|---|
| Asset | USDC only | Stable, deep Kamino liquidity, GENIUS Act compliant |
| Vault variant | SVS-5 (Streaming Yield Vault) | Continuous yield streaming matches allowance UX; eliminates discrete monthly cron |
| Yield source | Kamino lending protocol | $3.6B TVL, institutional-grade, open source (klend) |
| Family model | One FamilyPosition per parent-kid pair | Supports multiple kids per parent from day one |
| Custody | Parent has authority, kid has view-only PDA | No minor-custody problem; parent handles offramp |
| Distribution | Continuous streaming via SVS-5 | Matches product metaphor (growth over time) |
| Keeper | Seedling operates in practice, permissionless at protocol level | Trust-building + decentralization signal |
| Protocol fee | 10% of yield (NOT of principal, NOT of Kamino base APY) | Implemented in v1 |
| Fiat offramp | Not in v1, parent handles manually | Scope discipline |
| Kid spending | Not in v1, parent offramps on demand | Scope discipline |

### What v1 does NOT include (deferred to roadmap)

- Fiat onramps (Blinks + TipLink, MoonPay, p2p.me) — Roadmap Plant stage, Q4 2026
- Physical debit card for kids — Roadmap Tree stage, 2027
- Grandparent yield transfers — Roadmap Tree stage, 2027
- Multi-asset support (SOL, other stablecoins) — Post-hackathon
- Kid-empowered withdrawal permissions — Post-hackathon

---

## 5. Technical Stack

### Smart contract

- **Framework:** Anchor (check version on terminal day 1; 0.30+ preferred)
- **Solana CLI:** 1.18+ for current Kamino compatibility
- **Dependencies:**
  - SVS-5 program via CPI: `HCp23XHzV4HJHXwLWwQj8aSTU1yjyzj8FCNLe6NybwXt`
  - Kamino klend via CPI: `KLend2g3cP87fffoy8q1mQqGKjrxjC8boSyAYavgmjD`
  - `klend-interface` crate from Kamino's GitHub (libs/klend-interface)

### Frontend

- **Framework:** Next.js 14, app router
- **Styling:** Tailwind CSS
- **Components:** shadcn/ui
- **Wallet adapter:** `@solana/wallet-adapter-react` + Phantom + Solflare
- **SVS SDK:** `@stbr/solana-vault`
- **Hosting:** Vercel, auto-deploy from GitHub main branch
- **Domain:** seedlingsol.xyz → Vercel

### Infrastructure

- **Development:** localnet first (speed), then devnet for demo
- **Mainnet:** post-hackathon only
- **Keeper script:** Node.js, runs on cron, calls `harvest_yield` daily
- **Keeper hosting (post-hackathon):** Railway or Fly.io free tier

---

## 6. Data Model

### Global state

**`VaultConfig`** — one per deployment
- `authority: Pubkey` — Seedling admin (can pause, update fee)
- `treasury: Pubkey` — where the 10% protocol fee accumulates
- `fee_bps: u16` — protocol fee in basis points (1000 = 10%)
- `svs5_vault: Pubkey` — address of the SVS-5 streaming vault Seedling wraps
- `kamino_reserve: Pubkey` — USDC reserve on Kamino
- `is_paused: bool`
- `bump: u8`

PDA seeds: `["vault_config"]`

### Per-family state

**`FamilyPosition`** — one per parent-kid pair
- `parent: Pubkey` — parent's wallet (authority over this position)
- `kid: Pubkey` — kid's PDA (view-only; derived)
- `shares: u64` — shares of the SVS-5 vault owned by this family
- `principal_deposited: u64` — total USDC deposited (for accounting)
- `stream_rate: u64` — USDC/month configured by parent
- `created_at: i64` — unix timestamp
- `last_harvest: i64` — last time yield was harvested for this position
- `total_yield_earned: u64` — lifetime yield earned (for dashboard)
- `bump: u8`

PDA seeds: `["family", parent_pubkey, kid_pubkey]`

### Kid PDA (view-only)

**`KidView`** — derived address for the kid, read-only by design
- `family_position: Pubkey` — back-reference to the FamilyPosition
- `bump: u8`

PDA seeds: `["kid", parent_pubkey, kid_pubkey]`

Note: kid never signs transactions in v1. This PDA exists so the kid-facing URL has a canonical, shareable address.

---

## 7. Anchor Program Instructions

### Core (must ship)

#### 1. `initialize_vault`
- **Signer:** Authority (Seedling admin keypair)
- **Purpose:** One-time setup. Creates VaultConfig, initializes SVS-5 vault, sets Kamino reserve reference.
- **Accounts:** vault_config (init), authority (signer), svs5_vault, kamino_reserve, system_program
- **Called:** Once at protocol deployment

#### 2. `create_family`
- **Signer:** Parent
- **Purpose:** Register a new family position for parent-kid pair.
- **Accounts:** family_position (init), kid_view (init), parent (signer), kid_pubkey, vault_config, system_program
- **Params:** stream_rate (USDC/month)
- **Validations:**
  - Stream rate > 0
  - Stream rate <= MAX_STREAM_RATE (sanity cap, e.g., $1000/month)
  - Family position doesn't already exist for this parent-kid pair
  - Vault not paused

#### 3. `deposit`
- **Signer:** Parent
- **Purpose:** Parent deposits USDC → Seedling → CPIs into Kamino → mints shares to family position.
- **Accounts:** family_position, parent (signer), parent_usdc_ata, vault_usdc_ata, svs5_vault, svs5_shares_mint, family_shares_ata, kamino_reserve, kamino_liquidity_supply, kamino_collateral_mint, token_program, kamino_program
- **Params:** amount (USDC)
- **Flow:**
  1. Transfer USDC from parent to vault
  2. CPI to SVS-5 deposit → mints SVS-5 shares to vault
  3. CPI to Kamino deposit_reserve_liquidity → vault receives cTokens
  4. Update family_position.shares, principal_deposited
- **Validations:**
  - Amount > 0
  - Parent owns the family_position
  - Vault not paused
  - Parent has sufficient USDC
  - Slippage: minSharesOut protection

#### 4. `harvest_yield`
- **Signer:** Permissionless (anyone can call)
- **Purpose:** Redeems ctokens from Kamino, pulls yield back, calls SVS-5 distribute_yield to stream it.
- **Accounts:** vault_config, svs5_vault, kamino_reserve, treasury_usdc_ata, vault_usdc_ata, kamino_program, svs5_program
- **Flow:**
  1. Check how much yield has accrued in Kamino since last harvest
  2. Redeem yield portion (not principal) from Kamino
  3. Take 10% protocol fee to treasury
  4. Call SVS-5 `distribute_yield(yield_amount * 0.9, stream_duration)` to stream remaining 90%
- **Validations:**
  - Yield amount > minimum threshold (avoid dust harvests)
  - Vault not paused
- **Note:** This is the permissionless crank. Seedling runs it daily via keeper script.

#### 5. `withdraw`
- **Signer:** Parent
- **Purpose:** Parent burns shares, receives USDC back.
- **Accounts:** family_position, parent (signer), parent_usdc_ata, vault_usdc_ata, svs5_vault, family_shares_ata, kamino_reserve, kamino_program, svs5_program, token_program
- **Params:** shares_to_burn
- **Flow:**
  1. Calculate USDC owed using SVS-5 preview_redeem
  2. Redeem required USDC from Kamino
  3. Burn SVS-5 shares
  4. Transfer USDC to parent
  5. Update family_position
- **Validations:**
  - Shares > 0
  - Parent owns the family_position
  - Shares <= family_position.shares
  - Vault not paused
  - Slippage: minAssetsOut protection

### Nice-to-have (if time permits)

#### 6. `pause` / `unpause`
- **Signer:** Authority
- **Purpose:** Emergency controls
- **Note:** SVS-5 has this natively; Seedling wraps it.

#### 7. `update_stream_rate`
- **Signer:** Parent
- **Purpose:** Parent changes kid's monthly allowance
- **Accounts:** family_position, parent (signer)
- **Params:** new_stream_rate
- **Validations:** Same as create_family stream rate validations

---

## 8. Kamino Integration

### Key facts

- **Program ID (mainnet + devnet):** `KLend2g3cP87fffoy8q1mQqGKjrxjC8boSyAYavgmjD`
- **GitHub:** https://github.com/Kamino-Finance/klend
- **Key folder:** `libs/klend-interface/` — published CPI interface (Apache 2.0)
- **Latest release:** v1.17.0 (Mar 31, 2026)
- **License:** Apache 2.0

### Integration pattern

1. Add `klend-interface` as dependency in Seedling's `programs/seedling/Cargo.toml`
2. Import CPI helpers from the interface
3. Call `deposit_reserve_liquidity(ctx, amount)` and `redeem_reserve_liquidity(ctx, amount)` via CPI
4. Seedling holds the cTokens (Kamino's yield-bearing receipt)

### Required accounts for Kamino CPI (typical)

For `deposit_reserve_liquidity`:
- user_source_liquidity (vault's USDC ATA)
- user_destination_collateral (vault's cToken ATA)
- reserve
- reserve_liquidity_supply
- reserve_collateral_mint
- lending_market
- lending_market_authority
- user_transfer_authority
- pyth_price_oracle (or Kamino's oracle infrastructure)

### Day-1 scratch test

Before integrating with SVS-5, build a standalone Anchor program that:
1. Deposits $1 USDC into Kamino's devnet USDC reserve
2. Waits 60 seconds
3. Redeems the cTokens and checks if balance > $1

If this works: proceed with Seedling integration.
If this fails or is painful: pivot to **mock yield source** for v1 (hardcoded 8% APY, no Kamino CPI). This is the day-5 checkpoint decision.

### Risk mitigations

- Kamino CPI may be fiddly (oracle integration, account configurations)
- Devnet USDC reserve may not exist or may behave differently from mainnet
- If Kamino integration eats >5 days: **cut scope, use mock yield, ship roadmap claim that "real Kamino integration ships post-hackathon week 1"**

---

## 9. SVS-5 Integration

### Key facts

- **Program ID (devnet/localnet):** `HCp23XHzV4HJHXwLWwQj8aSTU1yjyzj8FCNLe6NybwXt`
- **Variant:** Streaming Yield Vault (public, not encrypted)
- **Background:** Vincenzo won the SVS hackathon with SVS-5 and SVS-6 — deeply familiar codebase
- **SDK:** `@stbr/solana-vault` via npm
- **Docs file:** `docs/SVS-5.md` in the solana-vault-standard repo

### Key functions Seedling uses

**From the SDK (TypeScript side — frontend + keeper):**
- `StreamingVault.load(program, assetMint, vaultId)` — load vault instance
- `vault.previewDeposit(amount)` — get expected shares for a deposit
- `vault.deposit(user, { assets, minSharesOut })` — deposit with slippage protection
- `vault.previewRedeem(shares)` — get expected assets for a redemption
- `vault.redeem(user, { shares, minAssetsOut })` — redeem with slippage protection
- `vault.distributeYield(authority, amount, duration)` — start yield stream
- `vault.checkpoint()` — permissionless, materializes accrued yield

**From Rust (CPI side — Seedling program):**
- CPI into SVS-5's deposit, redeem, distribute_yield instructions
- Seedling's vault USDC ATA is the source/destination for SVS-5 transfers
- Family position tracks SVS-5 shares per family

### PDA seeds (SVS-5)

- Vault PDA: `["stream_vault", asset_mint, vault_id (u64 LE)]`
- Shares mint PDA: `["shares", vault_pubkey]`

### Critical understanding: checkpoint() is accounting, not distribution

- `checkpoint()` materializes yield accrued via linear interpolation into `base_assets`
- It does NOT release a "summer bonus" — yield was already flowing continuously
- Anyone calling checkpoint doesn't break anything — it's a maintenance function
- Seedling runs a daily keeper that calls checkpoint; permissionless as a fallback

---

## 10. Frontend Specification

### Stack (locked)

- Next.js 14, app router
- Tailwind CSS
- shadcn/ui components
- `@solana/wallet-adapter-react` for wallet connection (Phantom, Solflare)
- `@stbr/solana-vault` for SVS-5 interactions
- Vercel hosting, GitHub auto-deploy
- Domain: seedlingsol.xyz

### Pages (v1 — three total)

#### Page 1: Landing (`/`)

**Sections:**
- Hero: Seedling logo + "Allowance that grows" + "Connect Wallet" CTA
- Three-column explainer:
  - 🌱 Deposit once
  - 🌿 Streams continuously
  - 🌳 Kid watches it grow
- Proof bar: "Built on Kamino ($3.6B TVL) + Solana Vault Standard"
- Footer: @seedling_sol, GitHub link, email

**Design:**
- Earth tones matching the deck's palette
- Same typography as deck (consistency is a trust signal)
- Hero uses the deck's slide 1 seedling illustration

**No wallet connection required to view.**

#### Page 2: Parent Dashboard (`/dashboard`)

**Shows only when wallet connected.**

**Top bar:**
- Wallet address + disconnect
- Total USDC deposited across all kids
- Total yield earned lifetime

**Family positions list (cards):**
- For each kid:
  - Kid name (stored client-side in localStorage for v1; add on-chain name field post-hackathon)
  - Current balance (calculated via SVS-5 preview)
  - Monthly stream rate
  - Principal deposited
  - Yield earned this month
  - "Share kid view" button → copies public kid URL
  - "Deposit more" button
  - "Withdraw" button

**Empty state:**
- "Add your first kid" CTA → form

**Add-a-kid form:**
- Kid's wallet address (or "Generate PDA")
- Monthly stream rate (USDC)
- Initial deposit (USDC)
- Submit → fires `create_family` + `deposit`

**Deposit form (per kid):**
- Amount
- Slippage tolerance (default 1%)
- Submit → fires `deposit`

**Withdraw form (per kid):**
- Amount of USDC to withdraw (converts to shares)
- Confirmation dialog
- Submit → fires `withdraw`

#### Page 3: Kid View (`/kid/[kid_pubkey]`)

**Public URL, no wallet required.**

**Shows:**
- Big animated seedling that grows visually as balance increases
- Current balance (prominent)
- Total earned this month (smaller)
- Total earned lifetime
- Stream rate ("$X per month")
- Simple line chart of balance over time
- Progress bar toward "next month's allowance" (visual motivator)

**Design:**
- Brighter, more playful than parent dashboard
- Kid-friendly typography
- Animation: seedling gently sways, grows taller as balance grows

**No interactions, pure read-only.** This is the pedagogical surface — kid watches their money grow.

### What NOT to build in v1

- Authentication (wallet IS auth)
- Email notifications
- Transaction history page (link to Solscan instead)
- Settings page
- Mobile-optimized layout (desktop-first, responsive is nice-to-have)
- Admin dashboard (Anchor CLI is the admin interface for v1)
- Dark mode toggle
- Multi-language support
- Analytics dashboards beyond the basics

---

## 11. Repository Structure

```
seedling/
├── programs/
│   └── seedling/
│       ├── src/
│       │   ├── lib.rs                 # Entry point
│       │   ├── instructions/
│       │   │   ├── initialize.rs
│       │   │   ├── create_family.rs
│       │   │   ├── deposit.rs
│       │   │   ├── harvest_yield.rs
│       │   │   ├── withdraw.rs
│       │   │   ├── pause.rs           # Nice-to-have
│       │   │   └── update_stream.rs   # Nice-to-have
│       │   ├── state/
│       │   │   ├── vault_config.rs
│       │   │   └── family_position.rs
│       │   ├── errors.rs
│       │   └── constants.rs
│       └── Cargo.toml
├── app/                               # Next.js frontend
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx                   # Landing
│   │   ├── dashboard/page.tsx         # Parent dashboard
│   │   └── kid/[pubkey]/page.tsx      # Kid view
│   ├── components/
│   │   ├── ui/                        # shadcn components
│   │   ├── WalletProvider.tsx
│   │   ├── DepositForm.tsx
│   │   ├── FamilyCard.tsx
│   │   └── GrowingSeedling.tsx        # Kid view animation
│   ├── lib/
│   │   ├── seedling.ts                # Program interactions
│   │   └── constants.ts
│   └── package.json
├── scripts/
│   ├── keeper.ts                      # Daily harvest_yield cron
│   ├── deploy.ts                      # Devnet deployment helper
│   └── setup-test-vault.ts            # Initialize vault on localnet/devnet
├── tests/
│   ├── seedling.ts                    # Full integration test
│   ├── deposit.ts                     # Deposit-specific tests
│   ├── harvest.ts                     # Harvest-specific tests
│   └── withdraw.ts                    # Withdraw-specific tests
├── migrations/
│   └── deploy.ts
├── Anchor.toml
├── Cargo.toml
├── package.json
├── tsconfig.json
├── README.md                          # WRITE FIRST, BEFORE CODE
├── ROADMAP.md                         # All "wouldn't it be cool" ideas
└── LICENSE                            # Apache 2.0
```

### README.md structure (draft outline)

1. What Seedling is (one paragraph)
2. How it works (3 bullets)
3. Status (what's built, what's roadmap)
4. Quick start (local dev setup)
5. Architecture diagram (simple ASCII)
6. Credits:
   - Built on SVS-5 (Apache 2.0) — https://github.com/[svs-url]
   - Yield powered by Kamino klend (Apache 2.0) — https://github.com/kamino-finance/klend
7. Contact: @seedling_sol, seedlingsol.xyz

---

## 12. Weekly Schedule

### Target submission: May 8, 2026

Gives 3 days buffer before the May 11 hard deadline.

### Week 1 (April 20–26): Protocol foundation

- **Apr 20 (Mon):** Terminal setup. Anchor version check. Clone klend + SVS. Kamino CPI scratch test (standalone program).
- **Apr 21 (Tue):** SVS-5 vault initialization on localnet. Verify tests pass.
- **Apr 22 (Wed):** Write `initialize_vault` + `create_family` instructions. Tests for both.
- **Apr 23 (Thu):** Write `deposit` instruction. Happy path test.
- **Apr 24 (Fri):** Continue `deposit`. Integrate Kamino CPI. Debug.
- **Apr 25 (Sat):** Write `harvest_yield` instruction. Test fee logic.
- **Apr 26 (Sun):** Write `withdraw` instruction. Full round-trip test on localnet.

### Week 2 (April 27–May 3): Polish + frontend

- **Apr 27 (Mon):** Error handling pass. Edge case tests. Fix whatever broke over the weekend.
- **Apr 28 (Tue):** Deploy to devnet. Run full flow on devnet. Keeper script (basic).
- **Apr 29 (Wed):** Frontend: Next.js scaffold, wallet adapter, landing page.
- **Apr 30 (Thu):** Frontend: Parent dashboard — family list, add-a-kid form.
- **May 1 (Fri):** Frontend: Deposit form, withdraw form, transaction signing.
- **May 2 (Sat):** Frontend: Kid view page, animated seedling, balance display.
- **May 3 (Sun):** Frontend: polish, responsive, connect to devnet.

### Week 3 (May 4–8): Video + submission

- **May 4 (Mon):** Full devnet end-to-end test (3rd time). Register on colosseum.com (deadline!).
- **May 5 (Tue):** Demo video recording: deposit flow, show kid view, show harvest.
- **May 6 (Wed):** Pitch video final recording with deck + narration.
- **May 7 (Thu):** Submit everything to Colosseum. Verify links work.
- **May 8 (Fri):** **Submitted.** Double-check submission is received. Tweet announcement.

### Buffer (May 9–11)

- **Don't submit on May 11.** Never.
- May 9-10-11: If something's broken, fix it. Otherwise: rest, post-launch content, engage with judges/community.

### On limited days

**Tests/school days assumed:** ~5 days across the 3 weeks where coding = 0 or minimal. Build this into expectations.

**If you lose 3+ consecutive days:** immediately cut scope.
- Drop `pause` and `update_stream_rate` first
- Drop kid view animation (use static image)
- Drop responsive frontend
- Drop real Kamino CPI → use mock yield

**Priority order for scope cuts (from lowest-value to most-important):**
1. Nice-to-have instructions (pause, update_stream)
2. Kid view polish (animation, chart)
3. Responsive frontend
4. Error handling beyond critical cases
5. Real Kamino CPI (fall back to mock)

Never cut: core 5 instructions, basic parent dashboard, working demo video.

---

## 13. The Three Rules

**Committed to before coding starts. These are non-negotiable.**

### Rule 1: Every instruction gets a passing test before moving to the next.

No "I'll write tests at the end." Tests written at the end don't get written. After writing `initialize_vault`, the test for it passes. After writing `create_family`, its test passes. After `deposit`, its test passes. Etc.

### Rule 2: Full flow runs on devnet 3 days before submission (May 5 latest).

If deposit → harvest → withdraw doesn't work end-to-end by May 5, cut scope immediately. Non-negotiable trigger.

### Rule 3: Never demo what isn't tested.

If the demo video shows a feature, that feature has been tested at least twice before recording. No "it works on my machine" demos.

---

## 14. Testing Strategy

### Minimum bar per instruction

**Each of the 5 core instructions gets:**
1. Happy path test (deposits successfully, harvests successfully, etc.)
2. Authority test (wrong signer = error)
3. Boundary test (zero amount = error, max amount caps respected)

That's 15 tests minimum. Should take ~1 day total if done incrementally.

### Integration tests

**Full lifecycle test:**
1. Initialize vault
2. Create family for parent + kid
3. Parent deposits $100 USDC
4. (Fake time passes or mock Kamino yield)
5. Harvest yield → check 10% went to treasury, 90% streamed via SVS-5
6. Parent withdraws $50
7. Verify all accounts balance

**Edge cases to test (if time):**
- Two families from same parent (different kids)
- Deposit of 0 fails
- Withdraw more than owned fails
- Harvest with no yield accrued is no-op
- Kamino CPI failure propagates error

### Devnet testing

**Required runs before submission:**
1. First full devnet run (by May 3)
2. Second full devnet run after frontend integration (by May 5)
3. Third full devnet run morning of demo recording (May 5 or 6)

If any of these fail: fix before proceeding.

---

## 15. Deployment Plan

### Localnet (development)

- Use `solana-test-validator` for fast iteration
- Deploy Seedling program to localnet
- SVS-5 should already be available (same program ID on localnet)
- Mock Kamino if needed (create a fake yield-bearing reserve)

### Devnet (demo + submission)

- Program ID: generated fresh with `anchor keys list`
- Deploy: `anchor deploy --provider.cluster devnet`
- USDC mint on devnet: (check current — usually `Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr` or similar, verify at time of deploy)
- Kamino USDC reserve: verify exists on devnet before committing to integration

### Mainnet (post-hackathon only)

- **Do not deploy to mainnet during hackathon.** Devnet demo is what judges evaluate.
- Post-hackathon: audit considerations, treasury setup, proper deployment ceremony

---

## 16. Submission Checklist

### Code

- [ ] GitHub repo public at submission time
- [ ] Repo name: `seedling` or `seedling-protocol`
- [ ] README written, up to date, with quick start
- [ ] All 5 core instructions implemented
- [ ] Tests passing (at minimum happy-path tests)
- [ ] Commit history shows consistent work April 20 – May 8
- [ ] License file (Apache 2.0)
- [ ] Credits: SVS-5, Kamino klend clearly attributed

### Product

- [ ] seedlingsol.xyz live (landing + dashboard + kid view)
- [ ] Devnet deployment working
- [ ] Can deposit USDC from connected wallet
- [ ] Can see family position in dashboard
- [ ] Kid view URL is shareable and loads correctly
- [ ] Can withdraw USDC back to wallet

### Media

- [ ] Pitch video recorded (2 min, deck + narration)
- [ ] Technical demo video recorded (shows product working)
- [ ] Both videos uploaded somewhere accessible (YouTube unlisted or Loom)
- [ ] Both video links in submission

### Submission platform

- [ ] Registered on colosseum.com by May 4
- [ ] Project submission filled out
- [ ] GitHub link included
- [ ] Video links included
- [ ] seedlingsol.xyz link included
- [ ] Team info: Vincenzo Tulio, 16, Brazil (with age approval email noted)
- [ ] Submit by May 8 (not May 11)

### Post-submission

- [ ] Tweet announcement from @seedling_sol
- [ ] Post in relevant Solana communities (Superteam BR discord, etc.)
- [ ] Update LinkedIn / personal profiles with project
- [ ] Save full submission confirmation email

---

## 17. Pitch Deck Summary

**9 slides. Frozen. No more changes.**

1. **Title:** Seedling — allowance that grows
2. **Problem:** parents forget, kids can't invest
3. **Market:** ≈$65B flows through allowances annually, earning $0
4. **Product:** deposit once → paid monthly → money grows → summer bonus
5. **Why now + why Solana:** Pigzbe failed in 2018, rails didn't exist; now GENIUS Act, Kamino $3.6B TVL, SOL digital commodity, Gusto payroll, $0.0004 tx fees. 1.2M monthly distributions = $480/yr on Solana vs $6M+ on Ethereum
6. **Business model:** 10% of Kamino yield. Greenlight charges families $72-$300/year, Seedling pays them instead. TVL ladder: $30M → $250K, $300M → $2.5M, $1B → $8M revenue. GTM: Solana-native parents first, non-crypto when fiat onramps feel like Venmo.
7. **Roadmap (seed → plant → tree):**
   - Seed (now → Q3 2026): Anchor program mainnet, pooled vault, Kamino yield, monthly distributions, crypto-native parents
   - Plant (Q4 2026): Blinks + TipLink (Venmo-like deposits), MoonPay + p2p.me onramps, thousands → millions of families
   - Tree (2027): Debit card, USDC spends as fiat, family members send yield directly, family finance infrastructure on Solana
8. **Team:** Vincenzo Tulio, 16. 1st place Extend the Solana Vault Standard hackathon (Superteam BR). Receives allowances monthly. balloteer.xyz from Cypherpunk.
9. **CTA:** seedling, deposit once, let it grow. seedlingsol.xyz @seedling_sol

### Visual metaphor

- Journey downward through earth across slides 2-7
- Slide 7 (roadmap): mine cart tracks, plants growing taller left-to-right
- Slide 8 (team): deep crystal cave
- Slide 9 (CTA): gold ores surrounding, treasure at the surface

---

## 18. Narration Script

**Target: 120 seconds final (exported at 1.2× speed from 144s Canva timeline). Transitions at 1.3s, talking through them.**

### Cold open (pre-slide 1, 8 seconds)

> "What if the $228 million families pay Greenlight every year… went back to the families instead?"

### Slide 1 — Title (6 seconds)

> "This is Seedling. An allowance that grows."

### Slide 2 — Problem (12 seconds)

> "Today, allowances are broken. Parents forget. Payments are inconsistent. And the money sits idle — kids can't invest, can't earn, can't learn."

### Slide 3 — Market (14 seconds)

> "Wells Fargo found 71% of American parents give an allowance. Average $37 a week. That's roughly $65 billion a year flowing through allowances — earning zero. Greenlight made $228 million last year charging families just to hold that money."

### Slide 4 — Product (14 seconds)

> "Seedling flips it. Parents deposit once from Phantom. Yield streams continuously on-chain. Kids watch their balance grow. Every summer, a bonus payout when school ends."

### Slide 5 — Why now + Why Solana (22 seconds)

> "Pigzbe tried this in 2018 on Stellar. Failed — the rails didn't exist. Now they do. Stablecoins got legal. Kamino became institutional-grade. SOL got regulatory clarity. And fees collapsed. Monthly distributions to a hundred thousand families cost four hundred eighty dollars a year on Solana. Six million plus on Ethereum. That's why this only works here."

### Slide 6 — Business model (16 seconds)

> "We only earn when families earn. Ten percent of the yield, no subscriptions. Greenlight charges families up to three hundred dollars a year — Seedling pays them instead. At one billion TVL, that's eight million in protocol revenue. Same market, opposite incentive."

### Slide 7 — Roadmap (14 seconds)

> "Three stages. Seed: the protocol ships this year. Plant: fiat onramps make deposits feel like Venmo — we go from thousands of families to millions. Tree: debit cards, grandparent yield transfers. Seedling becomes family finance infrastructure on Solana."

### Slide 8 — Team (10 seconds)

> "I'm Vincenzo. I'm sixteen. I won the Solana Vault Standard hackathon with Superteam Brazil. I receive an allowance every month. I'm building the product I need."

### Slide 9 — CTA (8 seconds)

> "Seedling. Deposit once. Let it grow. seedlingsol.xyz. Come build the future of family finance."

### Total: ~124 seconds at normal speed → ~103 seconds at 1.2× playback. Room to breathe.

---

## 19. Video Recording Plan

### Pitch video (deck + narration)

**Equipment:**
- Decent microphone (phone mic in quiet room is fine)
- Screen recording software (OBS Studio, Loom, or Canva's built-in)
- Canva deck in presentation mode, auto-advance disabled

**Recording workflow:**
1. Practice narration out loud 5-10 times before recording (day before)
2. Record audio first, separately (cleaner edits)
3. Record screen capture of slides, no audio
4. Edit: slides follow narration beats, 1.3s transitions
5. Export at 1.2× speed
6. Final length: 118-122 seconds

**Retake rules:**
- If you stumble on a word, keep going — edit in post
- If a section feels flat, re-record just that section
- Don't perfectionism — 3-4 takes max

### Technical demo video

**Separate from pitch video. Shows product actually working.**

**Script (rough):**
1. (10s) Opening: "Here's Seedling working on devnet."
2. (20s) Parent opens seedlingsol.xyz, connects Phantom wallet
3. (20s) Parent creates a family for their kid, sets $50/month stream rate, deposits $100 USDC
4. (15s) Show the family position in dashboard, show transaction on Solscan
5. (20s) Open kid view URL in new tab, show balance growing animation
6. (15s) (Fast-forward / cut to later) Show yield accrued, show harvest happening
7. (15s) Parent withdraws to offramp
8. (5s) "Seedling. Deposit once. Let it grow."

**Total: ~2 minutes. Keep it under 3 minutes max.**

**What to show vs. tell:**
- Show: UI interactions, wallet signing, on-chain confirmations
- Tell (in voiceover): what's happening conceptually

### Uploading

- YouTube unlisted is fine
- Loom is fine (but check permissions — public, not company-locked)
- Make sure links work before submitting

---

## 20. Key Reference Data

### Program IDs

| Program | Address |
|---|---|
| Kamino klend (mainnet + devnet) | `KLend2g3cP87fffoy8q1mQqGKjrxjC8boSyAYavgmjD` |
| Kamino staging | `SLendK7ySfcEzyaFqy93gDnD3RtrpXJcnRwb6zFHJSh` |
| SVS-5 (devnet + localnet) | `HCp23XHzV4HJHXwLWwQj8aSTU1yjyzj8FCNLe6NybwXt` |

### Mint addresses (verify at time of use)

| Asset | Network | Address |
|---|---|---|
| USDC | Mainnet | `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` |
| USDC | Devnet | Check latest — usually `Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr` or similar |

### SVS-5 SDK snippet (starting point)

```typescript
import { StreamingVault } from '@stbr/solana-vault';
import { Connection, PublicKey } from '@solana/web3.js';

const DEVNET_PROGRAM_ID = new PublicKey('HCp23XHzV4HJHXwLWwQj8aSTU1yjyzj8FCNLe6NybwXt');
const connection = new Connection('https://api.devnet.solana.com');
const assetMint = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'); // USDC
const vaultId = BigInt(1);

const [vaultPda] = PublicKey.findProgramAddressSync(
  [
    Buffer.from('stream_vault'),
    assetMint.toBuffer(),
    Buffer.from(new Uint8Array(new BigUint64Array([vaultId]).buffer)),
  ],
  DEVNET_PROGRAM_ID
);

const vault = await StreamingVault.load(connection, vaultPda);
const info = await vault.getStreamInfo();
```

### Key numbers (for pitch Q&A)

- Wells Fargo study: 71% of parents give allowance, $37/week average, ages 5-17, n=1587, April-May 2025
- Greenlight: $228.5M revenue 2024, 6.5M users, 16% YoY growth (Sacra)
- Greenlight pricing: $5.99-$24.98/month = $72-$300/year
- Kamino TVL: $3.6B (Oct 2025, Messari)
- US families: 85M total, ~40-45% with kids 5-17
- $65B TAM: conservative midpoint of $49B (narrow) and $116B (wide) estimates
- Solana tx fee: $0.0004 (base fee × current SOL price)
- Ethereum tx fee comparison: $5 avg × 1.2M txs = $6M+ per year

### Fact-check links

- Wells Fargo press release: https://newsroom.wf.com/news-releases/news-details/2025/New-Wells-Fargo-Study-Shows-Parents-Give-Their-Kids-an-Average-Weekly-Allowance-of-37/default.aspx
- Sacra Greenlight: https://sacra.com/c/greenlight/
- Kamino TVL: https://messari.io/project/kamino-finance
- GENIUS Act: https://www.whitehouse.gov/fact-sheets/2025/07/fact-sheet-president-donald-j-trump-signs-genius-act-into-law/

---

## 21. Q&A Preparation

### Likely judge questions and answers

**Q: How does the kid actually spend USDC?**
A: V1, parent handles offramp via p2p.me in Brazil, MoonPay or Coinbase in US. That's already how crypto-native families operate. V2 roadmap: Blinks + TipLink integration makes it Venmo-like. V3: physical debit card. We're building the yield engine first, card second — the opposite of Greenlight's priority.

**Q: What about custody for minors?**
A: Kid has a view-only PDA. Kid never signs transactions in v1. Parent has full authority. This avoids every custody/KYC problem that blocks kid financial products on Web2.

**Q: What stops a parent from just withdrawing the money?**
A: Nothing in v1. That's honest — this is a savings and yield product, not a trustless escrow between parent and child. The pedagogical value is the kid watching balance grow, not protocol-enforced lockup. V2 roadmap includes time-locked withdrawals.

**Q: What's your regulatory risk?**
A: USDC is a regulated payment stablecoin under the GENIUS Act. We're not a money transmitter (parents move their own funds into their own position). Not a securities issuer (no token, no offering). Potential future questions around acting as a custodian for minors — that's what Plant-stage partnerships (Blinks, TipLink) address.

**Q: Why 10% of yield specifically?**
A: Industry standard range. Aligned incentives — we only earn when families earn. Much friendlier than Greenlight's subscription (which charges regardless of balance or usage). Easy to communicate: "we take a cut of what you earn."

**Q: What's your moat?**
A: Three things. (1) First-mover on family finance on Solana. (2) Product-market fit with the founder — I'm the user. (3) As TVL grows, we get better Kamino rates (or can negotiate custom terms), compounding our yield advantage.

**Q: Why should I invest / back this?**
A: $65B TAM, zero competition on Solana, zero substance to Greenlight's moat (they have distribution, not tech). I'm shipping the protocol in 3 weeks solo. Grand vision: Seedling becomes the financial primitive for every family that wants their kid's money to work for them.

**Q: Who built this?**
A: Solo. Me. 16 years old. Brazilian. I won the Solana Vault Standard hackathon with Superteam Brazil, so I know vaults deeply. I receive an allowance every month, so I know the problem personally. That's rare — founder-market fit where the founder is the user.

**Q: Kamino integration — is that actually working?**
A: [If yes: "Yes, deposit → Kamino → yield → harvest all runs on devnet. Demo video shows it."]
[If using mock yield: "V1 uses a mock yield source for the demo. Real Kamino CPI integration is the first post-hackathon milestone, week 1 after submission."]

**Q: Why not build on Base or Ethereum L2?**
A: Fees. The math only works if monthly distributions to 100K families cost $480/year, not $6M+. Plus Kamino's yield is only on Solana. Plus Solana's GENIUS Act + digital commodity classification creates regulatory clarity EVM chains don't have.

---

## 22. Post-Hackathon Roadmap

**Post-submission priorities, in order:**

### Week 1 post-submission (May 12-18)

1. If using mock yield in v1: integrate real Kamino CPI
2. Security review of contracts (even informal — re-read every instruction)
3. Respond to Colosseum judging feedback if received
4. Tweet thread explaining the build process

### Month 1 (May-June)

1. Mainnet deployment preparation (formal audit consideration)
2. First 10 beta families onboarded (friends, Solana community)
3. Write technical deep-dive blog post
4. Apply to Solana Superteam grants for mainnet deployment

### Quarter 1 (Summer 2026)

1. Mainnet launch with audited contracts
2. First paying families (actual yield flowing)
3. Blinks + TipLink integration prototype
4. Media: pitch to crypto journalists, TechCrunch, Decoder

### Year 1 (by April 2027)

1. 1,000+ families on mainnet
2. Fiat onramp partnerships live (p2p.me, MoonPay)
3. Seed round raise ($500K-$1M)
4. Begin debit card partnership conversations (Baanx, Rain Card)
5. Token design for Seedling protocol (if applicable)

### Long-term vision

Seedling becomes the family finance primitive on Solana. Every wallet that holds money for a minor uses Seedling's vault infrastructure. Grandparents contribute yield. Schools tokenize pocket money. Kids grow up financially literate by watching their money compound from age 5.

---

## 23. Risk Register

### Technical risks

**R1: Kamino CPI doesn't work cleanly**
- Likelihood: Medium
- Impact: High (breaks core demo)
- Mitigation: Day-1 scratch test. Day-5 checkpoint. Fall back to mock yield if needed.

**R2: SVS-5 integration surprises**
- Likelihood: Low (Vincenzo knows this codebase)
- Impact: Medium
- Mitigation: Read docs/SVS-5.md thoroughly day 1. Run tests first.

**R3: Frontend takes longer than expected**
- Likelihood: Medium-High
- Impact: Medium
- Mitigation: Use shadcn/ui (copy-paste components). Landing page today. Don't polish.

**R4: Catastrophic bug discovered late**
- Likelihood: Medium
- Impact: Very High
- Mitigation: The Three Rules. Devnet test 3 days before submission. Submit May 8, not May 11.

### Non-technical risks

**R5: School/test commitments eat coding days**
- Likelihood: Certain
- Impact: Medium
- Mitigation: Plan for it. Cut scope early if losing days.

**R6: Colosseum rejects age exception retroactively**
- Likelihood: Very Low (already approved)
- Impact: Catastrophic
- Mitigation: Save approval email. Screenshot. Forward to personal email.

**R7: seedlingsol.xyz domain issues or Vercel problems**
- Likelihood: Low
- Impact: Medium (breaks slide 9 CTA)
- Mitigation: Deploy landing page TODAY. Don't wait.

**R8: @seedling_sol account flagged or locked**
- Likelihood: Very Low
- Impact: Low (secondary contact)
- Mitigation: Pin a tweet about the project early, makes account look legitimate.

**R9: Incognito Claude session closes, lose context**
- Likelihood: Certain (already closed many times)
- Impact: High (re-explaining context wastes time)
- Mitigation: This document exists. Save it externally. Load context from this doc into new sessions.

**R10: Motivation dip around day 14**
- Likelihood: High
- Impact: Medium
- Mitigation: Ship ugly, iterate. Submit before it's perfect. Remember: Top 20 Standout is the target, not Grand Champion.

---

## 24. Founder Notes

### Things Vincenzo should remember

**You have advantages:**
- You're the user. Greenlight founders are adults imagining what kids want. You know.
- You've won hackathons before. You know how to ship.
- You have the SVS code. You're not starting from zero.
- Your age is a feature, not a bug. Lean into it.

**You have constraints:**
- Solo builder. No pair programmer to catch bugs.
- School commitments. Real, not negotiable.
- 3 weeks. Tight.
- Shared Claude account (be careful with incognito).

**Mental models:**
- "Shipped and ugly" beats "beautiful and broken"
- Top 20 Standout is the goal, not Grand Champion
- Every hour on the deck after today is an hour stolen from code
- Every new feature idea goes in ROADMAP.md, not the codebase
- Fix the bug in front of you, not the one you imagine

**When stuck:**
- If Kamino CPI is broken after 2 days → mock yield, move on
- If frontend is broken after 1 day → simpler design, move on
- If narration is bad after 3 takes → use take 3, move on
- If a decision feels 60/40 → pick the faster option, move on

**The pitch is the pitch. Don't re-litigate.**

Deck is done. Architecture is done. Schedule is done. Now: code.

---

## Final pre-terminal checklist

Before opening the terminal for the first time:

- [ ] This document saved somewhere OUTSIDE incognito (Google Drive, Notion, iCloud)
- [ ] Colosseum age approval email saved
- [ ] seedlingsol.xyz landing page plan — build today, before any code
- [ ] @seedling_sol has at least one tweet pinned (legitimacy signal)
- [ ] Calendar has submission date blocked (May 8)
- [ ] Calendar has test/school days blocked (realistic schedule)
- [ ] Fresh GitHub repo created: https://github.com/[username]/seedling
- [ ] Terminal opens to `~/projects/seedling` or equivalent
- [ ] Anchor version check: `anchor --version`
- [ ] Solana CLI: `solana --version`
- [ ] Devnet config: `solana config set --url devnet`
- [ ] Devnet airdrop: `solana airdrop 2`
- [ ] Klend cloned: `git clone https://github.com/kamino-finance/klend`
- [ ] SVS-5 codebase accessible (already local)

**When all green: begin week 1, day 1. Kamino CPI scratch test first.**

---

**Document ends. Ship the protocol. 🌱**

*— Seedling Master Doc v1.0, April 19, 2026*
