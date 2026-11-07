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
}
