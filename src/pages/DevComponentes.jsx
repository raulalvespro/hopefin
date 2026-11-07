// Vitrine dos componentes do design system (prompt 14). Só monta em DEV — a rota
// em App.jsx é cercada por import.meta.env.DEV. Serve pra conferir Button, Card,
// Tag, Money, ListItem, Meter, Avatar, EmptyState, MicButton, IconeCategoria e
// Toast nos dois temas (claro/escuro) sem depender do tema do sistema.
import { useState, useEffect, useRef } from 'react'
import { PiggyBank } from 'lucide-react'
import {
  Button, Card, Tag, Money, ListItem, Meter, EmptyState, MicButton,
  IconeCategoria, Avatar,
} from '../components/ui'
import { useToast } from '../contexts/ToastContext'
import ResumoCartao from '../components/ResumoCartao'
import { compartilharImagem } from '../lib/compartilharImagem'

function Secao({ titulo, children }) {
  return (
    <section style={{ marginBottom: 32 }}>
      <h2 style={{ fontSize: 14, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 14 }}>{titulo}</h2>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-start' }}>{children}</div>
    </section>
  )
}

const CATS = [
  { slug: 'mercado', emoji: '🛒', nome: 'Mercado' },
  { slug: 'transporte', emoji: '🚌', nome: 'Transporte' },
  { slug: 'combustivel', emoji: '⛽', nome: 'Combustível' },
  { slug: 'saude', emoji: '❤️', nome: 'Saúde' },
  { slug: 'lazer', emoji: '🎮', nome: 'Lazer' },
  { slug: 'padaria_do_ze', emoji: '🥖', nome: 'Padaria do Zé (custom)' },
]

