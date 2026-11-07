import { useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { useToast } from '../contexts/ToastContext'
import { Bell, CalendarClock, CreditCard, Target, PiggyBank, TrendingDown, Smartphone } from 'lucide-react'
import { statusPush, ativarPush, desativarPush, enviarPushTeste } from '../lib/push'

const PADRAO = {
  alertar_vencimentos: true,
  alertar_fatura: true,
  alertar_orcamento: true,
  alertar_metas: true,
  alertar_projecao: true,
  dias_padrao: 7,
}

const TIPOS = [
  { campo: 'alertar_vencimentos', icon: CalendarClock, titulo: 'Contas vencidas e a vencer', desc: 'Avisa quando uma conta vence ou já passou do prazo.' },
  { campo: 'alertar_fatura', icon: CreditCard, titulo: 'Fatura do cartão fechando', desc: 'Lembra pouco antes do fechamento, com o gasto do ciclo.' },
  { campo: 'alertar_orcamento', icon: Target, titulo: 'Orçamento no limite', desc: 'Avisa quando uma categoria chega perto ou estoura o teto.' },
  { campo: 'alertar_metas', icon: PiggyBank, titulo: 'Metas dos cofrinhos', desc: 'Meta atingida 🎉 ou prazo da meta chegando.' },
  { campo: 'alertar_projecao', icon: TrendingDown, titulo: 'Mês fechando no vermelho', desc: 'Avisa quando a projeção do mês fica negativa.' },
]

function Toggle({ ativo, onChange }) {
  return (
    <button onClick={() => onChange(!ativo)} aria-pressed={ativo}
      style={{
        width: 44, height: 26, borderRadius: 13, flexShrink: 0, position: 'relative',
        background: ativo ? 'var(--accent)' : 'var(--border2)', transition: 'background 0.15s',
      }}>
      <span style={{
        position: 'absolute', top: 3, left: ativo ? 21 : 3, width: 20, height: 20, borderRadius: '50%',
        background: '#fff', transition: 'left 0.15s', boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
      }} />
    </button>
  )
}

export default function Notificacoes() {
  const { user, perfil } = useAuth()
  const { toast } = useToast()
  const [prefs, setPrefs] = useState(PADRAO)
  const [loading, setLoading] = useState(true)
  const [salvando, setSalvando] = useState(false)

  // Push no celular
  const [push, setPush] = useState({ suportado: false, permissao: 'default', inscrito: false })
  const [pushBusy, setPushBusy] = useState(false)
  const [pushErro, setPushErro] = useState('')

  useEffect(() => {
    if (!perfil?.grupo_id) return
    ;(async () => {
      const { data } = await supabase.from('preferencias_notificacao').select('*').eq('grupo_id', perfil.grupo_id).maybeSingle()
      if (data) setPrefs({ ...PADRAO, ...data })
      setLoading(false)
    })()
  }, [perfil])

  useEffect(() => {
    statusPush().then(setPush)
  }, [])

  async function togglePush(ativar) {
    setPushErro('')
    setPushBusy(true)
    try {
      if (ativar) {
        await ativarPush(user.id, perfil.grupo_id)
        toast('Notificações no celular ativadas!', 'ok')
      } else {
        await desativarPush()
        toast('Notificações no celular desativadas.', 'ok')
      }
      setPush(await statusPush())
    } catch (e) {
      setPushErro(e.message || 'Não foi possível alterar as notificações.')
      setPush(await statusPush())
    } finally {
      setPushBusy(false)
    }
  }

  async function testarPush() {
    setPushErro('')
    setPushBusy(true)
    try {
      const r = await enviarPushTeste()
      toast(r?.enviados ? `Teste enviado (${r.enviados}).` : 'Teste enviado.', 'ok')
    } catch (e) {
      setPushErro(e.message || 'Falha ao enviar o teste.')
    } finally {
      setPushBusy(false)
    }
  }

  async function salvar(novas) {
    setPrefs(novas)
    setSalvando(true)
    const { error } = await supabase.from('preferencias_notificacao').upsert(
      { grupo_id: perfil.grupo_id, ...novas, atualizado_em: new Date().toISOString() },
      { onConflict: 'grupo_id' }
    )
    setSalvando(false)
    if (error) toast('Não foi possível salvar.', 'erro')
  }

  const setCampo = (campo, valor) => salvar({ ...prefs, [campo]: valor })

  if (loading) return <div className="empty-state">Carregando…</div>

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
        <Bell size={22} color="var(--accent)" />
        <h1 style={{ fontSize: 22 }}>Notificações</h1>
      </div>
      <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 20, lineHeight: 1.5 }}>
        Escolha quais alertas aparecem no sininho. Vale para todo o grupo.
      </p>

      <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 16 }}>
        {TIPOS.map(({ campo, icon: Icon, titulo, desc }, idx) => (
          <div key={campo} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', borderTop: idx ? '1px solid var(--border)' : 'none' }}>
            <Icon size={19} color="var(--accent)" style={{ flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 14, fontWeight: 500 }}>{titulo}</p>
              <p style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2, lineHeight: 1.4 }}>{desc}</p>
            </div>
            <Toggle ativo={prefs[campo]} onChange={v => setCampo(campo, v)} />
          </div>
        ))}
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <p style={{ fontWeight: 600, fontFamily: 'Syne', fontSize: 15, marginBottom: 6 }}>Antecedência padrão</p>
        <p style={{ fontSize: 12.5, color: 'var(--text2)', marginBottom: 14, lineHeight: 1.5 }}>
          Com quantos dias avisar para parcelas e assinaturas. Contas fixas e cartões têm o ajuste próprio de cada um.
        </p>
        <div style={{ display: 'flex', gap: 8 }}>
          {[1, 2, 3, 5, 7, 10].map(d => {
            const ativo = prefs.dias_padrao === d
            return (
              <button key={d} onClick={() => setCampo('dias_padrao', d)}
                style={{
                  flex: 1, padding: '10px 0', borderRadius: 'var(--radius-sm)', fontSize: 13, fontWeight: 600,
                  border: `1.5px solid ${ativo ? 'var(--accent)' : 'var(--border2)'}`,
                  background: ativo ? 'var(--accent-dim)' : 'var(--bg3)',
                  color: ativo ? 'var(--accent)' : 'var(--text2)',
                }}>{d}d</button>
            )
          })}
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <Smartphone size={19} color="var(--accent)" style={{ flexShrink: 0, marginTop: 1 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 14, fontWeight: 500 }}>Notificação no celular</p>
            <p style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2, lineHeight: 1.4 }}>
              Receba os alertas como push no celular, mesmo com o app fechado.
            </p>
          </div>
          {push.suportado && push.permissao !== 'denied' && (
            <div style={{ opacity: pushBusy ? 0.5 : 1, pointerEvents: pushBusy ? 'none' : 'auto' }}>
              <Toggle ativo={push.inscrito} onChange={togglePush} />
            </div>
          )}
        </div>

        {push.inscrito && (
          <button onClick={testarPush} disabled={pushBusy}
            style={{ marginTop: 14, fontSize: 13, fontWeight: 600, color: 'var(--accent-text)' }}>
            {pushBusy ? 'Enviando…' : 'Enviar notificação de teste'}
          </button>
        )}

        {!push.suportado && (
          <p style={{ fontSize: 12, color: 'var(--text3)', marginTop: 12, lineHeight: 1.5 }}>
            Este navegador não suporta notificações push. No iPhone, instale o app na tela de início
            (Compartilhar → Adicionar à Tela de Início) e abra por lá.
          </p>
        )}
        {push.permissao === 'denied' && (
          <p style={{ fontSize: 12, color: 'var(--amber-text)', marginTop: 12, lineHeight: 1.5 }}>
            As notificações estão bloqueadas para este site. Libere nas configurações do navegador para ativar.
          </p>
        )}
        {pushErro && (
          <p style={{ fontSize: 12, color: 'var(--red-text)', marginTop: 12, lineHeight: 1.5 }}>{pushErro}</p>
        )}
      </div>

      {salvando && <p style={{ fontSize: 12, color: 'var(--text3)', textAlign: 'center', marginTop: 14 }}>Salvando…</p>}
    </div>
  )
}
