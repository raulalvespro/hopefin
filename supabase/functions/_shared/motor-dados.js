// motor-dados.js — carrega, de uma vez, tudo que o motor (motor.js) precisa para as
// competências [compIni, compFim] de um grupo. Funciona com o cliente do app (RLS do
// usuário) e com o cliente service_role das Edge Functions (mesma API do supabase-js).
//
// Janela de gastos: 3 meses ANTES de compIni (uma fatura traz compras de meses
// anteriores, e "mover de fatura" pode empurrar mais) até o fim de compFim.

import { addMeses, compDe, diasNoMes } from './motor.js'

function inicioDe(comp) { return `${comp}-01` }
function fimDe(comp) { return `${comp}-${String(diasNoMes(comp)).padStart(2, '0')}` }

function checar(nome, r) {
  if (r.error) throw new Error(`motor-dados: falha ao ler ${nome}: ${r.error.message}`)
  return r.data || []
}

export async function carregarDadosMotor(cliente, grupoId, { compIni, compFim, parcelasAte = null, gastosDesde = null } = {}) {
  const gIni = gastosDesde || inicioDe(addMeses(compIni, -3))
  const gFim = fimDe(addMeses(compFim, 1))
  const pIni = inicioDe(addMeses(compIni, -1))
  const pFim = parcelasAte ? fimDe(parcelasAte) : fimDe(addMeses(compFim, 1))
  const cpIni = addMeses(compIni, -3)
  const cpFim = addMeses(compFim, 1)

  const [cartoes, gastos, parcelas, assinaturas, fixas, fixasLanc, entradas, contasPagas, transferencias, orcamentos, grupo, aReceber] = await Promise.all([
    cliente.from('cartoes').select('id, nome, bandeira, cor, dia_fechamento, dia_vencimento, limite, alerta_dias, ativo, compra_no_fechamento').eq('grupo_id', grupoId),
    cliente.from('gastos').select('id, descricao, valor, data, cartao_id, tipo_pagamento, pessoa_id, fatura_ajuste, categoria, reembolso_status, reembolso_entrada_id, observacao, usuario_id, origem, criado_em, pessoas(nome)')
      .eq('grupo_id', grupoId).gte('data', gIni).lte('data', gFim),
    cliente.from('parcelas').select('id, numero, valor, data_vencimento, paga, recebido, reembolso_entrada_id, parcelamento_id, parcelamentos(descricao, num_parcelas, cartao_id, pessoa_id, categoria, pessoas(nome))')
      .eq('grupo_id', grupoId).gte('data_vencimento', pIni).lte('data_vencimento', pFim),
    cliente.from('assinaturas').select('id, nome, valor, dia_cobranca, cartao_id, ativo, categoria, cobrada_desde, criado_em, cancelada_em').eq('grupo_id', grupoId),
    cliente.from('contas_fixas').select('id, nome, valor, dia_vencimento, categoria, ativo, alerta_dias, criado_em').eq('grupo_id', grupoId),
    cliente.from('fixas_lancamentos').select('conta_fixa_id, competencia, valor_real, pago').eq('grupo_id', grupoId).gte('competencia', compIni).lte('competencia', compFim),
    cliente.from('entradas').select('id, descricao, valor, data, recebido, data_recebimento, recorrente, serie_id, origem, tipo, usuario_id').eq('grupo_id', grupoId)
      .gte('data', inicioDe(compIni)).lte('data', fimDe(compFim)),
    cliente.from('contas_pagas').select('id, tipo, referencia_id, competencia, valor, pago, data_pagamento').eq('grupo_id', grupoId).gte('competencia', cpIni).lte('competencia', cpFim),
    cliente.from('transferencias').select('id, valor, data, descricao, cofrinho_id').eq('grupo_id', grupoId).gte('data', inicioDe(compIni)).lte('data', fimDe(compFim)),
    cliente.from('orcamentos').select('categoria, valor, pago_com').eq('grupo_id', grupoId),
    cliente.from('grupos').select('criado_em').eq('id', grupoId).maybeSingle(),
    // A receber lançado à mão (reembolso previsto e origem "conta fixa" — A1.14/A1.15)
    cliente.from('a_receber').select('id, pessoa_id, descricao, valor, data, recebido, entrada_id, recorrente, serie_id, conta_fixa_id, pessoas(nome), contas_fixas(nome)')
      .eq('grupo_id', grupoId).gte('data', inicioDe(compIni)).lte('data', fimDe(compFim)),
  ])

  return {
    cartoes: checar('cartões', cartoes),
    gastos: checar('gastos', gastos).map((g) => ({ ...g, pessoa_nome: g.pessoas?.nome || null })),
    parcelas: checar('parcelas', parcelas).map((p) => ({
      id: p.id, numero: p.numero, valor: p.valor, data_vencimento: p.data_vencimento, paga: p.paga, recebido: p.recebido,
      reembolso_entrada_id: p.reembolso_entrada_id || null, parcelamento_id: p.parcelamento_id,
      descricao: p.parcelamentos?.descricao, num_parcelas: p.parcelamentos?.num_parcelas,
      cartao_id: p.parcelamentos?.cartao_id || null, pessoa_id: p.parcelamentos?.pessoa_id || null,
      pessoa_nome: p.parcelamentos?.pessoas?.nome || null, categoria: p.parcelamentos?.categoria,
    })),
    assinaturas: checar('assinaturas', assinaturas),
    fixas: checar('contas fixas', fixas),
    fixasLanc: checar('contas do mês', fixasLanc),
    entradas: checar('entradas', entradas),
    contasPagas: checar('pagamentos', contasPagas),
    transferencias: checar('cofrinhos', transferencias),
    orcamentos: checar('orçamento', orcamentos),
    aReceber: checar('a receber', aReceber).map((m) => ({ ...m, pessoa_nome: m.pessoas?.nome || null, conta_fixa_nome: m.contas_fixas?.nome || null })),
    inicioComp: grupo.data?.criado_em ? compDe(grupo.data.criado_em) : null,
  }
}
