# Seedling Gotchas

Hard-won pitfalls from building Seedling on Solana — Quasar (Pinocchio) on-chain, real Kamino CPI, Privy + sponsor-relay frontend, 4P Pix integration. Read before spending 30 minutes debugging the same thing.

> The sections below were originally written against an Anchor 0.32 scaffold during early development. The production program now runs on Quasar (Pinocchio, single-byte discriminators, `no_std`); the Anchor-era patterns are kept here for anyone porting between the two frameworks.

---

## Anchor 0.32.1 (legacy notes)

### 1. `#[program]` macro requires glob re-exports from `instructions/mod.rs`

```rust
// ❌ breaks — macro can't find __client_accounts_* modules
pub use initialize_vault::{InitializeVault, InitializeVaultArgs};

// ✅ works — glob exposes the auto-generated client modules the macro needs
pub use initialize_vault::*;
```

Error surface: `unresolved import 'crate'` from the `#[program]` expansion, pointing at your lib.rs.

### 2. Handler naming collision across instruction modules

If every instruction module exposes `pub fn handler()`, `pub use foo::*;` + `pub use bar::*;` produces ambiguous-glob warnings and in some positions actual errors.

**Convention (locked):** every handler is `{instruction_name}_handler`.

```rust
pub fn initialize_vault_handler(ctx, args) -> Result<()> { ... }
pub fn create_family_handler(ctx, kid, rate) -> Result<()> { ... }
pub fn deposit_handler(ctx, amount, min_out) -> Result<()> { ... }  // Day 3+
```

### 3. TS client can't auto-resolve PDA-owned ATAs

`program.methods.foo().accounts({...})` auto-resolves bump seeds and some derived accounts, but **not** associated token accounts owned by a PDA. For those, compute off-chain and pass explicitly via `.accountsPartial({...})`:

```typescript
const vaultUsdcAta = getAssociatedTokenAddressSync(usdcMint, vaultConfigPda, true);

await program.methods.initializeVault(args)
  .accountsPartial({
    // ... the accounts Anchor could auto-derive ...
    vaultUsdcAta,
    vaultCtokenAta,
    tokenProgram: TOKEN_PROGRAM_ID,
    associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
    systemProgram: SystemProgram.programId,
  })
  .signers([...])
  .rpc();
```

Error surface: `Reached maximum depth for account resolution. Unresolved accounts: \`vaultUsdcAta\`, \`vaultCtokenAta\``.

### 4. SBF 4kb stack overflow on instructions with many accounts

Anchor's `try_accounts` macro stack-frames the entire account struct during deserialization. With 8+ token/mint/account fields, you'll hit:

```
Stack offset of XXXX exceeded max offset of 4096 by NNN bytes
```

Fix: wrap heavy fields in `Box<>`. Heap-allocates them so they don't sit in the stack frame.

```rust
// ❌ overflows on 8+ accounts
pub family_position: Account<'info, FamilyPosition>,
pub vault_usdc_ata: InterfaceAccount<'info, TokenAccount>,

// ✅ heap-allocated, fits
pub family_position: Box<Account<'info, FamilyPosition>>,
pub vault_usdc_ata: Box<InterfaceAccount<'info, TokenAccount>>,
```

Apply preventively to every instruction with the full Kamino CPI account set: `deposit`, `withdraw`, `distribute_monthly_allowance`, `distribute_bonus`. Header-comment the convention in each file.

### 6. Program account modules reorder alphabetically after save

`rustfmt` sorts `pub mod foo; pub mod bar;` alphabetically. Expected. Don't fight it. Module order is not semantic.

---

## Kamino klend

### 7. `KaminoMarket.load()` doesn't preload reserves

TS side only. After `load()`, you must `await market.loadReserves()` before any `getReserveByMint` / `getReserveByAddress` returns non-undefined. Two round trips, not one.

### 8. klend-sdk v7 uses `===` for Address equality

`kitAddress("X") !== someOtherAddressFromSdk("X")` even if both represent the same pubkey — they're branded strings with identity semantics. **Always fetch the mint via `reserve.getLiquidityMint()`** when passing it back into SDK calls; don't construct a fresh `address(...)`.

### 9. `KaminoAction.build*Txns` returns kit-format `IInstruction[]`

Legacy `Transaction.add()` expects `TransactionInstruction` with `programId: PublicKey`. Kit instructions have `programAddress: string` + numeric `role` flags. A `kitToLegacy()` shim (in `scratch/src/scratch.ts`) handles the conversion. **Rust CPI from our Anchor program is unaffected** — this is a TS-client-only concern, isolated to `app/lib/kamino-bridge.ts` (Day 4+).

