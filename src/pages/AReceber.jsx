import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { useAtualizarSozinho } from '../hooks/useAtualizarSozinho'
import { Check, RotateCcw, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, Plus, Send, X, Copy, Users } from 'lucide-react'
import { useDb } from '../hooks/useDb'
import { useToast } from '../contexts/ToastContext'
import { fmt, fmtData, hojeISO } from '../lib/format'
import { addMeses, compDe, nomeMes, garantirSeries, hojeBRT, itensDeTerceiros } from '../lib/motor'
import { agruparPorOrigem, nomeItem, pagarAtePadrao, rotuloOrigem, textoCobranca } from '../lib/cobranca'
import { pixCopiaECola } from '../lib/pix'
import { opcoesImagem } from '../lib/fontesImagem'
import CobrancaImagem from '../components/CobrancaImagem'
import SwipeRow from '../components/SwipeRow'
import { dividirEmParcelas, periodoParcelas, problemaParcelas } from '../lib/parcelas'
import { copy } from '../copy/pt-BR'
import { pessoasParecidas } from '../lib/pessoas'
import { simularRecebimento } from '../lib/receber'

const t = copy.aReceber

// "A receber" — o que outras pessoas te devem, MÊS A MÊS (A1.13):
//  • compras delas no seu cartão/pix (Gastos → "Foi de outra pessoa") — à vista e parcelado;
//  • valores lançados aqui à mão (ex.: parte da Jacqueline no aluguel), com "repete todo mês"
//    e, opcionalmente, ligados a uma conta fixa (A1.15).
// Cada item fica no mês em que o dinheiro SAI da sua conta (fatura, parcela, compra, data do
// lançado à mão) — a mesma regra do reembolso previsto no "vai sobrar" (A1.14, motor único).
// "Receber de Fulano" marca o que a pessoa pagou e lança UMA entrada com o total; "Cobrar"
// monta a mensagem do WhatsApp com imagem e Pix copia e cola (A1.16).
const CHAVE_PIX = 'hopefin.pix' // só neste aparelho — a chave (pode ser CPF) nunca vai pro banco
const lerPix = () => {
  try { return { chave: '', nome: '', cidade: '', ...(JSON.parse(localStorage.getItem(CHAVE_PIX) || 'null') || {}) } } catch { return { chave: '', nome: '', cidade: '' } }
}
const gravarPix = (p) => { try { localStorage.setItem(CHAVE_PIX, JSON.stringify(p)) } catch { /* sem armazenamento: vale só agora */ } }
// repete: 'uma' | 'mes' (todo mês) | 'parcelado' (A8.17). id/serieId/dataOriginal/aplicar: só ao editar (A8.16).
const novoManual = () => ({ id: null, serieId: null, dataOriginal: null, aplicar: 'esta', pessoaId: '', pessoaNome: '', descricao: '', valor: '', data: hojeISO(), repete: 'uma', parcelas: '', contaFixaId: '', numero: null, deTotal: null })
// 'YYYY-MM-DD' + n dias (meio-dia local, pra não escorregar de dia no fuso)
const maisDias = (iso, n) => { const d = new Date(`${iso}T12:00:00`); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
const mesAno = (comp) => { const m = nomeMes(comp); return `${m.charAt(0).toUpperCase()}${m.slice(1)} de ${comp.slice(0, 4)}` }
const primeiroNome = (nome) => String(nome || '').trim().split(/\s+/)[0] || nome
// "Quanto pagou?" (A8.4): em branco = tudo o que está marcado; senão o número (aceita vírgula)
const valorPago = (v) => {
  const s = String(v ?? '').trim()
  if (!s) return null
  const n = parseFloat(s.replace(',', '.'))
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null
}

export default function AReceber() {
  const { perfil } = useAuth()
  const run = useDb()
  const { toast } = useToast()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const [comp, setComp] = useState(() => (/^\d{4}-\d{2}$/.test(params.get('mes') || '') ? params.get('mes') : compDe(hojeBRT())))
  const [itens, setItens] = useState([])
  const [pessoas, setPessoas] = useState([])
  const [contasFixas, setContasFixas] = useState([])
  const [loading, setLoading] = useState(true)
  const [verRecebidos, setVerRecebidos] = useState(false)
  const [manual, setManual] = useState(null)      // form do "a receber" manual
  const [receber, setReceber] = useState(null)    // { pessoaId, nome, selecionados:Set, criarEntrada, data }
  const [cobrar, setCobrar] = useState(null)      // { pessoaId, nome, itens, ate, incluirPix }
  const [pix, setPix] = useState(lerPix)
  const [editandoPix, setEditandoPix] = useState(false)
  const [qr, setQr] = useState('')
  const [arquivo, setArquivo] = useState(null)    // PNG da cobrança, pronto antes do toque em Enviar
  const [salvando, setSalvando] = useState(false)
  const [apagando, setApagando] = useState(null) // item manual a apagar (A8.16)
  const imgRef = useRef(null)

  useEffect(() => { if (perfil?.grupo_id) carregar() }, [perfil])
  useAtualizarSozinho(perfil?.grupo_id ? carregar : null) // aba abre na hora e se atualiza sozinha

  async function carregar(opcoes) {
    if (!opcoes?.silencioso) setLoading(true) // atualizando sozinha: sem "Carregando"
    await garantirSeries()
    const gid = perfil.grupo_id
    const [cs, gs, ps, ms, pe, cf] = await Promise.all([
      supabase.from('cartoes').select('id, nome, dia_fechamento, dia_vencimento, compra_no_fechamento, ativo').eq('grupo_id', gid),
      supabase.from('gastos')
        .select('id, descricao, valor, data, cartao_id, tipo_pagamento, fatura_ajuste, pessoa_id, reembolso_status, reembolso_quitado_em, reembolso_entrada_id, pessoas(nome)')
        .eq('grupo_id', gid).not('pessoa_id', 'is', null),
      supabase.from('parcelas')
        .select('id, numero, valor, data_vencimento, recebido, reembolso_entrada_id, parcelamentos!inner(descricao, num_parcelas, pessoa_id, cartao_id, pessoas(nome))')
        .eq('grupo_id', gid).eq('antes_do_app', false).not('parcelamentos.pessoa_id', 'is', null),
      supabase.from('a_receber')
        .select('id, descricao, valor, data, recebido, recebido_em, entrada_id, recorrente, serie_id, parcela_num, parcela_total, pessoa_id, conta_fixa_id, gasto_id, parcelamento_id, assinatura_id, por_conta, pessoas(nome), contas_fixas(nome)')
        .eq('grupo_id', gid),
      supabase.from('pessoas').select('id, nome').eq('grupo_id', gid).order('nome'),
      supabase.from('contas_fixas').select('id, nome').eq('grupo_id', gid).eq('ativo', true).order('nome'),
    ])
    const falha = [cs, gs, ps, ms, pe].find(r => r.error)
    if (falha) {
      console.error('[a-receber]', falha.error)
      toast('Não foi possível carregar o A Receber agora. Tente de novo.', 'erro')
      setLoading(false); return
    }
    // Mesma conta do motor (mês em que o dinheiro sai + origem de cada item).
    const dados = {
      cartoes: cs.data || [],
      gastos: (gs.data || []).map(g => ({ ...g, pessoa_nome: g.pessoas?.nome || null })),
      parcelas: (ps.data || []).map(p => ({
        id: p.id, numero: p.numero, valor: p.valor, data_vencimento: p.data_vencimento, recebido: p.recebido,
        reembolso_entrada_id: p.reembolso_entrada_id, descricao: p.parcelamentos?.descricao, num_parcelas: p.parcelamentos?.num_parcelas,
        pessoa_id: p.parcelamentos?.pessoa_id, cartao_id: p.parcelamentos?.cartao_id || null, pessoa_nome: p.parcelamentos?.pessoas?.nome || null,
      })),
      aReceber: (ms.data || []).map(m => ({ ...m, pessoa_nome: m.pessoas?.nome || null, conta_fixa_nome: m.contas_fixas?.nome || null })),
    }
    const recebidoEm = new Map([
      ...(gs.data || []).map(g => [`gasto:${g.id}`, g.reembolso_quitado_em]),
      ...(ms.data || []).map(m => [`manual:${m.id}`, m.recebido_em]),
    ])
    setItens(itensDeTerceiros(dados).map(i => ({
      ...i, chave: `${i.tipo}:${i.id}`, pessoaNome: i.pessoaNome || 'Alguém', recebidoEm: recebidoEm.get(`${i.tipo}:${i.id}`) || null,
    })))
    setPessoas(pe.data || [])
    setContasFixas(cf.data || [])
    setLoading(false)
  }

  // ---------------------------------------------------------- derivados
  const pendentesMes = itens.filter(i => !i.recebido && i.comp === comp)
  const recebidosMes = itens.filter(i => i.recebido && i.comp === comp)
  const anteriores = itens.filter(i => !i.recebido && i.comp < comp)
  const futuros = itens.filter(i => !i.recebido && i.comp > comp)
  const soma = (l) => Math.round(l.reduce((s, x) => s + x.valor, 0) * 100) / 100

  const grupos = useMemo(() => {
    const porPessoa = new Map()
    for (const i of pendentesMes) {
      const k = i.pessoaId || i.pessoaNome
      if (!porPessoa.has(k)) porPessoa.set(k, { id: i.pessoaId, nome: i.pessoaNome, itens: [] })
      porPessoa.get(k).itens.push(i)
    }
    return [...porPessoa.values()].map(gp => ({ ...gp, total: soma(gp.itens), ate: pagarAtePadrao(gp.itens) }))
      .sort((a, b) => b.total - a.total)
  }, [itens, comp]) // eslint-disable-line react-hooks/exhaustive-deps

  // ---------------------------------------------------------- receber / reabrir / lançar
  async function confirmarRecebimento() {
    const sel = itens.filter(i => receber.selecionados.has(i.chave))
    if (!sel.length) { toast('Escolha o que a pessoa pagou.', 'erro'); return }
    // A8.4: pagou só uma parte (ou um valor diferente do marcado) → quita do mais antigo pro mais
    // novo e o resto fica "pago por conta" (receber_parte_de_pessoa, 0076).
    const pago = valorPago(receber.valor)
    if (pago !== null && Math.abs(pago - soma(sel)) > 0.005) {
      if (!(pago > 0)) { toast(t.valorInvalido, 'erro'); return }
      const sim = simularRecebimento(sel, pago)
      setSalvando(true)
      const { data, error } = await run(supabase.rpc('receber_parte_de_pessoa', {
        p_pessoa: receber.pessoaId, p_valor: pago, p_itens: sim.ordem.map(i => ({ t: i.tipo, id: i.id })),
        p_criar_entrada: receber.criarEntrada, p_data: receber.data || hojeISO(),
      }))
      setSalvando(false)
      if (error) return
      toast(data?.por_conta > 0 ? t.okParte(fmt(pago), fmt(data.por_conta)) : t.okPagouTudo(fmt(pago)), 'ok')
      setReceber(null); carregar(); return
    }
    setSalvando(true)
    const { data, error } = await run(supabase.rpc('receber_de_pessoa', {
      p_pessoa: receber.pessoaId,
      p_gastos: sel.filter(i => i.tipo === 'gasto').map(i => i.id),
      p_parcelas: sel.filter(i => i.tipo === 'parcela').map(i => i.id),
      p_a_receber: sel.filter(i => i.tipo === 'manual').map(i => i.id),
      p_criar_entrada: receber.criarEntrada,
      p_data: receber.data || hojeISO(),
    }))
    setSalvando(false)
    if (error) return
    toast(receber.criarEntrada ? `Recebido ${fmt(data?.total)} — entrada lançada` : `Marcado como recebido (${fmt(data?.total)})`, 'ok')
    setReceber(null); carregar()
  }

  async function reabrir(it) {
    if (it.entradaId) {
      if (!confirm('Esse valor foi recebido junto com outros itens. Reabrir desfaz o recebimento inteiro e apaga a entrada de reembolso. Continuar?')) return
      const { error } = await supabase.rpc('desfazer_recebimento', { p_entrada: it.entradaId })
      if (error) { toast(String(error.message).includes('credito_ja_usado') ? t.creditoJaUsado : 'Não foi possível desfazer agora. Tente de novo.', 'erro'); return }
      toast('Recebimento desfeito', 'ok'); carregar()
      return
    }
    // Recebidos sem entrada (antigos ou marcados à mão): só desmarca
    let q
    if (it.tipo === 'gasto') q = supabase.from('gastos').update({ reembolso_status: 'pendente', reembolso_quitado_em: null }).eq('id', it.id)
    else if (it.tipo === 'parcela') q = supabase.from('parcelas').update({ recebido: false }).eq('id', it.id)
    else q = supabase.from('a_receber').update({ recebido: false, recebido_em: null }).eq('id', it.id)
    const { error } = await run(q, { ok: 'Reaberto' })
    if (!error) carregar()
  }

  // Apagar o lançado à mão (A8.16): série (todo mês ou parcelado) pergunta "só esta" ×
  // "esta e as próximas" num aviso com Voltar (antes o Cancelar do confirm apagava só este mês).
  async function apagarManual(it, proximas) {
    setSalvando(true)
    if (proximas && it.serieId) {
      const { error } = await run(supabase.from('a_receber').delete().eq('serie_id', it.serieId).eq('recebido', false).gte('data', it.data), { ok: t.okApagadoProximas })
      if (!error && it.recorrente) await supabase.from('a_receber').update({ recorrente: false }).eq('serie_id', it.serieId) // para de repetir
      setSalvando(false)
      if (error) return
    } else {
      const { error } = await run(supabase.from('a_receber').delete().eq('id', it.id), { ok: t.okApagado })
      setSalvando(false)
      if (error) return
    }
    setApagando(null); carregar()
  }

  function editarManual(it) {
    setManual({
      ...novoManual(), id: it.id, serieId: it.serieId || null, dataOriginal: it.data, aplicar: 'esta',
      pessoaId: it.pessoaId || '', descricao: it.descricao || '', valor: String(it.valor), data: it.data,
      repete: it.deTotal ? 'parcelado' : it.recorrente ? 'mes' : 'uma', contaFixaId: it.origem?.contaFixaId || '',
      numero: it.numero || null, deTotal: it.deTotal || null,
    })
  }

  async function salvarManual() {
    const valor = parseFloat(String(manual.valor).replace(',', '.'))
    if (!manual.descricao.trim() || !(valor > 0)) { toast(t.erroPreencha, 'erro'); return }
    let pessoaId = manual.pessoaId
    const nomeNovo = manual.pessoaNome.trim()
    if (!pessoaId && !nomeNovo) { toast(t.erroQuem, 'erro'); return }
    const nParcelas = parseInt(manual.parcelas, 10)
    if (!manual.id && manual.repete === 'parcelado') {
      const problema = problemaParcelas(valor, nParcelas)
      if (problema) { toast(problema === 'qtd' ? t.erroParcelas : t.erroParcelaPequena, 'erro'); return }
    }
    setSalvando(true)
    if (!pessoaId) {
      const existe = pessoas.find(p => p.nome.toLowerCase() === nomeNovo.toLowerCase())
      if (existe) pessoaId = existe.id
      else {
        const { data, error } = await run(supabase.from('pessoas').insert({ grupo_id: perfil.grupo_id, nome: nomeNovo }).select('id').single())
        if (error) { setSalvando(false); return }
        pessoaId = data.id
      }
    }
    const base = { pessoa_id: pessoaId, descricao: manual.descricao.trim(), conta_fixa_id: manual.contaFixaId || null }
    const data = manual.data || hojeISO()
    let error
    if (manual.id) {
      // Editar (A8.16). Série + "esta e as próximas": descrição, valor, pessoa e conta fixa nas que
      // ainda não foram recebidas, desta em diante; a data muda só nesta.
      if (manual.serieId && manual.aplicar === 'proximas') {
        ;({ error } = await run(supabase.from('a_receber').update({ ...base, valor }).eq('serie_id', manual.serieId).eq('recebido', false).gte('data', manual.dataOriginal), { ok: t.okEditadoProximas }))
        if (!error && data !== manual.dataOriginal) ({ error } = await run(supabase.from('a_receber').update({ data }).eq('id', manual.id)))
      } else {
        ;({ error } = await run(supabase.from('a_receber').update({ ...base, valor, data }).eq('id', manual.id), { ok: t.okEditado }))
      }
    } else if (manual.repete === 'parcelado') {
      // A receber parcelado (A8.17): uma linha por mês na mesma série, "1/3", "2/3"...
      const serie = crypto.randomUUID()
      const linhas = dividirEmParcelas(valor, nParcelas, data).map(p => ({
        grupo_id: perfil.grupo_id, ...base, valor: p.valor, data: p.data, recorrente: false, serie_id: serie, parcela_num: p.numero, parcela_total: nParcelas,
      }))
      const { de, ate } = periodoParcelas(nParcelas, data)
      ;({ error } = await run(supabase.from('a_receber').insert(linhas), { ok: t.okParcelado(nParcelas, de, ate) }))
    } else {
      const todoMes = manual.repete === 'mes'
      ;({ error } = await run(supabase.from('a_receber').insert({
        grupo_id: perfil.grupo_id, ...base, valor, data, recorrente: todoMes, serie_id: todoMes ? crypto.randomUUID() : null,
      }), { ok: todoMes ? t.okLancadoMes : t.okLancado }))
      if (!error && todoMes) await supabase.rpc('garantir_series')
    }
    setSalvando(false)
    if (error) return
    setManual(null); carregar()
  }

  function abrirReceber(gp) {
    setReceber({ pessoaId: gp.id, nome: gp.nome, selecionados: new Set(gp.itens.map(i => i.chave)), criarEntrada: true, data: hojeISO(), valor: '' })
  }

  // ---------------------------------------------------------- cobrança (A1.16)
  const payloadPix = cobrar?.incluirPix && pix.chave ? pixCopiaECola({ chave: pix.chave, nome: pix.nome || perfil?.nome, cidade: pix.cidade, valor: soma(cobrar.itens) }) : ''
  const textoMsg = cobrar ? textoCobranca({ nome: cobrar.nome, mesNome: nomeMes(comp), itens: cobrar.itens, ate: cobrar.ate, pix: payloadPix }) : ''

  function abrirCobranca(gp) {
    const p = lerPix()
    setPix(p); setEditandoPix(!p.chave); setQr(''); setArquivo(null)
    // A8.21: o prazo é de quem cobra — começa sem data; o último vencimento vira só uma sugestão.
    setCobrar({ pessoaId: gp.id, nome: gp.nome, itens: gp.itens, ate: '', sugestao: gp.ate || '', incluirPix: !!p.chave })
  }

  // QR do Pix na imagem
  useEffect(() => {
    if (!payloadPix) { setQr(''); return }
    let vivo = true
    import('qrcode').then(m => m.toDataURL(payloadPix, { margin: 1, width: 208, color: { dark: '#0f172a', light: '#ffffff' } }))
      .then(url => { if (vivo) setQr(url) }).catch(() => { if (vivo) setQr('') })
    return () => { vivo = false }
  }, [payloadPix])

  // A imagem fica pronta ANTES do toque em Enviar (o celular só deixa compartilhar logo após o toque).
  useEffect(() => {
    if (!cobrar) { setArquivo(null); return }
    let vivo = true
    setArquivo(null)
    const id = setTimeout(async () => {
      try {
        const { toBlob } = await import('html-to-image')
        if (document.fonts?.ready) { try { await document.fonts.ready } catch { /* segue */ } }
        const opcoes = await opcoesImagem({ pixelRatio: 2, cacheBust: true }) // fontes da marca embutidas
        const blob = imgRef.current ? await toBlob(imgRef.current, opcoes) : null
        if (vivo && blob) setArquivo(new File([blob], `cobranca-${comp}.png`, { type: 'image/png' }))
      } catch (e) { console.error('[cobranca] imagem:', e) }
    }, 350)
    return () => { vivo = false; clearTimeout(id) }
  }, [cobrar, qr, comp])

  // Prévia = o próprio PNG que vai ser enviado.
  const [previaUrl, setPreviaUrl] = useState('')
  useEffect(() => {
    if (!arquivo) { setPreviaUrl(''); return }
    const url = URL.createObjectURL(arquivo)
    setPreviaUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [arquivo])

  function abrirWhatsApp(texto) { window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, '_blank') }

  function enviarComImagem() {
    // O texto vai junto; copiado também, pra colar se o WhatsApp mostrar só a imagem.
    navigator.clipboard?.writeText(textoMsg).catch(() => {})
    if (arquivo && navigator.canShare?.({ files: [arquivo] })) {
      navigator.share({ files: [arquivo], text: textoMsg, title: t.cobrarTitulo(cobrar.nome, nomeMes(comp)) })
        .catch(e => { if (e?.name !== 'AbortError') { console.error('[cobranca] share:', e); toast(t.erroCompartilhar, 'erro') } })
      return
    }
    // Sem compartilhar arquivo (computador): baixa a imagem e abre o WhatsApp com o texto.
    if (arquivo) {
      const url = URL.createObjectURL(arquivo)
      const a = document.createElement('a')
      a.href = url; a.download = arquivo.name
      document.body.appendChild(a); a.click(); a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 5000)
    }
    abrirWhatsApp(textoMsg)
    toast(t.okBaixado, 'ok')
  }

  function enviarTexto() {
    if (navigator.share) navigator.share({ text: textoMsg }).catch(() => {})
    else abrirWhatsApp(textoMsg)
  }

  async function copiarTexto() {
    try { await navigator.clipboard.writeText(textoMsg); toast(t.okCopiado, 'ok') } catch { toast(t.erroCompartilhar, 'erro') }
  }

  function mudarPix(campo, valor) {
    setPix(p => { const n = { ...p, [campo]: valor }; gravarPix(n); return n })
  }

  // ---------------------------------------------------------- UI
  const Linha = ({ g, acao }) => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
      <div style={{ minWidth: 0 }}>
        <p style={{ fontSize: 13.5, fontWeight: 500, textDecoration: g.recebido ? 'line-through' : 'none', color: g.recebido ? 'var(--text2)' : 'var(--text)' }}>{nomeItem(g)}</p>
        <p style={{ fontSize: 11, color: 'var(--text2)' }}>
          {g.origem?.tipo === 'cartao' ? t.vence(fmtData(g.dataSaida, 'dd/MM')) : fmtData(g.data, 'dd/MM')}
          {g.recebido && g.recebidoEm ? ` · ${t.recebidoEm(fmtData(g.recebidoEm, 'dd/MM'))}` : ''}
        </p>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        <span style={{ fontSize: 14, fontWeight: 700, fontFamily: 'Syne', color: g.recebido ? 'var(--text2)' : 'var(--text)' }}>{fmt(g.valor)}</span>
        {acao}
      </div>
    </div>
  )
  // Lançado à mão: arrastar pra editar/apagar (A8.16), como nas outras listas.
  const LinhaItem = ({ g }) => g.tipo === 'manual'
    ? <SwipeRow onEdit={() => editarManual(g)} onDelete={() => setApagando(g)}><Linha g={g} /></SwipeRow>
    : <Linha g={g} />
  const hojeCob = hojeISO()
  const chipsAte = cobrar ? [
    { rotulo: t.semData, valor: '' },
    ...(cobrar.sugestao ? [{ rotulo: t.ultimoVenc(fmtData(cobrar.sugestao, 'dd/MM')), valor: cobrar.sugestao }] : []),
    { rotulo: t.emDias(7, fmtData(maisDias(hojeCob, 7), 'dd/MM')), valor: maisDias(hojeCob, 7) },
    { rotulo: t.emDias(15, fmtData(maisDias(hojeCob, 15), 'dd/MM')), valor: maisDias(hojeCob, 15) },
  ] : []

  const selTotal = receber ? soma(itens.filter(i => receber.selecionados.has(i.chave))) : 0
  // A8.4: quanto a pessoa pagou (em branco = tudo o que está marcado)
  const pagoDigitado = receber ? valorPago(receber.valor) : null
  const simParte = receber && pagoDigitado !== null && pagoDigitado > 0 && Math.abs(pagoDigitado - selTotal) > 0.005
    ? simularRecebimento(itens.filter(i => receber.selecionados.has(i.chave)), pagoDigitado) : null
  const valorDaEntrada = simParte ? pagoDigitado : selTotal
  const itensDaPessoa = receber ? itens.filter(i => !i.recebido && (i.pessoaId || i.pessoaNome) === (receber.pessoaId || receber.nome))
    .sort((a, b) => a.comp.localeCompare(b.comp) || String(a.dataSaida).localeCompare(String(b.dataSaida))) : []

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <h2 style={{ fontSize: 20 }}>{t.titulo}</h2>
        <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={() => navigate('/pessoas')} className="btn-ghost" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', fontSize: 13 }}>
          <Users size={15} /> {copy.pessoasTela.botao}
        </button>
        <button onClick={() => setManual({ ...novoManual(), data: comp === compDe(hojeBRT()) ? hojeISO() : `${comp}-01` })} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--accent)', color: 'var(--on-accent)', padding: '8px 14px', borderRadius: 'var(--radius-sm)', fontSize: 13, fontWeight: 700, fontFamily: 'Syne' }}>
          <Plus size={16} /> {t.lancar}
        </button>
        </div>
      </div>
      <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 14, lineHeight: 1.5 }}>{t.intro} {t.arrasteDica}</p>

      {/* Navegação de mês */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <button onClick={() => setComp(c => addMeses(c, -1))} aria-label="Mês anterior"><ChevronLeft size={20} color="var(--text2)" /></button>
        <h3 style={{ fontSize: 16 }}>{mesAno(comp)}</h3>
        <button onClick={() => setComp(c => addMeses(c, 1))} aria-label="Próximo mês"><ChevronRight size={20} color="var(--text2)" /></button>
      </div>

      {loading ? <div className="empty-state">Carregando...</div> : itens.length === 0 ? (
        <div className="empty-state">{t.vazio}</div>
      ) : (
        <>
          {anteriores.length > 0 && (
            <button onClick={() => setComp(anteriores.reduce((m, i) => (i.comp < m ? i.comp : m), comp))} className="card"
              style={{ width: '100%', marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, textAlign: 'left', background: 'var(--amber-dim)', borderColor: 'var(--amber)', color: 'var(--text)' }}>
              <span style={{ fontSize: 13, lineHeight: 1.4 }}>{t.emAberto(fmt(soma(anteriores)), anteriores.length)}</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--amber-text)', flexShrink: 0 }}>{t.verEmAberto}</span>
            </button>
          )}

          <div className="card" style={{ marginBottom: 14, background: 'var(--bg3)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 13, color: 'var(--text2)' }}>{t.totalMes(nomeMes(comp))}</span>
              <span style={{ fontSize: 20, fontWeight: 700, fontFamily: 'Syne', color: 'var(--amber-text)' }}>{fmt(soma(pendentesMes))}</span>
            </div>
            {futuros.length > 0 && <p style={{ fontSize: 11.5, color: 'var(--text2)', marginTop: 4 }}>{t.proximos(fmt(soma(futuros)))}</p>}
          </div>

          {grupos.length === 0 && <div className="empty-state" style={{ padding: '18px 0' }}>{t.vazioMes(nomeMes(comp))}</div>}

          {grupos.map(gp => (
            <div key={gp.id || gp.nome} className="card" style={{ marginBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 2 }}>
                <span style={{ fontSize: 15, fontWeight: 600, fontFamily: 'Syne' }}>{gp.nome}</span>
                <span style={{ fontSize: 16, fontWeight: 700, fontFamily: 'Syne', color: 'var(--amber-text)' }}>{fmt(gp.total)}</span>
              </div>
              <p style={{ fontSize: 11.5, color: 'var(--text2)', marginBottom: 6 }}>{t.itensLinha(gp.itens.length, gp.ate ? fmtData(gp.ate, 'dd/MM') : '')}</p>
              {agruparPorOrigem(gp.itens).map(og => (
                <div key={og.rotulo} style={{ marginTop: 6 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, fontWeight: 700, color: 'var(--accent-text)', textTransform: 'uppercase', letterSpacing: '.03em' }}>
                    <span>{og.rotulo}</span><span>{fmt(og.total)}</span>
                  </div>
                  {og.itens.map(g => <LinhaItem key={g.chave} g={g} />)}
                </div>
              ))}
              {gp.id && (
                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                  <button className="btn-primary" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }} onClick={() => abrirReceber(gp)}>
                    <Check size={15} /> {t.receberDe(primeiroNome(gp.nome))}
                  </button>
                  <button className="btn-ghost" style={{ display: 'flex', alignItems: 'center', gap: 6 }} onClick={() => abrirCobranca(gp)}>
                    <Send size={15} /> {t.cobrar}
                  </button>
                </div>
              )}
            </div>
          ))}

          {recebidosMes.length > 0 && (
            <div style={{ marginTop: 18 }}>
              <button onClick={() => setVerRecebidos(v => !v)} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, fontFamily: 'Syne', color: 'var(--text2)', marginBottom: 8 }}>
                {t.jaRecebidos(recebidosMes.length)} {verRecebidos ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
              </button>
              {verRecebidos && (
                <div className="card">
                  {recebidosMes.map(g => (
                    <Linha key={g.chave} g={{ ...g, descricao: `${g.descricao} · ${primeiroNome(g.pessoaNome)}` }} acao={
                      <button onClick={() => reabrir(g)} title="Reabrir" style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 600, color: 'var(--text2)' }}>
                        <RotateCcw size={13} /> {t.reabrir}
                      </button>} />
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Receber de Fulano */}
      {receber && (
        <div className="modal-overlay" onClick={() => setReceber(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxHeight: '86vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <h2 style={{ fontSize: 18 }}>{t.receberTitulo(receber.nome)}</h2>
              <button onClick={() => setReceber(null)}><X size={20} color="var(--text2)" /></button>
            </div>
            <p style={{ fontSize: 12.5, color: 'var(--text2)', marginBottom: 12 }}>{t.receberSub}</p>
            {itensDaPessoa.map(i => {
              const on = receber.selecionados.has(i.chave)
              return (
                <label key={i.chave} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}>
                  <input type="checkbox" checked={on} onChange={() => setReceber(r => { const s = new Set(r.selecionados); on ? s.delete(i.chave) : s.add(i.chave); return { ...r, selecionados: s } })} />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ fontSize: 13, display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{nomeItem(i)}</span>
                    <span style={{ fontSize: 11, color: 'var(--text2)', textTransform: 'capitalize' }}>{nomeMes(i.comp)} · {rotuloOrigem(i.origem)}</span>
                  </span>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{fmt(i.valor)}</span>
                </label>
              )
            })}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', margin: '12px 0' }}>
              <span style={{ fontSize: 13, color: 'var(--text2)' }}>{t.totalRecebido}</span>
              <span style={{ fontSize: 20, fontWeight: 700, fontFamily: 'Syne', color: 'var(--accent-text)' }}>{fmt(selTotal)}</span>
            </div>
            <div className="form-group">
              <label>{t.quantoPagou(primeiroNome(receber.nome))}</label>
              <input type="number" inputMode="decimal" min="0" step="0.01" value={receber.valor} placeholder={fmt(selTotal)}
                onChange={e => setReceber(r => ({ ...r, valor: e.target.value }))} />
              <span style={{ fontSize: 11.5, color: 'var(--text2)', marginTop: 4, display: 'block', lineHeight: 1.4 }}>{t.quantoPagouSub}</span>
              {simParte && (
                <p style={{ fontSize: 12.5, marginTop: 6, padding: '8px 10px', borderRadius: 'var(--radius-sm)', background: 'var(--amber-dim)', color: 'var(--text)', lineHeight: 1.45 }}>
                  {t.previaParte(simParte.quitados.filter(i => i.valor > 0).length, fmt(simParte.porConta), fmt(simParte.faltam))}
                </p>
              )}
            </div>
            <div className="form-group">
              <label>{t.dataRecebeu}</label>
              <input type="date" value={receber.data} onChange={e => setReceber(r => ({ ...r, data: e.target.value }))} />
            </div>
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 12.5, color: 'var(--text2)', marginBottom: 16, cursor: 'pointer', lineHeight: 1.4 }}>
              <input type="checkbox" checked={receber.criarEntrada} onChange={e => setReceber(r => ({ ...r, criarEntrada: e.target.checked }))} style={{ marginTop: 2 }} />
              <span>{t.lancarEntrada(fmt(valorDaEntrada))}</span>
            </label>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn-ghost" style={{ flex: 1 }} onClick={() => setReceber(null)}>Cancelar</button>
              <button className="btn-primary" style={{ flex: 1, opacity: salvando ? 0.6 : 1 }} disabled={salvando || (selTotal <= 0 && !(pagoDigitado > 0))} onClick={confirmarRecebimento}>
                {salvando ? 'Salvando...' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cobrar (A1.16): mensagem do WhatsApp + imagem + Pix copia e cola */}
      {cobrar && (
        <div className="modal-overlay" onClick={() => setCobrar(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h2 style={{ fontSize: 18 }}>{t.cobrarTitulo(primeiroNome(cobrar.nome), nomeMes(comp))}</h2>
              <button onClick={() => setCobrar(null)}><X size={20} color="var(--text2)" /></button>
            </div>

            <div className="form-group">
              <label>{t.pagarAtePergunta}</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                {chipsAte.map(c => {
                  const on = cobrar.ate === c.valor
                  return (
                    <button key={c.rotulo} type="button" aria-pressed={on} onClick={() => setCobrar(x => ({ ...x, ate: c.valor }))}
                      style={{ padding: '6px 11px', borderRadius: 16, fontSize: 12.5, fontWeight: 600, border: `1.5px solid ${on ? 'var(--accent)' : 'var(--border2)'}`, background: on ? 'var(--accent-dim)' : 'transparent', color: on ? 'var(--accent-text)' : 'var(--text2)' }}>
                      {c.rotulo}
                    </button>
                  )
                })}
              </div>
              <input type="date" value={cobrar.ate} aria-label={t.pagarAte} onChange={e => setCobrar(c => ({ ...c, ate: e.target.value }))} />
              <span style={{ fontSize: 11, color: 'var(--text2)', marginTop: 4, display: 'block' }}>{t.pagarAteDica}</span>
            </div>

            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text2)', marginBottom: 8, cursor: 'pointer' }}>
              <input type="checkbox" checked={cobrar.incluirPix} onChange={e => { setCobrar(c => ({ ...c, incluirPix: e.target.checked })); if (e.target.checked && !pix.chave) setEditandoPix(true) }} />
              {t.incluirPix}
              {cobrar.incluirPix && pix.chave && !editandoPix && (
                <button type="button" onClick={() => setEditandoPix(true)} style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--accent-text)', fontWeight: 600 }}>{t.pixAlterar}</button>
              )}
            </label>
            {cobrar.incluirPix && editandoPix && (
              <div style={{ background: 'var(--bg3)', borderRadius: 'var(--radius-sm)', padding: 12, marginBottom: 12 }}>
                <div className="form-group"><label>{t.pixChave}</label><input value={pix.chave} onChange={e => mudarPix('chave', e.target.value)} placeholder={t.pixChavePh} autoCapitalize="off" autoCorrect="off" /></div>
                <div className="form-row">
                  <div className="form-group"><label>{t.pixNome}</label><input value={pix.nome} onChange={e => mudarPix('nome', e.target.value)} placeholder={perfil?.nome || ''} /></div>
                  <div className="form-group"><label>{t.pixCidade}</label><input value={pix.cidade} onChange={e => mudarPix('cidade', e.target.value)} /></div>
                </div>
                <p style={{ fontSize: 11, color: 'var(--text2)' }}>{t.pixDica}</p>
              </div>
            )}

            {/* A imagem é montada fora da tela, no tamanho certo (360px); a prévia é o próprio PNG,
                que se ajusta à largura do celular. */}
            <div aria-hidden="true" style={{ position: 'fixed', left: -10000, top: 0, pointerEvents: 'none' }}>
              <div ref={imgRef}>
                <CobrancaImagem nome={cobrar.nome} mesNome={nomeMes(comp)} itens={cobrar.itens} ate={cobrar.ate} qr={qr} />
              </div>
            </div>
            <p style={{ fontSize: 12, color: 'var(--text2)', margin: '6px 0' }}>{t.previaImagem}</p>
            <div style={{ display: 'flex', justifyContent: 'center', background: 'var(--bg3)', borderRadius: 'var(--radius-sm)', padding: 10, marginBottom: 12 }}>
              {previaUrl
                ? <img src={previaUrl} alt={t.previaImagem} style={{ display: 'block', width: '100%', maxWidth: 360, boxShadow: '0 2px 10px rgba(0,0,0,.12)' }} />
                : <p style={{ padding: '28px 0', fontSize: 12.5, color: 'var(--text2)' }}>{t.gerandoImagem}</p>}
            </div>

            <p style={{ fontSize: 12, color: 'var(--text2)', margin: '6px 0' }}>{t.previaTexto}</p>
            <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: "'DM Sans', system-ui, sans-serif", fontSize: 12.5, lineHeight: 1.5, background: 'var(--bg3)', color: 'var(--text)', borderRadius: 'var(--radius-sm)', padding: 12, marginBottom: 14 }}>{textoMsg}</pre>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button className="btn-primary" onClick={enviarComImagem} disabled={!arquivo} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, opacity: arquivo ? 1 : 0.6 }}>
                <Send size={15} /> {arquivo ? t.enviarImagem : t.gerandoImagem}
              </button>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn-ghost" style={{ flex: 1 }} onClick={enviarTexto}>{t.soTexto}</button>
                <button className="btn-ghost" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }} onClick={copiarTexto}><Copy size={14} /> {t.copiarTexto}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Apagar o lançado à mão (A8.16) */}
      {apagando && (
        <div className="modal-overlay" onClick={() => setApagando(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2 style={{ fontSize: 18, marginBottom: 6 }}>{t.apagarTitulo}</h2>
            <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 14, lineHeight: 1.45 }}>
              {nomeItem(apagando)} · {fmt(apagando.valor)}{apagando.serieId ? ` — ${t.apagarSerie}` : ''}
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {apagando.serieId ? (
                <>
                  <button className="btn-ghost" style={{ color: 'var(--red-text)', opacity: salvando ? 0.6 : 1 }} disabled={salvando} onClick={() => apagarManual(apagando, false)}>{t.soEsta}</button>
                  <button className="btn-ghost" style={{ color: 'var(--red-text)', opacity: salvando ? 0.6 : 1 }} disabled={salvando} onClick={() => apagarManual(apagando, true)}>{t.apagarProximas}</button>
                </>
              ) : (
                <button className="btn-ghost" style={{ color: 'var(--red-text)', opacity: salvando ? 0.6 : 1 }} disabled={salvando} onClick={() => apagarManual(apagando, false)}>{t.apagar}</button>
              )}
              <button className="btn-primary" onClick={() => setApagando(null)}>{t.voltar}</button>
            </div>
          </div>
        </div>
      )}

      {/* Lançar a receber manual */}
      {manual && (
        <div className="modal-overlay" onClick={() => setManual(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2 style={{ fontSize: 18, marginBottom: 6 }}>{manual.id ? t.editarTitulo : t.manualTitulo}</h2>
            <p style={{ fontSize: 12.5, color: 'var(--text2)', marginBottom: 14 }}>
              {manual.id ? (manual.deTotal ? t.parcelaDe(manual.numero, manual.deTotal) : manual.repete === 'mes' ? t.serieTodoMes : t.manualSub) : t.manualSub}
            </p>
            <div className="form-group">
              <label>{t.quemPaga}</label>
              {pessoas.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                  {pessoas.map(p => (
                    <button key={p.id} type="button" onClick={() => setManual(m => ({ ...m, pessoaId: m.pessoaId === p.id ? '' : p.id, pessoaNome: '' }))}
                      style={{ padding: '6px 12px', borderRadius: 16, fontSize: 13, border: `1px solid ${manual.pessoaId === p.id ? 'var(--accent)' : 'var(--border2)'}`, background: manual.pessoaId === p.id ? 'var(--accent-dim)' : 'var(--bg2)', color: 'var(--text)' }}>
                      {p.nome}
                    </button>
                  ))}
                </div>
              )}
              {!manual.pessoaId && (
                <input value={manual.pessoaNome} onChange={e => setManual(m => ({ ...m, pessoaNome: e.target.value }))} placeholder={pessoas.length ? 'Ou escreva um nome novo' : 'Nome (ex.: Jacqueline)'} />
              )}
              {!manual.pessoaId && pessoasParecidas(manual.pessoaNome, pessoas).slice(0, 3).map(p => (
                <button key={p.id} type="button" onClick={() => setManual(m => ({ ...m, pessoaId: p.id, pessoaNome: '' }))}
                  style={{ display: 'block', marginTop: 6, fontSize: 12.5, color: 'var(--amber-text)', fontWeight: 600, textAlign: 'left' }}>
                  {copy.pessoas.parecida(p.nome)} → {copy.pessoas.usar(p.nome)}
                </button>
              ))}
            </div>
            {contasFixas.length > 0 && (
              <div className="form-group">
                <label>{t.contaFixa}</label>
                <select value={manual.contaFixaId} onChange={e => {
                  const id = e.target.value
                  const conta = contasFixas.find(c => c.id === id)
                  setManual(m => ({ ...m, contaFixaId: id, descricao: m.descricao || (conta ? t.parteDe(conta.nome) : ''), repete: id && !m.id ? 'mes' : m.repete }))
                }}>
                  <option value="">{t.contaFixaNenhuma}</option>
                  {contasFixas.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
                <span style={{ fontSize: 11, color: 'var(--text2)', marginTop: 4, display: 'block', lineHeight: 1.4 }}>{t.contaFixaDica}</span>
              </div>
            )}
            <div className="form-group"><label>Descrição</label><input value={manual.descricao} onChange={e => setManual(m => ({ ...m, descricao: e.target.value }))} placeholder="Ex.: parte do aluguel" /></div>
            {!manual.id && (
              <div className="form-group">
                <label>{t.repete}</label>
                <div role="radiogroup" aria-label={t.repete} style={{ display: 'flex', gap: 6 }}>
                  {[['uma', t.repeteUma], ['mes', t.repeteMes], ['parcelado', t.repeteParcelado]].map(([v, rotulo]) => {
                    const on = manual.repete === v
                    return (
                      <button key={v} type="button" role="radio" aria-checked={on} onClick={() => setManual(m => ({ ...m, repete: v }))}
                        style={{ flex: 1, padding: '9px 6px', borderRadius: 'var(--radius-sm)', fontSize: 13, fontWeight: 600, border: `1.5px solid ${on ? 'var(--accent)' : 'var(--border2)'}`, background: on ? 'var(--accent-dim)' : 'transparent', color: on ? 'var(--accent-text)' : 'var(--text2)' }}>
                        {rotulo}
                      </button>
                    )
                  })}
                </div>
                {manual.repete === 'mes' && <span style={{ fontSize: 11, color: 'var(--text2)', marginTop: 4, display: 'block' }}>{t.dicaMes}</span>}
              </div>
            )}
            <div className="form-row">
              <div className="form-group"><label>{!manual.id && manual.repete === 'parcelado' ? t.valorTotal : t.valor}</label><input type="number" inputMode="decimal" value={manual.valor} onChange={e => setManual(m => ({ ...m, valor: e.target.value }))} placeholder="0,00" /></div>
              <div className="form-group"><label>{!manual.id && manual.repete === 'parcelado' ? t.primeiraEm : t.cobrarEm}</label><input type="date" value={manual.data} onChange={e => setManual(m => ({ ...m, data: e.target.value }))} /></div>
            </div>
            {!manual.id && manual.repete === 'parcelado' && (
              <div className="form-group">
                <label>{t.quantasVezes}</label>
                <input type="number" inputMode="numeric" pattern="[0-9]*" min="2" max="120" value={manual.parcelas} onChange={e => setManual(m => ({ ...m, parcelas: e.target.value }))} placeholder="Ex.: 3" />
                <span style={{ fontSize: 11, color: 'var(--text2)', marginTop: 4, display: 'block', lineHeight: 1.4 }}>{t.dicaParcelado}</span>
              </div>
            )}
            {manual.id && manual.serieId && (
              <div className="form-group">
                <label>{t.aplicarEm}</label>
                <div role="radiogroup" aria-label={t.aplicarEm} style={{ display: 'flex', gap: 6 }}>
                  {[['esta', t.soEsta], ['proximas', t.estaEProximas]].map(([v, rotulo]) => {
                    const on = manual.aplicar === v
                    return (
                      <button key={v} type="button" role="radio" aria-checked={on} onClick={() => setManual(m => ({ ...m, aplicar: v }))}
                        style={{ flex: 1, padding: '9px 6px', borderRadius: 'var(--radius-sm)', fontSize: 13, fontWeight: 600, border: `1.5px solid ${on ? 'var(--accent)' : 'var(--border2)'}`, background: on ? 'var(--accent-dim)' : 'transparent', color: on ? 'var(--accent-text)' : 'var(--text2)' }}>
                        {rotulo}
                      </button>
                    )
                  })}
                </div>
                {manual.aplicar === 'proximas' && <span style={{ fontSize: 11, color: 'var(--text2)', marginTop: 4, display: 'block' }}>{t.dicaSerieData}</span>}
              </div>
            )}
            <div style={{ height: 6 }} />
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn-ghost" style={{ flex: 1 }} onClick={() => setManual(null)}>Cancelar</button>
              <button className="btn-primary" style={{ flex: 1, opacity: salvando ? 0.6 : 1 }} disabled={salvando} onClick={salvarManual}>{salvando ? 'Salvando...' : 'Salvar'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
