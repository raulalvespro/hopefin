// Pessoas (A8.5, 19/11/2026): quem divide contas com você ou te deve. Um nome por pessoa —
// "Jack", "Jacqueline" e "Jak" escritos em lançamentos diferentes viravam 3 pessoas e o
// A receber/cobrança separava o que é de uma só. Aqui dá pra:
//  • JUNTAR duplicadas: os gastos, parcelados e valores a receber vão pro nome que fica
//    (RPC juntar_pessoas, migração 0072 — tudo numa transação);
//  • renomear;
//  • apagar quem não tem nenhum lançamento (RPC apagar_pessoa — recusa se tiver uso).
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, Plus, Users } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { useAtualizarSozinho } from '../hooks/useAtualizarSozinho'
import { useDb } from '../hooks/useDb'
import { useToast } from '../contexts/ToastContext'
import SwipeRow from '../components/SwipeRow'
import { copy } from '../copy/pt-BR'
import { nomeNormal, nomesParecidos, pessoasParecidas } from '../lib/pessoas'

const t = copy.pessoasTela

export default function Pessoas() {
  const { perfil } = useAuth()
  const run = useDb()
  const { toast } = useToast()
  const navigate = useNavigate()
  const [lista, setLista] = useState([])          // [{ id, nome, usos }]
  const [loading, setLoading] = useState(true)
  const [editando, setEditando] = useState(null)  // { id, nome }
  const [juntando, setJuntando] = useState(null)  // { marcadas: string[], manter: id }
  const [nova, setNova] = useState(null)          // { nome, confirmouOutra }
  const [salvando, setSalvando] = useState(false)

  async function carregar() {
    const gid = perfil.grupo_id
    const [ps, gs, pc, ar] = await Promise.all([
      supabase.from('pessoas').select('id, nome').eq('grupo_id', gid).order('nome'),
      supabase.from('gastos').select('pessoa_id').eq('grupo_id', gid).not('pessoa_id', 'is', null),
      supabase.from('parcelamentos').select('pessoa_id').eq('grupo_id', gid).not('pessoa_id', 'is', null),
      supabase.from('a_receber').select('pessoa_id').eq('grupo_id', gid),
    ])
    if ([ps, gs, pc, ar].some(r => r.error)) { toast(t.erroCarregar, 'erro'); setLoading(false); return }
    const usos = {}
    for (const r of [...(gs.data || []), ...(pc.data || []), ...(ar.data || [])]) if (r.pessoa_id) usos[r.pessoa_id] = (usos[r.pessoa_id] || 0) + 1
    setLista((ps.data || []).map(p => ({ ...p, usos: usos[p.id] || 0 })))
    setLoading(false)
  }
  useEffect(() => { if (perfil?.grupo_id) carregar() }, [perfil?.grupo_id]) // eslint-disable-line react-hooks/exhaustive-deps
  useAtualizarSozinho(perfil?.grupo_id ? carregar : null) // aba abre na hora e se atualiza sozinha

  // Pares que parecem a mesma pessoa (sugestão de juntar)
  const pares = useMemo(() => {
    const out = []
    for (let i = 0; i < lista.length; i++) for (let j = i + 1; j < lista.length; j++) {
      if (nomesParecidos(lista[i].nome, lista[j].nome)) out.push([lista[i], lista[j]])
    }
    return out
  }, [lista])

  const nomeDe = (id) => lista.find(p => p.id === id)?.nome || ''

  function abrirJuntar(ids = []) {
    const manter = ids.length ? [...ids].sort((a, b) => (lista.find(p => p.id === b)?.usos || 0) - (lista.find(p => p.id === a)?.usos || 0))[0] : null
    setJuntando({ marcadas: ids, manter })
  }

  async function confirmarJuntar() {
    const marcadas = juntando.marcadas
    if (marcadas.length < 2) { toast(t.erroJuntarDuas, 'erro'); return }
    const manter = marcadas.includes(juntando.manter) ? juntando.manter : marcadas[0]
    const juntar = marcadas.filter(id => id !== manter)
    setSalvando(true)
    const { data, error } = await run(supabase.rpc('juntar_pessoas', { p_manter: manter, p_juntar: juntar }))
    setSalvando(false)
    if (error) return
    const n = (data?.gastos || 0) + (data?.parcelados || 0) + (data?.a_receber || 0)
    toast(t.okJuntou(nomeDe(manter), n), 'ok')
    setJuntando(null); carregar()
  }

  async function salvarNome() {
    const nome = editando.nome.trim().slice(0, 60)
    if (!nome) return
    const igual = lista.find(p => p.id !== editando.id && nomeNormal(p.nome) === nomeNormal(nome))
    if (igual) { toast(t.jaExiste(igual.nome), 'erro'); return }
    setSalvando(true)
    const { error } = await run(supabase.from('pessoas').update({ nome }).eq('id', editando.id), { ok: t.okRenomeado })
    setSalvando(false)
    if (error) return
    setEditando(null); carregar()
  }

  async function apagar(p) {
    if (p.usos > 0) { toast(t.emUso(p.usos), 'erro'); return }
    if (!confirm(t.apagarConfirma(p.nome))) return
    const { error } = await run(supabase.rpc('apagar_pessoa', { p_pessoa: p.id }), { ok: t.okApagada })
    if (!error) carregar()
  }

  const parecidasNova = nova ? pessoasParecidas(nova.nome, lista) : []
  async function criar() {
    const nome = nova.nome.trim().slice(0, 60)
    if (!nome) return
    const igual = lista.find(p => nomeNormal(p.nome) === nomeNormal(nome))
    if (igual) { toast(t.jaExiste(igual.nome), 'erro'); return }
    if (parecidasNova.length && !nova.confirmouOutra) { setNova(n => ({ ...n, confirmouOutra: true })); return }
    setSalvando(true)
    const { error } = await run(supabase.from('pessoas').insert({ grupo_id: perfil.grupo_id, nome }), { ok: t.okCriada })
    setSalvando(false)
    if (error) return
    setNova(null); carregar()
  }

  return (
    <div>
      <button onClick={() => navigate('/a-receber')} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, color: 'var(--text2)', marginBottom: 10 }}>
        <ChevronLeft size={16} /> {t.voltar}
      </button>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, gap: 8 }}>
        <h2 style={{ fontSize: 20 }}>{t.titulo}</h2>
        <button onClick={() => setNova({ nome: '', confirmouOutra: false })} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--accent)', color: 'var(--on-accent)', padding: '8px 14px', borderRadius: 'var(--radius-sm)', fontSize: 13, fontWeight: 700, fontFamily: 'Syne' }}>
          <Plus size={16} /> {t.nova}
        </button>
      </div>
      <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 14, lineHeight: 1.5 }}>{t.sub}</p>

      {pares.map(([a, b]) => (
        <div key={`${a.id}-${b.id}`} className="card" style={{ marginBottom: 10, display: 'flex', alignItems: 'center', gap: 10, background: 'var(--amber-dim)', borderColor: 'var(--amber)' }}>
          <span style={{ flex: 1, fontSize: 13, lineHeight: 1.4 }}>{t.parecem(a.nome, b.nome)}</span>
          <button className="btn-primary" style={{ padding: '8px 14px', whiteSpace: 'nowrap' }} onClick={() => abrirJuntar([a.id, b.id])}>{t.juntarEssas}</button>
        </div>
      ))}

      {loading ? <div className="empty-state">Carregando...</div>
        : lista.length === 0 ? <div className="empty-state">{t.vazio}</div>
        : (
          <>
            {lista.map(p => (
              <SwipeRow key={p.id} style={{ marginBottom: 8 }} onEdit={() => setEditando({ id: p.id, nome: p.nome })} onDelete={() => apagar(p)}>
                <div className="card" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ width: 34, height: 34, borderRadius: '50%', background: 'var(--accent-dim)', color: 'var(--accent-text)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontFamily: 'Syne', flexShrink: 0 }}>
                    {p.nome.trim().charAt(0).toUpperCase()}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 14.5, fontWeight: 600 }}>{p.nome}</p>
                    <p style={{ fontSize: 12, color: 'var(--text2)' }}>{t.usos(p.usos)}</p>
                  </div>
                </div>
              </SwipeRow>
            ))}
            {lista.length >= 2 && (
              <button className="btn-ghost" style={{ width: '100%', marginTop: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }} onClick={() => abrirJuntar([])}>
                <Users size={15} /> {t.juntar}
              </button>
            )}
            <p style={{ fontSize: 11.5, color: 'var(--text3)', marginTop: 10, lineHeight: 1.45 }}>{t.dicaArrastar}</p>
          </>
        )}

      {/* Juntar */}
      {juntando && (
        <div className="modal-overlay" onClick={() => setJuntando(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxHeight: '86vh', overflowY: 'auto' }}>
            <h2 style={{ fontSize: 18, marginBottom: 6 }}>{t.juntarTitulo}</h2>
            <p style={{ fontSize: 12.5, color: 'var(--text2)', marginBottom: 12, lineHeight: 1.45 }}>{t.juntarSub}</p>
            {lista.map(p => {
              const on = juntando.marcadas.includes(p.id)
              return (
                <label key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}>
                  <input type="checkbox" checked={on} onChange={() => setJuntando(j => {
                    const marcadas = on ? j.marcadas.filter(x => x !== p.id) : [...j.marcadas, p.id]
                    return { ...j, marcadas, manter: marcadas.includes(j.manter) ? j.manter : marcadas[0] || null }
                  })} />
                  <span style={{ flex: 1, fontSize: 14 }}>{p.nome}</span>
                  <span style={{ fontSize: 11.5, color: 'var(--text3)' }}>{t.usos(p.usos)}</span>
                </label>
              )
            })}
            {juntando.marcadas.length >= 2 && (
              <div className="form-group" style={{ marginTop: 14 }}>
                <label>{t.qualFica}</label>
                <div role="radiogroup" aria-label={t.qualFica} style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {juntando.marcadas.map(id => {
                    const on = juntando.manter === id
                    return (
                      <button key={id} type="button" role="radio" aria-checked={on} onClick={() => setJuntando(j => ({ ...j, manter: id }))}
                        style={{ padding: '7px 12px', borderRadius: 16, fontSize: 13, fontWeight: 600, border: `1.5px solid ${on ? 'var(--accent)' : 'var(--border2)'}`, background: on ? 'var(--accent-dim)' : 'transparent', color: on ? 'var(--accent-text)' : 'var(--text2)' }}>
                        {nomeDe(id)}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
            <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
              <button className="btn-ghost" style={{ flex: 1 }} onClick={() => setJuntando(null)}>{t.cancelar}</button>
              <button className="btn-primary" style={{ flex: 1, opacity: salvando || juntando.marcadas.length < 2 ? 0.6 : 1 }} disabled={salvando || juntando.marcadas.length < 2} onClick={confirmarJuntar}>
                {salvando ? 'Salvando...' : t.juntarBotao(juntando.marcadas.length)}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Renomear */}
      {editando && (
        <div className="modal-overlay" onClick={() => setEditando(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2 style={{ fontSize: 18, marginBottom: 14 }}>{t.editarTitulo}</h2>
            <div className="form-group"><label>{t.nome}</label><input autoFocus maxLength={60} value={editando.nome} onChange={e => setEditando(x => ({ ...x, nome: e.target.value }))} /></div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn-ghost" style={{ flex: 1 }} onClick={() => setEditando(null)}>{t.cancelar}</button>
              <button className="btn-primary" style={{ flex: 1, opacity: salvando ? 0.6 : 1 }} disabled={salvando || !editando.nome.trim()} onClick={salvarNome}>{salvando ? 'Salvando...' : t.salvar}</button>
            </div>
          </div>
        </div>
      )}

      {/* Nova pessoa */}
      {nova && (
        <div className="modal-overlay" onClick={() => setNova(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2 style={{ fontSize: 18, marginBottom: 14 }}>{t.novaTitulo}</h2>
            <div className="form-group"><label>{t.nome}</label><input autoFocus maxLength={60} value={nova.nome} placeholder={copy.pessoas.phNova} onChange={e => setNova({ nome: e.target.value, confirmouOutra: false })} /></div>
            {parecidasNova.length > 0 && (
              <div style={{ background: 'var(--amber-dim)', border: '1px solid var(--amber)', borderRadius: 'var(--radius-sm)', padding: 10, marginBottom: 12, fontSize: 13, lineHeight: 1.4 }}>
                {t.parecidaAviso(parecidasNova.map(p => p.nome).join(', '))}
                {nova.confirmouOutra && <span style={{ display: 'block', marginTop: 4, color: 'var(--text2)', fontSize: 12 }}>{t.toqueDeNovo}</span>}
              </div>
            )}
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn-ghost" style={{ flex: 1 }} onClick={() => setNova(null)}>{t.cancelar}</button>
              <button className="btn-primary" style={{ flex: 1, opacity: salvando || !nova.nome.trim() ? 0.6 : 1 }} disabled={salvando || !nova.nome.trim()} onClick={criar}>
                {salvando ? 'Salvando...' : parecidasNova.length && !nova.confirmouOutra ? t.criarMesmoAssim : t.salvar}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
