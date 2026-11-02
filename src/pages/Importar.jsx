import { useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useDb } from '../hooks/useDb'
import { useToast } from '../contexts/ToastContext'
import { useCategorias } from '../hooks/useCategorias'
import { supabase } from '../lib/supabase'
import { fmt, fmtData } from '../lib/format'
import { ChevronLeft, Upload, FileSpreadsheet, Check, AlertCircle } from 'lucide-react'

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
    }
    reader.onerror = () => toast('Não foi possível ler o arquivo.', 'erro')
    reader.readAsText(file, 'utf-8')
    e.target.value = ''
  }

  const cabecalho = useMemo(() => (celulas && temCabecalho ? celulas[0] : null), [celulas, temCabecalho])
  const nCols = celulas ? Math.max(...celulas.map(r => r.length)) : 0

  // Linhas derivadas conforme o mapeamento atual.
  const linhas = useMemo(() => {
    if (!celulas) return []
    const corpo = temCabecalho ? celulas.slice(1) : celulas
    return corpo.map((r, i) => {
      const data = parseData(r[cols.data])
      const valorNum = parseValor(r[cols.valor])
      const descricao = (r[cols.desc] || '').slice(0, 120) || 'Sem descrição'
      const valido = !!data && !Number.isNaN(valorNum)
      const tipo = valorNum >= 0 ? 'entrada' : 'gasto'
      const ov = overrides[i] || {}
      return {
        i, data, valorNum, descricao, valido, tipo,
        incluir: ov.incluir !== undefined ? ov.incluir : valido,
        categoria: ov.categoria || catPadrao,
      }
    })
  }, [celulas, temCabecalho, cols, overrides, catPadrao])

  const selecionadas = linhas.filter(l => l.incluir && l.valido)
  const totalGasto = selecionadas.filter(l => l.tipo === 'gasto').reduce((s, l) => s + Math.abs(l.valorNum), 0)
  const totalEntrada = selecionadas.filter(l => l.tipo === 'entrada').reduce((s, l) => s + Math.abs(l.valorNum), 0)

  function setOv(i, patch) { setOverrides(o => ({ ...o, [i]: { ...o[i], ...patch } })) }

  async function importar() {
    if (!selecionadas.length) { toast('Nada selecionado para importar.', 'erro'); return }
    setImportando(true)
    const gid = perfil.grupo_id
    const gastos = selecionadas.filter(l => l.tipo === 'gasto').map(l => ({
      grupo_id: gid, usuario_id: perfil.id, descricao: l.descricao,
      valor: Math.abs(l.valorNum), categoria: l.categoria, tipo_pagamento: 'cartao', data: l.data,
    }))
    const entradas = selecionadas.filter(l => l.tipo === 'entrada').map(l => ({
      grupo_id: gid, usuario_id: perfil.id, descricao: l.descricao,
      valor: Math.abs(l.valorNum), tipo: 'avulso', data: l.data,
    }))
    let ok = true
    if (gastos.length) { const { error } = await run(supabase.from('gastos').insert(gastos)); if (error) ok = false }
    if (ok && entradas.length) { const { error } = await run(supabase.from('entradas').insert(entradas)); if (error) ok = false }
    setImportando(false)
    if (ok) {
      toast(`${selecionadas.length} lançamentos importados`, 'ok')
      navigate('/gastos')
    }
  }

  const opcoesCol = Array.from({ length: nCols }, (_, c) => ({
    v: c, label: cabecalho ? (cabecalho[c] || `Coluna ${c + 1}`) : `Coluna ${c + 1}`,
  }))

  return (
    <div>
      <Link to="/gastos" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--text2)', fontSize: 13, marginBottom: 16, textDecoration: 'none' }}>
        <ChevronLeft size={16} /> Gastos
      </Link>
      <h2 style={{ fontSize: 20, marginBottom: 8 }}>Importar extrato (CSV)</h2>
      <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 20, lineHeight: 1.6 }}>
        Exporte o extrato do seu banco ou cartão em CSV e solte aqui. O HopeFin tenta
        reconhecer data, descrição e valor — você confere antes de importar. Valores
        negativos viram gastos; positivos, entradas.
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
              <li><strong>Negativo</strong> vira gasto; <strong>positivo</strong> vira entrada (ex: -89,50)</li>
              <li>A 1ª linha pode ser o cabeçalho — o app detecta sozinho</li>
            </ul>
            <button onClick={baixarModelo} className="btn-ghost" style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <FileSpreadsheet size={16} /> Baixar modelo CSV
            </button>
            <p style={{ fontSize: 11, color: 'var(--text3)', marginTop: 10, textAlign: 'center' }}>
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
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text2)', marginBottom: 12 }}>
              <input type="checkbox" checked={temCabecalho} onChange={e => setTemCabecalho(e.target.checked)} style={{ width: 'auto' }} />
              A primeira linha é cabeçalho
            </label>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Categoria padrão dos gastos</label>
              <select value={catPadrao} onChange={e => setCatPadrao(e.target.value)}>
                {categorias.map(c => <option key={c.nome} value={c.nome}>{c.emoji} {c.nome}</option>)}
              </select>
            </div>
          </div>

          {/* Resumo */}
          <div className="card" style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-around', textAlign: 'center' }}>
            <div>
              <p style={{ fontSize: 11, color: 'var(--text2)' }}>Selecionados</p>
              <p style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 18 }}>{selecionadas.length}</p>
            </div>
            <div>
              <p style={{ fontSize: 11, color: 'var(--text2)' }}>Gastos</p>
              <p style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 18, color: 'var(--red)' }}>{fmt(totalGasto)}</p>
            </div>
            <div>
              <p style={{ fontSize: 11, color: 'var(--text2)' }}>Entradas</p>
              <p style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 18, color: 'var(--accent)' }}>{fmt(totalEntrada)}</p>
            </div>
          </div>

          {/* Prévia */}
          <p style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 8 }}>
            Prévia ({linhas.length} linhas{linhas.length > 80 ? ' · mostrando as 80 primeiras' : ''})
          </p>
          <div style={{ marginBottom: 90 }}>
            {linhas.slice(0, 80).map(l => (
              <div key={l.i} className="card" style={{ marginBottom: 6, padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 10, opacity: l.valido ? 1 : 0.55 }}>
                <input type="checkbox" checked={l.incluir} disabled={!l.valido} onChange={e => setOv(l.i, { incluir: e.target.checked })} style={{ width: 'auto', flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{l.descricao}</p>
                  <p style={{ fontSize: 11, color: 'var(--text3)', display: 'flex', alignItems: 'center', gap: 6 }}>
                    {l.valido ? fmtData(l.data) : <span style={{ color: 'var(--red)', display: 'inline-flex', alignItems: 'center', gap: 3 }}><AlertCircle size={11} /> linha inválida</span>}
                    {l.valido && l.tipo === 'gasto' && (
                      <select value={l.categoria} onChange={e => setOv(l.i, { categoria: e.target.value })} onClick={e => e.stopPropagation()}
                        style={{ fontSize: 11, padding: '1px 4px', width: 'auto', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text2)' }}>
                        {categorias.map(c => <option key={c.nome} value={c.nome}>{c.emoji} {c.nome}</option>)}
                      </select>
                    )}
                  </p>
                </div>
                <span style={{ fontSize: 13, fontWeight: 700, fontFamily: 'Syne', color: l.tipo === 'entrada' ? 'var(--accent)' : 'var(--red)', flexShrink: 0 }}>
                  {l.tipo === 'entrada' ? '+' : '−'}{fmt(Math.abs(l.valorNum))}
                </span>
              </div>
            ))}
          </div>

          {/* Barra de ação fixa */}
          <div style={{ position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)', width: '100%', maxWidth: 480, padding: '12px 16px calc(12px + env(safe-area-inset-bottom))', background: 'var(--bg2)', borderTop: '1px solid var(--border)', display: 'flex', gap: 10, zIndex: 20 }}>
            <button className="btn-ghost" style={{ flex: 1 }} onClick={() => setCelulas(null)}>Trocar arquivo</button>
            <button className="btn-primary" style={{ flex: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, opacity: (importando || !selecionadas.length) ? 0.6 : 1 }} onClick={importar} disabled={importando || !selecionadas.length}>
              <Check size={16} /> {importando ? 'Importando...' : `Importar ${selecionadas.length}`}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
