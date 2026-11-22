import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Mail, Plus, Pencil, Eye, FlaskConical, Save, Trash2, X, Pause, Play, UserMinus, Repeat, Lock, Sparkles, RefreshCw, BarChart3, AlertTriangle } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useToast } from '../contexts/ToastContext'
import { dataHora, dataCurta } from './secoes'

// E-mails automáticos (22/11/2026): todos os e-mails que o HopeFin manda sozinho, com o texto no banco
// (email_modelos, migração 0090) — o Raul edita, liga/desliga, vê a prévia e manda um teste pra ele,
// sem deploy. Aba Remarketing (D11): as sequências pra quem testou e não assinou / cancelou (nascem
// desligadas), as pessoas em cada etapa e o que aconteceu com cada e-mail.
// Banco: admin_email_* e admin_remarketing_* (0092). Prévia e teste: Edge Function admin-email.

const CATEGORIAS = [
  { v: 'teste', nome: 'Teste grátis' },
  { v: 'conta', nome: 'Conta e uso do app' },
  { v: 'cobranca', nome: 'Assinatura e cobrança' },
  { v: 'grupo', nome: 'Grupo' },
  { v: 'suporte', nome: 'Suporte' },
  { v: 'personalizado', nome: 'Criadas por você' },
  { v: 'interno', nome: 'Avisos só pra você' },
]
const GATILHOS = [
  { v: 'apos_cadastro', nome: 'dias depois de criar a conta' },
  { v: 'apos_fim_teste', nome: 'dias depois do teste acabar (sem assinar)' },
  { v: 'apos_cancelar', nome: 'dias depois do acesso pago acabar (cancelou)' },
  { v: 'sem_entrar', nome: 'dias sem entrar no app' },
]
const TELAS = [
  { v: '', nome: 'Sem botão' }, { v: '/', nome: 'Início' }, { v: '/planos', nome: 'Meu plano' },
  { v: '/contas-do-mes', nome: 'Contas do mês' }, { v: '/fechamento', nome: 'Fechamento' },
  { v: '/gastos', nome: 'Gastos' }, { v: '/configuracoes', nome: 'Configurações' },
  { v: '/boas-vindas', nome: 'Primeiros passos' }, { v: '/?ajuda=chamados', nome: 'Meus chamados' },
  { v: 'outro', nome: 'Outro endereço (https://…)' },
]
const VARIAVEIS = {
  ola: '"Oi, Ana!" (ou "Oi!" sem nome)', nome: 'primeiro nome', oferta: 'parágrafo com o preço (lançamento até 31/12 ou normal)',
  fim: 'dia que o teste acaba', dias_restantes: '"3 dias"', quem: 'quem entrou / quem removeu', grupo: 'nome do grupo',
  qtd_contas: '"2 contas"', total: 'total das contas', lista_contas: 'tabela das contas (montada pelo app)',
  mes: 'mês que fechou', saldo: 'saldo do mês', sobra: 'sobra do mês', numeros: 'números do mês (montados pelo app)',
  data_renovacao: 'data da renovação', valor: 'valor cobrado', forma: '"em 12x" / "à vista"',
  situacao: 'frase do reembolso / até quando tem acesso', codigo: 'código do chamado', assunto_chamado: 'assunto do chamado',
  resposta: 'sua resposta (em destaque)',
}
const ERROS = {
  assunto_invalido: 'O assunto precisa ter de 3 a 150 letras.', texto_invalido: 'Escreva o texto do e-mail.',
  titulo_invalido: 'Título ou resumo muito longo.', botao_invalido: 'O botão precisa de texto (até 30 letras) e de um destino.',
  link_invalido: 'O destino do botão precisa ser uma tela do app ou começar com https://', gatilho_invalido: 'Escolha quando o e-mail sai.',
  nao_editavel: 'Esse aviso não tem texto editável.', nao_pode_excluir: 'Só dá pra excluir as automações criadas por você.',
  acao_invalida: 'Essa pessoa já mudou de situação. Atualize a lista.', nao_autorizado: 'Confirme o código do celular no painel.',
}
const msgErro = (e) => { const m = String(e?.message || e || ''); const k = Object.keys(ERROS).find(x => m.includes(x)); return k ? ERROS[k] : (m || 'Não deu certo.') }
const STATUS_PESSOA = {
  ativo: ['Recebendo', 'tag-green'], pausado: ['Pausado', 'tag-amber'], removido: ['Tirado por você', 'tag-red'],
  assinou: ['Assinou 🎉', 'tag-blue'], saiu: ['Pediu pra sair', 'tag-red'],
}
const pct = (a, b) => (b ? `${Math.round((a / b) * 100)}%` : '—')

function Chave({ ligado, onChange, travado, titulo }) {
  return (
    <button type="button" role="switch" aria-checked={ligado} title={titulo} disabled={travado} onClick={() => onChange(!ligado)}
      style={{ width: 42, height: 24, borderRadius: 999, border: 'none', padding: 2, flexShrink: 0, cursor: travado ? 'not-allowed' : 'pointer',
        background: ligado ? 'var(--accent)' : 'var(--border2)', opacity: travado ? 0.6 : 1, transition: 'background .15s' }}>
      <span style={{ display: 'block', width: 20, height: 20, borderRadius: '50%', background: '#fff', transform: `translateX(${ligado ? 18 : 0}px)`, transition: 'transform .15s' }} />
    </button>
  )
}

