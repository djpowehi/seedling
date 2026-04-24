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
**Founder:** Vicenzo Tulio, 16 years old, Brazil
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
- Monthly allowance (principal + share of net yield) transfers to kid's position on the 1st of each month
- Accumulated net yield pays out as a "summer bonus" / 13th allowance at period end
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
| Vault variant | Custom ERC-4626-style shares vault (patterns from SVS); NOT streaming | Monthly allowance is a discrete event ("1st of the month"); streaming fights the product metaphor and judges' mental model |
| Yield source | Kamino lending protocol | $3.6B TVL, institutional-grade, open source (klend) |
| Family model | One FamilyPosition per parent-kid pair | Supports multiple kids per parent from day one |
| Custody | Parent has authority, kid has view-only PDA | No minor-custody problem; parent handles offramp |
| Distribution | Discrete: monthly allowance (30-day rolling gate) + period-end bonus | Matches real-world allowance UX; deterministic on-chain time check; no timezone drift |
| Keeper | Seedling operates in practice, permissionless at protocol level | Trust-building + decentralization signal |
| Protocol fee | 10% of ALL yield at each harvest event (NOT of principal). Applies on every monthly harvest AND period-end bonus harvest, not bonus-only. | Matches S7 revenue projections ($30M TVL × 8% APY × 10% = $240K/yr). Bonus-only would leave ~11mo of yield fees on the table. |
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
- **Keeper script:** Node.js, runs on cron. Daily: calls `distribute_monthly_allowance` for each family whose 30-day gate has elapsed. Period-end: calls `distribute_bonus` for each family.
- **Keeper hosting (post-hackathon):** Railway or Fly.io free tier

---

## 6. Data Model

### Global state

**`VaultConfig`** — one per deployment
- `authority: Pubkey` — Seedling admin (can pause, update fee)
- `treasury: Pubkey` — where the 10% protocol fee accumulates
- `fee_bps: u16` — protocol fee in basis points (1000 = 10%)
- `kamino_reserve: Pubkey` — USDC reserve on Kamino (trusted config, set at init)
- `usdc_mint: Pubkey` — read from `reserve.liquidity.mint_pubkey` at init, cached for account validation on every later instruction
- `ctoken_mint: Pubkey` — read from `reserve.collateral.mint_pubkey` at init, cached. Different reserves have different cToken mints; caching makes the vault reserve-agnostic (primary + 2 backups all work via the same program)
- `oracle_pyth: Pubkey` — read from reserve.config at init. Zero-pubkey = not configured on this reserve. Passed as optional account to every `refresh_reserve` CPI
- `oracle_switchboard_price: Pubkey` — same pattern
- `oracle_switchboard_twap: Pubkey` — same pattern
- `oracle_scope_config: Pubkey` — same pattern
- `total_shares: u64` — global share supply across all families. Invariant: equals `sum(family_position.shares)`; mutated ONLY via `mint_family_shares` / `burn_family_shares` helpers
- `last_known_total_assets: u64` — snapshot of `cTokens × exchange_rate` at last harvest; used to compute yield delta on each instruction
- `period_end_ts: i64` — next bonus-distribution period boundary (UTC)
- `current_period_id: u32` — monotonic period counter
- `is_paused: bool`
- `bump: u8`

PDA seeds: `["vault_config"]`. Note: no `svs5_vault` field — Seedling is a standalone ERC-4626-style vault, NOT a wrapper around SVS-5 (see §9).

### Per-family state

**`FamilyPosition`** — one per parent-kid pair
- `parent: Pubkey` — parent's wallet (authority over this position; `has_one` target)
- `kid: Pubkey` — kid's pubkey (the `KidView` PDA is derived from it)
- `shares: u64` — this family's share of the global vault pool
- `principal_deposited: u64` — lifetime USDC deposited (monotonic, for dashboard)
- `principal_remaining: u64` — USDC principal still in the vault (decreases on monthly allowance + withdraw; used to compute bonus amount)
- `stream_rate: u64` — USDC/month configured by parent (6-decimals)
- `created_at: i64` — unix timestamp
- `last_distribution: i64` — last time the monthly allowance was paid; set to `created_at` on `create_family` so first distribution can only fire 30 days after onboarding
- `last_bonus_period_id: u32` — prevents double-paying a bonus in the same period
- `total_yield_earned: u64` — lifetime yield credited to this family (for dashboard)
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

