// Textos das telas novas do redesenho (prompts 14–20), centralizados aqui pra
// trocar sem mexer nos componentes (regra 9 do CLAUDE.md). Nenhuma tela nova deve
// ter frase escrita direto no componente. Dados de exemplo (ex.: saldo do painel
// de login) ficam marcados com /* exemplo */ — não são dados reais do grupo.
export const copy = {
  // Painel de marca compartilhado pelas telas de entrada (login, cadastro).
  entrada: {
    pitchTitulo: 'O dinheiro da casa, finalmente no mesmo lugar.',
    pitchTexto: 'Gastos, contas fixas, cartões e metas da família inteira, num app só. Cada um lança o seu, todo mundo enxerga o mesmo saldo.',
    saldoLabel: 'Saldo previsto',           /* exemplo — painel ilustrativo */
    saldoValor: 'R$ 2.418,30',              /* exemplo */
    saldoTag: 'Dentro do orçamento',        /* exemplo */
  },

  login: {
    titulo: 'Entrar',
    subtitulo: 'Que bom te ver de novo.',
    labelEmail: 'E-mail',
    labelSenha: 'Senha',
    esqueci: 'Esqueci minha senha',
    entrar: 'Entrar',
    entrando: 'Entrando…',
    semConta: 'Ainda não tem conta?',
    criarConta: 'Criar conta grátis',
    erroCredenciais: 'E-mail ou senha incorretos.',

    // Recuperação de senha (fluxo inline, sem mudar a lógica de auth)
    recTitulo: 'Recuperar senha',
    recTexto: 'Informe seu e-mail e enviaremos um link para você redefinir a senha.',
    recErroEmail: 'Informe seu e-mail.',
    recEnviar: 'Enviar link',
    recEnviando: 'Enviando…',
    recErroEnvio: 'Não foi possível enviar o e-mail. Tente de novo.',
    recVoltar: 'Voltar',
    enviadoTitulo: 'Verifique seu e-mail',
    enviadoTexto: (email) => `Se houver uma conta para ${email}, enviamos um link para você criar uma nova senha.`,
    enviadoVoltar: 'Voltar para o login',
  },

  cadastro: {
    // Painel de marca (lado esquerdo)
    painelTitulo: 'Um preço para a casa toda.',
    painelTexto: 'Crie o grupo da sua família e convide quem divide as contas com você. Cada um lança no próprio celular, e o saldo é um só.',
    avVoce: 'Você',
    avMais: '+1',
    saldoCasaLabel: 'Saldo da casa',
    saldoCasaValor: 'R$ 2.418',             /* exemplo — painel ilustrativo */
    seloLabel: 'Preço de lançamento',
    seloAno: '/ano no 1º ano',
    seloAte: (data) => `Garantido até ${data}`,

    // Formulário (lado direito)
    titulo: 'Criar conta',
    subtitulo: (dias) => `${dias} dias grátis, sem cartão de crédito.`,
    tipoNovo: '🏠 Criar família',
    tipoExistente: '🔗 Tenho um convite',
    labelNome: 'Seu nome',
    phNome: 'Como quer ser chamado(a)',
    labelEmail: 'E-mail',
    labelWhats: 'WhatsApp (com DDD)',
    phWhats: '(11) 90000-0000',
    labelSenha: 'Crie sua senha',
    phSenha: 'mínimo 6 caracteres',
    labelSenha2: 'Repita a senha',
    phSenha2: 'digite de novo',
    labelGrupo: 'Nome da família (opcional)',
    ajudaGrupo: 'Depois você convida quem divide as contas com você, com o código que aparece nas Configurações.',
    labelCupom: 'Cupom (opcional)',
    phCupom: 'Tem um cupom? Cole aqui',
    labelCodigo: 'Código do convite',
    phCodigo: 'Cole o código que você recebeu',
    ajudaCodigo: 'Peça o código para quem criou a família (fica nas Configurações, em "Convidar para o grupo").',
    aceite: 'Li e aceito os',
    aceiteTermos: 'Termos de Uso',
    aceiteE: 'e a',
    aceitePrivacidade: 'Política de Privacidade',
    optin: 'Quero receber dicas e novidades do HopeFin por WhatsApp e e-mail. Dá pra cancelar quando quiser.',
    enviar: 'Começar teste grátis',
    enviando: 'Criando conta…',
    jaTemConta: 'Já tem conta?',
    entrar: 'Entrar',

    // Erros
    erroSenhaCurta: 'A senha precisa ter ao menos 6 caracteres.',
    erroSenhaDif: 'As senhas não coincidem.',
    erroCodigo: 'Cole o código do convite.',
    erroWhats: 'Informe um WhatsApp válido com DDD.',
    erroAceite: 'Para continuar, aceite os Termos de Uso e a Política de Privacidade.',
    erroEmailUsado: 'Já existe uma conta com esse e-mail. Faça login.',
    erroCodigoInvalido: 'Código do convite inválido. Confira com quem te convidou.',
    erroGenerico: 'Não foi possível criar a conta. Tente de novo.',
  },

  splash: {
    tagline: 'Finanças da família',
  },

  inicio: {
    saudacao: 'Olá',
    grupoFallback: 'Sua casa',
    caixaLabel: 'Saldo em caixa',
    noAzul: 'No azul',
    noVermelho: 'No vermelho',
    projecaoMes: 'projeção fim do mês',
    // Balões de ajuda (InfoDica) — linguagem simples, no momento da dúvida
    dicaCaixaTitulo: 'Saldo em caixa',
    dicaCaixa: 'O que você tem hoje de verdade: o que já entrou menos o que já saiu da conta. Não conta o que ainda vai cair nem o que ainda vai vencer.',
    dicaProjecaoTitulo: 'Projeção do fim do mês',
    dicaProjecao: 'Como seu saldo deve terminar o mês, somando o que ainda falta entrar e as contas que ainda vão vencer.',
    // Bloco "O mês até agora" (realizado × previsto)
    mesAteAgora: 'O mês até agora',
    entrou: 'Entrou',
    saiu: 'Saiu',
    de: (v) => `de ${v}`,
    aReceberLabel: 'a receber',
    aPagarLabel: 'a pagar',
    // Atalho único: tudo que falta pagar no mês (contas + parcelas + faturas)
    aVencer: (n) => `${n} ${n === 1 ? 'conta a vencer' : 'contas a vencer'}`,
    contasVencerSub: 'contas, parcelas e faturas',
    emDia: 'Contas em dia',
    emDiaSub: 'Nada a vencer',
    carregando: 'Carregando suas contas…',
  },

  contasMes: {
    titulo: 'Contas do mês',
    intro: 'Tudo que vence no mês — contas fixas, faturas, parcelas e assinaturas. Marque o que já foi pago.',
    pagoAteAgora: 'Pago até agora',
    contasDe: (a, b) => `${a} de ${b} ${b === 1 ? 'conta' : 'contas'}`,
    deTotal: (v) => `de ${v}`,
    faltaPagar: 'Falta pagar',
    aPagar: 'A pagar',
    pagas: 'Pagas',
    vazio: 'Nada a pagar neste mês.',
    carregando: 'Carregando...',
    mesAnterior: 'Mês anterior',
    proximoMes: 'Próximo mês',
    tagVencida: 'Vencida',
    tagHoje: 'Vence hoje',
    tagEmDias: (n) => (n === 1 ? 'Amanhã' : `Em ${n} dias`),
    tagPago: 'Pago',
    venceEm: (dd) => `vence ${dd}`,
    venceuEm: (dd) => `venceu ${dd}`,
    pagoEm: (dd) => `Pago em ${dd}`,
    marcarPaga: 'Marcar como paga',
    desmarcar: 'Desmarcar',
    tipoFixa: 'Conta fixa',
    tipoFatura: 'Cartão de crédito',
    tipoAssinatura: 'Assinatura',
    tipoParcela: (n, t) => `Parcela ${n}/${t}`,
    valorRealLabel: 'Valor real que veio',
    valorRealPh: (v) => `previsto ${v}`,
    okPaga: 'Marcada como paga',
    okParcelaPaga: 'Parcela paga',
    okDesfeito: 'Pagamento desfeito',
    okValor: 'Valor lançado',
    desfazer: 'Desfazer',
    desfazerOutroMes: 'Volte para o mês da conta para desfazer.',
  },

  boasVindas: {
    titulo: 'Bem-vindo ao HopeFin',
    subtitulo: 'Três passos e o mês da sua casa já aparece organizado.',
    comeceAqui: 'Comece por aqui',
    contador: (n) => `${n} de 3`,
    feito: 'Feito',
    convidar: 'Convidar alguém da família',
    irInicio: 'Ir para o início',
    tudoPronto: 'Tudo pronto! Seu mês já está organizado.',
    passos: [
      { titulo: 'Cadastrar sua renda', subtitulo: 'Quanto entra por mês na casa', cta: 'Cadastrar renda' },
      { titulo: 'Adicionar um cartão', subtitulo: 'Para ver a fatura antes de fechar', cta: 'Adicionar cartão' },
      { titulo: 'Lançar uma conta fixa', subtitulo: 'Aluguel, luz, internet, escola', cta: 'Lançar conta fixa' },
    ],
  },

  onboarding: {
    pular: 'Pular',
    proximo: 'Próximo',
    comecar: 'Começar teste grátis',
    jaTenho: 'Já tenho conta',
    passos: [
      {
        titulo: 'A casa toda no mesmo app',
        texto: 'Convide quem divide as contas com você. Cada um lança o seu, todos veem o mesmo saldo.',
        avatar: 'Eu',
      },
      {
        titulo: 'Fale e está lançado',
        texto: 'Toque no microfone e diga o gasto do seu jeito. O app entende valor, categoria e data.',
        bolha: '"paguei a luz, 212 reais"',   /* exemplo */
      },
      {
        titulo: 'Veja o mês antes dele chegar',
        texto: 'Contas fixas, parcelas e faturas viram uma projeção do saldo, para decidir com calma.',
        mes: 'dezembro',                       /* exemplo */
      },
    ],
  },
}