function Numeros({ m }) {
  if (!m.editavel) return null
  return (
    <span>
      {m.enviados_30d} enviados em 30 dias · {m.enviados} no total
      {(m.abertos > 0 || m.clicados > 0) && <> · {m.abertos} abriram ({pct(m.abertos, m.enviados)}) · {m.clicados} clicaram</>}
      {m.assinaram_depois != null && <> · <strong style={{ color: 'var(--accent-text)' }}>{m.assinaram_depois} assinaram depois</strong></>}
      {m.ultimo_envio && <> · último {dataCurta(m.ultimo_envio)}</>}
    </span>
  )
}

function quandoSai(m) {
  if (m.gatilho === 'data_fixa') return `No dia ${m.data_envio ? dataCurta(m.data_envio + 'T12:00:00') : '—'}`
  if (m.sequencia) return `${m.dias} dia(s) depois de entrar na sequência`
  if (m.personalizado && m.gatilho) return `${m.dias} ${GATILHOS.find(g => g.v === m.gatilho)?.nome || ''}`
  if (m.chave === 'fim_trial_3d') return `${m.dias} dia(s) antes do teste acabar`
  if (m.chave === 'fim_trial_d1') return `${m.dias} dia(s) depois do teste acabar, pra quem não assinou`
  return m.descricao
}

