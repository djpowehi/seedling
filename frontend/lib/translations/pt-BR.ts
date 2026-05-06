// Portuguese (Brazil) translations. Must satisfy the same keys as
// en.ts — TypeScript enforces this via the `Translations` shape import.
//
// Translation choices (revised 2026-05-05 with native-speaker review):
// - Use lowercase / soft tone matching the EN copy ("calm, deliberate")
//   not the all-caps shouty Brazilian fintech default
// - Keep crypto terms in English where they're already loanwords in
//   Brazilian Web3 vocabulary: USDC, yield (rendimento), wallet (carteira)
// - vault → "cofre" everywhere (PT-BR Web3 standard, family-friendly)
// - Pix terms stay native (Pix, copia-e-cola)
// - "Mainnet" stays — it's a term, not English-y
// - "principal" (financial term) → "capital" or "valor principal" — bare
//   "principal" reads as machine-translated
// - In parent-app surfaces (dashboard, forms): "filho/filhos" — converts
//   better in family-finance apps. Landing copy stays "criança" for the
//   generic/marketing tone.

import type { Translations } from "./en";

export const ptBR: Translations = {
  // ---- locale toggle ----
  "locale.toggle.aria": "Trocar idioma",

  // ---- shared nav ----
  "nav.live.devnet": "rodando na devnet · mainnet em breve",
  "nav.live.short": "rodando na Solana",

  // ---- landing ----
  "landing.eyebrow": "Mesada da família, on-chain · na Solana",
  "landing.headline.line1": "uma mesada",
  "landing.headline.line2": "que {italic}.",
  "landing.headline.italic": "rende",
  "landing.subhead":
    "O dinheiro cresce. O hábito cresce. Seu filho cresce com os dois. Um depósito financia todas as mesadas mensais — e um bônus de fim de ano que vem do rendimento, não do seu bolso.",
  "landing.cta.dashboard": "abrir dashboard",
  "landing.cta.label": "Abrir o dashboard",
  "landing.cta.note":
    "Rodando na Solana · não precisa de carteira para dar uma olhada",
  "landing.section.howit.label_num": "02",
  "landing.section.howit.label": "Como funciona",
  "landing.section.howit.sub": "Três passos · uma decisão",
  "landing.step.i.title": "Os pais depositam USDC, uma vez.",
  "landing.step.i.body":
    "Uma única transação define o valor principal. Sem assinaturas, sem cobranças mensais.",
  "landing.step.ii.title": "A Kamino empresta a ~8% APY.",
  "landing.step.ii.body":
    "O cofre deposita na Kamino. O rendimento se compõe em segundo plano. Estimado · com base nas taxas atuais.",
  "landing.step.iii.title": "A criança recebe todo mês. Bônus no fim do ano.",
  "landing.step.iii.body":
    "Todo dia 1º a mesada cai. No fim do ano vem o bônus anual — rendimento puro. Seedling recompensa o tempo: quanto mais o dinheiro fica, mais a criança ganha.",
  "landing.section.product.label_num": "03",
  "landing.section.product.label": "O produto",
  "landing.section.product.sub": "Duas telas · uma família",
  "landing.shot.parent.tag": "tela 01 · pai/mãe",
  "landing.shot.parent.alt":
    "Dashboard dos pais no Seedling com duas crianças guardando",
  "landing.shot.parent.caption": "Dashboard dos pais",
  "landing.shot.parent.caption_sub": "depositar · sacar · mesada · bônus",
  "landing.shot.kid.tag": "tela 02 · criança",
  "landing.shot.kid.alt":
    "Tela da criança no Seedling com a árvore crescendo e o rendimento ao vivo",
  "landing.shot.kid.caption": "Tela da criança",
  "landing.shot.kid.caption_sub":
    "uma árvore, crescendo — sem precisar de carteira",
  "landing.footer.built": "Construído com Kamino · Solana",
  "landing.footer.copy": "© 2026 · seedlingsol.xyz",

  // ---- mainnet notify ----
  "mainnet.headline": "mainnet em breve.",
  "mainnet.body":
    "quer um aviso quando as famílias puderem depositar USDC de verdade? manda DM pra gente no X — avisamos no dia que a mainnet for ao ar.",
  "mainnet.cta": "manda DM pra @{handle} no X",
  "mainnet.fine": "sem lista · sem spam · só um aviso por DM",

  // ---- dashboard ----
  "dashboard.eyebrow": "dashboard dos pais",
  "dashboard.title.loading": "carregando…",
  "dashboard.title.first": "comece a {italic}.",
  "dashboard.title.first.italic": "primeira",
  "dashboard.title.kids": "{count} {kidWord} {italic}.",
  "dashboard.title.kids.italic": "guardando",
  "dashboard.title.word.kid": "filho",
  "dashboard.title.word.kids": "filhos",
  "dashboard.subtitle": "tudo rodando na Solana",
  "dashboard.fetching": "Buscando na devnet…",
  "dashboard.error.load": "Não foi possível carregar as famílias. {error}",
  "dashboard.add_another": "adicionar outro filho",

  // ---- connect gate ----
  "gate.eyebrow": "entrar",
  "gate.title": "conecte para ver {italic}.",
  "gate.title.italic": "suas famílias",
  "gate.body":
    "Seedling vive na Solana. Conecte Phantom ou Solflare para ver as posições dos seus filhos, depositar USDC e enviar mesadas.",

  // ---- footer ----
  "footer.github": "github",
  "footer.x": "@seedling_sol",

  // ---- family card ----
  "card.unnamed": "sem nome",
  "card.rename.tooltip": "clique para renomear",
  "card.cadence.suffix": "frequência",
  "card.created_ago": "criado há {ago}",
  "card.last_paid": "último pagamento há {ago}",
  "card.share_link": "compartilhar",
  "card.copy_link": "copiar link",
  "card.kids_page": "página do filho",
  "card.stat.stream": "Mesada",
  "card.stat.stream_value": "${amount}/mês",
  "card.stat.stream_sub": "usdc",
  "card.stat.principal": "Capital",
  "card.stat.principal_sub": "Reservado · rendendo",
  "card.stat.shares": "Cotas",
  "card.stat.shares_sub": "do total do cofre",
  "card.stat.yield": "Rendimento",
  "card.deposit": "depositar",
  "card.pay_pix": "pagar com Pix",
  "card.withdraw": "sacar",
  "card.withdraw_pix": "sacar para o Pix",
  "card.send_monthly": "Enviar mesada",
  "card.sending": "enviando…",
  "card.monthly_in": "Mesada em {countdown}",
  "card.send_bonus": "Enviar bônus",
  "card.bonus_in": "Bônus em {countdown}",
  "card.bonus_loading": "Bônus em …",
  "card.remove_kid": "remover filho",
  "card.removing": "removendo…",
  "card.cadence_topup_eyebrow": "frequência {cadence} · este mês",
  "card.cadence_topup_title":
    "deposite ${amount} para o rendimento continuar crescendo",
  "card.cadence_topup_cta": "+ recarregar",

  // ---- empty state ----
  "empty.title": "nenhum filho ainda",
  "empty.body":
    "Adicione seu primeiro filho para ativar o cofre dele. Depósitos rendem na Kamino e a mesada cai todo mês.",
  "empty.cta": "+ adicionar filho",

  // ---- add kid form ----
  "add_kid.title": "adicionar filho",
  "add_kid.cancel": "cancelar",
  "add_kid.kid_pubkey.label": "Pubkey da carteira do filho",
  "add_kid.kid_pubkey.help":
    "Gere uma keypair nova se ainda não tiver. É aqui que ele vai receber a mesada.",
  "add_kid.stream.label": "Mesada mensal ($USDC)",
  "add_kid.stream.placeholder": "20",
  "add_kid.principal.label": "Depósito inicial ($USDC, opcional)",
  "add_kid.principal.placeholder": "240",
  "add_kid.principal.help":
    "Pode pré-financiar o cofre se quiser. Sempre dá pra depositar mais depois.",
  "add_kid.submit": "criar",
  "add_kid.creating": "criando…",
  "add_kid.error.kid_pubkey.empty": "pubkey do filho é obrigatória",
  "add_kid.error.kid_pubkey.invalid": "não é uma pubkey Solana válida",
  "add_kid.error.kid_pubkey.duplicate":
    "você já tem um seedling para esse filho",
  "add_kid.error.stream.empty": "mesada mensal é obrigatória",
  "add_kid.error.stream.positive": "precisa ser positiva",
  "add_kid.error.stream.too_high": "máximo ${max} / mês",

  // ---- deposit (USDC wallet) form ----
  "deposit.title": "Depositar USDC",
  "deposit.error.insufficient_usdc":
    "USDC insuficiente. Use as faucets abaixo.",
  "deposit.error.insufficient":
    "SOL ou USDC insuficiente. Confira as faucets abaixo.",
  "deposit.error.paused": "O cofre está pausado. Tente mais tarde.",
  "deposit.error.slippage":
    "O preço da cota mudou durante o depósito. Tente de novo.",
  "deposit.error.amount_required": "precisa ser número",
  "deposit.error.amount_positive": "precisa ser positivo",
  "deposit.error.amount_max": "máximo ${max} por depósito",
  "deposit.faucets": "Precisa de USDC? {solLink} → {usdcLink}",
  "deposit.button.confirming": "Confirmando…",
  "deposit.button.submit": "Depositar",
  "deposit.toast.title": "depósito confirmado",
  "deposit.toast.subtitle": "adicionado ao cofre · rendendo na Kamino",

  // ---- withdraw form ----
  "withdraw.title": "Sacar",
  "withdraw.button.submit": "Sacar",
  "withdraw.button.confirming": "Confirmando…",
  "withdraw.toast.title": "saque confirmado",
  "withdraw.toast.subtitle": "USDC devolvido para sua carteira",

  // ---- pix on-ramp form ----
  "pix.cancel": "cancelar",
  "pix.deposit.title": "Pagar com Pix",
  "pix.amount.brl": "Valor em BRL",
  "pix.amount.placeholder": "100,00",
  "pix.amount.error.number": "precisa ser número",
  "pix.amount.error.min": "mín R${min}",
  "pix.amount.error.max": "máx R${max}",
  "pix.profile.cpf": "CPF",
  "pix.profile.cpf.placeholder": "000.000.000-00",
  "pix.profile.email": "Email",
  "pix.profile.email.placeholder": "voce@exemplo.com",
  "pix.profile.fine":
    "Exigido pela 4P (nosso parceiro de pagamento brasileiro). Salvo só nesse dispositivo — nunca enviado para nossos servidores.",
  "pix.profile.error.cpf": "cpf inválido",
  "pix.profile.error.email": "email inválido",
  "pix.profile.paying_as": "Pagando como {cpf} · {email}",
  "pix.profile.from": "De {cpf} · {email}",
  "pix.profile.change": "trocar",
  "pix.submit.generating": "Gerando Pix…",
  "pix.submit.generate": "Gerar cobrança Pix",
  "pix.error.not_authorized":
    "Pix ainda não está disponível. Nosso parceiro de pagamento está finalizando a configuração — tenta de novo logo.",
  "pix.awaiting.title": "Pague R${amount} via Pix",
  "pix.awaiting.body":
    "Abra o app do seu banco, escaneie o QR ou cole o código abaixo. O cofre vai ser creditado automaticamente assim que a 4P confirmar.",
  "pix.awaiting.copy_label": "Pix copia-e-cola",
  "pix.awaiting.copied": "copiado",
  "pix.awaiting.copy": "copiar",
  "pix.awaiting.waiting": "Aguardando pagamento…",
  "pix.awaiting.expired": "Aguardando pagamento · expirado",
  "pix.awaiting.expires_in": "expira em {minutes}m {seconds}s",
  "pix.success.title": "Cofre creditado",
  "pix.success.closing": "fechando…",
  "pix.deposit.toast.title": "Pix recebido · cofre creditado",
  "pix.deposit.toast.subtitle": "via 4P · rendendo na Kamino",

  // ---- pix off-ramp ----
  "pix.offramp.title": "Sacar para o Pix",
  "pix.offramp.body":
    "Uma assinatura saca e envia direto pro seu banco via Pix. Cai em ~10 segundos.",
  "pix.offramp.amount.label": "Valor em USDC",
  "pix.offramp.amount.placeholder": "50,00",
  "pix.offramp.pixkey.label": "Chave Pix de destino",
  "pix.offramp.pixkey.placeholder": "CPF · telefone · email · chave aleatória",
  "pix.offramp.submit": "Sacar para o Pix",
  "pix.offramp.submitting": "Confirmando…",
  "pix.offramp.toast.title": "Pix a caminho do seu banco",
  "pix.offramp.toast.subtitle": "R${amount} · 4P entregando · ~10s",
  "pix.offramp.success": "Pix enviado · R${amount} chegando",
  "pix.offramp.error.slippage":
    "O preço da cota mudou durante o saque. Tenta de novo — o buffer cobre.",
  "pix.offramp.error.paused": "O cofre está pausado. Tenta mais tarde.",

  // ---- pix gift modal ----
  "pix.gift.eyebrow": "presentear · seedling · pix",
  "pix.gift.title": "presentear {name} em BRL",
  "pix.gift.body":
    "Sem precisar de cripto. Pague em BRL via Pix; a família recebe o equivalente em USDC, automaticamente.",
  "pix.gift.your_name": "seu nome (opcional)",
  "pix.gift.your_name.placeholder": "Vovó · Tio · …",
  "pix.gift.amount": "valor (BRL)",
  "pix.gift.amount.custom": "outro",
  "pix.gift.fine":
    "exigido pela 4P, nosso parceiro de pagamento brasileiro. usado só nessa transação.",
  "pix.gift.submit": "Gerar Pix de R${amount}",
  "pix.gift.submitting": "Gerando Pix…",
  "pix.gift.success.title": "Presente recebido · cofre creditado",
  "pix.gift.success.body":
    "Obrigado pelo presente. O cofre de {name} foi recarregado e já está rendendo na Kamino.",
  "pix.gift.success.close": "fechar",
  "pix.gift.this_family": "essa família",

  // ---- kid view ----
  "kid.greeting": "oi {name}",
  "kid.greeting.fallback": "amigo",
  "kid.eyebrow": "seu seedling",
  "kid.value.label": "Valor total",
  "kid.principal": "Capital",
  "kid.yield_earned": "Rendimento",
  "kid.next_allowance": "Próxima mesada",
  "kid.next_allowance.ready": "disponível agora",
  "kid.next_allowance.in": "em {days}d {hours}h",
  "kid.bonus_in": "Bônus anual em {days}d",
  "kid.bonus_ready": "Bônus anual disponível",
  "kid.gift_cta.line": "mandar um presente",
  "kid.gift_cta.hint": "vovó · tia · qualquer um",
  "kid.gift_pix.line": "presentear em BRL via Pix",
  "kid.gift_pix.hint": "sem precisar de carteira cripto",
  "kid.gifts_received": "presentes recebidos",

  // ---- gifts ----
  "gifts.section.title": "presentes recebidos",
  "gifts.empty":
    "nenhum presente ainda · compartilhe seu link para começar a receber",
  "gifts.from": "de {name}",
  "gifts.anonymous": "presente anônimo",

  // ---- generic ----
  "generic.cancel": "cancelar",
  "generic.save": "salvar",
  "generic.close": "fechar",
  "generic.copy": "copiar",
  "generic.copied": "copiado",
  "generic.loading": "carregando…",
  "generic.try_again": "tentar de novo",
  "generic.usdc": "USDC",
  "generic.brl": "BRL",
};
