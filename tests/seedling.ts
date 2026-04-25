import * as anchor from "@coral-xyz/anchor";
import { BN, Program } from "@coral-xyz/anchor";
import { Seedling } from "../target/types/seedling";
import { Keypair, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
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
        sol * LAMPORTS_PER_SOL
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
      6
    );
    ctokenMint = await createMint(
      provider.connection,
      authority,
      authority.publicKey,
      null,
      6
    );

    treasuryUsdcAta = (
      await getOrCreateAssociatedTokenAccount(
        provider.connection,
        authority,
        usdcMint,
        treasuryOwner.publicKey
      )
    ).address;

    [vaultConfigPda, vaultConfigBump] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault_config")],
      program.programId
    );
  });

  describe("initialize_vault", () => {
    it("initializes vault with correct state and caches oracle pubkeys", async () => {
      const vaultUsdcAta = getAssociatedTokenAddressSync(
        usdcMint,
        vaultConfigPda,
        true
      );
      const vaultCtokenAta = getAssociatedTokenAddressSync(
        ctokenMint,
        vaultConfigPda,
        true
      );

      const periodEndTs = new BN(
        Math.floor(Date.now() / 1000) + 365 * 24 * 3600
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
        oracles.switchboardPrice.toBase58()
      );
      assert.equal(
        cfg.oracleSwitchboardTwap.toBase58(),
        PublicKey.default.toBase58()
      );
      assert.equal(
        cfg.oracleScopeConfig.toBase58(),
        PublicKey.default.toBase58()
      );
      assert.isTrue(cfg.totalShares.eq(new BN(0)));
      assert.isTrue(cfg.lastKnownTotalAssets.eq(new BN(0)));
      assert.isTrue(cfg.periodEndTs.eq(periodEndTs));
      assert.equal(cfg.currentPeriodId, 0);
      assert.isFalse(cfg.isPaused);
      assert.equal(cfg.bump, vaultConfigBump);

      const vaultUsdc = await provider.connection.getAccountInfo(vaultUsdcAta);
      const vaultCtoken = await provider.connection.getAccountInfo(
        vaultCtokenAta
      );
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
        2 * LAMPORTS_PER_SOL
      );
      await provider.connection.confirmTransaction(sig, "confirmed");
    });

    it("creates family; last_distribution = created_at (blocks day-1 drain)", async () => {
      const [familyPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("family"), parent.publicKey.toBuffer(), kid.toBuffer()],
        program.programId
      );
      const [kidViewPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("kid"), parent.publicKey.toBuffer(), kid.toBuffer()],
        program.programId
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
        1 * LAMPORTS_PER_SOL
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
          `expected already-in-use error, got: ${msg}`
        );
      }
    });
  });

  // ===== deposit — constraint tests only =====
  // Day-4: real Kamino CPI wired. These constraint tests fail BEFORE the CPI
  // fires (validation / amount=0 / has_one), so they run fine on a local
  // validator with junk pubkeys for Kamino-side accounts. Happy-path + all
  // share-math assertions run against Surfpool mainnet-fork in
  // `tests/deposit-surfpool.test.ts`.
  describe("deposit (constraint failures — happy path is in deposit-surfpool)", () => {
    const parent = Keypair.generate();
    const kid = Keypair.generate().publicKey;
    const streamRate = new BN(50_000_000);
    let familyPda: PublicKey;
    let parentUsdcAta: PublicKey;
    let vaultUsdcAta: PublicKey;
    let vaultCtokenAta: PublicKey;

    // Kamino-side accounts: junk pubkeys work for constraint tests that
    // short-circuit before CPI. Just need to be consistent with cached
    // oracle pubkeys (Pubkey.default == System Program for unused oracles).
    const KLEND_PROGRAM = new PublicKey(
      "KLend2g3cP87fffoy8q1mQqGKjrxjC8boSyAYavgmjD"
    );
    const SYSVAR_INSTRUCTIONS = new PublicKey(
      "Sysvar1nstructions1111111111111111111111111"
    );

    before(async () => {
      const sig = await provider.connection.requestAirdrop(
        parent.publicKey,
        2 * LAMPORTS_PER_SOL
      );
      await provider.connection.confirmTransaction(sig, "confirmed");

      [familyPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("family"), parent.publicKey.toBuffer(), kid.toBuffer()],
        program.programId
      );

      await program.methods
        .createFamily(kid, streamRate)
        .accounts({
          parent: parent.publicKey,
          vaultConfig: vaultConfigPda,
        })
        .signers([parent])
        .rpc();

      parentUsdcAta = (
        await getOrCreateAssociatedTokenAccount(
          provider.connection,
          parent,
          usdcMint,
          parent.publicKey
        )
      ).address;
      const { mintTo } = await import("@solana/spl-token");
      await mintTo(
        provider.connection,
        authority,
        usdcMint,
        parentUsdcAta,
        authority,
        100_000_000
      );

      vaultUsdcAta = getAssociatedTokenAddressSync(
        usdcMint,
        vaultConfigPda,
        true
      );
      vaultCtokenAta = getAssociatedTokenAddressSync(
        ctokenMint,
        vaultConfigPda,
        true
      );
    });

    const commonAccounts = () => ({
      familyPosition: familyPda,
      parent: parent.publicKey,
      parentUsdcAta,
      vaultUsdcAta,
      vaultCtokenAta,
      treasuryUsdcAta,
      vaultConfig: vaultConfigPda,
      usdcMint,
      ctokenMint,
      kaminoReserve,
      // Kamino-side accounts. Junk pubkeys — constraint tests fail
      // BEFORE the CPI, so these never get dereferenced on-chain.
      // For address-constrained slots we pass the cached value.
      lendingMarket: Keypair.generate().publicKey,
      lendingMarketAuthority: Keypair.generate().publicKey,
      reserveLiquiditySupply: Keypair.generate().publicKey,
      oraclePyth: oracles.pyth, // matches cached
      oracleSwitchboardPrice: oracles.switchboardPrice,
      oracleSwitchboardTwap: oracles.switchboardTwap,
      oracleScopeConfig: oracles.scopeConfig,
      kaminoProgram: KLEND_PROGRAM,
      instructionSysvar: SYSVAR_INSTRUCTIONS,
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    });

    it("rejects amount = 0", async () => {
      try {
        await program.methods
          .deposit(new BN(0), new BN(0))
          .accountsPartial(commonAccounts())
          .signers([parent])
          .rpc();
        assert.fail("expected amount=0 to be rejected");
      } catch (e: any) {
        assert.include(e.toString(), "InvalidAmount");
      }
    });

    it("rejects when caller is not the family parent", async () => {
      const imposter = Keypair.generate();
      const sig = await provider.connection.requestAirdrop(
        imposter.publicKey,
        1 * LAMPORTS_PER_SOL
      );
      await provider.connection.confirmTransaction(sig, "confirmed");

      const imposterUsdcAta = (
        await getOrCreateAssociatedTokenAccount(
          provider.connection,
          imposter,
          usdcMint,
          imposter.publicKey
        )
      ).address;

      try {
        await program.methods
          .deposit(new BN(1_000_000), new BN(0))
          .accountsPartial({
            ...commonAccounts(),
            parent: imposter.publicKey,
            parentUsdcAta: imposterUsdcAta,
          })
          .signers([imposter])
          .rpc();
        assert.fail("expected has_one mismatch to reject");
      } catch (e: any) {
        const msg = e.toString();
        assert.isTrue(
          msg.includes("InvalidAuthority") || msg.includes("ConstraintHasOne"),
          `expected has_one rejection, got: ${msg}`
        );
      }
    });
  });

  // ===== withdraw — constraint tests only =====
  // Happy-path is covered in scripts/surfpool-withdraw-e2e.ts against the
  // real Kamino mainnet-fork. Here we check the short-circuiting guards that
  // fire before any CPI: shares=0 reject, over-burn reject, wrong-parent.
  describe("withdraw (constraint failures — happy path is in surfpool-withdraw-e2e)", () => {
    const parent = Keypair.generate();
    const kid = Keypair.generate().publicKey;
    const streamRate = new BN(50_000_000);
    let familyPda: PublicKey;
    let parentUsdcAta: PublicKey;
    let vaultUsdcAta: PublicKey;
    let vaultCtokenAta: PublicKey;

    const KLEND_PROGRAM = new PublicKey(
      "KLend2g3cP87fffoy8q1mQqGKjrxjC8boSyAYavgmjD"
    );
    const SYSVAR_INSTRUCTIONS = new PublicKey(
      "Sysvar1nstructions1111111111111111111111111"
    );

    before(async () => {
      const sig = await provider.connection.requestAirdrop(
        parent.publicKey,
        2 * LAMPORTS_PER_SOL
      );
      await provider.connection.confirmTransaction(sig, "confirmed");

      [familyPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("family"), parent.publicKey.toBuffer(), kid.toBuffer()],
        program.programId
      );

      await program.methods
        .createFamily(kid, streamRate)
        .accounts({ parent: parent.publicKey, vaultConfig: vaultConfigPda })
        .signers([parent])
        .rpc();

      parentUsdcAta = (
        await getOrCreateAssociatedTokenAccount(
          provider.connection,
          parent,
          usdcMint,
          parent.publicKey
        )
      ).address;

      vaultUsdcAta = getAssociatedTokenAddressSync(
        usdcMint,
        vaultConfigPda,
        true
      );
      vaultCtokenAta = getAssociatedTokenAddressSync(
        ctokenMint,
        vaultConfigPda,
        true
      );
    });

    const commonAccounts = () => ({
      familyPosition: familyPda,
      parent: parent.publicKey,
      parentUsdcAta,
      vaultUsdcAta,
      vaultCtokenAta,
      treasuryUsdcAta,
      vaultConfig: vaultConfigPda,
      usdcMint,
      ctokenMint,
      kaminoReserve,
      lendingMarket: Keypair.generate().publicKey,
      lendingMarketAuthority: Keypair.generate().publicKey,
      reserveLiquiditySupply: Keypair.generate().publicKey,
      oraclePyth: oracles.pyth,
      oracleSwitchboardPrice: oracles.switchboardPrice,
      oracleSwitchboardTwap: oracles.switchboardTwap,
      oracleScopeConfig: oracles.scopeConfig,
      kaminoProgram: KLEND_PROGRAM,
      instructionSysvar: SYSVAR_INSTRUCTIONS,
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    });

    it("rejects shares_to_burn = 0", async () => {
      try {
        await program.methods
          .withdraw(new BN(0), new BN(0))
          .accountsPartial(commonAccounts())
          .signers([parent])
          .rpc();
        assert.fail("expected shares=0 rejection");
      } catch (e: any) {
        assert.include(e.toString(), "InvalidAmount");
      }
    });

    it("rejects over-burn (shares > family.shares)", async () => {
      // Family was just created, has 0 shares. Any positive burn = insufficient.
      try {
        await program.methods
          .withdraw(new BN(1), new BN(0))
          .accountsPartial(commonAccounts())
          .signers([parent])
          .rpc();
        assert.fail("expected InsufficientShares");
      } catch (e: any) {
        assert.include(e.toString(), "InsufficientShares");
      }
    });

    it("rejects when caller is not the family parent", async () => {
      const imposter = Keypair.generate();
      const sig = await provider.connection.requestAirdrop(
        imposter.publicKey,
        LAMPORTS_PER_SOL
      );
      await provider.connection.confirmTransaction(sig, "confirmed");
      const imposterUsdcAta = (
        await getOrCreateAssociatedTokenAccount(
          provider.connection,
          imposter,
          usdcMint,
          imposter.publicKey
        )
      ).address;

      try {
        await program.methods
          .withdraw(new BN(1), new BN(0))
          .accountsPartial({
            ...commonAccounts(),
            parent: imposter.publicKey,
            parentUsdcAta: imposterUsdcAta,
          })
          .signers([imposter])
          .rpc();
        assert.fail("expected has_one rejection");
      } catch (e: any) {
        const msg = e.toString();
        assert.isTrue(
          msg.includes("InvalidAuthority") || msg.includes("ConstraintHasOne"),
          `expected has_one, got: ${msg}`
        );
      }
    });
  });

  // ===== distribute_monthly_allowance — constraint tests only =====
  // The 30-day gate check fires BEFORE any Kamino CPI, so we can test it on
  // a plain local validator. Happy-path with real Kamino is in
  // scripts/surfpool-distribute-e2e.ts.
  describe("distribute_monthly_allowance (TooEarly gate on fresh family)", () => {
    const parent = Keypair.generate();
    const kid = Keypair.generate(); // need both pubkey AND signer? no, kid is a Pubkey in our state
    const streamRate = new BN(50_000_000);
    let familyPda: PublicKey;
    let kidViewPda: PublicKey;

    const KLEND_PROGRAM = new PublicKey(
      "KLend2g3cP87fffoy8q1mQqGKjrxjC8boSyAYavgmjD"
    );
    const SYSVAR_INSTRUCTIONS = new PublicKey(
      "Sysvar1nstructions1111111111111111111111111"
    );

    before(async () => {
      const sig = await provider.connection.requestAirdrop(
        parent.publicKey,
        2 * LAMPORTS_PER_SOL
      );
      await provider.connection.confirmTransaction(sig, "confirmed");

      [familyPda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("family"),
          parent.publicKey.toBuffer(),
          kid.publicKey.toBuffer(),
        ],
        program.programId
      );
      [kidViewPda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("kid"),
          parent.publicKey.toBuffer(),
          kid.publicKey.toBuffer(),
        ],
        program.programId
      );

      await program.methods
        .createFamily(kid.publicKey, streamRate)
        .accounts({ parent: parent.publicKey, vaultConfig: vaultConfigPda })
        .signers([parent])
        .rpc();
    });

    it("rejects distribute immediately after create_family (30-day gate)", async () => {
      // kid_usdc_ata must exist — Anchor validates account deserialization
      // before the handler's TooEarly check fires.
      const kidFunding = await provider.connection.requestAirdrop(
        kid.publicKey,
        LAMPORTS_PER_SOL
      );
      await provider.connection.confirmTransaction(kidFunding, "confirmed");
      const kidUsdcAta = (
        await getOrCreateAssociatedTokenAccount(
          provider.connection,
          kid,
          usdcMint,
          kid.publicKey
        )
      ).address;
      const vaultUsdcAta = getAssociatedTokenAddressSync(
        usdcMint,
        vaultConfigPda,
        true
      );
      const vaultCtokenAta = getAssociatedTokenAddressSync(
        ctokenMint,
        vaultConfigPda,
        true
      );

      const keeper = Keypair.generate();
      const sig = await provider.connection.requestAirdrop(
        keeper.publicKey,
        1 * LAMPORTS_PER_SOL
      );
      await provider.connection.confirmTransaction(sig, "confirmed");

      try {
        await program.methods
          .distributeMonthlyAllowance()
          .accountsPartial({
            keeper: keeper.publicKey,
            familyPosition: familyPda,
            kidView: kidViewPda,
            kidUsdcAta,
            kidOwner: kid.publicKey,
            vaultUsdcAta,
            vaultCtokenAta,
            treasuryUsdcAta,
            vaultConfig: vaultConfigPda,
            usdcMint,
            ctokenMint,
            kaminoReserve,
            lendingMarket: Keypair.generate().publicKey,
            lendingMarketAuthority: Keypair.generate().publicKey,
            reserveLiquiditySupply: Keypair.generate().publicKey,
            oraclePyth: oracles.pyth,
            oracleSwitchboardPrice: oracles.switchboardPrice,
            oracleSwitchboardTwap: oracles.switchboardTwap,
            oracleScopeConfig: oracles.scopeConfig,
            kaminoProgram: KLEND_PROGRAM,
            instructionSysvar: SYSVAR_INSTRUCTIONS,
            tokenProgram: TOKEN_PROGRAM_ID,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
          })
          .signers([keeper])
          .rpc();
        assert.fail("expected TooEarly rejection");
      } catch (e: any) {
        assert.include(e.toString(), "TooEarly");
      }
    });
  });

  // ===== set_family_last_distribution admin override =====
  describe("set_family_last_distribution (authority-only)", () => {
    const parent = Keypair.generate();
    const kid = Keypair.generate();
    let familyPda: PublicKey;

    before(async () => {
      const sig = await provider.connection.requestAirdrop(
        parent.publicKey,
        2 * LAMPORTS_PER_SOL
      );
      await provider.connection.confirmTransaction(sig, "confirmed");

      [familyPda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("family"),
          parent.publicKey.toBuffer(),
          kid.publicKey.toBuffer(),
        ],
        program.programId
      );
      await program.methods
        .createFamily(kid.publicKey, new BN(50_000_000))
        .accounts({ parent: parent.publicKey, vaultConfig: vaultConfigPda })
        .signers([parent])
        .rpc();
    });

    it("authority can backdate last_distribution", async () => {
      const backdated = new BN(Math.floor(Date.now() / 1000) - 31 * 86400);
      await program.methods
        .setFamilyLastDistribution(backdated)
        .accounts({
          vaultConfig: vaultConfigPda,
          familyPosition: familyPda,
          authority: authority.publicKey,
        })
        .signers([authority])
        .rpc();

      const family = await program.account.familyPosition.fetch(familyPda);
      assert.isTrue(family.lastDistribution.eq(backdated));
    });

    it("non-authority cannot backdate", async () => {
      const imposter = Keypair.generate();
      const sig = await provider.connection.requestAirdrop(
        imposter.publicKey,
        LAMPORTS_PER_SOL
      );
      await provider.connection.confirmTransaction(sig, "confirmed");

      try {
        await program.methods
          .setFamilyLastDistribution(new BN(0))
          .accounts({
            vaultConfig: vaultConfigPda,
            familyPosition: familyPda,
            authority: imposter.publicKey,
          })
          .signers([imposter])
          .rpc();
        assert.fail("expected has_one rejection");
      } catch (e: any) {
        const msg = e.toString();
        assert.isTrue(
          msg.includes("InvalidAuthority") || msg.includes("ConstraintHasOne"),
          `got: ${msg}`
        );
      }
    });
  });

  // ===== set_paused (emergency pause) =====
  describe("set_paused (emergency kill switch)", () => {
    it("authority can pause and unpause", async () => {
      // Pause
      await program.methods
        .setPaused(true)
        .accounts({
          vaultConfig: vaultConfigPda,
          authority: authority.publicKey,
        })
        .signers([authority])
        .rpc();
      let cfg = await program.account.vaultConfig.fetch(vaultConfigPda);
      assert.isTrue(cfg.isPaused);

      // While paused, create_family rejects with VaultPaused
      const parent = Keypair.generate();
      const kid = Keypair.generate().publicKey;
      const sig = await provider.connection.requestAirdrop(
        parent.publicKey,
        LAMPORTS_PER_SOL
      );
      await provider.connection.confirmTransaction(sig, "confirmed");

      try {
        await program.methods
          .createFamily(kid, new BN(50_000_000))
          .accounts({
            parent: parent.publicKey,
            vaultConfig: vaultConfigPda,
          })
          .signers([parent])
          .rpc();
        assert.fail("expected VaultPaused");
      } catch (e: any) {
        assert.include(e.toString(), "VaultPaused");
      }

      // Unpause
      await program.methods
        .setPaused(false)
        .accounts({
          vaultConfig: vaultConfigPda,
          authority: authority.publicKey,
        })
        .signers([authority])
        .rpc();
      cfg = await program.account.vaultConfig.fetch(vaultConfigPda);
      assert.isFalse(cfg.isPaused);

      // Now create_family succeeds
      await program.methods
        .createFamily(kid, new BN(50_000_000))
        .accounts({
          parent: parent.publicKey,
          vaultConfig: vaultConfigPda,
        })
        .signers([parent])
        .rpc();
    });

    it("non-authority cannot pause", async () => {
      const imposter = Keypair.generate();
      const sig = await provider.connection.requestAirdrop(
        imposter.publicKey,
        LAMPORTS_PER_SOL
      );
      await provider.connection.confirmTransaction(sig, "confirmed");

      try {
        await program.methods
          .setPaused(true)
          .accounts({
            vaultConfig: vaultConfigPda,
            authority: imposter.publicKey,
          })
          .signers([imposter])
          .rpc();
        assert.fail("expected has_one rejection");
      } catch (e: any) {
        const msg = e.toString();
        assert.isTrue(
          msg.includes("InvalidAuthority") || msg.includes("ConstraintHasOne"),
          `got: ${msg}`
        );
      }
    });
  });
});