// Linha "Último teste": enviado → entregue → abriu → clicou (o teste não entra nos números do e-mail).
function UltimoTeste({ t, lendo, onAtualizar }) {
  const passo = (ok, txt) => (
    <span style={{ color: ok ? 'var(--accent-text)' : 'var(--text2)', fontWeight: ok ? 600 : 400 }}>{ok ? '✓' : '·'} {txt}</span>
  )
  const hora = (d) => d ? new Date(d).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : ''
  return (
    <div style={{ marginTop: 10, padding: '10px 12px', borderRadius: 10, background: 'var(--bg2)', border: '1px solid var(--border2)', fontSize: 12.5, lineHeight: 1.6 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <strong>Último teste</strong>
        <span style={{ color: 'var(--text2)' }}>{dataHora(t.enviado_em)}</span>
        <button className="btn-ghost" onClick={onAtualizar} disabled={lendo} title="Atualizar" style={{ marginLeft: 'auto', padding: '3px 8px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
          <RefreshCw size={12} /> {lendo ? 'Olhando…' : 'Atualizar'}
        </button>
      </div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        {passo(true, 'enviado')}
        {passo(!!t.entregue_em, `entregue ${hora(t.entregue_em)}`)}
        {passo(!!t.aberto_em, `abriu ${hora(t.aberto_em)}`)}
        {passo(!!t.clicado_em, `clicou ${hora(t.clicado_em)}`)}
        {t.problema && <span style={{ color: 'var(--red-text)', fontWeight: 600 }}>{t.problema === 'spam' ? 'marcado como spam' : 'voltou (devolvido)'}</span>}
      </div>
      <p style={{ color: 'var(--text2)', fontSize: 11.5, marginTop: 2 }}>Abra o e-mail e toque no botão: aparece aqui em poucos segundos. Teste não conta nos números do e-mail.</p>
    </div>
  )
}

// ───────────── Editor (criar / editar um e-mail) ─────────────
function Editor({ modelo, novo, onFechar, onSalvo }) {
  const { toast } = useToast()
  const linkInicial = modelo.botao_link || ''
  const ehTela = TELAS.some(t => t.v === linkInicial && t.v !== 'outro')
  const [f, setF] = useState({
    nome: modelo.nome || '', assunto: modelo.assunto || '', titulo: modelo.titulo || '', preheader: modelo.preheader || '',
    corpo: modelo.corpo || '', botao_texto: modelo.botao_texto || '', dias: modelo.dias ?? 0, gatilho: modelo.gatilho || 'apos_fim_teste',
    data_envio: modelo.data_envio || '', tela: ehTela ? linkInicial : (linkInicial ? 'outro' : ''), link: ehTela ? '' : linkInicial,
  })
  const [previa, setPrevia] = useState(null)
  const [ocupado, setOcupado] = useState(null)
  const [ultimoTeste, setUltimoTeste] = useState(null)
  const [lendoTeste, setLendoTeste] = useState(false)
  const corpoRef = useRef(null)

  // Último teste deste e-mail (entregue/aberto/clicado vêm do Resend pelo webhook).
  const lerTeste = useCallback(async () => {
    if (novo) return
    setLendoTeste(true)
    const { data } = await supabase.functions.invoke('admin-email', { body: { acao: 'teste_status', chave: modelo.chave } })
    setLendoTeste(false)
    if (data?.ok) setUltimoTeste(data.teste)
  }, [novo, modelo.chave])
  useEffect(() => { lerTeste() }, [lerTeste])
  // Enquanto o teste não foi aberto e clicado, confere de novo a cada 15 s (só com o editor aberto).
  useEffect(() => {
    if (!ultimoTeste || (ultimoTeste.aberto_em && ultimoTeste.clicado_em) || ultimoTeste.problema) return
    const t = setInterval(lerTeste, 15000)
    return () => clearInterval(t)
  }, [ultimoTeste, lerTeste])
  const set = (k, v) => setF(x => ({ ...x, [k]: v }))
  const botaoLink = f.tela === 'outro' ? f.link.trim() : f.tela
  const variaveis = modelo.variaveis?.length ? modelo.variaveis : ['ola', 'nome', 'oferta']

  const dados = () => {
    const d = { assunto: f.assunto, titulo: f.titulo, preheader: f.preheader, corpo: f.corpo,
      botao_texto: botaoLink ? (f.botao_texto || 'Abrir o HopeFin') : '', botao_link: botaoLink }
    if (modelo.dias_editavel || modelo.personalizado || novo) d.dias = Number(f.dias) || 0
    if (modelo.gatilho === 'data_fixa') d.data_envio = f.data_envio
    if (novo || modelo.personalizado) d.nome = f.nome
    if (novo && !modelo.sequencia) d.gatilho = f.gatilho
    if (novo && modelo.sequencia) d.sequencia = modelo.sequencia
    if (!novo && modelo.personalizado && !modelo.sequencia) d.gatilho = f.gatilho
    return d
  }

  function inserir(v) {
    const el = corpoRef.current
    const txt = `{${v}}`
    if (!el) { set('corpo', f.corpo + txt); return }
    const ini = el.selectionStart ?? f.corpo.length
    const fim = el.selectionEnd ?? ini
    set('corpo', f.corpo.slice(0, ini) + txt + f.corpo.slice(fim))
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(ini + txt.length, ini + txt.length) })
  }

  async function chamar(acao) {
    if (novo) { toast('Salve a automação primeiro; depois dá pra ver a prévia e mandar o teste.', 'erro'); return }
    setOcupado(acao)
    const { data, error } = await supabase.functions.invoke('admin-email', { body: { acao, chave: modelo.chave, modelo: dados() } })
    setOcupado(null)
    if (error || data?.erro) {
      let msg = data?.erro
      try { msg = msg || (await error?.context?.json())?.erro } catch { /* ignore */ }
      toast(msg || 'Não deu certo.', 'erro'); return
    }
    if (acao === 'previa') setPrevia(data)
    else { toast(`Teste enviado pra ${data.para}. Confira a caixa de entrada (e a aba Promoções).`, 'ok'); if (data.teste) setUltimoTeste(data.teste) }
  }

  async function salvar() {
    setOcupado('salvar')
    const { error } = await supabase.rpc('admin_email_modelo_salvar', { p_chave: novo ? null : modelo.chave, p_dados: dados() })
    setOcupado(null)
    if (error) { toast(msgErro(error), 'erro'); return }
    toast(novo ? 'Automação criada. Ela nasce desligada: ligue quando quiser.' : 'Salvo. Os próximos envios já saem com esse texto.', 'ok')
    onSalvo()
  }

  async function excluir() {
    if (!window.confirm('Excluir esta automação? Os envios que já saíram continuam no histórico.')) return
    const { error } = await supabase.rpc('admin_email_modelo_excluir', { p_chave: modelo.chave })
    if (error) { toast(msgErro(error), 'erro'); return }
    toast('Automação excluída.', 'ok'); onSalvo()
  }

  const valido = f.assunto.trim().length >= 3 && f.corpo.trim().length >= 3 && (f.tela !== 'outro' || /^https:\/\//.test(f.link.trim()))
  const rotuloDias = modelo.chave === 'fim_trial_3d' ? 'Quantos dias antes do fim do teste'
    : modelo.chave === 'fim_trial_d1' ? 'Quantos dias depois do fim do teste'
    : modelo.sequencia ? 'Quantos dias depois de entrar na sequência' : 'Quantos dias'

  return (
    <div style={{ background: 'var(--bg3)', borderRadius: 'var(--radius-sm)', padding: 14, margin: '6px 0 14px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <strong style={{ fontSize: 14 }}>{novo ? (modelo.sequencia ? 'Nova etapa do remarketing' : 'Nova automação') : `Editar: ${modelo.nome}`}</strong>
        <button className="adm-icbtn" onClick={onFechar} aria-label="Fechar"><X size={16} /></button>
      </div>
      {modelo.essencial && !novo && (
        <p style={{ fontSize: 12.5, color: 'var(--text2)', marginBottom: 10, display: 'flex', gap: 6, alignItems: 'center' }}>
          <Lock size={13} /> Este e-mail é essencial: dá pra mudar o texto, mas ele não pode ser desligado.
        </p>
      )}

      {(novo || modelo.personalizado) && (
        <div className="form-group"><label>Nome (só aparece pra você)</label>
          <input value={f.nome} maxLength={60} onChange={e => set('nome', e.target.value)} placeholder="Ex.: Lembrete pra quem sumiu" />
        </div>
      )}
      {(novo || modelo.personalizado) && !modelo.sequencia ? (
        <div className="form-row">
          <div className="form-group" style={{ maxWidth: 110 }}><label>Dias</label>
            <input type="number" inputMode="numeric" min="0" max="365" value={f.dias} onChange={e => set('dias', e.target.value)} />
          </div>
          <div className="form-group"><label>Quando sai</label>
            <select value={f.gatilho} onChange={e => set('gatilho', e.target.value)}>
              {GATILHOS.map(g => <option key={g.v} value={g.v}>{g.nome}</option>)}
            </select>
          </div>
        </div>
      ) : (modelo.dias_editavel || (novo && modelo.sequencia)) ? (
        <div className="form-group" style={{ maxWidth: 320 }}><label>{rotuloDias}</label>
          <input type="number" inputMode="numeric" min="0" max="365" value={f.dias} onChange={e => set('dias', e.target.value)} />
        </div>
      ) : modelo.gatilho === 'data_fixa' ? (
        <div className="form-group" style={{ maxWidth: 220 }}><label>Dia do envio</label>
          <input type="date" value={f.data_envio || ''} onChange={e => set('data_envio', e.target.value)} />
        </div>
      ) : null}

      <div className="form-group"><label>Assunto ({f.assunto.length}/150)</label>
        <input value={f.assunto} maxLength={150} onChange={e => set('assunto', e.target.value)} />
      </div>
      <div className="form-row">
        <div className="form-group"><label>Título dentro do e-mail</label>
          <input value={f.titulo} maxLength={120} onChange={e => set('titulo', e.target.value)} placeholder="Vazio = igual ao assunto" />
        </div>
        <div className="form-group"><label>Resumo na caixa de entrada</label>
          <input value={f.preheader} maxLength={200} onChange={e => set('preheader', e.target.value)} placeholder="Frase que aparece ao lado do assunto" />
        </div>
      </div>
      <div className="form-group"><label>Texto ({f.corpo.length}/5000)</label>
        <textarea ref={corpoRef} value={f.corpo} maxLength={5000} rows={10} onChange={e => set('corpo', e.target.value)} style={{ width: '100%', resize: 'vertical', fontFamily: 'inherit' }} />
        <p style={{ fontSize: 12, color: 'var(--text2)', marginTop: 4, lineHeight: 1.5 }}>
          Linha em branco = novo parágrafo · <strong>**assim**</strong> fica em negrito · toque num trecho abaixo pra colocar no texto (ele se preenche sozinho):
        </p>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
          {variaveis.map(v => (
            <button key={v} type="button" onClick={() => inserir(v)} title={VARIAVEIS[v] || v}
              style={{ padding: '4px 10px', borderRadius: 999, fontSize: 12, border: '1px solid var(--border2)', background: 'var(--bg2)', color: 'var(--text)' }}>
              {`{${v}}`} <span style={{ color: 'var(--text2)' }}>· {VARIAVEIS[v] || ''}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="form-row">
        <div className="form-group"><label>Botão leva pra</label>
          <select value={f.tela} onChange={e => set('tela', e.target.value)}>
            {TELAS.map(t => <option key={t.v} value={t.v}>{t.nome}</option>)}
          </select>
        </div>
        {f.tela === 'outro' && (
          <div className="form-group"><label>Endereço</label>
            <input value={f.link} onChange={e => set('link', e.target.value)} placeholder="https://hopefin.com.br/…" />
          </div>
        )}
        <div className="form-group"><label>Texto do botão</label>
          <input value={f.botao_texto} maxLength={30} disabled={!f.tela} onChange={e => set('botao_texto', e.target.value)} placeholder={f.tela ? 'Ex.: Abrir o HopeFin' : '—'} />
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button className="btn-ghost" disabled={!valido || !!ocupado || novo} onClick={() => chamar('previa')} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Eye size={15} /> {ocupado === 'previa' ? 'Montando…' : 'Prévia'}
        </button>
        <button className="btn-ghost" disabled={!valido || !!ocupado || novo} onClick={() => chamar('teste')} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <FlaskConical size={15} /> {ocupado === 'teste' ? 'Enviando…' : 'Enviar teste pra mim'}
        </button>
        <button className="btn-primary" disabled={!valido || !!ocupado} onClick={salvar} style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto' }}>
          <Save size={15} /> {ocupado === 'salvar' ? 'Salvando…' : 'Salvar'}
        </button>
        {modelo.personalizado && !novo && (
          <button className="btn-ghost" onClick={excluir} style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--red-text)' }}>
            <Trash2 size={15} /> Excluir
          </button>
        )}
      </div>
      {!novo && <p style={{ fontSize: 12, color: 'var(--text2)', marginTop: 8 }}>A prévia e o teste usam o que está na tela, mesmo sem salvar, com dados de exemplo.</p>}
      {!novo && ultimoTeste && <UltimoTeste t={ultimoTeste} lendo={lendoTeste} onAtualizar={lerTeste} />}

      {previa && (
        <div style={{ marginTop: 14 }}>
          <p style={{ fontSize: 12.5, color: 'var(--text2)', marginBottom: 6, lineHeight: 1.5 }}>
            <strong style={{ color: 'var(--text)' }}>De:</strong> {previa.remetente}<br />
            <strong style={{ color: 'var(--text)' }}>Assunto:</strong> {previa.assunto}
          </p>
          <iframe title="Prévia do e-mail" srcDoc={previa.html} sandbox=""
            style={{ width: '100%', height: 620, border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', background: '#f6f7f9' }} />
        </div>
      )}
    </div>
  )
}

// ───────────── Linha de um e-mail na lista ─────────────
function LinhaModelo({ m, aberto, onEditar, onLigar }) {
  return (
    <div style={{ padding: '10px 0', borderTop: '1px solid var(--border)', fontSize: 13 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <Chave ligado={m.ligado} travado={m.essencial || !m.editavel} onChange={(v) => onLigar(m, v)}
          titulo={m.essencial ? 'Essencial: sempre ligado' : m.ligado ? 'Ligado — toque pra desligar' : 'Desligado — toque pra ligar'} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <strong>{m.nome}</strong>
          {m.essencial && m.editavel && <span className="tag tag-blue" style={{ marginLeft: 6 }}>essencial</span>}
          {!m.ligado && <span className="tag tag-amber" style={{ marginLeft: 6 }}>desligado</span>}
          <p style={{ color: 'var(--text2)', marginTop: 2, lineHeight: 1.45 }}>{quandoSai(m)}</p>
          {m.editavel && m.assunto && <p style={{ color: 'var(--text2)', marginTop: 2, lineHeight: 1.45, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>“{m.assunto}”</p>}
          <p style={{ color: 'var(--text2)', marginTop: 2, fontSize: 12 }}><Numeros m={m} /></p>
        </div>
        {m.editavel && (
          <button className="btn-ghost" onClick={() => onEditar(aberto ? null : m.chave)} style={{ padding: '6px 12px', fontSize: 12.5, display: 'flex', gap: 5, alignItems: 'center', flexShrink: 0 }}>
            <Pencil size={13} /> {aberto ? 'Fechar' : 'Editar'}
          </button>
        )}
      </div>
    </div>
  )
}

// ───────────── Aba Remarketing ─────────────
function Remarketing({ painel, recarregar, editando, setEditando, ligarModelo }) {
  const { toast } = useToast()
  const [pessoas, setPessoas] = useState(null)
  const [filtro, setFiltro] = useState('todos')
  const [confirmar, setConfirmar] = useState(null)
  const [novaEtapa, setNovaEtapa] = useState(null)

  const carregarPessoas = useCallback(async () => {
    const { data, error } = await supabase.rpc('admin_remarketing_pessoas')
    if (error) { toast(msgErro(error), 'erro'); setPessoas([]); return }
    setPessoas(data || [])
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { carregarPessoas() }, [carregarPessoas])

  const modelos = painel.modelos.filter(m => m.categoria === 'remarketing')
  const nomeModelo = (k) => modelos.find(m => m.chave === k)?.nome || k

  async function ligarSequencia(q, ligada) {
    setConfirmar(null)
    const { error } = await supabase.rpc('admin_email_sequencia_salvar', { p_chave: q.chave, p_ligada: ligada, p_intervalo: null })
    if (error) { toast(msgErro(error), 'erro'); return }
    toast(ligada ? 'Sequência ligada. Os e-mails começam a sair amanhã, às 10h30.' : 'Sequência pausada. Ninguém recebe nada até você ligar de novo.', 'ok')
    recarregar()
  }
  async function acaoPessoa(p, acao) {
    if (acao === 'remover' && !window.confirm(`Tirar ${p.nome || p.email} da sequência? A pessoa não recebe mais nenhum e-mail dela.`)) return
    const { error } = await supabase.rpc('admin_remarketing_pessoa', { p_id: p.id, p_acao: acao })
    if (error) { toast(msgErro(error), 'erro'); return }
    toast(acao === 'pausar' ? 'Pausado pra essa pessoa.' : acao === 'retomar' ? 'Voltou a receber.' : 'Tirada da sequência.', 'ok')
    carregarPessoas(); recarregar()
  }

  const lista = (pessoas || []).filter(p => filtro === 'todos' || p.status === filtro || p.sequencia === filtro)

  return (
    <>
      <p style={{ fontSize: 13, color: 'var(--text2)', margin: '0 0 14px', lineHeight: 1.55 }}>
        E-mails pra quem testou e não assinou, e pra quem cancelou. Saem de <strong style={{ color: 'var(--text)' }}>{painel.config?.remetente_campanha}</strong>,
        no máximo 1 por semana, sempre com o link “não quero receber”. A pessoa sai sozinha quando assina ou pede pra sair.
      </p>

      {[...painel.sequencias].sort((a, b) => (a.chave === 'remarketing_teste' ? -1 : b.chave === 'remarketing_teste' ? 1 : 0)).map(q => {
        const etapas = modelos.filter(m => m.sequencia === q.chave).sort((a, b) => (a.dias ?? 0) - (b.dias ?? 0))
        return (
          <div key={q.chave} style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: 14, marginBottom: 14 }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <Chave ligado={q.ligada} onChange={(v) => v ? setConfirmar(q) : ligarSequencia(q, false)} titulo={q.ligada ? 'Ligada — toque pra pausar' : 'Desligada — toque pra ligar'} />
              <div style={{ flex: 1 }}>
                <strong style={{ fontSize: 14 }}>{q.nome}</strong>
                <span className={`tag ${q.ligada ? 'tag-green' : 'tag-amber'}`} style={{ marginLeft: 8 }}>{q.ligada ? 'ligada' : 'desligada'}</span>
                <p style={{ fontSize: 12.5, color: 'var(--text2)', marginTop: 2 }}>{q.descricao}</p>
              </div>
            </div>
            <p style={{ fontSize: 12.5, color: 'var(--text2)', margin: '8px 0 4px' }}>
              {q.ativos} recebendo · {q.pausados} pausados · <strong style={{ color: 'var(--accent-text)' }}>{q.assinaram} assinaram</strong> · {q.sairam} saíram · {q.total} no total
            </p>
            {confirmar?.chave === q.chave && (
              <div style={{ marginTop: 8, padding: 12, borderRadius: 'var(--radius-sm)', border: '1px solid var(--amber)', background: 'var(--amber-dim)' }}>
                <p style={{ fontSize: 13.5, marginBottom: 10, lineHeight: 1.5 }}>
                  Ligar “<strong>{q.nome}</strong>”? A partir de amanhã (10h30), quem está na sequência começa a receber os e-mails ligados abaixo.
                  Antes, vale mandar um teste de cada um pra você.
                </p>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn-ghost" onClick={() => setConfirmar(null)} style={{ flex: 1 }}>Voltar</button>
                  <button className="btn-primary" onClick={() => ligarSequencia(q, true)} style={{ flex: 1 }}>Sim, ligar</button>
                </div>
              </div>
            )}
            {etapas.map(m => (
              <div key={m.chave}>
                <LinhaModelo m={m} aberto={editando === m.chave} onEditar={setEditando} onLigar={ligarModelo} />
                {editando === m.chave && <Editor modelo={m} onFechar={() => setEditando(null)} onSalvo={() => { setEditando(null); recarregar() }} />}
              </div>
            ))}
            {novaEtapa === q.chave
              ? <Editor novo modelo={{ sequencia: q.chave, dias: 14, variaveis: ['ola', 'nome', 'oferta'], botao_link: '/planos', botao_texto: 'Voltar pro HopeFin' }}
                  onFechar={() => setNovaEtapa(null)} onSalvo={() => { setNovaEtapa(null); recarregar() }} />
              : <button className="btn-ghost" onClick={() => setNovaEtapa(q.chave)} style={{ marginTop: 8, fontSize: 12.5, display: 'flex', gap: 5, alignItems: 'center' }}><Plus size={13} /> Nova etapa</button>}
          </div>
        )
      })}

      {modelos.filter(m => !m.sequencia).length > 0 && (
        <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: 14, marginBottom: 14 }}>
          <strong style={{ fontSize: 14 }}>Data marcada</strong>
          <p style={{ fontSize: 12.5, color: 'var(--text2)', marginTop: 2 }}>Vai pra todo mundo das sequências ligadas, no dia marcado (passa na frente das outras etapas).</p>
          {modelos.filter(m => !m.sequencia).map(m => (
            <div key={m.chave}>
              <LinhaModelo m={m} aberto={editando === m.chave} onEditar={setEditando} onLigar={ligarModelo} />
              {editando === m.chave && <Editor modelo={m} onFechar={() => setEditando(null)} onSalvo={() => { setEditando(null); recarregar() }} />}
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, margin: '6px 0 8px', flexWrap: 'wrap' }}>
        <h3 style={{ fontSize: 14 }}>Quem está na sequência</h3>
        <select value={filtro} onChange={e => setFiltro(e.target.value)} style={{ width: 'auto' }}>
          <option value="todos">Todos</option>
          {painel.sequencias.map(q => <option key={q.chave} value={q.chave}>{q.nome}</option>)}
          {Object.entries(STATUS_PESSOA).map(([k, [n]]) => <option key={k} value={k}>{n}</option>)}
        </select>
      </div>
      {!pessoas ? <p style={{ fontSize: 13, color: 'var(--text2)' }}>Carregando…</p>
        : lista.length === 0 ? <p style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.5 }}>Ninguém por aqui ainda. Todo dia, quem terminar o teste sem assinar ou cancelar entra sozinho na sequência.</p>
        : lista.map(p => {
          const [rot, cls] = STATUS_PESSOA[p.status] || [p.status, 'tag-blue']
          const seq = painel.sequencias.find(q => q.chave === p.sequencia)
          return (
            <div key={p.id} style={{ padding: '10px 0', borderTop: '1px solid var(--border)', fontSize: 13 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
                <div style={{ minWidth: 0 }}>
                  <strong>{p.nome || '—'}</strong> <span className={`tag ${cls}`} style={{ marginLeft: 4 }}>{rot}</span>
                  <p style={{ color: 'var(--text2)', marginTop: 2 }}>{p.email} · {p.grupo || '—'}</p>
                  <p style={{ color: 'var(--text2)', marginTop: 2 }}>{seq?.nome || p.sequencia} · entrou em {dataCurta(p.entrou_em + 'T12:00:00')}{p.assinou_em && <> · assinou em {dataCurta(p.assinou_em)}</>}</p>
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  {p.status === 'ativo' && <button className="btn-ghost" title="Pausar pra essa pessoa" onClick={() => acaoPessoa(p, 'pausar')} style={{ padding: '5px 9px' }}><Pause size={14} /></button>}
                  {p.status === 'pausado' && <button className="btn-ghost" title="Voltar a enviar" onClick={() => acaoPessoa(p, 'retomar')} style={{ padding: '5px 9px' }}><Play size={14} /></button>}
                  {['ativo', 'pausado'].includes(p.status) && <button className="btn-ghost" title="Tirar da sequência" onClick={() => acaoPessoa(p, 'remover')} style={{ padding: '5px 9px', color: 'var(--red-text)' }}><UserMinus size={14} /></button>}
                </div>
              </div>
              {p.envios?.length > 0 && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                  {p.envios.map((e, i) => (
                    <span key={i} className={`tag ${e.problema ? 'tag-red' : e.clicado_em ? 'tag-green' : e.aberto_em ? 'tag-blue' : ''}`} title={dataHora(e.enviado_em)}
                      style={!e.problema && !e.aberto_em ? { background: 'var(--bg3)', color: 'var(--text2)' } : undefined}>
                      {nomeModelo(e.chave)} · {dataCurta(e.enviado_em)} · {e.problema === 'spam' ? 'marcou spam' : e.problema ? 'voltou' : e.clicado_em ? 'clicou' : e.aberto_em ? 'abriu' : 'enviado'}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )
        })}
    </>
  )
}

// ───────────── Resultados (0094) ─────────────
// Taxas sobre os e-mails RASTREADOS (enviados depois que o rastreio do Resend foi ligado, 22/11).
// Alerta: devolvido acima de 4% ou spam acima de 0,1% derrubam a reputação do domínio.
const PERIODOS = [[7, '7 dias'], [30, '30 dias'], [90, '90 dias']]
const LIMITE_DEVOLVIDO = 0.04
const LIMITE_SPAM = 0.001

function Resultados() {
  const { toast } = useToast()
  const [dias, setDias] = useState(30)
  const [r, setR] = useState(null)
  const [ordem, setOrdem] = useState('enviados')

  const carregar = useCallback(async () => {
    setR(null)
    const { data, error } = await supabase.rpc('admin_email_resultados', { p_dias: dias })
    if (error) { toast(msgErro(error), 'erro'); return }
    setR(data)
  }, [dias]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { carregar() }, [carregar])

  const linhas = useMemo(() => {
    if (!r) return []
    const taxa = (x, k) => (x.rastreados ? x[k] / x.rastreados : -1)
    const val = (x) => ordem === 'enviados' ? x.enviados : ordem === 'assinaram' ? (x.assinaram_depois ?? -1) : taxa(x, ordem)
    return [...r.por_email].sort((a, b) => val(b) - val(a))
  }, [r, ordem])

  if (!r) return <p style={{ fontSize: 13, color: 'var(--text2)' }}>Carregando…</p>
  const t = r.totais
  const base = t.rastreados
  const alertaDev = base > 0 && t.devolvidos / base > LIMITE_DEVOLVIDO
  const alertaSpam = base > 0 && t.spam / base > LIMITE_SPAM
  const cards = [
    { label: 'Enviados', valor: t.enviados, sub: t.erros ? `${t.erros} com erro` : null },
    { label: 'Entregues', valor: pct(t.entregues, base), sub: `${t.entregues} de ${base}` },
    { label: 'Abriram', valor: pct(t.abertos, base), sub: `${t.abertos} de ${base}` },
    { label: 'Clicaram', valor: pct(t.clicados, base), sub: `${t.clicados} de ${base}` },
    { label: 'Devolvidos', valor: t.devolvidos, sub: base ? pct(t.devolvidos, base) : null, alerta: alertaDev },
    { label: 'Spam', valor: t.spam, sub: base ? pct(t.spam, base) : null, alerta: alertaSpam },
  ]
  const thBtn = (k, n) => (
    <th><button onClick={() => setOrdem(k)} style={{ fontWeight: ordem === k ? 700 : 500, color: ordem === k ? 'var(--accent-text)' : 'inherit' }}>{n}{ordem === k ? ' ↓' : ''}</button></th>
  )

  return (
    <div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        {PERIODOS.map(([d, n]) => (
          <button key={d} onClick={() => setDias(d)} aria-pressed={dias === d} className="btn-ghost"
            style={{ padding: '5px 12px', fontSize: 12.5, borderColor: dias === d ? 'var(--accent)' : undefined, color: dias === d ? 'var(--accent-text)' : undefined, fontWeight: dias === d ? 700 : 500 }}>
            {n}
          </button>
        ))}
        <button className="btn-ghost" onClick={carregar} style={{ marginLeft: 'auto', padding: '5px 10px', fontSize: 12, display: 'flex', gap: 4, alignItems: 'center' }}><RefreshCw size={12} /> Atualizar</button>
      </div>

      {t.enviados > base && (
        <p style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 10, lineHeight: 1.5 }}>
          O rastreio começou em {dataCurta(r.rastreio_desde)}: as porcentagens contam só os {base} e-mails enviados desde então
          (os {t.enviados - base} anteriores não têm entregue, abriu nem clicou).
        </p>
      )}

      <div className="adm-cards">
        {cards.map(c => (
          <div key={c.label} className="adm-card" style={c.alerta ? { borderColor: 'var(--red)' } : undefined}>
            <div className="k">{c.alerta && <AlertTriangle size={13} color="var(--red-text)" />} {c.label}</div>
            <div className="v" style={c.alerta ? { color: 'var(--red-text)' } : undefined}>{c.valor}</div>
            {c.sub && <div style={{ fontSize: 11.5, color: 'var(--text2)', marginTop: 2 }}>{c.sub}</div>}
          </div>
        ))}
      </div>
      {(alertaDev || alertaSpam) && (
        <p style={{ fontSize: 12.5, color: 'var(--red-text)', margin: '8px 0', lineHeight: 1.5 }}>
          {alertaDev && 'Devolvidos acima de 4%: confira os endereços na lista de problemas abaixo. '}
          {alertaSpam && 'Spam acima de 0,1%: algum e-mail está incomodando. Veja qual e pause ou mude o texto.'}
        </p>
      )}

      <h3 style={{ fontSize: 14, margin: '18px 0 6px' }}>Por e-mail</h3>
      {linhas.length === 0 ? <p style={{ fontSize: 12.5, color: 'var(--text2)' }}>Nenhum e-mail enviado nesse período.</p> : (
        <div className="adm-tbl-wrap">
          <table className="adm-tbl">
            <thead><tr><th>E-mail</th>{thBtn('enviados', 'Enviados')}{thBtn('entregues', 'Entregues')}{thBtn('abertos', 'Abriram')}{thBtn('clicados', 'Clicaram')}{thBtn('assinaram', 'Assinaram depois')}</tr></thead>
            <tbody>
              {linhas.map(x => (
                <tr key={x.chave}>
                  <td>{x.nome}{x.problemas > 0 && <span className="tag tag-red" style={{ marginLeft: 6 }}>{x.problemas} problema{x.problemas > 1 ? 's' : ''}</span>}</td>
                  <td>{x.enviados}</td>
                  <td>{pct(x.entregues, x.rastreados)}</td>
                  <td>{pct(x.abertos, x.rastreados)}</td>
                  <td>{pct(x.clicados, x.rastreados)}</td>
                  <td>{x.assinaram_depois ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h3 style={{ fontSize: 14, margin: '18px 0 6px' }}>Remarketing no período</h3>
      <div className="adm-tbl-wrap">
        <table className="adm-tbl">
          <thead><tr><th>Sequência</th><th>Entraram</th><th>Assinaram</th><th>Conversão</th><th>Pediram pra sair</th><th>Na sequência agora</th></tr></thead>
          <tbody>
            {r.remarketing.map(q => (
              <tr key={q.chave}>
                <td>{q.nome}{!q.ligada && <span className="tag tag-amber" style={{ marginLeft: 6 }}>desligada</span>}</td>
                <td>{q.entraram}</td><td>{q.assinaram}</td><td>{pct(q.assinaram, q.entraram)}</td><td>{q.sairam}</td><td>{q.ativos}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3 style={{ fontSize: 14, margin: '18px 0 6px' }}>Problemas recentes</h3>
      {r.problemas.length === 0
        ? <p style={{ fontSize: 12.5, color: 'var(--text2)' }}>Nenhum e-mail devolvido ou marcado como spam nesse período.</p>
        : (
          <div className="adm-tbl-wrap">
            <table className="adm-tbl">
              <thead><tr><th>Quando</th><th>Pessoa</th><th>E-mail</th><th>Qual e-mail</th><th>O que houve</th></tr></thead>
              <tbody>
                {r.problemas.map((p, i) => (
                  <tr key={i}>
                    <td>{dataHora(p.problema_em)}</td><td>{p.nome || '—'}</td><td>{p.email || '—'}</td><td>{p.email_nome}</td>
                    <td><span className={`tag ${p.problema === 'spam' ? 'tag-red' : 'tag-amber'}`}>{p.problema === 'spam' ? 'marcou como spam (saiu das novidades)' : 'devolvido (endereço não existe ou caixa cheia)'}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
    </div>
  )
}

// ───────────── Tela ─────────────
export default function EmailsAutomaticos() {
  const { toast } = useToast()
  const [painel, setPainel] = useState(null)
  const [aba, setAba] = useState('emails')
  const [editando, setEditando] = useState(null) // chave
  const [criando, setCriando] = useState(false)

  const carregar = useCallback(async () => {
    const { data, error } = await supabase.rpc('admin_email_painel')
    if (error) { toast(msgErro(error), 'erro'); return }
    setPainel(data)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { carregar() }, [carregar])

  async function ligarModelo(m, ligado) {
    const { error } = await supabase.rpc('admin_email_modelo_salvar', { p_chave: m.chave, p_dados: { ligado } })
    if (error) { toast(msgErro(error), 'erro'); return }
    toast(ligado ? `“${m.nome}” ligado.` : `“${m.nome}” desligado: não sai mais até você ligar.`, 'ok')
    carregar()
  }

  const grupos = useMemo(() => {
    if (!painel) return []
    return CATEGORIAS.map(c => ({ ...c, itens: painel.modelos.filter(m => m.categoria === c.v) })).filter(c => c.itens.length || c.v === 'personalizado')
  }, [painel])

  return (
    <section className="adm-sec">
      <h2><Mail size={16} color="var(--accent)" /> E-mails automáticos</h2>
      <p style={{ fontSize: 13, color: 'var(--text2)', margin: '-4px 0 12px', lineHeight: 1.5 }}>
        Todos os e-mails que o HopeFin manda sozinho. Mude o texto, ligue ou desligue, veja a prévia e mande um teste pra você — vale na hora, sem publicar nada.
        Os de “Comunicados” ficam na tela deles.
      </p>
      <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
        {[['emails', 'E-mails', Mail], ['remarketing', 'Remarketing', Repeat], ['resultados', 'Resultados', BarChart3]].map(([v, n, Icon]) => (
          <button key={v} onClick={() => { setAba(v); setEditando(null) }} aria-pressed={aba === v}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 999, fontSize: 13, fontWeight: 600,
              border: `1.5px solid ${aba === v ? 'var(--accent)' : 'var(--border2)'}`, background: aba === v ? 'var(--accent-dim)' : 'var(--bg2)', color: aba === v ? 'var(--accent-text)' : 'var(--text2)' }}>
            <Icon size={14} /> {n}
          </button>
        ))}
      </div>

      {aba === 'resultados' ? <Resultados />
        : !painel ? <p style={{ fontSize: 13, color: 'var(--text2)' }}>Carregando…</p>
        : aba === 'remarketing'
          ? <Remarketing painel={painel} recarregar={carregar} editando={editando} setEditando={setEditando} ligarModelo={ligarModelo} />
          : grupos.map(g => (
            <div key={g.v} style={{ marginBottom: 18 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                <h3 style={{ fontSize: 14 }}>{g.nome}</h3>
                {g.v === 'personalizado' && !criando && (
                  <button className="btn-ghost" onClick={() => { setCriando(true); setEditando(null) }} style={{ padding: '6px 12px', fontSize: 12.5, display: 'flex', gap: 5, alignItems: 'center' }}>
                    <Plus size={13} /> Nova automação
                  </button>
                )}
              </div>
              {g.v === 'personalizado' && criando && (
                <Editor novo modelo={{ gatilho: 'sem_entrar', dias: 14, variaveis: ['ola', 'nome', 'oferta'], botao_link: '/', botao_texto: 'Abrir o HopeFin' }}
                  onFechar={() => setCriando(false)} onSalvo={() => { setCriando(false); carregar() }} />
              )}
              {g.v === 'personalizado' && !g.itens.length && !criando && (
                <p style={{ fontSize: 12.5, color: 'var(--text2)', lineHeight: 1.5, display: 'flex', gap: 6 }}>
                  <Sparkles size={14} style={{ flexShrink: 0, marginTop: 1 }} />
                  Crie um e-mail que sai sozinho: por exemplo, 14 dias sem entrar no app, ou 2 dias depois de criar a conta. Sai pelo remetente das novidades, com o “não quero receber”.
                </p>
              )}
              {g.itens.map(m => (
                <div key={m.chave}>
                  <LinhaModelo m={m} aberto={editando === m.chave} onEditar={(k) => { setEditando(k); setCriando(false) }} onLigar={ligarModelo} />
                  {editando === m.chave && <Editor modelo={m} onFechar={() => setEditando(null)} onSalvo={() => { setEditando(null); carregar() }} />}
                </div>
              ))}
            </div>
          ))}
    </section>
  )
}
