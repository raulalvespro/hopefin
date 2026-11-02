import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useDb } from '../hooks/useDb'
import { useToast } from '../contexts/ToastContext'
import { supabase } from '../lib/supabase'
import { fmtData, hojeISO } from '../lib/format'
import { ChevronLeft, Download, FileJson, FileSpreadsheet, Trash2, ShieldAlert } from 'lucide-react'

// Tabelas de dados do grupo (todas têm coluna grupo_id e RLS por grupo).
// A ordem de exclusão respeita as FKs (filhos antes dos pais).
const TABELAS_EXPORT = [
  'cartoes', 'gastos', 'entradas', 'contas_fixas',
  'parcelamentos', 'parcelas', 'cofrinhos', 'transferencias',
  'assinaturas', 'fixas_lancamentos',
]
const ORDEM_EXCLUSAO = [
  'gastos', 'parcelas', 'parcelamentos', 'transferencias', 'cofrinhos',
  'fixas_lancamentos', 'contas_fixas', 'assinaturas', 'entradas', 'cartoes',
]

function baixar(nomeArquivo, conteudo, mime) {
  const blob = new Blob([conteudo], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nomeArquivo
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

// Escapa um valor para CSV (aspas e separadores).
function csvCampo(v) {
  if (v == null) return ''
  const s = String(v)
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export default function MeusDados() {
  const { perfil } = useAuth()
  const run = useDb()
  const { toast } = useToast()
  const [exportando, setExportando] = useState(null) // 'json' | 'csv' | null
  const [excluindo, setExcluindo] = useState(false)
  const [confirmando, setConfirmando] = useState(false)
  const [textoConfirma, setTextoConfirma] = useState('')

  const nomeGrupo = perfil?.grupos?.nome || ''

  // Busca todos os dados do grupo, tabela por tabela.
  async function buscarTudo() {
    const gid = perfil.grupo_id
    const dump = {}
    for (const t of TABELAS_EXPORT) {
      const { data, error } = await supabase.from(t).select('*').eq('grupo_id', gid)
      if (error) throw error
      dump[t] = data || []
    }
    return dump
  }

  async function exportarJson() {
    if (!perfil?.grupo_id) return
    setExportando('json')
    try {
      const dump = await buscarTudo()
      const backup = {
        app: 'HopeFin',
        gerado_em: new Date().toISOString(),
        grupo: { id: perfil.grupo_id, nome: nomeGrupo },
        dados: dump,
      }
      baixar(`hopefin-backup-${hojeISO()}.json`, JSON.stringify(backup, null, 2), 'application/json')
      toast('Backup JSON gerado', 'ok')
    } catch (e) {
      console.error('[HopeFin] exportar JSON', e)
      toast('Não foi possível gerar o backup. Tente de novo.', 'erro')
    } finally {
      setExportando(null)
    }
  }

  // CSV unificado de lançamentos (gastos + entradas) — fácil de abrir no Excel/Sheets.
  async function exportarCsv() {
    if (!perfil?.grupo_id) return
    setExportando('csv')
    try {
      const dump = await buscarTudo()
      const linhas = []
      for (const g of dump.gastos) linhas.push([g.data, 'Gasto', g.descricao, g.categoria || '', g.valor])
      for (const e of dump.entradas) linhas.push([e.data, 'Entrada', e.descricao, e.tipo || '', e.valor])
      linhas.sort((a, b) => String(a[0]).localeCompare(String(b[0])))
      const cabecalho = ['data', 'tipo', 'descricao', 'categoria', 'valor']
      const csv = '﻿' + [cabecalho, ...linhas].map(l => l.map(csvCampo).join(';')).join('\n')
      baixar(`hopefin-lancamentos-${hojeISO()}.csv`, csv, 'text/csv;charset=utf-8')
      toast('CSV de lançamentos gerado', 'ok')
    } catch (e) {
      console.error('[HopeFin] exportar CSV', e)
      toast('Não foi possível gerar o CSV. Tente de novo.', 'erro')
    } finally {
      setExportando(null)
    }
  }

  async function excluirTudo() {
    if (textoConfirma.trim() !== nomeGrupo) {
      toast('O nome do grupo não confere.', 'erro')
      return
    }
    setExcluindo(true)
    const gid = perfil.grupo_id
    let falhou = false
    for (const t of ORDEM_EXCLUSAO) {
      const { error } = await run(supabase.from(t).delete().eq('grupo_id', gid))
      if (error) { falhou = true; break }
    }
    setExcluindo(false)
    if (!falhou) {
      toast('Todos os dados financeiros foram apagados', 'ok')
      setConfirmando(false)
      setTextoConfirma('')
    }
  }

  return (
    <div>
      <Link to="/configuracoes" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--text2)', fontSize: 13, marginBottom: 16, textDecoration: 'none' }}>
        <ChevronLeft size={16} /> Configurações
      </Link>
      <h2 style={{ fontSize: 20, marginBottom: 8 }}>Meus dados</h2>
      <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 24, lineHeight: 1.6 }}>
        Baixe uma cópia de tudo o que você registrou ou apague seus dados quando quiser. Seus dados são seus.
      </p>

      {/* Exportar */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <Download size={18} color="var(--accent)" />
          <p style={{ fontWeight: 600, fontFamily: 'Syne', fontSize: 15 }}>Exportar meus dados</p>
        </div>
        <p style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 16, lineHeight: 1.6 }}>
          O JSON é um backup completo (gastos, entradas, contas, cartões, cofrinhos, parcelas e assinaturas). O CSV traz os lançamentos para abrir no Excel ou Google Sheets.
        </p>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn-ghost" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: exportando ? 0.6 : 1 }} onClick={exportarJson} disabled={!!exportando}>
            <FileJson size={16} /> {exportando === 'json' ? 'Gerando...' : 'Backup JSON'}
          </button>
          <button className="btn-ghost" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: exportando ? 0.6 : 1 }} onClick={exportarCsv} disabled={!!exportando}>
            <FileSpreadsheet size={16} /> {exportando === 'csv' ? 'Gerando...' : 'Lançamentos CSV'}
          </button>
        </div>
      </div>

      {/* Zona de perigo */}
      <div className="card" style={{ borderColor: 'var(--red)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <ShieldAlert size={18} color="var(--red)" />
          <p style={{ fontWeight: 600, fontFamily: 'Syne', fontSize: 15, color: 'var(--red)' }}>Apagar meus dados</p>
        </div>
        <p style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 16, lineHeight: 1.6 }}>
          Remove <strong>todos</strong> os lançamentos financeiros do grupo <strong>{nomeGrupo}</strong>: gastos, entradas, contas fixas, cartões, parcelamentos, cofrinhos e assinaturas. A conta e o grupo continuam existindo. <strong>Esta ação não pode ser desfeita</strong> — faça o backup antes.
        </p>

        {!confirmando ? (
          <button
            onClick={() => setConfirmando(true)}
            style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '11px', borderRadius: 'var(--radius-sm)', background: 'var(--red-dim)', color: 'var(--red)', fontWeight: 600, fontSize: 13, border: '1px solid var(--red)' }}
          >
            <Trash2 size={15} /> Apagar todos os meus dados
          </button>
        ) : (
          <div style={{ background: 'var(--red-dim)', borderRadius: 'var(--radius-sm)', padding: 14 }}>
            <label style={{ display: 'block', fontSize: 12, color: 'var(--text)', marginBottom: 8 }}>
              Para confirmar, digite o nome do grupo: <strong>{nomeGrupo}</strong>
            </label>
            <input
              value={textoConfirma}
              onChange={e => setTextoConfirma(e.target.value)}
              placeholder={nomeGrupo}
              autoFocus
              style={{ width: '100%', marginBottom: 12 }}
            />
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn-ghost" style={{ flex: 1 }} onClick={() => { setConfirmando(false); setTextoConfirma('') }} disabled={excluindo}>
                Cancelar
              </button>
              <button
                onClick={excluirTudo}
                disabled={excluindo || textoConfirma.trim() !== nomeGrupo}
                style={{ flex: 1, padding: '10px', borderRadius: 'var(--radius-sm)', background: 'var(--red)', color: '#fff', fontWeight: 700, fontSize: 13, opacity: (excluindo || textoConfirma.trim() !== nomeGrupo) ? 0.5 : 1 }}
              >
                {excluindo ? 'Apagando...' : 'Apagar definitivamente'}
              </button>
            </div>
          </div>
        )}
      </div>

      <p style={{ fontSize: 11, color: 'var(--text3)', marginTop: 16, textAlign: 'center' }}>
        Backup e exclusão disponíveis desde {fmtData(hojeISO())}.
      </p>
    </div>
  )
}