### 10. `refresh_reserve` is mandatory before deposit/redeem

Kamino rejects CPIs against stale oracle prices. Every instruction that CPIs into `deposit_reserve_liquidity` or `redeem_reserve_collateral` must `refresh_reserve` first in the same transaction. Oracle accounts are reserve-specific and cached on `VaultConfig` at init (see §7.1 of master doc).

### 11. Redeem function is `redeem_reserve_collateral`, not `redeem_reserve_liquidity`

Common mistake — the mirror of `deposit_reserve_liquidity` sounds like `redeem_reserve_liquidity`, but Kamino named it after what you burn (collateral tokens), not what you get back (liquidity). Master doc §8 has the correct name.

### 12. Compute budget: 700k starting, measure then pad 1.3×

Day-1 scratch test: Kamino deposit bundle (setup 2 + lending 1 + cleanup 0) fits in 600k CU. Seedling's deposit adds `harvest_and_fee` (refresh + optional fee redeem) — plan for 250-300k on top. Instrument with `sol_log_compute_units!()` on the first real deposit and set `actual × 1.3` thereafter.

Error surface: opaque "transaction failed" with no detail. Check CU **first** before chasing anything else.

---

## npm / yarn

### 13. npm EPERM on `~/.npm/_cacache`

Bug in older npm versions leaves root-owned files in the cache. Fix once:
```
sudo chown -R $(whoami) ~/.npm
```
Sandboxed shells (CI runners, locked-down dev environments) may need the install command run with elevated permissions even after the fix.

---

## Solana devnet

### 14. `Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr` is NOT real devnet USDC

That's the SPL Token Faucet's "DUMMY" token — useful for isolated tests, incompatible with Kamino's USDC reserve. **Real Circle devnet USDC is `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU`**, faucet at https://faucet.circle.com (20 USDC / 2h / address).

### 15. Anchor `Option<AccountInfo>` None sentinel is the target program ID

Kamino klend (and any Anchor program with `pub x: Option<AccountInfo<'info>>`) expects every positional account in the AccountMeta list to be present. Passing fewer accounts = `AccountNotEnoughKeys` error.

To signal "None" for an optional slot: pass the **target program's own ID** at that position. Example: Kamino's refresh_reserve has 4 optional oracle slots; for a reserve using only Scope, pass klend program ID for the pyth/switchboard_price/switchboard_twap slots.

### 16. Kamino lending_market_authority PDA seeds

Seeds: `[b"lma", lending_market.key()]`. The prefix string is literally `lma`, sourced from `klend/programs/klend/src/utils/seeds.rs:1`. Not obvious from the account name.

### 17. `ctoken_mint` must be `mut` in the Deposit struct even if you don't mutate it

Kamino's `deposit_reserve_liquidity` CPI mints new cTokens into the collateral mint. Your Anchor account struct must declare it writable, or Solana rejects the CPI with "writable privilege escalated."

Same will apply to any mint field Kamino writes to.

### 18. Surfpool mainnet-fork oracle prices go stale

Mainnet's oracles are updated by real validators; the fork doesn't get those updates. Kamino's refresh_reserve logs `PriceTooOld` warnings but continues execution. Benign for tests today. If Kamino upgrades to hard-fail on stale prices, Surfpool integration tests break.

### 19. Kamino Path-B exchange rate: `supply_vault.amount` is NOT total assets

Most Kamino USDC is lent out. The reserve's supply_vault holds only the unlent portion. Correct formula for Kamino's internal exchange rate:
```
total_assets = supply_vault.amount + borrowed_amount_sf / SF_SCALE
exchange_rate = total_assets / collateral_mint.supply
```
`borrowed_amount_sf` is a scaled-fraction u128 at reserve offset 232, divided by `2^60` to unscale.

Using supply-vault-only (what we did Day 4) gives dramatically wrong shares on any deposit after the first. Fix was Day 5.

### 20. Kamino devnet markets ≠ mainnet main market

Mainnet's `7u3HeHxYDLhnCoErrtycNokbQYbWGzLs6JSDqGAv5PfF` is a plain System-owned empty account on devnet. Devnet has its own markets (109 of them as of Apr 2026). Primary Seedling target: market `6aaNTBEmwdN19AAdTwbNrWyUo6iEyiLguxCTePEzSqoH`, USDC reserve `HRwMj8uuoGVWCanKzKvpTWN5ZvXjtjKGxcFbn2qTPKMW`. Backups in master doc §20.