### Shared helper: `harvest_and_fee(ctx) -> Result<YieldHarvested>`

**Single source of truth for yield accounting. Lives in `programs/seedling/src/utils/harvest.rs` and is called from deposit, withdraw, distribute_monthly_allowance, and distribute_bonus — four call sites, ONE implementation. Do not inline this logic.**

Called BEFORE any shares math in every financial instruction. Returns `YieldHarvested { gross_yield, fee_to_treasury, net_yield_retained }` for the caller to log.

Flow:
1. CPI `refresh_reserve(reserve, oracles...)` — Kamino rejects operations against stale prices
2. Compute `total_assets_now = vault_ctoken_ata.amount × reserve.collateral_exchange_rate()`
3. `gross_yield = saturating_sub(total_assets_now, vault_config.last_known_total_assets)` — saturating because redemptions can temporarily make this go negative between CPIs; treat as zero yield
4. If `gross_yield > 0`:
   - `fee = floor(gross_yield × vault_config.fee_bps / 10_000)`
   - CPI `redeem_reserve_collateral` for `fee` USDC, transfer to `treasury_usdc_ata`
5. Update `vault_config.last_known_total_assets = total_assets_now − fee` (net of what we just took out)
6. Return `YieldHarvested { gross_yield, fee_to_treasury: fee, net_yield_retained: gross_yield - fee }`

**CU budget warning:** `refresh_reserve` alone is 80–150k CU (scales with oracle accounts), `deposit_reserve_liquidity` is 50–80k, and vault logic adds ~50k more — realistic per-tx budget is 250–300k. Client-side preamble: `ComputeBudgetProgram::set_compute_unit_limit(400_000)` as the starting value; bump to 600k or 800k if tests hit CU exhaustion. **Debugging hook: CU exhaustion surfaces as opaque "transaction failed" with no useful detail — if Day-1 scratch test produces a vague failure, check CU limits BEFORE anything else.**

**Invariant enforced by this helper:** After it returns, `vault_config.last_known_total_assets` represents the vault's net USDC-denominated value right before the caller's business logic mutates shares or principal.

---

### Invariant assertions (enforced in code, tested in LiteSVM)

Every instruction that mutates shares MUST assert the following before exiting (helper: `assert_shares_invariant(vault_config, &family_positions)`):

```
vault_config.total_shares == sum(family_position.shares for all families)
```

For runtime (not every instruction can afford to iterate all families): maintain the invariant by only ever mutating `vault_config.total_shares` and `family_position.shares` together by the same delta, enforced by the helper function `mint_family_shares(vault_config, family, delta)` / `burn_family_shares(vault_config, family, delta)`. Both callers MUST go through these helpers — never mutate the fields directly.

For testing: LiteSVM integration tests iterate all created family PDAs via `get_program_accounts` after every operation and assert the equality. Catches the class of bug where one path updates `vault_config.total_shares` but not the family side (or vice versa).

---

### Core (must ship)

