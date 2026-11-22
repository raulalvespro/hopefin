// Financiamentos (0120, 22/11/2026) — só com a chave de recurso "financiamentos" (App.jsx).
// Cada financiamento = 1 parcelamento SEM cartão (as parcelas, que o motor já leva pra Contas do
// mês, Projeção e alertas) + a ficha em public.financiamentos. Contas em src/lib/financiamento.js.
import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ChevronLeft, ChevronDown, ChevronUp, Check, Plus, Pencil, Trash2, Home, Car, Landmark, GraduationCap, Wallet } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { useAtualizarSozinho } from '../hooks/useAtualizarSozinho'
import { useCategorias, rotuloCategoria } from '../hooks/useCategorias'
import { useDb } from '../hooks/useDb'
import { useToast } from '../contexts/ToastContext'
import { usePessoas } from '../hooks/usePessoas'
import DividirConta from '../components/DividirConta'
import { resumoPartes, salvarPartes, partesDoBanco } from '../lib/dividir'
import { fmt, fmtData, hojeISO } from '../lib/format'
import { copy } from '../copy/pt-BR'
import {
  TIPOS, CATEGORIA_DO_TIPO, numero, taxaMensal, primeiraParcelaDe, dataDaParcela, valoresDasParcelas,
  resumoFinanciamento, simularAmortizacao,
} from '../lib/financiamento'

const t = copy.financiamentos
const tf = t.form
const ICONE = { imovel: Home, carro: Car, consignado: Landmark, pessoal: Wallet, estudantil: GraduationCap, outro: Landmark }
const pct = (f) => (f == null ? '' : (f * 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 }))
const mesAno = (iso) => (iso ? fmtData(iso, 'MMM/yyyy') : '')
const r2 = (v) => Math.round(v * 100) / 100

// Campos do parcelado que a tela usa (pessoa_id = parcelado de outra pessoa, que vira "a receber").
const CAMPOS_PARC = 'id, descricao, categoria, cartao_id, pessoa_id, pessoas(nome), num_parcelas, valor_parcela, valor_total, data_primeira_parcela, parcelas_pagas, parcelas(id, numero, valor, data_vencimento, paga, recebido, reembolso_entrada_id)'

// Tipo provável pela categoria/nome do parcelado (a pessoa troca se não for).
function tipoProvavel(p) {
  const x = `${p.categoria || ''} ${p.descricao || ''}`.toLowerCase()
  if (/im[oó]v|terreno|casa|apart|lote/.test(x)) return 'imovel'
  if (/carro|ve[ií]cul|moto/.test(x)) return 'carro'
  if (/consignad/.test(x)) return 'consignado'
  if (/estud|faculdade|fies/.test(x)) return 'estudantil'
  if (/empr[eé]st/.test(x)) return 'pessoal'
  return 'outro'
}

const formVazio = () => ({
  descricao: '', tipo: 'imovel', banco: '', valor_financiado: '', entrada: '', num_parcelas: '', valor_parcela: '',
  sistema: 'price', taxa_valor: '', taxa_periodo: 'mes', proxima: '1', data_proxima: hojeISO(),
  categoria: CATEGORIA_DO_TIPO.imovel, categoriaMexida: false, dono_id: '', observacao: '', dividir: false, partes: [], aPartirDe: 1,
})

