# Day 1 Kamino Scratch Test — Success Criteria

**Timer: 2 hours. Start time: ___:___**

Check this file every 30 minutes. If goalposts start moving in your head, re-read this.

---

## Pass = ALL FOUR of these, on Kamino devnet:

- [ ] **1.** Deposit 1 USDC into Kamino's devnet USDC reserve — tx succeeds
- [ ] **2.** cToken balance appears in the expected destination account
- [ ] **3.** Redeem some fraction back — tx succeeds
- [ ] **4.** Received USDC amount ≥ original (cTokens didn't lose value)

**Any one failing at T+2h = Kamino devnet is dead for our purposes. Switch to Surfpool mainnet-fork. No debating, no "one more try."**

---

## First-failure debug order (don't skip steps)

1. **CU exhaustion** — opaque "transaction failed" with no detail? Bump `ComputeBudgetProgram::set_compute_unit_limit` from 400k → 600k → 800k. **Check this first.**
2. **Oracle mis-wire** in `refresh_reserve` — USDC reserve may need `scope_prices`, not `pyth_oracle`.
3. **Wrong USDC mint** — must be Circle `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU`, NOT the DUMMY token `Gh9ZwEmdLJ...`.
4. **Token program mismatch** — liquidity leg = `TokenInterface` (Token-2022 compat), collateral leg = plain SPL `Token`. Don't cross-wire.

---

## Fallback ladder

- L1: Kamino devnet works → proceed with devnet for whole build
- L2: Surfpool mainnet-fork with cloned Kamino accounts → devnet for final demo
- L3: Mock yield source (hardcoded 8% APY) → real Kamino ships post-hackathon

---

## Report back (after timer)

1. Did scratch test pass on Kamino devnet? (go / no-go)
2. If no-go, did Surfpool mainnet-fork work?
3. Any CPI surprises the research didn't prepare me for?