#### 1. `initialize_vault`
- **Signer:** Authority (Seedling admin keypair)
- **Purpose:** One-time setup. Creates `VaultConfig` PDA, caches mint + oracle pubkeys, opens ATAs, opens the vault.
- **Accounts:** vault_config (init), authority (signer), usdc_mint (InterfaceAccount<Mint>), ctoken_mint (InterfaceAccount<Mint>), treasury_usdc_ata (Unchecked — stored by pubkey only), kamino_reserve (Unchecked — trusted config, stored by pubkey only, no on-chain deserialization), vault_usdc_ata (init ATA owned by vault_config PDA), vault_ctoken_ata (init ATA owned by vault_config PDA), token_program (Interface<TokenInterface>), associated_token_program, system_program
- **Args:** `InitializeVaultArgs { oracle_pyth, oracle_switchboard_price, oracle_switchboard_twap, oracle_scope_config, period_end_ts, fee_bps }`
- **State set:** `authority`, `treasury`, `fee_bps` (default 1000), `kamino_reserve`, `usdc_mint`, `ctoken_mint`, 4 oracle pubkeys, `total_shares = 0`, `last_known_total_assets = 0`, `period_end_ts`, `current_period_id = 0`, `is_paused = false`, `bump`
- **Emits:** `VaultInitialized { authority, treasury, kamino_reserve, usdc_mint, ctoken_mint, ts }`
- **Called:** Once at protocol deployment. No SVS-5 CPI — Seedling owns its own shares accounting.
- **Operational note (Day-2 pivot, 2026-04-24):** Oracle pubkeys are passed as instruction args rather than extracted on-chain from the Kamino reserve. The trusted authority reads them off-chain via klend-sdk (`market.getReserveByMint(usdc).config.liquidity.pythOracle / switchboardOracle / scopePriceConfigAddress`), then passes them. Saves a day of "deserialize Kamino Reserve struct on Anchor 0.32.1" rabbit hole while keeping the security posture identical: every later CPI validates its passed oracle accounts against these cached pubkeys. Pass `Pubkey::default()` for oracles this reserve doesn't use.

#### 2. `create_family`
- **Signer:** Parent
- **Purpose:** Register a new family position for parent-kid pair.
- **Accounts:** family_position (init at `["family", parent, kid]`), kid_view (init at `["kid", parent, kid]`), parent (signer), kid_pubkey, vault_config, system_program
- **Params:** `stream_rate: u64` (USDC/month, 6-decimals)
- **State set:** `parent`, `kid`, `shares = 0`, `principal_deposited = 0`, `principal_remaining = 0`, `stream_rate`, `created_at = now`, **`last_distribution = now`** (prevents immediate month-1 drain), `last_bonus_period_id = 0`, `total_yield_earned = 0`, `bump`
- **Emits:** `FamilyCreated { family, parent, kid, stream_rate, ts }`
- **Validations:**
  - `stream_rate > 0`
  - `stream_rate <= MAX_STREAM_RATE` (sanity cap, e.g., $1000/month)
  - Family position doesn't already exist (Anchor `init` enforces)
  - `vault_config.is_paused == false`

#### 3. `deposit`
- **Signer:** Parent
- **Purpose:** Parent deposits USDC → CPI into Kamino → family shares minted pro-rata.
- **Accounts:** family_position (mut), parent (signer, `has_one` on family_position), parent_usdc_ata (mut), vault_usdc_ata (mut), vault_ctoken_ata (mut), treasury_usdc_ata (mut), vault_config, kamino_reserve (mut) + full RefreshReserve + DepositReserveLiquidity account set (see §8), token_program, kamino_program
- **Params:** `amount: u64`, `min_shares_out: u64`
- **Flow:**
  1. Transfer `amount` USDC from parent → `vault_usdc_ata`
  2. Call `harvest_and_fee(ctx)` (shared helper — refresh_reserve + yield delta + 10% fee skim). Capture returned `YieldHarvested`.
  3. CPI `deposit_reserve_liquidity(amount)` → `vault_ctoken_ata` receives cTokens
  4. **Shares math (kvault pattern):** if `vault_config.total_shares == 0`: `shares_minted = amount`. Else: `shares_minted = floor(vault_config.total_shares × amount / ceil(total_assets_post_deposit − amount))` — the denominator is the pool size BEFORE this deposit's USDC entered (post-harvest, pre-deposit). Inflation protection via ceiling on denominator — no virtual-offset field.
  5. `require!(shares_minted >= min_shares_out)`
  6. `mint_family_shares(vault_config, family, shares_minted)` — single helper updates BOTH `vault_config.total_shares` AND `family_position.shares` atomically (invariant enforcement)
  7. `family_position.principal_deposited += amount` (monotonic lifetime counter); `family_position.principal_remaining += amount`
  8. Update `vault_config.last_known_total_assets` to reflect the just-deposited cTokens
  9. `emit!(Deposited { family, parent, amount, shares_minted, fee_to_treasury: harvest.fee_to_treasury, ts })`
