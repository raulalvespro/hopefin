import { useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { format, startOfMonth, endOfMonth, isWithinInterval, addDays } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { TrendingUp, TrendingDown, Wallet, Bell, ChevronRight } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import BotaoVoz from '../components/BotaoVoz'

export default function Dashboard() {
  const { perfil } = useAuth()
  const navigate = useNavigate()
  const [dados, setDados] = useState({ entradas: 0, gastos: 0, parcelas: 0, fixas: 0 })
  const [alertas, setAlertas] = useState([])
  const [ultimosGastos, setUltimosGastos] = useState([])
  const [loading, setLoading] = useState(true)
  const mesAtual = format(new Date(), 'MMMM yyyy', { locale: ptBR })

  useEffect(() => {
    if (perfil?.grupo_id) carregarDados()
  }, [perfil])

  async function carregarDados() {
    const hoje = new Date()
    const inicio = format(startOfMonth(hoje), 'yyyy-MM-dd')
    const fim = format(endOfMonth(hoje), 'yyyy-MM-dd')
    const gid = perfil.grupo_id

    const [{ data: entradas }, { data: gastos }, { data: parcelas }, { data: fixas }, { data: cartoes }] = await Promise.all([
      supabase.from('entradas').select('valor').eq('grupo_id', gid).gte('data', inicio).lte('data', fim),
      supabase.from('gastos').select('*').eq('grupo_id', gid).gte('data', inicio).lte('data', fim).order('data', { ascending: false }),
      supabase.from('parcelas').select('valor').eq('grupo_id', gid).gte('data_vencimento', inicio).lte('data_vencimento', fim).eq('paga', false),
      supabase.from('contas_fixas').select('valor, nome, dia_vencimento, alerta_dias').eq('grupo_id', gid).eq('ativo', true),
      supabase.from('cartoes').select('nome, dia_vencimento, alerta_dias').eq('grupo_id', gid).eq('ativo', true),
    ])

    const totalEntradas = (entradas || []).reduce((s, e) => s + e.valor, 0)
    const totalGastos = (gastos || []).reduce((s, g) => s + g.valor, 0)
    const totalParcelas = (parcelas || []).reduce((s, p) => s + p.valor, 0)
    const totalFixas = (fixas || []).reduce((s, f) => s + f.valor, 0)

    setDados({ entradas: totalEntradas, gastos: totalGastos + totalParcelas, parcelas: totalParcelas, fixas: totalFixas })
    setUltimosGastos((gastos || []).slice(0, 5))

    // Alertas de vencimento
    const alertasGerados = []
    const mesN = hoje.getMonth()
    const anoN = hoje.getFullYear();

    (fixas || []).forEach(f => {
      const venc = new Date(anoN, mesN, f.dia_vencimento)
      const limite = addDays(hoje, f.alerta_dias || 3)
      if (venc >= hoje && venc <= limite) {
        alertasGerados.push({ tipo: 'fixa', nome: f.nome, data: venc, valor: f.valor })
      }
    });

    (cartoes || []).forEach(c => {
      const venc = new Date(anoN, mesN, c.dia_vencimento)
      const limite = addDays(hoje, c.alerta_dias || 3)
      if (venc >= hoje && venc <= limite) {
        alertasGerados.push({ tipo: 'cartao', nome: `Fatura ${c.nome}`, data: venc })
      }
    })

    setAlertas(alertasGerados)
    setLoading(false)
  }

  const saldo = dados.entradas - dados.gastos - dados.fixas
  const fmt = v => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

  const cats = { mercado: '🛒', transporte: '⛽', saude: '💊', alimentacao: '🍔', vestuario: '👕', lazer: '🎉', outros: '📦' }

  if (loading) return <div className="empty-state">Carregando...</div>

  return (
    <div>
      {/* Saudação */}
      <div style={{ marginBottom: 24 }}>
        <p style={{ color: 'var(--text2)', fontSize: 13 }}>
          {format(new Date(), "EEEE, d 'de' MMMM", { locale: ptBR })}
        </p>
        <h2 style={{ fontSize: 22, marginTop: 2 }}>Olá, {perfil?.nome?.split(' ')[0]} 👋</h2>
      </div>

      {/* Saldo do mês */}
      <div className="card" style={{ marginBottom: 16, background: saldo >= 0 ? 'var(--accent-dim)' : 'var(--red-dim)', borderColor: saldo >= 0 ? 'var(--accent)' : 'var(--red)' }}>
        <p style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Saldo em {mesAtual}</p>
        <p style={{ fontSize: 32, fontFamily: 'Syne', fontWeight: 700, color: saldo >= 0 ? 'var(--accent)' : 'var(--red)' }}>{fmt(saldo)}</p>
      </div>

      {/* Cards resumo */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 }}>
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
            <TrendingUp size={15} color="var(--accent)" />
            <span style={{ fontSize: 12, color: 'var(--text2)' }}>Entradas</span>
          </div>
          <p style={{ fontSize: 18, fontFamily: 'Syne', fontWeight: 700, color: 'var(--accent)' }}>{fmt(dados.entradas)}</p>
        </div>
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
            <TrendingDown size={15} color="var(--red)" />
            <span style={{ fontSize: 12, color: 'var(--text2)' }}>Gastos</span>
          </div>
          <p style={{ fontSize: 18, fontFamily: 'Syne', fontWeight: 700, color: 'var(--red)' }}>{fmt(dados.gastos)}</p>
        </div>
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
            <Wallet size={15} color="var(--blue)" />
            <span style={{ fontSize: 12, color: 'var(--text2)' }}>Contas fixas</span>
          </div>
          <p style={{ fontSize: 18, fontFamily: 'Syne', fontWeight: 700, color: 'var(--blue)' }}>{fmt(dados.fixas)}</p>
        </div>
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
            <Wallet size={15} color="var(--amber)" />
            <span style={{ fontSize: 12, color: 'var(--text2)' }}>Parcelas</span>
          </div>
          <p style={{ fontSize: 18, fontFamily: 'Syne', fontWeight: 700, color: 'var(--amber)' }}>{fmt(dados.parcelas)}</p>
        </div>
      </div>

      {/* Alertas */}
      {alertas.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <h3 style={{ fontSize: 14, color: 'var(--text2)', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Bell size={14} color="var(--amber)" /> Vencimentos próximos
          </h3>
          {alertas.map((a, i) => (
            <div key={i} className="card" style={{ marginBottom: 8, borderColor: 'var(--amber)', background: 'var(--amber-dim)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <p style={{ fontWeight: 500, fontSize: 14 }}>{a.nome}</p>
                <p style={{ fontSize: 12, color: 'var(--text2)' }}>Vence {format(a.data, "dd/MM", { locale: ptBR })}</p>
              </div>
              {a.valor && <p style={{ color: 'var(--amber)', fontWeight: 700, fontFamily: 'Syne' }}>{fmt(a.valor)}</p>}
            </div>
          ))}
        </div>
      )}

      {/* Últimos gastos */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <h3 style={{ fontSize: 14, color: 'var(--text2)' }}>Últimos gastos</h3>
          <button onClick={() => navigate('/gastos')} style={{ fontSize: 12, color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: 2 }}>
            Ver todos <ChevronRight size={13} />
          </button>
        </div>
        {ultimosGastos.length === 0 ? (
          <div className="empty-state">Nenhum gasto este mês</div>
        ) : ultimosGastos.map(g => (
          <div key={g.id} className="card" style={{ marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 20 }}>{cats[g.categoria] || '📦'}</span>
              <div>
                <p style={{ fontSize: 14, fontWeight: 500 }}>{g.descricao}</p>
                <p style={{ fontSize: 12, color: 'var(--text2)' }}>{format(new Date(g.data + 'T12:00:00'), 'dd/MM', { locale: ptBR })}</p>
              </div>
            </div>
            <p style={{ color: 'var(--red)', fontWeight: 700, fontFamily: 'Syne' }}>-{fmt(g.valor)}</p>
          </div>
        ))}
      </div>

      {/* Botão de voz flutuante */}
      <BotaoVoz onSalvo={carregarDados} />
    </div>
  )
}
