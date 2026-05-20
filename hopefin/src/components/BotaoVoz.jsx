import { useState, useCallback } from 'react'
import { Mic, MicOff, X, Check, Loader } from 'lucide-react'
import { useVoz, interpretarFala } from '../hooks/useVoz'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { format } from 'date-fns'

export default function BotaoVoz({ onSalvo }) {
  const { perfil } = useAuth()
  const [aberto, setAberto] = useState(false)
  const [fala, setFala] = useState('')
  const [interpretado, setInterpretado] = useState(null)
  const [salvando, setSalvando] = useState(false)
  const [sucesso, setSucesso] = useState(false)
  const [cartoes, setCartoes] = useState([])
  const [cartaoSelecionado, setCartaoSelecionado] = useState('')

  const onTranscricao = useCallback(async (texto) => {
    setFala(texto)
    const dados = interpretarFala(texto)
    setInterpretado(dados)

    if (perfil?.grupo_id) {
      const { data } = await supabase.from('cartoes').select('id, nome').eq('grupo_id', perfil.grupo_id).eq('ativo', true)
      setCartoes(data || [])
      if (dados.cartaoNome && data) {
        const found = data.find(c => c.nome.toLowerCase().includes(dados.cartaoNome))
        if (found) setCartaoSelecionado(found.id)
      }
    }
  }, [perfil])

  const { gravando, suportado, iniciar, parar } = useVoz(onTranscricao)

  async function salvar() {
    if (!interpretado?.valor || !perfil?.grupo_id) return
    setSalvando(true)

    await supabase.from('gastos').insert({
      grupo_id: perfil.grupo_id,
      usuario_id: perfil.id,
      descricao: interpretado.descricao,
      valor: interpretado.valor,
      categoria: interpretado.categoria,
      tipo_pagamento: cartaoSelecionado ? 'cartao' : interpretado.tipoPagamento,
      cartao_id: cartaoSelecionado || null,
      data: format(new Date(), 'yyyy-MM-dd'),
    })

    setSalvando(false)
    setSucesso(true)
    setTimeout(() => {
      setSucesso(false); setAberto(false); setFala(''); setInterpretado(null); setCartaoSelecionado('')
      onSalvo?.()
    }, 1200)
  }

  function fechar() {
    setAberto(false); setFala(''); setInterpretado(null)
    if (gravando) parar()
  }

  const fmt = v => v?.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  const cats = { mercado: '🛒', transporte: '⛽', saude: '💊', alimentacao: '🍔', vestuario: '👕', lazer: '🎉', outros: '📦' }

  return (
    <>
      {/* Botão flutuante */}
      {!aberto && (
        <button
          onClick={() => setAberto(true)}
          style={{ position: 'fixed', bottom: 80, right: 20, width: 56, height: 56, borderRadius: '50%', background: 'var(--accent)', color: '#0f0f0f', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 24px rgba(200,245,90,0.3)', zIndex: 50 }}
        >
          <Mic size={24} strokeWidth={2} />
        </button>
      )}

      {/* Modal de voz */}
      {aberto && (
        <div className="modal-overlay" onClick={fechar}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
              <h2 style={{ fontSize: 18 }}>Registrar gasto por voz</h2>
              <button onClick={fechar}><X size={20} color="var(--text2)" /></button>
            </div>

            {!suportado && (
              <p style={{ color: 'var(--red)', fontSize: 14, marginBottom: 16 }}>
                Seu navegador não suporta reconhecimento de voz. Use o Chrome no Android.
              </p>
            )}

            {/* Botão de microfone */}
            <div style={{ textAlign: 'center', marginBottom: 24 }}>
              <button
                onClick={gravando ? parar : iniciar}
                disabled={!suportado}
                style={{ width: 80, height: 80, borderRadius: '50%', background: gravando ? 'var(--red-dim)' : 'var(--accent-dim)', border: `2px solid ${gravando ? 'var(--red)' : 'var(--accent)'}`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', animation: gravando ? 'pulse 1s infinite' : 'none' }}
              >
                {gravando ? <MicOff size={32} color="var(--red)" /> : <Mic size={32} color="var(--accent)" />}
              </button>
              <p style={{ fontSize: 13, color: 'var(--text2)', marginTop: 10 }}>
                {gravando ? '🔴 Ouvindo... fale o gasto' : 'Toque para falar'}
              </p>
              <p style={{ fontSize: 12, color: 'var(--text3)', marginTop: 4 }}>
                Ex: "Gastei 87 reais no mercado no Nubank"
              </p>
            </div>

            {/* Resultado da fala */}
            {fala && (
              <div style={{ background: 'var(--bg3)', borderRadius: 'var(--radius-sm)', padding: '12px 14px', marginBottom: 16 }}>
                <p style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 4 }}>Você disse:</p>
                <p style={{ fontSize: 14, fontStyle: 'italic' }}>"{fala}"</p>
              </div>
            )}

            {/* Dados interpretados */}
            {interpretado && (
              <div style={{ marginBottom: 20 }}>
                <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 12 }}>Dados interpretados:</p>

                <div className="form-group">
                  <label>Descrição</label>
                  <input value={interpretado.descricao} onChange={e => setInterpretado(p => ({ ...p, descricao: e.target.value }))} />
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>Valor</label>
                    <input type="number" value={interpretado.valor || ''} onChange={e => setInterpretado(p => ({ ...p, valor: parseFloat(e.target.value) }))} />
                  </div>
                  <div className="form-group">
                    <label>Categoria</label>
                    <select value={interpretado.categoria} onChange={e => setInterpretado(p => ({ ...p, categoria: e.target.value }))}>
                      {Object.entries(cats).map(([v, emoji]) => (
                        <option key={v} value={v}>{emoji} {v}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="form-group">
                  <label>Cartão</label>
                  <select value={cartaoSelecionado} onChange={e => setCartaoSelecionado(e.target.value)}>
                    <option value="">Sem cartão (dinheiro/pix)</option>
                    {cartoes.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                  </select>
                </div>

                <button
                  className="btn-primary"
                  style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
                  onClick={salvar}
                  disabled={salvando || sucesso || !interpretado.valor}
                >
                  {sucesso ? <><Check size={18} /> Salvo!</> : salvando ? <><Loader size={18} className="spin" /> Salvando...</> : 'Confirmar e salvar'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.6} }
        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
      `}</style>
    </>
  )
}