- **Validations:**
  - `amount > 0`
  - `has_one = parent` on family_position
  - Vault not paused
  - Parent has sufficient USDC (SPL transfer fails otherwise)
  - Slippage: `min_shares_out` guard

#### 4. `distribute_monthly_allowance` (was `harvest_yield`)
- **Signer:** Permissionless (keeper or anyone)
- **Purpose:** On the monthly gate, harvest yield, take 10% fee, transfer the family's `stream_rate` USDC to the kid's ATA. Called per family.
- **Accounts:** vault_config, family_position (mut), parent_authority (for has_one only, not signer), kid_view, kid_usdc_ata (mut), treasury_usdc_ata (mut), vault_usdc_ata (mut), vault_ctoken_ata (mut), kamino_reserve (mut) + full RefreshReserve + RedeemReserveCollateral account set (see §8), token_program, kamino_program
- **Flow:**
  1. `require!(now >= family_position.last_distribution + 30*86_400)` — deterministic 30-day gate. Calendar-month accuracy is a UX-layer concern; on-chain we prefer timestamps that can't drift or be manipulated by timezone.
  2. Call `harvest_and_fee(ctx)` (shared helper — refresh + 10% fee skim). Capture returned `YieldHarvested`.
  3. CPI `redeem_reserve_collateral` for `stream_rate` USDC worth of cTokens
  4. Burn family shares: `shares_to_burn = ceil(stream_rate × vault_config.total_shares / total_assets_after_harvest)`. Use `burn_family_shares(vault_config, family, shares_to_burn)` helper to maintain invariant.
  5. **Principal-first drawdown (LOCKED):**
     - `principal_drawdown = min(stream_rate, family_position.principal_remaining)`
     - `yield_drawdown = stream_rate − principal_drawdown`
     - `family_position.principal_remaining -= principal_drawdown`
     - `family_position.total_yield_earned += yield_drawdown` (lifetime yield received by this kid)
  6. Transfer `stream_rate` USDC from `vault_usdc_ata` → `kid_usdc_ata`
  7. Update `family_position.last_distribution = now`
  8. `assert_shares_invariant(vault_config, &family_positions)` (LiteSVM test hook; on-chain the atomic helpers in step 4 are sufficient)
  9. `emit!(MonthlyAllowanceDistributed { family, kid, stream_rate, principal_drawdown, yield_drawdown, fee_to_treasury: harvest.fee_to_treasury, ts })`
- **Validations:**
  - 30-day gate elapsed
  - Vault not paused
  - `family_position.shares > 0`
  - Post-burn shares non-negative
- **Note:** This is the permissionless crank. Seedling runs it daily via keeper, fires only for families whose gate has elapsed.

#### 5. `distribute_bonus` (period-end 13th allowance)
- **Signer:** Permissionless (keeper)
- **Purpose:** At configured period end (default: once per calendar year, e.g. Dec 1 UTC), sweep each family's accumulated net yield to the kid.
- **Accounts:** Same set as instruction #4, plus vault_config (mut for period rollover)
- **Params:** `period_id: u32` — used to prevent double-payout per period
- **Flow:**
  1. `require!(family_position.last_bonus_period_id < vault_config.current_period_id)` and `now >= vault_config.period_end_ts`
  2. Call `harvest_and_fee(ctx)` (shared helper). Capture returned `YieldHarvested`.
  3. Compute family's claim at post-harvest share price:
     - `family_assets = floor(family_position.shares × total_assets_after_harvest / vault_config.total_shares)`
     - `bonus = saturating_sub(family_assets, family_position.principal_remaining)` — saturating because monthly drawdowns have already taken principal out, so `family_assets` ≥ `principal_remaining` is the normal case, but we defend against off-by-one
  4. `require!(bonus > DUST_THRESHOLD)` (avoid zero-value tx; default 0.01 USDC = 10_000 base units)
  5. CPI `redeem_reserve_collateral` for `bonus` USDC
  6. Burn `shares_to_burn = ceil(bonus × vault_config.total_shares / total_assets_after_harvest)` via `burn_family_shares` helper
  7. **Principal does NOT change** — bonus is pure yield by definition (`family_assets − principal_remaining`). `family_position.total_yield_earned += bonus`
  8. Transfer `bonus` USDC → `kid_usdc_ata`
  9. `family_position.last_bonus_period_id = vault_config.current_period_id`
  10. `emit!(BonusDistributed { family, kid, amount: bonus, fee_to_treasury: harvest.fee_to_treasury, period_id: vault_config.current_period_id, ts })`
