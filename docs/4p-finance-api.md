# 4P Finance API — integration reference

> Source: official docs at https://docs.4p.finance (captured 2026-05-05).
> This file is the single source of truth for the Seedling ↔ 4P integration.
> If 4P updates their docs, refresh this file rather than chasing the original.

---

## TL;DR — what we use 4P for

- **On-ramp**: parent pays BRL via Pix → 4P swaps to USDC → 4P sends USDC on **Solana** to the wallet we specify (the family vault USDC ATA).
- **Off-ramp**: kid (or parent on their behalf) sends USDC on Solana from a known sender wallet → 4P swaps to BRL → 4P sends Pix to the destination key.
- **Webhook**: 4P POSTs only a notification token to our callback URL; we then `GET /notification/:token` to retrieve the actual transaction state.
- **No smart contracts on 4P's side.** Everything is HTTP.

---

## Auth & secrets

| Item | Value / location |
|---|---|
| Auth header | `x-api-key: <YOUR_KEY>` |
| Base URL | `https://api.4p.finance/v1` |
| Where to store the key | `.env.local` as `FOURP_API_KEY` (server-only — **never** ship to client) |
| Outbound webhook IP (allowlist) | `44.196.63.157` |
| Activation requirement | After "Criar Integração" in the 4P dashboard, **email/WhatsApp 4P support with the registered email** to ask them to enable your key. The key is dead until then. |

> ⚠️ **All 4P calls must run server-side.** Their docs are explicit: never put the API key in a frontend bundle. In Next.js terms: API routes only, never client components.

### Network/asset configuration is set during activation

When you contact 4P support to activate your key, you tell them:
- Which **chain** you'll receive on (we say: `Solana`)
- Which **asset** you want USDC denominated as (we say: `USDC`)

After that, 4P's swap engine routes everything to USDC-on-Solana for our account by default.

---

## Endpoints we use

### 1. Price quote (optional, but useful for UX)

`POST /transaction/price_conversion`

**Body**
```json
{
  "amount": "50.10",
  "currency_from_symbol": "BRL",
  "convert": "USDC"
}
```

**Use case**: show "you'll receive ~$X USDC" before the parent commits to the Pix charge.

---

### 2. On-ramp — create Pix-in transaction

`PUT /pix/transaction`

**Body**
```json
{
  "cpf": "01234567899",
  "email": "parent@example.com",
  "amount": 50.00,
  "expires": 3600,
  "custom_id": "seedling-onramp-<familyPda>-<uuid>",
  "custom_data": {
    "receiver_wallet": "<vault USDC ATA on Solana>"
  },
  "description": "Seedling top-up — <kid name>",
  "notification_url": "https://seedlingsol.xyz/api/4p/webhook?token=<our-secret>&kind=onramp&custom_id=<the-custom_id>"
}
```

