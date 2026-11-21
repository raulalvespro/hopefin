import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { useAtualizarSozinho } from '../hooks/useAtualizarSozinho'
import { format, startOfMonth, endOfMonth, subMonths, addMonths } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { ChevronLeft, ChevronRight, Plus, Layers, CalendarCheck, Upload, Sparkles } from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { destinoVoltar } from '../lib/voltar'
import BotaoVoz from '../components/BotaoVoz'
import SwipeRow from '../components/SwipeRow'
import { useCategorias, rotuloCategoria } from '../hooks/useCategorias'
import { useDb } from '../hooks/useDb'
import { useToast } from '../contexts/ToastContext'
import { fmt, fmtData, hojeISO } from '../lib/format'
import { EmptyState } from '../components/ui'
import Joca from '../components/Joca'
import { copy } from '../copy/pt-BR'
import { assinaturaParecida } from '../lib/assinaturaParecida'
import { periodoParcelas } from '../lib/parcelas'
import { usePessoas } from '../hooks/usePessoas'
import EscolherPessoa from '../components/EscolherPessoa'
import DividirConta from '../components/DividirConta'
import { resumoPartes, salvarPartes, partesDoBanco } from '../lib/dividir'
import { useFlags } from '../hooks/useFlags'
import BuscaFiltros from '../components/BuscaFiltros'
import { filtrar, filtroVazio, temFiltro, distintos } from '../lib/busca'
import { compDaCompra, faturaDoCartao, addMeses, hojeBRT, primeiroVencimentoParcelado } from '../lib/motor'
import { useAbrirNovoPeloLink } from '../hooks/useAbrirNovoPeloLink'

const novoForm = () => ({ descricao: '', valor: '', categoria: 'outros', tipo_pagamento: 'cartao', cartao_id: '', parcelado: false, num_parcelas: '', parcelas_pagas: '', data: hojeISO(), de_terceiro: false, pessoa_nome: '', reembolso_status: null, observacao: '', assinatura: false, fatura_ajuste: 0, dividir: false, partes: [] })
const tg = copy.gastos
// Vencimento curto: "09/12" no ano corrente, "09/01/2027" em outro ano
const vencCurto = (iso, hoje) => fmtData(iso, iso.slice(0, 4) === hoje.slice(0, 4) ? 'dd/MM' : 'dd/MM/yyyy')
const COR_FATURA = { aberta: 'var(--text3)', fechada: 'var(--amber-text)', atrasada: 'var(--red-text)', paga: 'var(--amber-text)' }

// Linha da lista a partir do gasto do banco — também usada pra abrir o editar pelo link
// /gastos?editar=<id>&voltar=cartoes (fatura do cartão, A8.7).
const paraItemGasto = (g) => ({
  id: 'g-' + g.id, rawId: g.id, tipo: 'gasto',
  descricao: g.descricao, valor: Number(g.valor), categoria: g.categoria, data: g.data, criado: g.criado_em || '',
  observacao: g.observacao || '',
  tipo_pagamento: g.tipo_pagamento, cartao_id: g.cartao_id, fatura_ajuste: Number(g.fatura_ajuste) || 0,
  // "Cartão" salvo sem dizer qual (antes da trava de 16/11): pede pra escolher.
  semCartao: g.tipo_pagamento === 'cartao' && !g.cartao_id,
  origem: g.cartoes?.nome || (g.tipo_pagamento === 'cartao' ? 'cartão?' : g.tipo_pagamento), pessoa: g.usuarios?.nome?.split(' ')[0],
  pessoa_id: g.pessoa_id, terceiro: g.pessoa_id ? (g.pessoas?.nome || 'alguém') : null, reembolso_status: g.reembolso_status,
})

