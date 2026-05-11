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
    "Money grows. Responsibility grows. Your kid grows with both. One deposit funds all of your kid's monthly allowances — and a year-end bonus, paid by what the money earned, not your wallet.",
  "landing.cta.dashboard": "open dashboard",
  "landing.cta.label": "Open the dashboard",
  "landing.cta.note": "Live on Solana · no wallet required to look around",
  "landing.section.howit.label_num": "02",
  "landing.section.howit.label": "How it works",
  "landing.section.howit.sub": "Three steps · one decision",
  "landing.step.i.title": "Parents deposit once. That's it.",
  "landing.step.i.body":
    "A single transfer sets up the whole year. No subscriptions, no monthly transfers to remember.",
  "landing.step.ii.title": "Earning ~8% a year on Kamino.",
  "landing.step.ii.body":
    "The deposit goes into Kamino — an audited Solana lending platform. Interest grows automatically in the background. Estimated · based on current rates.",
  "landing.step.iii.title":
    "Your kid gets paid every month. Bonus at year-end.",
  "landing.step.iii.body":
    "On the 1st of every month, the allowance lands automatically. At year-end, an extra bonus — paid by what the money earned, not from your wallet. The longer it sits, the bigger the bonus.",
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
  "landing.section.trust.label_num": "04",
  "landing.section.trust.label": "Trust & safety",
  "landing.section.trust.sub": "Your money, your control",
  "landing.trust.custody.title": "Your money goes to Kamino. Nowhere else.",
  "landing.trust.custody.body":
    "Every dollar you deposit lives inside Kamino — an audited lending platform on Solana with hundreds of millions in deposits. Seedling never lends it elsewhere or touches it for any other purpose. Our code is open for anyone to inspect.",
  "landing.trust.withdraw.title": "You can withdraw any time.",
  "landing.trust.withdraw.body":
    "Take out what you deposited plus what it earned — instantly, no fees, no waiting periods. Only you, the parent, can move the money. The kid never has direct access.",
  "landing.trust.yield.title": "Returns can go up or down.",
  "landing.trust.yield.body":
    "Kamino currently pays around 8% per year, but rates move with demand — just like a savings account. The year-end bonus is exactly what the money earned. Returns aren't FDIC insured — Seedling isn't a bank. The funds sit in Kamino's audited contract, which anyone can inspect at any time.",
  "landing.footer.built": "Built on Kamino · Solana",
  "landing.footer.copy": "© 2026 · seedlingsol.xyz",

  // ---- mainnet notify ----
  "mainnet.headline": "mainnet soon.",
  "mainnet.body":
    "want a heads-up when families can deposit real USDC? send us a DM on X — we'll ping you the day mainnet goes live.",
  "mainnet.cta": "DM @{handle} on X",
  "mainnet.fine": "no list · no spam · just a heads-up DM",

  // ---- parent account section (top of dashboard) ----
  "account.eyebrow": "your Seedling account",
  "account.balance_sub": "available to deposit",
  "account.refresh": "Refresh balance",

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
  "gate.title": "sign in to see {italic}.",
  "gate.title.italic": "your families",
  "gate.body":
    "Seedling lives on Solana. Sign in with your email or Google to view your kids' positions, deposit USDC, and trigger distributions. Have Phantom or Solflare? Pick it from the same screen.",

  // ---- auth (Privy) ----
  "auth.loading": "loading…",
  "auth.signin": "sign in",
  "auth.signout": "sign out",
  "auth.gate.cta": "get started",

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
  "card.pay_pix": "top up with Pix",
  "card.top_up": "top up account",
  "card.withdraw": "withdraw",
  "card.withdraw_pix": "withdraw to Pix",
  "card.soon": "soon",
  "card.draft.badge": "awaiting first deposit",
  "card.draft.deposit_hint":
    "First deposit creates the on-chain vault. Use Pix or top up to fund.",
  "card.send_monthly": "Send monthly",
  "card.sending": "sending…",
  "card.monthly_in": "Monthly in {countdown}",
  "card.send_bonus": "Send bonus",
  "card.bonus_in": "Bonus in {countdown}",
  "card.bonus_loading": "Bonus in …",
  "card.remove_kid": "remove kid",
  "card.removing": "removing…",
  "card.edit_kid": "edit",
  "card.pix.label": "kid Pix key",
  "card.pix.empty": "+ add Pix key",
  "card.edit.eyebrow": "edit family",
  "card.edit.close": "close ✕",
  "card.edit.name.label": "name",
  "card.edit.name.placeholder": "Maria",
  "card.edit.pix.label": "kid Pix key",
  "card.edit.pix.placeholder": "CPF, phone, or email",
  "card.edit.monthly.label": "monthly · USDC",
  "card.edit.save": "save changes",
  "card.edit.saving": "saving…",
  "card.edit.error.pix": "Pix key format is invalid",
  "card.edit.error.monthly": "monthly must be between $1 and $100,000",
  "card.edit.toast.title": "family updated",
  "card.edit.toast.subtitle": "your changes are saved",
  "card.cadence_topup_eyebrow": "{plan} · this month",
  "card.cadence_topup_title": "deposit ${amount} to keep yield growing",
  "card.cadence_topup_cta": "+ top up",
  // ago formatting
  "card.ago.just_now": "just now",
  "card.ago.minutes": "{n}m ago",
  "card.ago.hours": "{n}h ago",
  "card.ago.days": "{n}d ago",
  // countdown formatting
  "card.countdown.ready": "ready",
  "card.countdown.dh": "{d}d {h}h",
  "card.countdown.hm": "{h}h {m}m",
  // tooltips
  "card.tip.send_monthly": "send this month's allowance",
  "card.tip.send_bonus": "send the year-end bonus",
  "card.tip.available_in": "available in {countdown}",
  "card.tip.loading": "loading…",
  // remove kid confirm + close handling
  "card.remove_confirm.named":
    "Remove {name}? Any remaining USDC will be sent to your wallet, and the on-chain accounts close.",
  "card.remove_confirm.unnamed":
    "Remove this kid? Any remaining USDC will be sent to your wallet, and the on-chain accounts close.",
  // distribute errors
  "card.error.not_eligible": "Not eligible yet.",
  "card.error.paused": "Vault paused. Try again later.",
  "card.error.bonus_not_ready": "Annual bonus not ready yet.",
  "card.error.bonus_already": "Bonus already distributed for this period.",
  "card.error.no_yield":
    "No yield to distribute yet — the vault hasn't earned enough on Kamino. Try again next month.",
  // toasts on actions
  "card.toast.kid_copied": "kid pubkey copied",
  "card.toast.link_copied": "kid's page link copied",
  "card.toast.share_fallback": "share unavailable here · link copied instead",
  "card.toast.monthly_title.named": "Sent to {name}",
  "card.toast.monthly_title.fallback": "Sent to your kid",
  "card.toast.monthly_subtitle": "monthly allowance · on chain",
  "card.toast.bonus_title.named": "{name}'s annual bonus arrived",
  "card.toast.bonus_title.fallback": "Your kid's annual bonus arrived",
  "card.toast.bonus_subtitle": "year-end yield · sent on chain",
  "card.toast.closed_title.named": "{name}'s vault is closed",
  "card.toast.closed_title.fallback": "vault closed",
  "card.toast.closed_subtitle": "remaining USDC returned · accounts closed",
  // share native message
  "card.share.title": "{name}'s seedling page",
  "card.share.text": "{name}'s growing savings on seedling.",
  "card.share.fallback_kid": "your kid",
  // savings goals section
  "card.goals.label": "Savings goals",
  "card.goals.active_count": "{n} active",
  "card.goals.add_another": "+ add another goal",
  // goal row
  "goal.pct_saved": "{pct}% saved",
  "goal.press_enter": "press enter to save",
  "goal.click_to_edit": "click to edit",
  "goal.uploading": "uploading…",
  "goal.change_photo": "change photo",
  "goal.add_photo": "+ add photo",
  "goal.remove_photo": "remove photo",
  "goal.save": "save",
  "goal.cancel": "cancel",
  "goal.delete": "delete this goal",
  "goal.delete_confirm": 'Remove the "{label}" goal?',
  "goal.add.name_placeholder": "goal name (e.g. nintendo switch)",
  "goal.add.icon_label": "icon",
  "goal.add.add_photo_optional": "+ add a photo (optional)",
  "goal.add.save": "save goal",
  // gifts section
  "gifts.section.received": "gifts received",
  "gifts.section.loading": "loading…",
  "gifts.section.total": "{n} total",
  "gifts.toast.title": "{who} gifted ${amount} to {recipient}",
  "gifts.toast.subtitle": "GIFT · SEEDLING",
  "gifts.fallback.someone": "Someone",
  "gifts.fallback.recipient": "your family",
  "gifts.name_input.placeholder": "Grandma, Uncle Tom, …",
  "gifts.save": "save",
  "gifts.tip.rename": "click to rename",
  "gifts.tip.override": "name supplied by the gifter — click to override",
  "gifts.tip.name": "click to name",
  "gifts.name_button": "name {pubkey}",

  // ---- empty state ----
  "empty.title": "no kids yet.",
  "empty.body":
    "Add a kid wallet, set a monthly amount, and your first deposit starts compounding the moment it lands.",
  "empty.cta": "Add your first kid",

  // ---- add kid form ----
  "add_kid.eyebrow": "new family",
  "add_kid.title.line": "add a {italic}.",
  "add_kid.title.italic": "kid",
  "add_kid.close": "close ✕",
  "add_kid.name.label": "name",
  "add_kid.name.optional": "(optional · for you)",
  "add_kid.name.placeholder": "Maria",
  "add_kid.kid_pubkey.label": "kid wallet address",
  "add_kid.kid_pubkey.placeholder": "e.g. 7xKX...J9pQ",
  "add_kid.kid_pubkey.invalid": "not a valid Solana address",
  "add_kid.kid_pubkey.duplicate": "you already have a seedling for this kid",
  "add_kid.pix_key.label": "kid Pix key",
  "add_kid.pix_key.optional": "(optional · for payouts)",
  "add_kid.pix_key.placeholder": "CPF, phone, or email",
  "add_kid.pix_key.hint":
    "where allowance arrives when you send it. yours if the kid doesn't have a Pix key yet.",
  "add_kid.pix_key.error.cpf": "not a valid CPF",
  "add_kid.pix_key.error.email": "not a valid email",
  "add_kid.pix_key.error.phone": "phone must be E.164 (e.g. +5511999998888)",
  "add_kid.monthly.label": "monthly · USDC · min ${min}",
  // Only rendered in PT-BR mode (Brazilian users read "$" as R$ by
  // reflex). Kept as an EN key so the type-check stays in lockstep.
  "add_kid.monthly.currency_note": "USDC · pegged 1:1 with US dollar",
  "add_kid.monthly.error.number": "must be a number",
  "add_kid.monthly.error.min": "minimum is ${min}/mo",
  "add_kid.monthly.error.max": "maximum is ${max}/mo",
  "add_kid.monthly.recommended":
    "recommended deposit · ${total} upfront → ${cover} covers the year, ${bonus} earns the bonus",
  "add_kid.submit": "add kid",
  "add_kid.creating": "creating…",
  "add_kid.fee_note": "~0.001 SOL network fee",
  "add_kid.faucets.label": "need usdc?",
  "add_kid.faucets.sol": "SOL faucet ↗",
  "add_kid.faucets.usdc": "USDC faucet ↗",
  "add_kid.error.in_use": "This kid already has an allowance set up.",
  "add_kid.error.bad_rate": "Stream rate must be between ${min} and ${max}/mo.",
  "add_kid.error.paused": "The vault is paused. Try again later.",
  "add_kid.toast.title.named": "{name}'s allowance is planted",
  "add_kid.toast.title.unnamed": "new allowance planted",
  "add_kid.toast.subtitle": "${monthly}/mo · earning yield on Kamino",

  // ---- mode picker (deposit cadence) ----
  "mode.section.label": "deposit cadence",
  "mode.tagline.start": "Seedling rewards time —",
  "mode.tagline.italic": "the longer money stays, the more the kid earns.",
  "mode.recommended_badge": "recommended",
  "mode.yearly.label": "Yearly",
  "mode.yearly.desc": "deposit once · earn the most",
  "mode.yearly.plan": "Annual Plan",
  "mode.hybrid.label": "Hybrid",
  "mode.hybrid.desc": "balance flexibility + bonus",
  "mode.hybrid.plan": "Hybrid Plan",
  "mode.monthly.label": "Monthly",
  "mode.monthly.desc": "flexible deposits · smaller bonus",
  "mode.monthly.plan": "Monthly Plan",
  "mode.yearly.upfront_line": "≈ ${total} upfront",
  "mode.yearly.return_line": "≈ ${back} back to you + ≈ ${bonus} kid bonus",
  "mode.year_total_line": "≈ ${total} / year you put in",
  "mode.year_bonus_line": "≈ ${bonus} kid bonus at year-end",
  "mode.hybrid.upfront_label": "upfront deposit",
  "mode.hybrid.monthly_label": "monthly top-up · for 11 months",
  "mode.hybrid.total_line":
    "total over the year: ≈ ${total} · kid receives ${kid}",
  "mode.hybrid.bonus_line":
    "estimated bonus: ≈ ${bonus} ({pct}% of yearly's ${yearly})",
  "mode.hybrid.zero_upfront":
    "upfront is $0 → that's monthly, not hybrid. tap to switch to the monthly cadence (cleaner setup).",
  "mode.hybrid.zero_monthly":
    "monthly top-up is $0 → that's yearly, not hybrid. tap to switch to the yearly cadence (one deposit, max yield).",
  "mode.hybrid.shortfall":
    "your deposits cover ${total}, but the kid needs ${need} over the year. the allowance will pause ${short} short unless you add more.",
  "mode.disclosure":
    "we don't auto-debit your wallet. you commit to depositing on your chosen cadence; missed top-ups pause the kid's allowance until you catch up. funds you've deposited are always safe in the vault.",

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
  "withdraw.title": "Withdraw USDC",
  "withdraw.button.submit": "Withdraw",
  "withdraw.button.confirming": "Confirming…",
  "withdraw.error.amount_required": "must be a number",
  "withdraw.error.amount_positive": "must be positive",
  "withdraw.error.amount_max": "max ${max}",
  "withdraw.max_label": "max (${balance})",
  "withdraw.no_balance": "No balance to withdraw. Deposit first.",
  "withdraw.preview": "burns ≈ {shares} shares · you receive ≈ ${usd} USDC",
  "withdraw.error.too_small": "Amount too small to withdraw.",
  "withdraw.error.insufficient_shares":
    "Not enough shares to withdraw that amount.",
  "withdraw.error.paused": "The vault is paused. Try again later.",
  "withdraw.error.slippage": "Share price moved during withdraw. Try again.",
  "withdraw.error.dust": "Amount too small — must be at least 0.01 USDC.",
  "withdraw.toast.title": "withdraw confirmed",
  "withdraw.toast.subtitle": "USDC sent to your wallet",
  "withdraw.toast.title_likely": "withdraw likely confirmed",
  "withdraw.toast.subtitle_likely":
    "wallet glitched · check the principal updated",

  // ---- pix on-ramp form (parent + gift share most copy) ----
  "pix.cancel": "cancel",
  "pix.deposit.title": "Top up with Pix",
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
  // Refreshed iFood-style flow: copy-paste primary (mobile-first reality
  // for Brazilian Pix payments), step-by-step guidance, QR de-emphasized
  // as secondary path for desktop-to-mobile.
  "pix.awaiting.paste_label": "Paste this code in your bank app:",
  "pix.awaiting.copy_button": "Copy Pix code",
  "pix.awaiting.copied_button": "Copied ✓",
  "pix.awaiting.how_to_title": "How to pay:",
  "pix.awaiting.step_1": "Open your bank app",
  "pix.awaiting.step_2": "Find Pix → Pix Copy and Paste",
  "pix.awaiting.step_3": "Paste the code and confirm",
  "pix.awaiting.or_qr": "or pay from another phone",
  "pix.awaiting.waiting": "Waiting for payment…",
  "pix.awaiting.expired": "Waiting for payment · expired",
  "pix.awaiting.expires_in": "expires in {minutes}m {seconds}s",
  // Shared USDC≠BRL clarifier — rendered only in PT-BR mode where "$"
  // is genuinely ambiguous to native readers. Same key used across
  // DepositForm, WithdrawForm, PixOfframpForm, GiftModal.
  "currency.usdc_note": "USDC · pegged 1:1 with US dollar",
  "pix.success.title": "Account topped up",
  "pix.success.closing": "closing…",
  "pix.deposit.toast.title": "Pix received · balance updated",
  "pix.deposit.toast.subtitle": "deposit to a kid to start earning yield",

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

  // ---- top-up account modal (fund Privy wallet with USDC directly) ----
  "topup.title": "Top up your Seedling balance",
  "topup.subtitle":
    "Send USDC from any Solana wallet or exchange (Phantom, Coinbase, Binance) to the address below. Funds arrive in seconds — then tap Deposit to fund a kid.",
  "topup.address.label": "Your address",
  "topup.copy": "copy",
  "topup.close": "close",
  "topup.network": "Solana · Devnet",
  "topup.warning":
    "Solana network only. USDC sent from Ethereum, Polygon, or BSC will be lost.",
  "topup.next_step":
    "Once funds arrive, tap Deposit on any kid card to move them into the family vault.",
  "topup.toast.copied": "Address copied",
  "topup.toast.copy_failed": "Couldn't copy — please select and copy manually",
  "topup.help.heading": "How to send USDC",
  "topup.address.heading": "Where to send it",
  "topup.help.button": "Don't know how? Show me",
  "topup.help.intro":
    "Don't have any crypto yet? Close this and tap \"pay with Pix\" — that's the simplest path. The methods below are for parents who already hold USDC somewhere.",
  "topup.help.m1.label": "Most common in Brazil",
  "topup.help.m1.title":
    "Withdraw USDC from a Brazilian exchange (Mercado Bitcoin, Binance BR, Foxbit)",
  "topup.help.m1.step1": "Buy USDC on the exchange (or use what you have).",
  "topup.help.m1.step2":
    'Open "Withdraw" → USDC → choose Solana network (NOT Ethereum or BSC).',
  "topup.help.m1.step3": "Paste the address above as destination → confirm.",
  "topup.help.m2.label": "International exchange",
  "topup.help.m2.title": "Withdraw USDC from Coinbase, Binance, Kraken, etc.",
  "topup.help.m2.step1": 'Open "Withdraw" / "Send" on the exchange.',
  "topup.help.m2.step2":
    "Choose USDC and the Solana network — never Ethereum, BSC, or Polygon.",
  "topup.help.m2.step3": "Paste the address above and confirm.",
  "topup.help.m3.label": "From another Solana wallet",
  "topup.help.m3.title":
    "Send from a wallet you already control (Phantom, Solflare, Backpack)",
  "topup.help.m3.step1": 'Open your wallet and tap "Send".',
  "topup.help.m3.step2": "Choose USDC as the asset.",
  "topup.help.m3.step3": "Paste the address above and confirm.",
  "topup.help.pitfall":
    "Always double-check it says Solana / SOL before confirming — wrong-network sends cannot be recovered.",

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
    "Thank you for the gift. {name}'s vault has been topped up and is now earning yield on Kamino.",
  "pix.gift.success.close": "close",
  "pix.gift.this_family": "this family",

  // ---- kid view ----
  "kid.eyebrow": "kid · seedling",
  "kid.greeting": "hi",
  "kid.greeting.fallback": "friend",
  "kid.ticker.label": "your money, right now",
  "kid.ticker.sub.guess": "make your guess to see the cents",
  "kid.ticker.sub.live": "estimated 8% APY · ticking on Solana",
  "kid.stat.savings": "your savings",
  "kid.stat.savings.foot": "from your family",
  "kid.stat.yield": "earned in yield",
  "kid.stat.yield.foot.guess": "make your guess first",
  "kid.stat.yield.foot.live": "since you started",
  "kid.coming.eyebrow": "what's coming",
  "kid.coming.next_allowance": "next allowance",
  "kid.coming.next_allowance.hint": "{amount} on the 1st",
  "kid.coming.annual_bonus": "annual bonus",
  "kid.coming.annual_bonus.hint": "year-end yield gift",
  "kid.coming.ready": "ready!",
  "kid.gift_cta.line": "send a gift",
  "kid.gift_cta.hint": "grandma · auntie · anyone",
  "kid.gift_pix.line": "gift in BRL via Pix",
  "kid.gift_pix.hint": "no crypto wallet needed",
  "kid.gifts_received": "gifts received",
  "kid.goal.eyebrow": "saving toward",
  "kid.goal.of": "of ${amount}",
  "kid.footer.powered": "powered by",
  "kid.footer.meta": "{cycle} bonus · on Solana",
  "kid.gift_toast.title": "{who} sent you ${amount}",
  "kid.gift_toast.subtitle": "A GIFT JUST LANDED",
  "kid.gift_toast.fallback_who": "Someone",

  // ---- gift modal (Solana Pay) ----
  "gm.eyebrow": "give to · seedling",
  "gm.title": "send a gift to",
  "gm.body":
    "Anyone with a Solana wallet can gift. The USDC lands in {who} seedling vault and starts earning yield.",
  "gm.body.named": "{name}'s",
  "gm.body.unnamed": "the family's",
  "gm.from_label": "your name",
  "gm.from_placeholder": "Grandma · Uncle Tom · …",
  "gm.amount_custom": "custom",
  "gm.send_here.connect": "connect wallet to send here",
  "gm.send_here.confirming": "confirming…",
  "gm.send_here.sent": "✓ gift sent",
  "gm.send_here.cta": "send ${amount} from this wallet",
  "gm.tx_link": "view tx ↗",
  "gm.or_divider": "or scan with another device",
  "gm.deep_link": "open in wallet app",
  "gm.copy_link": "copy link",
  "gm.copy_link.copied": "copied",
  "gm.foot.mobile": "or scan with Phantom, Solflare, or Backpack",
  "gm.foot.desktop":
    "scan the QR with Phantom, Solflare, or Backpack on your phone",
  "gm.send_error.rejected": "you rejected the transaction in your wallet",

  // ---- prediction card (guess your yield) ----
  "predict.eyebrow.too_early": "guess your yield",
  "predict.too_early.body":
    "your first guessing round opens on the 1st of next month.",
  "predict.too_early.foot":
    "come back then to guess how much your savings earned.",
  "predict.eyebrow.predict": "guess {month}'s yield",
  "predict.prompt": "how much did your savings earn during {month}?",
  "predict.foot.predict": "tap a chip — the answer reveals right after.",
  "predict.eyebrow.preview": "lock in your guess?",
  "predict.preview.hint": "once you lock, the answer reveals. ready?",
  "predict.lock_in": "lock it in",
  "predict.pick_again": "pick again",
  "predict.eyebrow.reveal": "how'd your {month} guess do?",
  "predict.your_guess": "your guess",
  "predict.actual": "actual",
  "predict.vs": "vs",
  "predict.spot_on": "spot on. nice.",
  "predict.off_by": "off by {cents}¢.",
  "predict.share": "share my month",
  "predict.share.busy": "making card…",
  "predict.play_again": "play again",
  "predict.foot.next": "next prompt opens on the 1st of next month.",
  "predict.share_card.error": "couldn't generate the card",
  // share preview modal
  "predict.preview.eyebrow": "your card · ready to share",
  "predict.preview.alt": "seedling monthly recap",
  "predict.preview.share": "share",
  "predict.preview.download": "download",
  "predict.preview.close": "close",
  "predict.preview.foot.share":
    "share opens your phone's share sheet · download saves the image.",
  "predict.preview.foot.download": "download saves the image to your computer.",
  "predict.kid_fallback": "kid",
  // Share card (rendered into PNG) — caller passes localized labels
  // through to renderShareCard. Eyebrow + caption + section headers.
  "share_card.eyebrow": "{month} · {name}'s seedling",
  "share_card.my_prediction": "my prediction",
  "share_card.actual": "actual",
  "share_card.spot_on": "spot on.",
  "share_card.off_by": "off by {cents}¢.",
  "share_card.saving_toward": "saving toward",

  // ---- year recap ----
  // CTA on the kid view
  "year.cta.eyebrow.bonus": "annual bonus",
  "year.cta.eyebrow.recap": "year recap",
  "year.cta.title.bonus": "your {year} just landed — relive it",
  "year.cta.title.recap": "your year so far · tap to relive it",
  // hero slide
  "year.slide.hero.eyebrow": "{year} · seedling",
  "year.slide.hero.headline.bonus": "your year.",
  "year.slide.hero.headline.recap": "your year so far.",
  "year.slide.hero.sub.named": "let's look back, {name}.",
  "year.slide.hero.sub.unnamed": "let's look back.",
  "year.slide.hero.tap_hint": "tap to start →",
  // month slide
  "year.slide.month.line": "your savings earned",
  "year.slide.month.foot": "at {apy}% APY",
  "year.slide.month.cumulative": "yield so far: ${amount}",
  // best month
  "year.slide.best.eyebrow": "your best month",
  "year.slide.best.sub": "earned",
  "year.slide.best.sub_at": "at {apy}% APY.",
  // deposited
  "year.slide.deposited.eyebrow": "you put in",
  "year.slide.deposited.sub": "across the year.",
  // yielded
  "year.slide.yielded.eyebrow.bonus": "your annual bonus",
  "year.slide.yielded.eyebrow.recap": "what your savings earned",
  "year.slide.yielded.sub.bonus": "just landed in your wallet — pure yield.",
  "year.slide.yielded.sub.recap": "just from your savings sitting still.",
  // growth
  "year.slide.growth.eyebrow": "that's",
  "year.slide.growth.sub": "growth, without you doing anything.",
  // share slide
  "year.slide.share.eyebrow": "share your year",
  "year.slide.share.headline": "make it a card.",
  "year.slide.share.sub":
    "a single image with everything — send it to grandma.",
  "year.slide.share.cta.busy": "making your card…",
  "year.slide.share.cta": "see my card",
  "year.slide.share.done": "done",
  // preview modal
  "year.preview.alt": "seedling {year} year recap",
  "year.preview.share": "share",
  "year.preview.download": "download",
  "year.preview.close": "close",
  // hero fallback name when kidName is missing
  "year.fallback_name": "friend",
  // share-card label set (for the PNG)
  "year_card.eyebrow": "{year} · {name}'s seedling year",
  "year_card.headline_1": "a year of",
  "year_card.headline_2": "growing.",
  "year_card.month_section": "MONTH BY MONTH",
  "year_card.month_sub": "monthly yield",
  "year_card.label.deposited": "YOU PUT IN",
  "year_card.label.yielded": "YOUR SAVINGS EARNED",
  "year_card.label.growth": "THAT'S",
  "year_card.best": "BEST MONTH",
  "year_card.best_apy": "at {apy}% APY",
  "year_card.growth_sub": "growth, just by waiting.",
  "year_card.foot": "seedling · seedlingsol.xyz",
  // cycle labels (used by kid view footer + year recap)
  "cycle.annual": "annual",
  "cycle.semi_annual": "semi-annual",
  "cycle.eighteen_month": "18-month",
  "cycle.biennial": "biennial",
  "cycle.n_month": "{n}-month",

  // ---- gifts ---- (additional gifts keys live under "gifts.section.*"
  // earlier in this file — those are the ones actually rendered.)

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
