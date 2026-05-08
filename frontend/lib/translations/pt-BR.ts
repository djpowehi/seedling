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
  "landing.headline.line1": "mesada",
  "landing.headline.line2": "que {italic}.",
  "landing.headline.italic": "rende",
  "landing.subhead":
    "Dinheiro cresce. Responsabilidade cresce. Seu filho cresce com os dois. Um depósito financia todas as mesadas mensais — e um bônus de fim de ano que vem do rendimento, não do seu bolso.",
  "landing.cta.dashboard": "abrir dashboard",
  "landing.cta.label": "Abrir o dashboard",
  "landing.cta.note":
    "Rodando na Solana · não precisa de carteira para dar uma olhada",
  "landing.section.howit.label_num": "02",
  "landing.section.howit.label": "Como funciona",
  "landing.section.howit.sub": "Três passos · uma decisão",
  "landing.step.i.title": "Os pais depositam uma vez. Só isso.",
  "landing.step.i.body":
    "Um único depósito cobre o ano inteiro. Sem mensalidade, sem transferências automáticas pra lembrar.",
  "landing.step.ii.title": "Rende ~8% ao ano na Kamino.",
  "landing.step.ii.body":
    "O depósito vai pra Kamino — uma plataforma de empréstimos verificada na Solana. O rendimento corre em segundo plano, automaticamente. Estimado · com base nas taxas atuais.",
  "landing.step.iii.title": "Seu filho recebe todo mês. Bônus no fim do ano.",
  "landing.step.iii.body":
    "Todo dia 1º a mesada cai automaticamente. No fim do ano, um bônus extra — pago só com o que o dinheiro rendeu, não vem do seu bolso. Quanto mais tempo o dinheiro fica, maior o bônus.",
  "landing.section.product.label_num": "03",
  "landing.section.product.label": "O produto",
  "landing.section.product.sub": "Duas telas · uma família",
  "landing.shot.parent.tag": "tela 01 · pai/mãe",
  "landing.shot.parent.alt":
    "Dashboard dos pais no Seedling com duas crianças poupando",
  "landing.shot.parent.caption": "Dashboard dos pais",
  "landing.shot.parent.caption_sub": "depositar · sacar · mesada · bônus",
  "landing.shot.kid.tag": "tela 02 · criança",
  "landing.shot.kid.alt":
    "Tela da criança no Seedling com a árvore crescendo e o rendimento ao vivo",
  "landing.shot.kid.caption": "Tela da criança",
  "landing.shot.kid.caption_sub":
    "uma árvore, crescendo — sem precisar de carteira",
  "landing.section.trust.label_num": "04",
  "landing.section.trust.label": "Confiança e segurança",
  "landing.section.trust.sub": "Seu dinheiro, no seu controle",
  "landing.trust.custody.title":
    "Seu dinheiro vai pra Kamino. Em mais lugar nenhum.",
  "landing.trust.custody.body":
    "Cada real que você deposita fica na Kamino — uma plataforma de empréstimos verificada na Solana com centenas de milhões em depósitos. A Seedling nunca empresta pra terceiros nem mexe no dinheiro pra nenhum outro fim. Nosso código é aberto pra qualquer um conferir.",
  "landing.trust.withdraw.title": "Você saca quando quiser.",
  "landing.trust.withdraw.body":
    "Tira o que depositou mais o que rendeu — na hora, sem taxas, sem prazo de carência. Só você, pai/mãe, pode mexer no dinheiro. A criança nunca tem acesso direto.",
  "landing.trust.yield.title": "O rendimento sobe e desce.",
  "landing.trust.yield.body":
    "Hoje a Kamino paga em torno de 8% ao ano, mas a taxa varia conforme a demanda — igual poupança, só que on-chain. A gente nunca promete um número fixo. O bônus de fim de ano é exatamente o que foi rendido. Sem seguro.",
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
  "dashboard.title.kids.italic": "poupando",
  "dashboard.title.word.kid": "filho",
  "dashboard.title.word.kids": "filhos",
  "dashboard.subtitle": "tudo rodando na Solana",
  "dashboard.fetching": "Buscando na devnet…",
  "dashboard.error.load": "Não foi possível carregar as famílias. {error}",
  "dashboard.add_another": "adicionar outro filho",

  // ---- connect gate ----
  "gate.eyebrow": "entrar",
  "gate.title": "entre para ver {italic}.",
  "gate.title.italic": "suas famílias",
  "gate.body":
    "Seedling vive na Solana. Entre com seu email ou Google para ver as posições dos seus filhos, depositar USDC e enviar mesadas. Tem Phantom ou Solflare? Pode escolher na mesma tela.",

  // ---- auth (Privy) ----
  "auth.loading": "carregando…",
  "auth.signin": "entrar",
  "auth.signout": "sair",
  "auth.gate.cta": "começar",

  // ---- footer ----
  "footer.github": "github",
  "footer.x": "@seedling_sol",

  // ---- family card ----
  "card.unnamed": "sem nome",
  "card.rename.tooltip": "clique para renomear",
  "card.cadence.suffix": "frequência",
  "card.created_ago": "criado {ago}",
  "card.last_paid": "último pagamento {ago}",
  "card.share_link": "compartilhar",
  "card.copy_link": "copiar link",
  "card.kids_page": "página do filho",
  "card.stat.stream": "Mesada",
  "card.stat.stream_value": "${amount}/mês",
  "card.stat.stream_sub": "usdc",
  "card.stat.principal": "Capital",
  "card.stat.principal_sub": "reservado · rendendo",
  "card.stat.shares": "Cotas",
  "card.stat.shares_sub": "do total do cofre",
  "card.stat.yield": "Rendimento",
  "card.deposit": "depositar",
  "card.pay_pix": "pagar com Pix",
  "card.top_up": "recarregar conta",
  "card.withdraw": "sacar",
  "card.withdraw_pix": "sacar para o Pix",
  "card.draft.badge": "aguardando 1º depósito",
  "card.draft.deposit_hint":
    "O primeiro depósito cria o cofre on-chain. Use Pix ou recarregue a conta pra ativar.",
  "card.send_monthly": "Enviar mesada",
  "card.sending": "enviando…",
  "card.monthly_in": "Mesada em {countdown}",
  "card.send_bonus": "Enviar bônus",
  "card.bonus_in": "Bônus em {countdown}",
  "card.bonus_loading": "Bônus em …",
  "card.remove_kid": "remover filho",
  "card.removing": "removendo…",
  "card.edit_kid": "editar",
  "card.pix.label": "chave Pix do filho",
  "card.pix.empty": "+ adicionar chave Pix",
  "card.edit.eyebrow": "editar família",
  "card.edit.close": "fechar ✕",
  "card.edit.name.label": "nome",
  "card.edit.name.placeholder": "Maria",
  "card.edit.pix.label": "chave Pix do filho",
  "card.edit.pix.placeholder": "CPF, telefone ou email",
  "card.edit.monthly.label": "mensal · USDC",
  "card.edit.save": "salvar alterações",
  "card.edit.saving": "salvando…",
  "card.edit.error.pix": "formato da chave Pix inválido",
  "card.edit.error.monthly": "mensal precisa estar entre $1 e $100.000",
  "card.edit.toast.title": "família atualizada",
  "card.edit.toast.subtitle": "suas alterações foram salvas",
  "card.cadence_topup_eyebrow": "{plan} · este mês",
  "card.cadence_topup_title":
    "deposite ${amount} para o rendimento continuar crescendo",
  "card.cadence_topup_cta": "+ recarregar",
  "card.ago.just_now": "agora",
  "card.ago.minutes": "há {n}min",
  "card.ago.hours": "há {n}h",
  "card.ago.days": "há {n}d",
  "card.countdown.ready": "pronto",
  "card.countdown.dh": "{d}d {h}h",
  "card.countdown.hm": "{h}h {m}min",
  "card.tip.send_monthly": "enviar a mesada deste mês",
  "card.tip.send_bonus": "enviar o bônus de fim de ano",
  "card.tip.available_in": "disponível em {countdown}",
  "card.tip.loading": "carregando…",
  "card.remove_confirm.named":
    "Remover {name}? O USDC que sobrar vai pra sua carteira e as contas on-chain são fechadas.",
  "card.remove_confirm.unnamed":
    "Remover esse filho? O USDC que sobrar vai pra sua carteira e as contas on-chain são fechadas.",
  "card.error.not_eligible": "Ainda não disponível.",
  "card.error.paused": "Cofre pausado. Tente mais tarde.",
  "card.error.bonus_not_ready": "Bônus anual ainda não está pronto.",
  "card.error.bonus_already": "Bônus já distribuído neste período.",
  "card.error.no_yield":
    "Sem rendimento para distribuir ainda — o cofre não rendeu o bastante na Kamino. Tente no próximo mês.",
  "card.toast.kid_copied": "pubkey do filho copiada",
  "card.toast.link_copied": "link da página do filho copiado",
  "card.toast.share_fallback":
    "compartilhamento indisponível aqui · link copiado",
  "card.toast.monthly_title.named": "Enviado para {name}",
  "card.toast.monthly_title.fallback": "Enviado para seu filho",
  "card.toast.monthly_subtitle": "mesada do mês · on-chain",
  "card.toast.bonus_title.named": "Bônus anual de {name} chegou",
  "card.toast.bonus_title.fallback": "Bônus anual do seu filho chegou",
  "card.toast.bonus_subtitle": "rendimento de fim de ano · enviado on-chain",
  "card.toast.closed_title.named": "Cofre de {name} foi fechado",
  "card.toast.closed_title.fallback": "cofre fechado",
  "card.toast.closed_subtitle": "USDC restante devolvido · contas fechadas",
  "card.share.title": "página seedling de {name}",
  "card.share.text": "as economias de {name} crescendo no seedling.",
  "card.share.fallback_kid": "seu filho",
  "card.goals.label": "Metas de poupança",
  "card.goals.active_count": "{n} ativas",
  "card.goals.add_another": "+ adicionar outra meta",
  "goal.pct_saved": "{pct}% guardado",
  "goal.press_enter": "aperte enter para salvar",
  "goal.click_to_edit": "clique para editar",
  "goal.uploading": "enviando…",
  "goal.change_photo": "trocar foto",
  "goal.add_photo": "+ adicionar foto",
  "goal.remove_photo": "remover foto",
  "goal.save": "salvar",
  "goal.cancel": "cancelar",
  "goal.delete": "excluir essa meta",
  "goal.delete_confirm": 'Remover a meta "{label}"?',
  "goal.add.name_placeholder": "nome da meta (ex. nintendo switch)",
  "goal.add.icon_label": "ícone",
  "goal.add.add_photo_optional": "+ adicionar foto (opcional)",
  "goal.add.save": "salvar meta",
  "gifts.section.received": "presentes recebidos",
  "gifts.section.loading": "carregando…",
  "gifts.section.total": "{n} no total",
  "gifts.toast.title": "{who} presenteou ${amount} para {recipient}",
  "gifts.toast.subtitle": "PRESENTE · SEEDLING",
  "gifts.fallback.someone": "Alguém",
  "gifts.fallback.recipient": "sua família",
  "gifts.name_input.placeholder": "Vovó, Tio Tom, …",
  "gifts.save": "salvar",
  "gifts.tip.rename": "clique para renomear",
  "gifts.tip.override":
    "nome informado pela pessoa que presenteou — clique para sobrescrever",
  "gifts.tip.name": "clique para nomear",
  "gifts.name_button": "nomear {pubkey}",

  // ---- empty state ----
  "empty.title": "nenhum filho ainda.",
  "empty.body":
    "Adicione a carteira do filho, defina o valor mensal e seu primeiro depósito começa a render assim que cair.",
  "empty.cta": "Adicionar primeiro filho",

  // ---- add kid form ----
  "add_kid.eyebrow": "nova família",
  "add_kid.title.line": "adicionar um {italic}.",
  "add_kid.title.italic": "filho",
  "add_kid.close": "fechar ✕",
  "add_kid.name.label": "nome",
  "add_kid.name.optional": "(opcional · só para você)",
  "add_kid.name.placeholder": "Maria",
  "add_kid.kid_pubkey.label": "endereço da carteira do filho",
  "add_kid.kid_pubkey.placeholder": "ex. 7xKX...J9pQ",
  "add_kid.kid_pubkey.invalid": "não é um endereço Solana válido",
  "add_kid.kid_pubkey.duplicate": "você já tem um seedling para esse filho",
  "add_kid.pix_key.label": "chave Pix do filho",
  "add_kid.pix_key.optional": "(opcional · para os repasses)",
  "add_kid.pix_key.placeholder": "CPF, telefone ou email",
  "add_kid.pix_key.hint":
    "para onde a mesada vai quando você manda. a sua se o filho ainda não tem chave Pix.",
  "add_kid.pix_key.error.cpf": "CPF inválido",
  "add_kid.pix_key.error.email": "email inválido",
  "add_kid.pix_key.error.phone": "use formato E.164 (ex. +5511999998888)",
  "add_kid.monthly.label": "mensal · USDC · mín ${min}",
  "add_kid.monthly.currency_note":
    "USDC ≈ dólar americano · paridade 1:1 · não é BRL",
  "add_kid.monthly.error.number": "precisa ser número",
  "add_kid.monthly.error.min": "mínimo ${min}/mês",
  "add_kid.monthly.error.max": "máximo ${max}/mês",
  "add_kid.monthly.recommended":
    "depósito recomendado · ${total} de uma vez → ${cover} cobre o ano, ${bonus} rende o bônus",
  "add_kid.submit": "adicionar filho",
  "add_kid.creating": "criando…",
  "add_kid.fee_note": "taxa de rede ~0,001 SOL",
  "add_kid.faucets.label": "precisa de usdc?",
  "add_kid.faucets.sol": "SOL faucet ↗",
  "add_kid.faucets.usdc": "USDC faucet ↗",
  "add_kid.error.in_use": "Esse filho já tem uma mesada configurada.",
  "add_kid.error.bad_rate": "A mesada precisa ficar entre ${min} e ${max}/mês.",
  "add_kid.error.paused": "O cofre está pausado. Tente mais tarde.",
  "add_kid.toast.title.named": "Mesada de {name} foi plantada",
  "add_kid.toast.title.unnamed": "nova mesada plantada",
  "add_kid.toast.subtitle": "${monthly}/mês · rendendo na Kamino",

  // ---- mode picker (deposit cadence) ----
  "mode.section.label": "frequência do depósito",
  "mode.tagline.start": "Seedling recompensa o tempo —",
  "mode.tagline.italic": "quanto mais o dinheiro fica, mais o filho ganha.",
  "mode.recommended_badge": "recomendado",
  "mode.yearly.label": "Anual",
  "mode.yearly.desc": "deposite uma vez · maior bônus",
  "mode.yearly.plan": "Plano Anual",
  "mode.hybrid.label": "Híbrido",
  "mode.hybrid.desc": "equilíbrio entre flexibilidade e bônus",
  "mode.hybrid.plan": "Plano Híbrido",
  "mode.monthly.label": "Mensal",
  "mode.monthly.desc": "depósitos flexíveis · bônus menor",
  "mode.monthly.plan": "Plano Mensal",
  "mode.yearly.upfront_line": "≈ ${total} de uma vez",
  "mode.yearly.return_line":
    "≈ ${back} voltam pra você + ≈ ${bonus} de bônus para o filho",
  "mode.year_total_line": "≈ ${total} / ano que você coloca",
  "mode.year_bonus_line": "≈ ${bonus} de bônus para o filho no fim do ano",
  "mode.hybrid.upfront_label": "depósito inicial",
  "mode.hybrid.monthly_label": "recarga mensal · por 11 meses",
  "mode.hybrid.total_line": "total no ano: ≈ ${total} · filho recebe ${kid}",
  "mode.hybrid.bonus_line":
    "bônus estimado: ≈ ${bonus} ({pct}% do bônus anual de ${yearly})",
  "mode.hybrid.zero_upfront":
    "depósito inicial é $0 → isso é mensal, não híbrido. clique para trocar para mensal (configuração mais limpa).",
  "mode.hybrid.zero_monthly":
    "recarga mensal é $0 → isso é anual, não híbrido. clique para trocar para anual (um depósito, bônus máximo).",
  "mode.hybrid.shortfall":
    "seus depósitos cobrem ${total}, mas o filho precisa de ${need} no ano. a mesada vai pausar faltando ${short} para o fim, a menos que você complete.",
  "mode.disclosure":
    "não tiramos automaticamente da sua carteira. você se compromete a depositar na frequência escolhida; recargas perdidas pausam a mesada até você completar. o que já foi depositado fica sempre seguro no cofre.",

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
  "withdraw.title": "Sacar USDC",
  "withdraw.button.submit": "Sacar",
  "withdraw.button.confirming": "Confirmando…",
  "withdraw.error.amount_required": "precisa ser número",
  "withdraw.error.amount_positive": "precisa ser positivo",
  "withdraw.error.amount_max": "máx ${max}",
  "withdraw.max_label": "máx (${balance})",
  "withdraw.no_balance": "Sem saldo para sacar. Deposite primeiro.",
  "withdraw.preview": "queima ≈ {shares} cotas · você recebe ≈ ${usd} USDC",
  "withdraw.error.too_small": "Valor pequeno demais para sacar.",
  "withdraw.error.insufficient_shares":
    "Cotas insuficientes para sacar esse valor.",
  "withdraw.error.paused": "O cofre está pausado. Tente mais tarde.",
  "withdraw.error.slippage":
    "O preço da cota mudou durante o saque. Tente de novo.",
  "withdraw.error.dust":
    "Valor pequeno demais — precisa ser pelo menos 0,01 USDC.",
  "withdraw.toast.title": "saque confirmado",
  "withdraw.toast.subtitle": "USDC enviado para sua carteira",
  "withdraw.toast.title_likely": "saque provavelmente confirmado",
  "withdraw.toast.subtitle_likely":
    "carteira deu erro · confira se o capital atualizou",

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
    "Pix ainda não está disponível. Nosso parceiro de pagamento está finalizando a configuração — tente novamente em breve.",
  "pix.awaiting.title": "Pague R${amount} via Pix",
  "pix.awaiting.paste_label": "Cole esse código no app do banco:",
  "pix.awaiting.copy_button": "Copiar código Pix",
  "pix.awaiting.copied_button": "Copiado ✓",
  "pix.awaiting.how_to_title": "Como pagar:",
  "pix.awaiting.step_1": "Abra o app do seu banco",
  "pix.awaiting.step_2": "Procure Pix → Pix Copia e Cola",
  "pix.awaiting.step_3": "Cole o código e confirme",
  "pix.awaiting.or_qr": "ou pague em outro celular",
  "pix.awaiting.waiting": "Aguardando pagamento…",
  "pix.awaiting.expired": "Aguardando pagamento · expirado",
  "pix.awaiting.expires_in": "expira em {minutes}m {seconds}s",
  "currency.usdc_note": "USDC ≈ dólar americano · paridade 1:1 · não é BRL",
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
  "pix.offramp.toast.subtitle": "R${amount} · 4P processando · ~10s",
  "pix.offramp.success": "Pix enviado · R${amount} chegando",
  "pix.offramp.error.slippage":
    "O preço da cota mudou durante o saque. Tente de novo — o buffer cobre.",
  "pix.offramp.error.paused": "O cofre está pausado. Tente mais tarde.",

  // ---- top-up account modal (recarregar carteira Privy com USDC) ----
  "topup.title": "Recarregue seu saldo Seedling",
  "topup.subtitle":
    "Envie USDC de qualquer carteira ou exchange Solana (Phantom, Coinbase, Binance) para o endereço abaixo. O saldo chega em segundos — depois é só tocar em Depositar pra mandar pra um filho.",
  "topup.address.label": "Seu endereço",
  "topup.copy": "copiar",
  "topup.close": "fechar",
  "topup.network": "Solana · Devnet",
  "topup.warning":
    "Apenas rede Solana. USDC enviado por Ethereum, Polygon ou BSC será perdido.",
  "topup.next_step":
    "Quando o saldo chegar, toque em Depositar no card de qualquer filho pra mover pro cofre da família.",
  "topup.toast.copied": "Endereço copiado",
  "topup.toast.copy_failed":
    "Não foi possível copiar — selecione e copie manualmente",
  "topup.help.button": "Não sabe como? Te mostro",
  "topup.help.intro":
    'Ainda não tem cripto? Feche aqui e toque em "pagar com Pix" — esse é o caminho mais simples. Os métodos abaixo são pra quem já tem USDC em algum lugar.',
  "topup.help.m1.label": "Mais comum no Brasil",
  "topup.help.m1.title":
    "Saque USDC de uma exchange brasileira (Mercado Bitcoin, Binance BR, Foxbit)",
  "topup.help.m1.step1": "Compre USDC na exchange (ou use o que já tem).",
  "topup.help.m1.step2":
    'Abra "Sacar" → USDC → escolha rede Solana (NÃO Ethereum ou BSC).',
  "topup.help.m1.step3": "Cole o endereço acima como destino e confirme.",
  "topup.help.m2.label": "Exchange internacional",
  "topup.help.m2.title": "Saque USDC da Coinbase, Binance, Kraken, etc.",
  "topup.help.m2.step1": 'Abra "Sacar" / "Withdraw" / "Send" na exchange.',
  "topup.help.m2.step2":
    "Escolha USDC e rede Solana — nunca Ethereum, BSC ou Polygon.",
  "topup.help.m2.step3": "Cole o endereço acima e confirme.",
  "topup.help.m3.label": "De outra carteira Solana",
  "topup.help.m3.title":
    "Envie de uma carteira que você já controla (Phantom, Solflare, Backpack)",
  "topup.help.m3.step1": 'Abra sua carteira e toque em "Send".',
  "topup.help.m3.step2": "Escolha USDC como ativo.",
  "topup.help.m3.step3": "Cole o endereço acima e confirme.",
  "topup.help.pitfall":
    "Confira sempre se aparece Solana / SOL antes de confirmar — envios em rede errada não voltam.",

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
  "kid.eyebrow": "seu · seedling",
  "kid.greeting": "oi",
  "kid.greeting.fallback": "amigo",
  "kid.ticker.label": "seu dinheiro, agora",
  "kid.ticker.sub.guess": "faça seu palpite para ver os centavos",
  "kid.ticker.sub.live": "estimativa 8% APY · rendendo na Solana",
  "kid.stat.savings": "suas economias",
  "kid.stat.savings.foot": "da sua família",
  "kid.stat.yield": "rendimento ganho",
  "kid.stat.yield.foot.guess": "faça seu palpite primeiro",
  "kid.stat.yield.foot.live": "desde que você começou",
  "kid.coming.eyebrow": "o que vem",
  "kid.coming.next_allowance": "próxima mesada",
  "kid.coming.next_allowance.hint": "{amount} no dia 1º",
  "kid.coming.annual_bonus": "bônus anual",
  "kid.coming.annual_bonus.hint": "presente de rendimento de fim de ano",
  "kid.coming.ready": "pronto!",
  "kid.gift_cta.line": "mandar um presente",
  "kid.gift_cta.hint": "vovó · tia · qualquer um",
  "kid.gift_pix.line": "presentear em BRL via Pix",
  "kid.gift_pix.hint": "sem precisar de carteira cripto",
  "kid.gifts_received": "presentes recebidos",
  "kid.goal.eyebrow": "poupando para",
  "kid.goal.of": "de ${amount}",
  "kid.footer.powered": "feito com",
  "kid.footer.meta": "bônus {cycle} · na Solana",
  "kid.gift_toast.title": "{who} te mandou ${amount}",
  "kid.gift_toast.subtitle": "UM PRESENTE ACABOU DE CHEGAR",
  "kid.gift_toast.fallback_who": "Alguém",

  "gm.eyebrow": "presentear · seedling",
  "gm.title": "mandar um presente para",
  "gm.body":
    "Qualquer pessoa com carteira Solana pode presentear. O USDC cai no cofre seedling {who} e começa a render.",
  "gm.body.named": "de {name}",
  "gm.body.unnamed": "da família",
  "gm.from_label": "seu nome",
  "gm.from_placeholder": "Vovó · Tio Tom · …",
  "gm.amount_custom": "outro",
  "gm.send_here.connect": "conecte a carteira para mandar daqui",
  "gm.send_here.confirming": "confirmando…",
  "gm.send_here.sent": "✓ presente enviado",
  "gm.send_here.cta": "mandar ${amount} dessa carteira",
  "gm.tx_link": "ver transação ↗",
  "gm.or_divider": "ou escaneie em outro dispositivo",
  "gm.deep_link": "abrir no app da carteira",
  "gm.copy_link": "copiar link",
  "gm.copy_link.copied": "copiado",
  "gm.foot.mobile": "ou escaneie com Phantom, Solflare, ou Backpack",
  "gm.foot.desktop":
    "escaneie o QR com Phantom, Solflare, ou Backpack no celular",
  "gm.send_error.rejected": "você rejeitou a transação na carteira",

  // ---- prediction card ----
  "predict.eyebrow.too_early": "adivinhe seu rendimento",
  "predict.too_early.body":
    "sua primeira rodada de palpites abre no dia 1º do próximo mês.",
  "predict.too_early.foot":
    "volte para adivinhar quanto suas economias renderam.",
  "predict.eyebrow.predict": "adivinhe o rendimento de {month}",
  "predict.prompt": "quanto suas economias renderam em {month}?",
  "predict.foot.predict":
    "toque em uma opção — a resposta aparece logo em seguida.",
  "predict.eyebrow.preview": "fechar seu palpite?",
  "predict.preview.hint": "quando você fechar, a resposta aparece. pronto?",
  "predict.lock_in": "fechar palpite",
  "predict.pick_again": "escolher de novo",
  "predict.eyebrow.reveal": "como foi seu palpite de {month}?",
  "predict.your_guess": "seu palpite",
  "predict.actual": "real",
  "predict.vs": "vs",
  "predict.spot_on": "exato. boa.",
  "predict.off_by": "diferença de {cents}¢.",
  "predict.share": "compartilhar meu mês",
  "predict.share.busy": "criando card…",
  "predict.play_again": "jogar de novo",
  "predict.foot.next": "próxima rodada abre no dia 1º do próximo mês.",
  "predict.share_card.error": "não consegui gerar o card",
  "predict.preview.eyebrow": "seu card · pronto para compartilhar",
  "predict.preview.alt": "recapitulação mensal seedling",
  "predict.preview.share": "compartilhar",
  "predict.preview.download": "baixar",
  "predict.preview.close": "fechar",
  "predict.preview.foot.share":
    "compartilhar abre o painel do celular · baixar salva a imagem.",
  "predict.preview.foot.download": "baixar salva a imagem no computador.",
  "predict.kid_fallback": "criança",
  "share_card.eyebrow": "{month} · seedling de {name}",
  "share_card.my_prediction": "meu palpite",
  "share_card.actual": "real",
  "share_card.spot_on": "exato.",
  "share_card.off_by": "diferença de {cents}¢.",
  "share_card.saving_toward": "poupando para",

  // ---- year recap ----
  "year.cta.eyebrow.bonus": "bônus anual",
  "year.cta.eyebrow.recap": "recapitulação do ano",
  "year.cta.title.bonus": "seu {year} acabou de chegar — veja como foi",
  "year.cta.title.recap": "seu ano até agora · toque para reviver",
  "year.slide.hero.eyebrow": "{year} · seedling",
  "year.slide.hero.headline.bonus": "seu ano.",
  "year.slide.hero.headline.recap": "seu ano até agora.",
  "year.slide.hero.sub.named": "vamos relembrar, {name}.",
  "year.slide.hero.sub.unnamed": "vamos relembrar.",
  "year.slide.hero.tap_hint": "toque para começar →",
  "year.slide.month.line": "suas economias renderam",
  "year.slide.month.foot": "a {apy}% APY",
  "year.slide.month.cumulative": "rendimento até aqui: ${amount}",
  "year.slide.best.eyebrow": "seu melhor mês",
  "year.slide.best.sub": "rendeu",
  "year.slide.best.sub_at": "a {apy}% APY.",
  "year.slide.deposited.eyebrow": "você depositou",
  "year.slide.deposited.sub": "ao longo do ano.",
  "year.slide.yielded.eyebrow.bonus": "seu bônus anual",
  "year.slide.yielded.eyebrow.recap": "o que suas economias renderam",
  "year.slide.yielded.sub.bonus":
    "acabou de cair na sua carteira — rendimento puro.",
  "year.slide.yielded.sub.recap": "só do dinheiro guardado, parado, rendendo.",
  "year.slide.growth.eyebrow": "isso é",
  "year.slide.growth.sub": "de crescimento, sem você fazer nada.",
  "year.slide.share.eyebrow": "compartilhe seu ano",
  "year.slide.share.headline": "transforme em um card.",
  "year.slide.share.sub": "uma imagem com tudo — manda para a vovó.",
  "year.slide.share.cta.busy": "criando seu card…",
  "year.slide.share.cta": "ver meu card",
  "year.slide.share.done": "pronto",
  "year.preview.alt": "recapitulação seedling de {year}",
  "year.preview.share": "compartilhar",
  "year.preview.download": "baixar",
  "year.preview.close": "fechar",
  "year.fallback_name": "amigo",
  "year_card.eyebrow": "{year} · ano seedling de {name}",
  "year_card.headline_1": "um ano de",
  "year_card.headline_2": "crescimento.",
  "year_card.month_section": "MÊS A MÊS",
  "year_card.month_sub": "rendimento mensal",
  "year_card.label.deposited": "VOCÊ DEPOSITOU",
  "year_card.label.yielded": "SEU DINHEIRO RENDEU",
  "year_card.label.growth": "ISSO É",
  "year_card.best": "MELHOR MÊS",
  "year_card.best_apy": "a {apy}% APY",
  "year_card.growth_sub": "de crescimento, só por esperar.",
  "year_card.foot": "seedling · seedlingsol.xyz",
  "cycle.annual": "anual",
  "cycle.semi_annual": "semestral",
  "cycle.eighteen_month": "18 meses",
  "cycle.biennial": "bienal",
  "cycle.n_month": "{n} meses",

  // ---- gifts ---- (additional gifts keys live under "gifts.section.*"
  // earlier in this file — those are the ones actually rendered.)

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
