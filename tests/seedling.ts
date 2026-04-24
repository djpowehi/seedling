import * as anchor from "@coral-xyz/anchor";
import { BN, Program } from "@coral-xyz/anchor";
import { Seedling } from "../target/types/seedling";
import {
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
} from "@solana/web3.js";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createMint,
  getAssociatedTokenAddressSync,
  getOrCreateAssociatedTokenAccount,
} from "@solana/spl-token";
import { SystemProgram } from "@solana/web3.js";
import { assert } from "chai";

describe("seedling", () => {
  anchor.setProvider(anchor.AnchorProvider.env());
  const provider = anchor.AnchorProvider.env();
  const program = anchor.workspace.seedling as Program<Seedling>;

  const authority = Keypair.generate();
  const treasuryOwner = Keypair.generate();

  let usdcMint: PublicKey;
  let ctokenMint: PublicKey;
  let treasuryUsdcAta: PublicKey;
  let vaultConfigPda: PublicKey;
  let vaultConfigBump: number;

  // Stand-in for real Kamino reserve. init() stores the pubkey, no deserialization.
  const kaminoReserve = Keypair.generate().publicKey;

  const oracles = {
    pyth: Keypair.generate().publicKey,
    switchboardPrice: Keypair.generate().publicKey,
    switchboardTwap: PublicKey.default,
    scopeConfig: PublicKey.default,
  };

  before(async () => {
    const airdropTo = async (pk: PublicKey, sol: number) => {
      const sig = await provider.connection.requestAirdrop(
        pk,
        sol * LAMPORTS_PER_SOL,
      );
      await provider.connection.confirmTransaction(sig, "confirmed");
    };
    await airdropTo(authority.publicKey, 10);
    await airdropTo(treasuryOwner.publicKey, 1);

    usdcMint = await createMint(
      provider.connection,
      authority,
      authority.publicKey,
      null,
      6,
    );
    ctokenMint = await createMint(
      provider.connection,
      authority,
      authority.publicKey,
      null,
      6,
    );

    treasuryUsdcAta = (
      await getOrCreateAssociatedTokenAccount(
        provider.connection,
        authority,
        usdcMint,
        treasuryOwner.publicKey,
      )
    ).address;

    [vaultConfigPda, vaultConfigBump] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault_config")],
      program.programId,
    );
  });

  describe("initialize_vault", () => {
    it("initializes vault with correct state and caches oracle pubkeys", async () => {
      const vaultUsdcAta = getAssociatedTokenAddressSync(
        usdcMint,
        vaultConfigPda,
        true,
      );
      const vaultCtokenAta = getAssociatedTokenAddressSync(
        ctokenMint,
        vaultConfigPda,
        true,
      );

      const periodEndTs = new BN(
        Math.floor(Date.now() / 1000) + 365 * 24 * 3600,
      );

      const args = {
        oraclePyth: oracles.pyth,
        oracleSwitchboardPrice: oracles.switchboardPrice,
        oracleSwitchboardTwap: oracles.switchboardTwap,
        oracleScopeConfig: oracles.scopeConfig,
        periodEndTs,
        feeBps: 1000,
      };

      await program.methods
        .initializeVault(args)
        .accountsPartial({
          authority: authority.publicKey,
          usdcMint,
          ctokenMint,
          treasuryUsdcAta,
          kaminoReserve,
          vaultConfig: vaultConfigPda,
          vaultUsdcAta,
          vaultCtokenAta,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([authority])
        .rpc();

      const cfg = await program.account.vaultConfig.fetch(vaultConfigPda);

      assert.equal(cfg.authority.toBase58(), authority.publicKey.toBase58());
      assert.equal(cfg.treasury.toBase58(), treasuryUsdcAta.toBase58());
      assert.equal(cfg.feeBps, 1000);
      assert.equal(cfg.kaminoReserve.toBase58(), kaminoReserve.toBase58());
      assert.equal(cfg.usdcMint.toBase58(), usdcMint.toBase58());
      assert.equal(cfg.ctokenMint.toBase58(), ctokenMint.toBase58());
      assert.equal(cfg.oraclePyth.toBase58(), oracles.pyth.toBase58());
      assert.equal(
        cfg.oracleSwitchboardPrice.toBase58(),
        oracles.switchboardPrice.toBase58(),
      );
      assert.equal(
        cfg.oracleSwitchboardTwap.toBase58(),
        PublicKey.default.toBase58(),
      );
      assert.equal(
        cfg.oracleScopeConfig.toBase58(),
        PublicKey.default.toBase58(),
      );
      assert.isTrue(cfg.totalShares.eq(new BN(0)));
      assert.isTrue(cfg.lastKnownTotalAssets.eq(new BN(0)));
      assert.isTrue(cfg.periodEndTs.eq(periodEndTs));
      assert.equal(cfg.currentPeriodId, 0);
      assert.isFalse(cfg.isPaused);
      assert.equal(cfg.bump, vaultConfigBump);

      const vaultUsdc = await provider.connection.getAccountInfo(vaultUsdcAta);
      const vaultCtoken =
        await provider.connection.getAccountInfo(vaultCtokenAta);
      assert.isNotNull(vaultUsdc);
      assert.isNotNull(vaultCtoken);
    });
  });

  describe("create_family", () => {
    const parent = Keypair.generate();
    const kid = Keypair.generate().publicKey;
    const streamRate = new BN(50_000_000); // $50/month in 6-decimals USDC

    before(async () => {
      const sig = await provider.connection.requestAirdrop(
        parent.publicKey,
        2 * LAMPORTS_PER_SOL,
      );
      await provider.connection.confirmTransaction(sig, "confirmed");
    });

    it("creates family; last_distribution = created_at (blocks day-1 drain)", async () => {
      const [familyPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("family"), parent.publicKey.toBuffer(), kid.toBuffer()],
        program.programId,
      );
      const [kidViewPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("kid"), parent.publicKey.toBuffer(), kid.toBuffer()],
        program.programId,
      );

      await program.methods
        .createFamily(kid, streamRate)
        .accounts({
          parent: parent.publicKey,
          vaultConfig: vaultConfigPda,
        })
        .signers([parent])
        .rpc();

      const family = await program.account.familyPosition.fetch(familyPda);
      assert.equal(family.parent.toBase58(), parent.publicKey.toBase58());
      assert.equal(family.kid.toBase58(), kid.toBase58());
      assert.isTrue(family.shares.eq(new BN(0)));
      assert.isTrue(family.principalDeposited.eq(new BN(0)));
      assert.isTrue(family.principalRemaining.eq(new BN(0)));
      assert.isTrue(family.streamRate.eq(streamRate));
      assert.isTrue(family.createdAt.gt(new BN(0)));
      assert.isTrue(family.lastDistribution.eq(family.createdAt));
      assert.equal(family.lastBonusPeriodId, 0);
      assert.isTrue(family.totalYieldEarned.eq(new BN(0)));

      const kidView = await program.account.kidView.fetch(kidViewPda);
      assert.equal(kidView.familyPosition.toBase58(), familyPda.toBase58());
    });

    it("rejects stream_rate = 0", async () => {
      const parent2 = Keypair.generate();
      const kid2 = Keypair.generate().publicKey;
      const sig = await provider.connection.requestAirdrop(
        parent2.publicKey,
        1 * LAMPORTS_PER_SOL,
      );
      await provider.connection.confirmTransaction(sig, "confirmed");

      try {
        await program.methods
          .createFamily(kid2, new BN(0))
          .accounts({
            parent: parent2.publicKey,
            vaultConfig: vaultConfigPda,
          })
          .signers([parent2])
          .rpc();
        assert.fail("expected stream_rate=0 to be rejected");
      } catch (e: any) {
        assert.include(e.toString(), "InvalidStreamRate");
      }
    });

    it("rejects duplicate family for same parent+kid", async () => {
      try {
        await program.methods
          .createFamily(kid, streamRate)
          .accounts({
            parent: parent.publicKey,
            vaultConfig: vaultConfigPda,
          })
          .signers([parent])
          .rpc();
        assert.fail("expected duplicate to be rejected");
      } catch (e: any) {
        const msg = e.toString();
        assert.isTrue(
          msg.includes("already in use") ||
            msg.includes("custom program error") ||
            msg.includes("0x0"),
          `expected already-in-use error, got: ${msg}`,
        );
      }
    });
  });
});