export default function DevComponentes() {
  const { toast } = useToast()
  const resumoRef = useRef(null)
  const [tema, setTema] = useState('auto')
  const [salvando, setSalvando] = useState(false)
  const [ouvindo, setOuvindo] = useState(false)

  // Aplica o tema só nesta página; restaura o que o app usava ao sair.
  useEffect(() => {
    const root = document.documentElement
    const anterior = root.getAttribute('data-theme')
    if (tema === 'auto') root.removeAttribute('data-theme')
    else root.setAttribute('data-theme', tema)
    return () => {
      if (anterior) root.setAttribute('data-theme', anterior)
      else root.removeAttribute('data-theme')
    }
  }, [tema])

  const simularSalvar = () => {
    setSalvando(true)
    setTimeout(() => {
      setSalvando(false)
      toast('Gasto salvo!', 'ok', { acao: { label: 'Desfazer', onClick: () => toast('Desfeito', 'info') } })
    }, 1400)
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)', padding: '24px 16px 64px' }}>
      <div style={{ maxWidth: 760, margin: '0 auto' }}>
        <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, flexWrap: 'wrap', gap: 12 }}>
          <h1 style={{ fontSize: 24 }}>Componentes</h1>
          <div style={{ display: 'inline-flex', gap: 4, background: 'var(--bg3)', borderRadius: 'var(--radius-sm)', padding: 4 }}>
            {['auto', 'light', 'dark'].map(t => (
              <button key={t} onClick={() => setTema(t)}
                style={{ padding: '6px 12px', borderRadius: 6, fontSize: 13, fontWeight: 500,
                  background: tema === t ? 'var(--bg2)' : 'transparent', color: tema === t ? 'var(--text)' : 'var(--text2)' }}>
                {t === 'auto' ? 'Auto' : t === 'light' ? 'Claro' : 'Escuro'}
              </button>
            ))}
          </div>
        </header>
        <p style={{ fontSize: 13, color: 'var(--text3)', marginBottom: 28 }}>Vitrine do design system (prompt 14) — só em desenvolvimento.</p>

        <Secao titulo="Botões">
          <Button onClick={() => toast('Clique!', 'info')}>Salvar gasto</Button>
          <Button variant="secondary" onClick={() => toast('Cancelado', 'info')}>Cancelar</Button>
          <Button loading={salvando} onClick={simularSalvar}>{salvando ? 'Salvando…' : 'Simular salvar'}</Button>
          <Button disabled>Desativado</Button>
        </Secao>

        <Secao titulo="Dinheiro">
          <Money valor={1234.5} tipo="entrada" />
          <Money valor={89.9} tipo="gasto" />
          <Money valor={4500} tipo="neutro" />
          <Money valor={25000} tipo="neutro" size={28} />
        </Secao>

        <Secao titulo="Etiquetas">
          <Tag cor="verde">Pago</Tag>
          <Tag cor="vermelho">Atrasado</Tag>
          <Tag cor="azul">Agendado</Tag>
          <Tag cor="amber">Vence hoje</Tag>
          <Tag cor="roxo">Assinatura</Tag>
          <Tag cor="cinza">Rascunho</Tag>
        </Secao>

        <Secao titulo="Avatares (pilha)">
          <Avatar nome="Raul" />
          <Avatar nome="Ana" />
          <Avatar nome="Bruno" />
          <div style={{ display: 'flex', background: 'var(--bg)', paddingLeft: 10 }}>
            {['Raul', 'Ana', 'Bruno', 'Carla'].map(n => <Avatar key={n} nome={n} empilhado />)}
          </div>
        </Secao>

        <Secao titulo="Ícones de categoria">
          {CATS.map(c => (
            <div key={c.slug} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, width: 90, textAlign: 'center' }}>
              <div style={{ width: 44, height: 44, borderRadius: 'var(--radius)', background: 'var(--bg3)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text)' }}>
                <IconeCategoria slug={c.slug} emoji={c.emoji} />
              </div>
              <span style={{ fontSize: 11, color: 'var(--text2)' }}>{c.nome}</span>
            </div>
          ))}
        </Secao>

        <Secao titulo="Cartões + lista">
          <Card style={{ width: '100%' }}>
            <h3 style={{ fontSize: 16, marginBottom: 12 }}>Gastos recentes</h3>
            <ListItem icone={<IconeCategoria slug="mercado" />} titulo="Mercado" subtitulo="Hoje · Raul"
              valor={<Money valor={213.4} tipo="gasto" size={15} />} />
            <ListItem icone={<IconeCategoria slug="combustivel" />} titulo="Combustível" subtitulo="Ontem · Ana"
              valor={<Money valor={180} tipo="gasto" size={15} />} tag={<Tag cor="azul">Cartão</Tag>} />
            <ListItem icone={<IconeCategoria slug="saude" />} titulo="Farmácia" subtitulo="2 dias atrás · Raul"
              valor={<Money valor={47.9} tipo="gasto" size={15} />} divisoria={false} />
          </Card>
          <Card destaque style={{ width: '100%' }}>
            <p style={{ fontSize: 13, opacity: 0.8, marginBottom: 6 }}>Saldo do mês</p>
            <Money valor={2340.6} tipo="neutro" size={30} />
          </Card>
        </Secao>

        <Secao titulo="Medidores (orçamento)">
          <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
                <span>Mercado</span><span style={{ color: 'var(--text2)' }}>R$ 620 / R$ 800</span>
              </div>
              <Meter valor={78} cor="var(--accent)" />
            </div>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
                <span>Lazer</span><span style={{ color: 'var(--text2)' }}>R$ 480 / R$ 400</span>
              </div>
              <Meter valor={120} cor="var(--red)" />
            </div>
          </div>
        </Secao>

        <Secao titulo="Entrada por voz">
          <MicButton ouvindo={ouvindo} onClick={() => setOuvindo(o => !o)} />
          <span style={{ fontSize: 13, color: 'var(--text2)', alignSelf: 'center' }}>{ouvindo ? 'Ouvindo…' : 'Toque pra falar'}</span>
        </Secao>

        <Secao titulo="Avisos (toast)">
          <Button variant="secondary" onClick={() => toast('Tudo certo por aqui', 'ok')}>Sucesso</Button>
          <Button variant="secondary" onClick={() => toast('Algo deu errado', 'erro')}>Erro</Button>
          <Button variant="secondary" onClick={() => toast('Dica: você pode usar a voz', 'info')}>Info</Button>
        </Secao>

        <Secao titulo="Resumo do mês (cartão compartilhável) — dados de exemplo">
          <div ref={resumoRef}>
            <ResumoCartao exportar nomeMes="novembro" nomeMesAnterior="outubro" grupoNome="Casa Exemplo" positivo resultado={1240} difAnt={380}
              meta={{ nome: 'Viagem', saldo: 2100, meta: 3000, pct: 70 }} fixasTotal={12} fixasPagas={12} vozPct={64} />
          </div>
          <Button onClick={async () => {
            try { const r = await compartilharImagem(resumoRef.current, { nomeArquivo: 'resumo-exemplo.png' }); toast('Imagem: ' + r, 'ok') }
            catch (e) { console.error(e); toast('Falhou: ' + e.message, 'erro') }
          }}>Gerar imagem</Button>
        </Secao>

        <Secao titulo="Estado vazio">
          <Card style={{ width: '100%' }}>
            <EmptyState
              ilustracao={<PiggyBank size={40} strokeWidth={1.5} color="var(--text3)" />}
              titulo="Nenhum cofrinho ainda"
              texto="Crie um cofrinho pra guardar dinheiro pra um objetivo da família."
              acao={<Button onClick={() => toast('Criar cofrinho', 'info')}>Criar cofrinho</Button>}
            />
          </Card>
        </Secao>
      </div>
    </div>
  )
}
