// Nome de categoria pra mostrar na tela (A8.20). A chave salva nos lançamentos continua a mesma
// (ex.: "alimentacao"); aqui só ganha acento e a primeira letra maiúscula.
const COM_ACENTO = {
  alimentacao: 'Alimentação',
  saude: 'Saúde',
  vestuario: 'Vestuário',
  eletronico: 'Eletrônico',
  moveis: 'Móveis',
  educacao: 'Educação',
}

export function rotuloCategoria(nome) {
  if (!nome) return ''
  const n = COM_ACENTO[nome] || String(nome)
  return n.charAt(0).toUpperCase() + n.slice(1)
}
