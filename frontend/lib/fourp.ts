// Server-only 4P Finance client. Wraps Pix on-ramp, USDC off-ramp,
// price quote, and notification fetch. Reads FOURP_API_KEY at call
// time so a missing env var fails the request, not the build.
//
// Docs: ../../docs/4p-finance-api.md
//
// Why server-only: 4P explicitly forbids exposing the API key to the
// client. The `import "server-only"` line makes Next.js refuse to
// bundle this file into any client component, so a misuse fails at
// build time instead of leaking the key in production.

import "server-only";

const ON_RAMP_PATH = "/pix/transaction";
const OFF_RAMP_PATH = "/cryptopix/transaction";
const QUOTE_PATH = "/transaction/price_conversion";
const NOTIFICATION_PATH = "/notification";

// 4P's outbound webhook origin. We allowlist this in the webhook
// route so spoofed POSTs from elsewhere can't trigger our handler.
export const FOURP_WEBHOOK_IP = "44.196.63.157";

function getEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    throw new Error(
      `Missing env var ${name}. Set it in .env.local locally and in Vercel for deploys.`
    );
  }
  return v;
}

function baseUrl(): string {
  return process.env.FOURP_BASE_URL ?? "https://api.4p.finance/v1";
}

// Single fetch wrapper — adds the auth header, surfaces 4P's error
// shape verbatim instead of swallowing it. Caller controls method.
async function fourpFetch<T>(
  path: string,
  init: { method: "GET" | "POST" | "PUT"; body?: unknown }
): Promise<T> {
  const url = `${baseUrl()}${path}`;
  const headers: Record<string, string> = {
    "x-api-key": getEnv("FOURP_API_KEY"),
  };
  if (init.body !== undefined) {
    headers["content-type"] = "application/json";
  }

  const res = await fetch(url, {
    method: init.method,
    headers,
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(
      `4P ${init.method} ${path} failed: ${res.status} ${res.statusText} — ${text}`
    );
  }
  return JSON.parse(text) as T;
}

// 4P wraps every successful response in this envelope.
export interface FourpEnvelope<T> {
  http_code: number;
  success: boolean;
  info: {
    result: string;
    message?: string;
    data: T;
  };
}

// ---------- on-ramp (Pix → USDC on Solana) ----------

export interface CreateOnrampInput {
  cpf?: string;
  cnpj?: string;
  email: string;
  amountBrl: number;
  expiresSeconds: number;
  customId: string;
  description: string;
  notificationUrl: string;
  receiverWallet: string;
}

export interface OnrampOrder {
  txid: string;
  pixCopiaECola: string;
  pixKey: string;
  status: string;
  expiresInSeconds: number;
  createdAt: string;
}

export async function createOnrampOrder(
  input: CreateOnrampInput
): Promise<OnrampOrder> {
  if (!input.cpf && !input.cnpj) {
    throw new Error("createOnrampOrder requires cpf or cnpj");
  }

  const body: Record<string, unknown> = {
    email: input.email,
    amount: input.amountBrl,
    expires: input.expiresSeconds,
    custom_id: input.customId,
    description: input.description,
    notification_url: input.notificationUrl,
    custom_data: { receiver_wallet: input.receiverWallet },
  };
  if (input.cpf) body.cpf = input.cpf;
  if (input.cnpj) body.cnpj = input.cnpj;

  type Raw = {
    txid: string;
    pixCopiaECola: string;
    chave: string;
    status: string;
    calendario: { criacao: string; expiracao: number };
  };

  const env = await fourpFetch<FourpEnvelope<Raw>>(ON_RAMP_PATH, {
    method: "PUT",
    body,
  });

  // 4P sometimes returns HTTP 200 with success:false — application-level
  // rejection (validation, rate limit, account state, etc.). The data
  // field is missing in that case. Surface their actual message instead
  // of crashing on `d.txid` of undefined.
  const d = env.info?.data;
  if (!env.success || !d) {
    const reason =
      env.info?.message ?? env.info?.result ?? "no message from 4P";
    throw new Error(`4P rejected on-ramp: ${reason}`);
  }
  return {
    txid: d.txid,
    pixCopiaECola: d.pixCopiaECola,
    pixKey: d.chave,
    status: d.status,
    expiresInSeconds: d.calendario.expiracao,
    createdAt: d.calendario.criacao,
  };
}

// ---------- off-ramp (USDC on Solana → Pix BRL) ----------

export interface CreateOfframpInput {
  personDocument: string;
  email: string;
  amountUsdc: number;
  customId: string;
  asset: string;
  chain: string;
  senderWallet: string;
  destinationPixKey: string;
  notificationUrl: string;
}

export interface OfframpOrder {
  txid: string;
  amountCrypto: number;
  amountBrl: number;
  asset: string;
  chain: string;
  receiverWallet: string;
  expiresAtUnix: number;
}

export async function createOfframpOrder(
  input: CreateOfframpInput
): Promise<OfframpOrder> {
  type Raw = {
    txid: string;
    amount_crypto: number;
    amount_brl: number;
    asset: string;
    chain: string;
    receiver_wallet: string;
    expires: number;
  };

  const env = await fourpFetch<FourpEnvelope<Raw>>(OFF_RAMP_PATH, {
    method: "PUT",
    body: {
      person_document: input.personDocument,
      email: input.email,
      amount_crypto: input.amountUsdc,
      custom_id: input.customId,
      custom_data: { asset: input.asset, chain: input.chain },
      sender_wallet: input.senderWallet,
      destination_pix_key: input.destinationPixKey,
      notification_url: input.notificationUrl,
    },
  });

  const d = env.info.data;
  return {
    txid: d.txid,
    amountCrypto: d.amount_crypto,
    amountBrl: d.amount_brl,
    asset: d.asset,
    chain: d.chain,
    receiverWallet: d.receiver_wallet,
    expiresAtUnix: d.expires,
  };
}

// ---------- quote (BRL → asset) ----------

export interface QuoteInput {
  amount: number;
  fromSymbol: string;
  toSymbol: string;
}

// 4P returns price under `quote[<toSymbol>].price`, but that price is
// the per-unit rate in fromSymbol (i.e. how many fromSymbol per 1 of
// toSymbol). The amount to convert is on the response root. Callers
// generally want both; we surface them as-is.
export interface QuoteResult {
  symbol: string;
  amount: string;
  pricePerUnit: number;
  lastUpdated: string;
}

export async function quote(input: QuoteInput): Promise<QuoteResult> {
  type Raw = {
    symbol: string;
    amount: string;
    last_updated: string;
    quote: Record<string, { price: number; last_updated: string }>;
  };

  const env = await fourpFetch<FourpEnvelope<Raw>>(QUOTE_PATH, {
    method: "POST",
    body: {
      amount: String(input.amount),
      currency_from_symbol: input.fromSymbol,
      convert: input.toSymbol,
    },
  });

  const d = env.info.data;
  const q = d.quote[input.toSymbol];
  if (!q) {
    throw new Error(
      `4P quote response missing "${input.toSymbol}" — got: ${Object.keys(
        d.quote
      ).join(", ")}`
    );
  }
  return {
    symbol: d.symbol,
    amount: d.amount,
    pricePerUnit: q.price,
    lastUpdated: q.last_updated,
  };
}

// ---------- notification fetch (called from webhook) ----------

// 4P's notification payload varies between on-ramp step 1 (Pix paid),
// on-ramp step 2 (USDC delivered), and off-ramp completion. We
// surface the union and let callers branch on `custom_data` presence.
export interface Notification {
  id: string;
  txid: string;
  status: string;
  amount: string;
  description?: string;
  payerInfo?: string;
  paymentDateTime?: string;
  createdAt?: string;
  confirmedAt?: string;
  customId: string;
  customData?: {
    chainName?: string;
    amountUsdt?: string;
    receiverWallet?: string;
    transactionHash?: string;
  };
}

export async function getNotification(token: string): Promise<Notification> {
  type Raw = {
    id: string;
    txid: string;
    status: string;
    amount: string;
    description?: string;
    payer_info?: string;
    payment_date_time?: string;
    created_at?: string;
    confirmed_at?: string;
    custom_id: string;
    custom_data?: {
      chain_name?: string;
      amount_usdt?: string;
      receiver_wallet?: string;
      transaction_hash?: string;
    };
  };

  const env = await fourpFetch<FourpEnvelope<Raw>>(
    `${NOTIFICATION_PATH}/${encodeURIComponent(token)}`,
    { method: "GET" }
  );

  const d = env.info.data;
  return {
    id: d.id,
    txid: d.txid,
    status: d.status,
    amount: d.amount,
    description: d.description,
    payerInfo: d.payer_info,
    paymentDateTime: d.payment_date_time,
    createdAt: d.created_at,
    confirmedAt: d.confirmed_at,
    customId: d.custom_id,
    customData: d.custom_data && {
      chainName: d.custom_data.chain_name,
      amountUsdt: d.custom_data.amount_usdt,
      receiverWallet: d.custom_data.receiver_wallet,
      transactionHash: d.custom_data.transaction_hash,
    },
  };
}
