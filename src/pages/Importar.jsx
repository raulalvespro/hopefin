import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useDb } from '../hooks/useDb'
import { useToast } from '../contexts/ToastContext'
import { useCategorias, rotuloCategoria } from '../hooks/useCategorias'
import { supabase } from '../lib/supabase'
import { limparLeituras } from '../lib/cacheLeitura'
import { fmt, fmtData, hojeISO } from '../lib/format'
import { vencimentoDaComp, addMeses, compDe } from '../lib/motor'
import {
  DESTINOS, classificarLinha, sinalDasCompras, ajusteParaFatura, faturaProvavel, faturaDaData,
  chaveRepetido, chaveFatura, montarJaLancados, parecePagamentoDeFatura,
} from '../lib/importar'
import { copy } from '../copy/pt-BR'
import { ChevronLeft, ChevronRight, Upload, FileSpreadsheet, Check, AlertCircle } from 'lucide-react'

const ti = copy.importar

// ---- Parsing ----
function detectarDelim(linha) {
  const cand = [';', ',', '\t']
  return cand.map(d => [d, (linha.split(d).length)]).sort((a, b) => b[1] - a[1])[0][0]
}

// Parse simples de uma linha CSV com suporte a aspas.
function parseLinha(linha, delim) {
  const out = []
  let cur = '', dentro = false
  for (let i = 0; i < linha.length; i++) {
    const ch = linha[i]
    if (ch === '"') {
      if (dentro && linha[i + 1] === '"') { cur += '"'; i++ }
      else dentro = !dentro
    } else if (ch === delim && !dentro) { out.push(cur); cur = '' }
    else cur += ch
  }
  out.push(cur)
  return out.map(c => c.trim())
}

function parseValor(s) {
  if (s == null) return NaN
  let t = String(s).replace(/R\$/gi, '').replace(/\s/g, '')
  if (t === '') return NaN
  const neg = /^\(.*\)$/.test(t)
  t = t.replace(/[()]/g, '')
  if (t.includes(',') && t.includes('.')) t = t.replace(/\./g, '').replace(',', '.')
  else if (t.includes(',')) t = t.replace(',', '.')
  const n = Number(t)
  return Number.isNaN(n) ? NaN : (neg ? -n : n)
}

