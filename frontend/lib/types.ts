/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/seedling.json`.
 */
export type Seedling = {
  address: "44vix4JmG4hdoharDH38R5sc7g5MbFxjvpUpgwNDbTYN";
  metadata: {
    name: "seedling";
    version: "0.1.0";
    spec: "0.1.0";
    description: "Created with Anchor";
  };
  instructions: [
    {
      name: "closeFamily";
      discriminator: [197, 119, 251, 108, 241, 185, 168, 156];
      accounts: [
        {
          name: "familyPosition";
          writable: true;
        },
        {
          name: "kidView";
          docs: [
            "Kid's view PDA. Closed alongside family_position so rent is fully",
            "refunded to the parent. Constrained via seed derivation against the",
            "stored bump."
          ];
          writable: true;
          pda: {
            seeds: [
              {
                kind: "const";
                value: [107, 105, 100];
              },
              {
                kind: "account";
                path: "parent";
              },
              {
                kind: "account";
                path: "family_position.kid";
                account: "familyPosition";
              }
            ];
          };
        },
        {
          name: "parent";
          writable: true;
          signer: true;
          relations: ["familyPosition"];
        },
        {
          name: "parentUsdcAta";
          docs: [
            "Destination for redeemed USDC. Owned by parent. Must exist if",
            "shares > 0 (caller is responsible — frontend uses the idempotent",
            "ATA helper to ensure it does)."
          ];
          writable: true;
        },
        {
          name: "vaultUsdcAta";
          writable: true;
          pda: {
            seeds: [
              {
                kind: "account";
                path: "vaultConfig";
              },
              {
                kind: "const";
                value: [
                  6,
                  221,
                  246,
                  225,
                  215,
                  101,
                  161,
                  147,
                  217,
                  203,
                  225,
                  70,
                  206,
                  235,
                  121,
                  172,
                  28,
                  180,
                  133,
                  237,
                  95,
                  91,
                  55,
                  145,
                  58,
                  140,
                  245,
                  133,
                  126,
                  255,
                  0,
                  169
                ];
              },
              {
                kind: "account";
                path: "usdcMint";
              }
            ];
            program: {
              kind: "const";
              value: [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ];
            };
          };
        },
        {
          name: "vaultCtokenAta";
          writable: true;
          pda: {
            seeds: [
              {
                kind: "account";
                path: "vaultConfig";
              },
              {
                kind: "const";
                value: [
                  6,
                  221,
                  246,
                  225,
                  215,
                  101,
                  161,
                  147,
                  217,
                  203,
                  225,
                  70,
                  206,
                  235,
                  121,
                  172,
                  28,
                  180,
                  133,
                  237,
                  95,
                  91,
                  55,
                  145,
                  58,
                  140,
                  245,
                  133,
                  126,
                  255,
                  0,
                  169
                ];
              },
              {
                kind: "account";
                path: "ctokenMint";
              }
            ];
            program: {
              kind: "const";
              value: [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ];
            };
          };
        },
        {
          name: "treasuryUsdcAta";
          writable: true;
        },
        {
          name: "vaultConfig";
          writable: true;
          pda: {
            seeds: [
              {
                kind: "const";
                value: [
                  118,
                  97,
                  117,
                  108,
                  116,
                  95,
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ];
              }
            ];
          };
        },
        {
          name: "usdcMint";
        },
        {
          name: "ctokenMint";
          writable: true;
        },
        {
          name: "kaminoReserve";
          writable: true;
        },
        {
          name: "lendingMarket";
        },
        {
          name: "lendingMarketAuthority";
        },
        {
          name: "reserveLiquiditySupply";
          writable: true;
        },
        {
          name: "oraclePyth";
        },
        {
          name: "oracleSwitchboardPrice";
        },
        {
          name: "oracleSwitchboardTwap";
        },
        {
          name: "oracleScopeConfig";
        },
        {
          name: "kaminoProgram";
          address: "KLend2g3cP87fffoy8q1mQqGKjrxjC8boSyAYavgmjD";
        },
        {
          name: "instructionSysvar";
          address: "Sysvar1nstructions1111111111111111111111111";
        },
        {
          name: "tokenProgram";
        },
        {
          name: "associatedTokenProgram";
          address: "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL";
        },
        {
          name: "systemProgram";
          address: "11111111111111111111111111111111";
        }
      ];
      args: [];
    },
    {
      name: "createFamily";
      discriminator: [187, 138, 49, 160, 83, 69, 165, 142];
      accounts: [
        {
          name: "parent";
          writable: true;
          signer: true;
        },
        {
          name: "vaultConfig";
          pda: {
            seeds: [
              {
                kind: "const";
                value: [
                  118,
                  97,
                  117,
                  108,
                  116,
                  95,
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ];
              }
            ];
          };
        },
        {
          name: "familyPosition";
          writable: true;
          pda: {
            seeds: [
              {
                kind: "const";
                value: [102, 97, 109, 105, 108, 121];
              },
              {
                kind: "account";
                path: "parent";
              },
              {
                kind: "arg";
                path: "kid";
              }
            ];
          };
        },
        {
          name: "kidView";
          writable: true;
          pda: {
            seeds: [
              {
                kind: "const";
                value: [107, 105, 100];
              },
              {
                kind: "account";
                path: "parent";
              },
              {
                kind: "arg";
                path: "kid";
              }
            ];
          };
        },
        {
          name: "systemProgram";
          address: "11111111111111111111111111111111";
        }
      ];
      args: [
        {
          name: "kid";
          type: "pubkey";
        },
        {
          name: "streamRate";
          type: "u64";
        }
      ];
    },
    {
      name: "deposit";
      discriminator: [242, 35, 198, 137, 82, 225, 242, 182];
      accounts: [
        {
          name: "familyPosition";
          writable: true;
        },
        {
          name: "depositor";
          writable: true;
          signer: true;
        },
        {
          name: "depositorUsdcAta";
          writable: true;
        },
        {
          name: "vaultUsdcAta";
          writable: true;
          pda: {
            seeds: [
              {
                kind: "account";
                path: "vaultConfig";
              },
              {
                kind: "const";
                value: [
                  6,
                  221,
                  246,
                  225,
                  215,
                  101,
                  161,
                  147,
                  217,
                  203,
                  225,
                  70,
                  206,
                  235,
                  121,
                  172,
                  28,
                  180,
                  133,
                  237,
                  95,
                  91,
                  55,
                  145,
                  58,
                  140,
                  245,
                  133,
                  126,
                  255,
                  0,
                  169
                ];
              },
              {
                kind: "account";
                path: "usdcMint";
              }
            ];
            program: {
              kind: "const";
              value: [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ];
            };
          };
        },
        {
          name: "vaultCtokenAta";
          writable: true;
          pda: {
            seeds: [
              {
                kind: "account";
                path: "vaultConfig";
              },
              {
                kind: "const";
                value: [
                  6,
                  221,
                  246,
                  225,
                  215,
                  101,
                  161,
                  147,
                  217,
                  203,
                  225,
                  70,
                  206,
                  235,
                  121,
                  172,
                  28,
                  180,
                  133,
                  237,
                  95,
                  91,
                  55,
                  145,
                  58,
                  140,
                  245,
                  133,
                  126,
                  255,
                  0,
                  169
                ];
              },
              {
                kind: "account";
                path: "ctokenMint";
              }
            ];
            program: {
              kind: "const";
              value: [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ];
            };
          };
        },
        {
          name: "treasuryUsdcAta";
          writable: true;
        },
        {
          name: "vaultConfig";
          writable: true;
          pda: {
            seeds: [
              {
                kind: "const";
                value: [
                  118,
                  97,
                  117,
                  108,
                  116,
                  95,
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ];
              }
            ];
          };
        },
        {
          name: "usdcMint";
        },
        {
          name: "ctokenMint";
          writable: true;
        },
        {
          name: "kaminoReserve";
          writable: true;
        },
        {
          name: "lendingMarket";
          docs: [
            "Kamino lending market. Not cached on VaultConfig because the klend",
            "reserve itself has `has_one = lending_market`, so a caller supplying",
            "the wrong market gets rejected inside the CPI. Defense-in-depth via",
            "klend's own constraints."
          ];
        },
        {
          name: "lendingMarketAuthority";
          docs: [
            "Kamino lending-market authority PDA. Derived as",
            "`[LENDING_MARKET_AUTH, lending_market]` inside klend. We pass through.",
            "CHECK"
          ];
        },
        {
          name: "reserveLiquiditySupply";
          docs: [
            "Kamino's USDC supply vault (where the reserve holds deposited USDC).",
            "Mutable because deposit sends USDC into it.",
            "`reserve.liquidity.supply_vault`."
          ];
          writable: true;
        },
        {
          name: "oraclePyth";
        },
        {
          name: "oracleSwitchboardPrice";
        },
        {
          name: "oracleSwitchboardTwap";
        },
        {
          name: "oracleScopeConfig";
        },
        {
          name: "kaminoProgram";
          docs: [
            "Kamino program itself. Address-constrained to avoid the arbitrary-CPI",
            "class of vulnerability where a malicious caller substitutes a fake",
            "klend-lookalike that steals funds."
          ];
          address: "KLend2g3cP87fffoy8q1mQqGKjrxjC8boSyAYavgmjD";
        },
        {
          name: "instructionSysvar";
          docs: ["Instruction-introspection sysvar required by klend."];
          address: "Sysvar1nstructions1111111111111111111111111";
        },
        {
          name: "tokenProgram";
        },
        {
          name: "associatedTokenProgram";
          address: "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL";
        },
        {
          name: "systemProgram";
          address: "11111111111111111111111111111111";
        }
      ];
      args: [
        {
          name: "amount";
          type: "u64";
        },
        {
          name: "minSharesOut";
          type: "u64";
        }
      ];
    },
    {
      name: "distributeBonus";
      discriminator: [58, 121, 150, 253, 123, 31, 254, 218];
      accounts: [
        {
          name: "keeper";
          writable: true;
          signer: true;
        },
        {
          name: "familyPosition";
          writable: true;
        },
        {
          name: "kidView";
          pda: {
            seeds: [
              {
                kind: "const";
                value: [107, 105, 100];
              },
              {
                kind: "account";
                path: "family_position.parent";
                account: "familyPosition";
              },
              {
                kind: "account";
                path: "family_position.kid";
                account: "familyPosition";
              }
            ];
          };
        },
        {
          name: "kidUsdcAta";
          writable: true;
          pda: {
            seeds: [
              {
                kind: "account";
                path: "kidOwner";
              },
              {
                kind: "const";
                value: [
                  6,
                  221,
                  246,
                  225,
                  215,
                  101,
                  161,
                  147,
                  217,
                  203,
                  225,
                  70,
                  206,
                  235,
                  121,
                  172,
                  28,
                  180,
                  133,
                  237,
                  95,
                  91,
                  55,
                  145,
                  58,
                  140,
                  245,
                  133,
                  126,
                  255,
                  0,
                  169
                ];
              },
              {
                kind: "account";
                path: "usdcMint";
              }
            ];
            program: {
              kind: "const";
              value: [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ];
            };
          };
        },
        {
          name: "kidOwner";
        },
        {
          name: "vaultUsdcAta";
          writable: true;
          pda: {
            seeds: [
              {
                kind: "account";
                path: "vaultConfig";
              },
              {
                kind: "const";
                value: [
                  6,
                  221,
                  246,
                  225,
                  215,
                  101,
                  161,
                  147,
                  217,
                  203,
                  225,
                  70,
                  206,
                  235,
                  121,
                  172,
                  28,
                  180,
                  133,
                  237,
                  95,
                  91,
                  55,
                  145,
                  58,
                  140,
                  245,
                  133,
                  126,
                  255,
                  0,
                  169
                ];
              },
              {
                kind: "account";
                path: "usdcMint";
              }
            ];
            program: {
              kind: "const";
              value: [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ];
            };
          };
        },
        {
          name: "vaultCtokenAta";
          writable: true;
          pda: {
            seeds: [
              {
                kind: "account";
                path: "vaultConfig";
              },
              {
                kind: "const";
                value: [
                  6,
                  221,
                  246,
                  225,
                  215,
                  101,
                  161,
                  147,
                  217,
                  203,
                  225,
                  70,
                  206,
                  235,
                  121,
                  172,
                  28,
                  180,
                  133,
                  237,
                  95,
                  91,
                  55,
                  145,
                  58,
                  140,
                  245,
                  133,
                  126,
                  255,
                  0,
                  169
                ];
              },
              {
                kind: "account";
                path: "ctokenMint";
              }
            ];
            program: {
              kind: "const";
              value: [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ];
            };
          };
        },
        {
          name: "treasuryUsdcAta";
          writable: true;
        },
        {
          name: "vaultConfig";
          writable: true;
          pda: {
            seeds: [
              {
                kind: "const";
                value: [
                  118,
                  97,
                  117,
                  108,
                  116,
                  95,
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ];
              }
            ];
          };
        },
        {
          name: "usdcMint";
        },
        {
          name: "ctokenMint";
          writable: true;
        },
        {
          name: "kaminoReserve";
          writable: true;
        },
        {
          name: "lendingMarket";
        },
        {
          name: "lendingMarketAuthority";
        },
        {
          name: "reserveLiquiditySupply";
          writable: true;
        },
        {
          name: "oraclePyth";
        },
        {
          name: "oracleSwitchboardPrice";
        },
        {
          name: "oracleSwitchboardTwap";
        },
        {
          name: "oracleScopeConfig";
        },
        {
          name: "kaminoProgram";
          address: "KLend2g3cP87fffoy8q1mQqGKjrxjC8boSyAYavgmjD";
        },
        {
          name: "instructionSysvar";
          address: "Sysvar1nstructions1111111111111111111111111";
        },
        {
          name: "tokenProgram";
        },
        {
          name: "associatedTokenProgram";
          address: "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL";
        },
        {
          name: "systemProgram";
          address: "11111111111111111111111111111111";
        }
      ];
      args: [];
    },
    {
      name: "distributeMonthlyAllowance";
      discriminator: [147, 223, 185, 231, 165, 67, 53, 75];
      accounts: [
        {
          name: "keeper";
          docs: [
            "Anyone can trigger the distribute (permissionless crank). They pay",
            "the tx fee but don't authorize anything — gating is enforced by the",
            "30-day timestamp check."
          ];
          writable: true;
          signer: true;
        },
        {
          name: "familyPosition";
          writable: true;
        },
        {
          name: "kidView";
          docs: [
            "Read-only PDA confirming this family_position's kid identity."
          ];
          pda: {
            seeds: [
              {
                kind: "const";
                value: [107, 105, 100];
              },
              {
                kind: "account";
                path: "family_position.parent";
                account: "familyPosition";
              },
              {
                kind: "account";
                path: "family_position.kid";
                account: "familyPosition";
              }
            ];
          };
        },
        {
          name: "kidUsdcAta";
          docs: [
            "Kid's USDC ATA — destination of the monthly allowance. Owned by the",
            "kid's pubkey directly (not the KidView PDA) so the kid can move the",
            "funds with their own wallet if/when they ever sign transactions."
          ];
          writable: true;
          pda: {
            seeds: [
              {
                kind: "account";
                path: "kidOwner";
              },
              {
                kind: "const";
                value: [
                  6,
                  221,
                  246,
                  225,
                  215,
                  101,
                  161,
                  147,
                  217,
                  203,
                  225,
                  70,
                  206,
                  235,
                  121,
                  172,
                  28,
                  180,
                  133,
                  237,
                  95,
                  91,
                  55,
                  145,
                  58,
                  140,
                  245,
                  133,
                  126,
                  255,
                  0,
                  169
                ];
              },
              {
                kind: "account";
                path: "usdcMint";
              }
            ];
            program: {
              kind: "const";
              value: [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ];
            };
          };
        },
        {
          name: "kidOwner";
          docs: [
            "The kid's actual pubkey. Referenced only for the kid_usdc_ata's",
            "authority constraint. Must match family_position.kid."
          ];
        },
        {
          name: "vaultUsdcAta";
          writable: true;
          pda: {
            seeds: [
              {
                kind: "account";
                path: "vaultConfig";
              },
              {
                kind: "const";
                value: [
                  6,
                  221,
                  246,
                  225,
                  215,
                  101,
                  161,
                  147,
                  217,
                  203,
                  225,
                  70,
                  206,
                  235,
                  121,
                  172,
                  28,
                  180,
                  133,
                  237,
                  95,
                  91,
                  55,
                  145,
                  58,
                  140,
                  245,
                  133,
                  126,
                  255,
                  0,
                  169
                ];
              },
              {
                kind: "account";
                path: "usdcMint";
              }
            ];
            program: {
              kind: "const";
              value: [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ];
            };
          };
        },
        {
          name: "vaultCtokenAta";
          writable: true;
          pda: {
            seeds: [
              {
                kind: "account";
                path: "vaultConfig";
              },
              {
                kind: "const";
                value: [
                  6,
                  221,
                  246,
                  225,
                  215,
                  101,
                  161,
                  147,
                  217,
                  203,
                  225,
                  70,
                  206,
                  235,
                  121,
                  172,
                  28,
                  180,
                  133,
                  237,
                  95,
                  91,
                  55,
                  145,
                  58,
                  140,
                  245,
                  133,
                  126,
                  255,
                  0,
                  169
                ];
              },
              {
                kind: "account";
                path: "ctokenMint";
              }
            ];
            program: {
              kind: "const";
              value: [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ];
            };
          };
        },
        {
          name: "treasuryUsdcAta";
          writable: true;
        },
        {
          name: "vaultConfig";
          writable: true;
          pda: {
            seeds: [
              {
                kind: "const";
                value: [
                  118,
                  97,
                  117,
                  108,
                  116,
                  95,
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ];
              }
            ];
          };
        },
        {
          name: "usdcMint";
        },
        {
          name: "ctokenMint";
          writable: true;
        },
        {
          name: "kaminoReserve";
          writable: true;
        },
        {
          name: "lendingMarket";
        },
        {
          name: "lendingMarketAuthority";
        },
        {
          name: "reserveLiquiditySupply";
          writable: true;
        },
        {
          name: "oraclePyth";
        },
        {
          name: "oracleSwitchboardPrice";
        },
        {
          name: "oracleSwitchboardTwap";
        },
        {
          name: "oracleScopeConfig";
        },
        {
          name: "kaminoProgram";
          address: "KLend2g3cP87fffoy8q1mQqGKjrxjC8boSyAYavgmjD";
        },
        {
          name: "instructionSysvar";
          address: "Sysvar1nstructions1111111111111111111111111";
        },
        {
          name: "tokenProgram";
        },
        {
          name: "associatedTokenProgram";
          address: "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL";
        },
        {
          name: "systemProgram";
          address: "11111111111111111111111111111111";
        }
      ];
      args: [];
    },
    {
      name: "initializeVault";
      discriminator: [48, 191, 163, 44, 71, 129, 63, 164];
      accounts: [
        {
          name: "authority";
          writable: true;
          signer: true;
        },
        {
          name: "vaultConfig";
          writable: true;
          pda: {
            seeds: [
              {
                kind: "const";
                value: [
                  118,
                  97,
                  117,
                  108,
                  116,
                  95,
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ];
              }
            ];
          };
        },
        {
          name: "usdcMint";
          docs: [
            "USDC mint. Its pubkey is cached on VaultConfig.usdc_mint; every later",
            "instruction validates against this."
          ];
        },
        {
          name: "ctokenMint";
          docs: [
            "cUSDC (collateral) mint for the chosen Kamino reserve. Its pubkey is",
            "cached on VaultConfig.ctoken_mint. Reserve-agnostic: primary + backup",
            "reserves all work via the same program by caching their specific mints."
          ];
        },
        {
          name: "treasuryUsdcAta";
          docs: [
            "Treasury USDC account that receives the 10% protocol fee.",
            "matching mint in practice — validated by downstream fee-transfer CPIs."
          ];
        },
        {
          name: "kaminoReserve";
          docs: [
            "Kamino reserve we'll CPI into. Trusted config, set at init. Subsequent",
            "CPIs validate against vault_config.kamino_reserve.",
            "any Kamino account passed for deposit/redeem to match this pubkey."
          ];
        },
        {
          name: "vaultUsdcAta";
          docs: [
            "Vault's USDC ATA. Owned by vault_config PDA; used as source on",
            "deposit-to-Kamino and destination on redeem-from-Kamino."
          ];
          writable: true;
          pda: {
            seeds: [
              {
                kind: "account";
                path: "vaultConfig";
              },
              {
                kind: "account";
                path: "tokenProgram";
              },
              {
                kind: "account";
                path: "usdcMint";
              }
            ];
            program: {
              kind: "const";
              value: [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ];
            };
          };
        },
        {
          name: "vaultCtokenAta";
          docs: [
            "Vault's cUSDC ATA. Owned by vault_config PDA; holds Kamino collateral."
          ];
          writable: true;
          pda: {
            seeds: [
              {
                kind: "account";
                path: "vaultConfig";
              },
              {
                kind: "account";
                path: "tokenProgram";
              },
              {
                kind: "account";
                path: "ctokenMint";
              }
            ];
            program: {
              kind: "const";
              value: [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ];
            };
          };
        },
        {
          name: "tokenProgram";
        },
        {
          name: "associatedTokenProgram";
          address: "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL";
        },
        {
          name: "systemProgram";
          address: "11111111111111111111111111111111";
        }
      ];
      args: [
        {
          name: "args";
          type: {
            defined: {
              name: "initializeVaultArgs";
            };
          };
        }
      ];
    },
    {
      name: "rollPeriod";
      discriminator: [30, 184, 166, 42, 251, 204, 47, 107];
      accounts: [
        {
          name: "vaultConfig";
          writable: true;
          pda: {
            seeds: [
              {
                kind: "const";
                value: [
                  118,
                  97,
                  117,
                  108,
                  116,
                  95,
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ];
              }
            ];
          };
        },
        {
          name: "authority";
          signer: true;
          relations: ["vaultConfig"];
        }
      ];
      args: [
        {
          name: "nextPeriodEndTs";
          type: "i64";
        }
      ];
    },
    {
      name: "setFamilyLastDistribution";
      discriminator: [15, 253, 196, 206, 221, 190, 179, 15];
      accounts: [
        {
          name: "vaultConfig";
          pda: {
            seeds: [
              {
                kind: "const";
                value: [
                  118,
                  97,
                  117,
                  108,
                  116,
                  95,
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ];
              }
            ];
          };
        },
        {
          name: "familyPosition";
          writable: true;
        },
        {
          name: "authority";
          signer: true;
          relations: ["vaultConfig"];
        }
      ];
      args: [
        {
          name: "newLastDistribution";
          type: "i64";
        }
      ];
    },
    {
      name: "setPaused";
      discriminator: [91, 60, 125, 192, 176, 225, 166, 218];
      accounts: [
        {
          name: "vaultConfig";
          writable: true;
          pda: {
            seeds: [
              {
                kind: "const";
                value: [
                  118,
                  97,
                  117,
                  108,
                  116,
                  95,
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ];
              }
            ];
          };
        },
        {
          name: "authority";
          signer: true;
          relations: ["vaultConfig"];
        }
      ];
      args: [
        {
          name: "paused";
          type: "bool";
        }
      ];
    },
    {
      name: "withdraw";
      discriminator: [183, 18, 70, 156, 148, 109, 161, 34];
      accounts: [
        {
          name: "familyPosition";
          writable: true;
        },
        {
          name: "parent";
          writable: true;
          signer: true;
          relations: ["familyPosition"];
        },
        {
          name: "parentUsdcAta";
          docs: ["Destination for USDC received on withdraw. Owned by parent."];
          writable: true;
        },
        {
          name: "vaultUsdcAta";
          docs: [
            "Vault's USDC ATA — intermediate: Kamino redeems cTokens → vault_usdc_ata,",
            "then we SPL-transfer vault_usdc_ata → parent_usdc_ata."
          ];
          writable: true;
          pda: {
            seeds: [
              {
                kind: "account";
                path: "vaultConfig";
              },
              {
                kind: "const";
                value: [
                  6,
                  221,
                  246,
                  225,
                  215,
                  101,
                  161,
                  147,
                  217,
                  203,
                  225,
                  70,
                  206,
                  235,
                  121,
                  172,
                  28,
                  180,
                  133,
                  237,
                  95,
                  91,
                  55,
                  145,
                  58,
                  140,
                  245,
                  133,
                  126,
                  255,
                  0,
                  169
                ];
              },
              {
                kind: "account";
                path: "usdcMint";
              }
            ];
            program: {
              kind: "const";
              value: [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ];
            };
          };
        },
        {
          name: "vaultCtokenAta";
          docs: ["Vault's cToken ATA — source for the Kamino redeem."];
          writable: true;
          pda: {
            seeds: [
              {
                kind: "account";
                path: "vaultConfig";
              },
              {
                kind: "const";
                value: [
                  6,
                  221,
                  246,
                  225,
                  215,
                  101,
                  161,
                  147,
                  217,
                  203,
                  225,
                  70,
                  206,
                  235,
                  121,
                  172,
                  28,
                  180,
                  133,
                  237,
                  95,
                  91,
                  55,
                  145,
                  58,
                  140,
                  245,
                  133,
                  126,
                  255,
                  0,
                  169
                ];
              },
              {
                kind: "account";
                path: "ctokenMint";
              }
            ];
            program: {
              kind: "const";
              value: [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ];
            };
          };
        },
        {
          name: "treasuryUsdcAta";
          writable: true;
        },
        {
          name: "vaultConfig";
          writable: true;
          pda: {
            seeds: [
              {
                kind: "const";
                value: [
                  118,
                  97,
                  117,
                  108,
                  116,
                  95,
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ];
              }
            ];
          };
        },
        {
          name: "usdcMint";
        },
        {
          name: "ctokenMint";
          writable: true;
        },
        {
          name: "kaminoReserve";
          writable: true;
        },
        {
          name: "lendingMarket";
        },
        {
          name: "lendingMarketAuthority";
        },
        {
          name: "reserveLiquiditySupply";
          docs: [
            "Kamino's USDC supply vault — Kamino moves USDC FROM here TO vault_usdc_ata."
          ];
          writable: true;
        },
        {
          name: "oraclePyth";
        },
        {
          name: "oracleSwitchboardPrice";
        },
        {
          name: "oracleSwitchboardTwap";
        },
        {
          name: "oracleScopeConfig";
        },
        {
          name: "kaminoProgram";
          address: "KLend2g3cP87fffoy8q1mQqGKjrxjC8boSyAYavgmjD";
        },
        {
          name: "instructionSysvar";
          address: "Sysvar1nstructions1111111111111111111111111";
        },
        {
          name: "tokenProgram";
        },
        {
          name: "associatedTokenProgram";
          address: "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL";
        },
        {
          name: "systemProgram";
          address: "11111111111111111111111111111111";
        }
      ];
      args: [
        {
          name: "sharesToBurn";
          type: "u64";
        },
        {
          name: "minAssetsOut";
          type: "u64";
        }
      ];
    }
  ];
  accounts: [
    {
      name: "familyPosition";
      discriminator: [36, 165, 172, 151, 135, 133, 205, 110];
    },
    {
      name: "kidView";
      discriminator: [55, 153, 116, 41, 232, 15, 3, 157];
    },
    {
      name: "vaultConfig";
      discriminator: [99, 86, 43, 216, 184, 102, 119, 77];
    }
  ];
  events: [
    {
      name: "bonusDistributed";
      discriminator: [39, 65, 38, 119, 55, 71, 232, 194];
    },
    {
      name: "deposited";
      discriminator: [111, 141, 26, 45, 161, 35, 100, 57];
    },
    {
      name: "familyClosed";
      discriminator: [189, 245, 166, 216, 82, 46, 42, 174];
    },
    {
      name: "familyCreated";
      discriminator: [102, 58, 189, 50, 153, 37, 24, 173];
    },
    {
      name: "monthlyAllowanceDistributed";
      discriminator: [219, 207, 188, 229, 66, 155, 153, 239];
    },
    {
      name: "vaultInitialized";
      discriminator: [180, 43, 207, 2, 18, 71, 3, 75];
    },
    {
      name: "withdrawn";
      discriminator: [20, 89, 223, 198, 194, 124, 219, 13];
    }
  ];
  errors: [
    {
      code: 6000;
      name: "vaultPaused";
      msg: "Vault is paused";
    },
    {
      code: 6001;
      name: "tooEarly";
      msg: "Too early: 30-day monthly gate has not elapsed";
    },
    {
      code: 6002;
      name: "bonusAlreadyPaid";
      msg: "Bonus already paid for this period";
    },
    {
      code: 6003;
      name: "bonusPeriodNotEnded";
      msg: "Bonus period not yet ended";
    },
    {
      code: 6004;
      name: "slippageExceeded";
      msg: "Slippage exceeded";
    },
    {
      code: 6005;
      name: "insufficientShares";
      msg: "Insufficient shares";
    },
    {
      code: 6006;
      name: "overflow";
      msg: "Arithmetic overflow";
    },
    {
      code: 6007;
      name: "underflow";
      msg: "Arithmetic underflow";
    },
    {
      code: 6008;
      name: "divisionByZero";
      msg: "Division by zero";
    },
    {
      code: 6009;
      name: "invalidAuthority";
      msg: "Invalid authority for this operation";
    },
    {
      code: 6010;
      name: "invalidStreamRate";
      msg: "Invalid stream rate: must be > 0 and <= MAX_STREAM_RATE";
    },
    {
      code: 6011;
      name: "invalidAmount";
      msg: "Invalid deposit amount: must be > 0";
    },
    {
      code: 6012;
      name: "reserveMismatch";
      msg: "Reserve account does not match cached VaultConfig.kamino_reserve";
    },
    {
      code: 6013;
      name: "mintMismatch";
      msg: "Mint account does not match cached VaultConfig mint";
    },
    {
      code: 6014;
      name: "oracleMismatch";
      msg: "Oracle account does not match cached VaultConfig oracle";
    },
    {
      code: 6015;
      name: "belowDustThreshold";
      msg: "Amount below dust threshold";
    },
    {
      code: 6016;
      name: "sharesInvariantViolation";
      msg: "Invariant violation: total_shares != sum(family_position.shares)";
    },
    {
      code: 6017;
      name: "principalInvariantViolation";
      msg: "Invariant violation: principal over-withdrawn";
    },
    {
      code: 6018;
      name: "kaminoCpiFailed";
      msg: "Kamino CPI failed";
    },
    {
      code: 6019;
      name: "invalidAccountState";
      msg: "Account has unexpected data layout";
    }
  ];
  types: [
    {
      name: "bonusDistributed";
      type: {
        kind: "struct";
        fields: [
          {
            name: "family";
            type: "pubkey";
          },
          {
            name: "kid";
            type: "pubkey";
          },
          {
            name: "amount";
            type: "u64";
          },
          {
            name: "feeToTreasury";
            type: "u64";
          },
          {
            name: "periodId";
            type: "u32";
          },
          {
            name: "ts";
            type: "i64";
          }
        ];
      };
    },
    {
      name: "deposited";
      type: {
        kind: "struct";
        fields: [
          {
            name: "family";
            type: "pubkey";
          },
          {
            name: "depositor";
            docs: [
              "Whoever signed the deposit. May be the family's parent (a normal",
              "top-up) or any other wallet (a gift). Off-chain consumers compare",
              "against `family_position.parent` to distinguish the two cases."
            ];
            type: "pubkey";
          },
          {
            name: "amount";
            type: "u64";
          },
          {
            name: "sharesMinted";
            type: "u64";
          },
          {
            name: "feeToTreasury";
            type: "u64";
          },
          {
            name: "ts";
            type: "i64";
          }
        ];
      };
    },
    {
      name: "familyClosed";
      type: {
        kind: "struct";
        fields: [
          {
            name: "family";
            type: "pubkey";
          },
          {
            name: "parent";
            type: "pubkey";
          },
          {
            name: "kid";
            type: "pubkey";
          },
          {
            name: "sharesRedeemed";
            type: "u64";
          },
          {
            name: "assetsPaidOut";
            type: "u64";
          },
          {
            name: "principalReturned";
            type: "u64";
          },
          {
            name: "yieldReturned";
            type: "u64";
          },
          {
            name: "ts";
            type: "i64";
          }
        ];
      };
    },
    {
      name: "familyCreated";
      type: {
        kind: "struct";
        fields: [
          {
            name: "family";
            type: "pubkey";
          },
          {
            name: "parent";
            type: "pubkey";
          },
          {
            name: "kid";
            type: "pubkey";
          },
          {
            name: "streamRate";
            type: "u64";
          },
          {
            name: "ts";
            type: "i64";
          }
        ];
      };
    },
    {
      name: "familyPosition";
      docs: [
        'Per parent-kid pair. PDA at ["family", parent, kid].',
        "",
        "`shares` is mutated ONLY through `utils::harvest::mint_family_shares` /",
        "`burn_family_shares` which atomically update `VaultConfig.total_shares` by",
        "the same delta. Direct mutation is a footgun — use the helpers.",
        "",
        "`principal_remaining` decreases on monthly allowance (principal-first",
        "drawdown: min(stream_rate, principal_remaining)) and on withdraw.",
        "Bonus calculation is `max(0, family_assets - principal_remaining)` which",
        "by construction represents pure yield.",
        "",
        "`last_distribution` is seeded to `created_at` in `create_family` so the",
        "first monthly allowance cannot fire until 30 days after onboarding. This",
        "prevents the day-1 drain attack."
      ];
      type: {
        kind: "struct";
        fields: [
          {
            name: "parent";
            type: "pubkey";
          },
          {
            name: "kid";
            type: "pubkey";
          },
          {
            name: "shares";
            type: "u64";
          },
          {
            name: "principalDeposited";
            type: "u64";
          },
          {
            name: "principalRemaining";
            type: "u64";
          },
          {
            name: "streamRate";
            type: "u64";
          },
          {
            name: "createdAt";
            type: "i64";
          },
          {
            name: "lastDistribution";
            type: "i64";
          },
          {
            name: "lastBonusPeriodId";
            type: "u32";
          },
          {
            name: "totalYieldEarned";
            type: "u64";
          },
          {
            name: "bump";
            type: "u8";
          }
        ];
      };
    },
    {
      name: "initializeVaultArgs";
      type: {
        kind: "struct";
        fields: [
          {
            name: "oraclePyth";
            docs: [
              "Pyth oracle configured for this reserve. Pubkey::default() = not used."
            ];
            type: "pubkey";
          },
          {
            name: "oracleSwitchboardPrice";
            docs: ["Switchboard price oracle. Pubkey::default() = not used."];
            type: "pubkey";
          },
          {
            name: "oracleSwitchboardTwap";
            docs: ["Switchboard TWAP oracle. Pubkey::default() = not used."];
            type: "pubkey";
          },
          {
            name: "oracleScopeConfig";
            docs: ["Scope oracle config. Pubkey::default() = not used."];
            type: "pubkey";
          },
          {
            name: "periodEndTs";
            docs: [
              "Unix timestamp when the current bonus period ends (e.g. Dec 1 2026 UTC)."
            ];
            type: "i64";
          },
          {
            name: "feeBps";
            docs: [
              "Protocol fee in basis points. Pass 1000 for the 10% default."
            ];
            type: "u16";
          }
        ];
      };
    },
    {
      name: "kidView";
      docs: [
        "Read-only PDA derived for the kid so the kid-facing URL has a canonical,",
        "shareable address. Kid never signs in v1."
      ];
      type: {
        kind: "struct";
        fields: [
          {
            name: "familyPosition";
            type: "pubkey";
          },
          {
            name: "bump";
            type: "u8";
          }
        ];
      };
    },
    {
      name: "monthlyAllowanceDistributed";
      type: {
        kind: "struct";
        fields: [
          {
            name: "family";
            type: "pubkey";
          },
          {
            name: "kid";
            type: "pubkey";
          },
          {
            name: "streamRate";
            type: "u64";
          },
          {
            name: "principalDrawdown";
            type: "u64";
          },
          {
            name: "yieldDrawdown";
            type: "u64";
          },
          {
            name: "feeToTreasury";
            type: "u64";
          },
          {
            name: "ts";
            type: "i64";
          }
        ];
      };
    },
    {
      name: "vaultConfig";
      docs: [
        'One global config per deployment. PDA at ["vault_config"].',
        "",
        "`total_shares` and `last_known_total_assets` are the ERC-4626 accounting pair:",
        "shares × last_known_total_assets gives the pool's USDC-equivalent value at",
        "the last harvest. Mutated ONLY through `utils::harvest::harvest_and_fee` and",
        "`mint_family_shares` / `burn_family_shares` to keep the invariant",
        "`total_shares == sum(family_position.shares)` enforceable at the API boundary."
      ];
      type: {
        kind: "struct";
        fields: [
          {
            name: "authority";
            type: "pubkey";
          },
          {
            name: "treasury";
            type: "pubkey";
          },
          {
            name: "feeBps";
            type: "u16";
          },
          {
            name: "kaminoReserve";
            type: "pubkey";
          },
          {
            name: "usdcMint";
            type: "pubkey";
          },
          {
            name: "ctokenMint";
            type: "pubkey";
          },
          {
            name: "oraclePyth";
            type: "pubkey";
          },
          {
            name: "oracleSwitchboardPrice";
            type: "pubkey";
          },
          {
            name: "oracleSwitchboardTwap";
            type: "pubkey";
          },
          {
            name: "oracleScopeConfig";
            type: "pubkey";
          },
          {
            name: "totalShares";
            type: "u64";
          },
          {
            name: "lastKnownTotalAssets";
            type: "u64";
          },
          {
            name: "periodEndTs";
            type: "i64";
          },
          {
            name: "currentPeriodId";
            type: "u32";
          },
          {
            name: "isPaused";
            type: "bool";
          },
          {
            name: "bump";
            type: "u8";
          }
        ];
      };
    },
    {
      name: "vaultInitialized";
      type: {
        kind: "struct";
        fields: [
          {
            name: "authority";
            type: "pubkey";
          },
          {
            name: "treasury";
            type: "pubkey";
          },
          {
            name: "kaminoReserve";
            type: "pubkey";
          },
          {
            name: "usdcMint";
            type: "pubkey";
          },
          {
            name: "ctokenMint";
            type: "pubkey";
          },
          {
            name: "ts";
            type: "i64";
          }
        ];
      };
    },
    {
      name: "withdrawn";
      type: {
        kind: "struct";
        fields: [
          {
            name: "family";
            type: "pubkey";
          },
          {
            name: "parent";
            type: "pubkey";
          },
          {
            name: "sharesBurned";
            type: "u64";
          },
          {
            name: "assetsOut";
            type: "u64";
          },
          {
            name: "principalDrawdown";
            type: "u64";
          },
          {
            name: "yieldDrawdown";
            type: "u64";
          },
          {
            name: "feeToTreasury";
            type: "u64";
          },
          {
            name: "ts";
            type: "i64";
          }
        ];
      };
    }
  ];
};