// ---------------------------------------------------------------- simulador
function Simulador({ resumo, sistema }) {
  const [valor, setValor] = useState('')
  const [modo, setModo] = useState('prazo')
  const x = numero(valor)
  const sim = x > 0 ? simularAmortizacao(resumo, sistema, x, modo) : null
  const fimDepois = sim?.ok && !sim.quita && resumo.proxima ? dataDaParcela(resumo.proxima.data_vencimento, sim.parcelasDepois) : null
  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <p style={{ fontFamily: 'Syne', fontWeight: 600, fontSize: 15 }}>{t.sim.titulo}</p>
      <p style={{ fontSize: 12, color: 'var(--text2)', margin: '4px 0 12px' }}>{t.sim.sub}</p>
      <div className="form-group">
        <label htmlFor="fin-sim-valor">{t.sim.valor}</label>
        <input id="fin-sim-valor" type="text" inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="0,00" />
      </div>
      <div role="radiogroup" style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        {['prazo', 'parcela'].map((m) => (
          <button key={m} role="radio" aria-checked={modo === m} onClick={() => setModo(m)}
            style={{ flex: 1, minHeight: 40, borderRadius: 'var(--radius-sm)', fontSize: 13, fontWeight: 500,
              border: `1px solid ${modo === m ? 'var(--accent)' : 'var(--border)'}`, background: modo === m ? 'var(--bg3)' : 'transparent', color: modo === m ? 'var(--accent-text)' : 'var(--text2)' }}>
            {t.sim[m]}
          </button>
        ))}
      </div>
      {sim && (
        <div aria-live="polite" style={{ background: 'var(--bg3)', borderRadius: 'var(--radius-sm)', padding: 12, fontSize: 13, lineHeight: 1.5 }}>
          {!sim.ok ? <p>{sim.motivo === 'juros' ? t.sim.erroJuros : t.sim.valorInvalido}</p>
            : sim.quita ? (
              <>
                <p style={{ fontWeight: 600 }}>{t.sim.quita}</p>
                {sim.economia > 0 && <p style={{ color: 'var(--accent-text)' }}>{t.sim.economia(fmt(sim.economia))}</p>}
              </>
            ) : sim.semJuros ? (
              <>
                <p>{modo === 'prazo' ? `${t.sim.menosParcelas(sim.menosParcelas)} · ${t.sim.terminaAntes(mesAno(fimDepois))}` : t.sim.novaParcela(fmt(sim.parcelaDepois))}</p>
                <p style={{ color: 'var(--text2)', fontSize: 12, marginTop: 4 }}>{t.sim.semJuros}</p>
              </>
            ) : (
              <>
                <p style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 16, color: 'var(--accent-text)' }}>{t.sim.economia(fmt(sim.economia))}</p>
                <p>{modo === 'prazo' ? `${t.sim.menosParcelas(sim.menosParcelas)} · ${t.sim.terminaAntes(mesAno(fimDepois))}` : t.sim.novaParcela(fmt(sim.parcelaDepois))}</p>
                <p style={{ color: 'var(--text2)', fontSize: 11.5, marginTop: 6 }}>{t.sim.nota}</p>
              </>
            )}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------- linha de parcela
function LinhaParcela({ p, total, onToggle, onValor }) {
  const [editando, setEditando] = useState(false)
  const [v, setV] = useState(String(p.valor))
  const atrasada = !p.paga && p.data_vencimento < hojeISO()
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
        <button onClick={() => onToggle(p)} aria-label={p.paga ? t.marcarAberta : t.marcarPaga} title={p.paga ? t.marcarAberta : t.marcarPaga}
          style={{ width: 24, height: 24, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: `2px solid ${p.paga ? 'var(--accent)' : 'var(--control-line)'}`, background: p.paga ? 'var(--accent)' : 'transparent' }}>
          {p.paga && <Check size={13} color="var(--on-accent)" />}
        </button>
        <div style={{ minWidth: 0 }}>
          <p style={{ fontSize: 13, fontWeight: 500, color: p.paga ? 'var(--text2)' : 'var(--text)', textDecoration: p.paga ? 'line-through' : 'none' }}>{t.parcelaN(p.numero, total)}</p>
          <p style={{ fontSize: 11, color: atrasada ? 'var(--red)' : 'var(--text2)' }}>{t.vence(fmtData(p.data_vencimento, 'dd/MM/yyyy'))}</p>
        </div>
      </div>
      {editando ? (
        <form onSubmit={(e) => { e.preventDefault(); onValor(p, numero(v)); setEditando(false) }} style={{ display: 'flex', gap: 6 }}>
          <input aria-label={t.novoValor(p.numero)} autoFocus type="text" inputMode="decimal" value={v} onChange={(e) => setV(e.target.value)} style={{ width: 100 }} />
          <button type="submit" className="btn-primary" style={{ minHeight: 36, padding: '0 10px' }} aria-label={tf.salvar}><Check size={15} /></button>
        </form>
      ) : (
        <button onClick={() => { setV(String(p.valor)); setEditando(true) }} title={t.editarValor} aria-label={`${t.editarValor}: ${fmt(p.valor)}`}
          style={{ fontSize: 13, fontWeight: 600, color: p.paga ? 'var(--text2)' : 'var(--text)', textDecoration: 'underline dotted', textUnderlineOffset: 3 }}>
          {fmt(p.valor)}
        </button>
      )}
    </div>
  )
}