function parseData(s) {
  const t = String(s || '').trim()
  let m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/)
  if (m) { let [, d, mo, y] = m; if (y.length === 2) y = '20' + y; return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}` }
  m = t.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m) return `${m[1]}-${m[2]}-${m[3]}`
  return null
}

const ehNum = s => !Number.isNaN(parseValor(s))
const ehData = s => parseData(s) != null

// Busca tudo de uma consulta, em páginas de 1000 (o máximo que o Supabase devolve por vez).
async function buscarTudo(montar) {
  const out = []
  for (let de = 0; ; de += 1000) {
    const { data, error } = await montar().range(de, de + 999)
    if (error) throw error
    out.push(...(data || []))
    if (!data || data.length < 1000) return out
  }
}

export default function Importar() {
  const { perfil } = useAuth()
  const run = useDb()
  const { toast } = useToast()
  const { categorias } = useCategorias()
  const navigate = useNavigate()
  const inputRef = useRef(null)

  const [celulas, setCelulas] = useState(null)   // string[][] todas as linhas
  const [temCabecalho, setTemCabecalho] = useState(true)
  const [cols, setCols] = useState({ data: 0, desc: 1, valor: 2 })
  const [catPadrao, setCatPadrao] = useState('outros')
  const [overrides, setOverrides] = useState({})  // idx -> { incluir?, categoria? }
  const [importando, setImportando] = useState(false)
  // Como os gastos importados foram pagos: 'pix' | 'dinheiro' | id de um cartão.
  // (Antes tudo entrava como "cartão" sem dizer qual — e o app tratava como pago na hora.)
  const [pagoCom, setPagoCom] = useState('pix')
  const [cartoes, setCartoes] = useState([])
  // A4.1: o que é o arquivo e, se for fatura de cartão, de qual cartão e em qual fatura entra.
  const [destino, setDestino] = useState('extrato')
  const [cartaoId, setCartaoId] = useState('')
  const [sinalManual, setSinalManual] = useState(null)        // null = descobre pelo arquivo
  const [modoFatura, setModoFatura] = useState('uma')          // 'uma' (todas numa fatura) | 'data'
  const [faturaEscolhida, setFaturaEscolhida] = useState(null) // null = a provável do arquivo
  const [jaNoApp, setJaNoApp] = useState({ gastos: [], entradas: [], parcelas: [], assinaturas: [] })

  useEffect(() => {
    if (!perfil?.grupo_id) return
    supabase.from('cartoes').select('id, nome, dia_fechamento, dia_vencimento, compra_no_fechamento')
      .eq('grupo_id', perfil.grupo_id).eq('ativo', true).order('nome')
      .then(({ data }) => setCartoes(data || []))
  }, [perfil?.grupo_id])

  function escolherArquivo() { inputRef.current?.click() }

  // Gera um CSV-modelo no formato que o app lê melhor.
  function baixarModelo() {
    const linhas = [
      'Data;Descrição;Valor',
      '05/11/2026;Supermercado;-345,90',
      '06/11/2026;Salário;5000,00',
      '07/11/2026;Posto de combustível;-220,00',
      '10/11/2026;Farmácia;-89,50',
    ]
    const csv = '﻿' + linhas.join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'modelo-hopefin.csv'
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
    toast('Modelo CSV baixado', 'ok')
  }

  function aoSelecionar(e) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const texto = String(reader.result || '')
      const linhas = texto.split(/\r?\n/).filter(l => l.trim() !== '')
      if (!linhas.length) { toast('Arquivo vazio.', 'erro'); return }
      const delim = detectarDelim(linhas[0])
      const grade = linhas.map(l => parseLinha(l, delim))
      const nCols = Math.max(...grade.map(r => r.length))
      // adivinha colunas pela maioria das linhas (ignorando a 1ª, que pode ser cabeçalho)
      const amostra = grade.slice(1).length ? grade.slice(1) : grade
      const score = (teste) => Array.from({ length: nCols }, (_, c) =>
        amostra.filter(r => teste(r[c])).length)
      const scData = score(ehData)
      const scNum = score(ehNum)
      const colData = scData.indexOf(Math.max(...scData))
      let colValor = scNum.indexOf(Math.max(...scNum))
      if (colValor === colData) { scNum[colValor] = -1; colValor = scNum.indexOf(Math.max(...scNum)) }
      let colDesc = [...Array(nCols).keys()].find(c => c !== colData && c !== colValor)
      if (colDesc == null) colDesc = Math.min(1, nCols - 1)
      const cab = !ehNum(grade[0][colValor]) // 1ª linha não-numérica no valor => cabeçalho
      setCelulas(grade)
      setCols({ data: colData, desc: colDesc, valor: colValor })
      setTemCabecalho(cab)
      setOverrides({})
      setSinalManual(null); setFaturaEscolhida(null)
    }
    reader.onerror = () => toast('Não foi possível ler o arquivo.', 'erro')
    reader.readAsText(file, 'utf-8')
    e.target.value = ''
  }

  const cabecalho = useMemo(() => (celulas && temCabecalho ? celulas[0] : null), [celulas, temCabecalho])
  const nCols = celulas ? Math.max(...celulas.map(r => r.length)) : 0

  // Linhas lidas do arquivo (data, descrição, valor), antes de decidir pra onde vão.
  const base = useMemo(() => {
    if (!celulas) return []
    const corpo = temCabecalho ? celulas.slice(1) : celulas
    return corpo.map((r, i) => {
      const data = parseData(r[cols.data])
      const valorNum = parseValor(r[cols.valor])
      const descricao = (r[cols.desc] || '').slice(0, 120) || 'Sem descrição'
      return { i, data, valorNum, descricao, legivel: !!data && !Number.isNaN(valorNum) }
    })
  }, [celulas, temCabecalho, cols])

  const emCartao = destino === 'cartao'
  const cartao = cartoes.find(c => c.id === cartaoId) || null
  const sinalAuto = useMemo(() => sinalDasCompras(base.filter(l => l.legivel).map(l => l.valorNum)), [base])
  const sinal = sinalManual ?? sinalAuto
  const faturaAuto = useMemo(() => (cartao
    ? faturaProvavel(cartao, base.filter(l => l.legivel && Math.sign(l.valorNum) === sinal).map(l => l.data))
    : null), [cartao, base, sinal])
  const faturaAlvo = faturaEscolhida ?? faturaAuto

  // Faturas em jogo (pra achar parcela/assinatura do cartão que já está no app).
  const comps = useMemo(() => {
    if (!emCartao || !cartao) return []
    if (modoFatura === 'uma') return faturaAlvo ? [faturaAlvo] : []
    return [...new Set(base.filter(l => l.legivel).map(l => faturaDaData(cartao, l.data)))].sort()
  }, [emCartao, cartao, modoFatura, faturaAlvo, base])

  // O que já está lançado no período do arquivo (pra marcar repetidos).
  const faixa = useMemo(() => {
    const ds = base.filter(l => l.legivel).map(l => l.data).sort()
    return ds.length ? { de: ds[0], ate: ds[ds.length - 1] } : null
  }, [base])
  useEffect(() => {
    const gid = perfil?.grupo_id
    if (!gid || !faixa) return
    let vivo = true
    // Pra não importar repetido, compara com o banco de AGORA (sem a memória das abas).
    limparLeituras()
    ;(async () => {
      try {
        // parcelas: faturas que vencem do mês da 1ª compra até 4 meses depois da última (cobre o ‹ ›)
        const ini = `${compDe(faixa.de)}-01`
        const fim = `${addMeses(compDe(faixa.ate), 4)}-01`
        const [gastos, entradas, parcelas, assinaturas] = await Promise.all([
          buscarTudo(() => supabase.from('gastos').select('data, valor').eq('grupo_id', gid).gte('data', faixa.de).lte('data', faixa.ate)),
          buscarTudo(() => supabase.from('entradas').select('data, valor').eq('grupo_id', gid).gte('data', faixa.de).lte('data', faixa.ate)),
          buscarTudo(() => supabase.from('parcelas').select('valor, data_vencimento, parcelamentos!inner(cartao_id)').eq('grupo_id', gid).gte('data_vencimento', ini).lt('data_vencimento', fim)),
          buscarTudo(() => supabase.from('assinaturas').select('cartao_id, valor, dia_cobranca, cobrada_desde, criado_em, ativo, cancelada_em').eq('grupo_id', gid)),
        ])
        if (vivo) setJaNoApp({ gastos, entradas, parcelas, assinaturas })
      } catch (err) {
        console.error('[importar] não deu pra conferir o que já está lançado:', err?.message || err)
      }
    })()
    return () => { vivo = false }
  }, [perfil?.grupo_id, faixa?.de, faixa?.ate]) // eslint-disable-line react-hooks/exhaustive-deps

  const jaLancados = useMemo(
    () => montarJaLancados({ ...jaNoApp, cartao: emCartao ? cartao : null, comps }),
    [jaNoApp, emCartao, cartao, comps],
  )

  // Linhas derivadas conforme o mapeamento e o destino atuais.
  const linhas = useMemo(() => base.map(l => {
    const cls = l.legivel ? classificarLinha(l.valorNum, destino, sinal) : { tipo: null }
    const valido = l.legivel && !!cls.tipo
    const comp = valido && emCartao && cartao ? (modoFatura === 'uma' ? faturaAlvo : faturaDaData(cartao, l.data)) : null
    const repetido = valido && (cls.tipo === 'entrada'
      ? jaLancados.entradas.has(chaveRepetido(l.data, l.valorNum))
      : jaLancados.gastos.has(chaveRepetido(l.data, l.valorNum)) || (comp != null && jaLancados.fatura.has(chaveFatura(comp, l.valorNum))))
    // No extrato, a linha que paga a fatura do cartão não é gasto novo (as compras já contam pela fatura).
    const pagFatura = valido && cls.tipo === 'gasto' && !emCartao && parecePagamentoDeFatura(l.descricao)
    const ov = overrides[l.i] || {}
    return {
      ...l, tipo: cls.tipo, fora: l.legivel ? cls.fora || null : null, valido, repetido, pagFatura,
      incluir: valido && (ov.incluir !== undefined ? ov.incluir : !repetido && !pagFatura),
      categoria: ov.categoria || catPadrao,
    }
  }), [base, destino, sinal, emCartao, cartao, modoFatura, faturaAlvo, jaLancados, overrides, catPadrao])

  const selecionadas = linhas.filter(l => l.incluir && l.valido)
  const totalGasto = selecionadas.filter(l => l.tipo === 'gasto').reduce((s, l) => s + Math.abs(l.valorNum), 0)
  const totalEntrada = selecionadas.filter(l => l.tipo === 'entrada').reduce((s, l) => s + Math.abs(l.valorNum), 0)
  const nFora = linhas.filter(l => l.fora === 'pagamento').length
  const nRepetidos = linhas.filter(l => l.repetido).length
  const nPagFatura = linhas.filter(l => l.pagFatura).length

  function setOv(i, patch) { setOverrides(o => ({ ...o, [i]: { ...o[i], ...patch } })) }

  function escolherDestino(d) {
    setDestino(d)
    // "Só gastos" é à vista: se estava num cartão (opção do extrato), volta pro Pix.
    if (d === 'gastos' && pagoCom !== 'pix' && pagoCom !== 'dinheiro') setPagoCom('pix')
  }

  async function importar() {
    if (!selecionadas.length) { toast('Nada selecionado para importar.', 'erro'); return }
    if (emCartao && (!cartao || !faturaAlvo)) { toast(ti.escolhaOCartao, 'erro'); return }
    setImportando(true)
    const gid = perfil.grupo_id
    const hoje = hojeISO()
    const gastos = selecionadas.filter(l => l.tipo === 'gasto').map(l => {
      const g = {
        grupo_id: gid, usuario_id: perfil.id, descricao: l.descricao,
        valor: Math.abs(l.valorNum), categoria: l.categoria, data: l.data,
      }
      if (emCartao) {
        return { ...g, tipo_pagamento: 'cartao', cartao_id: cartao.id, fatura_ajuste: modoFatura === 'uma' ? ajusteParaFatura(cartao, l.data, faturaAlvo) : 0 }
      }
      if (destino === 'gastos') return { ...g, tipo_pagamento: pagoCom === 'dinheiro' ? 'dinheiro' : 'pix', cartao_id: null }
      const ehDinheiro = pagoCom === 'pix' || pagoCom === 'dinheiro'
      return { ...g, tipo_pagamento: ehDinheiro ? pagoCom : 'cartao', cartao_id: ehDinheiro ? null : pagoCom }
    })
    const entradas = selecionadas.filter(l => l.tipo === 'entrada').map(l => ({
      grupo_id: gid, usuario_id: perfil.id, descricao: l.descricao,
      valor: Math.abs(l.valorNum), tipo: 'avulso', data: l.data,
      recebido: l.data <= hoje, // do extrato: já caiu na conta (antes entrava "a receber")
    }))
    let ok = true
    if (gastos.length) { const { error } = await run(supabase.from('gastos').insert(gastos)); if (error) ok = false }
    if (ok && entradas.length) { const { error } = await run(supabase.from('entradas').insert(entradas)); if (error) ok = false }
    setImportando(false)
    if (ok) {
      toast(ti.importados(selecionadas.length), 'ok')
      navigate(destino === 'entradas' ? '/entradas' : '/gastos')
    }
  }

  const opcoesCol = Array.from({ length: nCols }, (_, c) => ({
    v: c, label: cabecalho ? (cabecalho[c] || `Coluna ${c + 1}`) : `Coluna ${c + 1}`,
  }))

  const chip = (marcado) => ({
    padding: '10px 12px', borderRadius: 'var(--radius-sm)', textAlign: 'left', minHeight: 44,
    border: `1px solid ${marcado ? 'var(--accent)' : 'var(--border)'}`,
    background: marcado ? 'var(--accent-dim)' : 'transparent',
  })
  const vencAlvo = cartao && faturaAlvo ? fmtData(vencimentoDaComp(cartao, faturaAlvo)) : ''

  return (
    <div>
      <Link to="/gastos" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--text2)', fontSize: 13, marginBottom: 16, textDecoration: 'none' }}>
        <ChevronLeft size={16} /> Gastos
      </Link>
      <h2 style={{ fontSize: 20, marginBottom: 8 }}>Importar extrato (CSV)</h2>
      <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 20, lineHeight: 1.6 }}>
        Exporte o extrato do seu banco ou a fatura do cartão em CSV e solte aqui. O HopeFin tenta
        reconhecer data, descrição e valor — você diz o que é o arquivo e confere antes de importar.
      </p>

      <input ref={inputRef} type="file" accept=".csv,text/csv,text/plain" onChange={aoSelecionar} style={{ display: 'none' }} />

      {!celulas ? (
        <>
          <button onClick={escolherArquivo} className="card" style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '36px 20px', border: '1.5px dashed var(--border2)', background: 'var(--bg2)', color: 'var(--text2)', marginBottom: 16 }}>
            <Upload size={28} color="var(--accent)" />
            <span style={{ fontWeight: 600, color: 'var(--text)' }}>Escolher arquivo CSV</span>
            <span style={{ fontSize: 12 }}>Aceita separador ; , ou tabulação</span>
          </button>

          {/* Como preparar o arquivo */}
          <div className="card">
            <p style={{ fontWeight: 600, fontFamily: 'Syne', fontSize: 14, marginBottom: 8 }}>Para o app entender bem</p>
            <p style={{ fontSize: 12.5, color: 'var(--text2)', lineHeight: 1.6, marginBottom: 12 }}>
              O ideal é um CSV com três colunas nesta ordem: <strong>Data</strong>, <strong>Descrição</strong> e <strong>Valor</strong>.
              Quase todo banco e cartão exporta extrato em CSV pelo app ou site — é só baixar e enviar aqui.
            </p>
            <ul style={{ fontSize: 12.5, color: 'var(--text2)', lineHeight: 1.7, paddingLeft: 18, margin: '0 0 14px' }}>
              <li><strong>Data</strong> no formato <code>dd/mm/aaaa</code> (ex: 05/11/2026)</li>
              <li><strong>Valor</strong> com vírgula nos centavos (ex: 1.234,56)</li>
              <li>No <strong>extrato da conta</strong>, negativo vira gasto e positivo vira entrada (ex: -89,50). <strong>Fatura de cartão</strong>, só gastos ou só entradas: você escolhe na próxima etapa</li>
              <li>A 1ª linha pode ser o cabeçalho — o app detecta sozinho</li>
            </ul>
            <button onClick={baixarModelo} className="btn-ghost" style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <FileSpreadsheet size={16} /> Baixar modelo CSV
            </button>
            <p style={{ fontSize: 11, color: 'var(--text2)', marginTop: 10, textAlign: 'center' }}>
              Se o seu extrato vier com outras colunas, dá pra ajustar o que é o quê na próxima etapa.
            </p>
          </div>
        </>
      ) : (
        <>
          {/* Mapeamento */}
          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <FileSpreadsheet size={16} color="var(--accent)" />
              <p style={{ fontWeight: 600, fontFamily: 'Syne', fontSize: 14 }}>Como ler o arquivo</p>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 12 }}>
              {[['data', 'Data'], ['desc', 'Descrição'], ['valor', 'Valor']].map(([k, label]) => (
                <div key={k} className="form-group" style={{ marginBottom: 0 }}>
                  <label>{label}</label>
                  <select value={cols[k]} onChange={e => setCols(c => ({ ...c, [k]: Number(e.target.value) }))}>
                    {opcoesCol.map(o => <option key={o.v} value={o.v}>{o.label}</option>)}
                  </select>
                </div>
              ))}
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text2)', marginBottom: destino === 'entradas' ? 0 : 12 }}>
              <input type="checkbox" checked={temCabecalho} onChange={e => setTemCabecalho(e.target.checked)} style={{ width: 'auto' }} />
              A primeira linha é cabeçalho
            </label>
            {destino !== 'entradas' && (
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Categoria padrão dos gastos</label>
                <select value={catPadrao} onChange={e => setCatPadrao(e.target.value)}>
                  {categorias.map(c => <option key={c.nome} value={c.nome}>{c.emoji} {rotuloCategoria(c.nome)}</option>)}
                </select>
              </div>
            )}
          </div>

          {/* O que é o arquivo (A4.1) */}
          <div className="card" style={{ marginBottom: 16 }}>
            <p style={{ fontWeight: 600, fontFamily: 'Syne', fontSize: 14, marginBottom: 12 }}>{ti.oQueE}</p>
            <div role="radiogroup" aria-label={ti.oQueE} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14 }}>
              {DESTINOS.map(d => {
                const [titulo, dica] = ti.destinos[d]
                const marcado = destino === d
                return (
                  <button key={d} type="button" role="radio" aria-checked={marcado} onClick={() => escolherDestino(d)} style={chip(marcado)}>
                    <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: marcado ? 'var(--accent-text)' : 'var(--text)' }}>{titulo}</span>
                    <span style={{ display: 'block', fontSize: 11, color: 'var(--text2)', lineHeight: 1.35, marginTop: 2 }}>{dica}</span>
                  </button>
                )
              })}
            </div>

            {(destino === 'extrato' || destino === 'gastos') && (
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Os gastos foram pagos com</label>
                <select value={pagoCom} onChange={e => setPagoCom(e.target.value)}>
                  <option value="pix">PIX / débito / transferência</option>
                  <option value="dinheiro">Dinheiro</option>
                  {destino === 'extrato' && cartoes.map(c => <option key={c.id} value={c.id}>Cartão · {c.nome}</option>)}
                </select>
                {destino === 'extrato' && (
                  <span style={{ fontSize: 11, color: 'var(--text2)', marginTop: 4, display: 'block', lineHeight: 1.4 }}>
                    Escolhendo um cartão, cada gasto cai na fatura certa pela data da compra.
                  </span>
                )}
              </div>
            )}

            {destino === 'entradas' && (
              <p style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.45, margin: 0 }}>{ti.entradasRecebidas}</p>
            )}

            {emCartao && (
              <>
                <div className="form-group">
                  <label>{ti.qualCartao}</label>
                  {cartoes.length ? (
                    <select value={cartaoId} onChange={e => { setCartaoId(e.target.value); setFaturaEscolhida(null) }}>
                      <option value="">{ti.escolhaCartao}</option>
                      {cartoes.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                    </select>
                  ) : (
                    <p style={{ fontSize: 12.5, color: 'var(--amber-text)', margin: 0 }}>
                      {ti.semCartao} <Link to="/cartoes" style={{ color: 'var(--accent-text)' }}>Cartões</Link>
                    </p>
                  )}
                </div>
                <div className="form-group">
                  <label>{ti.comprasVemComo}</label>
                  <div role="radiogroup" aria-label={ti.comprasVemComo} style={{ display: 'flex', gap: 8 }}>
                    {[[1, ti.positivas], [-1, ti.negativas]].map(([v, rotulo]) => (
                      <button key={v} type="button" role="radio" aria-checked={sinal === v} onClick={() => setSinalManual(v)}
                        style={{ ...chip(sinal === v), flex: 1, textAlign: 'center', fontSize: 13, fontWeight: 600, color: sinal === v ? 'var(--accent-text)' : 'var(--text2)' }}>
                        {rotulo}
                      </button>
                    ))}
                  </div>
                </div>
                {cartao && faturaAlvo && (
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label>{ti.emQualFatura}</label>
                    <div role="radiogroup" aria-label={ti.emQualFatura} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <div style={{ ...chip(modoFatura === 'uma'), display: 'flex', alignItems: 'center', gap: 6, padding: '6px 6px 6px 12px' }}>
                        <button type="button" role="radio" aria-checked={modoFatura === 'uma'} onClick={() => setModoFatura('uma')}
                          style={{ flex: 1, textAlign: 'left', fontSize: 13, fontWeight: 600, color: modoFatura === 'uma' ? 'var(--accent-text)' : 'var(--text2)', minHeight: 32 }}>
                          {ti.todasNaFatura(vencAlvo)}
                        </button>
                        <button type="button" aria-label={ti.faturaAnterior} onClick={() => { setModoFatura('uma'); setFaturaEscolhida(addMeses(faturaAlvo, -1)) }}
                          style={{ minWidth: 36, minHeight: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text2)' }}><ChevronLeft size={18} /></button>
                        <button type="button" aria-label={ti.proximaFatura} onClick={() => { setModoFatura('uma'); setFaturaEscolhida(addMeses(faturaAlvo, 1)) }}
                          style={{ minWidth: 36, minHeight: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text2)' }}><ChevronRight size={18} /></button>
                      </div>
                      <button type="button" role="radio" aria-checked={modoFatura === 'data'} onClick={() => setModoFatura('data')}
                        style={{ ...chip(modoFatura === 'data'), fontSize: 13, fontWeight: 600, color: modoFatura === 'data' ? 'var(--accent-text)' : 'var(--text2)' }}>
                        {ti.pelaData}
                      </button>
                    </div>
                    <span style={{ fontSize: 11, color: 'var(--text2)', marginTop: 6, display: 'block', lineHeight: 1.4 }}>{ti.dicaFatura}</span>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Resumo */}
          <div className="card" style={{ marginBottom: (nFora && emCartao) || nRepetidos || nPagFatura ? 8 : 16, display: 'flex', justifyContent: 'space-around', textAlign: 'center' }}>
            <div>
              <p style={{ fontSize: 11, color: 'var(--text2)' }}>Selecionados</p>
              <p style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 18 }}>{selecionadas.length}</p>
            </div>
            <div>
              <p style={{ fontSize: 11, color: 'var(--text2)' }}>Gastos</p>
              <p style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 18, color: 'var(--red-text)' }}>{fmt(totalGasto)}</p>
            </div>
            <div>
              <p style={{ fontSize: 11, color: 'var(--text2)' }}>Entradas</p>
              <p style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 18, color: 'var(--accent-text)' }}>{fmt(totalEntrada)}</p>
            </div>
          </div>
          {((nFora > 0 && emCartao) || nRepetidos > 0 || nPagFatura > 0) && (
            <div role="status" style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.5, marginBottom: 16, padding: '0 4px' }}>
              {nFora > 0 && emCartao && <p style={{ margin: 0 }}>{ti.resumoFora(nFora)}</p>}
              {nPagFatura > 0 && <p style={{ margin: 0, color: 'var(--amber-text)' }}>{ti.resumoPagFatura(nPagFatura)}</p>}
              {nRepetidos > 0 && <p style={{ margin: 0, color: 'var(--amber-text)' }}>{ti.resumoRepetidos(nRepetidos)}</p>}
            </div>
          )}

          {/* Prévia */}
          <p style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 8 }}>
            Prévia ({linhas.length} linhas{linhas.length > 80 ? ' · mostrando as 80 primeiras' : ''})
          </p>
          <div style={{ marginBottom: 90 }}>
            {linhas.slice(0, 80).map(l => (
              <div key={l.i} className="card" style={{ marginBottom: 6, padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 10, opacity: l.valido ? 1 : 0.55 }}>
                <input type="checkbox" checked={l.incluir} disabled={!l.valido} onChange={e => setOv(l.i, { incluir: e.target.checked })} aria-label={`Importar ${l.descricao}`} style={{ width: 'auto', flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{l.descricao}</p>
                  <p style={{ fontSize: 11, color: 'var(--text2)', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    {!l.legivel
                      ? <span style={{ color: 'var(--red-text)', display: 'inline-flex', alignItems: 'center', gap: 3 }}><AlertCircle size={11} /> linha inválida</span>
                      : fmtData(l.data)}
                    {l.fora === 'pagamento' && emCartao && <span>· {ti.foraPagamento}</span>}
                    {l.fora === 'zero' && <span>· {ti.foraZero}</span>}
                    {l.pagFatura && <span style={{ color: 'var(--amber-text)' }}>· {ti.pagamentoFatura}</span>}
                    {l.repetido && <span style={{ color: 'var(--amber-text)' }}>· {ti.jaLancado}</span>}
                    {l.valido && l.tipo === 'gasto' && (
                      <select value={l.categoria} onChange={e => setOv(l.i, { categoria: e.target.value })} onClick={e => e.stopPropagation()}
                        style={{ fontSize: 11, padding: '1px 4px', width: 'auto', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text2)' }}>
                        {categorias.map(c => <option key={c.nome} value={c.nome}>{c.emoji} {rotuloCategoria(c.nome)}</option>)}
                      </select>
                    )}
                  </p>
                </div>
                <span style={{ fontSize: 13, fontWeight: 700, fontFamily: 'Syne', color: !l.valido ? 'var(--text2)' : l.tipo === 'entrada' ? 'var(--accent-text)' : 'var(--red-text)', flexShrink: 0 }}>
                  {l.valido ? (l.tipo === 'entrada' ? '+' : '−') : (l.valorNum < 0 ? '−' : '')}{Number.isNaN(l.valorNum) ? '—' : fmt(Math.abs(l.valorNum))}
                </span>
              </div>
            ))}
          </div>

          {/* Barra de ação fixa */}
          <div style={{ position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)', width: '100%', maxWidth: 480, padding: '12px 16px calc(12px + env(safe-area-inset-bottom))', background: 'var(--bg2)', borderTop: '1px solid var(--border)', display: 'flex', gap: 10, zIndex: 20 }}>
            <button className="btn-ghost" style={{ flex: 1 }} onClick={() => setCelulas(null)}>Trocar arquivo</button>
            <button className="btn-primary" style={{ flex: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, opacity: (importando || !selecionadas.length || (emCartao && !cartao)) ? 0.6 : 1 }} onClick={importar} disabled={importando || !selecionadas.length || (emCartao && !cartao)}>
              <Check size={16} /> {importando ? 'Importando...' : `Importar ${selecionadas.length}`}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
