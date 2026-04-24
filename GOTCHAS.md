# Seedling Gotchas

Hard-won knowledge from building this. Read before debugging for 30 minutes.

---

## Anchor 0.32.1

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

### 4. Program account modules reorder alphabetically after save

`rustfmt` sorts `pub mod foo; pub mod bar;` alphabetically. Expected. Don't fight it. Module order is not semantic.

---

## Kamino klend

### 5. `KaminoMarket.load()` doesn't preload reserves

TS side only. After `load()`, you must `await market.loadReserves()` before any `getReserveByMint` / `getReserveByAddress` returns non-undefined. Two round trips, not one.

### 6. klend-sdk v7 uses `===` for Address equality

`kitAddress("X") !== someOtherAddressFromSdk("X")` even if both represent the same pubkey — they're branded strings with identity semantics. **Always fetch the mint via `reserve.getLiquidityMint()`** when passing it back into SDK calls; don't construct a fresh `address(...)`.

### 7. `KaminoAction.build*Txns` returns kit-format `IInstruction[]`

Legacy `Transaction.add()` expects `TransactionInstruction` with `programId: PublicKey`. Kit instructions have `programAddress: string` + numeric `role` flags. A `kitToLegacy()` shim (in `scratch/src/scratch.ts`) handles the conversion. **Rust CPI from our Anchor program is unaffected** — this is a TS-client-only concern, isolated to `app/lib/kamino-bridge.ts` (Day 4+).

### 8. `refresh_reserve` is mandatory before deposit/redeem

Kamino rejects CPIs against stale oracle prices. Every instruction that CPIs into `deposit_reserve_liquidity` or `redeem_reserve_collateral` must `refresh_reserve` first in the same transaction. Oracle accounts are reserve-specific and cached on `VaultConfig` at init (see §7.1 of master doc).

### 9. Redeem function is `redeem_reserve_collateral`, not `redeem_reserve_liquidity`

Common mistake — the mirror of `deposit_reserve_liquidity` sounds like `redeem_reserve_liquidity`, but Kamino named it after what you burn (collateral tokens), not what you get back (liquidity). Master doc §8 has the correct name.

### 10. Compute budget: 700k starting, measure then pad 1.3×

Day-1 scratch test: Kamino deposit bundle (setup 2 + lending 1 + cleanup 0) fits in 600k CU. Seedling's deposit adds `harvest_and_fee` (refresh + optional fee redeem) — plan for 250-300k on top. Instrument with `sol_log_compute_units!()` on the first real deposit and set `actual × 1.3` thereafter.

Error surface: opaque "transaction failed" with no detail. Check CU **first** before chasing anything else.

---

## npm / yarn

### 11. npm EPERM on `~/.npm/_cacache`

Bug in older npm versions leaves root-owned files in the cache. Fix once:
```
sudo chown -R $(whoami) ~/.npm
```
Claude Code's sandbox doesn't handle this even after the fix — runs with `dangerouslyDisableSandbox: true` for the specific install command.

---

## Solana devnet

### 12. `Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr` is NOT real devnet USDC

That's the SPL Token Faucet's "DUMMY" token — useful for isolated tests, incompatible with Kamino's USDC reserve. **Real Circle devnet USDC is `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU`**, faucet at https://faucet.circle.com (20 USDC / 2h / address).

### 13. Kamino devnet markets ≠ mainnet main market

Mainnet's `7u3HeHxYDLhnCoErrtycNokbQYbWGzLs6JSDqGAv5PfF` is a plain System-owned empty account on devnet. Devnet has its own markets (109 of them as of Apr 2026). Primary Seedling target: market `6aaNTBEmwdN19AAdTwbNrWyUo6iEyiLguxCTePEzSqoH`, USDC reserve `HRwMj8uuoGVWCanKzKvpTWN5ZvXjtjKGxcFbn2qTPKMW`. Backups in master doc §20.
