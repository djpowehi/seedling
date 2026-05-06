// English translations. The keys here are the canonical set — pt-BR.ts
// must satisfy this exact shape (TS-enforced via `Translations` type).
//
// Convention: keys use namespace prefixes so we can track coverage per
// surface (`landing.*`, `nav.*`, `dashboard.*`, `kid.*`, `pix.*`,
// `gifts.*`, `forms.*`, `errors.*`).
//
// Placeholders use `{name}` form. Caller passes a `vars` map to t().

export const en = {
  // ---- locale toggle ----
  "locale.toggle.aria": "Switch language",

  // ---- shared nav ----
  "nav.live.devnet": "live on Solana devnet · mainnet soon",
  "nav.live.short": "live on Solana",

  // ---- landing ----
  "landing.eyebrow": "Family allowance, on-chain · on Solana",
  "landing.headline.line1": "allowance",
  "landing.headline.line2": "that {italic}.",
  "landing.headline.italic": "grows",
  "landing.subhead":
    "Money grows. Habits grow. Your kid grows with both. One deposit funds all of your kid's monthly allowances — and a year-end bonus that comes from yield, not your wallet.",
  "landing.cta.dashboard": "open dashboard",
  "landing.cta.label": "Open the dashboard",
  "landing.cta.note": "Live on Solana · no wallet required to look around",
  "landing.section.howit.label_num": "02",
  "landing.section.howit.label": "How it works",
  "landing.section.howit.sub": "Three steps · one decision",
  "landing.step.i.title": "Parents deposit USDC, once.",
  "landing.step.i.body":
    "One transaction sets the principal. No subscriptions, no monthly chores.",
  "landing.step.ii.title": "Kamino lends it at ~8% APY.",
  "landing.step.ii.body":
    "The vault deposits into Kamino lending. Yield compounds in the background. Estimated · based on current rates.",
  "landing.step.iii.title": "Kids get paid monthly. Bonus at year-end.",
  "landing.step.iii.body":
    "The 1st of every month, the allowance arrives. Year-end brings the annual bonus — pure yield. Seedling rewards time: the longer money stays, the more the kid earns.",
  "landing.section.product.label_num": "03",
  "landing.section.product.label": "The product",
  "landing.section.product.sub": "Two views · same family",
  "landing.shot.parent.tag": "screen 01 · parent",
  "landing.shot.parent.alt": "Seedling parent dashboard with two kids saving",
  "landing.shot.parent.caption": "Parent dashboard",
  "landing.shot.parent.caption_sub": "deposit · withdraw · monthly · bonus",
  "landing.shot.kid.tag": "screen 02 · kid",
  "landing.shot.kid.alt":
    "Seedling kid view with a growing tree and live yield ticker",
  "landing.shot.kid.caption": "Kid view",
  "landing.shot.kid.caption_sub": "a tree, growing — no wallet needed",
  "landing.footer.built": "Built on Kamino · Solana",
  "landing.footer.copy": "© 2026 · seedlingsol.xyz",

  // ---- mainnet notify ----
  "mainnet.headline": "mainnet soon.",
  "mainnet.body":
    "want a heads-up when families can deposit real USDC? send us a DM on X — we'll ping you the day mainnet goes live.",
  "mainnet.cta": "DM @{handle} on X",
  "mainnet.fine": "no list · no spam · just a heads-up DM",

  // ---- dashboard ----
  "dashboard.eyebrow": "parent dashboard",
  "dashboard.title.loading": "loading…",
  "dashboard.title.first": "start the {italic}.",
  "dashboard.title.first.italic": "first",
  "dashboard.title.kids": "{count} {kidWord} {italic}.",
  "dashboard.title.kids.italic": "saving",
  "dashboard.title.word.kid": "kid",
  "dashboard.title.word.kids": "kids",
  "dashboard.subtitle": "all live on Solana",
  "dashboard.fetching": "Fetching from devnet…",
  "dashboard.error.load": "Couldn't load families. {error}",
  "dashboard.add_another": "add another kid",

  // ---- connect gate ----
  "gate.eyebrow": "sign in",
  "gate.title": "connect to see {italic}.",
  "gate.title.italic": "your families",
  "gate.body":
    "Seedling lives on Solana. Connect Phantom or Solflare to view your kids' positions, deposit USDC, and trigger distributions.",

  // ---- footer ----
  "footer.github": "github",
  "footer.x": "@seedling_sol",

  // ---- family card ----
  "card.unnamed": "unnamed",
  "card.rename.tooltip": "click to rename",
  "card.cadence.suffix": "cadence",
  "card.created_ago": "created {ago}",
  "card.last_paid": "last paid {ago}",
  "card.share_link": "share link",
  "card.copy_link": "copy link",
  "card.kids_page": "kid's page",
  "card.stat.stream": "Stream",
  "card.stat.stream_value": "${amount}/mo",
  "card.stat.stream_sub": "usdc",
  "card.stat.principal": "Principal",
  "card.stat.principal_sub": "locked in vault",
  "card.stat.shares": "Shares",
  "card.stat.shares_sub": "of vault total",
  "card.stat.yield": "Yield earned",
  "card.deposit": "deposit",
  "card.pay_pix": "pay with Pix",
  "card.withdraw": "withdraw",
  "card.withdraw_pix": "withdraw to Pix",
  "card.send_monthly": "Send monthly",
  "card.sending": "sending…",
  "card.monthly_in": "Monthly in {countdown}",
  "card.send_bonus": "Send bonus",
  "card.bonus_in": "Bonus in {countdown}",
  "card.bonus_loading": "Bonus in …",
  "card.remove_kid": "remove kid",
  "card.removing": "removing…",
  "card.cadence_topup_eyebrow": "{cadence} cadence · this month",
  "card.cadence_topup_title": "deposit ${amount} to keep yield growing",
  "card.cadence_topup_cta": "+ top up",

  // ---- empty state ----
  "empty.title": "no kids yet",
  "empty.body":
    "Add your first kid to start their seedling vault. Deposits earn yield on Kamino, allowance flows monthly.",
  "empty.cta": "+ add a kid",

  // ---- add kid form ----
  "add_kid.title": "add a kid",
  "add_kid.cancel": "cancel",
  "add_kid.kid_pubkey.label": "Kid's wallet pubkey",
  "add_kid.kid_pubkey.help":
    "Generate a new keypair if you don't have one. They'll receive their allowance here.",
  "add_kid.stream.label": "Monthly allowance ($USDC)",
  "add_kid.stream.placeholder": "20",
  "add_kid.principal.label": "Initial deposit ($USDC, optional)",
  "add_kid.principal.placeholder": "240",
  "add_kid.principal.help":
    "Pre-fund the vault if you want. You can always deposit later.",
  "add_kid.submit": "create",
  "add_kid.creating": "creating…",
  "add_kid.error.kid_pubkey.empty": "kid pubkey required",
  "add_kid.error.kid_pubkey.invalid": "not a valid Solana pubkey",
  "add_kid.error.kid_pubkey.duplicate":
    "you already have a seedling for this kid",
  "add_kid.error.stream.empty": "monthly amount required",
  "add_kid.error.stream.positive": "must be positive",
  "add_kid.error.stream.too_high": "max ${max} / month",

  // ---- deposit (USDC wallet) form ----
  "deposit.title": "Deposit USDC",
  "deposit.error.insufficient_usdc":
    "Insufficient USDC. Use the faucets below.",
  "deposit.error.insufficient":
    "Insufficient SOL or USDC. Check the faucets below.",
  "deposit.error.paused": "The vault is paused. Try again later.",
  "deposit.error.slippage": "Share price moved during deposit. Try again.",
  "deposit.error.amount_required": "must be a number",
  "deposit.error.amount_positive": "must be positive",
  "deposit.error.amount_max": "max ${max} per deposit",
  "deposit.faucets": "Need USDC? {solLink} → {usdcLink}",
  "deposit.button.confirming": "Confirming…",
  "deposit.button.submit": "Deposit",
  "deposit.toast.title": "deposit confirmed",
  "deposit.toast.subtitle": "added to vault · earning yield on Kamino",

  // ---- withdraw form ----
  "withdraw.title": "Withdraw",
  "withdraw.button.submit": "Withdraw",
  "withdraw.button.confirming": "Confirming…",
  "withdraw.toast.title": "withdrawal confirmed",
  "withdraw.toast.subtitle": "USDC returned to your wallet",

  // ---- pix on-ramp form (parent + gift share most copy) ----
  "pix.cancel": "cancel",
  "pix.deposit.title": "Pay with Pix",
  "pix.amount.brl": "Amount in BRL",
  "pix.amount.placeholder": "100.00",
  "pix.amount.error.number": "must be a number",
  "pix.amount.error.min": "min R${min}",
  "pix.amount.error.max": "max R${max}",
  "pix.profile.cpf": "CPF",
  "pix.profile.cpf.placeholder": "000.000.000-00",
  "pix.profile.email": "Email",
  "pix.profile.email.placeholder": "you@example.com",
  "pix.profile.fine":
    "Required by 4P (our Brazilian payment partner). Stored only on this device — never sent to our servers.",
  "pix.profile.error.cpf": "cpf is invalid",
  "pix.profile.error.email": "email is invalid",
  "pix.profile.paying_as": "Paying as {cpf} · {email}",
  "pix.profile.from": "From {cpf} · {email}",
  "pix.profile.change": "change",
  "pix.submit.generating": "Generating Pix…",
  "pix.submit.generate": "Generate Pix charge",
  "pix.error.not_authorized":
    "Pix is not yet enabled. Our payment partner is finalizing setup — try again soon.",
  "pix.awaiting.title": "Pay R${amount} via Pix",
  "pix.awaiting.body":
    "Open your bank app, scan the QR or paste the code below. The vault will be credited automatically the moment 4P confirms.",
  "pix.awaiting.copy_label": "Pix copia-e-cola",
  "pix.awaiting.copied": "copied",
  "pix.awaiting.copy": "copy",
  "pix.awaiting.waiting": "Waiting for payment…",
  "pix.awaiting.expired": "Waiting for payment · expired",
  "pix.awaiting.expires_in": "expires in {minutes}m {seconds}s",
  "pix.success.title": "Vault credited",
  "pix.success.closing": "closing…",
  "pix.deposit.toast.title": "Pix received · vault credited",
  "pix.deposit.toast.subtitle": "via 4P · earning yield on Kamino",

  // ---- pix off-ramp ----
  "pix.offramp.title": "Withdraw to Pix",
  "pix.offramp.body":
    "One signature withdraws and forwards to your bank via Pix. Arrives in ~10 seconds.",
  "pix.offramp.amount.label": "Amount in USDC",
  "pix.offramp.amount.placeholder": "50.00",
  "pix.offramp.pixkey.label": "Destination Pix key",
  "pix.offramp.pixkey.placeholder": "CPF · phone · email · random key",
  "pix.offramp.submit": "Withdraw to Pix",
  "pix.offramp.submitting": "Confirming…",
  "pix.offramp.toast.title": "Pix on its way to your bank",
  "pix.offramp.toast.subtitle": "R${amount} · 4P delivering · ~10s",
  "pix.offramp.success": "Pix sent · R${amount} arriving",
  "pix.offramp.error.slippage":
    "Share price moved during withdrawal. Try again — buffer should cover it.",
  "pix.offramp.error.paused": "Vault is paused. Try again later.",

  // ---- pix gift modal ----
  "pix.gift.eyebrow": "give to · seedling · pix",
  "pix.gift.title": "gift to {name} in BRL",
  "pix.gift.body":
    "No crypto needed. Pay in BRL via Pix; the family receives the equivalent in USDC, automatically.",
  "pix.gift.your_name": "your name (optional)",
  "pix.gift.your_name.placeholder": "Vovó · Tio · …",
  "pix.gift.amount": "amount (BRL)",
  "pix.gift.amount.custom": "custom",
  "pix.gift.fine":
    "required by 4P, our Brazilian payment partner. used only for this transaction.",
  "pix.gift.submit": "Generate R${amount} Pix charge",
  "pix.gift.submitting": "Generating Pix…",
  "pix.gift.success.title": "Gift received · vault credited",
  "pix.gift.success.body":
    "Thank you for the gift. {name} vault has been topped up and is now earning yield on Kamino.",
  "pix.gift.success.close": "close",
  "pix.gift.this_family": "this family",

  // ---- kid view ----
  "kid.greeting": "hi {name}",
  "kid.greeting.fallback": "friend",
  "kid.eyebrow": "your seedling",
  "kid.value.label": "Total value",
  "kid.principal": "Principal",
  "kid.yield_earned": "Yield earned",
  "kid.next_allowance": "Next allowance",
  "kid.next_allowance.ready": "available now",
  "kid.next_allowance.in": "in {days}d {hours}h",
  "kid.bonus_in": "Annual bonus in {days}d",
  "kid.bonus_ready": "Annual bonus ready",
  "kid.gift_cta.line": "send a gift",
  "kid.gift_cta.hint": "grandma · auntie · anyone",
  "kid.gift_pix.line": "gift in BRL via Pix",
  "kid.gift_pix.hint": "no crypto wallet needed",
  "kid.gifts_received": "gifts received",

  // ---- gifts ----
  "gifts.section.title": "gifts received",
  "gifts.empty": "no gifts yet · share your link to receive some",
  "gifts.from": "from {name}",
  "gifts.anonymous": "anonymous gift",

  // ---- generic ----
  "generic.cancel": "cancel",
  "generic.save": "save",
  "generic.close": "close",
  "generic.copy": "copy",
  "generic.copied": "copied",
  "generic.loading": "loading…",
  "generic.try_again": "try again",
  "generic.usdc": "USDC",
  "generic.brl": "BRL",
} as const;

// Type for satellite locale files (pt-BR, future) — keys are fixed
// from `en` for compile-time coverage, but values are plain strings.
export type Translations = Record<keyof typeof en, string>;
