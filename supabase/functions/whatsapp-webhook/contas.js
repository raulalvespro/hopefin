// "Paguei a parcela da usina solar" (27/11/2026): conta fixa, parcela sem cartão (carnê, empréstimo,
// financiamento) e assinatura fora do cartão — as mesmas linhas de Contas do mês, vindas do MESMO motor do app.
// A IA só diz QUAL conta (o nome exato da lista); aqui o Joca acha o mês certo:
//   1) a mais antiga sem pagar até este mês (em atraso até 3 meses, igual ao "Em atraso" do app);
//   2) sem nada pendente até este mês: se a deste mês já está paga → "já está paga";
//      senão a do mês que vem (pagou adiantado);
//   3) nada disso → "não tem pra pagar agora".
// Fatura de cartão NÃO entra aqui (tem o caminho próprio, pagar_fatura).
import { resumoMes, compDe, addMeses, compsEntre } from '../_shared/motor.js'

const normalizar = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()

// Todas as contas (pagas ou não) de 3 meses atrás até o mês que vem, uma linha por conta e mês.
export function contasDoMotor(dados, hoje) {
  const atual = compDe(hoje)
  const ini3 = addMeses(atual, -3)
  const ini = dados?.inicioComp && dados.inicioComp > ini3 ? dados.inicioComp : ini3
  const out = []
  for (const comp of compsEntre(ini, addMeses(atual, 1))) {
    const r = resumoMes(comp, dados, { hoje })
    const add = (x, tipo, extra = {}) => out.push({ tipo, comp, id: x.id, nome: String(x.descricao || '').trim(), valor: x.valor, data: x.data || null, paga: !!x.paga, ...extra })
    for (const f of r.fixas || []) if (f.valor > 0.004) add(f, 'fixa', { previsto: f.previsto })
    for (const p of r.parcelasAvulsas || []) if (p.valor > 0.004) add(p, 'parcela', { numero: p.numero, total: p.total })
    for (const a of r.assinaturasAvulsas || []) if (a.valor > 0.004) add(a, 'assinatura')
  }
  return out
}

// Nomes que vão pra IA escolher (sem repetir).
export function nomesDeContas(itens) {
  const vistos = new Map()
  for (const i of itens || []) if (i.nome && !vistos.has(normalizar(i.nome))) vistos.set(normalizar(i.nome), i.nome)
  return [...vistos.values()].sort((a, b) => a.localeCompare(b, 'pt-BR'))
}

// { alvo } | { jaPaga } | { nada: true } — ver as regras no topo.
export function alvoDaConta(itens, nome, hoje) {
  const atual = compDe(hoje)
  const n = normalizar(nome)
  const daConta = (itens || []).filter((i) => normalizar(i.nome) === n)
    .sort((a, b) => a.comp.localeCompare(b.comp) || String(a.data || '').localeCompare(String(b.data || '')))
  if (!daConta.length) return { nada: true }
  const pendente = daConta.find((i) => !i.paga && i.comp <= atual)
  if (pendente) return { alvo: pendente }
  const doMes = daConta.filter((i) => i.comp === atual)
  if (doMes.length && doMes.every((i) => i.paga)) return { jaPaga: doMes[doMes.length - 1] }
  const proximo = daConta.find((i) => !i.paga && i.comp > atual)
  if (proximo) return { alvo: proximo }
  const ultimaPaga = [...daConta].reverse().find((i) => i.paga)
  return ultimaPaga ? { jaPaga: ultimaPaga } : { nada: true }
}