- **Validations:** same as #4 plus period-id guard.

#### 6. `withdraw`
- **Signer:** Parent
- **Purpose:** Parent burns family shares, receives USDC back.
- **Accounts:** family_position (mut), parent (signer), parent_usdc_ata (mut), vault_usdc_ata (mut), vault_ctoken_ata (mut), treasury_usdc_ata (mut), kamino_reserve (mut) + full Refresh/Redeem account set, token_program, kamino_program
- **Params:** `shares_to_burn: u64`, `min_assets_out: u64`
- **Flow:**
  1. Call `harvest_and_fee(ctx)` (shared helper — refresh + 10% fee skim on accrued yield). Capture `YieldHarvested`.
  2. `assets_out = floor(shares_to_burn × total_assets_after_harvest / vault_config.total_shares)`
  3. `require!(assets_out >= min_assets_out)` — slippage guard
  4. CPI `redeem_reserve_collateral` for `assets_out` USDC
  5. `burn_family_shares(vault_config, family, shares_to_burn)` — atomic helper
  6. **Principal-first drawdown** (same rule as monthly): `principal_drawdown = min(assets_out, family_position.principal_remaining)`; `yield_drawdown = assets_out − principal_drawdown`; update `principal_remaining` and `total_yield_earned` accordingly
  7. Transfer USDC to parent
  8. `emit!(Withdrawn { family, parent, shares_burned: shares_to_burn, assets_out, principal_drawdown, yield_drawdown, fee_to_treasury: harvest.fee_to_treasury, ts })`
- **Validations:**
  - `shares_to_burn > 0 && shares_to_burn <= family_position.shares`
  - `has_one = parent` on family_position
  - Vault not paused
  - Slippage guard above

### Nice-to-have (if time permits)

#### 7. `pause` / `unpause`
- **Signer:** Authority
- **Purpose:** Emergency controls. Seedling-native flag on `VaultConfig` — not wrapped from SVS.