export default function Gastos() {
  const { perfil } = useAuth()
  const { categorias, emojiDe } = useCategorias()
  const run = useDb()
  const { toast } = useToast()
  const navigate = useNavigate()
  const [mes, setMes] = useState(new Date())
  const [itens, setItens] = useState([])
  const [verTodos, setVerTodos] = useState(false)
  const [cartoes, setCartoes] = useState([])
  const { pessoas, garantirPessoa } = usePessoas(perfil?.grupo_id) // da mais usada pra menos (A3.3)
  const [modal, setModal] = useState(false)
  const [params, setParams] = useSearchParams()
  const [cartoesProntos, setCartoesProntos] = useState(false)
  const [voltarPara, setVoltarPara] = useState(null)
  const abriuPeloLink = useRef(false)
  const [editando, setEditando] = useState(null)
  const [form, setForm] = useState(novoForm())
  const [salvando, setSalvando] = useState(false)
  const [loading, setLoading] = useState(true)
  const [faltaCartao, setFaltaCartao] = useState(false) // tentou salvar "Cartão" sem escolher qual
  const [assinaturas, setAssinaturas] = useState([])     // as cadastradas (aviso de compra repetida)
  const [avisoDispensado, setAvisoDispensado] = useState(null) // "É outra compra"
  const [faturasPagas, setFaturasPagas] = useState([])   // contas_pagas das faturas (aviso "já paga")

  // Busca e filtros (A3.1): só pra quem tem a chave de recurso "busca_filtros" (no começo, só o dono).
  const flags = useFlags()
  const buscaLigada = !!flags?.busca_filtros
  const [filtro, setFiltro] = useState(filtroVazio())
  const periodoFiltro = buscaLigada && (filtro.de || filtro.ate) ? { de: filtro.de, ate: filtro.ate } : null

  useEffect(() => { if (perfil?.grupo_id) { carregar(); carregarCartoes(); carregarAssinaturas() } }, [perfil, mes, periodoFiltro?.de, periodoFiltro?.ate])
  useAtualizarSozinho(perfil?.grupo_id ? (o) => { carregar(o); carregarCartoes(); carregarAssinaturas() } : null)

  async function carregar(opcoes) {
    if (!opcoes?.silencioso) { setLoading(true); setVerTodos(false) }
    const gid = perfil.grupo_id
    // Com o filtro de período da busca (A3.1), carrega o período escolhido em vez do mês.
    const inicio = periodoFiltro ? (periodoFiltro.de || '2000-01-01') : format(startOfMonth(mes), 'yyyy-MM-dd')
    const fim = periodoFiltro ? (periodoFiltro.ate || '2100-12-31') : format(endOfMonth(mes), 'yyyy-MM-dd')

    const [{ data: gastos }, { data: parcelas }] = await Promise.all([
      supabase.from('gastos').select('*, cartoes(nome), usuarios(nome), pessoas(nome)').eq('grupo_id', gid).gte('data', inicio).lte('data', fim),
      supabase.from('parcelas').select('*, parcelamentos(descricao, categoria, num_parcelas, pessoa_id, cartoes(nome), usuarios(nome), pessoas(nome))').eq('grupo_id', gid).eq('antes_do_app', false).gte('data_vencimento', inicio).lte('data_vencimento', fim),
    ])

    const gastosItens = (gastos || []).map(paraItemGasto)
    const parcelasItens = (parcelas || []).map(p => ({
      id: 'p-' + p.id, tipo: 'parcela',
      descricao: p.parcelamentos?.descricao, valor: Number(p.valor), categoria: p.parcelamentos?.categoria, data: p.data_vencimento,
      origem: p.parcelamentos?.cartoes?.nome || 'Parcelado', pessoa: p.parcelamentos?.usuarios?.nome?.split(' ')[0],
      numero: p.numero, totalParcelas: p.parcelamentos?.num_parcelas, criado: p.criado_em || '',
      parcelamentoId: p.parcelamento_id,
      // Parcela de compra de outra pessoa: fica em "A receber" e não entra no total do mês
      terceiro: p.parcelamentos?.pessoa_id ? (p.parcelamentos?.pessoas?.nome || 'alguém') : null,
      reembolso_status: p.recebido ? 'quitado' : 'pendente',
    }))

    // Os ÚLTIMOS LANÇADOS aparecem primeiro (pelo momento em que foram lançados). A data do gasto continua
    // aparecendo em cada linha; em caso de empate, vale a data mais recente.
    setItens([...gastosItens, ...parcelasItens].sort((a, b) => (b.criado || '').localeCompare(a.criado || '') || b.data.localeCompare(a.data)))
    setLoading(false)
  }

  // Cartões com os dias (pra mostrar em qual fatura a compra cai) + as faturas já pagas.
  async function carregarCartoes() {
    const [{ data }, { data: pagas }] = await Promise.all([
      supabase.from('cartoes').select('id, nome, dia_fechamento, dia_vencimento, compra_no_fechamento').eq('grupo_id', perfil.grupo_id).eq('ativo', true),
      supabase.from('contas_pagas').select('tipo, referencia_id, competencia, pago').eq('grupo_id', perfil.grupo_id).eq('tipo', 'fatura'),
    ])
    setCartoes(data || [])
    setFaturasPagas(pagas || [])
    setCartoesProntos(true)
  }

  async function carregarAssinaturas() {
    const { data } = await supabase.from('assinaturas').select('id, nome, valor, dia_cobranca, cartao_id').eq('grupo_id', perfil.grupo_id).eq('ativo', true)
    setAssinaturas(data || [])
  }

  // "+ Nova" da aba Assinaturas (A3.6): abre o Novo gasto já marcado como assinatura e, ao
  // terminar ou cancelar, volta pra lá. Espera os cartões pra escolher o cartão como sempre.
  useEffect(() => {
    if (abriuPeloLink.current || params.get('novo') !== 'assinatura' || !cartoesProntos) return
    abriuPeloLink.current = true
    setVoltarPara(params.get('voltar') === 'assinaturas' ? '/assinaturas' : null) // só destino conhecido
    setParams({}, { replace: true })
    abrirNovo({ assinatura: true })
  }, [params, cartoesProntos])

  // Editar direto da fatura do cartão (A8.7): /gastos?editar=<id>&voltar=cartoes. A compra pode
  // ser de outro mês, então busca ela pelo id (só do grupo) e, no fim, volta pra fatura.
  useEffect(() => {
    const id = params.get('editar')
    if (abriuPeloLink.current || !id || !cartoesProntos || !perfil?.grupo_id) return
    abriuPeloLink.current = true
    const destino = destinoVoltar(params) // volta pra mesma fatura do cartão (A8.7)
    setParams({}, { replace: true })
    supabase.from('gastos').select('*, cartoes(nome), usuarios(nome), pessoas(nome)').eq('id', id).eq('grupo_id', perfil.grupo_id).maybeSingle()
      .then(({ data }) => {
        if (!data) { toast(tg.naoAchei, 'erro'); return }
        setVoltarPara(destino)
        editarGasto(paraItemGasto(data))
      })
  }, [params, cartoesProntos, perfil]) // eslint-disable-line react-hooks/exhaustive-deps

  // Novo gasto: sem cartão cadastrado já começa em PIX; com um cartão só, ele vem escolhido.
  useAbrirNovoPeloLink(() => abrirNovo(), cartoesProntos) // ?novo=1 (primeiros passos, A8.10)
  function abrirNovo(extra = {}) {
    const f = { ...novoForm(), ...extra }
    if (cartoes.length === 0) f.tipo_pagamento = 'pix'
    else if (cartoes.length === 1) f.cartao_id = cartoes[0].id
    setEditando(null); setFaltaCartao(false); setAvisoDispensado(null); setForm(f); setModal(true)
  }

  // Ao trocar a forma de pagamento para Cartão com um cartão só, já escolhe ele.
  function mudarPagamento(tipo) {
    setFaltaCartao(false)
    setForm(p => ({
      ...p, tipo_pagamento: tipo, fatura_ajuste: 0,
      cartao_id: tipo === 'cartao' ? (p.cartao_id || (cartoes.length === 1 ? cartoes[0].id : '')) : '',
    }))
  }

  // ‹ › da fatura (A2.5): troca a fatura em que a compra cai, ali mesmo.
  function mudarFatura(delta) {
    setForm(p => ({ ...p, fatura_ajuste: (Number(p.fatura_ajuste) || 0) + delta }))
  }

  function editarGasto(it) {
    setEditando(it.rawId)
    setFaltaCartao(false)
    setForm({
      descricao: it.descricao, valor: String(it.valor), categoria: it.categoria,
      tipo_pagamento: it.tipo_pagamento || 'cartao', cartao_id: it.cartao_id || '',
      parcelado: false, num_parcelas: '', parcelas_pagas: '', data: it.data,
      de_terceiro: !!it.terceiro, pessoa_nome: it.terceiro && it.terceiro !== 'alguém' ? it.terceiro : '',
      reembolso_status: it.reembolso_status || null,
      observacao: it.observacao || '', assinatura: false, fatura_ajuste: it.fatura_ajuste || 0,
      dividir: false, partes: [],
    })
    setModal(true)
    // Conta dividida (A8.6): traz as partes de cada pessoa pro formulário
    if (!it.terceiro) {
      supabase.from('a_receber').select('pessoa_id, valor, pessoas(nome)').eq('gasto_id', it.rawId).gt('valor', 0)
        .then(({ data }) => { if (data?.length) setForm(f => ({ ...f, dividir: true, partes: partesDoBanco(data, { total: Number(it.valor) }) })) })
    }
  }

  function fecharModal() {
    setModal(false); setEditando(null); setForm(novoForm())
    if (voltarPara) { const v = voltarPara; setVoltarPara(null); navigate(v) }
  }

  // Resolve a pessoa do "gasto de terceiro": usa uma já cadastrada (match por nome) ou cria.
  // Retorna o id da pessoa, ou null se não for gasto de terceiro / nome vazio.
  async function resolverPessoaId() {
    const nome = (form.pessoa_nome || '').trim()
    if (!form.de_terceiro || !nome) return null
    const id = await garantirPessoa(nome)
    if (!id) toast(copy.pessoas.erroSalvar, 'erro')
    return id
  }

  async function salvar() {
    if (!form.descricao || !form.valor) { toast('Preencha descrição e valor.', 'erro'); return }
    const valor = parseFloat(form.valor)
    if (!(valor > 0)) { toast('Informe um valor válido.', 'erro'); return }
    // "Cartão" sem dizer qual virava pagamento à vista (saía do caixa na hora). Agora é obrigatório.
    if (form.tipo_pagamento === 'cartao' && !form.cartao_id) {
      setFaltaCartao(true)
      toast(cartoes.length ? 'Escolha qual cartão — ou mude o pagamento para PIX ou Dinheiro.' : 'Você ainda não tem cartão cadastrado. Mude o pagamento para PIX ou Dinheiro, ou cadastre o cartão em Cartões.', 'erro')
      return
    }
    // Conta dividida (A8.6): cada parte com pessoa e valor, sem passar do total
    let partesOk = []
    if (form.dividir && !form.de_terceiro && !form.assinatura) {
      const rp = resumoPartes(valor, form.partes)
      if (!rp.ok.length || rp.vazias) { toast(copy.dividir.faltaPessoa, 'erro'); return }
      if (rp.excede) { toast(copy.dividir.passou, 'erro'); return }
      partesOk = rp.ok
    }
    setSalvando(true)
    for (const p of partesOk) {
      p.pessoaId = await garantirPessoa(p.nome)
      if (!p.pessoaId) { setSalvando(false); toast(copy.pessoas.erroSalvar, 'erro'); return }
    }
    // Fatura escolhida no ‹ › (A2.5): só vale pra compra no cartão
    const cartaoSel = form.cartao_id ? cartoes.find(c => c.id === form.cartao_id) : null
    const ajuste = form.cartao_id ? (Number(form.fatura_ajuste) || 0) : 0

    // Nova assinatura mensal (repete todo mês) — cria em `assinaturas`, não em `gastos`.
    // Conta a partir do mês desta data (a cobrança que está sendo lançada agora já entra).
    if (!editando && form.assinatura && !form.parcelado) {
      const dia = form.data ? Number(form.data.split('-')[2]) : null
      const { error } = await run(
        supabase.from('assinaturas').insert({
          grupo_id: perfil.grupo_id, nome: form.descricao, valor,
          dia_cobranca: dia || null, cartao_id: form.cartao_id || null, categoria: form.categoria,
          ...(form.data ? { cobrada_desde: `${form.data.slice(0, 7)}-01` } : {}),
        }),
        { ok: 'Assinatura criada' }
      )
      setSalvando(false)
      if (error) return
      fecharModal(); carregar(); carregarAssinaturas(); return
    }

    // Edição: só gastos à vista
    if (editando) {
      const pessoaId = await resolverPessoaId()
      const patch = {
        descricao: form.descricao, valor, categoria: form.categoria,
        tipo_pagamento: form.tipo_pagamento, cartao_id: form.cartao_id || null, data: form.data,
        pessoa_id: pessoaId, observacao: form.observacao || null, fatura_ajuste: ajuste,
      }
      if (pessoaId) {
        patch.reembolso_status = form.reembolso_status || 'pendente' // preserva "quitado" se já estava
      } else {
        patch.reembolso_status = null
        patch.reembolso_quitado_em = null
      }
      const { error } = await run(
        supabase.from('gastos').update(patch).eq('id', editando),
        { ok: 'Gasto atualizado' }
      )
      if (error) { setSalvando(false); return }
      // partes da divisão: refaz as em aberto (ou apaga, se deixou de dividir / virou de outra pessoa)
      const okPartes = await salvarPartes(supabase, { grupoId: perfil.grupo_id, gasto: { id: editando, descricao: form.descricao, data: form.data }, partes: pessoaId ? [] : partesOk, cartao: cartaoSel, data: form.data, ajuste })
      setSalvando(false)
      if (!okPartes) toast(copy.dividir.erroSalvar, 'erro')
      fecharModal(); carregar(); return
    }

    if (form.parcelado) {
      const n = parseInt(form.num_parcelas)
      if (!n || n < 2) { setSalvando(false); toast('Para parcelar, informe 2 ou mais parcelas.', 'erro'); return }
      let pagas = parseInt(form.parcelas_pagas) || 0
      if (pagas < 0) pagas = 0
      if (pagas > n - 1) pagas = n - 1 // deixa ao menos 1 parcela em aberto
      const vParcela = parseFloat((valor / n).toFixed(2))
      let dataPrimeira = form.data
      if (cartaoSel) {
        // No cartão (A2.5): a data é a da COMPRA; a 1ª parcela cai na mesma fatura que a compra
        // à vista cairia (± a fatura escolhida no ‹ ›) e vence no dia em que essa fatura vence.
        dataPrimeira = primeiroVencimentoParcelado(cartaoSel, form.data, ajuste)
      } else if (pagas > 0) {
        // Sem cartão, com parcelas já pagas: a data informada é a da PRÓXIMA parcela (nº pagas+1).
        // Retrocede `pagas` meses pra achar a data da 1ª parcela, que o trigger usa como base.
        const [yy, mm, dd] = form.data.split('-').map(Number)
        const prim = subMonths(new Date(yy, mm - 1, dd), pagas)
        dataPrimeira = `${prim.getFullYear()}-${String(prim.getMonth() + 1).padStart(2, '0')}-${String(prim.getDate()).padStart(2, '0')}`
      }
      const pessoaId = await resolverPessoaId()
      const { data: novoParc, error } = await run(
        supabase.from('parcelamentos').insert({
          descricao: form.descricao, valor_total: valor, num_parcelas: n, valor_parcela: vParcela,
          cartao_id: form.cartao_id || null, categoria: form.categoria,
          data_primeira_parcela: dataPrimeira, parcelas_pagas: pagas,
          grupo_id: perfil.grupo_id, usuario_id: perfil.id, pessoa_id: pessoaId,
        }).select('id, descricao, valor_total, num_parcelas').single(),
        { ok: (() => { const { de, ate } = periodoParcelas(n, dataPrimeira); return copy.gastos.parcelasCriadas(n, de, ate) })() }
      )
      if (error) { setSalvando(false); return }
      if (partesOk.length && !pessoaId && novoParc?.id) {
        const okPartes = await salvarPartes(supabase, { grupoId: perfil.grupo_id, parcelamento: novoParc, partes: partesOk, cartao: cartaoSel, aPartirDe: pagas + 1 })
        if (!okPartes) toast(copy.dividir.erroSalvar, 'erro')
      }
      setSalvando(false)
    } else {
      const pessoaId = await resolverPessoaId()
      const { data: novoGasto, error } = await run(
        supabase.from('gastos').insert({
          descricao: form.descricao, valor, categoria: form.categoria,
          tipo_pagamento: form.tipo_pagamento, cartao_id: form.cartao_id || null,
          data: form.data, grupo_id: perfil.grupo_id, usuario_id: perfil.id,
          pessoa_id: pessoaId, reembolso_status: pessoaId ? 'pendente' : null,
          observacao: form.observacao || null, fatura_ajuste: ajuste,
        }).select('id, descricao, data').single(),
        { ok: 'Gasto adicionado' }
      )
      if (error) { setSalvando(false); return }
      if (partesOk.length && !pessoaId && novoGasto?.id) {
        const okPartes = await salvarPartes(supabase, { grupoId: perfil.grupo_id, gasto: novoGasto, partes: partesOk, cartao: cartaoSel, data: form.data, ajuste })
        if (!okPartes) toast(copy.dividir.erroSalvar, 'erro')
      }
      setSalvando(false)
    }
    fecharModal(); carregar()
  }

  // Parcela na lista de Gastos (A8.7): arrastar → Editar abre o parcelado; Excluir apaga a compra inteira.
  async function excluirParcelado(it) {
    if (!confirm(tg.excluirParcelado(it.descricao, it.totalParcelas))) return
    const { error } = await run(supabase.from('parcelamentos').delete().eq('id', it.parcelamentoId), { ok: tg.parceladoExcluido })
    if (!error) carregar()
  }

  async function excluir(id) {
    if (!confirm('Excluir este gasto?')) return
    const { error } = await run(supabase.from('gastos').delete().eq('id', id), { ok: 'Gasto excluído' })
    if (!error) carregar()
  }

  // Gastos de terceiro (a receber) são neutros: não entram no total do mês.
  const total = itens.reduce((s, it) => s + (it.terceiro ? 0 : it.valor), 0)
  const nParcelas = parseInt(form.num_parcelas)
  const ehCartao = form.tipo_pagamento === 'cartao'

  // Busca e filtros (A3.1) — campos de cada linha que a busca e os filtros olham.
  const lerGasto = it => ({
    texto: [it.descricao, it.origem, it.categoria, it.pessoa, it.terceiro, it.observacao],
    data: it.data, categoria: it.categoria, origem: it.origem, valor: it.valor,
    pessoas: [it.pessoa, it.terceiro].filter(Boolean),
    tipos: [it.tipo === 'parcela' ? 'parcela' : 'avista', it.terceiro ? 'terceiro' : null].filter(Boolean),
  })
  const filtrando = buscaLigada && temFiltro(filtro)
  const lista = filtrando ? filtrar(itens, filtro, lerGasto) : itens
  const tb = copy.busca
  const opcoesBusca = buscaLigada ? {
    categorias: distintos(itens.map(i => i.categoria)).map(c => ({ valor: c, rotulo: `${emojiDe(c)} ${rotuloCategoria(c)}` })),
    origens: distintos(itens.map(i => i.origem)).map(o => ({ valor: o, rotulo: o })),
    pessoas: distintos(itens.flatMap(i => [i.pessoa, i.terceiro])).map(p => ({ valor: p, rotulo: p })),
    tipos: [{ valor: 'avista', rotulo: tb.tipoAvista }, { valor: 'parcela', rotulo: tb.tipoParcela }, { valor: 'terceiro', rotulo: tb.tipoTerceiro }],
  } : null

  // Aviso: a compra nova parece uma assinatura que já entra sozinha todo mês.
  const parecida = modal && !editando && !form.parcelado && !form.assinatura && !form.de_terceiro
    ? assinaturaParecida(form, assinaturas) : null
  const aviso = parecida && parecida.id !== avisoDispensado ? parecida : null
  const avisoCartao = aviso?.cartao_id ? cartoes.find(c => c.id === aviso.cartao_id)?.nome : null

  // Em qual fatura cai (A2.5), ao vivo: à vista = a compra; parcelado = a 1ª parcela (ou a
  // próxima, se já pagou algumas). O ‹ › soma ±1 fatura (gastos.fatura_ajuste).
  const hoje = hojeBRT()
  const pagasForm = form.parcelado ? Math.max(0, Math.min(parseInt(form.parcelas_pagas) || 0, nParcelas >= 2 ? nParcelas - 1 : 0)) : 0
  const cartaoForm = modal && ehCartao && !form.assinatura && form.data ? cartoes.find(c => c.id === form.cartao_id) : null
  const ajusteForm = Number(form.fatura_ajuste) || 0
  const faturaForm = cartaoForm
    ? faturaDoCartao(cartaoForm, addMeses(compDaCompra(cartaoForm, form.data, ajusteForm), pagasForm), { contasPagas: faturasPagas }, hoje)
    : null
  const textoFatura = !faturaForm ? null
    : !form.parcelado ? tg.vaiCairNaFatura(vencCurto(faturaForm.vencimento, hoje))
    : pagasForm > 0 ? tg.proximaParcelaNaFatura(pagasForm + 1, vencCurto(faturaForm.vencimento, hoje))
    : tg.primeiraParcelaNaFatura(vencCurto(faturaForm.vencimento, hoje))
  const statusFatura = !faturaForm ? null
    : faturaForm.status === 'aberta' ? tg.statusFatura.aberta(fmtData(faturaForm.fechamento, 'dd/MM'))
    : tg.statusFatura[faturaForm.status]

  return (
    <div>
      {/* Navegação de mês */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <button onClick={() => setMes(m => subMonths(m, 1))}><ChevronLeft size={20} color="var(--text2)" /></button>
        <h2 style={{ fontSize: 16 }}>{format(mes, 'MMMM yyyy', { locale: ptBR })}</h2>
        <button onClick={() => setMes(m => addMonths(m, 1))}><ChevronRight size={20} color="var(--text2)" /></button>
      </div>

      {/* Lançar vários de uma vez (A4.4) */}
      <button type="button" onClick={() => navigate('/lancar-varios')}
        style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '10px 12px', marginBottom: 14, borderRadius: 'var(--radius-sm)', border: '1px dashed var(--accent)', background: 'var(--accent-dim)', color: 'var(--accent-text)', fontSize: 13.5, fontWeight: 600 }}>
        <Sparkles size={15} /> {copy.lancarVarios.atalho}
      </button>

      {/* Total — clica para ver tudo que vence no mês (escondido quando a busca está num período) */}
      {!periodoFiltro && <button onClick={() => navigate('/contas-do-mes')} className="card" style={{ width: '100%', marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', textAlign: 'left', background: 'var(--bg2)', color: 'var(--text)' }}>
        <span style={{ color: 'var(--text2)', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
          <CalendarCheck size={15} color="var(--accent)" /> Gastos + parcelas do mês
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 20, color: 'var(--red-text)' }}>{fmt(total)}</span>
          <ChevronRight size={16} color="var(--text3)" />
        </span>
      </button>}

      {/* Importar (A8.1) — só com a chave de recurso "importar" (no começo, só o dono) */}
      {flags?.importar && (
        <button onClick={() => navigate('/importar')} className="card" style={{ width: '100%', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left', background: 'var(--bg2)', color: 'var(--text)' }}>
          <Upload size={18} color="var(--accent)" />
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: 'block', fontWeight: 600, fontFamily: 'Syne', fontSize: 14 }}>{copy.importar.botaoGastos}</span>
            <span style={{ display: 'block', fontSize: 12, color: 'var(--text2)' }}>{copy.importar.botaoGastosSub}</span>
          </span>
          <ChevronRight size={16} color="var(--text3)" />
        </button>
      )}

      {/* Busca e filtros (A3.1) — só com a chave de recurso */}
      {buscaLigada && (
        <BuscaFiltros filtro={filtro} onChange={setFiltro} opcoes={opcoesBusca} periodo placeholder={tb.buscarGastos}
          resumo={tb.resumoItens(lista.length, fmt(lista.reduce((s, i) => s + Number(i.valor || 0), 0)))} />
      )}
      {periodoFiltro && (
        <p style={{ fontSize: 12, color: 'var(--text2)', margin: '-4px 0 12px', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {tb.periodoAtivo(periodoFiltro.de ? fmtData(periodoFiltro.de, 'dd/MM/yy') : '', periodoFiltro.ate ? fmtData(periodoFiltro.ate, 'dd/MM/yy') : '')}
          <button type="button" onClick={() => setFiltro(f => ({ ...f, de: '', ate: '' }))} style={{ fontSize: 12, color: 'var(--accent-text)', fontWeight: 600 }}>{tb.tirarPeriodo}</button>
        </p>
      )}

      {/* Lista */}
      {loading ? <div className="empty-state">Carregando...</div> : lista.length === 0 ? (
        filtrando
          ? <div className="empty-state">{tb.nada}</div>
          : <EmptyState ilustracao={<Joca pose="anotando" tamanho={150} />} titulo={copy.mascote.vazios.gastosTitulo} texto={copy.mascote.vazios.gastosTexto} />
      ) : (verTodos || filtrando ? lista : lista.slice(0, 10)).map(it => (
        <SwipeRow key={it.id} style={{ marginBottom: 8 }}
          onEdit={it.tipo === 'gasto' ? () => editarGasto(it) : () => navigate(`/parcelamentos?editar=${it.parcelamentoId}&voltar=gastos`)}
          onDelete={it.tipo === 'gasto' ? () => excluir(it.rawId) : () => excluirParcelado(it)}>
        <div className="card" style={{ margin: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 22 }}>{emojiDe(it.categoria)}</span>
            <div>
              <p style={{ fontSize: 14, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6 }}>
                {it.descricao}
                {it.tipo === 'parcela' && (
                  <button type="button" onClick={e => { e.stopPropagation(); navigate(`/parcelamentos?ver=${it.parcelamentoId}`) }}
                    title="Ver todas as parcelas desta compra"
                    style={{ fontSize: 10, fontWeight: 600, background: 'var(--bg3)', color: 'var(--blue-text)', padding: '1px 7px', borderRadius: 10, border: 'none' }}>
                    {it.numero}/{it.totalParcelas} · {copy.gastos.verTodas}
                  </button>
                )}
                {it.terceiro && (
                  <span style={{ fontSize: 10, fontWeight: 600, background: 'var(--bg3)', color: 'var(--amber-text)', padding: '1px 7px', borderRadius: 10 }}>
                    {it.reembolso_status === 'quitado' ? 'recebido' : 'a receber'} · {it.terceiro}
                  </span>
                )}
                {it.semCartao && (
                  <button onClick={e => { e.stopPropagation(); editarGasto(it) }} title="Toque pra escolher o cartão"
                    style={{ fontSize: 10, fontWeight: 700, background: 'var(--red-dim)', color: 'var(--red-text)', padding: '1px 7px', borderRadius: 10, border: 'none' }}>
                    escolha o cartão
                  </button>
                )}
              </p>
              <p style={{ fontSize: 11, color: 'var(--text2)' }}>
                {fmtData(it.data, 'dd/MM')} · {it.origem} · {it.pessoa}
              </p>
              {it.observacao && (
                <p style={{ fontSize: 11, color: 'var(--text2)', fontStyle: 'italic', marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 200 }}>
                  {it.observacao}
                </p>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ color: it.terceiro ? 'var(--text2)' : 'var(--red-text)', fontWeight: 700, fontFamily: 'Syne' }}>{fmt(it.valor)}</span>
            {it.tipo === 'parcela' && <Layers size={15} color="var(--text3)" />}
          </div>
        </div>
        </SwipeRow>
      ))}

      {/* Ver todos / ver menos */}
      {!loading && !filtrando && lista.length > 10 && (
        <button onClick={() => setVerTodos(v => !v)}
          style={{ width: '100%', padding: '10px', marginTop: 4, borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--bg2)', color: 'var(--accent-text)', fontSize: 13, fontWeight: 600 }}>
          {verTodos ? 'Ver menos' : `Ver todos (${lista.length})`}
        </button>
      )}

      {/* Botão adicionar manual */}
      <button onClick={() => abrirNovo()} style={{ position: 'fixed', bottom: 88, left: 88, width: 44, height: 44, borderRadius: '50%', background: 'var(--bg3)', border: '1px solid var(--border2)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
        <Plus size={22} color="var(--text)" />
      </button>

      <BotaoVoz onSalvo={carregar} />

      {/* Modal novo/editar gasto */}
      {modal && (
        <div className="modal-overlay" onClick={fecharModal}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2 style={{ fontSize: 18, marginBottom: 20 }}>{editando ? 'Editar gasto' : 'Novo gasto'}</h2>
            <div className="form-group"><label>Descrição</label><input value={form.descricao} onChange={e => setForm(p => ({ ...p, descricao: e.target.value }))} placeholder="Ex: Mercado Extra" /></div>
            <div className="form-row">
              <div className="form-group"><label>{form.parcelado ? 'Valor total' : 'Valor'}</label><input type="number" inputMode="decimal" value={form.valor} onChange={e => setForm(p => ({ ...p, valor: e.target.value }))} placeholder="0,00" /></div>
              <div className="form-group"><label>{form.parcelado ? (ehCartao ? tg.dataDaCompra : (parseInt(form.parcelas_pagas) || 0) > 0 ? 'Próxima parcela em' : '1ª parcela em') : 'Data'}</label><input type="date" value={form.data} onChange={e => setForm(p => ({ ...p, data: e.target.value, fatura_ajuste: 0 }))} /></div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Categoria</label>
                <select value={form.categoria} onChange={e => setForm(p => ({ ...p, categoria: e.target.value }))}>
                  {categorias.map(c => <option key={c.nome} value={c.nome}>{c.emoji} {rotuloCategoria(c.nome)}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Pagamento</label>
                <select value={form.tipo_pagamento} onChange={e => mudarPagamento(e.target.value)}>
                  <option value="cartao">Cartão</option>
                  <option value="pix">PIX</option>
                  <option value="dinheiro">Dinheiro</option>
                </select>
              </div>
            </div>

            {ehCartao && (
              <div className="form-group">
                <label>Cartão</label>
                <select value={form.cartao_id} onChange={e => { setFaltaCartao(false); setForm(p => ({ ...p, cartao_id: e.target.value, fatura_ajuste: 0 })) }}
                  style={faltaCartao ? { borderColor: 'var(--red)', boxShadow: '0 0 0 2px var(--red-dim)' } : undefined}>
                  <option value="">Escolha o cartão</option>
                  {cartoes.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
                {faltaCartao && (
                  <span style={{ fontSize: 11.5, color: 'var(--red-text)', marginTop: 4, display: 'block' }}>
                    {cartoes.length ? 'Escolha qual cartão foi usado.' : 'Nenhum cartão cadastrado — use PIX ou Dinheiro.'}
                  </span>
                )}
                {faturaForm && (
                  <div role="status" aria-live="polite" style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, padding: '6px 6px', background: 'var(--bg3)', borderRadius: 'var(--radius-sm)' }}>
                    <button type="button" onClick={() => mudarFatura(-1)} aria-label={tg.faturaAnterior} title={tg.faturaAnterior}
                      style={{ width: 30, height: 30, flexShrink: 0, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg2)' }}>
                      <ChevronLeft size={16} color="var(--text2)" />
                    </button>
                    <div style={{ flex: 1, minWidth: 0, textAlign: 'center' }}>
                      <p style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text)' }}>{textoFatura}</p>
                      <p style={{ fontSize: 11, color: COR_FATURA[faturaForm.status] || 'var(--text2)' }}>
                        {statusFatura}{ajusteForm ? ` · ${tg.voceTrocou}` : ''}
                      </p>
                    </div>
                    <button type="button" onClick={() => mudarFatura(1)} aria-label={tg.proximaFatura} title={tg.proximaFatura}
                      style={{ width: 30, height: 30, flexShrink: 0, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg2)' }}>
                      <ChevronRight size={16} color="var(--text2)" />
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Compra que parece uma assinatura já cadastrada: não contar 2x */}
            {aviso && (
              <div role="status" style={{ background: 'var(--amber-dim)', border: '1px solid var(--amber)', borderRadius: 'var(--radius-sm)', padding: '10px 12px', marginBottom: 14 }}>
                <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--amber-text)' }}>{tg.pareceAssinatura(aviso.nome)}</p>
                <p style={{ fontSize: 12, color: 'var(--text2)', marginTop: 4, lineHeight: 1.45 }}>
                  {tg.pareceAssinaturaTexto(
                    [fmt(aviso.valor), aviso.dia_cobranca ? `todo dia ${aviso.dia_cobranca}` : null, avisoCartao].filter(Boolean).join(' · '),
                    avisoCartao ? tg.naFatura(avisoCartao) : tg.nasContas,
                  )}
                </p>
                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                  <button type="button" className="btn-ghost" onClick={fecharModal} style={{ flex: 1, padding: '8px 10px', fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{tg.naoLancar}</button>
                  <button type="button" className="btn-ghost" onClick={() => setAvisoDispensado(aviso.id)} style={{ flex: 1, padding: '8px 10px', fontSize: 13 }}>{tg.eOutraCompra}</button>
                </div>
              </div>
            )}

            {/* Assinatura: repete todo mês (cria em Assinaturas, não um gasto único) */}
            {!editando && !form.parcelado && (
              <div style={{ marginBottom: form.assinatura ? 10 : 16 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: 'var(--text2)' }}>
                  <input type="checkbox" checked={form.assinatura} onChange={e => setForm(p => ({ ...p, assinatura: e.target.checked, de_terceiro: false }))} />
                  É uma assinatura (repete todo mês)
                </label>
                {form.assinatura && (
                  <span style={{ fontSize: 11, color: 'var(--text2)', marginTop: 4, display: 'block', lineHeight: 1.4 }}>
                    Vai pra tela de Assinaturas e, a partir do mês desta data, entra sozinha todo mês (na fatura, se for no cartão) — não precisa lançar de novo.
                  </span>
                )}
              </div>
            )}

            {/* Gasto/compra de outra pessoa (a receber) — vale à vista E parcelado, menos assinatura */}
            {!form.assinatura && (
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: 'var(--text2)' }}>
                  <input type="checkbox" checked={form.de_terceiro} onChange={e => setForm(p => ({ ...p, de_terceiro: e.target.checked, dividir: e.target.checked ? false : p.dividir }))} />
                  Foi de outra pessoa (vão me pagar)
                </label>
                {form.de_terceiro && (
                  <div className="form-group" style={{ marginTop: 10 }}>
                    <EscolherPessoa pessoas={pessoas} valor={form.pessoa_nome} onCriar={garantirPessoa}
                      onEscolher={nome => setForm(p => ({ ...p, pessoa_nome: nome }))} />
                    <span style={{ fontSize: 11, color: 'var(--text2)', marginTop: 4, display: 'block', lineHeight: 1.4 }}>
                      {form.parcelado
                        ? 'Cada parcela vira um “A receber” no mês em que vence — você marca o que já recebeu parcela a parcela.'
                        : 'Esse valor não entra nos seus gastos — fica em “A receber” até você marcar como recebido.'}
                    </span>
                  </div>
                )}
                {/* Dividir com outras pessoas (A8.6): uma parte é sua, outra de quem vai te pagar */}
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: 'var(--text2)', marginTop: 10 }}>
                  <input type="checkbox" checked={form.dividir} onChange={e => setForm(p => ({ ...p, dividir: e.target.checked, de_terceiro: e.target.checked ? false : p.de_terceiro }))} />
                  {copy.dividir.marcar}
                </label>
                {form.dividir && (
                  <DividirConta total={parseFloat(form.valor) || 0} partes={form.partes} onChange={partes => setForm(p => ({ ...p, partes }))}
                    pessoas={pessoas} onCriar={garantirPessoa} parcelado={form.parcelado} />
                )}
              </div>
            )}

            {/* Toggle à vista / parcelado — só ao criar (edição é só de gasto à vista) */}
            {!editando && !form.assinatura && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', gap: 8 }}>
                  {[['À vista', false], ['Parcelado', true]].map(([label, val]) => (
                    <button key={label} onClick={() => setForm(p => ({ ...p, parcelado: val }))}
                      style={{ flex: 1, padding: '9px', borderRadius: 'var(--radius-sm)', border: `1px solid ${form.parcelado === val ? 'var(--accent)' : 'var(--border)'}`, background: form.parcelado === val ? 'var(--accent-dim)' : 'transparent', color: form.parcelado === val ? 'var(--accent-text)' : 'var(--text2)', fontSize: 13, fontWeight: 600 }}>
                      {label}
                    </button>
                  ))}
                </div>
                {form.parcelado && (
                  <div style={{ marginTop: 12 }}>
                    <div className="form-row">
                      <div className="form-group">
                        <label>Nº de parcelas</label>
                        <input type="number" inputMode="decimal" min="2" value={form.num_parcelas} onChange={e => setForm(p => ({ ...p, num_parcelas: e.target.value }))} placeholder="Ex: 12" />
                      </div>
                      <div className="form-group">
                        <label>Já paguei</label>
                        <input type="number" inputMode="decimal" min="0" max={nParcelas >= 2 ? nParcelas - 1 : undefined} value={form.parcelas_pagas} onChange={e => setForm(p => ({ ...p, parcelas_pagas: e.target.value }))} placeholder="0" />
                      </div>
                    </div>
                    {form.valor && nParcelas >= 2 && (
                      <p style={{ fontSize: 13, color: 'var(--accent-text)', marginTop: -4 }}>
                        {nParcelas}x de {fmt(parseFloat(form.valor) / nParcelas)}
                        {(parseInt(form.parcelas_pagas) || 0) > 0 && <span style={{ color: 'var(--text2)' }}> · faltam {nParcelas - (parseInt(form.parcelas_pagas) || 0)}</span>}
                        {!ehCartao && <span style={{ color: 'var(--text2)' }}> · via {form.tipo_pagamento}</span>}
                      </p>
                    )}
                    {(parseInt(form.parcelas_pagas) || 0) > 0 && (
                      <p style={{ fontSize: 11.5, color: 'var(--text2)', marginTop: 4, lineHeight: 1.4 }}>
                        {ehCartao ? tg.dicaJaPagasCartao(parseInt(form.parcelas_pagas) || 0, nParcelas || '—') : (
                          <>Já pagou {parseInt(form.parcelas_pagas) || 0} de {nParcelas || '—'}? Informe acima a data da <strong>próxima</strong> parcela — as já pagas entram marcadas.</>
                        )}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

            {!form.assinatura && (
              <div className="form-group">
                <label>Observação (opcional)</label>
                <textarea value={form.observacao} onChange={e => setForm(p => ({ ...p, observacao: e.target.value }))}
                  rows={2} placeholder="Ex: dividido com a Lari, garantia até 2027..."
                  style={{ resize: 'vertical', minHeight: 44 }} />
              </div>
            )}

            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn-ghost" style={{ flex: 1 }} onClick={fecharModal}>Cancelar</button>
              <button className="btn-primary" style={{ flex: 1, opacity: salvando ? 0.6 : 1 }} onClick={salvar} disabled={salvando}>
                {salvando ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