// ---------------------------------------------------------------- tela
export default function Financiamentos() {
  const { perfil } = useAuth()
  const { categorias, emojiDe } = useCategorias()
  const run = useDb()
  const { toast } = useToast()
  const { pessoas, garantirPessoa } = usePessoas(perfil?.grupo_id)
  const [params, setParams] = useSearchParams()
  const abertoId = params.get('id')
  const converterId = params.get('converter') // "Virar financiamento" vindo de Parcelamentos (A8.19)
  const [lista, setLista] = useState([])
  const [membros, setMembros] = useState([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState(null) // null = fechado
  const [editandoId, setEditandoId] = useState(null)
  const [convertendo, setConvertendo] = useState(null) // parcelado (sem ficha) virando financiamento
  const [salvando, setSalvando] = useState(false)
  const [verParcelas, setVerParcelas] = useState(false)
  const [todasParcelas, setTodasParcelas] = useState(false)

  useEffect(() => { if (perfil?.grupo_id) carregar() }, [perfil]) // eslint-disable-line react-hooks/exhaustive-deps
  useAtualizarSozinho(perfil?.grupo_id ? carregar : null)
  useEffect(() => { setVerParcelas(false); setTodasParcelas(false) }, [abertoId])

  async function carregar(opcoes) {
    if (!opcoes?.silencioso) setLoading(true)
    const gid = perfil.grupo_id
    const [{ data }, { data: us }] = await Promise.all([
      supabase.from('financiamentos')
        .select(`*, parcelamentos(${CAMPOS_PARC})`)
        .eq('grupo_id', gid).order('criado_em', { ascending: false }),
      supabase.from('usuarios').select('id, nome').eq('grupo_id', gid).order('criado_em'),
    ])
    setLista((data || []).filter((f) => f.parcelamentos))
    setMembros(us || [])
    setLoading(false)
  }

  const hoje = hojeISO()
  const comResumo = useMemo(() => lista.map((f) => ({ ...f, r: resumoFinanciamento(f, f.parcelamentos.parcelas, hoje) })), [lista, hoje])
  const aberto = comResumo.find((f) => f.id === abertoId) || null
  const nomeMembro = (id) => membros.find((m) => m.id === id)?.nome?.split(' ')[0] || null

  // ------------------------------------------------ formulário
  function abrirNovo() { setEditandoId(null); setConvertendo(null); setForm(formVazio()) }
  function fecharForm() {
    setForm(null); setConvertendo(null)
    if (converterId) setParams({}, { replace: true })
  }
  function abrirEdicao(f) {
    const r = f.r
    const prox = r.proxima || r.ultima
    setEditandoId(f.id || null)
    setForm({
      descricao: f.parcelamentos.descricao, tipo: f.tipo, banco: f.banco || '',
      valor_financiado: f.valor_financiado != null ? String(f.valor_financiado) : '', entrada: f.entrada != null ? String(f.entrada) : '',
      num_parcelas: String(r.n), valor_parcela: String(prox?.valor ?? f.parcelamentos.valor_parcela), sistema: f.sistema,
      taxa_valor: f.taxa_valor != null ? String(f.taxa_valor).replace('.', ',') : '', taxa_periodo: f.taxa_periodo || 'mes',
      proxima: String(r.proxima ? r.proxima.numero : r.n), data_proxima: prox?.data_vencimento || hojeISO(),
      categoria: f.parcelamentos.categoria || CATEGORIA_DO_TIPO[f.tipo], categoriaMexida: true, dono_id: f.dono_id || '', observacao: f.observacao || '',
      dividir: false, partes: [], aPartirDe: r.proxima?.numero || 1,
    })
    supabase.from('a_receber').select('pessoa_id, valor, parcela_num, parcela_total, recebido, pessoas(nome)').eq('parcelamento_id', f.parcelamento_id).gt('valor', 0).order('parcela_num')
      .then(({ data }) => {
        if (!data?.length) return
        const valorDe = (k) => Number(f.parcelamentos.parcelas.find((x) => x.numero === k)?.valor || 0)
        const abertas = data.filter((l) => !l.recebido).map((l) => l.parcela_num)
        setForm((x) => x && ({
          ...x, dividir: true,
          partes: partesDoBanco(data.map((l) => ({ ...l, valor_parcela: valorDe(l.parcela_num) })), { total: Number(f.parcelamentos.valor_total), parcelado: true }),
          aPartirDe: abertas.length ? Math.min(...abertas) : x.aPartirDe,
        }))
      })
  }
  // "Virar financiamento" (A8.19): abre o formulário já preenchido com o parcelado.
  useEffect(() => {
    if (!converterId || !perfil?.grupo_id || loading) return
    let vivo = true
    supabase.from('parcelamentos').select(`${CAMPOS_PARC}, financiamentos(id)`).eq('id', converterId).eq('grupo_id', perfil.grupo_id).maybeSingle()
      .then(({ data: p }) => {
        if (!vivo) return
        const fichaId = Array.isArray(p?.financiamentos) ? p.financiamentos[0]?.id : p?.financiamentos?.id
        if (!p) { toast(t.virarNaoAchei, 'erro'); setParams({}, { replace: true }); return }
        if (fichaId) { toast(t.virarJaE, 'erro'); setParams({ id: fichaId }, { replace: true }); return }
        if (p.cartao_id) { toast(t.virarSoSemCartao, 'erro'); setParams({}, { replace: true }); return }
        const pseudo = { id: null, tipo: tipoProvavel(p), banco: null, valor_financiado: null, entrada: null, sistema: 'fixa',
          taxa_valor: null, taxa_periodo: 'mes', dono_id: null, observacao: null, parcelamento_id: p.id, parcelamentos: p }
        pseudo.r = resumoFinanciamento(pseudo, p.parcelas || [], hojeISO())
        setConvertendo(pseudo)
        abrirEdicao(pseudo)
      })
    return () => { vivo = false }
  }, [converterId, perfil?.grupo_id, loading]) // eslint-disable-line react-hooks/exhaustive-deps

  const set = (campo) => (e) => setForm((f) => {
    const v = e?.target ? (e.target.type === 'checkbox' ? e.target.checked : e.target.value) : e
    const novo = { ...f, [campo]: v }
    if (campo === 'tipo' && !f.categoriaMexida) novo.categoria = CATEGORIA_DO_TIPO[v] || f.categoria
    if (campo === 'categoria') novo.categoriaMexida = true
    return novo
  })

  async function salvar() {
    const n = parseInt(form.num_parcelas)
    const parcela = numero(form.valor_parcela)
    const prox = parseInt(form.proxima)
    const pv = numero(form.valor_financiado)
    if (!form.descricao.trim()) return toast(tf.erros.nome, 'erro')
    if (!(n >= 1 && n <= 600)) return toast(tf.erros.parcelas, 'erro')
    if (!(parcela > 0)) return toast(tf.erros.valor, 'erro')
    if (!(prox >= 1 && prox <= n)) return toast(tf.erros.proxima, 'erro')
    if (!form.data_proxima) return toast(tf.erros.data, 'erro')
    if (form.sistema === 'sac' && !(pv > 0)) return toast(tf.erros.sac, 'erro')

    const i = taxaMensal(form.taxa_valor, form.taxa_periodo)
    const valores = valoresDasParcelas({ sistema: form.sistema, n, parcela, pv, i, ref: prox })
    const total = r2(valores.reduce((s, v) => s + v, 0))
    const primeira = primeiraParcelaDe(prox, form.data_proxima)
    const pagas = prox - 1
    const editando = comResumo.find((f) => f.id === editandoId)
    const base = editando || convertendo // já existe um parcelado por trás
    const pessoaId = base?.parcelamentos?.pessoa_id || null // de outra pessoa: segue "a receber"
    let partesOk = []
    if (form.dividir && !pessoaId) {
      const rp = resumoPartes(total, form.partes)
      if (!rp.ok.length || rp.vazias) return toast(copy.dividir.faltaPessoa, 'erro')
      if (rp.excede) return toast(copy.dividir.passou, 'erro')
      partesOk = rp.ok
    }

    setSalvando(true)
    try {
      for (const p of partesOk) {
        p.pessoaId = await garantirPessoa(p.nome)
        if (!p.pessoaId) { toast(copy.pessoas.erroSalvar, 'erro'); return }
      }
      const gid = perfil.grupo_id
      const dadosParc = {
        descricao: form.descricao.trim(), categoria: form.categoria, cartao_id: null, valor_total: total, num_parcelas: n,
        valor_parcela: r2(parcela), data_primeira_parcela: primeira, parcelas_pagas: pagas, pessoa_id: pessoaId,
      }
      const ficha = {
        tipo: form.tipo, banco: form.banco.trim() || null, valor_financiado: pv > 0 ? pv : null,
        entrada: numero(form.entrada) > 0 ? numero(form.entrada) : null, sistema: form.sistema,
        taxa_valor: numero(form.taxa_valor), taxa_periodo: form.taxa_periodo, dono_id: form.dono_id || null,
        observacao: form.observacao.trim() || null,
      }
      let parcelamentoId = base?.parcelamento_id
      let antigas = new Map()

      if (base) {
        const { error } = await run(supabase.from('parcelamentos').update(dadosParc).eq('id', parcelamentoId))
        if (error) return
        antigas = new Map((base.parcelamentos.parcelas || []).map((p) => [p.numero, p]))
      } else {
        const { data, error } = await run(supabase.from('parcelamentos').insert({ ...dadosParc, grupo_id: gid, usuario_id: perfil.id }).select('id').single())
        if (error || !data?.id) return
        parcelamentoId = data.id
      }

      // Parcelas: SAC (valores diferentes) e edição refazem as linhas. As já pagas (antes ou no
      // app) continuam pagas e com o valor que tinham.
      // Virando financiamento: só refaz se o número, o valor, a data ou o "pago" mudar — senão as
      // parcelas ficam intactas. De outra pessoa: guarda o "recebido" e o reembolso (como Parcelamentos).
      const rows = valores.map((v, k) => {
        const num = k + 1
        const a = antigas.get(num)
        const paga = num <= pagas || !!a?.paga
        return {
          grupo_id: gid, parcelamento_id: parcelamentoId, numero: num, valor: a?.paga ? Number(a.valor) : v, data_vencimento: dataDaParcela(primeira, num), paga,
          recebido: !!pessoaId && (paga || !!a?.recebido), reembolso_entrada_id: pessoaId ? (a?.reembolso_entrada_id || null) : null,
        }
      })
      const igualAntes = antigas.size === rows.length && rows.every((x) => {
        const a = antigas.get(x.numero)
        return a && Math.abs(Number(a.valor) - x.valor) < 0.005 && String(a.data_vencimento).slice(0, 10) === x.data_vencimento && !!a.paga === x.paga
      })
      const precisaRefazer = editando ? true : convertendo ? !igualAntes : valores.some((v) => Math.abs(v - r2(parcela)) > 0.004)
      if (precisaRefazer) {
        const del = await supabase.from('parcelas').delete().eq('parcelamento_id', parcelamentoId)
        if (del.error) { toast(tf.erros.salvar, 'erro'); return }
        for (let k = 0; k < rows.length; k += 300) {
          const { error } = await supabase.from('parcelas').insert(rows.slice(k, k + 300))
          if (error) { toast(tf.erros.salvar, 'erro'); return }
        }
        const novoTotal = r2(rows.reduce((s, x) => s + x.valor, 0))
        if (Math.abs(novoTotal - total) > 0.004) await supabase.from('parcelamentos').update({ valor_total: novoTotal }).eq('id', parcelamentoId)
      }

      let novaFichaId = null
      if (editando) {
        const { error } = await run(supabase.from('financiamentos').update(ficha).eq('id', editando.id))
        if (error) return
      } else {
        const { data, error } = await run(supabase.from('financiamentos').insert({ ...ficha, grupo_id: gid, parcelamento_id: parcelamentoId }).select('id').single())
        // Se a ficha falhar, só apaga o parcelado recém-criado — NUNCA um que já existia (virar financiamento).
        if (error) { if (!convertendo) await supabase.from('parcelamentos').delete().eq('id', parcelamentoId); return }
        novaFichaId = data?.id || null
      }

      const okPartes = await salvarPartes(supabase, {
        grupoId: gid, parcelamento: { id: parcelamentoId, descricao: dadosParc.descricao, valor_total: total, num_parcelas: n },
        partes: partesOk, cartao: null, aPartirDe: form.aPartirDe || prox,
      })
      if (!okPartes) toast(copy.dividir.erroSalvar, 'erro')
      else toast(convertendo ? t.virado : tf.salvo, 'ok')
      const virou = !!convertendo
      setForm(null); setEditandoId(null); setConvertendo(null)
      if (virou) setParams(novaFichaId ? { id: novaFichaId } : {}, { replace: true })
      carregar({ silencioso: true })
    } finally {
      setSalvando(false)
    }
  }

  async function apagar(f) {
    if (!confirm(t.confirmarApagar)) return
    const { error } = await run(supabase.from('parcelamentos').delete().eq('id', f.parcelamento_id), { ok: t.apagado })
    if (error) return
    setParams({}, { replace: true })
    carregar({ silencioso: true })
  }

  async function togglePaga(p) {
    const { error } = await run(supabase.from('parcelas').update({ paga: !p.paga }).eq('id', p.id), { ok: p.paga ? t.abertaOk : t.pagaOk })
    if (!error) carregar({ silencioso: true })
  }

  async function mudarValor(f, p, v) {
    if (!(v > 0) || Math.abs(v - Number(p.valor)) < 0.005) return
    const { error } = await run(supabase.from('parcelas').update({ valor: r2(v) }).eq('id', p.id), { ok: t.valorSalvo })
    if (error) return
    const novoTotal = r2(f.parcelamentos.parcelas.reduce((s, x) => s + (x.id === p.id ? r2(v) : Number(x.valor)), 0))
    await supabase.from('parcelamentos').update({ valor_total: novoTotal }).eq('id', f.parcelamento_id)
    carregar({ silencioso: true })
  }

  // ------------------------------------------------ partes da tela
  const nForm = parseInt(form?.num_parcelas) || 0
  const totalForm = form ? r2((numero(form.valor_parcela) || 0) * nForm) : 0
  const baseForm = convertendo || comResumo.find((f) => f.id === editandoId)
  const pessoaForm = baseForm?.parcelamentos?.pessoa_id ? (baseForm.parcelamentos.pessoas?.nome || '') : null

  const formulario = form && (
    <div className="modal-overlay" onClick={() => !salvando && fecharForm()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="fin-form-titulo" onClick={(e) => e.stopPropagation()} style={{ maxHeight: '88vh', overflowY: 'auto' }}>
        <h2 id="fin-form-titulo" style={{ fontSize: 18, marginBottom: 18 }}>{convertendo ? tf.tituloVirar : editandoId ? tf.tituloEditar : tf.tituloNovo}</h2>
        {convertendo && <p style={{ fontSize: 12, color: 'var(--text2)', margin: '-8px 0 14px', lineHeight: 1.4 }}>{tf.avisoVirar}</p>}
        <div className="form-group"><label htmlFor="fin-nome">{tf.nome}</label><input id="fin-nome" value={form.descricao} onChange={set('descricao')} placeholder={tf.nomePh} /></div>
        <div className="form-row">
          <div className="form-group"><label htmlFor="fin-tipo">{tf.tipo}</label>
            <select id="fin-tipo" value={form.tipo} onChange={set('tipo')}>{TIPOS.map((x) => <option key={x} value={x}>{t.tipos[x]}</option>)}</select>
          </div>
          <div className="form-group"><label htmlFor="fin-banco">{tf.banco}</label><input id="fin-banco" value={form.banco} onChange={set('banco')} placeholder={tf.bancoPh} /></div>
        </div>
        <div className="form-row">
          <div className="form-group"><label htmlFor="fin-n">{tf.nParcelas}</label><input id="fin-n" type="number" inputMode="numeric" min="1" max="600" value={form.num_parcelas} onChange={set('num_parcelas')} placeholder="Ex.: 360" /></div>
          <div className="form-group"><label htmlFor="fin-parcela">{form.sistema === 'sac' ? tf.valorParcelaSac : tf.valorParcela}</label><input id="fin-parcela" type="text" inputMode="decimal" value={form.valor_parcela} onChange={set('valor_parcela')} placeholder="0,00" /></div>
        </div>
        <div className="form-row">
          <div className="form-group"><label htmlFor="fin-prox">{tf.proxima}</label><input id="fin-prox" type="number" inputMode="numeric" min="1" max={nForm || undefined} value={form.proxima} onChange={set('proxima')} /></div>
          <div className="form-group"><label htmlFor="fin-data">{tf.venceEm}</label><input id="fin-data" type="date" value={form.data_proxima} onChange={set('data_proxima')} /></div>
        </div>
        <p style={{ fontSize: 11.5, color: 'var(--text2)', margin: '-4px 0 12px' }}>{tf.proximaAjuda} {tf.resumoPagas(Math.max(0, (parseInt(form.proxima) || 1) - 1))}</p>
        <div className="form-group"><label htmlFor="fin-sistema">{tf.sistema}</label>
          <select id="fin-sistema" value={form.sistema} onChange={set('sistema')}>{['price', 'sac', 'fixa'].map((x) => <option key={x} value={x}>{t.sistemas[x]}</option>)}</select>
          {form.sistema === 'sac' && <span style={{ fontSize: 11.5, color: 'var(--text2)', marginTop: 4, display: 'block', lineHeight: 1.4 }}>{tf.resumoSac}</span>}
        </div>
        <div className="form-row">
          <div className="form-group"><label htmlFor="fin-pv">{tf.financiado}</label><input id="fin-pv" type="text" inputMode="decimal" value={form.valor_financiado} onChange={set('valor_financiado')} placeholder="0,00" /></div>
          <div className="form-group"><label htmlFor="fin-entrada">{tf.entrada}</label><input id="fin-entrada" type="text" inputMode="decimal" value={form.entrada} onChange={set('entrada')} placeholder="0,00" /></div>
        </div>
        <p style={{ fontSize: 11.5, color: 'var(--text2)', margin: '-4px 0 12px' }}>{tf.financiadoAjuda}</p>
        <div className="form-row">
          <div className="form-group"><label htmlFor="fin-juros">{tf.juros} (%)</label><input id="fin-juros" type="text" inputMode="decimal" value={form.taxa_valor} onChange={set('taxa_valor')} placeholder={tf.jurosPh} /></div>
          <div className="form-group"><label htmlFor="fin-periodo">&nbsp;</label>
            <select id="fin-periodo" aria-label={tf.juros} value={form.taxa_periodo} onChange={set('taxa_periodo')}><option value="mes">{tf.aoMes}</option><option value="ano">{tf.aoAno}</option></select>
          </div>
        </div>
        <div className="form-row">
          <div className="form-group"><label htmlFor="fin-cat">{tf.categoria}</label>
            <select id="fin-cat" value={form.categoria} onChange={set('categoria')}>
              {!categorias.some((c) => c.nome === form.categoria) && <option value={form.categoria}>{rotuloCategoria(form.categoria)}</option>}
              {categorias.map((c) => <option key={c.nome} value={c.nome}>{c.emoji} {rotuloCategoria(c.nome)}</option>)}
            </select>
          </div>
          <div className="form-group"><label htmlFor="fin-dono">{tf.deQuem}</label>
            <select id="fin-dono" value={form.dono_id} onChange={set('dono_id')}>
              <option value="">{tf.familia}</option>
              {membros.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
            </select>
          </div>
        </div>
        {pessoaForm != null ? (
          <p style={{ fontSize: 12, color: 'var(--amber-text)', margin: '0 0 14px', lineHeight: 1.4 }}>{t.aReceberAjuda(pessoaForm)}</p>
        ) : (
        <div style={{ marginBottom: 14 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: 'var(--text2)' }}>
            <input type="checkbox" checked={!!form.dividir} onChange={set('dividir')} />
            {copy.dividir.marcar}
          </label>
          {form.dividir && (
            <DividirConta total={totalForm} partes={form.partes || []} onChange={(partes) => setForm((f) => ({ ...f, partes }))}
              pessoas={pessoas} onCriar={garantirPessoa} parcelado numParcelas={nForm} aPartirDe={form.aPartirDe || 1}
              onAPartirDe={(k) => setForm((f) => ({ ...f, aPartirDe: k }))} />
          )}
        </div>
        )}
        <div className="form-group"><label htmlFor="fin-obs">{tf.obs}</label><input id="fin-obs" value={form.observacao} onChange={set('observacao')} /></div>
        {editandoId && <p style={{ fontSize: 11.5, color: 'var(--text2)', margin: '0 0 14px', lineHeight: 1.4 }}>{tf.avisoEditar}</p>}
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn-ghost" style={{ flex: 1 }} onClick={fecharForm} disabled={salvando}>{tf.cancelar}</button>
          <button className="btn-primary" style={{ flex: 1, opacity: salvando ? 0.6 : 1 }} onClick={salvar} disabled={salvando}>{salvando ? tf.salvando : tf.salvar}</button>
        </div>
      </div>
    </div>
  )

  // ------------------------------------------------ detalhe
  if (aberto) {
    const f = aberto, r = f.r, Icone = ICONE[f.tipo] || Landmark
    const parcelas = [...f.parcelamentos.parcelas].sort((a, b) => a.numero - b.numero)
    // Lista curta por padrão: as 2 últimas pagas e as 12 próximas (financiamento longo tem 360+).
    const inicioJanela = Math.max(1, (r.proxima?.numero || r.n) - 2)
    const anual = r.taxaMensal != null ? Math.pow(1 + r.taxaMensal, 12) - 1 : null
    const linha = (rotulo, valor, destaque) => (
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 13, padding: '7px 0', borderBottom: '1px solid var(--border)' }}>
        <span style={{ color: 'var(--text2)' }}>{rotulo}</span><strong style={destaque ? { color: 'var(--accent-text)' } : undefined}>{valor}</strong>
      </div>
    )
    return (
      <div>
        <button onClick={() => setParams({}, { replace: false })} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, color: 'var(--text2)', marginBottom: 12, minHeight: 36 }}>
          <ChevronLeft size={16} /> {t.voltar}
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <Icone size={24} strokeWidth={1.75} color="var(--accent-text)" aria-hidden="true" />
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 style={{ fontSize: 20 }}>{f.parcelamentos.descricao}</h2>
            <p style={{ fontSize: 12, color: 'var(--text2)' }}>{[t.tipos[f.tipo], f.banco, t.sistemaCurto[f.sistema], nomeMembro(f.dono_id) ? t.deQuem(nomeMembro(f.dono_id)) : t.daFamilia].filter(Boolean).join(' · ')}</p>
            {f.parcelamentos.pessoa_id && <p style={{ fontSize: 12, color: 'var(--amber-text)', marginTop: 2 }}>{t.aReceber(f.parcelamentos.pessoas?.nome)}</p>}
          </div>
          <button onClick={() => abrirEdicao(f)} aria-label={t.editar} title={t.editar} style={{ padding: 8, color: 'var(--text2)' }}><Pencil size={18} /></button>
          <button onClick={() => apagar(f)} aria-label={t.apagar} title={t.apagar} style={{ padding: 8, color: 'var(--red)' }}><Trash2 size={18} /></button>
        </div>

        <div className="card" style={{ marginBottom: 14 }}>
          <p style={{ fontSize: 12, color: 'var(--text2)' }}>{r.base === 'juros' ? t.numeros.saldo : t.numeros.saldoSoma}</p>
          <p style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 28, margin: '2px 0 10px' }}>{fmt(r.saldo)}</p>
          <div style={{ background: 'var(--bg3)', borderRadius: 4, height: 8, overflow: 'hidden' }} role="progressbar" aria-valuenow={r.progresso} aria-valuemin={0} aria-valuemax={100} aria-label={t.progresso(r.pagas, r.n)}>
            <div style={{ width: `${r.progresso}%`, height: '100%', background: 'var(--accent)', borderRadius: 4 }} />
          </div>
          <p style={{ fontSize: 12, color: 'var(--text2)', marginTop: 6 }}>
            {t.progresso(r.pagas, r.n)}{r.ultima ? ` · ${t.termina(mesAno(r.ultima.data_vencimento))}` : ''}
            {r.atrasadas > 0 && <span style={{ color: 'var(--red)' }}> · {t.atrasadas(r.atrasadas)}</span>}
          </p>
          <p style={{ fontSize: 11.5, color: 'var(--text2)', marginTop: 10, lineHeight: 1.4 }}>{r.base === 'juros' ? t.avisoSaldo : t.avisoSoma}</p>
        </div>

        <div className="card" style={{ marginBottom: 14 }}>
          {r.proxima && linha(t.proxima, `${fmt(r.proxima.valor)} · ${fmtData(r.proxima.data_vencimento, 'dd/MM')}`)}
          {linha(t.numeros.pagasRestantes, `${r.pagas} × ${r.restantes}`)}
          {linha(t.numeros.faltaPagar, fmt(r.faltaPagar))}
          {linha(t.numeros.jaPago, fmt(r.jaPago))}
          {f.valor_financiado != null && linha(t.numeros.financiado, fmt(f.valor_financiado))}
          {f.entrada != null && linha(t.numeros.entrada, fmt(f.entrada))}
          {r.taxaMensal != null && r.taxaMensal > 0 && linha(r.jurosEstimados ? t.numeros.jurosEstimados : t.numeros.juros, t.taxaTexto(pct(r.taxaMensal), pct(anual)))}
          {r.ultima && linha(t.numeros.ultima, fmtData(r.ultima.data_vencimento, 'dd/MM/yyyy'))}
          {f.observacao && <p style={{ fontSize: 12, color: 'var(--text2)', marginTop: 10 }}>{f.observacao}</p>}
        </div>

        {!r.quitado && <Simulador resumo={r} sistema={f.sistema} />}

        <div className="card" style={{ marginBottom: 14 }}>
          <button onClick={() => setVerParcelas((v) => !v)} aria-expanded={verParcelas} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', minHeight: 36 }}>
            <span style={{ fontFamily: 'Syne', fontWeight: 600, fontSize: 15 }}>{t.parcelas}</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--accent-text)' }}>
              {verParcelas ? t.ocultarParcelas : t.verParcelas} {verParcelas ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </span>
          </button>
          {verParcelas && (
            <div style={{ marginTop: 8 }}>
              {(todasParcelas ? parcelas : parcelas.filter((p) => p.numero >= inicioJanela && p.numero < inicioJanela + 14)).map((p) =>
                <LinhaParcela key={p.id} p={p} total={r.n} onToggle={togglePaga} onValor={(pp, v) => mudarValor(f, pp, v)} />)}
              {!todasParcelas && parcelas.length > 14 && (
                <button onClick={() => setTodasParcelas(true)} style={{ marginTop: 10, fontSize: 12, color: 'var(--accent-text)', minHeight: 36 }}>{t.todasParcelas(parcelas.length)}</button>
              )}
            </div>
          )}
        </div>
        {formulario}
      </div>
    )
  }

  // ------------------------------------------------ lista
  const ativos = comResumo.filter((f) => !f.r.quitado)
  const quitados = comResumo.filter((f) => f.r.quitado)
  const totalFalta = ativos.reduce((s, f) => s + f.r.faltaPagar, 0)
  const cartao = (f) => {
    const r = f.r, Icone = ICONE[f.tipo] || Landmark
    return (
      <button key={f.id} className="card" onClick={() => setParams({ id: f.id })} aria-label={`${f.parcelamentos.descricao} — ${t.abrir}`}
        style={{ display: 'block', width: '100%', textAlign: 'left', marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <Icone size={22} strokeWidth={1.75} color="var(--accent-text)" aria-hidden="true" />
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontWeight: 600, fontSize: 15 }}>{f.parcelamentos.descricao}</p>
            <p style={{ fontSize: 12, color: 'var(--text2)' }}>{[f.banco || t.tipos[f.tipo], nomeMembro(f.dono_id) ? t.deQuem(nomeMembro(f.dono_id)) : null].filter(Boolean).join(' · ')}</p>
            {f.parcelamentos.pessoa_id && <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--amber-text)', marginTop: 2 }}>{t.aReceber(f.parcelamentos.pessoas?.nome)}</p>}
          </div>
          <span aria-hidden="true" style={{ fontSize: 18 }}>{emojiDe(f.parcelamentos.categoria)}</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, fontSize: 12, marginBottom: 10 }}>
          <div><span style={{ color: 'var(--text2)' }}>{t.parcela}</span><br /><strong>{fmt(r.parcelaRef)}</strong></div>
          <div><span style={{ color: 'var(--text2)' }}>{r.quitado ? t.quitado : t.saldo}</span><br /><strong style={{ color: r.quitado ? 'var(--text)' : 'var(--amber-text)' }}>{r.quitado ? '✓' : fmt(r.saldo)}</strong></div>
          <div><span style={{ color: 'var(--text2)' }}>{t.parcelas}</span><br /><strong>{r.pagas}/{r.n}</strong></div>
        </div>
        <div style={{ background: 'var(--bg3)', borderRadius: 4, height: 6, overflow: 'hidden' }}>
          <div style={{ width: `${r.progresso}%`, height: '100%', background: r.quitado ? 'var(--accent)' : 'var(--blue)', borderRadius: 4 }} />
        </div>
        <p style={{ fontSize: 11, color: r.atrasadas ? 'var(--red)' : 'var(--text2)', marginTop: 8 }}>
          {r.atrasadas ? t.atrasadas(r.atrasadas) : r.proxima ? `${t.proxima}: ${fmtData(r.proxima.data_vencimento, "dd 'de' MMM")}` : ''}
          {r.ultima && !r.quitado ? ` · ${t.termina(mesAno(r.ultima.data_vencimento))}` : ''}
        </p>
      </button>
    )
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 6 }}>
        <h2 style={{ fontSize: 20 }}>{t.titulo}</h2>
        <button className="btn-primary" onClick={abrirNovo} style={{ display: 'flex', alignItems: 'center', gap: 6, minHeight: 40, padding: '0 14px' }}>
          <Plus size={16} /> {t.novo}
        </button>
      </div>
      <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 16 }}>{t.sub}</p>

      {loading ? <div className="empty-state">{t.carregando}</div> : comResumo.length === 0 ? (
        <div className="empty-state"><p>{t.vazio}</p><p style={{ fontSize: 12, marginTop: 6 }}>{t.vazioSub}</p></div>
      ) : (
        <>
          {ativos.length > 0 && (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
                <span style={{ fontSize: 13, fontWeight: 600, fontFamily: 'Syne' }}>{t.emAndamento}</span>
                <span style={{ fontSize: 12, color: 'var(--text2)' }}>{t.faltaTotal(fmt(totalFalta))}</span>
              </div>
              {ativos.map(cartao)}
            </>
          )}
          {quitados.length > 0 && (
            <>
              <p style={{ fontSize: 13, fontWeight: 600, fontFamily: 'Syne', margin: '20px 0 10px' }}>{t.quitados}</p>
              {quitados.map(cartao)}
            </>
          )}
        </>
      )}
      {formulario}
    </div>
  )
}
