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

// v3 cutover (2026-05-06): kid pubkey is no longer a wallet — it's a
// random 32-byte client-generated identifier. The family vault custodies
// kid USDC via a PDA-owned token account (kid_pool_ata). v2 PDAs are
// abandoned. VaultConfig stays at v2 since its struct hasn't changed.
const FAMILY_SEED = Buffer.from("family_v3");
const KID_SEED = Buffer.from("kid_v3");
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