**Field notes**
- `cpf` (or `cnpj` for legal entity). For minors we'd use the parent's CPF.
- `amount` — BRL, decimal. Min 0.01.
- `expires` — Pix charge TTL in seconds. Min 300, max 259200.
- `custom_id` — must be unique per request, ≤255 chars. We use `seedling-onramp-<familyPda>-<uuid>` so reconciliation back to a family is trivial.
- `custom_data.receiver_wallet` — destination on whatever chain we activated (Solana for us, so this is a base58 Solana pubkey, ideally the family vault's USDC ATA).
- `description` — shown to payer in their Pix app. ≤140 chars.
- `notification_url` — **must be HTTPS**. Append our own token + identifying params so we can validate webhooks without trusting the body alone.

**Response (200)**
```json
{
  "http_code": 200,
  "success": true,
  "info": {
    "result": "pix_transaction_created",
    "data": {
      "calendario": { "criacao": "...", "expiracao": 3600 },
      "valor": { "modalidadeAlteracao": 0, "original": 50.00 },
      "chave": "<4p pix key>",
      "txid": "<4p tx id>",
      "location": "brcode.infra.com/v2/<id>",
      "pixCopiaECola": "<the long Pix copy-paste string>",
      "status": "ATIVA"
    }
  }
}
```

**What we do with the response**
- Surface `pixCopiaECola` to the user (copy button + QR code we generate ourselves — 4P does NOT return a QR image).
- Store `txid` + our `custom_id` in our DB (or KV) keyed by the family, so we can reconcile when the webhook fires.

---

### 3. Off-ramp — create crypto-out / Pix-in transaction

`PUT /cryptopix/transaction`

**Body**
```json
{
  "person_document": "01234567899",
  "email": "parent@example.com",
  "amount_crypto": 25.00,
  "custom_id": "seedling-offramp-<familyPda>-<uuid>",
  "custom_data": {
    "asset": "USDC",
    "chain": "Solana"
  },
  "sender_wallet": "<the wallet that will send USDC — we lock this>",
  "destination_pix_key": "<parent's Pix key — CPF, email, phone, or random>",
  "notification_url": "https://seedlingsol.xyz/api/4p/webhook?token=<our-secret>&kind=offramp&custom_id=<the-custom_id>"
}
```

**Field notes**
- `sender_wallet` is **enforced** by 4P. They will only credit the off-ramp if the USDC arrives from exactly this address. For us, this is the parent's connected wallet (we read it server-side from the signed request).
- `amount_crypto` — USDC, decimal.
- `destination_pix_key` — falls back to the Pix key already linked to the 4P account if omitted.
- `custom_data.chain` — string, case-insensitive in their examples (`Arbitrum` / `arbitrum` both appear). Use `Solana`.

**Response (200)**
```json
{
  "http_code": 200,
  "success": true,
  "info": {
    "result": "p2p_transaction_cryptopix_created",
    "data": {
      "txid": "<4p tx id>",
      "amount_crypto": 25.00,
      "asset": "USDC",
      "chain": "solana",
      "amount_brl": 124.50,
      "receiver_wallet": "<4p's Solana receiving wallet — USDC goes here>",
      "expires": 1769608117
    }
  }
}
```

**What we do with the response**
- Build a Solana transaction that sends `amount_crypto` USDC from `sender_wallet` to `receiver_wallet`.
- Have the parent sign + send it.
- Wait for the webhook.

⚠️ **`expires` is the deadline by which the USDC must arrive.** Past that window, the off-ramp order dies and we'd need to create a new one.

---

### 4. Webhook — receiving notifications

**Flow:**
1. 4P POSTs to our `notification_url` (only a notification token in the body, no transaction data).
2. We `GET /notification/:token` with our `x-api-key` to fetch the actual state.
3. Repeat the GET later if we want fresh status — the same token returns updated status as the operation progresses (`pending` → `processing` → `success` / `error`).

**On-ramp triggers two webhooks per transaction:**
1. After Pix payment confirmation
2. After USDC delivery on Solana

**Off-ramp triggers one webhook per transaction:**
1. After Pix payout to the destination key

**Webhook security checklist (we MUST do all four):**
- [ ] Our `notification_url` is HTTPS (Vercel gives us this for free)
- [ ] We embed our own token in the URL query string and validate it server-side
- [ ] We allowlist `44.196.63.157` (or just check `req.headers['x-forwarded-for']` matches it)
- [ ] We treat the POST body as untrusted — only the response from `GET /notification/:token` is authoritative

**Notification GET response (Pix paid — on-ramp step 1)**
```json
{
  "info": {
    "data": {
      "id": "<notification id>",
      "txid": "<4p tx id>",
      "status": "paid",
      "amount": "50.00",
      "description": "...",
      "payer_info": "Nome do pagador - 123.456.789-00",
      "payment_date_time": "01/01/2026, 11:46:21",
      "confirmed_at": "01/01/2026, 11:46:25",
      "custom_id": "<our custom_id>"
    }
  }
}
```

**Notification GET response (USDC delivered — on-ramp step 2)**
```json
{
  "info": {
    "data": {
      "...same fields plus...": "...",
      "custom_data": {
        "chain_name": "Solana",
        "amount_usdt": "9.99",
        "receiver_wallet": "<our vault ATA>",
        "transaction_hash": "<Solana tx signature>"
      }
    }
  }
}
```

> Note: 4P's example uses `amount_usdt` even when the asset is USDC. Don't be confused — same field name, different asset depending on activation. The `transaction_hash` is the on-chain signature we'd link to in the dashboard.

**4P retries unfetched notifications for 5 days.** If our system crashes mid-processing, we just GET the token again on next start — they treat the GET as our ack.

---

## Supported chains (for our records)

For both on-ramp and off-ramp:
Ethereum · Bitcoin · HyperEVM · **Solana** · Tron · Arbitrum · Base · Polygon · BNB Smart Chain · Avalanche · Optimism

Our activation: **Solana / USDC**.

---

## Hackathon-specific notes

- **2026-05-04**: 4P confirmed via WhatsApp that the API will be made available exclusively for the hackathon (`Sera exclusiva para o hackaton, sendo que posteriormente sera avaliado o risco individual do negocio`). Post-hackathon access requires a business risk evaluation.
- **2026-05-05**: API key generated via dashboard "Criar Integração" — Vicenzo holds the key locally. Adult CPF `01927755964` was used for the dashboard signup (Vicenzo is 16, so the dashboard owner is registered to an adult guardian).
- **Activation status**: pending — 4P must still flip the key to "active" against the registered email. Do this before writing the first integration test against real endpoints.

---

## Our integration plan (frontend repo)

```
frontend/
├── .env.local                        # FOURP_API_KEY=...
├── lib/
│   └── fourp.ts                      # server-only client (auth + signed fetch helpers)
└── app/
    └── api/
        └── 4p/
            ├── onramp/route.ts       # POST: create Pix-in order, return pixCopiaECola
            ├── offramp/route.ts      # POST: create crypto-out order, return receiver_wallet
            └── webhook/route.ts      # POST: receive token, GET /notification/:token, update state
```

State store for pending orders: `KV` (Vercel KV) or, simpler for the hackathon, an in-memory `Map` with a TTL — fine since the demo runs in a single Vercel region.

---

## Contact

- WhatsApp: https://4p.finance/whatsapp-redirect
- Integration support: suporte.api@4p.finance
