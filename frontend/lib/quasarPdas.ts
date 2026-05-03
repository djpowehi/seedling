// PDA derivation helpers for the Quasar program. Mirrors the seeds
// declared via #[seeds(...)] on each #[account] struct in
// programs/seedling-quasar/src/state.rs. Single source of truth — every
// frontend caller imports from here.
//
// Quasar's auto-generated TS client doesn't yet export `findXxxPda`
// helpers (Anchor 0.32 had `findProgramAddressSync` baked into the
// generated client). When/if they do, swap the bodies here to call those.

import { PublicKey } from "@solana/web3.js";
import { PROGRAM_ID } from "./program";

const FAMILY_SEED = Buffer.from("family");
const KID_SEED = Buffer.from("kid");
// Seed bumped to "vault_config_v2" because the canonical program address
// has stale Anchor-format VaultConfig data at the v1 PDA. v2 gives us a
// fresh PDA at the same canonical program ID.
const VAULT_CONFIG_SEED = Buffer.from("vault_config_v2");

export function vaultConfigPda(programId: PublicKey = PROGRAM_ID) {
  return PublicKey.findProgramAddressSync([VAULT_CONFIG_SEED], programId)[0];
}

export function familyPositionPda(
  parent: PublicKey,
  kid: PublicKey,
  programId: PublicKey = PROGRAM_ID
) {
  return PublicKey.findProgramAddressSync(
    [FAMILY_SEED, parent.toBuffer(), kid.toBuffer()],
    programId
  )[0];
}

export function kidViewPda(
  parent: PublicKey,
  kid: PublicKey,
  programId: PublicKey = PROGRAM_ID
) {
  return PublicKey.findProgramAddressSync(
    [KID_SEED, parent.toBuffer(), kid.toBuffer()],
    programId
  )[0];
}
