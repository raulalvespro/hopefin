import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { X, Megaphone } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAtualizarSozinho } from '../hooks/useAtualizarSozinho'
import Joca from './Joca'
import { useMascote } from '../lib/mascote'

// Comunicados no Início (A8.15): o aviso que o dono mandou pelo painel aparece como card, com o
// Joca "mordomo" do lado. Marca visto ao aparecer, clicado no botão e dispensado no X.
export default function ComunicadosInicio() {
  const navigate = useNavigate()
  const { mascote } = useMascote()
  const [lista, setLista] = useState([])

  const carregar = useCallback(async () => {
    const { data, error } = await supabase.rpc('meus_comunicados')
    if (!error) setLista(data || [])
  }, [])
  useEffect(() => { carregar() }, [carregar])
  useAtualizarSozinho(carregar)

  const ids = lista.map(c => c.id).join(',')
  useEffect(() => {
    lista.forEach(c => supabase.rpc('comunicado_marcar', { p_id: c.id, p_acao: 'visto' }))
  }, [ids]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!lista.length) return null

  const dispensar = (c) => {
    setLista(l => l.filter(x => x.id !== c.id))
    supabase.rpc('comunicado_marcar', { p_id: c.id, p_acao: 'dispensado' })
  }
  const abrir = (c) => {
    setLista(l => l.filter(x => x.id !== c.id))
    supabase.rpc('comunicado_marcar', { p_id: c.id, p_acao: 'clicado' })
    navigate(c.botao_rota || '/')
  }

  return lista.slice(0, 2).map(c => (
    <div key={c.id} className="card" style={{ marginBottom: 16, display: 'flex', gap: 12, alignItems: 'flex-start', background: 'var(--accent-dim)', borderColor: 'var(--accent)' }}>
      {mascote
        ? <Joca pose="anotando" tamanho={52} style={{ flexShrink: 0 }} />
        : <Megaphone size={20} color="var(--accent-text)" style={{ flexShrink: 0, marginTop: 2 }} />}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 15 }}>{c.titulo}</p>
        <p style={{ fontSize: 13.5, lineHeight: 1.5, marginTop: 4, whiteSpace: 'pre-line' }}>{c.texto}</p>
        {c.botao_texto && c.botao_rota && (
          <button type="button" onClick={() => abrir(c)} className="btn-primary" style={{ marginTop: 10, padding: '9px 16px', fontSize: 13.5 }}>{c.botao_texto}</button>
        )}
      </div>
      <button type="button" onClick={() => dispensar(c)} aria-label="Dispensar aviso" style={{ flexShrink: 0, minWidth: 32, minHeight: 32, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <X size={16} color="var(--text2)" />
      </button>
    </div>
  ))
}