#### 8. `update_stream_rate`
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
3. Call `deposit_reserve_liquidity(ctx, liquidity_amount)` and `redeem_reserve_collateral(ctx, collateral_amount)` via CPI (note: redemption is `redeem_reserve_collateral`, not `..._liquidity`)
4. **Always prepend `refresh_reserve`** in the same transaction — Kamino rejects deposits/redeems against stale oracle prices
5. Seedling holds the cTokens (Kamino's yield-bearing receipt)

### Required accounts for `deposit_reserve_liquidity` (verified Apr 23 against klend source)

| # | Account | Type | Notes |
|---|---|---|---|
| 1 | owner | Signer | vault PDA signs via CPI |
| 2 | reserve | AccountLoader<Reserve>, mut | has_one = lending_market |
| 3 | lending_market | AccountLoader<LendingMarket> | |
| 4 | lending_market_authority | AccountInfo | PDA `[LENDING_MARKET_AUTH, lending_market]` |
| 5 | reserve_liquidity_mint | InterfaceAccount<Mint> | == reserve.liquidity.mint_pubkey |
| 6 | reserve_liquidity_supply | InterfaceAccount<TokenAccount>, mut | == reserve.liquidity.supply_vault |
| 7 | reserve_collateral_mint | InterfaceAccount<Mint>, mut | == reserve.collateral.mint_pubkey |
| 8 | user_source_liquidity | InterfaceAccount<TokenAccount>, mut | vault's USDC ATA |
| 9 | user_destination_collateral | InterfaceAccount<TokenAccount>, mut | vault's cToken ATA |
| 10 | collateral_token_program | Program<Token> | plain SPL |
| 11 | liquidity_token_program | Interface<TokenInterface> | Token-2022 compat |
| 12 | instruction_sysvar_account | AccountInfo | introspection guard |

`redeem_reserve_collateral` is the same 12 accounts with user-side legs swapped (`user_source_collateral`, `user_destination_liquidity`).

### Oracle wiring is reserve-specific (not hardcodeable)

`refresh_reserve` takes OPTIONAL pyth / switchboard_price / switchboard_twap / scope_prices accounts. Which set a specific reserve needs is stored in its on-chain config. **We cannot hardcode "use pyth" — the program must adapt.**

**Approach for Seedling's Rust CPI:**
1. During `initialize_vault`, read the target reserve's `config.liquidity.pyth_oracle / switchboard_oracle / scope_oracle_configuration` fields
2. Cache those pubkeys on `VaultConfig` (new fields: `oracle_pyth: Pubkey`, `oracle_switchboard_price: Pubkey`, `oracle_switchboard_twap: Pubkey`, `oracle_scope: Pubkey` — zero-pubkey means "not used")
3. Require exactly those accounts in every CPI instruction; validate each against the cached pubkey
4. Pass them into the CPI as optional accounts (None/Some pattern) based on whether they're zero-pubkey

This avoids the "works on one reserve, breaks on the next" class of bug and makes the program reserve-agnostic.

### Devnet target (verified Apr 23 2026 — Kamino devnet is ALIVE)

| Field | Value |
|---|---|
| Devnet USDC mint | `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU` (Circle) |
| Primary market | `6aaNTBEmwdN19AAdTwbNrWyUo6iEyiLguxCTePEzSqoH` |
| Primary USDC reserve | `HRwMj8uuoGVWCanKzKvpTWN5ZvXjtjKGxcFbn2qTPKMW` (status Active, ~1.1M USDC supply, non-Vicenzo activity Apr 20–21) |
| cUSDC mint on this reserve | `6FY2rwh5wWrtSveAG9t9ANc2YsrChNasVSEpMQubJcXd` |
| Backup USDC reserve #1 | `8xnJfxrbiYrKBBbGJ2aBMHWKhkAQ7veKVVNPL9DfYNhu` (market `DFwjqtUtNRFFddFVkoScE4DUdhHBTPW5Vw5KXupGcyWs`) |
| Backup USDC reserve #2 | `6jrwyGApj9dGXJArBCfFbUeRMMMv5M5oApyxChvt7986` (market `66ARS8zdM9NJocZB1ixKVedoPsbfbzWXXjozGZhUASU`) |

If the primary reserve is deprecated by Kamino before submission, drop in backup #1. If #1 dies too, #2. All 8 discovered USDC reserves are listed in `scratch/src/scratch.ts:CANDIDATE_MARKETS`.

### Compute budget budget (measured, not guessed)

Day-1 scratch test: Kamino deposit bundle (setup 2 ix + lending 1 ix + cleanup 0 ix) fits inside **600k CU** on devnet.

Seedling's deposit will add `harvest_and_fee` (refresh + yield math + conditional fee redeem) on top. **Start the client-side limit at 700k; instrument the first real deposit with `sol_log_compute_units!()`; set the limit to `measured × 1.3` thereafter.** Don't over-budget (wastes block space) and don't under-budget (opaque failures).

### Day-1 scratch test (status: PASSED Apr 23 2026)

All 4 criteria passed in T+20min of coding. Gory details and working code at `scratch/src/scratch.ts`. Go/no-go = **GO on devnet.**

### CPI surprises found during scratch test (apply when writing the Rust program)

1. **klend-sdk is kit (web3.js 2.0) native.** Returns `IInstruction` with `programAddress: Address` + numeric `role` flags, not legacy `TransactionInstruction`. Only matters for TS clients. Our Rust CPI is unaffected.
2. **`KaminoMarket.load()` does NOT preload reserves** — must call `await market.loadReserves()` after. Frontend needs to know this.
3. **SDK uses `===` for Address equality.** Fresh-constructed `address("xxx")` ≠ SDK's internally-stored form. Always fetch the mint via `reserve.getLiquidityMint()`. Saves 30 min of "reserve not found in market" debugging.
4. **The reserve we hit had zero oracle friction.** Lucky, not general. See "Oracle wiring is reserve-specific" above.

---

## 9. SVS-5 Integration

### Key facts

- **Program ID (devnet/localnet):** `HCp23XHzV4HJHXwLWwQj8aSTU1yjyzj8FCNLe6NybwXt`
- **Variant:** Streaming Yield Vault (public, not encrypted)
- **Background:** Vicenzo won the SVS hackathon with SVS-5 and SVS-6 — deeply familiar codebase
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
- **web3.js 1.x + @coral-xyz/anchor** (legacy) — NOT @solana/kit
- `@solana/wallet-adapter-react` for wallet connection (Phantom, Solflare) — legacy-compatible
- Vercel hosting, GitHub auto-deploy
- Domain: seedlingsol.xyz

### Kit/legacy fence decision (LOCKED Apr 23 2026)

**Frontend is legacy-native (web3.js 1.x + @coral-xyz/anchor). Kamino SDK calls go through a single `app/lib/kamino-bridge.ts` module that handles the kit→legacy conversion. Everywhere else stays legacy.**

**Why legacy:**
- Anchor 0.31.1's TS client generates legacy-compatible code; going kit means shimming every generated call.
- wallet-adapter ecosystem (Phantom, Solflare, Backpack) is still primarily legacy.
- Kit's tree-shakability + type gains don't matter for a 3-screen MVP.
- The `kitToLegacy` shim from day-1 scratch (`scratch/src/scratch.ts`) is reusable in `kamino-bridge.ts`.

**One-time port from scratch:** the `kitToLegacy` helper, the `await market.loadReserves()` call, and the `reserve.getLiquidityMint()` trick. Everything else is already legacy.

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
│       │   │   ├── distribute_monthly_allowance.rs
│       │   │   ├── distribute_bonus.rs
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
│   ├── keeper.ts                      # Daily distribute_monthly_allowance cron; period-end distribute_bonus
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

- ~~Apr 20 (Mon): Terminal setup. Clone repos. Kamino scratch test.~~ Done
- ~~Apr 21 (Tue): SVS-5 research.~~ Repurposed to template cleanup + research sweep
- ~~Apr 22 (Wed): Research + master doc overhaul + Kamino scratch test.~~ **✅ Scratch test PASSED T+20min on Kamino devnet.**
- **Apr 23 (Thu) — TODAY:** Write `initialize_vault` + `create_family` instructions. LiteSVM tests for both. Anchor scaffold at `programs/seedling/`.
- **Apr 24 (Fri):** Write `deposit` instruction with `harvest_and_fee` helper. Happy path test (LiteSVM with mock reserve; real Kamino CPI integration on Apr 25).
- **Apr 25 (Sat):** Integrate real Kamino CPI into `deposit`. Run against devnet reserve `HRwMj8uuoGVWCanKzKvpTWN5ZvXjtjKGxcFbn2qTPKMW`. Debug oracle wiring.
- **Apr 26 (Sun):** Write `distribute_monthly_allowance` + `distribute_bonus` + `withdraw`. Full round-trip test against devnet.

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

### Invariants (asserted in every LiteSVM integration test)

After every instruction that mutates shares or principal, the test harness calls `assert_all_invariants()`:

1. **Shares conservation:** `vault_config.total_shares == sum(family_position.shares)` across all family PDAs fetched via `getProgramAccounts`. Catches drift between the global counter and per-family totals.
2. **Principal conservation:** `sum(family_position.principal_remaining) <= total_assets` (net of harvested fees). Principal can never exceed what's in the pool; over-spending principal is how depositors lose money.
3. **Non-negative accounting:** `principal_remaining >= 0`, `shares >= 0`, `last_distribution >= created_at`. Underflow = bug.
4. **Yield direction:** `total_yield_earned` monotonically non-decreasing per family across the test.
5. **Treasury monotonicity:** `treasury_usdc_ata.balance` never decreases (we only ever add, never refund).

These are baked into the test helper so every test gets them for free. One failing assertion → loud panic → you notice at 9am, not when a user's money is already wrong on mainnet.

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
- USDC mint on devnet: `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU` (real Circle devnet USDC; faucet at https://faucet.circle.com — 20 USDC / 2h / address). NOTE: `Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr` is the SPL Token Faucet "DUMMY" token — useful for isolated tests only, not compatible with Kamino's USDC reserve.
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
- [ ] Team info: Vicenzo Tulio, 16, Brazil (with age approval email noted)
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
8. **Team:** Vicenzo Tulio, 16. 1st place Extend the Solana Vault Standard hackathon (Superteam BR) — **authored SVS-5 and SVS-6** (vault standards Seedling's shares math builds on). Receives allowances monthly. balloteer.xyz from Cypherpunk.
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

> "Seedling flips it. Parents deposit once from Phantom. The allowance lands on the first of every month. Yield compounds in between. And every summer, a bonus payout when school ends."

### Slide 5 — Why now + Why Solana (22 seconds)

> "Pigzbe tried this in 2018 on Stellar. Failed — the rails didn't exist. Now they do. Stablecoins got legal. Kamino became institutional-grade. SOL got regulatory clarity. And fees collapsed. Monthly distributions to a hundred thousand families cost four hundred eighty dollars a year on Solana. Six million plus on Ethereum. That's why this only works here."

### Slide 6 — Business model (16 seconds)

> "We only earn when families earn. Ten percent of the yield, no subscriptions. Greenlight charges families up to three hundred dollars a year — Seedling pays them instead. At one billion TVL, that's eight million in protocol revenue. Same market, opposite incentive."

### Slide 7 — Roadmap (14 seconds)

> "Three stages. Seed: the protocol ships this year. Plant: fiat onramps make deposits feel like Venmo — we go from thousands of families to millions. Tree: debit cards, grandparent yield transfers. Seedling becomes family finance infrastructure on Solana."

### Slide 8 — Team (10 seconds)

> "I'm Vicenzo. I'm sixteen. I won the Solana Vault Standard hackathon with Superteam Brazil — I authored SVS-5 and SVS-6, the standards Seedling's shares math builds on. I receive an allowance every month. I'm building the product I need."

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
| USDC | Devnet | `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU` (Circle, real; faucet.circle.com) |

### Kamino devnet targets (verified Apr 23 2026)

| Role | Address |
|---|---|
| Primary market | `6aaNTBEmwdN19AAdTwbNrWyUo6iEyiLguxCTePEzSqoH` |
| Primary USDC reserve | `HRwMj8uuoGVWCanKzKvpTWN5ZvXjtjKGxcFbn2qTPKMW` |
| Primary cUSDC mint | `6FY2rwh5wWrtSveAG9t9ANc2YsrChNasVSEpMQubJcXd` |
| Backup reserve #1 | `8xnJfxrbiYrKBBbGJ2aBMHWKhkAQ7veKVVNPL9DfYNhu` (market `DFwjqtUtNRFFddFVkoScE4DUdhHBTPW5Vw5KXupGcyWs`) |
| Backup reserve #2 | `6jrwyGApj9dGXJArBCfFbUeRMMMv5M5oApyxChvt7986` (market `66ARS8zdM9NJocZB1ixKVedoPsbfbzWXXjozGZhUASU`) |

Full list of 8 USDC reserves in `scratch/src/scratch.ts:CANDIDATE_MARKETS`. Fallback ladder if primary deprecates: backup#1 → backup#2 → Surfpool mainnet-fork → mock yield.

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
- Likelihood: Low (Vicenzo knows this codebase)
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

### Things Vicenzo should remember

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
